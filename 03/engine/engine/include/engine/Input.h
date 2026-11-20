#pragma once

#include <engine/KeyCodes.h>

#include <glm/glm.hpp>

namespace engine {

class Input {
public:
    static bool IsKeyDown(KeyCode key);
    static bool IsMouseButtonDown(MouseButton button);

    static glm::vec2 MousePosition();
    static float MouseX();
    static float MouseY();
};

} // namespace engine
