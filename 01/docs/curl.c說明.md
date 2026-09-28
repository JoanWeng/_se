# C 語言版 HTTP(S) GET 實作詳解

本文件解說 `src/curl.c` 的完整實作：程式碼結構、運作原理與使用方式。
- **HTTP** 部分直接使用 POSIX socket 自己打 HTTP 協定。
- **HTTPS** 部分使用 **OpenSSL** 提供 TLS 加密、SNI 與憑證驗證。

---

## 1. 總覽

`curl.c` 用約 240 行 C 語言實作一個「效能取向」的 HTTP(S) GET 客戶端，包含：

| 模組 | 功能 |
|------|------|
| `ResponseBuffer` | 動態成長的記憶體緩衝區，存放回應 |
| `g_ssl_ctx` + init/destructor | OpenSSL 全域初始化（constructor/destructor 自動執行） |
| `tcp_connect()` | 解析網址、查 DNS、建立 TCP 連線 |
| `send_all()` / `ssl_send_all()` | 完整送出資料（處理 partial write） |
| `http_get()` | 主要 API：組 HTTP 請求 → TLS 交握（https）→ 收完整回應 → 拆 header/body |
| `main()` | 獨立執行檔入口（只有在 `-DBUILD_STANDALONE` 才有） |

設計上刻意保持單一檔案、最小相依（僅 libc + OpenSSL），方便編譯與移植。

---

## 2. 程式碼逐段解說

### 2.1 標頭檔與常數

```c
#include <stdio.h>      // printf / snprintf / fprintf
#include <stdlib.h>     // malloc / realloc / free / atol
#include <string.h>     // memcpy / memmove / strstr / strchr
#include <unistd.h>     // close()
#include <netdb.h>      // getaddrinfo()
#include <sys/socket.h> // socket / connect / send / recv
#include <sys/types.h>
#include <arpa/inet.h>

#include <openssl/ssl.h>   // SSL_CTX / SSL / SSL_connect ...
#include <openssl/err.h>   // ERR_print_errors_fp()

#define BUFFER_SIZE 8192
```

- `getaddrinfo()` 會作 DNS 解析，並自動處理 IPv4/IPv6（`AF_UNSPEC`）。
- `BUFFER_SIZE` 是緩衝區初始容量。
- OpenSSL 標頭是 HTTPS 的核心依賴，負責所有 TLS 相關型別與函式。

### 2.2 OpenSSL 初始化與清理

```c
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
```

重點：
- `__attribute__((constructor))` 讓函式在 program load 時**自動執行**，不需要使用者手動呼叫初始化。
- `SSL_CTX_new(TLS_client_method())` 建立一個 TLS **client** context，之後每次 HTTPS 連線都從它生出一支 `SSL*`。
- `SSL_CTX_set_default_verify_paths()` 載入系統的 CA 根憑證（`/etc/ssl/certs`）。
- `SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, NULL)` **開啟伺服器憑證驗證**，保護使用者不被中間人攻擊。
- `__attribute__((destructor))` 在程式結束時自動釋放 `SSL_CTX`，避免記憶體洩漏。

### 2.3 ResponseBuffer：動態緩衝區

```c
typedef struct {
    char *data;      // 實際資料指標
    size_t size;     // 目前已收到的位元組數
    size_t capacity; // 已配置的容量
} ResponseBuffer;
```

為何需要動態成長？

- HTTP 回應大小未知，小則幾個位元組、大則數 GB。
- 每次收資料前先確保有空間、空間不夠就雙倍擴充，避免過度 realloc。

```c
static void buffer_init(ResponseBuffer *buf) {
    buf->data = malloc(BUFFER_SIZE);
    buf->size = 0;
    buf->capacity = BUFFER_SIZE;
    buf->data[0] = '\0';
}

static int buffer_append(ResponseBuffer *buf, const char *data, size_t len) {
    if (buf->size + len + 1 > buf->capacity) {
        // 容量不足 → 以 2 倍成長直到夠用
        size_t new_cap = buf->capacity * 2;
        while (new_cap < buf->size + len + 1) new_cap *= 2;
        char *tmp = realloc(buf->data, new_cap);
        if (!tmp) return -1;   // realloc 失敗
        buf->data = tmp;
        buf->capacity = new_cap;
    }
    memcpy(buf->data + buf->size, data, len);
    buf->size += len;
    buf->data[buf->size] = '\0';   // 隨時保持 NUL-terminated
    return 0;
}
```

