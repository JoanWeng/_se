#include <engine/Application.h>
#include <engine/Log.h>

namespace engine {
Scope<Application> CreateApplication();
}

int main(int, char**) {
    engine::Log::Init();
    ENGINE_CORE_INFO("Engine start");

    {
        auto app = engine::CreateApplication();
        app->Run();
    }

    ENGINE_CORE_INFO("Engine shutdown");
    return 0;
}
