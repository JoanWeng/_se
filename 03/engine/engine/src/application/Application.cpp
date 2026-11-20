#include <engine/Application.h>

#include <engine/Assert.h>
#include <engine/Log.h>
#include <engine/events/EventDispatcher.h>
#include <engine/events/WindowEvent.h>

namespace engine {

Application* Application::s_Instance = nullptr;

Application::Application(const WindowDesc& desc) {
    ENGINE_ASSERT(!s_Instance, "Application already exists");
    s_Instance = this;

    m_Window = Window::Create(desc);
    m_Window->SetEventCallback([this](Event& event) { OnEvent(event); });

    m_Timer.Reset();
    ENGINE_CORE_INFO("Application initialized ({}x{})", m_Window->Width(), m_Window->Height());
}

Application::~Application() {
    ENGINE_CORE_INFO("Application shutting down");

    // 先讓 Layer 在視窗仍存在時 Detach。
    m_LayerStack.Clear();
    s_Instance = nullptr;
}

void Application::Run() {
    ENGINE_CORE_INFO("Application run loop start");

    float accumulator = 0.0f;

    while (m_Running && !m_Window->ShouldClose()) {
        float dt = m_Timer.Tick();
        if (dt > 0.25f) {
            dt = 0.25f; // 避免視窗拖動或斷點造成的死亡螺旋
        }

        m_Window->PollEvents();

        accumulator += dt;
        while (accumulator >= m_FixedStep) {
            for (auto& layer : m_LayerStack) {
                layer->OnFixedUpdate(m_FixedStep);
            }
            accumulator -= m_FixedStep;
        }

        for (auto& layer : m_LayerStack) {
            layer->OnUpdate(dt);
        }

        if (!m_Window->IsMinimized()) {
            const float alpha = accumulator / m_FixedStep;
            for (auto& layer : m_LayerStack) {
                layer->OnRender(alpha);
            }
            m_Window->SwapBuffers();
        }
    }

    ENGINE_CORE_INFO("Application run loop end");
}

void Application::Close() {
    m_Running = false;
    if (m_Window) {
        m_Window->RequestClose();
    }
}

void Application::PushLayer(Scope<Layer> layer) {
    m_LayerStack.PushLayer(std::move(layer));
}

void Application::PushOverlay(Scope<Layer> overlay) {
    m_LayerStack.PushOverlay(std::move(overlay));
}

void Application::OnEvent(Event& event) {
    EventDispatcher dispatcher(event);
    dispatcher.Dispatch<WindowCloseEvent>([this](WindowCloseEvent& e) {
        return OnWindowClose(e);
    });

    // 由上而下(Overlay → Layer),事件被標記 handled 後停止。
    m_LayerStack.DispatchEvent(event);
}

bool Application::OnWindowClose(WindowCloseEvent&) {
    m_Running = false;
    return true;
}

Application& Application::Get() {
    ENGINE_ASSERT(s_Instance != nullptr, "Application instance does not exist");
    return *s_Instance;
}

} // namespace engine
