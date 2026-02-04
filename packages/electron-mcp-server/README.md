# @ohah/electron-mcp-server

MCP server (Node bin) for Electron app automation via CDP. Use with any Electron app running `--remote-debugging-port=9222`.

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

An Electron app must be running with remote debugging:

```bash
electron . --remote-debugging-port=9222
```

Then MCP tools can control it via Chrome DevTools Protocol.

## MCP clients

Cursor (`.cursor/mcp.json`) is shown above; the same `command`/`args` work in other MCP clients (e.g. Claude Desktop). This server exposes tools for Electron automation (CDP): list pages, take snapshot/screenshot, click, fill, navigate, console/network inspection, performance trace, etc. See the [repository README](https://github.com/ohah/electron-mcp-server) for development and tool details.
