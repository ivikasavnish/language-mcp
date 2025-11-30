# Language MCP Server

A comprehensive Model Context Protocol (MCP) server for multi-language code analysis. Supports Golang, Python, and Node.js/TypeScript projects with powerful introspection capabilities.

## Features

This MCP server provides AI assistants with the ability to:

- **Find Symbols**: Locate functions, classes, types, interfaces, and variables across codebases
- **Discover Tests**: Find test files and test functions/methods
- **Analyze Call Graphs**: Find all callers of a specific function
- **Generate AST**: Get Abstract Syntax Tree representations of source files
- **Run Tests**: Execute test suites and get results
- **Find Implementations**: Locate all implementations of interfaces or subclasses

## Supported Languages

### Golang
- Symbol finding (functions, types, structs, interfaces, variables, constants)
- Test discovery (test functions, benchmarks, examples)
- Function caller analysis
- Interface implementation finding
- AST generation using Go's ast package
- Test execution with `go test`

### Python
- Symbol finding (functions, classes, methods, variables)
- Test discovery (pytest and unittest)
- Function caller analysis
- Class inheritance/implementation finding
- AST generation using Python's ast module
- Test execution with pytest or unittest

### Node.js/TypeScript
- Symbol finding (functions, classes, interfaces, types, variables)
- Test discovery (Jest, Mocha, Vitest)
- Function caller analysis
- Interface/class implementation finding
- AST generation (requires @babel/parser for full AST, falls back to simple parsing)
- Test execution (auto-detects test framework)

## Installation

```bash
npm install
npm run build
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "language-analyzer": {
      "command": "node",
      "args": ["/absolute/path/to/language-mcp/build/index.js"]
    }
  }
}
```

## Available Tools

### Golang Tools

#### `go_find_symbols`
Find symbols in Go code.

**Parameters:**
- `path` (required): Path to Go project directory or file
- `symbol_name` (optional): Name of the symbol to find
- `symbol_type` (optional): Type of symbol - "function", "type", "variable", "constant", "interface", "struct", or "all" (default)

**Example:**
```json
{
  "path": "/path/to/project",
  "symbol_name": "Handler",
  "symbol_type": "function"
}
```

#### `go_find_tests`
Find all test files and test functions.

**Parameters:**
- `path` (required): Path to Go project directory
- `test_name` (optional): Filter tests by name pattern

#### `go_find_callers`
Find all places where a function is called.

**Parameters:**
- `path` (required): Path to Go project directory
- `function_name` (required): Name of the function

#### `go_find_implementations`
Find all implementations of an interface.

**Parameters:**
- `path` (required): Path to Go project directory
- `interface_name` (required): Name of the interface

#### `go_get_ast`
Get the AST for a Go file.

**Parameters:**
- `file_path` (required): Path to Go source file
- `format` (optional): "json" or "pretty" (default)

#### `go_run_tests`
Run Go tests.

**Parameters:**
- `path` (required): Path to Go project directory or test file
- `test_name` (optional): Specific test to run
- `verbose` (optional): Enable verbose output

### Python Tools

#### `python_find_symbols`
Find symbols in Python code.

**Parameters:**
- `path` (required): Path to Python project directory or file
- `symbol_name` (optional): Name of the symbol to find
- `symbol_type` (optional): "function", "class", "variable", "method", or "all" (default)

#### `python_find_tests`
Find all test files and test functions.

**Parameters:**
- `path` (required): Path to Python project directory
- `test_name` (optional): Filter tests by name pattern

#### `python_find_callers`
Find all places where a function is called.

**Parameters:**
- `path` (required): Path to Python project directory
- `function_name` (required): Name of the function

#### `python_find_implementations`
Find all implementations/subclasses of a class.

**Parameters:**
- `path` (required): Path to Python project directory
- `class_name` (required): Name of the class

#### `python_get_ast`
Get the AST for a Python file.

**Parameters:**
- `file_path` (required): Path to Python source file
- `format` (optional): "json" or "pretty" (default)

