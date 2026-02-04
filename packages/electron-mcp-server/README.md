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
