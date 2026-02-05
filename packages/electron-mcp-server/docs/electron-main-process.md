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

| 구분              | 도구 / 방법                                                               | 비고                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **콘솔 로그**     | `get_electron_main_console_messages`, `get_electron_main_console_message` | CDP Console. 메인에서 `console.log` 수집. **이벤트가 서버로 오므로 서버 메모리에 저장**됨(렌더러 콘솔과 동일). 앱 부담 없음. |
| **임의 JS 실행**  | `send_command_to_electron` + `args.target: "main"`                        | 메인에서 코드 실행 후 반환값 또는 `console.log`로 확인.                                                                      |
| **리소스 사용량** | `get_electron_main_resource_usage`                                        | 메인 프로세스의 `process.memoryUsage()`, `process.cpuUsage()`, `os.loadavg()` 등 반환.                                       |
| **CPU 프로파일**  | `start_electron_main_cpu_profile`, `stop_electron_main_cpu_profile`       | CDP Profiler. 메인에서 CPU 프로파일 수집 후 Profile 반환.                                                                    |
| **힙 샘플링**     | `start_electron_main_heap_sampling`, `stop_electron_main_heap_sampling`   | CDP HeapProfiler. 메인에서 힙 샘플링 후 SamplingHeapProfile 반환.                                                            |
| **네트워크**      | CDP Network **없음**                                                      | 메인(노드) 타겟에는 Network 도메인 없음. 메인에서 직접 `https.get` 등 호출 후 `console.log`로 확인만 가능.                   |

### 리소스·퍼포먼스 측정

- **콘솔 (메인/렌더러)**: CDP `Console.enable` 후 `Console.messageAdded` 이벤트가 서버(WebSocket)로 전달되며, **서버 메모리**(`byMsgId`, `navigationBuckets`)에 저장된다. 메인 콘솔도 렌더러와 동일하게 서버에만 쌓이므로 앱 부담 없다.
- **리소스 사용량 (메모리, CPU)**: **가능.** `get_electron_main_resource_usage`로 RSS, heapUsed, cpu(user/system), pid, os.loadavg/freemem/totalmem 반환. 또는 `send_command_to_electron`(target: main)으로 `process.memoryUsage()`, `process.cpuUsage()` 직접 실행 가능.
- **CPU 프로파일 (메인)**: **가능.** `start_electron_main_cpu_profile`로 수집 시작 → 작업 수행 → `stop_electron_main_cpu_profile`로 CDP Profile 객체 반환. `samplingIntervalMicroseconds` 옵션 지원.
- **힙 샘플링 (메인)**: **가능.** `start_electron_main_heap_sampling`로 수집 시작 → `stop_electron_main_heap_sampling`으로 CDP SamplingHeapProfile 반환. `samplingInterval`, `stackDepth` 옵션 지원.
- **퍼포먼스 트레이스 (타임라인)**: `performance_start_trace` / `performance_stop_trace`는 **렌더러(페이지) 전용**. 메인 타임라인은 위 CPU/힙 프로파일로 보완.

---

## 5. IPC 모니터링

CDP에는 IPC 채널 도메인이 없지만, **메인 프로세스에서 `ipcMain`을 래핑(bind)** 하면 앱 코드 수정 없이 수신 메시지를 가로챌 수 있다.

### 래핑 방식 (앱 수정 불필요)

MCP가 `send_command_to_electron`(target: main)으로 메인에 스크립트를 주입해, `ipcMain.on` / `ipcMain.handle`을 원본으로 대체해 두고 **새로 등록되는** 콜백만 감싸면 된다. 수신 시 채널·인자를 **콘솔이 아니라 메인 프로세스 쪽 버퍼(배열/객체)**에 push 해 두고, 별도 호출로 그 버퍼를 읽어오면 된다. 즉, `console.log`로 감지할 필요는 없고, **메인에 두는 버퍼만 조회**하면 된다.

- **구현 예**: 첫 주입에서 `global.__ipcMonitorBuffer = []` 같은 전역을 만들고, 래핑된 핸들러에서 `global.__ipcMonitorBuffer.push({ channel, args, time: Date.now() })` 후 원래 리스너 호출. 이후 `send_command_to_electron`으로 `JSON.stringify(global.__ipcMonitorBuffer)` 를 실행해 반환받으면 IPC 수신 이력을 콘솔 없이 가져올 수 있다.
- **주의**: MCP 연결 **이후**에 앱이 등록하는 핸들러만 래핑된다. 앱 초기화 시점에 이미 `ipcMain.on(...)` 한 채널은 래핑되지 않는다.
- **렌더러 → 메인** 수신: 위처럼 메인에서 `ipcMain` 래핑 + 버퍼에 push로 처리. **메인 → 렌더러** 회신은 `event.reply` 호출을 래핑한 핸들러 안에서 버퍼에 같이 넣으면 된다.

전용 “IPC 모니터” 도구: (1) 메인 주입으로 `ipcMain.on`/`handle` 래핑 + 버퍼에 push, (2) 조회 시 앱 버퍼를 서버로 가져와 **서버 저장소에 반영** 후 list(·get) API로 제공. 로드맵은 이슈 #16 “향후 검토” 참고.

### IPC 데이터의 전송·관리 — 렌더러처럼 서버 메모리만, 앱 부담 최소

콘솔·네트워크처럼 **이력은 전부 서버 메모리에 두고**, 앱(메인)에는 부담을 주지 않는 것이 좋다. 렌더러는 CDP가 이벤트를 서버로 푸시하지만, 메인에는 그런 채널이 없어서 **일단 앱 쪽 임시 버퍼에만 적어 두고**, list 호출 시 **서버로 가져온 뒤 앱 버퍼는 곧바로 비운다**. 이렇게 하면 이력은 서버에만 쌓이고, 앱에는 “마지막 조회 이후 분량”만 잠깐 남는다.

