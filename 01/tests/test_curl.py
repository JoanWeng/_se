import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from curl import MiniCurl, fetch, fetch_text, fetch_json

def test_fetch_success(client):
    result = client.get("http://httpbin.org/get")
    assert result['success'] is True
    assert result['status_code'] == 200
    assert result['body'] is not None
    assert len(result['body']) > 0

def test_fetch_not_found(client):
    result = client.get("http://httpbin.org/status/404")
    assert result['success'] is True
    assert result['status_code'] == 404

def test_fetch_invalid_url(client):
    result = client.get("http://doesnotexist.invalid")
    assert result['success'] is False
    assert result['status_code'] == 0

def test_fetch_text():
    text = fetch_text("http://httpbin.org/get")
    assert text is not None
    assert len(text) > 0

def test_fetch_json():
    data = fetch_json("http://httpbin.org/get")
    assert data is not None
    assert 'url' in data

def test_fetch_json_invalid():
    data = fetch_json("http://httpbin.org/html")
    assert data is None


if __name__ == "__main__":
    client = MiniCurl()
    passed = 0

    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                if "client" in fn.__code__.co_varnames:
                    fn(client)
                else:
                    fn()
                print(f"[PASS] {name}")
                passed += 1
            except AssertionError as e:
                print(f"[FAIL] {name}: {e}")
                sys.exit(1)

    print(f"\n{passed} tests passed")