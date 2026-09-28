#!/usr/bin/env python3
import ctypes
import os
from typing import Optional, Dict, Any
import json
import urllib.request
import urllib.error


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

    def get(self, url: str) -> Dict[str, Any]:
        status_code = ctypes.c_long(0)
        response = self._lib.http_get(
            url.encode('utf-8'),
            ctypes.byref(status_code)
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
                'success': True,
            }
        except Exception as e:
            return {
                'status_code': 0,
                'body': None,
                'url': url,
                'success': False,
                'error': str(e),
            }


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

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <URL>")
        sys.exit(1)

    result = fetch(sys.argv[1])
    print(f"Status: {result['status_code']}")
    print(f"Body:\n{result['body']}")