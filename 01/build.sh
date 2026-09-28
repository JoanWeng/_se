#!/bin/bash
set -e

CC="${CC:-gcc}"
CFLAGS="${CFLAGS:--O2 -Wall -Wextra}"
LDFLAGS="${LDFLAGS:--lssl -lcrypto}"
BUILD_DIR="build"
SRC_DIR="src"

mkdir -p "$BUILD_DIR"

echo "Building static library..."
$CC $CFLAGS -c "$SRC_DIR/curl.c" -o "$BUILD_DIR/curl.o"
ar rcs "$BUILD_DIR/libcurl_wrapper.a" "$BUILD_DIR/curl.o"

echo "Building shared library..."
$CC $CFLAGS -shared -fPIC "$SRC_DIR/curl.c" -o "$BUILD_DIR/libcurl_wrapper.so" $LDFLAGS

echo "Building standalone executable..."
$CC $CFLAGS "$SRC_DIR/curl.c" -o "$BUILD_DIR/curl" -DBUILD_STANDALONE $LDFLAGS

echo "Build complete!"
echo "Libraries: $BUILD_DIR/libcurl_wrapper.a, $BUILD_DIR/libcurl_wrapper.so"
echo "Executable: $BUILD_DIR/curl"