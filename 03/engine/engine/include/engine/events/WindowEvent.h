#pragma once

#include <engine/events/Event.h>

#include <spdlog/fmt/fmt.h>

namespace engine {

class WindowCloseEvent : public Event {
public:
    ENGINE_EVENT_CLASS_TYPE(WindowClose)
    ENGINE_EVENT_CLASS_CATEGORY(EventCategoryApplication)
};

class WindowResizeEvent : public Event {
public:
    WindowResizeEvent(u32 width, u32 height) : m_Width(width), m_Height(height) {}

    u32 GetWidth() const { return m_Width; }
    u32 GetHeight() const { return m_Height; }

    std::string ToString() const override {
        return fmt::format("WindowResizeEvent: {}, {}", m_Width, m_Height);
    }

    ENGINE_EVENT_CLASS_TYPE(WindowResize)
    ENGINE_EVENT_CLASS_CATEGORY(EventCategoryApplication)

private:
    u32 m_Width;
    u32 m_Height;
};

} // namespace engine