重點：
- 多保留 `+1` 位元組給 `'\0'`，之後才能直接當字串用。
- `realloc` 失敗回傳 `-1`，讓上層能中止而非 crash。

### 2.4 tcp_connect：DNS + TCP 連線

```c
static int tcp_connect(const char *host, int port) {
    struct addrinfo hints = {0}, *res, *rp;
    hints.ai_family = AF_UNSPEC;   // IPv4 或 IPv6 皆可
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;

    char port_str[16];
    snprintf(port_str, sizeof(port_str), "%d", port);

    if (getaddrinfo(host, port_str, &hints, &res) != 0) return -1;

    int sockfd = -1;
    // getaddrinfo 可能回傳多個位址（多個 IP / 多個協定）
    // 依序嘗試，第一個能 connect 成功的就採用
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
```

運作流程：
1. `getaddrinfo()` 把「域名 + 通訊埠」轉成一份位址清單（可能有多筆）。
2. 逐筆嘗試 `socket()` + `connect()`，成功就回傳該 socket fd。
3. 全部失敗則回傳 `-1`。

**位置的關係**：TLS 是「包在 TCP 之上」的協定，所以 `tcp_connect()` 對 HTTP / HTTPS 是完全共用的 —— HTTPS 只是連上後多了一層 `SSL_connect()`。

### 2.5 send_all / ssl_send_all：可靠送出

```c
static int send_all(int sockfd, const char *data, size_t len) {
    size_t sent = 0;
    while (sent < len) {
        ssize_t n = send(sockfd, data + sent, len - sent, 0);
        if (n <= 0) return -1;   // 錯誤或對方關閉
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
```

為什麼需要迴圈？
- `send()` / `SSL_write()` **不保證一次送完**，可能只送出部分位元組（partial write）。
- 所以記錄已送出量 `sent`，從剩餘位置繼續送，直到全部完成。

兩者差別只在：
| | 一般 HTTP | HTTPS |
|------|-----------|-------|
| 底層呼叫 | `send(fd, ...)` | `SSL_write(ssl, ...)` |
| 資料是否加密 | 明文 | TLS 加密 |
| 例外 | 無 | 需先完成 TLS 交握 |

### 2.6 http_get：核心 API

#### Step 1 — 解析協定（支援 http:// 與 https://）

```c
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
```

- `use_ssl` 是貫穿整個函式的開關：
  - `use_ssl == 0` → 走原來的 HTTP 路徑。
  - `use_ssl == 1` → 收到 `https://`，預設 port 改為 443，之後所有收送都走 OpenSSL。
- 若網址有明確 port 會覆蓋預設值（見下一步）。

#### Step 2 — 拆出 host / port / path

```c
char host[256] = {0};
char path[1024] = {0};
const char *slash = strchr(p, '/');
const char *colon  = strchr(p, ':');

if (colon && (!slash || colon < slash)) {
    // 有明確 port，例如 example.com:8080/path
    size_t hlen = colon - p;
    ...
    port = atoi(colon + 1);
} else {
    // 無 port，host 到第一個 '/' 為止
    ...
}
strcpy(path, slash ? slash : "/");
```

處理兩種網址型態（`<scheme>` 可以是 http / https）：

| 網址 | host | port | path |
|------|------|------|------|
| `<scheme>://example.com/path` | `example.com` | 80 或 443 | `/path` |
| `<scheme>://example.com:8080/x` | `example.com` | 8080 | `/x` |
| `<scheme>://example.com` | `example.com` | 80 或 443 | `/` |

#### Step 3 — 建立 TCP 連線

