# Electron 메인 프로세스: 메인에서만 가능한 것 · 메인 이벤트

렌더러(웹 페이지)와 달리 **메인 프로세스**는 Node.js 컨텍스트에서 동작하며, DOM이 없고 창·앱·시스템 쪽 API만 사용할 수 있다.

---

## 1. 메인에서만 가능한 것 (Main-only)

| 구분              | 내용                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| **앱 생명주기**   | `app.quit()`, `app.relaunch()`, `app.getPath()`, `app.setPath()`, `app.getName()`, `app.getVersion()` 등 |
| **창 생성·관리**  | `new BrowserWindow()`, `BrowserWindow.getAllWindows()`, `win.close()` / `minimize()` / `maximize()`      |
| **IPC 수신**      | `ipcMain.on()`, `ipcMain.handle()` — 렌더러가 보낸 메시지 처리                                           |
| **네이티브 UI**   | `dialog` (파일 열기/저장, 메시지 박스), `Menu`, `Tray`, `nativeImage`                                    |
| **시스템**        | `shell.openExternal()`, `shell.showItemInFolder()`, `systemPreferences`, `powerMonitor`, `screen`        |
| **글로벌 단축키** | `globalShortcut.register()` / `unregister()`                                                             |
| **프로토콜**      | `protocol.registerFileProtocol()` 등 커스텀 프로토콜                                                     |
| **Node.js**       | `require()`, `process`, `fs`, `path`, `child_process`, 기타 Node 빌트인·네이티브 모듈                    |
| **세션**          | `session` (쿠키, 캐시, 권한 등) — 주로 메인에서 설정                                                     |

**메인에서 불가능한 것:** DOM 접근, `document`/`window`(브라우저 창 객체), DOM 이벤트, 스크린샷(Page.captureScreenshot), DOM 기반 클릭/입력. 이건 렌더러(또는 CDP로 렌더러 타깃)에서만 가능.

---

## 2. 메인에서 사용 가능한 이벤트 (Main process events)

### app (앱 전역)

| 이벤트                      | 설명                                                       |
| --------------------------- | ---------------------------------------------------------- |
| `ready`                     | 앱 초기화 완료, 창 생성 가능                               |
| `window-all-closed`         | 모든 창이 닫혔을 때 (macOS 제외 시 보통 `app.quit()` 호출) |
| `before-quit`               | `quit` 호출 후 실제 종료 전                                |
| `will-quit`                 | 모든 창이 닫힌 뒤 앱이 종료되기 직전                       |
| `quit`                      | 앱 종료 시 (코드로 나가기 직전)                            |
| `open-file`                 | macOS에서 앱이 파일로 열릴 때 (dock 클릭 등)               |
| `open-url`                  | macOS에서 URL로 앱이 열릴 때                               |
| `activate`                  | macOS에서 dock 클릭 등으로 앱이 포커스될 때                |
| `second-instance`           | 두 번째 인스턴스 실행 시 (single-instance 앱)              |
| `certificate-error`         | 인증서 검증 실패 시                                        |
| `select-client-certificate` | 클라이언트 인증서 선택 필요 시                             |

### BrowserWindow (창 인스턴스)

| 이벤트              | 설명                                            |
| ------------------- | ----------------------------------------------- |
| `ready-to-show`     | 렌더러가 첫 프레임을 그릴 준비됨 (창 표시 적기) |
| `closed`            | 창이 닫힌 뒤 (참조 해제 시점)                   |
| `close`             | 창이 닫히기 직전 (취소 가능)                    |
| `focus` / `blur`    | 창 포커스 획득/상실                             |
| `show` / `hide`     | 창 표시/숨김                                    |
| `did-finish-load`   | 페이지 로드 완료 (메인 프레임)                  |
| `did-start-loading` | 로드 시작                                       |
| `session-end`       | Windows에서 세션 종료(로그오프/종료) 전         |

### ipcMain

