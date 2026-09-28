# HTTPS 支援實作計畫（C 語言版本）

## 1. 目標

讓 `src/curl.c` 能透過 `https://` 網址抓取 HTTPS 資源，同時保留原本的 HTTP 功能。

## 2. 背景與現況

| 項目 | 現況 |
|------|------|
| 通訊方式 | 原生 POSIX socket（`getaddrinfo` / `socket` / `connect` / `send` / `recv`） |
| HTTPS 支援 | **不支援**，遇到 `https://` 直接回傳錯誤 |
| 外部相依 | 無（僅 libc + POSIX） |
| 建置方式 | `build.sh`（產生 `.a` / `.so` / 執行檔） |

## 3. 技術選型：OpenSSL

選擇 **OpenSSL**（`libssl` + `libcrypto`）做為 TLS 實作，理由：

- 標準、廣泛使用的 TLS 函式庫
- Ubuntu / Debian 透過 `apt install libssl-dev` 安裝
- 支援 SNI、憑證驗證等現代 TLS 功能

## 4. 實作步驟

### 4.1 `src/curl.c`

1. **新增 include**
   ```c
   #include <openssl/ssl.h>
   #include <openssl/err.h>
   ```

2. **OpenSSL 初始化／清理**（`constructor` / `destructor`）
   - `SSL_library_init()`：初始化 OpenSSL
   - `SSL_CTX_new(TLS_client_method())`：建立 TLS client context
   - `SSL_CTX_set_default_verify_paths()`：載入系統 CA 憑證
   - `SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, NULL)`：**開啟憑證驗證**

3. **修改 `http_get()`**
   - URL 解析：`https://` → port 443 + `use_ssl = 1`；`http://` → port 80 + `use_ssl = 0`
   - TCP 連線後（`tcp_connect()`）依 `use_ssl` 決定是否包 TLS：
     - `SSL_new(ctx)` → `SSL_set_fd(ssl, sockfd)` → `SSL_set_tlsext_host_name()`（SNI）→ `SSL_connect()`
     - `SSL_get_verify_result()` 檢查憑證，非 `X509_V_OK` 就拒絕連線
   - 傳送改用 `ssl_send_all()`（包 `SSL_write()`）
   - 接收改用 `SSL_read()`
   - 結束時 `SSL_shutdown()`、`SSL_free()` 後才 `close(sockfd)`

### 4.2 `build.sh`

三個 build target 都加上 OpenSSL 連結參數：

```bash
LDFLAGS="${LDFLAGS:--lssl -lcrypto}"

# shared library
$CC $CFLAGS -shared -fPIC ... -o libcurl_wrapper.so $LDFLAGS

# standalone executable
$CC $CFLAGS ... -o curl -DBUILD_STANDALONE $LDFLAGS
```

> 註：靜態庫 `.a` 只做打包，不需 `-lssl -lcrypto`；連結時才需要。

### 4.3 `tests/test_curl.c`

新增 HTTPS 測試案例：

```c
response = http_get("https://httpbin.org/get", &status_code);
check("HTTPS GET /get returns 200", response && status_code == 200);
free(response);
```

## 5. 憑證驗證

- 開啟 `SSL_VERIFY_PEER`，載入系統 CA 憑證（`SSL_CTX_set_default_verify_paths()`）
- 驗證失敗（過期、無效簽發者、網域名稱不符）會印出 `X509_verify_cert_error_string()` 訊息並拒絕連線
- 所需之 `ca-certificates` 套件在現代 Linux 發行版皆預設安裝

## 6. 前置需求

| 系統 | 安裝指令 |
|------|----------|
| Debian / Ubuntu | `sudo apt install libssl-dev` |
| Fedora / RHEL | `sudo dnf install openssl-devel` |
| macOS | 已內建於 Xcode / Command Line Tools |

## 7. 驗證清單

- [ ] `bash build.sh` 成功編譯三個產物
- [ ] `./build/curl http://httpbin.org/get` 回傳 200
- [ ] `./build/curl https://httpbin.org/get` 回傳 200
- [ ] `./build/curl https://self-signed.badssl.com/` 被憑證驗證拒絕
- [ ] C 測試程式全部 PASS

## 8. 不改動的範圍

- `curl.py`（Python wrapper，其 urllib fallback 已支援 HTTPS）
- URL 解析核心邏輯（host / path / port 提取）
- `ResponseBuffer` 動態緩衝區
- `tcp_connect()`（TLS 建立在 TCP 之上，不需更動）