```c
int sockfd = tcp_connect(host, port);
if (sockfd < 0) {
    fprintf(stderr, "Connection to %s:%d failed\n", host, port);
    return NULL;
}
```

#### Step 4 — HTTPS：TLS 交握（handshake）

只有 `use_ssl == 1` 才執行這段：

```c
SSL *ssl = NULL;
if (use_ssl) {
    ssl = SSL_new(g_ssl_ctx);           // 從 context 生出一支 SSL
    SSL_set_fd(ssl, sockfd);            // 綁定已經連好的 TCP socket
    SSL_set_tlsext_host_name(ssl, host); // SNI：主動告知伺服器要訪問哪個域名

    if (SSL_connect(ssl) != 1) {        // TLS 交握
        ERR_print_errors_fp(stderr);
        SSL_free(ssl); close(sockfd);
        return NULL;
    }

    long vr = SSL_get_verify_result(ssl);
    if (vr != X509_V_OK) {              // 憑證驗證
        fprintf(stderr, "SSL certificate verification failed: %s\n",
                X509_verify_cert_error_string(vr));
        SSL_shutdown(ssl); SSL_free(ssl); close(sockfd);
        return NULL;
    }
}
```

逐行說明：
- `SSL_new(g_ssl_ctx)` 由全域 context 生成一支獨立連線物件。
- `SSL_set_tlsext_host_name()` 送出 **SNI（Server Name Indication）**。現代伺服器常用一 IP 掛多域名，沒有 SNI 會拿錯憑證。
- `SSL_connect()` 完成 TLS 交握：金鑰交換、協商加密演算法。
- `SSL_get_verify_result()` 檢查伺服器憑證是否有效。任何失敗都會**拒絕連線**，例如：
  - 自簽憑證（不是信任的 CA 簽發）
  - 憑證過期
  - 網域名稱與憑證不符
- 錯誤訊息透過 `ERR_print_errors_fp(stderr)` 列印 OpenSSL 的詳細錯誤。

#### Step 5 — 組 HTTP 請求

```c
char request[2048];
snprintf(request, sizeof(request),
    "GET %s HTTP/1.1\r\n"
    "Host: %s\r\n"
    "User-Agent: mini-curl/1.0\r\n"
    "Accept: */*\r\n"
    "Connection: close\r\n"
    "\r\n",
    path, host);
```

HTTP/1.1 的請求格式：

```
<方法> <路徑> HTTP/1.1\r\n
<Header名>: <值>\r\n
...
\r\n          ← 最後一個空行代表請求結束
```

- `Host` header 在 HTTP/1.1 是**必須**的。
- `Connection: close` 要求伺服器在回應後關閉連線，我們就不用處理 keep-alive 與 chunked 編碼，大量簡化解析邏輯。
- 請求內容在 HTTPS 時會被 OpenSSL 加密後才送到網路，`ssl_send_all()` 吃的是**同一份明文請求字串**。

#### Step 6 — 送出請求

```c
if (use_ssl) {
    if (ssl_send_all(ssl, request, strlen(request)) != 0) {
        SSL_shutdown(ssl); SSL_free(ssl); close(sockfd);
        return NULL;
    }
} else {
    if (send_all(sockfd, request, strlen(request)) != 0) {
        close(sockfd);
        return NULL;
    }
}
```

#### Step 7 — 收完整回應

```c
while (1) {
    ssize_t n;
    if (use_ssl) {
        n = SSL_read(ssl, tmp, sizeof(tmp) - 1);
    } else {
        n = recv(sockfd, tmp, sizeof(tmp) - 1, 0);
    }
    if (n <= 0) break;   // 0 = 對方關閉；負值 = 錯誤
    tmp[n] = '\0';
    buffer_append(&buf, tmp, n);
}

if (use_ssl) { SSL_shutdown(ssl); SSL_free(ssl); }
close(sockfd);
```

- 迴圈一直收，直到收到 `0`（代表伺服器因 `Connection: close` 斷線）才結束。
- HTTPS 接收用 `SSL_read()`（自動解密），HTTP 用 `recv()`（明文）。
- 收完後 `SSL_shutdown()` 做優雅關閉、`SSL_free()` 釋放 TLS 連線物件，最後才 `close()` TCP socket。

