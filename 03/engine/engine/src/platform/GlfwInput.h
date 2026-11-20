#pragma once

namespace engine::detail {

// 由 GlfwWindow 在建立/銷毀時呼叫,讓 Input 能查詢目前視窗狀態。
void SetInputWindow(void* nativeWindow);

} // namespace engine::detail
