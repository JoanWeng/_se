#pragma once

#include <engine/Types.h>

#include <string>

namespace engine {

enum class EventType {
    None = 0,
    WindowClose,
    WindowResize,
    KeyPressed,
    KeyReleased,
    MouseButtonPressed,
    MouseButtonReleased,
    MouseMoved,
    MouseScrolled,
};

enum EventCategory : u32 {
    EventCategoryNone = 0,
    EventCategoryApplication = 1u << 0,
    EventCategoryInput = 1u << 1,
    EventCategoryKeyboard = 1u << 2,
    EventCategoryMouse = 1u << 3,
    EventCategoryMouseButton = 1u << 4,
};

class EventDispatcher;

class Event {
public:
    virtual ~Event() = default;

    virtual EventType GetEventType() const = 0;
    virtual const char* GetName() const = 0;
    virtual u32 GetCategoryFlags() const = 0;
    virtual std::string ToString() const { return GetName(); }

    bool Handled() const { return m_Handled; }
    void SetHandled(bool handled = true) { m_Handled = handled; }

    bool IsInCategory(EventCategory category) const {
        return (GetCategoryFlags() & static_cast<u32>(category)) != 0;
    }

private:
    friend class EventDispatcher;

    bool m_Handled = false;
};

} // namespace engine

#define ENGINE_EVENT_CLASS_TYPE(type)                                                 \
    static ::engine::EventType GetStaticType() { return ::engine::EventType::type; }  \
    ::engine::EventType GetEventType() const override { return GetStaticType(); }     \
    const char* GetName() const override { return #type; }

#define ENGINE_EVENT_CLASS_CATEGORY(category)                                         \
    ::engine::u32 GetCategoryFlags() const override {                                 \
        return static_cast<::engine::u32>(category);                                  \
    }
