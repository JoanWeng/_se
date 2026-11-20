add_executable(EngineTests EventTests.cpp)

target_link_libraries(EngineTests PRIVATE Engine)

engine_target_warnings(EngineTests)

add_test(NAME EngineTests COMMAND EngineTests)
