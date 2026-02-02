# MCP 서버 사용법

이 패키지(`electron-mcp-server`)는 **MCP 서버(Node bin)만** 포함합니다.  
Electron 앱은 포함하지 않으며, 레퍼런스(halilural/electron-mcp-server)와 동일하게 **어떤 Electron 앱**이든 `--remote-debugging-port=9222`로 실행 중이면 CDP로 제어할 수 있습니다.  
예제 Electron 앱은 **`examples/electron-mcp-demo`** 에 있습니다.

배포 후와 동일하게 **npx**로 실행할 수 있고, 로컬에서는 링크 없이도 쓸 수 있습니다.

## Cursor 설정 (`.cursor/mcp.json`)

### 1) npx (배포 형태와 동일)

```json
{
  "mcpServers": {
    "electron-mcp": {
      "command": "npx",
      "args": ["-y", "electron-mcp-server"]
    }
  }
}
```

**로컬에서 npx가 이 패키지를 쓰게 하는 방법 (택 1)**

- **워크스페이스**  
  이 레포는 루트에 `workspaces: ["packages/*"]`가 있으므로, 루트에서 `bun install` 한 뒤 패키지에서 한 번만 `bun run build` 하면, **별도 링크 없이** `npx -y electron-mcp-server`가 이 패키지를 사용합니다.

- **tgz로 설치**  
  패키지 디렉터리에서:

  ```bash
  bun run build
  bun pack
  ```

  생성된 `electron-mcp-server-1.0.0.tgz`를 쓰고 싶은 곳(다른 프로젝트 또는 전역)에서:

  ```bash
  bun install /path/to/electron-mcp-server-1.0.0.tgz
  ```

  이후 그곳에서 `npx electron-mcp-server` 사용.

- **전역 링크**  
  이 패키지에서 `bun link` 한 뒤, 아무 디렉터리에서나 `npx electron-mcp-server` 사용.

### 2) 경로로 직접 실행 (npx/tgz/링크 없이)

```json
{
  "mcpServers": {
    "electron-mcp": {
      "command": "node",
      "args": ["packages/electron-mcp-server/dist/index.js"]
    }
  }
}
```

- Cursor를 **이 레포 루트**에서 연 상태여야 합니다.
- 한 번은 패키지에서 `bun run build` (또는 루트에서 `bun run build`)로 `dist/index.js`를 만들어 두어야 합니다.
- 링크·tgz·워크스페이스 설치 없이, 위 설정만으로 동작합니다.

## Electron 앱

MCP 도구가 동작하려면 **Electron 앱이 `--remote-debugging-port=9222`로 떠 있어야** 합니다.  
**예제 Electron 앱**은 `examples/electron-mcp-demo`입니다.  
루트에서 `bun run start`(또는 `bun run --filter electron-mcp-demo start`)로 예제 앱을 실행한 뒤 MCP를 사용하면 됩니다.  
자신의 Electron 앱을 쓰려면 해당 앱에서 `--remote-debugging-port=9222`만 켜면 됩니다.
