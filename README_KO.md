# electron-mcp-server

Chrome DevTools Protocol(CDP)로 Electron 앱 자동화를 위한 MCP(Model Context Protocol) 서버. Cursor, Claude Desktop 등 MCP 클라이언트에서 사용할 수 있습니다. Electron 앱은 `--remote-debugging-port=9222` 로 실행해야 합니다.

## 라이선스

MIT © [ohah](https://github.com/ohah)

## 사용법 (Cursor)

1. **설치** (npx 사용 시 생략 가능):

   ```bash
   npm install -g @ohah/electron-mcp-server
   ```

2. **Cursor에 MCP 서버 추가**
   - **Cursor 설정** → **MCP** 이동 (또는 프로젝트의 `.cursor/mcp.json` 편집).
   - 다음 내용 추가:

   ```json
   {
     "mcpServers": {
       "electron-mcp": {
         "command": "npx",
         "args": ["-y", "@ohah/electron-mcp-server"]
       }
     }
   }
   ```

3. **Electron 앱을 원격 디버깅으로 실행**:

   ```bash
   electron . --remote-debugging-port=9222
   ```

4. Cursor를 재시작(또는 MCP 새로고침)하면 앱이 연결된 상태에서 `electron-mcp` 도구를 사용할 수 있습니다.

## 사용법 (Claude Desktop)

Claude Desktop 설정 파일(macOS 예: `~/Library/Application Support/Claude/claude_desktop_config.json`)에 다음을 추가합니다.

```json
{
  "mcpServers": {
    "electron-mcp": {
      "command": "npx",
      "args": ["-y", "@ohah/electron-mcp-server"]
    }
  }
}
```

Electron 앱을 `--remote-debugging-port=9222` 로 실행한 뒤 Claude Desktop을 재시작하면 됩니다.

## 개발

- **도구**: [mise](https://mise.jdx.dev/) (`.mise.toml` 참고), 린트·포맷은 oxlint/oxfmt.
- **스크립트**: `bun run build`, `bun run mcp` (MCP 서버 실행), `bun run start` (예제 Electron 앱 실행).
