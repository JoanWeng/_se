#pragma once

#include <chrono>

namespace engine {

class Timer {
public:
    void Reset() { m_Start = std::chrono::steady_clock::now(); m_Last = m_Start; }

    float Tick() {
        auto now = std::chrono::steady_clock::now();
        float dt = std::chrono::duration_cast<std::chrono::duration<float>>(now - m_Last).count();
        m_Last = now;
        return dt;
    }

    static float Since(const std::chrono::steady_clock::time_point& tp) {
        return std::chrono::duration_cast<std::chrono::duration<float>>(
                   std::chrono::steady_clock::now() - tp).count();
    }

private:
    std::chrono::steady_clock::time_point m_Start;
    std::chrono::steady_clock::time_point m_Last;
};

} // namespace engine
