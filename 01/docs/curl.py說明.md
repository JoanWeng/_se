# Python 包裝（curl.py）實作詳解

本文件解說 `src/curl.py` 的完整實作：雙後端架構、類別與函式、以及與 C 核心的互動方式。

---

## 1. 總覽

`curl.py` 是 C 核心的 **Python 包裝層**，提供乾淨、好用的 API：

| 層級 | 內容 |
|------|------|
| `fetch()` / `fetch_text()` / `fetch_json()` | 三支公開函式，一行就能抓取 |
| `MiniCurl` | 可搭配 context manager 使用的客戶端類別 |
| `_NativeBackend` | 用 ctypes 直接呼叫 C 的 `http_get()`（最快） |
| `_PythonBackend` | 用標準庫 `urllib` 實作（純 Python，免編譯） |

**設計核心**：優先使用 C 高速後端；若載入失敗（例如 Windows 沒有 `.so`），自動退回 Python 後端，**功能不中斷**。

---

## 2. 雙後端架構

### 2.1 為何要兩個後端？

| 面向 | `_NativeBackend` | `_PythonBackend` |
|------|-----------------|------------------|
| 底層 | C 的 `http_get()`（POSIX socket + OpenSSL） | Python `urllib.request` |
| 官渡 | 最快 | 稍慢但零依賴 |
| 平台 | 只在有編譯 `.so` 的地方能用（Linux/WSL/macOS） | 所有平台（含 Windows） |
| 載入方式 | `ctypes.CDLL("libcurl_wrapper.so")` | Python 直接 import |
| HTTPS | 透過 C 層的 OpenSSL 支援 | Python 標準庫 `ssl` 原生支援 |

### 2.2 _NativeBackend：ctypes 呼叫 C

```python
class _NativeBackend:
    def __init__(self, lib_path: str = None):
        if lib_path is None:
            lib_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "../build/libcurl_wrapper.so"
            )
        self._lib = ctypes.CDLL(lib_path)
        self._lib.http_get.restype = ctypes.c_char_p
        self._lib.http_get.argtypes = [
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_long)
        ]
```

重點：
- 預設從 `src/../build/libcurl_wrapper.so` 載入共用函式庫。
- **`restype` / `argtypes` 型別宣告是 ctypes 最關鍵的一步**，告訴 Python 怎麼解讀 C 函式的參數與回傳值：
  - `http_get(const char *url, long *status_code)`
  - `url` → `ctypes.c_char_p`（bytes）
  - `status_code` → `ctypes.POINTER(ctypes.c_long)`
  - 回傳 body → `ctypes.c_char_p`

```python
    def get(self, url: str) -> Dict[str, Any]:
        status_code = ctypes.c_long(0)
        response = self._lib.http_get(
            url.encode('utf-8'),      # str → bytes（C 需要）
            ctypes.byref(status_code) # 傳指標，讓 C 回填狀態碼
        )
        if response is not None:
            return {
                'status_code': status_code.value,
                'body': response.decode('utf-8', errors='replace'),
                'url': url,
                'success': True,
            }
        return {
            'status_code': 0,
            'body': None,
            'url': url,
            'success': False,
            'error': 'Request failed',
        }
```

### 2.3 _PythonBackend：標準庫 urllib

```python
class _PythonBackend:
    def get(self, url: str) -> Dict[str, Any]:
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                body = resp.read().decode('utf-8', errors='replace')
                return {
                    'status_code': resp.status,
                    'body': body,
                    'url': url,
                    'success': True,
                }
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='replace')
            return {
                'status_code': e.code,
                'body': body,
                'url': url,
                'success': True,   # 有 HTTP 回應就是「成功連線」，只是狀態碼非 2xx
            }
        except Exception as e:
            return {
                'status_code': 0,
                'body': None,
                'url': url,
                'success': False,
                'error': str(e),
            }
```

重點：
- `urllib.request.urlopen()` 會依 URL 協定自動處理 HTTP / HTTPS。
- **HTTPError 是「伺服器有回應」，不算例外**：例如 404 會走 `except HTTPError`，但 `success=True`，狀態碼填 `e.code`。只有「真的連不上」才會 `success=False`。
- HTTPS 走 Python 內建的 `ssl` 模組，**自動做憑證驗證**，不需要額外安裝。

