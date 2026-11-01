#pragma once

#include <memory>
#include <spdlog/spdlog.h>
#include <spdlog/fmt/ostr.h>

namespace engine {

class Log {
public:
    static void Init();

    static std::shared_ptr<spdlog::logger>& CoreLogger() { return s_CoreLogger; }
    static std::shared_ptr<spdlog::logger>& AppLogger() { return s_AppLogger; }

private:
    static std::shared_ptr<spdlog::logger> s_CoreLogger;
    static std::shared_ptr<spdlog::logger> s_AppLogger;
};

} // namespace engine

#define ENGINE_CORE_TRACE(...)    ::engine::Log::CoreLogger()->trace(__VA_ARGS__)
#define ENGINE_CORE_INFO(...)     ::engine::Log::CoreLogger()->info(__VA_ARGS__)
#define ENGINE_CORE_WARN(...)     ::engine::Log::CoreLogger()->warn(__VA_ARGS__)
#define ENGINE_CORE_ERROR(...)    ::engine::Log::CoreLogger()->error(__VA_ARGS__)
#define ENGINE_CORE_CRITICAL(...) ::engine::Log::CoreLogger()->critical(__VA_ARGS__)

#define ENGINE_APP_TRACE(...)     ::engine::Log::AppLogger()->trace(__VA_ARGS__)
#define ENGINE_APP_INFO(...)      ::engine::Log::AppLogger()->info(__VA_ARGS__)
#define ENGINE_APP_WARN(...)      ::engine::Log::AppLogger()->warn(__VA_ARGS__)
#define ENGINE_APP_ERROR(...)     ::engine::Log::AppLogger()->error(__VA_ARGS__)
#define ENGINE_APP_CRITICAL(...)  ::engine::Log::AppLogger()->critical(__VA_ARGS__)
