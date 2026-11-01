#pragma once

#include <engine/Log.h>

#if defined(_MSC_VER)
    #define ENGINE_DEBUGBREAK() __debugbreak()
#else
    #include <csignal>
    #define ENGINE_DEBUGBREAK() __builtin_trap()
#endif

#if defined(NDEBUG)
    #define ENGINE_ASSERT(cond, ...) do { (void)sizeof((cond) ? 1 : 0); } while (0)
#else
    #define ENGINE_ASSERT(cond, ...)                                              \
        do {                                                                      \
            if (!(cond)) {                                                        \
                ENGINE_CORE_CRITICAL("Assertion failed: {}", #cond);              \
                ENGINE_CORE_CRITICAL(__VA_ARGS__);                                \
                ENGINE_DEBUGBREAK();                                              \
            }                                                                     \
        } while (0)
#endif
