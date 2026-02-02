# Electron MCP 서버 설계 문서

기본 MCP 서버 세팅과 명령어(Tools) 스펙을 **Chrome DevTools MCP** 레퍼런스에 맞춰 설계한다.
Electron이 MCP 서버 역할을 할 때 `main.ts` 쪽에서 필요한 구조를 정리한다.

---

## 1. 레퍼런스

- **Chrome DevTools MCP**
  https://github.com/ChromeDevTools/chrome-devtools-mcp
  - 도구 목록·파라미터 스펙: [docs/tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)
  - MCP 클라이언트(Cursor, Claude 등) 설정 방법: README
- **MCP 공식**
  https://modelcontextprotocol.io
  - 서버는 Tools / Resources / Prompts 제공
  - 트랜스포트: stdio(로컬 spawn), Streamable HTTP(원격)

이 문서에서는 **Tools** 위주로 하고, 트랜스포트는 **stdio**를 기본으로 한다.

---

## 2. 기본 MCP 서버 세팅

### 2.1 의존성

- `@modelcontextprotocol/sdk` — MCP 서버·트랜스포트·도구 등록
- `zod` — 도구 인자 스키마 검증 (SDK peer dependency)

이미 `packages/electron-mcp-server/package.json`에 포함되어 있으면 추가 설치 불필요.

### 2.2 서버 부트스트랩 (Node 단독 진입점)

MCP 클라이언트가 **프로세스를 spawn**하고 stdin/stdout으로 JSON-RPC 통신한다.

```ts
// 예: src/mcp-server.ts (Node 단독 진입점인 경우)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'electron-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// 도구 등록 (아래 3절 참고)
// server.tool(...)

const transport = new StdioServerTransport();
await server.connect(transport);
```

- **중요**: MCP 메시지는 stdout으로만 보낸다. 로그는 `console.error`(stderr) 또는 파일로만 출력한다.
- 클라이언트 설정 예 (Cursor):

```json
{
  "mcpServers": {
    "electron-mcp": {
      "command": "node",
      "args": ["path/to/dist/mcp-server.js"]
    }
  }
}
```

### 2.3 트랜스포트

| 방식            | 용도                         | 비고                               |
| --------------- | ---------------------------- | ---------------------------------- |
| **stdio**       | Cursor, Claude 등 로컬 spawn | 기본. stdout에 로그 금지.          |
| Streamable HTTP | 원격·헤드리스                | 필요 시 SDK의 해당 트랜스포트 사용 |

---

## 3. 명령어(Tools) 스펙 — Chrome DevTools MCP 기준

Chrome DevTools MCP와 동일한 **도구 이름·파라미터**를 맞추면, 기존 클라이언트/에이전트 문서·스킬을 그대로 참고할 수 있다.
Electron에서는 “페이지”를 **BrowserWindow / WebContents** 단위로 매핑하면 된다.

### 3.1 카테고리별 도구 목록

| 카테고리         | 도구 수 | 대표 도구                                                                                             |
| ---------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| Input automation | 8       | `click`, `fill`, `fill_form`, `hover`, `press_key`, `handle_dialog`, `drag`, `upload_file`            |
| Navigation       | 6       | `list_pages`, `navigate_page`, `new_page`, `select_page`, `close_page`, `wait_for`                    |
| Emulation        | 2       | `emulate`, `resize_page`                                                                              |
| Performance      | 3       | `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`                    |
| Network          | 2       | `list_network_requests`, `get_network_request`                                                        |
| Debugging        | 5       | `take_snapshot`, `take_screenshot`, `evaluate_script`, `list_console_messages`, `get_console_message` |

총 **26개** 도구.
우선 구현 시에는 **Navigation + Debugging + Input** 일부(`click`, `fill`, `take_snapshot`, `take_screenshot`, `evaluate_script`)부터 단계적으로 맞추는 것을 권장한다.

### 3.2 파라미터 스펙 (요약)

Chrome DevTools MCP [tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)와 동일한 이름·타입을 쓰면 된다.

