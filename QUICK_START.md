# Quick Start Guide

## What This MCP Server Does

This server gives AI assistants powerful code inspection capabilities for Go, Python, and Node.js projects:

- Find any function, class, or variable
- Locate test files and test cases
- Analyze where functions are called
- View Abstract Syntax Trees
- Run tests and get results
- Find interface implementations and subclasses

## Getting Started

### 1. Upgrade Node.js (if needed)

This requires Node.js 18+. Check your version:

```bash
node --version
```

If you're on an older version, upgrade using nvm:

```bash
nvm install 18
nvm use 18
```

See [INSTALL.md](INSTALL.md) for detailed upgrade instructions.

### 2. Build the Server

```bash
npm install
npm run build
```

### 3. Configure Claude Desktop

Edit your Claude Desktop config file and add:

```json
{
  "mcpServers": {
    "language-analyzer": {
      "command": "node",
      "args": ["/home/vikasavn/language-mcp/build/index.js"]
    }
  }
}
```

**Config file locations:**
- MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### 4. Restart Claude Desktop

After saving the config, restart Claude Desktop for the changes to take effect.

## Example Queries

Once configured, you can ask Claude questions like:

**Finding symbols:**
- "Find all functions named `Handler` in /path/to/go/project"
- "Show me all classes in /path/to/python/project"
- "Find the `calculateTotal` function in my TypeScript project"

**Finding tests:**
- "What tests exist in /path/to/project?"
- "Find all test files for the authentication module"
- "Show me tests that contain 'login' in their name"

**Analyzing call graphs:**
- "Where is the `processPayment` function called?"
- "Find all callers of `validateUser`"

**Finding implementations:**
- "Find all implementations of the `Handler` interface"
- "Show me all classes that extend `BaseService`"

**Running tests:**
- "Run all tests in /path/to/project"
- "Run the test named `TestUserAuthentication`"
- "Run tests with verbose output"

**AST analysis:**
- "Show me the AST for /path/to/file.go"
- "Get the structure of /path/to/module.py"

## Tool Reference

### Golang Tools
- `go_find_symbols` - Find functions, types, structs, interfaces
- `go_find_tests` - Locate test files and test functions
- `go_find_callers` - Find where a function is called
- `go_find_implementations` - Find interface implementations
- `go_get_ast` - Generate AST for a file
- `go_run_tests` - Execute go tests

### Python Tools
- `python_find_symbols` - Find functions, classes, methods
- `python_find_tests` - Locate pytest/unittest tests
- `python_find_callers` - Find where a function is called
- `python_find_implementations` - Find subclasses
- `python_get_ast` - Generate AST for a file
- `python_run_tests` - Execute pytest/unittest

### Node.js/TypeScript Tools
- `node_find_symbols` - Find functions, classes, interfaces, types
- `node_find_tests` - Locate Jest/Mocha/Vitest tests
- `node_find_callers` - Find where a function is called
- `node_find_implementations` - Find interface/class implementations
- `node_get_ast` - Generate AST for a file
- `node_run_tests` - Execute tests (auto-detects framework)

## Testing the Server

You can test the server directly using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

This opens a web interface where you can manually invoke tools and see responses.

## Troubleshooting

**Server not showing in Claude Desktop:**
1. Verify the path in config is absolute (not relative)
2. Check that build/index.js exists
3. Restart Claude Desktop
4. Check Claude Desktop logs

**Build fails:**
- Ensure Node.js 18+ is installed
- Delete node_modules and package-lock.json, then run `npm install` again

**Tools not working:**
- Go tools require Go to be installed
- Python tools require Python 3.6+
- Test execution requires the respective test frameworks

## Project Structure

```
language-mcp/
├── src/
│   ├── index.ts              # Main server
│   └── analyzers/
│       ├── golang.ts         # Go analysis
│       ├── python.ts         # Python analysis
│       └── node.ts           # Node.js/TS analysis
├── build/                    # Compiled JavaScript
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── README.md                 # Full documentation
├── INSTALL.md                # Installation guide
└── QUICK_START.md           # This file
```

## Next Steps

- Read [README.md](README.md) for detailed tool documentation
- Explore the source code in `src/` to understand how tools work
- Consider contributing additional language support
- Report issues or suggest features

Happy coding!
