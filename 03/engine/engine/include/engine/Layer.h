#pragma once

#include <engine/events/Event.h>

#include <string>
#include <utility>

namespace engine {

class Layer {
public:
    explicit Layer(std::string name = "Layer") : m_DebugName(std::move(name)) {}
    virtual ~Layer() = default;

    virtual void OnAttach() {}
    virtual void OnDetach() {}
    virtual void OnUpdate(float dt) { (void)dt; }
    virtual void OnFixedUpdate(float fixedDt) { (void)fixedDt; }
    virtual void OnRender(float alpha) { (void)alpha; }

    // 呼叫 event.SetHandled() 可阻止後續(下層)Layer 收到同一個事件。
    virtual void OnEvent(Event& event) { (void)event; }

    const std::string& GetName() const { return m_DebugName; }

protected:
    std::string m_DebugName;
};

} // namespace engine