### 2.4 MiniCurl：統一入口 + 版本切換

```python
class MiniCurl:
    def __init__(self, lib_path: str = None):
        try:
            self._backend = _NativeBackend(lib_path)
        except OSError:
            print("Warning: native library not available, using pure Python backend")
            self._backend = _PythonBackend()

    def get(self, url: str) -> Dict[str, Any]:
        return self._backend.get(url)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False
```

- 「後端選擇」只在這裡做一次：成功載入 `.so` 用 C，`OSError`（檔案不存在 / 缺 OpenSSL 相依）就退回 urllib。
- `__enter__` / `__exit__` 讓它可以配 `with` 使用。
- 兩支後端都實作相同的 `get(url)` 介面，所以 `MiniCurl` 不需要知道底下是誰。

---

## 3. 公開函式

```python
def fetch(url: str) -> Dict[str, Any]:
    with MiniCurl() as client:
        return client.get(url)

def fetch_text(url: str) -> Optional[str]:
    result = fetch(url)
    return result['body'] if result['success'] else None

def fetch_json(url: str) -> Optional[Any]:
    text = fetch_text(url)
    if text:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None
    return None
```

| 函式 | 回傳 | 適合場景 |
|------|------|----------|
| `fetch(url)` | dict，含 `status_code` / `body` / `url` / `success` /（選擇性）`error` | 需要狀態碼 + 內容 |
| `fetch_text(url)` | body 字串 / `None` | 只要純文字 |
| `fetch_json(url)` | 解析後的 `dict`/`list` / `None` | 抓 REST API 的 JSON |

三者的關係是「逐層包裝」：`fetch_text` 包 `fetch`，`fetch_json` 包 `fetch_text`。

---

## 4. 命令列模式

```bash
python3 src/curl.py <URL>
```

```python
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <URL>")
        sys.exit(1)

    result = fetch(sys.argv[1])
    print(f"Status: {result['status_code']}")
    print(f"Body:\n{result['body']}")
```

直接用來手測：

```bash
python3 src/curl.py https://httpbin.org/get
# Status: 200
# Body:
# {...}
```

---

## 5. 與 C 層的記憶體協定

| 邊界 | 誰配置 | 誰釋放 |
|------|--------|--------|
| C 內部 `ResponseBuffer` | `malloc` / `realloc` | C 內部（失敗時釋放） |
| `http_get()` 回傳的 body | `malloc`（`buffer.data`） | **Python ctypes 自動釋放**（`c_char_p` 回傳值會裝進 bytes） |

> ctypes 將 `c_char_p` 轉成 Python `bytes` 時會自動複製並管理記憶體，所以 C 側的 `malloc` 不會洩漏。

## 6. HTTPS 支援

| 後端 | HTTPS 機制 | 需安裝 |
|------|-----------|--------|
| `_NativeBackend` | C 層 OpenSSL（`libssl-dev` 已編譯進 `.so`） | 編譯那台電腦需 `libssl-dev` |
| `_PythonBackend` | Python `ssl`（標準庫內建） | 無 |

- 在 WSL/Linux，兩者皆支援 HTTPS，且**都做憑證驗證**。
- 在 Windows（無 `.so`），自動改用 `_PythonBackend`，HTTPS 照樣可用。
- 也就是說：**Python 版本無論在哪個平台、哪個後端，都可以抓 `https://`**。

---

## 7. 如何新增功能（延伸範例）

若想支援自訂 header，可上層包裝二：`fetch(url, headers=None)`：

```python
import urllib.request

def fetch_with_headers(url: str, headers: dict) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return {
            'status_code': resp.status,
            'body': resp.read().decode('utf-8', errors='replace'),
            'url': url,
            'success': True,
        }
```

> 注意：走 C 後端時不支援自訂 header（`http_get()` 固定 GET + 固定 header）。如果需要，可擴充 `curl.c` 的 `http_get()` 簽名，再同步改 `ctypes.argtypes`。