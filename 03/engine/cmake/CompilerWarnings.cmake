function(engine_target_warnings target)
    if(MSVC)
        target_compile_options(${target} PRIVATE /W4)
    else()
        target_compile_options(${target} PRIVATE
            -Wall -Wextra
            $<$<CONFIG:Release>:-Werror>
        )
    endif()
endfunction()
