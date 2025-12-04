# Language MCP

A Model Context Protocol (MCP) server for language analysis with background AST processing, linting, and documentation reading. This server runs as a live HTTP service and automatically analyzes code changes in real-time.

## Features

- **Background Analysis**: AST analysis, linting, and documentation reading run in the background automatically
- **File Watching**: Automatically detects and analyzes file changes
- **Symbol Extraction**: Get functions, classes, methods, and variables from your codebase
- **Dependency Analysis**: View import dependencies and build dependency trees
- **Code Linting**: Built-in linter with style checks, complexity analysis, and type hint suggestions
- **Code Hints**: Get improvement suggestions including missing type annotations
- **Documentation Parsing**: Parse and search Markdown and RST documentation files
- **HTTP Transport**: Runs as a live HTTP server with SSE support

## Installation

```bash
# Clone the repository
git clone https://github.com/ivikasavnish/language-mcp.git
cd language-mcp

# Install dependencies
pip install -e .

# Or install with development dependencies
pip install -e ".[dev]"
```

## Usage

### Starting the Server

```bash
# Start the server on default port 8080
language-mcp

# Start on a custom port
language-mcp --port 9000

# Start with initial projects
language-mcp --project /path/to/project1 --project /path/to/project2
```

### Available Tools

Once the server is running, you can use the following MCP tools:

#### Project Management

##### `add_project`
Add a project directory to be analyzed. Analysis runs automatically in the background.

```json
{
  "path": "/path/to/project",  // Use "." for current directory
  "name": "my-project"         // Optional project name
}
```

##### `remove_project`
Remove a project from analysis.

```json
{
  "path": "/path/to/project"
}
```

##### `list_projects`
List all registered projects and their analysis status.

##### `refresh_project`
Force a full re-analysis of a project.

```json
{
  "path": "/path/to/project"
}
```

#### Symbol Analysis

##### `get_symbols`
Get all symbols (functions, classes, variables) from a project.

```json
{
  "path": "/path/to/project",
  "kind": "function",     // Optional: filter by kind (function, class, method, variable, all)
  "search": "user"        // Optional: search term to filter symbols
}
```

##### `get_symbol_info`
Get detailed information about a specific symbol.

```json
{
  "path": "/path/to/project",
  "name": "MyClass"
}
```

#### Dependency Analysis

##### `get_dependencies`
Get all import dependencies from a project.

```json
{
  "path": "/path/to/project",
  "external_only": true   // Optional: only show external dependencies
}
```

##### `get_dependency_tree`
Get the dependency tree showing relationships between files and modules.

```json
{
  "path": "/path/to/project"
}
```

#### Linting & Code Quality

##### `get_diagnostics`
Get linting diagnostics (errors, warnings, hints) for a project.

```json
{
  "path": "/path/to/project",
  "severity": "warning",  // Optional: filter by severity (error, warning, info, hint, all)
  "file": "src/main.py"   // Optional: filter for specific file
}
```

##### `get_lint_summary`
Get a summary of all linting issues grouped by severity and source.

```json
{
  "path": "/path/to/project"
}
```

##### `lint_file`
Run linter on a specific file and get diagnostics.

```json
{
  "file": "/path/to/file.py"
}
```

##### `get_code_hints`
Get code improvement hints and suggestions (missing type annotations, best practices).

```json
{
  "path": "/path/to/project",
  "file": "src/main.py"   // Optional: filter for specific file
}
```

#### Documentation

##### `get_docs`
Get documentation files and their structure.

```json
{
  "path": "/path/to/project",
  "file": "README.md"     // Optional: get specific file content
}
```

##### `search_docs`
Search documentation for a query string.

```json
{
  "path": "/path/to/project",
  "query": "installation",
  "case_sensitive": false
}
```

## Linter Checks

The built-in linter performs the following checks:

| Code | Severity | Description |
|------|----------|-------------|
| E001 | error | Syntax errors |
| W001 | warning | Unused imports |
| W191 | info | Tabs in indentation |
| W291 | info | Trailing whitespace |
| E501 | info | Line too long (>120 chars) |
| E722 | warning | Bare except clause |
| C901 | warning | Too many function arguments (>7) |
| C902 | info | Function too long (>50 lines) |
| C903 | warning | Too much nesting (depth >4) |
| T001 | hint | Missing return type annotation |
| T002 | hint | Missing argument type annotation |

## MCP Configuration

Add to your MCP settings (e.g., in VS Code or Claude Desktop):

```json
{
  "mcpServers": {
    "language-mcp": {
      "command": "language-mcp",
      "args": ["--port", "8080"],
      "env": {}
    }
  }
}
```

Or for HTTP/SSE transport:

```json
{
  "mcpServers": {
    "language-mcp": {
      "url": "http://localhost:8080/sse"
    }
  }
}
```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /sse` - SSE endpoint for MCP communication
- `POST /messages/` - Message handling endpoint

## Development

```bash
# Install development dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black src tests

# Lint code
ruff check src tests
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Language MCP Server                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   HTTP/SSE  │  │    Tools    │  │  Background Worker  │  │
│  │  Transport  │◄─┤   Handler   │◄─┤                     │  │
│  └─────────────┘  └─────────────┘  │  ┌───────────────┐  │  │
│                                     │  │  File Watcher │  │  │
│                                     │  └───────────────┘  │  │
│                                     │                     │  │
│                                     │  ┌───────────────┐  │  │
│                                     │  │ AST Analyzer  │  │  │
│                                     │  └───────────────┘  │  │
│                                     │                     │  │
│                                     │  ┌───────────────┐  │  │
│                                     │  │    Linter     │  │  │
│                                     │  └───────────────┘  │  │
│                                     │                     │  │
│                                     │  ┌───────────────┐  │  │
│                                     │  │  Doc Reader   │  │  │
│                                     │  └───────────────┘  │  │
│                                     └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## License

MIT License