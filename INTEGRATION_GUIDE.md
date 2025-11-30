# Integration Guide for Language MCP Server

This guide shows how to integrate the Language MCP Server with various AI tools that support the Model Context Protocol (MCP).

## 🎯 Quick Integration Summary

**Server Location**: `/home/vikasavn/language-mcp/build/index.js`
**Node.js Required**: 18+ (use nvm to switch: `nvm use 18`)
**Protocol**: Model Context Protocol (MCP) via stdio

---

## 1. Claude Desktop Integration

### Configuration

Add this to your Claude Desktop configuration file:

**Linux**: `~/.config/Claude/claude_desktop_config.json`
**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "language-analyzer": {
      "command": "bash",
      "args": [
        "-c",
        "source ~/.nvm/nvm.sh && nvm use 18 && node /home/vikasavn/language-mcp/build/index.js"
      ]
    }
  }
}
```

**Note**: The bash wrapper ensures Node 18 is loaded via nvm.

### Alternative Configuration (if nvm is in PATH)

```json
{
  "mcpServers": {
    "language-analyzer": {
      "command": "/home/vikasavn/.nvm/versions/node/v18.20.8/bin/node",
      "args": ["/home/vikasavn/language-mcp/build/index.js"]
    }
  }
}
```

### Steps to Enable

1. **Create/Edit the config file**:
   ```bash
   mkdir -p ~/.config/Claude
   nano ~/.config/Claude/claude_desktop_config.json
   ```

2. **Paste the configuration** above

3. **Restart Claude Desktop** completely (quit and reopen)

4. **Verify** by asking Claude:
   - "What MCP tools do you have access to?"
   - You should see 18 language analysis tools

### Testing

Ask Claude questions like:
- "Find all functions in /home/vikasavn/language-mcp/examples/go-sample"
- "What tests exist in /home/vikasavn/language-mcp/examples/python-sample?"
- "Run the Python tests in examples/python-sample"

---

## 2. Cline (VS Code Extension) Integration

Cline is a VS Code extension that supports MCP servers.

### Configuration

1. **Install Cline** from VS Code marketplace

2. **Open Cline Settings** (JSON):
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Preferences: Open User Settings (JSON)"

3. **Add MCP Server Configuration**:

```json
{
  "cline.mcpServers": {
    "language-analyzer": {
      "command": "bash",
      "args": [
        "-c",
        "source ~/.nvm/nvm.sh && nvm use 18 && node /home/vikasavn/language-mcp/build/index.js"
      ]
    }
  }
}
```

4. **Reload VS Code** window

### Usage in Cline

Ask Cline to:
- "Use the language-analyzer to find all functions in this workspace"
- "Find test files in the current project"
- "Run tests and show me the results"

---

## 3. Continue.dev Integration

Continue is an open-source AI code assistant that supports MCP.

### Configuration

1. **Install Continue** in VS Code or JetBrains

2. **Edit Continue config** at `~/.continue/config.json`:

```json
{
  "mcpServers": [
    {
      "name": "language-analyzer",
      "command": "bash",
      "args": [
        "-c",
        "source ~/.nvm/nvm.sh && nvm use 18 && node /home/vikasavn/language-mcp/build/index.js"
      ]
    }
  ]
}
```

3. **Restart Continue**

---

## 4. Custom Integration (Any MCP Client)

If you're building your own MCP client or using a different tool:

### Connection Details

```javascript
const client = new Client({
  name: "my-client",
  version: "1.0.0"
});

const transport = new StdioClientTransport({
  command: "bash",
  args: [
    "-c",
    "source ~/.nvm/nvm.sh && nvm use 18 && node /home/vikasavn/language-mcp/build/index.js"
  ]
});

