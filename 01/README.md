# Mini CURL - HTTP GET Library

A high-performance HTTP GET implementation in C with a Python wrapper.

## Project Structure

```
.
├── build.sh              # Build script
├── src/
│   ├── curl.c           # C implementation
│   └── curl.py          # Python wrapper
├── tests/
│   ├── test_curl.c      # C tests
│   └── test_curl.py     # Python tests
├── build/               # Build artifacts
└── include/             # Header files (if needed)
```

## Prerequisites

- GCC compiler
- libcurl development library (`libcurl4-openssl-dev`)
- Python 3.6+
- pytest (for Python tests)

## Build

```bash
# Install dependencies (Ubuntu/Debian)
sudo apt-get install libcurl4-openssl-dev python3-pip
pip install pytest

# Build the project
./build.sh
```

## Usage

### C API

```c
#include "curl.c"

long status_code;
char *response = http_get("https://example.com", &status_code);
if (response) {
    printf("Status: %ld\n", status_code);
    printf("Response: %s\n", response);
    free(response);
}
```

### Python API

```python
from src.curl import fetch, fetch_text, fetch_json

# Simple fetch
result = fetch("https://example.com")
print(result['status_code'], result['body'])

# Get text directly
text = fetch_text("https://example.com")

# Get JSON directly
data = fetch_json("https://api.example.com/data")

# Using context manager
with MiniCurl() as client:
    result = client.get("https://example.com")
```

## Testing

```bash
# Run C tests
cd tests
gcc -o test_curl test_curl.c -lcurl
./test_curl

# Run Python tests
pytest tests/test_curl.py -v
```

## API Reference

### C Functions

- `char *http_get(const char *url, long *status_code)` - Perform HTTP GET request
- `void curl_init(void)` - Initialize curl (for shared library)
- `void curl_cleanup(void)` - Cleanup curl (for shared library)

### Python Functions

- `fetch(url)` - Returns dict with status_code, body, url, success
- `fetch_text(url)` - Returns response body as string or None
- `fetch_json(url)` - Returns parsed JSON or None
- `MiniCurl` - Class for managing curl sessions
