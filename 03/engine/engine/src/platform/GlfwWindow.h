#pragma once

#include <engine/Window.h>

#include <GLFW/glfw3.h>

namespace engine {

class GlfwWindow : public Window {
public:
    using EventCallbackFn = Window::EventCallback;

    explicit GlfwWindow(const WindowDesc& desc);
    ~GlfwWindow() override;

    void PollEvents() override;
    void SwapBuffers() override;
    bool ShouldClose() const override { return glfwWindowShouldClose(m_Window); }
    void RequestClose() override { glfwSetWindowShouldClose(m_Window, GLFW_TRUE); }

    u32 Width() const override { return m_Data.Width; }
    u32 Height() const override { return m_Data.Height; }

    void SetVSync(bool enabled) override;
    bool IsVSync() const override { return m_Data.VSync; }

    void* NativeHandle() const override;
    void SetEventCallback(const EventCallback& callback) override { m_Data.CallbackFn = callback; }

private:
    static bool s_GlfwInitialized;

    GLFWwindow* m_Window = nullptr;

    struct WindowData {
        std::string Title;
        u32 Width = 0;
        u32 Height = 0;
        bool VSync = false;
        EventCallbackFn CallbackFn;
    };

    WindowData m_Data;
};

} // namespace engine
