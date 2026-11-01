include(FetchContent)

FetchContent_Declare(
    spdlog
    GIT_REPOSITORY https://github.com/gabime/spdlog.git
    GIT_TAG        v1.14.1)
FetchContent_Declare(
    glfw
    GIT_REPOSITORY https://github.com/glfw/glfw.git
    GIT_TAG        3.4)

FetchContent_MakeAvailable(spdlog glfw)

set(ENGINE_SOURCES
    src/core/Log.cpp
    src/platform/GlfwWindow.cpp)

add_library(Engine STATIC ${ENGINE_SOURCES})

target_include_directories(Engine
    PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
    PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)

target_link_libraries(Engine PUBLIC spdlog::spdlog glfw)

engine_target_warnings(Engine)

if(ENGINE_WITH_ASAN)
    target_compile_options(Engine PUBLIC $<$<CONFIG:Debug>:-fsanitize=address -fno-omit-frame-pointer>)
    target_link_options(Engine PUBLIC $<$<CONFIG:Debug>:-fsanitize=address>)
endif()
