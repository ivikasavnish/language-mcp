"""MCP Server implementation with HTTP transport and background processing."""

import argparse
import asyncio
import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.types import (
    TextContent,
    Tool,
)

from .worker import BackgroundWorker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class LanguageMCPServer:
    """Language analysis MCP server with background processing."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.host = host
        self.port = port
        self.server = Server("language-mcp")
        self.worker = BackgroundWorker()
        self._setup_tools()

    def _setup_tools(self):
        """Set up MCP tools."""

        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            """List available tools."""
            return [
                Tool(
                    name="add_project",
                    description=(
                        "Add a project directory to be analyzed. "
                        "The analysis will run in the background automatically."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": (
                                    "Path to the project directory. "
                                    "Use '.' for current directory."
                                ),
                            },
                            "name": {
                                "type": "string",
                                "description": "Optional name for the project.",
                            },
                        },
                        "required": ["path"],
                    },
                ),
                Tool(
                    name="remove_project",
                    description="Remove a project from analysis.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the project directory to remove.",
                            },
                        },
                        "required": ["path"],
                    },
                ),
                Tool(
                    name="list_projects",
                    description="List all registered projects and their analysis status.",
                    inputSchema={
                        "type": "object",
                        "properties": {},
                    },
                ),
                Tool(
                    name="get_symbols",
                    description="Get all symbols (functions, classes, variables) from a project.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the project directory.",
                            },
                            "kind": {
                                "type": "string",
                                "description": (
                                    "Filter by symbol kind: "
                                    "'function', 'class', 'method', 'variable'."
                                ),
                                "enum": ["function", "class", "method", "variable", "all"],
                            },
                            "search": {
                                "type": "string",
                                "description": "Search term to filter symbols by name.",
                            },
                        },
                        "required": ["path"],
                    },
                ),
                Tool(
                    name="get_dependencies",
                    description="Get all dependencies (imports) from a project.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the project directory.",
                            },
                            "external_only": {
                                "type": "boolean",
                                "description": "Only show external dependencies.",
                            },
                        },
                        "required": ["path"],
                    },
                ),
                Tool(
                    name="get_dependency_tree",
                    description=(
                        "Get the dependency tree showing relationships "
                        "between files and modules."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the project directory.",
                            },
                        },
                        "required": ["path"],
                    },
                ),
                Tool(
                    name="get_docs",
                    description="Get documentation files and their structure from a project.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the project directory.",
                            },
                            "file": {
                                "type": "string",
                                "description": (
                                    "Specific documentation file to retrieve content from."
                                ),
                            },
                        },
                        "required": ["path"],
                    },
                ),
                Tool(
                    name="search_docs",
                    description="Search documentation for a query string.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the project directory.",
                            },
                            "query": {
                                "type": "string",
                                "description": "Search query.",
                            },
                            "case_sensitive": {
                                "type": "boolean",
                                "description": "Whether the search should be case-sensitive.",
                            },
                        },
                        "required": ["path", "query"],
                    },
                ),
                Tool(
                    name="refresh_project",
                    description="Force a full re-analysis of a project.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the project directory.",
                            },
                        },
                        "required": ["path"],
                    },
                ),
                Tool(
                    name="get_symbol_info",
                    description="Get detailed information about a specific symbol.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the project directory.",
                            },
                            "name": {
                                "type": "string",
                                "description": "Name of the symbol to look up.",
                            },
                        },
                        "required": ["path", "name"],
                    },
                ),
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
            """Handle tool calls."""
            try:
                result = await self._handle_tool_call(name, arguments)
                return [TextContent(type="text", text=json.dumps(result, indent=2))]
            except Exception as e:
                logger.error(f"Error in tool {name}: {e}")
                return [
                    TextContent(
                        type="text",
                        text=json.dumps({"error": str(e)}, indent=2),
                    )
                ]

    async def _handle_tool_call(
        self, name: str, arguments: dict[str, Any]
    ) -> dict[str, Any]:
        """Handle individual tool calls."""
        if name == "add_project":
            path = arguments.get("path", ".")
            if path == ".":
                path = os.getcwd()
            path = str(Path(path).resolve())
            project_name = arguments.get("name")

            project = await self.worker.add_project(path, project_name)
            return {
                "status": "success",
                "message": f"Project '{project.name}' added at {project.path}",
                "project": {
                    "name": project.name,
                    "path": project.path,
                    "is_analyzing": project.is_analyzing,
                    "is_watching": project.is_watching,
                },
            }

        elif name == "remove_project":
            path = arguments.get("path")
            if path == ".":
                path = os.getcwd()
            path = str(Path(path).resolve())

            removed = await self.worker.remove_project(path)
            if removed:
                return {"status": "success", "message": f"Project removed: {path}"}
            else:
                return {"status": "error", "message": f"Project not found: {path}"}

        elif name == "list_projects":
            projects = []
            for project in self.worker.projects.values():
                projects.append(
                    {
                        "name": project.name,
                        "path": project.path,
                        "is_analyzing": project.is_analyzing,
                        "is_watching": project.is_watching,
                        "files_analyzed": len(project.analysis_results),
                        "docs_found": len(project.documentation),
                        "total_symbols": sum(
                            len(r.symbols) for r in project.analysis_results.values()
                        ),
                    }
                )
            return {"projects": projects}

        elif name == "get_symbols":
            path = arguments.get("path")
            if path == ".":
                path = os.getcwd()
            path = str(Path(path).resolve())

            kind = arguments.get("kind", "all")
            search = arguments.get("search", "").lower()

            symbols = self.worker.get_all_symbols(path)

            # Filter by kind
            if kind != "all":
                symbols = [s for s in symbols if s["kind"] == kind]

            # Filter by search term
            if search:
                symbols = [s for s in symbols if search in s["name"].lower()]

            return {"symbols": symbols, "count": len(symbols)}

        elif name == "get_dependencies":
            path = arguments.get("path")
            if path == ".":
                path = os.getcwd()
            path = str(Path(path).resolve())

            external_only = arguments.get("external_only", False)

            deps = self.worker.get_all_dependencies(path)

            if external_only:
                # Filter out stdlib and local imports
                stdlib_modules = {
                    "os",
                    "sys",
                    "re",
                    "json",
                    "typing",
                    "pathlib",
                    "asyncio",
                    "logging",
                    "datetime",
                    "collections",
                    "functools",
                    "itertools",
                    "contextlib",
                    "dataclasses",
                    "abc",
                    "io",
                    "math",
                    "random",
                    "time",
                    "threading",
                    "multiprocessing",
                    "subprocess",
                    "shutil",
                    "tempfile",
                    "unittest",
                    "pytest",
                    "argparse",
                    "copy",
                    "hashlib",
                    "base64",
                    "socket",
                    "http",
                    "urllib",
                    "email",
                    "html",
                    "xml",
                    "csv",
                    "pickle",
                    "sqlite3",
                    "queue",
                    "enum",
                    "warnings",
                    "traceback",
                    "inspect",
                    "dis",
                    "gc",
                    "weakref",
                    "atexit",
                    "signal",
                    "fcntl",
                    "termios",
                    "tty",
                    "pty",
                    "crypt",
                    "grp",
                    "pwd",
                    "spwd",
                    "struct",
                    "codecs",
                    "unicodedata",
                    "locale",
                    "gettext",
                    "textwrap",
                    "difflib",
                    "operator",
                    "array",
                    "heapq",
                    "bisect",
                    "graphlib",
                    "pprint",
                    "reprlib",
                    "types",
                    "string",
                    "secrets",
                    "hmac",
                    "zlib",
                    "gzip",
                    "bz2",
                    "lzma",
                    "tarfile",
                    "zipfile",
                    "configparser",
                    "tomllib",
                    "netrc",
                    "plistlib",
                    "calendar",
                    "fractions",
                    "decimal",
                    "statistics",
                    "cmath",
                }
                deps = [
                    d
                    for d in deps
                    if d["name"].split(".")[0] not in stdlib_modules
                    and not d["name"].startswith(".")
                ]

            return {"dependencies": deps, "count": len(deps)}

        elif name == "get_dependency_tree":
            path = arguments.get("path")
            if path == ".":
                path = os.getcwd()
            path = str(Path(path).resolve())

            tree = self.worker.get_dependency_tree(path)
            return tree

        elif name == "get_docs":
            path = arguments.get("path")
            if path == ".":
                path = os.getcwd()
            path = str(Path(path).resolve())

            specific_file = arguments.get("file")

            if specific_file:
                project = self.worker.get_project(path)
                if project and specific_file in project.documentation:
                    doc = project.documentation[specific_file]
                    return {
                        "file": doc.file_path,
                        "title": doc.title,
                        "content": doc.content,
                        "sections": [
                            {
                                "title": s.title,
                                "level": s.level,
                                "content": s.content,
                            }
                            for s in doc.sections
                        ],
                    }
                else:
                    return {"error": f"Documentation file not found: {specific_file}"}

            docs = self.worker.get_all_docs(path)
            return {"documentation": docs, "count": len(docs)}

        elif name == "search_docs":
            path = arguments.get("path")
            if path == ".":
                path = os.getcwd()
            path = str(Path(path).resolve())

            query = arguments.get("query", "")
            case_sensitive = arguments.get("case_sensitive", False)

            results = self.worker.search_docs(path, query, case_sensitive)
            return {"results": results, "count": len(results)}

        elif name == "refresh_project":
            path = arguments.get("path")
            if path == ".":
                path = os.getcwd()
            path = str(Path(path).resolve())

            refreshed = await self.worker.refresh_project(path)
            if refreshed:
                return {"status": "success", "message": f"Project refreshed: {path}"}
            else:
                return {"status": "error", "message": f"Project not found: {path}"}

        elif name == "get_symbol_info":
            path = arguments.get("path")
            if path == ".":
                path = os.getcwd()
            path = str(Path(path).resolve())

            symbol_name = arguments.get("name", "")

            symbols = self.worker.get_all_symbols(path)
            matching = [s for s in symbols if s["name"] == symbol_name]

            if not matching:
                return {"error": f"Symbol not found: {symbol_name}"}

            return {"symbols": matching, "count": len(matching)}

        else:
            return {"error": f"Unknown tool: {name}"}

    async def run(self):
        """Run the MCP server with SSE transport."""
        import uvicorn
        from starlette.applications import Starlette
        from starlette.responses import JSONResponse
        from starlette.routing import Route

        # Create SSE transport
        sse = SseServerTransport("/messages/")

        async def handle_sse(request):
            """Handle SSE connections."""
            async with sse.connect_sse(
                request.scope, request.receive, request._send
            ) as streams:
                await self.server.run(
                    streams[0], streams[1], self.server.create_initialization_options()
                )

        async def handle_health(request):
            """Health check endpoint."""
            projects = [
                {
                    "name": p.name,
                    "path": p.path,
                    "is_analyzing": p.is_analyzing,
                    "is_watching": p.is_watching,
                }
                for p in self.worker.projects.values()
            ]
            return JSONResponse(
                {
                    "status": "healthy",
                    "projects": projects,
                }
            )

        async def handle_messages(request):
            """Handle POST messages."""
            await sse.handle_post_message(
                request.scope, request.receive, request._send
            )

        @asynccontextmanager
        async def lifespan(app):
            """Application lifespan manager."""
            await self.worker.start()
            logger.info(f"Language MCP Server started on http://{self.host}:{self.port}")
            yield
            await self.worker.stop()
            logger.info("Language MCP Server stopped")

        app = Starlette(
            debug=True,
            routes=[
                Route("/health", handle_health, methods=["GET"]),
                Route("/sse", handle_sse, methods=["GET"]),
                Route("/messages/", handle_messages, methods=["POST"]),
            ],
            lifespan=lifespan,
        )

        config = uvicorn.Config(app, host=self.host, port=self.port, log_level="info")
        server = uvicorn.Server(config)
        await server.serve()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description=(
            "Language MCP Server - A language analysis MCP server "
            "with background processing"
        )
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="Port to bind to (default: 8080)",
    )
    parser.add_argument(
        "--project",
        "-p",
        action="append",
        help="Initial project paths to analyze (can be specified multiple times)",
    )

    args = parser.parse_args()

    server = LanguageMCPServer(host=args.host, port=args.port)

    async def run_with_projects():
        # Start server first
        server_task = asyncio.create_task(server.run())

        # Wait a bit for server to start
        await asyncio.sleep(1)

        # Add initial projects if specified
        if args.project:
            for project_path in args.project:
                try:
                    await server.worker.add_project(project_path)
                except Exception as e:
                    logger.error(f"Failed to add project {project_path}: {e}")

        await server_task

    try:
        asyncio.run(run_with_projects())
    except KeyboardInterrupt:
        logger.info("Server interrupted")
        sys.exit(0)


if __name__ == "__main__":
    main()
