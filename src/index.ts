#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import { GoAnalyzer } from "./analyzers/golang.js";
import { PythonAnalyzer } from "./analyzers/python.js";
import { NodeAnalyzer } from "./analyzers/node.js";
import { DocsAnalyzer } from "./analyzers/docs.js";
import { ProjectsAnalyzer } from "./analyzers/projects.js";
import { DocScheduler } from "./scheduler/doc-scheduler.js";
import { VectorDBManager } from "./vector-db/manager.js";
import { DocScraper } from "./scrapers/doc-scraper.js";

const server = new Server(
  {
    name: "language-mcp-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize analyzers
const goAnalyzer = new GoAnalyzer();
const pythonAnalyzer = new PythonAnalyzer();
const nodeAnalyzer = new NodeAnalyzer();
const docsAnalyzer = new DocsAnalyzer();

// Initialize background scheduler
const vectorDB = new VectorDBManager();
const scraper = new DocScraper();
const scheduler = new DocScheduler(vectorDB, scraper);

// Initialize project discovery system
const projectsAnalyzer = new ProjectsAnalyzer(
  vectorDB,
  goAnalyzer,
  pythonAnalyzer,
  nodeAnalyzer
);

// Start background scraping (optional - can be enabled/disabled)
const ENABLE_AUTO_SCRAPING = process.env.ENABLE_AUTO_SCRAPING === "true";
if (ENABLE_AUTO_SCRAPING) {
  scheduler.startDailyScraping();
  scheduler.startWeeklyScraping();
  console.error("Background documentation scraping enabled");
}

// Start project discovery and background indexing (optional - can be enabled/disabled)
const ENABLE_PROJECT_DISCOVERY = process.env.ENABLE_PROJECT_DISCOVERY !== "false"; // Default: enabled
if (ENABLE_PROJECT_DISCOVERY) {
  projectsAnalyzer.initialize().then(() => {
    projectsAnalyzer.startBackgroundServices().catch((error) => {
      console.error("Failed to start project discovery services:", error);
    });
    console.error("Project discovery and auto-indexing enabled");
  }).catch((error) => {
    console.error("Failed to initialize project discovery:", error);
  });
}

// Define all available tools
const tools: Tool[] = [
  // Golang tools
  {
    name: "go_find_symbols",
    description: "Find symbols (functions, types, variables) in Go code. Searches for symbol definitions and their locations.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Go project directory or file",
        },
        symbol_name: {
          type: "string",
          description: "Name of the symbol to find (optional, returns all if not specified)",
        },
        symbol_type: {
          type: "string",
          enum: ["function", "type", "variable", "constant", "interface", "struct", "all"],
          description: "Type of symbol to search for (default: all)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "go_find_tests",
    description: "Find all test files and test functions in a Go project",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Go project directory",
        },
        test_name: {
          type: "string",
          description: "Filter tests by name pattern (optional)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "go_find_callers",
    description: "Find all places where a Go function is called",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Go project directory",
        },
        function_name: {
          type: "string",
          description: "Name of the function to find callers for",
        },
      },
      required: ["path", "function_name"],
    },
  },
  {
    name: "go_get_ast",
    description: "Get the Abstract Syntax Tree (AST) for a Go file",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to Go source file",
        },
        format: {
          type: "string",
          enum: ["json", "pretty"],
          description: "Output format (default: pretty)",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "go_run_tests",
    description: "Run Go tests and return results",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Go project directory or test file",
        },
        test_name: {
          type: "string",
          description: "Specific test name to run (optional, runs all if not specified)",
        },
        verbose: {
          type: "boolean",
          description: "Enable verbose output",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "go_find_implementations",
    description: "Find all implementations of a Go interface",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Go project directory",
        },
        interface_name: {
          type: "string",
          description: "Name of the interface to find implementations for",
        },
      },
      required: ["path", "interface_name"],
    },
  },

  // Python tools
  {
    name: "python_find_symbols",
    description: "Find symbols (functions, classes, variables) in Python code",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Python project directory or file",
        },
        symbol_name: {
          type: "string",
          description: "Name of the symbol to find (optional)",
        },
        symbol_type: {
          type: "string",
          enum: ["function", "class", "variable", "method", "all"],
          description: "Type of symbol to search for (default: all)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "python_find_tests",
    description: "Find all test files and test functions in a Python project (pytest and unittest)",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Python project directory",
        },
        test_name: {
          type: "string",
          description: "Filter tests by name pattern (optional)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "python_find_callers",
    description: "Find all places where a Python function or method is called",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Python project directory",
        },
        function_name: {
          type: "string",
          description: "Name of the function/method to find callers for",
        },
      },
      required: ["path", "function_name"],
    },
  },
  {
    name: "python_get_ast",
    description: "Get the Abstract Syntax Tree (AST) for a Python file",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to Python source file",
        },
        format: {
          type: "string",
          enum: ["json", "pretty"],
          description: "Output format (default: pretty)",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "python_run_tests",
    description: "Run Python tests using pytest or unittest",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Python project directory or test file",
        },
        test_name: {
          type: "string",
          description: "Specific test name to run (optional)",
        },
        framework: {
          type: "string",
          enum: ["pytest", "unittest", "auto"],
          description: "Test framework to use (default: auto-detect)",
        },
        verbose: {
          type: "boolean",
          description: "Enable verbose output",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "python_find_implementations",
    description: "Find all implementations/subclasses of a Python class",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Python project directory",
        },
        class_name: {
          type: "string",
          description: "Name of the class to find implementations for",
        },
      },
      required: ["path", "class_name"],
    },
  },

  // Node.js/JavaScript/TypeScript tools
  {
    name: "node_find_symbols",
    description: "Find symbols (functions, classes, variables) in JavaScript/TypeScript code",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Node.js project directory or file",
        },
        symbol_name: {
          type: "string",
          description: "Name of the symbol to find (optional)",
        },
        symbol_type: {
          type: "string",
          enum: ["function", "class", "variable", "interface", "type", "all"],
          description: "Type of symbol to search for (default: all)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "node_find_tests",
    description: "Find all test files and test cases in a Node.js project (Jest, Mocha, Vitest)",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Node.js project directory",
        },
        test_name: {
          type: "string",
          description: "Filter tests by name pattern (optional)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "node_find_callers",
    description: "Find all places where a JavaScript/TypeScript function is called",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Node.js project directory",
        },
        function_name: {
          type: "string",
          description: "Name of the function to find callers for",
        },
      },
      required: ["path", "function_name"],
    },
  },
  {
    name: "node_get_ast",
    description: "Get the Abstract Syntax Tree (AST) for a JavaScript/TypeScript file",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to JavaScript/TypeScript source file",
        },
        format: {
          type: "string",
          enum: ["json", "pretty"],
          description: "Output format (default: pretty)",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "node_run_tests",
    description: "Run Node.js tests (supports Jest, Mocha, Vitest, npm test)",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Node.js project directory",
        },
        test_name: {
          type: "string",
          description: "Specific test name/pattern to run (optional)",
        },
        framework: {
          type: "string",
          enum: ["jest", "mocha", "vitest", "npm", "auto"],
          description: "Test framework to use (default: auto-detect)",
        },
        verbose: {
          type: "boolean",
          description: "Enable verbose output",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "node_find_implementations",
    description: "Find all implementations/subclasses of a TypeScript interface or class",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to Node.js project directory",
        },
        interface_name: {
          type: "string",
          description: "Name of the interface/class to find implementations for",
        },
      },
      required: ["path", "interface_name"],
    },
  },

  // Documentation tools
  {
    name: "search_docs",
    description: "Search documentation using semantic vector search. Searches indexed official docs, package docs, and local project documentation.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (natural language)",
        },
        language: {
          type: "string",
          enum: ["go", "python", "nodejs"],
          description: "Filter by programming language (optional)",
        },
        type: {
          type: "string",
          enum: ["official_doc", "local_doc", "package_doc"],
          description: "Filter by document type (optional)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "scrape_docs",
    description: "Scrape and index official documentation from go.dev, python.org, and nodejs.org",
    inputSchema: {
      type: "object",
      properties: {
        languages: {
          type: "array",
          items: {
            type: "string",
            enum: ["go", "python", "nodejs"],
          },
          description: "Languages to scrape (default: all)",
        },
      },
    },
  },
  {
    name: "get_doc_stats",
    description: "Get statistics about indexed documentation",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "start_doc_server",
    description: "Start a local documentation server (godoc for Go, pydoc for Python, typedoc for Node.js)",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["go", "python", "nodejs"],
          description: "Language documentation server to start",
        },
        project_path: {
          type: "string",
          description: "Path to project directory",
        },
      },
      required: ["language", "project_path"],
    },
  },
  {
    name: "stop_doc_server",
    description: "Stop a running documentation server",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["go", "python", "nodejs"],
          description: "Language documentation server to stop",
        },
      },
      required: ["language"],
    },
  },
  {
    name: "list_doc_servers",
    description: "List all running documentation servers",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "index_local_docs",
    description: "Index documentation from a local project into the vector database",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Path to project directory",
        },
        language: {
          type: "string",
          enum: ["go", "python", "nodejs"],
          description: "Project language",
        },
      },
      required: ["project_path", "language"],
    },
  },
  {
    name: "scrape_package_docs",
    description: "Scrape and index documentation for a specific package (from pkg.go.dev, pypi.org, or npmjs.com)",
    inputSchema: {
      type: "object",
      properties: {
        package_name: {
          type: "string",
          description: "Name of the package",
        },
        language: {
          type: "string",
          enum: ["go", "python", "nodejs"],
          description: "Package language",
        },
      },
      required: ["package_name", "language"],
    },
  },

  // Project management tools
  {
    name: "discover_projects",
    description: "Automatically discover projects by scanning for IDE markers (.vscode, .idea) in common directories. Detected projects are added to the registry and indexed.",
    inputSchema: {
      type: "object",
      properties: {
        quick: {
          type: "boolean",
          description: "Use quick scan (faster, uses find command). Default: true",
        },
        max_depth: {
          type: "number",
          description: "Maximum directory depth to scan (only for non-quick scan). Default: 3",
        },
      },
    },
  },
  {
    name: "list_projects",
    description: "List all discovered projects with their metadata and indexing status",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["go", "python", "nodejs", "mixed"],
          description: "Filter by programming language (optional)",
        },
        status: {
          type: "string",
          enum: ["pending", "indexing", "completed", "failed"],
          description: "Filter by indexing status (optional)",
        },
        ide: {
          type: "string",
          enum: ["vscode", "jetbrains", "multiple", "none"],
          description: "Filter by IDE (optional)",
        },
      },
    },
  },
  {
    name: "reindex_project",
    description: "Force reindexing of a specific project. This will re-scan symbols, tests, and documentation.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Absolute path to the project directory",
        },
      },
      required: ["project_path"],
    },
  },
  {
    name: "get_project_stats",
    description: "Get statistics about project discovery and indexing status",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "start_auto_indexing",
    description: "Start automatic background indexing of discovered projects",
    inputSchema: {
      type: "object",
      properties: {
        schedule: {
          type: "string",
          description: "Cron schedule for indexing (default: '0 * * * *' - every hour)",
        },
      },
    },
  },
  {
    name: "stop_auto_indexing",
    description: "Stop automatic background indexing",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "watch_projects",
    description: "Start file watchers for all discovered projects to detect changes and trigger re-indexing",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "unwatch_projects",
    description: "Stop all file watchers",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  try {
    // Route to appropriate analyzer based on tool name
    if (name.startsWith("go_")) {
      return await goAnalyzer.handleTool(name, args) as CallToolResult;
    } else if (name.startsWith("python_")) {
      return await pythonAnalyzer.handleTool(name, args) as CallToolResult;
    } else if (name.startsWith("node_")) {
      return await nodeAnalyzer.handleTool(name, args) as CallToolResult;
    } else if (
      name === "search_docs" ||
      name === "scrape_docs" ||
      name === "get_doc_stats" ||
      name === "start_doc_server" ||
      name === "stop_doc_server" ||
      name === "list_doc_servers" ||
      name === "index_local_docs" ||
      name === "scrape_package_docs"
    ) {
      return await docsAnalyzer.handleTool(name, args) as CallToolResult;
    } else if (
      name === "discover_projects" ||
      name === "list_projects" ||
      name === "reindex_project" ||
      name === "get_project_stats" ||
      name === "start_auto_indexing" ||
      name === "stop_auto_indexing" ||
      name === "watch_projects" ||
      name === "unwatch_projects"
    ) {
      return await projectsAnalyzer.handleTool(name, args) as CallToolResult;
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Language MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