`SSL_read()` / `SSL_write()` 與 `recv()` / `send()` 的對照：

| HTTP | HTTPS | 作用 |
|------|-------|------|
| `send(fd, ...)` | `SSL_write(ssl, ...)` | 送資料（加密） |
| `recv(fd, ...)` | `SSL_read(ssl, ...)` | 收資料（解密） |
| `close(fd)` | `SSL_shutdown()` → `SSL_free()` → `close(fd)` | 關閉連線 |

#### Step 8 — 拆出狀態碼

```c
const char *sp = strstr(buf.data, "HTTP/");
if (sp) {
    const char *code_start = strchr(sp, ' ');
    if (code_start && status_code) {
        *status_code = atol(code_start + 1);
    }
}
```

從第一行 `HTTP/1.1 404 NOT FOUND` 抽出數字部分：
- `strstr("HTTP/")` 找到起點
- `strchr(' ')` 跳到空格後
- `atol()` 讀出 `404`

#### Step 9 — 切開 header 與 body

```c
const char *sep = strstr(buf.data, "\r\n\r\n");
if (!sep) { free(buf.data); return NULL; }

size_t header_len = (sep - buf.data) + 4;
size_t body_len = buf.size - header_len;
memmove(buf.data, buf.data + header_len, body_len);
buf.size = body_len;
buf.data[body_len] = '\0';

return buf.data;
```

HTTP 回應格式（無論加密與否，解密後格式相同）：

```
HTTP/1.1 200 OK\r\n
Content-Type: text/html\r\n
...
\r\n          ← 空行分隔
<body...>
```

- `\r\n\r\n` 之後就是 body。
- 用 `memmove`（不是 `memcpy`）把 body 往前搬，避免重疊問題。
- 回傳的指標指向**只有 body 的 NUL-terminated 字串**，與 stdout 的 `printf("%s"...)` 相容。

### 2.7 main：獨立執行檔

```c
#ifdef BUILD_STANDALONE
int main(int argc, char *argv[]) {
    ...
}
#endif
```

用 `#ifdef` 包住，所以：
- 編譯成**函式庫**（`.a` / `.so`）時不含 `main`。
- 加 `-DBUILD_STANDALONE` 編譯時才產生可執行檔。

`main` 只是呼叫 `http_get()` 並印出結果，作為示範與手動測試用。

---

## 3. 整體運作流程圖

```
呼叫 http_get(url, &status_code)
        │
        ▼
解析 http:// 或 https:// + host[:port] + path
  （https → use_ssl=1, port=443；http → use_ssl=0, port=80）
        │
        ▼
tcp_connect(): DNS → socket → connect
  （失敗 → 回傳 NULL）
        │
        ▼
是否 https？
  ├─ 是 → SSL 交握（SNI）→ 憑證驗證（X509_V_OK?）
  │        │  失敗 → 印錯誤、關閉、回傳 NULL
  │        ▼
  └─ 否 →（略過 TLS，直接走明文）
        │
        ▼
組 HTTP GET 請求（HTTP / HTTPS 用同一份明文請求）
        │
        ▼
送出：https → ssl_send_all (SSL_write)
      http  → send_all (send)
  （失敗 → 關閉並回傳 NULL）
        │
        ▼
收滿全部資料直到伺服器關閉：
      https → SSL_read
      http  → recv          → buffer_append 累積
        │
        ▼
strstr("HTTP/") 抽狀態碼 → atol
        │
        ▼
strstr("\r\n\r\n") 找到 header/body 邊界
        │
        ▼
memmove 把 body 移到緩衝區開頭、補 \0
        │
        ▼
回傳 body（字串）；失敗回傳 NULL
```

---

## 4. 怎麼使用

### 4.1 編譯（build.sh 做的事）

