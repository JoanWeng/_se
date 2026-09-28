#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "../src/curl.c"

static int tests_passed = 0;
static void check(const char *name, int condition) {
    printf("[%s] %s\n", condition ? "PASS" : "FAIL", name);
    if (condition) tests_passed++;
    else exit(1);
}

int main(void) {
    printf("Running C tests...\n\n");

    long status_code = 0;
    char *response;

    response = http_get("http://httpbin.org/get", &status_code);
    check("GET /get returns 200", response && status_code == 200);
    check("GET /get returns body", response && strlen(response) > 0);
    free(response);

    response = http_get("http://httpbin.org/status/404", &status_code);
    check("GET /status/404 returns 404", response && status_code == 404);
    free(response);

    response = http_get("http://doesnotexist.invalid", &status_code);
    check("Invalid domain fails", response == NULL);

    response = http_get("https://httpbin.org/get", &status_code);
    check("HTTPS GET /get returns 200", response && status_code == 200);
    check("HTTPS GET /get returns body", response && strlen(response) > 0);
    free(response);

    printf("\n%d tests passed\n", tests_passed);
    return 0;
}