#pragma once

#include <engine/KeyCodes.h>
#include <engine/events/Event.h>

#include <spdlog/fmt/fmt.h>

namespace engine {

class KeyEvent : public Event {
public:
    KeyCode GetKeyCode() const { return m_KeyCode; }

    ENGINE_EVENT_CLASS_CATEGORY(EventCategoryKeyboard | EventCategoryInput)

protected:
    explicit KeyEvent(KeyCode keycode) : m_KeyCode(keycode) {}

    KeyCode m_KeyCode;
};

class KeyPressedEvent : public KeyEvent {
public:
    KeyPressedEvent(KeyCode keycode, int repeatCount)
        : KeyEvent(keycode), m_RepeatCount(repeatCount) {}

    int GetRepeatCount() const { return m_RepeatCount; }

    std::string ToString() const override {
        return fmt::format("KeyPressedEvent: {} ({} repeats)",
                           static_cast<int>(m_KeyCode), m_RepeatCount);
    }

    ENGINE_EVENT_CLASS_TYPE(KeyPressed)

private:
    int m_RepeatCount;
};

class KeyReleasedEvent : public KeyEvent {
public:
    explicit KeyReleasedEvent(KeyCode keycode) : KeyEvent(keycode) {}

    std::string ToString() const override {
        return fmt::format("KeyReleasedEvent: {}", static_cast<int>(m_KeyCode));
    }

    ENGINE_EVENT_CLASS_TYPE(KeyReleased)
};

} // namespace engine
