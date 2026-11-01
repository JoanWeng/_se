add_executable(Sandbox main.cpp)

target_link_libraries(Sandbox PRIVATE Engine
                                      PRIVATE spdlog::spdlog)

engine_target_warnings(Sandbox)
