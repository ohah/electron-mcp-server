# electron-mcp-server

MCP (Model Context Protocol) server for Electron app automation via Chrome DevTools Protocol (CDP). Use with Cursor, Claude Desktop, or any MCP client.

**MCP 사용 시 요구사항**

- **Node.js**: MCP 서버 실행에 필요 (npx 또는 전역 설치 시 Node 환경).
- **Electron 원격 디버깅**: 앱을 `--remote-debugging-port=<port>` 로 실행해야 연결 가능. 권장 포트: **9222** (단일 앱), 여러 앱이면 **9229**, **9230** 등 (서버는 9229→9230→9222→… 순으로 스캔).

## License

MIT © [ohah](https://github.com/ohah)

## Usage (Cursor)

1. **Install** (optional if using npx):

   ```bash
   npm install -g @ohah/electron-mcp-server
   ```

   Or use `npx` without installing (see step 2).

2. **Add MCP server in Cursor**
   - Open **Cursor Settings** → **MCP** (or edit `.cursor/mcp.json` in your project).
   - Add:

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

3. **Run your Electron app** with remote debugging:

   ```bash
   electron . --remote-debugging-port=9222
   ```

4. Restart Cursor (or reload MCP). The `electron-mcp` tools will be available when the app is connected.

## Usage (Claude Desktop)

In Claude Desktop config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

Then run your Electron app with `--remote-debugging-port=9222` and restart Claude Desktop.

## Development

- **Tools**: [mise](https://mise.jdx.dev/) (see `.mise.toml`), oxlint/oxfmt for lint and format.
- **Scripts**: `bun run build`, `bun run mcp` (run MCP server), `bun run start` (run example Electron app).
