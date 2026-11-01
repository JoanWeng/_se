#pragma once

#include <engine/Types.h>

#include <functional>
#include <string>

namespace engine {

struct Event;

struct WindowDesc {
    std::string Title = "Engine";
    u32 Width = 1280;
    u32 Height = 720;
    bool VSync = true;
};

class Window {
public:
    using EventCallback = std::function<void(Event&)>;

    virtual ~Window() = default;

    virtual void PollEvents() = 0;
    virtual void SwapBuffers() = 0;
    virtual bool ShouldClose() const = 0;
    virtual void RequestClose() = 0;

    virtual u32 Width() const = 0;
    virtual u32 Height() const = 0;

    virtual void SetVSync(bool enabled) = 0;
    virtual bool IsVSync() const = 0;

    virtual void* NativeHandle() const = 0;

    virtual void SetEventCallback(const EventCallback& callback) = 0;

    static Scope<Window> Create(const WindowDesc& desc = {});
};

} // namespace engine
