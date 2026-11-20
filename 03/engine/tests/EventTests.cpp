#include <engine/Input.h>
#include <engine/LayerStack.h>
#include <engine/Log.h>
#include <engine/events/EventDispatcher.h>
#include <engine/events/KeyEvent.h>

#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace {

class RecordingLayer : public engine::Layer {
public:
    RecordingLayer(std::string name, std::vector<std::string>& log, bool handlesEvent = false)
        : Layer(std::move(name)), m_Log(log), m_HandlesEvent(handlesEvent) {}

    void OnAttach() override {
        m_Log.push_back("attach:" + m_DebugName);
    }

    void OnDetach() override {
        m_Log.push_back("detach:" + m_DebugName);
    }

    void OnEvent(engine::Event& event) override {
        m_Log.push_back("event:" + m_DebugName);
        if (m_HandlesEvent) {
            event.SetHandled();
        }
    }

private:
    std::vector<std::string>& m_Log;
    bool m_HandlesEvent;
};

} // namespace

#define CHECK(cond)                                                                   \
    do {                                                                              \
        if (!(cond)) {                                                                \
            std::cerr << "CHECK failed: " #cond << " (" << __FILE__ << ":"            \
                      << __LINE__ << ")\n";                                           \
            return 1;                                                                 \
        }                                                                             \
    } while (0)

int main() {
    engine::Log::Init();

    // EventDispatcher: 型別分派、handled 標記、分類旗標。
    {
        engine::KeyPressedEvent event(engine::KeyCode::A, 0);
        engine::EventDispatcher dispatcher(event);

        bool called = false;
        engine::KeyCode seen = engine::KeyCode::Unknown;

        const bool dispatched = dispatcher.Dispatch<engine::KeyPressedEvent>(
            [&](engine::KeyPressedEvent& e) {
                called = true;
                seen = e.GetKeyCode();
                e.SetHandled();
                return true;
            });

        CHECK(dispatched);
        CHECK(called);
        CHECK(seen == engine::KeyCode::A);
        CHECK(event.Handled());
        CHECK(event.IsInCategory(engine::EventCategoryKeyboard));
        CHECK(event.IsInCategory(engine::EventCategoryInput));
        CHECK(!event.IsInCategory(engine::EventCategoryMouse));

        const bool wrongType = dispatcher.Dispatch<engine::KeyReleasedEvent>(
            [](engine::KeyReleasedEvent&) { return true; });
        CHECK(!wrongType);
    }

    // LayerStack: 順序(Layer 在下、Overlay 在上)、由上而下派發、handled 攔截。
    {
        std::vector<std::string> log;
        engine::LayerStack stack;

        auto* l1 = stack.PushLayer(std::make_unique<RecordingLayer>("L1", log));
        auto* l2 = stack.PushLayer(std::make_unique<RecordingLayer>("L2", log, true));
        auto* o1 = stack.PushOverlay(std::make_unique<RecordingLayer>("O1", log));

        CHECK(l1 != nullptr);
        CHECK(l2 != nullptr);
        CHECK(o1 != nullptr);
        CHECK((log == std::vector<std::string>{"attach:L1", "attach:L2", "attach:O1"}));

        log.clear();
        std::vector<std::string> order;
        for (const auto& layer : stack) {
            order.push_back(layer->GetName());
        }
        CHECK((order == std::vector<std::string>{"L1", "L2", "O1"}));

        log.clear();
        engine::KeyPressedEvent event(engine::KeyCode::B, 0);
        stack.DispatchEvent(event);

        // O1 先收到;L2 標記 handled;L1 不應收到。
        CHECK((log == std::vector<std::string>{"event:O1", "event:L2"}));
        CHECK(event.Handled());

        log.clear();
        CHECK(stack.PopLayer(l2));
        CHECK(!stack.PopLayer(l2));
        CHECK((log == std::vector<std::string>{"detach:L2"}));

        // 新 Layer 應插入 Overlay 之前。
        log.clear();
        stack.PushLayer(std::make_unique<RecordingLayer>("L3", log));
        log.clear();
        order.clear();
        for (const auto& layer : stack) {
            order.push_back(layer->GetName());
        }
        CHECK((order == std::vector<std::string>{"L1", "L3", "O1"}));

        log.clear();
        stack.Clear();
        CHECK((log == std::vector<std::string>{"detach:L1", "detach:L3", "detach:O1"}));
        CHECK(stack.Size() == 0);
    }

    // Input: 沒有視窗時應安全回傳預設值。
    {
        CHECK(!engine::Input::IsKeyDown(engine::KeyCode::A));
        CHECK(!engine::Input::IsMouseButtonDown(engine::MouseButton::Left));

        const glm::vec2 position = engine::Input::MousePosition();
        CHECK(position.x == 0.0f);
        CHECK(position.y == 0.0f);
    }

    std::cout << "All tests passed\n";
    return 0;
}