- **공통**
  - `includeSnapshot` (boolean, optional): 응답에 스냅샷 포함 여부
  - 요소 지정: `uid` — a11y 스냅샷에서 내려주는 고유 ID
- **Navigation**
  - `list_pages`: 파라미터 없음
  - `navigate_page`: `url`, `type`(url|back|forward|reload), `timeout`, `handleBeforeUnload`, `ignoreCache`, `initScript`
  - `new_page`: `url`, `background`, `timeout`
  - `select_page`: `pageId`, `bringToFront`
  - `close_page`: `pageId`
  - `wait_for`: `text`, `timeout`
- **Input**
  - `click`: `uid`, `dblClick`, `includeSnapshot`
  - `fill`: `uid`, `value`, `includeSnapshot`
  - `fill_form`: `elements` (array), `includeSnapshot`
  - `hover`: `uid`, `includeSnapshot`
  - `press_key`: `key`, `includeSnapshot`
  - `handle_dialog`: `action` (accept|dismiss), `promptText`
  - `drag`: `from_uid`, `to_uid`, `includeSnapshot`
  - `upload_file`: `filePath`, `uid`, `includeSnapshot`
- **Debugging**
  - `take_snapshot`: `filePath`, `verbose`
  - `take_screenshot`: `filePath`, `format`, `fullPage`, `quality`, `uid`
  - `evaluate_script`: `function` (string), `args` (array)
  - `list_console_messages`: `pageIdx`, `pageSize`, `types`, `includePreservedMessages`
  - `get_console_message`: `msgid`
- **Emulation**
  - `emulate`: `colorScheme`, `viewport`, `userAgent`, `geolocation`, `cpuThrottlingRate`, `networkConditions`
  - `resize_page`: `width`, `height`
- **Performance**
  - `performance_start_trace`: `autoStop`, `reload`, `filePath`
  - `performance_stop_trace`: `filePath`
  - `performance_analyze_insight`: `insightSetId`, `insightName`
- **Network**
  - `list_network_requests`: `pageIdx`, `pageSize`, `resourceTypes`, `includePreservedRequests`
  - `get_network_request`: `reqid`, `requestFilePath`, `responseFilePath`

각 도구는 **Zod 스키마**로 정의하고, `Server#setRequestHandler(ListToolsRequestSchema, ...)` / `ToolsRequestSchema` 등으로 등록하면 된다.
상세 필드명·enum 값은 반드시 Chrome DevTools MCP 도구 레퍼런스와 동일하게 맞출 것.

---

## 4. 아키텍처 옵션: Electron이 MCP 서버 역할을 하는 방식

두 가지 패턴이 있다.

### 4.1 옵션 A: Electron 프로세스가 곧 MCP 서버 (stdio)

- **진입점**: MCP 클라이언트가 **Electron 실행 파일**을 spawn
  예: `electron . --mcp-stdio`
- **main.ts**에서:
  - `process.argv`에 `--mcp-stdio`(또는 `--stdio-mcp`)가 있으면 **창을 띄우지 않고** MCP 서버만 stdio로 기동
  - 없으면 기존처럼 `createWindow()`만 수행 (일반 앱 모드)
- MCP 도구 구현은 **main 프로세스**에서:
  - `BrowserWindow` / `webContents`를 생성·관리하고
  - `list_pages` → 창 목록, `navigate_page` → 선택된 `webContents.loadURL`, `take_snapshot` → CDP 또는 renderer에서 a11y 트리 등
- **장점**: 한 프로세스에서 앱 + MCP. Electron 창을 “페이지”로 노출하는 구조를 직접 제어 가능.
- **단점**: Cursor 설정에서 `command`가 `electron`이고 `args`에 `app path`, `--mcp-stdio` 필요. Electron 경로/버전 관리 필요.

### 4.2 옵션 B: Node 전용 MCP 서버가 Electron에 붙는 방식 (CDP)

- **진입점**: MCP 클라이언트가 **Node 스크립트** spawn
  예: `node dist/mcp-server.js`