- **수집**: 메인 래핑 시 `global.__ipcMonitorBuffer`에 이벤트를 push. (앱 버퍼는 **임시** 수집용.)
- **서버 저장소**: `list_electron_main_ipc_events` 호출 시 서버가 앱 버퍼를 가져와 **서버 메모리**에 반영한 뒤, **같은 호출 안에서 앱 버퍼를 비운다**(`global.__ipcMonitorBuffer.length = 0`). list(·get)는 항상 **서버 저장소만** 본다. → 이력은 서버에만 있고, 앱 부담 최소.

### 버퍼 vs 콘솔 — 어느 쪽이 더 효율적인가

|            | 버퍼                                                                                    | 콘솔                                                                                     |
| ---------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **데이터** | 구조화된 객체 배열(`{ channel, args, time }`). 조회 시 `JSON.stringify` 한 번으로 반환. | 문자열 로그. `get_electron_main_console_messages`로 가져온 뒤 `[IPC]` 등 형식 파싱 필요. |
| **혼선**   | IPC 이벤트만 담음.                                                                      | 앱의 다른 `console.log`와 섞임. IPC만 쓰려면 필터/파싱 필요.                             |
| **메모리** | IPC 이벤트만 쌓음. 필요 시 `maxLength`·`clear`로 제한 가능.                             | 콘솔 메시지 전체가 쌓여서, IPC 전용으로 쓰기엔 비효율적일 수 있음.                       |
| **구현**   | 래핑 + push 한 번, 조회 시 버퍼 반환만 하면 됨.                                         | 로그 형식 규약과 클라이언트 쪽 파싱 로직 필요.                                           |

**정리**: IPC 전용 도구를 만든다면 **버퍼 방식이 더 효율적**이다. 콘솔은 “이미 있는 도구만 써서 빠르게 확인”할 때의 대안으로 두면 된다.

### 앱에서 로깅하는 방법 (대안)

앱이 직접 `ipcMain.on(..., (event, ...args) => { console.log('[IPC]', channel, args); ... })` 처럼 로깅을 넣어도 되고, 그러면 `get_electron_main_console_messages`로 동일하게 확인 가능하다.

---

## 6. 메인 프로세스 HTTP/네트워크 감지

CDP Network 도메인은 **렌더러(페이지)** 타겟에만 있고, 메인(노드) 타겟에는 없어서 메인에서 나가는 요청은 기본으로는 안 잡힌다. 하지만 **Node의 `http.request` / `https.request`를 래핑**하면 메인에서 나가는 **모든 HTTP 요청**(`http.get`, `https.get`, `post`, `put`, `delete` 등)을 감지할 수 있다.

- Node에서 `http.get`·`https.get`은 내부적으로 `request`를 부르고, `post`/`put` 등도 옵션에 `method`만 넣어 `request`를 쓰므로, **`http.request`와 `https.request` 두 개만 래핑**하면 get/post/put/delete 전부 커버된다.
- axios, node-fetch, `fetch`(Node 18+) 등도 결국 `http`/`https` 모듈 또는 `fetch`를 쓰므로, **메인에서 `require('http')`·`require('https')`의 `request`를 한 번만 래핑**해 두면, 그 이후에 앱이나 의존성이 호출하는 요청은 모두 가로챌 수 있다.
- **구현**: MCP 주입 스크립트에서 `const http = require('http'); const https = require('https');` 한 뒤, `http.request`·`https.request`를 원본으로 대체하고, 호출 시 `method`, `url`(또는 `options.host`+`path`), `headers` 등을 버퍼에 push한 다음 원본을 호출. 응답 상태를 쓰려면 반환된 ClientRequest에 `response` 이벤트를 한 번 걸어서 `statusCode` 등을 버퍼에 넣으면 된다. IPC처럼 **버퍼에만 쌓고, 별도 호출로 버퍼 조회**하면 되고 콘솔은 필요 없다.
- Node 18+ 메인에서 `globalThis.fetch`를 쓰는 경우는, 같은 방식으로 `globalThis.fetch`를 래핑하면 된다.

정리하면, **메인의 모든 네트워크 요청**(http.get/post/put + https + fetch) 감지는 **가능**하고, IPC 모니터와 마찬가지로 **주입 래핑 + 버퍼 조회**로 구현할 수 있다.

### 메인 네트워크 데이터의 전송·관리 — 렌더러와 동일한 방식 권장

렌더러(페이지) 네트워크는 MCP 서버가 CDP `Network.*` 이벤트를 받아 **서버 메모리**에 상시 저장하고, `list_network_requests` / `get_network_request(requestId)` 로 목록·상세를 제공한다. 메인 프로세스 네트워크도 **같은 패턴(서버 저장소 + list/get API)** 으로 관리하는 것이 API 일관성과 사용자 경험 측면에서 좋다.

**원칙**: 렌더러처럼 **이력은 전부 서버 메모리**에만 쌓고, 앱에는 부담을 주지 않는다. list 호출 시 앱 버퍼를 서버로 가져온 뒤 **같은 호출 안에서 앱 버퍼를 비운다**.

- **수집**: 메인 래핑 시 `global.__httpMonitorBuffer`에 요청/응답 정보를 push. (앱 버퍼는 **임시** 수집용.)
- **서버 저장소**: `list_electron_main_network_requests` 호출 시 서버가 앱 버퍼를 가져와 **서버 메모리**(예: `byRequestId` Map)에 반영한 뒤, **앱 버퍼를 비운다**(`global.__httpMonitorBuffer.length = 0`). list/get은 항상 **서버 저장소만** 본다. → 이력은 서버에만 있고, 앱 부담 최소.
