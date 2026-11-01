#include <cstdlib>
#include <engine/Log.h>
#include <engine/Timer.h>
#include <engine/Window.h>

int main(int, char**) {
    engine::Log::Init();
    ENGINE_CORE_INFO("Engine start");

    auto window = engine::Window::Create({.Title = "Sandbox - M1", .Width = 1280, .Height = 720});
    ENGINE_APP_INFO("Window [{}] created", "Sandbox - M1");

    engine::Timer timer;
    timer.Reset();

    float logInterval = 1.0f;
    float accum = 0.0f;

    if (const char* framesEnv = getenv("ENGINE_TEST_FRAMES")) {
        unsigned frames = static_cast<unsigned>(atoi(framesEnv));
        ENGINE_APP_INFO("Auto close after {} frames", frames);
        while (!window->ShouldClose()) {
            timer.Tick();
            window->PollEvents();
            window->SwapBuffers();
            if (--frames == 0) {
                window->RequestClose();
            }
        }
    } else {
        while (!window->ShouldClose()) {
            float dt = timer.Tick();

            accum += dt;
            if (accum >= logInterval) {
                ENGINE_APP_TRACE("dt: {:.4f}s, fps: {:.1f}", dt, 1.0f / dt);
                accum = 0.0f;
            }

            window->PollEvents();
            window->SwapBuffers();
        }
    }

    window.reset();
    ENGINE_CORE_INFO("Engine shutdown");
}