#### `python_run_tests`
Run Python tests.

**Parameters:**
- `path` (required): Path to Python project directory or test file
- `test_name` (optional): Specific test to run
- `framework` (optional): "pytest", "unittest", or "auto" (default)
- `verbose` (optional): Enable verbose output

### Node.js/TypeScript Tools

#### `node_find_symbols`
Find symbols in JavaScript/TypeScript code.

**Parameters:**
- `path` (required): Path to Node.js project directory or file
- `symbol_name` (optional): Name of the symbol to find
- `symbol_type` (optional): "function", "class", "variable", "interface", "type", or "all" (default)

#### `node_find_tests`
Find all test files and test cases.

**Parameters:**
- `path` (required): Path to Node.js project directory
- `test_name` (optional): Filter tests by name pattern

#### `node_find_callers`
Find all places where a function is called.

**Parameters:**
- `path` (required): Path to Node.js project directory
- `function_name` (required): Name of the function

#### `node_find_implementations`
Find all implementations of an interface or subclasses.

**Parameters:**
- `path` (required): Path to Node.js project directory
- `interface_name` (required): Name of the interface/class

#### `node_get_ast`
Get the AST for a JavaScript/TypeScript file.

**Parameters:**
- `file_path` (required): Path to source file
- `format` (optional): "json" or "pretty" (default)

**Note**: For full AST support, install `@babel/parser` in your project.

#### `node_run_tests`
Run Node.js tests.

**Parameters:**
- `path` (required): Path to Node.js project directory
- `test_name` (optional): Specific test name/pattern to run
- `framework` (optional): "jest", "mocha", "vitest", "npm", or "auto" (default)
- `verbose` (optional): Enable verbose output

## Example Use Cases

### Finding a Function Definition

Ask Claude:
> "Find the `getUserById` function in the /path/to/project directory"

Claude will use the appropriate `*_find_symbols` tool to locate it.

### Understanding Test Coverage

Ask Claude:
> "What tests exist for the authentication module?"

Claude will use `*_find_tests` to discover all test files and functions.

### Analyzing Dependencies

Ask Claude:
> "Where is the `validateInput` function being called?"

Claude will use `*_find_callers` to find all call sites.

### Finding Interface Implementations

Ask Claude:
> "Show me all implementations of the Handler interface"

Claude will use the appropriate `*_find_implementations` tool.

### Running Tests

Ask Claude:
> "Run the tests in /path/to/project"

Claude will use `*_run_tests` to execute the test suite.

## Architecture

The server is organized into:

- `src/index.ts`: Main MCP server setup and tool routing
- `src/analyzers/golang.ts`: Golang analysis implementation
- `src/analyzers/python.ts`: Python analysis implementation
- `src/analyzers/node.ts`: Node.js/TypeScript analysis implementation

Each analyzer implements:
- Symbol finding using pattern matching and AST parsing
- Test discovery based on naming conventions and frameworks
- Caller analysis using code search
- Implementation finding through inheritance/interface analysis
- AST generation using language-native tools
- Test execution using standard test runners

## Requirements

- Node.js 16+ (for running the MCP server)
- Go toolchain (for analyzing Go projects)
- Python 3.6+ (for analyzing Python projects)
- npm/node (already required for the server itself)

## Development

### Build
```bash
npm run build
```

### Watch Mode
```bash
npm run watch
```

### Testing the Server

You can test the server using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## Limitations

- Large projects may take time to analyze
- AST generation can be memory-intensive for very large files
- Test execution inherits limitations of the underlying test frameworks
- Caller analysis uses text-based search, not true semantic analysis (future enhancement opportunity)

## Future Enhancements

- Add support for more languages (Rust, Java, C++, etc.)
- Implement semantic code analysis using LSP
- Add code metrics and complexity analysis
- Support for code refactoring operations
- Integration with language servers for more accurate symbol resolution
- Caching for improved performance
- Support for monorepos and multi-language projects

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
