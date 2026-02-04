# @ohah/electron-mcp-server

MCP server (Node bin) for Electron app automation via CDP. Use with any Electron app running `--remote-debugging-port=<port>`.

**MCP 사용 시 요구사항**

- **Node.js**: MCP 서버 실행에 필요 (npx 또는 전역 설치 시 Node 환경).
- **원격 디버깅 포트**: 앱 실행 시 `--remote-debugging-port=<port>` 필수. 권장 포트 **9222** (단일 앱), 여러 앱이면 **9229**, **9230** (서버는 9229→9230→9222→… 순 스캔).

## Install

```bash
npm install -g @ohah/electron-mcp-server
# or
npx -y @ohah/electron-mcp-server
```

## Cursor

In `.cursor/mcp.json`:

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

## Requirement

- **Node.js**: required to run this MCP server (e.g. `npx` or global install).
- **Electron**: run your app with remote debugging. Recommended port **9222** (single app); for multiple apps use **9229**, **9230** (server scans 9229→9230→9222→…).

```bash
electron . --remote-debugging-port=9222
```

Then MCP tools can control it via Chrome DevTools Protocol.

## MCP clients

Cursor (`.cursor/mcp.json`) is shown above; the same `command`/`args` work in other MCP clients (e.g. Claude Desktop). This server exposes tools for Electron automation (CDP): list pages, take snapshot/screenshot, click, fill, navigate, console/network inspection, performance trace, etc. See the [repository README](https://github.com/ohah/electron-mcp-server) for development and tool details.
