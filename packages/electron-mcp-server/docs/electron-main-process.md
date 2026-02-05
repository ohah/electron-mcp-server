# Electron 메인 프로세스: 메인 전용 기능 · 모니터링

렌더러와 달리 **메인 프로세스**는 Node.js 컨텍스트에서 동작하며, DOM 없이 창·앱·시스템 API만 사용 가능.

---

## 1. 메인에서만 가능한 것

| 구분          | 내용                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| 앱 생명주기   | `app.quit()`, `app.relaunch()`, `app.getPath()`, `app.getName()` 등      |
| 창·UI         | `BrowserWindow`, `dialog`, `Menu`, `Tray`, `nativeImage`                 |
| IPC 수신      | `ipcMain.on()`, `ipcMain.handle()`                                       |
| 시스템        | `shell`, `systemPreferences`, `powerMonitor`, `screen`, `globalShortcut` |
| 프로토콜·Node | `protocol.register*`, `require()`, `process`, `fs`, `child_process` 등   |

**메인에서 불가:** DOM, 스크린샷, DOM 기반 클릭/입력 → 렌더러(CDP) 전용.

---

## 2. 메인 이벤트 (요약)

- **app**: `ready`, `window-all-closed`, `before-quit`, `will-quit`, `quit`, `activate`, `open-file`, `open-url`, `second-instance`, `certificate-error` 등
- **BrowserWindow**: `ready-to-show`, `closed`, `close`, `focus`/`blur`, `show`/`hide`, `did-finish-load`, `did-start-loading`
- **ipcMain**: `ipcMain.on(channel, ...)`, `ipcMain.handle(channel, ...)` — 채널은 앱이 정의
- **기타**: powerMonitor(`suspend`/`resume`), session(`will-download` 등)

---

## 3. MCP에서 메인 다루기

- **get_electron_process_structure**로 main 타깃 id 확인 → **select_page**로 메인 선택.
- **evaluate_script**로 메인에서 스크립트 실행(상태 조회·앱 제어). 스크린샷·클릭·스냅샷은 렌더러 전용.

---

## 4. 메인 모니터링 (MCP 도구)

| 구분          | 도구                                                                     | 비고                                                            |
| ------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 콘솔 로그     | `list_console_messages`(targetType: main), `get_console_message`         | CDP Console, 서버 메모리 저장, targetType 포함                  |
| 임의 JS 실행  | `send_command_to_electron` + `args.target: "main"`                       | 반환값 또는 console로 확인                                      |
| 리소스 사용량 | `get_electron_main_resource_usage`                                       | memoryUsage, cpuUsage, os.loadavg 등                            |
| CPU 프로파일  | `start_electron_main_cpu_profile` / `stop_electron_main_cpu_profile`     | CDP Profiler                                                    |
| 힙 샘플링     | `start_electron_main_heap_sampling` / `stop_electron_main_heap_sampling` | CDP HeapProfiler                                                |
| 네트워크      | `list_network_requests`(targetType: main), `get_network_request`         | 렌더러는 CDP, 메인은 래핑(§6). 통합 목록·상세, targetType 포함. |

콘솔·리소스는 이벤트가 서버로 오므로 앱 부담 없음. 퍼포먼스 트레이스(`performance_*_trace`)는 렌더러 전용.

---

## 5. IPC 모니터링

CDP에 IPC 도메인 없음. **메인에서 `ipcMain.on`/`handle` 래핑**하면 앱 수정 없이 수신 가로채기 가능.

- **방식**: 주입 스크립트로 `ipcMain` 원본 대체, 새로 등록되는 콜백만 감싸서 수신 시 **버퍼에 push** → 별도 호출로 버퍼 조회. (예: `global.__ipcMonitorBuffer`.)
- **주의**: MCP 연결 **이후** 등록되는 핸들러만 래핑됨.
- **데이터 관리**: 이력은 **서버 메모리**에만 두고, list 호출 시 앱 버퍼를 서버로 가져온 뒤 앱 버퍼 비우기.

---

## 6. 메인 프로세스 HTTP/네트워크 감지

CDP Network는 **렌더러 전용**. 메인에서 나가는 요청은 **Node `http.request`/`https.request` 래핑**으로 감지 가능(get/post/put/delete·axios·fetch 등 모두 커버).

- **구현**: 주입으로 `http.request`·`https.request` 대체, 호출 시 method/url/headers 등을 **버퍼에 push** → 별도 호출로 버퍼 조회. Node 18+ `fetch`는 `globalThis.fetch` 래핑.
- **데이터 관리**: IPC와 동일. 이력은 **서버 메모리**에만 쌓고, `list_network_requests` 호출 시 앱 버퍼를 서버로 가져온 뒤 비우기. 목록·상세는 `list_network_requests` / `get_network_request`로 통합 제공.
