#pragma once

#include <engine/KeyCodes.h>
#include <engine/events/Event.h>

#include <spdlog/fmt/fmt.h>

namespace engine {

class MouseMovedEvent : public Event {
public:
    MouseMovedEvent(float x, float y) : m_MouseX(x), m_MouseY(y) {}

    float GetX() const { return m_MouseX; }
    float GetY() const { return m_MouseY; }

    std::string ToString() const override {
        return fmt::format("MouseMovedEvent: {}, {}", m_MouseX, m_MouseY);
    }

    ENGINE_EVENT_CLASS_TYPE(MouseMoved)
    ENGINE_EVENT_CLASS_CATEGORY(EventCategoryMouse | EventCategoryInput)

private:
    float m_MouseX;
    float m_MouseY;
};

class MouseScrolledEvent : public Event {
public:
    MouseScrolledEvent(float xOffset, float yOffset)
        : m_XOffset(xOffset), m_YOffset(yOffset) {}

    float GetXOffset() const { return m_XOffset; }
    float GetYOffset() const { return m_YOffset; }

    std::string ToString() const override {
        return fmt::format("MouseScrolledEvent: {}, {}", m_XOffset, m_YOffset);
    }

    ENGINE_EVENT_CLASS_TYPE(MouseScrolled)
    ENGINE_EVENT_CLASS_CATEGORY(EventCategoryMouse | EventCategoryInput)

private:
    float m_XOffset;
    float m_YOffset;
};

class MouseButtonEvent : public Event {
public:
    MouseButton GetMouseButton() const { return m_Button; }

    ENGINE_EVENT_CLASS_CATEGORY(
        EventCategoryMouse | EventCategoryMouseButton | EventCategoryInput)

protected:
    explicit MouseButtonEvent(MouseButton button) : m_Button(button) {}

    MouseButton m_Button;
};

class MouseButtonPressedEvent : public MouseButtonEvent {
public:
    explicit MouseButtonPressedEvent(MouseButton button) : MouseButtonEvent(button) {}

    std::string ToString() const override {
        return fmt::format("MouseButtonPressedEvent: {}", static_cast<int>(m_Button));
    }

    ENGINE_EVENT_CLASS_TYPE(MouseButtonPressed)
};

class MouseButtonReleasedEvent : public MouseButtonEvent {
public:
    explicit MouseButtonReleasedEvent(MouseButton button) : MouseButtonEvent(button) {}

    std::string ToString() const override {
        return fmt::format("MouseButtonReleasedEvent: {}", static_cast<int>(m_Button));
    }

    ENGINE_EVENT_CLASS_TYPE(MouseButtonReleased)
};

} // namespace engine
