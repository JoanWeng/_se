#include <platform/GlfwWindow.h>

#include <engine/Assert.h>
#include <engine/Log.h>

#ifdef _WIN32
    #define GLFW_EXPOSE_NATIVE_WIN32
#elif defined(__linux__)
    #define GLFW_EXPOSE_NATIVE_X11
#endif
#include <GLFW/glfw3.h>
#include <GLFW/glfw3native.h>

namespace engine {

bool GlfwWindow::s_GlfwInitialized = false;

static void GlfwErrorCallback(int code, const char* desc) {
    ENGINE_CORE_ERROR("GLFW Error {}: {}", code, desc);
}

GlfwWindow::GlfwWindow(const WindowDesc& desc) {
    m_Data.Title = desc.Title;
    m_Data.Width = desc.Width;
    m_Data.Height = desc.Height;

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

    m_Data.VSync = desc.VSync; // SwapInterval 需要有效 context,M3 接入 GraphicsContext 時套用
}

GlfwWindow::~GlfwWindow() {
    if (m_Window) {
        glfwDestroyWindow(m_Window);
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

Scope<Window> Window::Create(const WindowDesc& desc) {
    return MakeScope<GlfwWindow>(desc);
}

} // namespace engine