- Electron 앱은 **별도**로 실행하고, `--remote-debugging-port=9222` 등으로 CDP를 연다.
- `mcp-server.js`는 Puppeteer/Playwright 등으로 `http://127.0.0.1:9222`에 붙어서 페이지 제어·스냅샷·스크린샷 등을 수행 (Chrome DevTools MCP와 유사).
- **장점**: Chrome DevTools MCP와 거의 동일한 사용 방식. 기존 레퍼런스·문서 재사용 용이.
- **단점**: Electron 앱을 반드시 디버깅 포트로 먼저 띄워야 함. 두 프로세스 구성.

---

## 5. main.ts 쪽에서 해야 할 일 (옵션 A 기준)

Electron이 **직접** MCP 서버 역할을 하려면 **옵션 A**를 사용할 때 아래를 적용하면 된다.

### 5.1 진입점 분기

- `main.ts` 최상단 또는 `app.whenReady()` 직후에:
  - `process.argv.includes('--mcp-stdio')`(또는 `--stdio-mcp`)이면 **MCP 전용 모드**로 진입
  - 아니면 기존처럼 `createWindow()`만 호출

```ts
// main.ts (개념)
import { app, BrowserWindow } from 'electron';

const isMcpMode = process.argv.includes('--mcp-stdio');

app.whenReady().then(async () => {
  if (isMcpMode) {
    await runMcpServer();
    // 필요 시 최소한의 창을 띄우거나, 아무 창도 띄우지 않음
  } else {
    createWindow();
    // ... 기존 window-all-closed, activate
  }
});
```

### 5.2 MCP 서버 기동 (main 프로세스 내)

- `runMcpServer()` 안에서:
  - `@modelcontextprotocol/sdk`의 `Server` + `StdioServerTransport` 생성
  - **한 번만** `server.connect(transport)` 호출
  - 도구 핸들러 등록 시 **현재 선택된 BrowserWindow / WebContents**를 추적하는 상태를 두고, `list_pages` → 해당 창 목록, `navigate_page` → 선택된 `webContents.loadURL(...)` 등으로 구현

### 5.3 창/페이지 상태 관리

- **페이지** = Electron의 `BrowserWindow`(또는 `webContents`)로 매핑
- `list_pages`: `BrowserWindow.getAllWindows()` 등으로 목록 반환 (id, title, url 등)
- `select_page`: 전역으로 “현재 선택된 window” 저장
- `navigate_page`, `take_snapshot`, `take_screenshot`, `evaluate_script` 등은 모두 “선택된 window”의 `webContents` 사용

### 5.4 스냅샷/스크린샷/콘솔

- **take_snapshot**:
  선택된 `webContents`에 대해 CDP(Chrome DevTools Protocol)로 a11y 트리 수집하거나, renderer에 스크립트를 주입해 DOM·a11y 정보를 JSON으로 반환하게 한 뒤 그 결과를 MCP 응답으로 전달.
  Chrome DevTools MCP의 `take_snapshot`와 같은 형식(uid 부여)으로 맞추면 좋다.
- **take_screenshot**:
  `webContents.capturePage()` 또는 CDP `Page.captureScreenshot` 사용.
- **list_console_messages / get_console_message**:
  `webContents`의 `console-message` 이벤트를 버퍼링하거나, CDP 로그 수집과 연동.

### 5.5 주의사항

- **stdout 사용 금지**: MCP가 stdio를 쓰므로, `console.log` 대신 `console.error` 또는 파일 로깅만 사용.
- **앱 종료**: MCP 전용 모드에서는 창을 안 띄우면 `window-all-closed`로 자동 종료되지 않을 수 있으므로, 클라이언트가 프로세스를 종료할 때까지 대기하거나, MCP 세션 종료 시 `app.quit()` 호출 정책을 정한다.
- **비동기**: 모든 도구 핸들러는 `async`로 구현하고, `webContents` API·CDP 호출은 Promise 기반으로 처리.

---

## 6. 구현 순서 제안

1. **기본 MCP 서버 뼈대**
   - 옵션 A: `main.ts`에 `--mcp-stdio` 분기 + `runMcpServer()` (Server + StdioServerTransport).
   - 옵션 B: `src/mcp-server.ts` 단독 진입점, `node dist/mcp-server.js`로 실행.
