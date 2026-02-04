# electron-mcp-server

MCP (Model Context Protocol) server for Electron app automation via Chrome DevTools Protocol (CDP). Use with Cursor, Claude Desktop, or any MCP client. Your Electron app must run with `--remote-debugging-port=9222`.

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
