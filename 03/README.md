# 作業03:C++ 遊戲引擎基礎架構

規劃與設計筆記見 [`專案架構.md`](專案架構.md)。目前完成 **M2 事件與輸入**。

## 目前的完成項目

| 模組 | 檔案 | 內容 |
|---|---|---|
| 專案骨架 | `engine/` | 頂層 CMakeLists、`cmake/CompilerWarnings.cmake`、`engine/`(靜態庫 Engine)、`sandbox/`(執行檔 Sandbox)、`tests/`(EngineTests) |
| Core | `engine/include/engine/Types.h` | `Scope<T>`/`Ref<T>` 工廠函式、固定寬度整數別名 |
| Core | `engine/include/engine/Log.h` + `src/core/Log.cpp` | 包裝 spdlog,ENGINE(核心)/APP(應用)雙 logger,Trace~Critical |
| Core | `engine/include/engine/Assert.h` | `ENGINE_ASSERT(cond, msg)`,Debug 中斷,Release 編譯消失 |
| Core | `engine/include/engine/Timer.h` | `steady_clock` 計時,`Tick()` 回傳 deltaTime |
| Platform | `engine/include/engine/Window.h` + `src/platform/GlfwWindow.{h,cpp}` | Window 抽象 + GLFW 實作,註冊視窗/鍵盤/滑鼠 callback |
| Platform | `engine/include/engine/Input.h` + `src/platform/Input.cpp` | `IsKeyDown`、`IsMouseButtonDown`、`MousePosition`(GLM `vec2`) |
| Event | `engine/include/engine/events/*.h` | `Event`、`EventDispatcher`、Window/Key/Mouse 事件、分類旗標與 `handled` |
| Layer | `engine/include/engine/Layer.h`、`LayerStack.h` + `src/application/LayerStack.cpp` | Layer 生命週期、Layer/Overlay 排序、由上而下派發 |
| Application | `engine/include/engine/Application.h` + `src/application/{Application,EntryPoint}.cpp` | 主迴圈(固定步長 1/60)、事件分發、`CreateApplication()` 入口 |

第三方庫(spdlog / GLFW / GLM)以 CMake FetchContent 於 configure 時抓取。

## 工具鏈(免安裝、無 sudo)

`_toolchain/` 內含 g++ 13.3、CMake 3.31、Ninja 1.12 及 X11/GL 開發標頭(皆由 .deb 解壓到 `_toolchain/root/`)。使用前先載入環境:

```bash
source _toolchain/env.sh
```

注意:`env.sh` 結尾會 unset ROOT,若要在同一 shell 反覆使用,每次執行指令前重新 source 即可。

## 建置

### Debug / Release

```bash
cd engine
source ../_toolchain/env.sh

cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug  \
  -DENGINE_WITH_ASAN=OFF        # Debug 想開 AddressSanitizer 改 ON
  -DGLFW_BUILD_WAYLAND=OFF \
  -DCMAKE_INCLUDE_PATH="/absolute/path/to/_toolchain/root/usr/include;/absolute/path/to/_toolchain/root/usr/include/x86_64-linux-gnu" \
  -DCMAKE_LIBRARY_PATH="/absolute/path/to/_toolchain/root/usr/lib/x86_64-linux-gnu;/absolute/path/to/_toolchain/root/usr/lib/gcc/x86_64-linux-gnu/13"

cmake --build build
```

- output 在 `engine/build/bin/`(`Sandbox`、`EngineTests`、`libEngine.a`、`libglfw3.a`)。
- configure 失敗常見原因:忘了先 `source ../_toolchain/env.sh`(找不到編譯器),或 `CMAKE_INCLUDE_PATH` 未指向 `_toolchain/root`(GLFW 找不到 X11)。
- Release 用 `-DCMAKE_BUILD_TYPE=Release`;需要保留符號與 ASan 時可用 RelWithDebInfo + `-DENGINE_WITH_ASAN=ON`。
- 不需要測試時可加 `-DENGINE_BUILD_TESTS=OFF`。

### 測試

```bash
ctest --test-dir build --output-on-failure
```

`EngineTests` 驗證 EventDispatcher 的型別分派與 `handled`、LayerStack 的排序/攔截/Detach,以及無視窗時 Input 的安全預設值。

## 執行

直接開視窗:

```bash
./build/bin/Sandbox
```

- 標題 `Sandbox - M2`,1280x720。
- 鍵盤、滑鼠按鍵、滾輪、視窗縮放都會印出事件 log;滑鼠移動為 Trace 等級。
- `ESC` 或視窗右上角 X 關閉即結束(log 顯示 `Application run loop end` / `Engine shutdown`,exit 0)。
- `EscapeWatchLayer` 用來驗證 `handled`:正常情況下不應看到 `Escape reached lower layer` 警告。

自動關閉(供驗證/自動化,N 幀後自動 close):

```bash
ENGINE_TEST_FRAMES=15 ./build/bin/Sandbox
```

M2 驗收通過:EngineTests 全數通過;鍵鼠/視窗事件送達 Layer,`handled` 可攔截;Debug 與 Release 皆 exit 0、log 正常、視窗於 WSLg(X11)確實顯示。

## 目前已知限制(未來里程碑處理)

- `NO_API`:尚未建立 GL context,`SwapBuffers()` 為 no-op(M3 引入 GraphicsContext 後生效)。
- VSync 僅記錄旗標,`SetVSync` 尚未呼叫 `glfwSwapInterval`(需 context)。
- 事件目前即時派發,尚未做每幀事件佇列;`Input` 只提供 polling,沒有 pressed/released 邊緣查詢。
- 尚未實作文字輸入(char callback)。

## 目錄結構

```
03/
├─ README.md            # 本檔
├─ 專案架構.md          # 架構設計與里程碑
├─ _toolchain/          # 免安裝工具鏈(.deb 解壓)
│  ├─ env.sh            # 載入環境(PATH / CPATH / LIBRARY_PATH)
│  ├─ bin/              # g++ wrapper、ninja
│  ├─ cmake/            # CMake 3.31
│  └─ root/             # 解壓後的系統標頭與函式庫
└─ engine/              # 引擎專案
   ├─ CMakeLists.txt
   ├─ cmake/            # 編譯警告設定
   ├─ engine/           # Engine 靜態庫(include=公開標頭, src=實作)
   │  ├─ include/engine/
   │  │  ├─ events/     # Event、EventDispatcher、各類事件
   │  │  └─ *.h         # Application、Layer、LayerStack、Input、Window...
   │  └─ src/
   │     ├─ application/ # Application、LayerStack、EntryPoint
   │     ├─ core/        # Log
   │     └─ platform/    # GlfwWindow、Input
   ├─ sandbox/          # Sandbox 執行檔(定義 CreateApplication)
   └─ tests/            # EngineTests
```
