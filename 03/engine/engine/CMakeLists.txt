include(FetchContent)

FetchContent_Declare(
    spdlog
    GIT_REPOSITORY https://github.com/gabime/spdlog.git
    GIT_TAG        v1.14.1)
FetchContent_Declare(
    glfw
    GIT_REPOSITORY https://github.com/glfw/glfw.git
    GIT_TAG        3.4)
FetchContent_Declare(
    glm
    GIT_REPOSITORY https://github.com/g-truc/glm.git
    GIT_TAG        1.0.1)

set(GLM_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(GLM_BUILD_INSTALL OFF CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(spdlog glfw glm)

set(ENGINE_SOURCES
    src/application/Application.cpp
    src/application/EntryPoint.cpp
    src/application/LayerStack.cpp
    src/core/Log.cpp
    src/platform/GlfwWindow.cpp
    src/platform/Input.cpp)

add_library(Engine STATIC ${ENGINE_SOURCES})

target_include_directories(Engine
    PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
    PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)

target_link_libraries(Engine PUBLIC spdlog::spdlog glfw glm::glm)

engine_target_warnings(Engine)

if(ENGINE_WITH_ASAN)
    target_compile_options(Engine PUBLIC $<$<CONFIG:Debug>:-fsanitize=address -fno-omit-frame-pointer>)
    target_link_options(Engine PUBLIC $<$<CONFIG:Debug>:-fsanitize=address>)
endif()
