#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <arpa/inet.h>

#include <openssl/ssl.h>
#include <openssl/err.h>

#define BUFFER_SIZE 8192

static SSL_CTX *g_ssl_ctx = NULL;

__attribute__((constructor))
static void init_openssl(void) {
    SSL_library_init();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();
    g_ssl_ctx = SSL_CTX_new(TLS_client_method());
    if (g_ssl_ctx) {
        SSL_CTX_set_default_verify_paths(g_ssl_ctx);
        SSL_CTX_set_verify(g_ssl_ctx, SSL_VERIFY_PEER, NULL);
    }
}

__attribute__((destructor))
static void cleanup_openssl(void) {
    if (g_ssl_ctx) {
        SSL_CTX_free(g_ssl_ctx);
        g_ssl_ctx = NULL;
    }
    EVP_cleanup();
}

typedef struct {
    char *data;
    size_t size;
    size_t capacity;
} ResponseBuffer;

static void buffer_init(ResponseBuffer *buf) {
    buf->data = malloc(BUFFER_SIZE);
    buf->size = 0;
    buf->capacity = BUFFER_SIZE;
    buf->data[0] = '\0';
}

static int buffer_append(ResponseBuffer *buf, const char *data, size_t len) {
    if (buf->size + len + 1 > buf->capacity) {
        size_t new_cap = buf->capacity * 2;
        while (new_cap < buf->size + len + 1) new_cap *= 2;
        char *tmp = realloc(buf->data, new_cap);
        if (!tmp) return -1;
        buf->data = tmp;
        buf->capacity = new_cap;
    }
    memcpy(buf->data + buf->size, data, len);
    buf->size += len;
    buf->data[buf->size] = '\0';
    return 0;
}

static int tcp_connect(const char *host, int port) {
    struct addrinfo hints = {0}, *res, *rp;
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;

    char port_str[16];
    snprintf(port_str, sizeof(port_str), "%d", port);

    if (getaddrinfo(host, port_str, &hints, &res) != 0) return -1;

    int sockfd = -1;
    for (rp = res; rp; rp = rp->ai_next) {
        sockfd = socket(rp->ai_family, rp->ai_socktype, rp->ai_protocol);
        if (sockfd < 0) continue;
        if (connect(sockfd, rp->ai_addr, rp->ai_addrlen) == 0) break;
        close(sockfd);
        sockfd = -1;
    }
    freeaddrinfo(res);
    return sockfd;
}

static int send_all(int sockfd, const char *data, size_t len) {
    size_t sent = 0;
    while (sent < len) {
        ssize_t n = send(sockfd, data + sent, len - sent, 0);
        if (n <= 0) return -1;
        sent += n;
    }
    return 0;
}

static int ssl_send_all(SSL *ssl, const char *data, size_t len) {
    size_t sent = 0;
    while (sent < len) {
        int n = SSL_write(ssl, data + sent, len - sent);
        if (n <= 0) return -1;
        sent += n;
    }
    return 0;
}

char *http_get(const char *url, long *status_code) {
    if (status_code) *status_code = 0;

    const char *p = url;
    int port = 80;
    int use_ssl = 0;

    if (strncmp(p, "http://", 7) == 0) {
        p += 7;
    } else if (strncmp(p, "https://", 8) == 0) {
        p += 8;
        port = 443;
        use_ssl = 1;
    }

    char host[256] = {0};
    char path[1024] = {0};
    const char *slash = strchr(p, '/');
    const char *colon = strchr(p, ':');

    if (colon && (!slash || colon < slash)) {
        size_t hlen = colon - p;
        if (hlen >= sizeof(host)) return NULL;
        memcpy(host, p, hlen);
        host[hlen] = '\0';
        port = atoi(colon + 1);
    } else {
        size_t hlen = slash ? (size_t)(slash - p) : strlen(p);
        if (hlen >= sizeof(host)) return NULL;
        memcpy(host, p, hlen);
        host[hlen] = '\0';
    }
    strcpy(path, slash ? slash : "/");

    int sockfd = tcp_connect(host, port);
    if (sockfd < 0) {
        fprintf(stderr, "Connection to %s:%d failed\n", host, port);
        return NULL;
    }

    SSL *ssl = NULL;
    if (use_ssl) {
        if (!g_ssl_ctx) {
            fprintf(stderr, "SSL context not initialized\n");
            close(sockfd);
            return NULL;
        }
        ssl = SSL_new(g_ssl_ctx);
        if (!ssl) {
            close(sockfd);
            return NULL;
        }
        SSL_set_fd(ssl, sockfd);
        SSL_set_tlsext_host_name(ssl, host);

        if (SSL_connect(ssl) != 1) {
            fprintf(stderr, "SSL connect failed to %s\n", host);
            ERR_print_errors_fp(stderr);
            SSL_free(ssl);
            close(sockfd);
            return NULL;
        }

        long vr = SSL_get_verify_result(ssl);
        if (vr != X509_V_OK) {
            fprintf(stderr, "SSL certificate verification failed: %s\n",
                    X509_verify_cert_error_string(vr));
            SSL_shutdown(ssl);
            SSL_free(ssl);
            close(sockfd);
            return NULL;
        }
    }

    char request[2048];
    snprintf(request, sizeof(request),
        "GET %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "User-Agent: mini-curl/1.0\r\n"
        "Accept: */*\r\n"
        "Connection: close\r\n"
        "\r\n",
        path, host);

    if (use_ssl) {
        if (ssl_send_all(ssl, request, strlen(request)) != 0) {
            SSL_shutdown(ssl);
            SSL_free(ssl);
            close(sockfd);
            return NULL;
        }
    } else {
        if (send_all(sockfd, request, strlen(request)) != 0) {
            close(sockfd);
            return NULL;
        }
    }

    ResponseBuffer buf;
    buffer_init(&buf);
    char tmp[4096];

    while (1) {
        ssize_t n;
        if (use_ssl) {
            n = SSL_read(ssl, tmp, sizeof(tmp) - 1);
        } else {
            n = recv(sockfd, tmp, sizeof(tmp) - 1, 0);
        }
        if (n <= 0) break;
        tmp[n] = '\0';
        buffer_append(&buf, tmp, n);
    }

    if (use_ssl) {
        SSL_shutdown(ssl);
        SSL_free(ssl);
    }
    close(sockfd);

    const char *sep = strstr(buf.data, "\r\n\r\n");
    if (!sep) { free(buf.data); return NULL; }

    size_t header_len = (sep - buf.data) + 4;
    const char *sp = strstr(buf.data, "HTTP/");
    if (sp) {
        const char *code_start = strchr(sp, ' ');
        if (code_start && status_code) {
            *status_code = atol(code_start + 1);
        }
    }

    size_t body_len = buf.size - header_len;
    memmove(buf.data, buf.data + header_len, body_len);
    buf.size = body_len;
    buf.data[body_len] = '\0';

    return buf.data;
}

#ifdef BUILD_STANDALONE
int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <URL>\n", argv[0]);
        return 1;
    }
    long status_code = 0;
    char *response = http_get(argv[1], &status_code);
    if (response) {
        printf("Status: %ld\n", status_code);
        printf("Response:\n%s\n", response);
        free(response);
        return 0;
    }
    fprintf(stderr, "Request failed\n");
    return 1;
}
#endif
