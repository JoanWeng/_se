#include <engine/Application.h>
#include <engine/Input.h>
#include <engine/Log.h>
#include <engine/events/EventDispatcher.h>
#include <engine/events/KeyEvent.h>
#include <engine/events/MouseEvent.h>
#include <engine/events/WindowEvent.h>

#include <cstdlib>

namespace {

class SandboxLayer : public engine::Layer {
public:
    SandboxLayer() : Layer("Sandbox") {}

    void OnAttach() override {
        ENGINE_APP_INFO("SandboxLayer attached");

        if (const char* frames = std::getenv("ENGINE_TEST_FRAMES")) {
            const int value = std::atoi(frames);
            if (value > 0) {
                m_MaxFrames = static_cast<engine::u32>(value);
                ENGINE_APP_INFO("Auto close after {} frames", m_MaxFrames);
            }
        }
    }

    void OnDetach() override {
        ENGINE_APP_INFO("SandboxLayer detached");
    }

    void OnUpdate(float dt) override {
        m_LogAccumulator += dt;
        if (m_LogAccumulator >= 1.0f) {
            if (dt > 0.0f) {
                ENGINE_APP_TRACE("fps: {:.1f} (dt {:.4f}s)", 1.0f / dt, dt);
            }
            m_LogAccumulator = 0.0f;
        }

        if (m_MaxFrames > 0 && ++m_Frames >= m_MaxFrames) {
            ENGINE_APP_INFO("Frame limit reached, closing");
            engine::Application::Get().Close();
        }
    }

    void OnEvent(engine::Event& event) override {
        engine::EventDispatcher dispatcher(event);

        dispatcher.Dispatch<engine::WindowResizeEvent>([](engine::WindowResizeEvent& e) {
            ENGINE_APP_INFO("{}", e.ToString());
            return false;
        });

        dispatcher.Dispatch<engine::KeyPressedEvent>([](engine::KeyPressedEvent& e) {
            ENGINE_APP_INFO("{}", e.ToString());
            if (e.GetKeyCode() == engine::KeyCode::Escape) {
                ENGINE_APP_INFO("Escape pressed, closing");
                engine::Application::Get().Close();
                return true; // handled: 下層 Layer 不會收到
            }
            return false;
        });

        dispatcher.Dispatch<engine::KeyReleasedEvent>([](engine::KeyReleasedEvent& e) {
            ENGINE_APP_TRACE("{}", e.ToString());
            return false;
        });

        dispatcher.Dispatch<engine::MouseButtonPressedEvent>(
            [](engine::MouseButtonPressedEvent& e) {
                ENGINE_APP_INFO("{}", e.ToString());
                return false;
            });

        dispatcher.Dispatch<engine::MouseButtonReleasedEvent>(
            [](engine::MouseButtonReleasedEvent& e) {
                ENGINE_APP_TRACE("{}", e.ToString());
                return false;
            });

        dispatcher.Dispatch<engine::MouseScrolledEvent>([](engine::MouseScrolledEvent& e) {
            ENGINE_APP_INFO("{}", e.ToString());
            return false;
        });

        dispatcher.Dispatch<engine::MouseMovedEvent>([](engine::MouseMovedEvent& e) {
            ENGINE_APP_TRACE("{}", e.ToString());
            return false;
        });
    }

private:
    float m_LogAccumulator = 0.0f;
    engine::u32 m_Frames = 0;
    engine::u32 m_MaxFrames = 0;
};

// 驗證 handled 攔截:若 Escape 沒被上層攔截,這層會印出警告。
class EscapeWatchLayer : public engine::Layer {
public:
    EscapeWatchLayer() : Layer("EscapeWatch") {}

    void OnEvent(engine::Event& event) override {
        engine::EventDispatcher dispatcher(event);
        dispatcher.Dispatch<engine::KeyPressedEvent>([](engine::KeyPressedEvent& e) {
            if (e.GetKeyCode() == engine::KeyCode::Escape) {
                ENGINE_APP_WARN("Escape reached lower layer: handled 未生效");
            }
            return false;
        });
    }
};

} // namespace

engine::Scope<engine::Application> engine::CreateApplication() {
    auto app = engine::MakeScope<engine::Application>(
        engine::WindowDesc{.Title = "Sandbox - M2", .Width = 1280, .Height = 720});

    app->PushLayer(engine::MakeScope<EscapeWatchLayer>());
    app->PushLayer(engine::MakeScope<SandboxLayer>());
    return app;
}