await client.connect(transport);
```

### Available Tools

The server exposes 18 tools:

**Golang** (6 tools):
- `go_find_symbols`
- `go_find_tests`
- `go_find_callers`
- `go_find_implementations`
- `go_get_ast`
- `go_run_tests`

**Python** (6 tools):
- `python_find_symbols`
- `python_find_tests`
- `python_find_callers`
- `python_find_implementations`
- `python_get_ast`
- `python_run_tests`

**Node.js/TypeScript** (6 tools):
- `node_find_symbols`
- `node_find_tests`
- `node_find_callers`
- `node_find_implementations`
- `node_get_ast`
- `node_run_tests`

### Tool Schema

Each tool returns results in this format:

```typescript
{
  content: [
    {
      type: "text",
      text: string  // JSON-formatted results
    }
  ],
  isError?: boolean
}
```

---

## 5. Testing the Server Directly

You can test the server without any AI tool using the MCP Inspector:

```bash
# Ensure Node 18 is active
source ~/.nvm/nvm.sh && nvm use 18

# Run the inspector
npx @modelcontextprotocol/inspector node /home/vikasavn/language-mcp/build/index.js
```

This opens a web interface at `http://localhost:5173` where you can:
- See all available tools
- Manually invoke tools with parameters
- View responses
- Test the server functionality

---

## 6. Troubleshooting

### Server Not Appearing

**Problem**: Claude Desktop doesn't show the MCP tools

**Solutions**:
1. Check config file location is correct for your OS
2. Verify JSON syntax (use a JSON validator)
3. Ensure absolute paths (not relative like `~/`)
4. Check Claude Desktop logs:
   - MacOS: `~/Library/Logs/Claude/`
   - Linux: `~/.config/Claude/logs/`
   - Windows: `%APPDATA%\Claude\logs\`
5. Restart Claude Desktop completely

### Node Version Issues

**Problem**: "Unsupported engine" errors

**Solution**:
```bash
# Load nvm
source ~/.nvm/nvm.sh

# Install Node 18
nvm install 18

# Set as default
nvm alias default 18

# Verify
node --version  # Should show v18.x.x
```

### Tool Execution Fails

**Problem**: Tools return errors

**Check**:
1. **Go tools** - Requires Go to be installed: `go version`
2. **Python tools** - Requires Python 3.6+: `python3 --version`
3. **Test execution** - Requires respective test frameworks (pytest, go test, npm test)
4. **Paths** - Must be absolute paths, not relative

### Permission Issues

**Problem**: Cannot read files or execute commands

**Solution**:
```bash
# Ensure the server file is executable
chmod +x /home/vikasavn/language-mcp/build/index.js

# Check file permissions in projects you're analyzing
ls -la /path/to/project
```

---

## 7. Advanced Configuration

### Environment Variables

You can pass environment variables to the server:

```json
{
  "mcpServers": {
    "language-analyzer": {
      "command": "bash",
      "args": ["-c", "source ~/.nvm/nvm.sh && nvm use 18 && node /home/vikasavn/language-mcp/build/index.js"],
      "env": {
        "DEBUG": "true",
        "MAX_FILE_SIZE": "10485760"
      }
    }
  }
}
```

### Multiple Server Instances

You can run multiple instances for different projects:

```json
{
  "mcpServers": {
    "language-analyzer-project1": {
      "command": "node",
      "args": ["/home/vikasavn/language-mcp/build/index.js"]
    },
    "language-analyzer-project2": {
      "command": "node",
      "args": ["/home/vikasavn/language-mcp/build/index.js"]
    }
  }
}
```

---

## 8. Performance Tips

1. **Large Projects**: Analysis may take time for projects with thousands of files
2. **Caching**: The server doesn't cache results; consider implementing caching if needed
3. **Parallel Execution**: Multiple tool calls can run in parallel
4. **AST Generation**: Can be memory-intensive for very large files

---

## 9. Security Considerations

⚠️ **Important**: This server executes code analysis and test commands

- Only use on trusted codebases
- Test execution runs actual test commands (go test, pytest, npm test)
- Ensure you trust the code being analyzed
- Consider sandboxing for untrusted code

---

## 10. Getting Help

**Issues**: Report at the project repository
**Questions**: Check the README.md and EXAMPLES.md
**Logs**: Check Claude Desktop logs for debugging

## Next Steps

1. ✅ Configure your AI tool using the appropriate section above
2. ✅ Test with the example projects in `examples/`
3. ✅ Try on your real projects
4. ✅ Report any issues or suggestions

Happy coding with enhanced AI code analysis!