```bash
# 靜態函式庫
gcc -O2 -Wall -Wextra -c src/curl.c -o build/curl.o
ar rcs build/libcurl_wrapper.a build/curl.o

# 共用函式庫（要連結 OpenSSL）
gcc -O2 -Wall -Wextra -shared -fPIC src/curl.c -o build/libcurl_wrapper.so -lssl -lcrypto

# 獨立執行檔（要連結 OpenSSL）
gcc -O2 -Wall -Wextra src/curl.c -o build/curl -DBUILD_STANDALONE -lssl -lcrypto
```

或直接：

```bash
./build.sh
```

`build.sh` 內已用 `LDFLAGS="${LDFLAGS:--lssl -lcrypto}"` 統一帶上 OpenSSL 連結參數。

### 4.2 獨立執行檔

HTTP：

```bash
./build/curl http://httpbin.org/get
```

HTTPS（現在支援了！）：

```bash
./build/curl https://httpbin.org/get
```

輸出：

```
Status: 200
Response:
{...body...}
```

HTTPS 憑證驗證失敗範例（自簽憑證的 `self-signed.badssl.com`）會被拒絕：

```
SSL connect failed to self-signed.badssl.com
...error:...certificate verify failed...
Request failed
```

### 4.3 在 C 程式中當函式庫用

```c
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

/* 宣告外部函式 */
char *http_get(const char *url, long *status_code);

int main(void) {
    long status_code = 0;
    char *body = http_get("https://httpbin.org/get", &status_code);

    if (body) {
        printf("HTTP Status: %ld\n", status_code);
        printf("Body (%zu bytes):\n%.200s\n", strlen(body), body);
        free(body);  // ← 一定要記得 free！
    } else {
        fprintf(stderr, "Request failed.\n");
    }
    return 0;
}
```

編譯：

```bash
gcc myapp.c build/libcurl_wrapper.a -lssl -lcrypto -o myapp
# 或
gcc myapp.c build/libcurl_wrapper.so -o myapp
# 執行時若用 .so 需設定 LD_LIBRARY_PATH 或放到標準路徑
```

### 4.4 透過 Python 包裝使用

`src/curl.py` 用 ctypes 載入 `libcurl_wrapper.so`（WSL/Linux），Windows 會自動改用純 Python backend。詳細說明見 [`curl.py說明.md`](curl.py說明.md)：

```python
from curl import fetch, fetch_text, fetch_json

r = fetch("https://httpbin.org/get")
print(r["status_code"], r["body"])
```

---

## 5. API 參考

| 函式 | 回傳 | 說明 |
|------|------|------|
| `char *http_get(const char *url, long *status_code)` | body 字串 / NULL | 執行 HTTP/HTTPS GET；成功時 `*status_code` 為 HTTP 狀態碼，失敗為 0 |

注意事項：
- 回傳的 body 由 `malloc` 配置，**呼叫端必須 `free()`**。
- 支援 `http://` 與 `https://` 兩種協定。
- 失敗（DNS 解析失敗、連不到、TLS 交握失敗、憑證驗證不過）回傳 `NULL`。
- HTTPS 連線會自動做憑證驗證，驗證失敗會拒絕連線。
- 全域 OpenSSL 初始化由 `constructor` 自動完成，呼叫端不需手動 init。

---

## 6. 已知限制與後續延伸

| 限制 | 原因 | 改善方向 |
|------|------|----------|
| 不處理 chunked encoding | 靠 `Connection: close` 判斷收尾 | 解析 `Transfer-Encoding: chunked` |
| 不處理 redirect | 301/302 原樣回傳 | 讀 `Location` header 自動重送 |
| 無 timeout | `connect`/`recv` 可能卡住 | 用 `alarm()` 或 `setsockopt(SO_RCVTIMEO)` |
| 一次最多收 2GB+ | buffer 用 `size_t`，ok | 可改串流寫入檔案 |
| 不支援 POST/headers 自訂 | 固定 GET | 參數化方法與 headers |
| OpenSSL 憑證驗證需系統 CA | 依賴 `/etc/ssl/certs` | 可用 `SSL_CTX_load_verify_locations()` 自訂憑證檔 |