#include <engine/Input.h>

#include <platform/GlfwInput.h>

#include <GLFW/glfw3.h>

namespace engine {

namespace {

GLFWwindow* s_Window = nullptr;

} // namespace

namespace detail {

void SetInputWindow(void* nativeWindow) {
    s_Window = static_cast<GLFWwindow*>(nativeWindow);
}

} // namespace detail

static_assert(static_cast<int>(KeyCode::Space) == GLFW_KEY_SPACE);
static_assert(static_cast<int>(KeyCode::A) == GLFW_KEY_A);
static_assert(static_cast<int>(KeyCode::Escape) == GLFW_KEY_ESCAPE);
static_assert(static_cast<int>(KeyCode::F1) == GLFW_KEY_F1);
static_assert(static_cast<int>(KeyCode::LeftShift) == GLFW_KEY_LEFT_SHIFT);
static_assert(static_cast<int>(KeyCode::Menu) == GLFW_KEY_MENU);
static_assert(static_cast<int>(MouseButton::Left) == GLFW_MOUSE_BUTTON_LEFT);
static_assert(static_cast<int>(MouseButton::Right) == GLFW_MOUSE_BUTTON_RIGHT);
static_assert(static_cast<int>(MouseButton::Middle) == GLFW_MOUSE_BUTTON_MIDDLE);

bool Input::IsKeyDown(KeyCode key) {
    if (!s_Window) {
        return false;
    }

    const int state = glfwGetKey(s_Window, static_cast<int>(key));
    return state == GLFW_PRESS || state == GLFW_REPEAT;
}

bool Input::IsMouseButtonDown(MouseButton button) {
    if (!s_Window) {
        return false;
    }

    return glfwGetMouseButton(s_Window, static_cast<int>(button)) == GLFW_PRESS;
}

glm::vec2 Input::MousePosition() {
    if (!s_Window) {
        return glm::vec2(0.0f);
    }

    double x = 0.0;
    double y = 0.0;
    glfwGetCursorPos(s_Window, &x, &y);
    return glm::vec2(static_cast<float>(x), static_cast<float>(y));
}

float Input::MouseX() {
    return MousePosition().x;
}

float Input::MouseY() {
    return MousePosition().y;
}

} // namespace engine
