#include <platform/GlfwWindow.h>

#include <engine/Assert.h>
#include <engine/Log.h>
#include <engine/events/KeyEvent.h>
#include <engine/events/MouseEvent.h>
#include <engine/events/WindowEvent.h>
#include <platform/GlfwInput.h>

#ifdef _WIN32
    #define GLFW_EXPOSE_NATIVE_WIN32
#elif defined(__linux__)
    #define GLFW_EXPOSE_NATIVE_X11
#endif
#include <GLFW/glfw3.h>
#include <GLFW/glfw3native.h>

namespace engine {

bool GlfwWindow::s_GlfwInitialized = false;

namespace {

void GlfwErrorCallback(int code, const char* desc) {
    ENGINE_CORE_ERROR("GLFW Error {}: {}", code, desc);
}

u32 ClampSize(int value) {
    return value > 0 ? static_cast<u32>(value) : 0;
}

} // namespace

GlfwWindow::GlfwWindow(const WindowDesc& desc) {
    m_Data.Title = desc.Title;
    m_Data.Width = desc.Width;
    m_Data.Height = desc.Height;
    m_Data.VSync = desc.VSync;

    ENGINE_CORE_INFO("Creating window {} ({}x{}), VSync: {}",
                     desc.Title, desc.Width, desc.Height, desc.VSync);

    if (!s_GlfwInitialized) {
        glfwSetErrorCallback(&GlfwErrorCallback);

        const bool glfwOk = static_cast<bool>(glfwInit());
        ENGINE_ASSERT(glfwOk, "Could not initialize GLFW!");

        // M1: 未建立 GL context,先以 NO_API 開窗
        glfwWindowHint(GLFW_CLIENT_API, GLFW_NO_API);

        s_GlfwInitialized = true;
    }

    m_Window = glfwCreateWindow(static_cast<int>(desc.Width),
                                static_cast<int>(desc.Height),
                                m_Data.Title.c_str(), nullptr, nullptr);
    ENGINE_ASSERT(m_Window, "Could not create GLFW window!");

    glfwSetWindowUserPointer(m_Window, &m_Data);

    glfwSetWindowCloseCallback(m_Window, &GlfwWindow::OnWindowClose);
    glfwSetWindowSizeCallback(m_Window, &GlfwWindow::OnWindowResize);
    glfwSetKeyCallback(m_Window, &GlfwWindow::OnKey);
    glfwSetMouseButtonCallback(m_Window, &GlfwWindow::OnMouseButton);
    glfwSetCursorPosCallback(m_Window, &GlfwWindow::OnCursorPos);
    glfwSetScrollCallback(m_Window, &GlfwWindow::OnScroll);

    detail::SetInputWindow(m_Window);
}

GlfwWindow::~GlfwWindow() {
    detail::SetInputWindow(nullptr);

    if (m_Window) {
        glfwDestroyWindow(m_Window);
        m_Window = nullptr;
    }

    if (s_GlfwInitialized) {
        glfwTerminate();
        s_GlfwInitialized = false;
    }
}

void GlfwWindow::PollEvents() {
    glfwPollEvents();
}

void GlfwWindow::SwapBuffers() {
    if (glfwGetWindowAttrib(m_Window, GLFW_CLIENT_API) == GLFW_NO_API) {
        return; // M3 之後建立 GL context 才有意義
    }
    glfwSwapBuffers(m_Window);
}

bool GlfwWindow::IsMinimized() const {
    return glfwGetWindowAttrib(m_Window, GLFW_ICONIFIED) == GLFW_TRUE;
}

void GlfwWindow::SetVSync(bool enabled) {
    m_Data.VSync = enabled;
    ENGINE_CORE_TRACE("VSync: {}", enabled);
}

void* GlfwWindow::NativeHandle() const {
#ifdef _WIN32
    return glfwGetWin32Window(m_Window);
#elif defined(__linux__)
    return reinterpret_cast<void*>(glfwGetX11Window(m_Window));
#endif
}

GlfwWindow::WindowData* GlfwWindow::GetData(GLFWwindow* window) {
    return static_cast<WindowData*>(glfwGetWindowUserPointer(window));
}

void GlfwWindow::OnWindowClose(GLFWwindow* window) {
    WindowData* data = GetData(window);
    if (!data) {
        return;
    }

    WindowCloseEvent event;
    if (data->CallbackFn) {
        data->CallbackFn(event);
    }
}

void GlfwWindow::OnWindowResize(GLFWwindow* window, int width, int height) {
    WindowData* data = GetData(window);
    if (!data) {
        return;
    }

    data->Width = ClampSize(width);
    data->Height = ClampSize(height);

    WindowResizeEvent event(data->Width, data->Height);
    if (data->CallbackFn) {
        data->CallbackFn(event);
    }
}

void GlfwWindow::OnKey(GLFWwindow* window, int key, int scancode, int action, int mods) {
    (void)scancode;
    (void)mods;

    WindowData* data = GetData(window);
    if (!data || !data->CallbackFn) {
        return;
    }

    const auto keyCode = static_cast<KeyCode>(key);

    if (action == GLFW_PRESS) {
        KeyPressedEvent event(keyCode, 0);
        data->CallbackFn(event);
    } else if (action == GLFW_REPEAT) {
        KeyPressedEvent event(keyCode, 1);
        data->CallbackFn(event);
    } else if (action == GLFW_RELEASE) {
        KeyReleasedEvent event(keyCode);
        data->CallbackFn(event);
    }
}

void GlfwWindow::OnMouseButton(GLFWwindow* window, int button, int action, int mods) {
    (void)mods;

    WindowData* data = GetData(window);
    if (!data || !data->CallbackFn) {
        return;
    }

    const auto mouseButton = static_cast<MouseButton>(button);

    if (action == GLFW_PRESS) {
        MouseButtonPressedEvent event(mouseButton);
        data->CallbackFn(event);
    } else if (action == GLFW_RELEASE) {
        MouseButtonReleasedEvent event(mouseButton);
        data->CallbackFn(event);
    }
}

void GlfwWindow::OnCursorPos(GLFWwindow* window, double x, double y) {
    WindowData* data = GetData(window);
    if (!data || !data->CallbackFn) {
        return;
    }

    MouseMovedEvent event(static_cast<float>(x), static_cast<float>(y));
    data->CallbackFn(event);
}

void GlfwWindow::OnScroll(GLFWwindow* window, double xOffset, double yOffset) {
    WindowData* data = GetData(window);
    if (!data || !data->CallbackFn) {
        return;
    }

    MouseScrolledEvent event(static_cast<float>(xOffset), static_cast<float>(yOffset));
    data->CallbackFn(event);
}

Scope<Window> Window::Create(const WindowDesc& desc) {
    return MakeScope<GlfwWindow>(desc);
}

} // namespace engine
