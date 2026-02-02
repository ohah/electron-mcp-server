# Chrome DevTools MCP 서버 기능 지원 로드맵

레퍼런스: [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
electron-mcp-server에서 **Electron 앱(CDP)** 대상으로 동일/유사 기능을 모두 지원할 예정입니다.

## 입력·자동화 (Input automation) — 8개

- [ ] `click` — 요소 클릭 (uid 기준)
- [ ] `drag` — 요소 드래그 앤 드롭 (from_uid → to_uid)
- [ ] `fill` — 입력/텍스트 영역에 입력, select 옵션 선택
- [ ] `fill_form` — 여러 폼 필드 한 번에 채우기
- [ ] `handle_dialog` — 브라우저 다이얼로그(alert/confirm/prompt) 처리
- [ ] `hover` — 요소 위에 마우스 호버
- [ ] `press_key` — 키/키 조합 입력 (단축키, 내비게이션 키 등)
- [ ] `upload_file` — 파일 입력 요소로 파일 업로드

## 내비게이션 (Navigation automation) — 6개

- [ ] `close_page` — 페이지 인덱스로 탭/페이지 닫기
- [ ] `list_pages` — 열린 페이지 목록 조회
- [ ] `navigate_page` — URL 이동 / 뒤로·앞으로 / 새로고침
- [ ] `new_page` — 새 페이지(탭) 열기
- [ ] `select_page` — 이후 도구 호출의 컨텍스트가 될 페이지 선택
- [ ] `wait_for` — 지정 텍스트가 나올 때까지 대기

## 에뮬레이션 (Emulation) — 2개

- [ ] `emulate` — 다크/라이트 모드, CPU 스로틀, 지리 위치, 네트워크 조건, User-Agent, 뷰포트 등 에뮬레이션
- [ ] `resize_page` — 페이지(창) 크기 변경

## 성능 (Performance) — 3개

- [ ] `performance_analyze_insight` — 트레이스 결과의 특정 인사이트 상세 분석
- [ ] `performance_start_trace` — 성능 트레이스 녹화 시작 (CWV 등)
- [ ] `performance_stop_trace` — 성능 트레이스 녹화 중지

## 네트워크 (Network) — 2개

- [ ] `get_network_request` — 특정 네트워크 요청 상세 조회
- [ ] `list_network_requests` — 현재 페이지의 네트워크 요청 목록

## 디버깅 (Debugging) — 5개

- [ ] `evaluate_script` — 페이지 컨텍스트에서 JavaScript 실행
- [ ] `get_console_message` — 콘솔 메시지 ID로 단건 조회
- [ ] `list_console_messages` — 콘솔 메시지 목록
- [ ] `take_screenshot` — 페이지/요소 스크린샷 (이미 구현됨: `take_screenshot`)
- [ ] `take_snapshot` — a11y 트리 기반 페이지 텍스트 스냅샷(uid 부여)

---

**참고**: [Chrome DevTools MCP Tool Reference]