2. **Chrome DevTools MCP와 동일한 도구 이름·스키마**로 1~2개 도구만 등록 (예: `list_pages`, `take_snapshot`).
3. **Electron 쪽 구현**
   - `list_pages`: `BrowserWindow.getAllWindows()` 매핑
   - `take_snapshot`: 선택된 `webContents` + CDP 또는 renderer 스크립트
4. 나머지 도구를 카테고리별로 단계 추가 (Navigation → Input → Debugging → Performance/Network 등).

---

## 7. Cursor 설정 예시

- **옵션 A** (Electron이 MCP 서버인 경우):

```json
{
  "mcpServers": {
    "electron-mcp": {
      "command": "node_modules/.bin/electron",
      "args": ["packages/electron-mcp-server/dist/main.js", "--mcp-stdio"]
    }
  }
}
```

또는 프로젝트 루트에서:

```json
{
  "mcpServers": {
    "electron-mcp": {
      "command": "bun",
      "args": ["run", "--cwd", "packages/electron-mcp-server", "start:mcp"]
    }
  }
}
```

(`package.json`에 `"start:mcp": "electron . --mcp-stdio"` 스크립트 추가 후 사용.)

(실제 경로는 프로젝트 루트 기준으로 조정.)

- **옵션 B** (Node MCP 서버가 Electron에 CDP로 붙는 경우):

```json
{
  "mcpServers": {
    "electron-mcp": {
      "command": "node",
      "args": ["packages/electron-mcp-server/dist/mcp-server.js"],
      "env": { "ELECTRON_DEBUG_URL": "http://127.0.0.1:9222" }
    }
  }
}
```

Electron 앱은 `--remote-debugging-port=9222`로 미리 실행해 두어야 한다.

---

---

## 8. main.ts 구조 스케치 (옵션 A)

아래는 옵션 A일 때 `main.ts`에 들어갈 최소 구조다. 실제 도구 등록·핸들러는 별도 모듈(예: `mcp-tools.ts`)로 분리하는 것을 권장한다.

```ts
// main.ts (스케치)
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const MCP_FLAG = '--mcp-stdio';
let selectedWindowId: number | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html')).catch((err) => {
    console.error('loadFile failed:', err);
  });
}

async function runMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'electron-mcp-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // 도구 등록: list_pages, take_snapshot, navigate_page 등
  // server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...] });
  // server.setRequestHandler(CallToolRequestSchema, async (req) => {
  //   switch (req.params.name) {
  //     case "list_pages":
  //       return { content: [...] };  // BrowserWindow.getAllWindows() 매핑
  //     case "navigate_page":
  //       const win = getSelectedWindow();
  //       if (win?.webContents) win.webContents.loadURL(url);
  //       ...
  //   }
  // });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function getSelectedWindow(): BrowserWindow | null {
  if (selectedWindowId == null) return BrowserWindow.getAllWindows()[0] ?? null;
  return BrowserWindow.getAllWindows().find((w) => w.id === selectedWindowId) ?? null;
}

app.whenReady().then(async () => {
  if (process.argv.includes(MCP_FLAG)) {
    await runMcpServer();
    // 필요 시 여기서 최소 창 하나 생성하거나, 클라이언트가 도구로 창 생성
  } else {
    createWindow();
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }
});
```

- `selectedWindowId`는 `select_page` 도구에서 갱신한다.
- `list_pages`는 `BrowserWindow.getAllWindows()`를 순회해 `{ id, title, url }` 형태로 반환하면 된다.
- 상세 도구 스키마·핸들러는 `docs/tool-reference.md`(Chrome DevTools MCP)와 동일한 이름·파라미터로 맞춰 구현한다.

---

이 문서를 기준으로 **기본 MCP 서버 세팅**과 **Chrome DevTools MCP 스펙에 맞는 명령어 설계**, 그리고 **main.ts에서의 진입점 분기·MCP 기동·창 매핑**을 진행하면 된다.
