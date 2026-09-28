# Mini CURL — HTTP GET 函式庫

以 C 實作的高效能 HTTP GET，並提供 Python 包裝。底層是 **socket + OpenSSL**，不是 libcurl：
專案名稱沿用 Mini CURL，實際上不依賴 libcurl，可直接控制 TCP 連線與 TLS 交握。

## 專案結構

```
.
├── build.sh              # 建置腳本
├── src/
│   ├── curl.c           # C 實作（socket + OpenSSL）
│   └── curl.py          # Python 包裝（ctypes 呼叫原生函式庫）
├── tests/
│   ├── test_curl.c      # C 測試
│   └── test_curl.py     # Python 測試（pytest）
├── docs/                # 補充文件（使用說明、範例、實作計畫）
├── build/               # 建置產物
└── include/             # 標頭檔（若有需要）
```

## 環境需求

- GCC 編譯器
- OpenSSL 開發套件（`libssl-dev`）
- `ar`（binutils，通常隨 GCC 一起安裝）
- Python 3.6 以上
- pytest（執行 Python 測試時需要）

> 注意：不需要安裝 libcurl。本專案自行實作 HTTP 協定的解析與送出。

## 安裝與建置

```bash
# 安裝相依套件（Ubuntu／Debian）
sudo apt-get install build-essential libssl-dev python3-pip
pip install pytest

# 建置
./build.sh
```

`build.sh` 會產生三個產物：

| 產物 | 用途 |
| --- | --- |
| `build/curl.o` | 目標檔 |
| `build/libcurl_wrapper.a` | 靜態函式庫 |
| `build/libcurl_wrapper.so` | 動態函式庫，Python 端透過 ctypes 載入 |
| `build/curl` | 獨立執行檔（`-DBUILD_STANDALONE`），可直接下載網頁 |

編譯選項可用環境變數覆寫：

```bash
CC=clang CFLAGS="-O3 -march=native" ./build.sh
```

## 使用方式

### C API

```c
#include "curl.c"   // 直接引入原始檔，或改為連結 libcurl_wrapper.a

long status_code;
char *response = http_get("https://example.com", &status_code);
if (response) {
    printf("Status: %ld\n", status_code);
    printf("Response: %s\n", response);
    free(response);   // 回傳值由 malloc 配置，呼叫端必須釋放
}
```

也可以直接跑命令列版本：

```bash
./build/curl https://example.com
```

### Python API

```python
from src.curl import fetch, fetch_text, fetch_json, MiniCurl

# 基本用法
result = fetch("https://example.com")
print(result['status_code'], result['body'])

# 直接取字串
text = fetch_text("https://example.com")

# 直接取解析後的 JSON
data = fetch_json("https://api.example.com/data")

# 用 context manager 管理 session
with MiniCurl() as client:
    result = client.get("https://example.com")
```

`MiniCurl` 會優先載入 `build/libcurl_wrapper.so`；**若原生函式庫不存在，會印出警告並自動改用
純 Python 後端**（`urllib`）。所以沒有先建置也能跑，只是失去 C 實作的速度優勢。

## 測試

```bash
# C 測試
cd tests
gcc -o test_curl test_curl.c -lssl -lcrypto
./test_curl

# Python 測試
pytest tests/test_curl.py -v
```

> C 測試與 Python 測試都會實際連線到 `httpbin.org`，執行前請確認網路可連。

## API 參考

### C 函式

- `char *http_get(const char *url, long *status_code)` — 送出 HTTP GET。
  成功回傳回應本文（呼叫端須 `free`），並把 HTTP 狀態碼寫入 `status_code`；
  失敗回傳 `NULL`。
- OpenSSL 的初始化與清理由 `__attribute__((constructor))` 與
  `__attribute__((destructor))` 自動處理，**不需要呼叫任何 init／cleanup 函式**。

### Python 函式與類別

- `fetch(url)` — 回傳 dict，內容含 `status_code`、`body`、`url`、`success`，失敗時另有 `error`
- `fetch_text(url)` — 回傳回應本文字串，失敗回傳 `None`
- `fetch_json(url)` — 回傳解析後的 JSON，失敗回傳 `None`
- `MiniCurl` — 管理 curl session 的類別，支援 `with` 語法與自訂 `lib_path`

## 設計要點

- **連線**：自行以 `getaddrinfo` + `socket` 建立 TCP 連線，`http://` 走純 socket、`https://` 再套 TLS
- **緩衝**：以 `BUFFER_SIZE`（8192）為單位動態擴充的回應緩衝，避免固定長度限制
- **送出**：`send_all` 處理部分寫入（partial write），確保整個請求送完
- **記憶體**：回應本文由 `malloc` 配置，明確交給呼叫端釋放