| 사용 방식                                              | 설명                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `ipcMain.on(channel, (event, ...args) => {})`          | 해당 채널로 렌더러가 보낸 메시지 수신 (비동기)                                           |
| `ipcMain.once(channel, ...)`                           | 한 번만 수신 후 자동 해제                                                                |
| `ipcMain.handle(channel, (event, ...args) => Promise)` | `invoke`로 호출된 요청 처리, Promise 반환                                                |
| 이벤트 객체                                            | `event.sender` (WebContents), `event.reply(channel, ...args)`, `event.returnValue`(동기) |

채널 이름은 앱이 정한 문자열이므로, “메인 전용 이벤트”는 **앱이 `ipcMain.on` / `ipcMain.handle`으로 등록한 채널**이라고 보면 된다.

### 기타 (메인 쪽에서 주로 사용)

- **powerMonitor**: `suspend`, `resume`, `lock-screen`, `unlock-screen`, `on-ac` / `on-battery`
- **session**: `will-download`, `preconnect` 등
- **systemPreferences**: `accent-color-changed`, `color-changed` 등 (OS 테마/색상)

---

## 3. MCP에서 메인 다루기

- **get_electron_process_structure**로 `main` 타깃(노드) id 확인.
- **select_page**에 그 id를 넣어 메인 선택.
- **evaluate_script**로 메인 컨텍스트에서 스크립트 실행 (위 API·이벤트 접근 가능).

스크린샷·클릭·스냅샷은 렌더러 타깃에만 사용하고, 메인에서는 스크립트 실행(상태 조회·앱 제어)만 사용하면 된다.

---

## 4. 메인에서 모니터링 가능한 것 · 리소스·퍼포먼스

### 메인에서 가능한 모니터링 (MCP 도구)

| 구분              | 도구 / 방법                                                               | 비고                                                                                                       |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **콘솔 로그**     | `get_electron_main_console_messages`, `get_electron_main_console_message` | CDP Console. 메인에서 `console.log` 수집.                                                                  |
| **임의 JS 실행**  | `send_command_to_electron` + `args.target: "main"`                        | 메인에서 코드 실행 후 반환값 또는 `console.log`로 확인.                                                    |
| **리소스 사용량** | `get_electron_main_resource_usage`                                        | 메인 프로세스의 `process.memoryUsage()`, `process.cpuUsage()`, `os.loadavg()` 등 반환.                     |
| **CPU 프로파일**  | `start_electron_main_cpu_profile`, `stop_electron_main_cpu_profile`       | CDP Profiler. 메인에서 CPU 프로파일 수집 후 Profile 반환.                                                  |
| **힙 샘플링**     | `start_electron_main_heap_sampling`, `stop_electron_main_heap_sampling`   | CDP HeapProfiler. 메인에서 힙 샘플링 후 SamplingHeapProfile 반환.                                          |
| **네트워크**      | CDP Network **없음**                                                      | 메인(노드) 타겟에는 Network 도메인 없음. 메인에서 직접 `https.get` 등 호출 후 `console.log`로 확인만 가능. |

### 리소스·퍼포먼스 측정

- **리소스 사용량 (메모리, CPU)**: **가능.** `get_electron_main_resource_usage`로 RSS, heapUsed, cpu(user/system), pid, os.loadavg/freemem/totalmem 반환. 또는 `send_command_to_electron`(target: main)으로 `process.memoryUsage()`, `process.cpuUsage()` 직접 실행 가능.
- **CPU 프로파일 (메인)**: **가능.** `start_electron_main_cpu_profile`로 수집 시작 → 작업 수행 → `stop_electron_main_cpu_profile`로 CDP Profile 객체 반환. `samplingIntervalMicroseconds` 옵션 지원.
- **힙 샘플링 (메인)**: **가능.** `start_electron_main_heap_sampling`로 수집 시작 → `stop_electron_main_heap_sampling`으로 CDP SamplingHeapProfile 반환. `samplingInterval`, `stackDepth` 옵션 지원.
- **퍼포먼스 트레이스 (타임라인)**: `performance_start_trace` / `performance_stop_trace`는 **렌더러(페이지) 전용**. 메인 타임라인은 위 CPU/힙 프로파일로 보완.
