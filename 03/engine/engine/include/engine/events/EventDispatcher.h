#pragma once

#include <engine/events/Event.h>

#include <type_traits>

namespace engine {

class EventDispatcher {
public:
    explicit EventDispatcher(Event& event) : m_Event(event) {}

    // Handler 回傳 true 代表事件已被處理,之後的 Layer 不會再收到。
    template<typename T, typename F>
    bool Dispatch(const F& func) {
        static_assert(std::is_base_of_v<Event, T>, "T must derive from Event");

        if (m_Event.GetEventType() != T::GetStaticType()) {
            return false;
        }

        m_Event.m_Handled = func(static_cast<T&>(m_Event)) || m_Event.m_Handled;
        return true;
    }

private:
    Event& m_Event;
};

} // namespace engine
