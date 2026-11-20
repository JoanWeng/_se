#pragma once

#include <engine/LayerStack.h>
#include <engine/Timer.h>
#include <engine/Window.h>

namespace engine {

class WindowCloseEvent;

class Application {
public:
    explicit Application(const WindowDesc& desc = {});
    virtual ~Application();

    Application(const Application&) = delete;
    Application& operator=(const Application&) = delete;

    void Run();
    void Close();

    void PushLayer(Scope<Layer> layer);
    void PushOverlay(Scope<Layer> overlay);

    Window& GetWindow() { return *m_Window; }
    const Window& GetWindow() const { return *m_Window; }

    static Application& Get();
    static bool HasInstance() { return s_Instance != nullptr; }

private:
    void OnEvent(Event& event);
    bool OnWindowClose(WindowCloseEvent& event);

    Scope<Window> m_Window;
    LayerStack m_LayerStack;
    Timer m_Timer;
    bool m_Running = true;
    float m_FixedStep = 1.0f / 60.0f;

    static Application* s_Instance;
};

// 由遊戲專案(Sandbox)實作,引擎的 main 呼叫。
Scope<Application> CreateApplication();

} // namespace engine
