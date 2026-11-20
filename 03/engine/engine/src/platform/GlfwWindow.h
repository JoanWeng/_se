#pragma once

#include <engine/Window.h>

#include <GLFW/glfw3.h>

#include <string>

namespace engine {

class GlfwWindow : public Window {
public:
    explicit GlfwWindow(const WindowDesc& desc);
    ~GlfwWindow() override;

    void PollEvents() override;
    void SwapBuffers() override;
    bool ShouldClose() const override { return glfwWindowShouldClose(m_Window); }
    void RequestClose() override { glfwSetWindowShouldClose(m_Window, GLFW_TRUE); }

    u32 Width() const override { return m_Data.Width; }
    u32 Height() const override { return m_Data.Height; }
    bool IsMinimized() const override;

    void SetVSync(bool enabled) override;
    bool IsVSync() const override { return m_Data.VSync; }

    void* NativeHandle() const override;
    void SetEventCallback(const EventCallback& callback) override { m_Data.CallbackFn = callback; }

private:
    struct WindowData {
        std::string Title;
        u32 Width = 0;
        u32 Height = 0;
        bool VSync = false;
        EventCallbackFn CallbackFn;
    };

    static WindowData* GetData(GLFWwindow* window);

    static void OnWindowClose(GLFWwindow* window);
    static void OnWindowResize(GLFWwindow* window, int width, int height);
    static void OnKey(GLFWwindow* window, int key, int scancode, int action, int mods);
    static void OnMouseButton(GLFWwindow* window, int button, int action, int mods);
    static void OnCursorPos(GLFWwindow* window, double x, double y);
    static void OnScroll(GLFWwindow* window, double xOffset, double yOffset);

    static bool s_GlfwInitialized;

    GLFWwindow* m_Window = nullptr;
    WindowData m_Data;
};

} // namespace engine
