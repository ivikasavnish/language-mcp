"""Documentation server helper module for language-specific documentation."""

import asyncio
import json
import logging
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aiofiles

logger = logging.getLogger(__name__)


@dataclass
class DocServerInfo:
    """Information about a documentation server."""

    language: str
    tool: str
    url: str | None = None
    port: int | None = None
    process: subprocess.Popen | None = None
    is_running: bool = False
    error: str | None = None


@dataclass
class APISpec:
    """Represents an API specification file."""

    file_path: str
    spec_type: str  # 'swagger', 'openapi'
    version: str | None = None
    title: str | None = None
    description: str | None = None
    endpoints: list[dict[str, Any]] = field(default_factory=list)


class DocServerHelper:
    """Helper for managing language-specific documentation servers."""

    def __init__(self):
        self._servers: dict[str, DocServerInfo] = {}
        self._lock = asyncio.Lock()

    async def check_tool_available(self, tool: str) -> bool:
        """
        Check if a documentation tool is available on the system.

        Args:
            tool: Name of the tool (e.g., 'godoc', 'javadoc')

        Returns:
            True if the tool is available, False otherwise
        """
        try:
            # Try to run the tool with --version or -version flag
            result = await asyncio.create_subprocess_exec(
                tool,
                "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await result.wait()
            return result.returncode == 0
        except FileNotFoundError:
            return False
        except Exception as e:
            logger.debug(f"Error checking tool {tool}: {e}")
            return False

    async def get_godoc_info(self, project_path: str) -> dict[str, Any]:
        """
        Get information from godoc for a Go project.

        Args:
            project_path: Path to the Go project

        Returns:
            Dictionary with godoc information
        """
        path = Path(project_path)
        if not path.exists():
            return {"error": "Project path does not exist"}

        # Check if godoc is available
        if not await self.check_tool_available("go"):
            return {"error": "Go is not installed or not in PATH"}

        try:
            # Get package documentation using 'go doc'
            result = await asyncio.create_subprocess_exec(
                "go",
                "doc",
                "-all",
                cwd=str(path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await result.communicate()

            if result.returncode == 0:
                return {
                    "documentation": stdout.decode("utf-8", errors="ignore"),
                    "tool": "go doc",
                }
            else:
                return {
                    "error": f"Failed to get Go documentation: {stderr.decode('utf-8', errors='ignore')}"
                }

        except Exception as e:
            logger.error(f"Error getting godoc info: {e}")
            return {"error": str(e)}

    async def get_javadoc_info(self, project_path: str) -> dict[str, Any]:
        """
        Get information about javadoc for a Java project.

        Args:
            project_path: Path to the Java project

        Returns:
            Dictionary with javadoc information
        """
        path = Path(project_path)
        if not path.exists():
            return {"error": "Project path does not exist"}

        # Check if javadoc is available
        if not await self.check_tool_available("javadoc"):
            return {"error": "javadoc is not installed or not in PATH"}

        # Find Java source files
        java_files = list(path.rglob("*.java"))
        if not java_files:
            return {"error": "No Java files found in project"}

        return {
            "tool": "javadoc",
            "available": True,
            "java_files": len(java_files),
            "message": "Use javadoc command to generate documentation",
        }

    async def get_jsdoc_info(self, project_path: str) -> dict[str, Any]:
        """
        Get information about JSDoc for a JavaScript/TypeScript project.

        Args:
            project_path: Path to the project

        Returns:
            Dictionary with JSDoc information
        """
        path = Path(project_path)
        if not path.exists():
            return {"error": "Project path does not exist"}

        # Check if jsdoc is available (typically installed via npm)
        jsdoc_available = await self.check_tool_available("jsdoc")

        # Find package.json to check for jsdoc
        package_json = path / "package.json"
        has_jsdoc_config = False

        if package_json.exists():
            try:
                async with aiofiles.open(package_json, "r") as f:
                    content = await f.read()
                    pkg = json.loads(content)
                    dev_deps = pkg.get("devDependencies", {})
                    has_jsdoc_config = "jsdoc" in dev_deps
            except Exception as e:
                logger.error(f"Error reading package.json: {e}")

        return {
            "tool": "jsdoc",
            "available": jsdoc_available or has_jsdoc_config,
            "installed": jsdoc_available,
            "in_package_json": has_jsdoc_config,
        }

    async def get_pydoc_info(self, project_path: str, module_name: str = None) -> dict[str, Any]:
        """
        Get Python documentation using pydoc.

        Args:
            project_path: Path to the Python project
            module_name: Specific module to document

        Returns:
            Dictionary with pydoc information
        """
        path = Path(project_path)
        if not path.exists():
            return {"error": "Project path does not exist"}

        # Python should always have pydoc available
        return {
            "tool": "pydoc",
            "available": True,
            "message": "Use 'python -m pydoc <module>' to view documentation",
        }

    async def parse_swagger_spec(self, file_path: str) -> APISpec:
        """
        Parse a Swagger/OpenAPI specification file.

        Args:
            file_path: Path to the spec file

        Returns:
            APISpec object with parsed information
        """
        path = Path(file_path)
        spec = APISpec(file_path=file_path, spec_type="unknown")

        if not path.exists():
            spec.error = "File does not exist"
            return spec

        try:
            async with aiofiles.open(path, "r") as f:
                content = await f.read()

            # Parse JSON or YAML
            if path.suffix.lower() == ".json":
                data = json.loads(content)
            elif path.suffix.lower() in {".yaml", ".yml"}:
                try:
                    import yaml
                    data = yaml.safe_load(content)
                except ImportError:
                    spec.error = "PyYAML not installed, cannot parse YAML files"
                    return spec
            else:
                spec.error = f"Unsupported file format: {path.suffix}"
                return spec

            # Determine spec type and version
            if "swagger" in data:
                spec.spec_type = "swagger"
                spec.version = data.get("swagger", "2.0")
            elif "openapi" in data:
                spec.spec_type = "openapi"
                spec.version = data.get("openapi", "3.0.0")

            # Extract basic information
            info = data.get("info", {})
            spec.title = info.get("title")
            spec.description = info.get("description")

            # Extract endpoints
            paths = data.get("paths", {})
            for path_name, path_data in paths.items():
                for method, method_data in path_data.items():
                    if isinstance(method_data, dict):
                        endpoint = {
                            "path": path_name,
                            "method": method.upper(),
                            "summary": method_data.get("summary"),
                            "description": method_data.get("description"),
                            "operationId": method_data.get("operationId"),
                        }
                        spec.endpoints.append(endpoint)

        except Exception as e:
            logger.error(f"Error parsing API spec {file_path}: {e}")
            spec.error = str(e)

        return spec

    async def get_language_docs(
        self, project_path: str, language: str
    ) -> dict[str, Any]:
        """
        Get documentation information for a specific language.

        Args:
            project_path: Path to the project
            language: Programming language name

        Returns:
            Dictionary with documentation information
        """
        result: dict[str, Any] = {
            "language": language,
            "project_path": project_path,
            "available_tools": [],
            "documentation": {},
        }

        if language == "Go":
            godoc_info = await self.get_godoc_info(project_path)
            result["documentation"]["godoc"] = godoc_info
            if not godoc_info.get("error"):
                result["available_tools"].append("godoc")

        elif language == "Java":
            javadoc_info = await self.get_javadoc_info(project_path)
            result["documentation"]["javadoc"] = javadoc_info
            if not javadoc_info.get("error"):
                result["available_tools"].append("javadoc")

        elif language in ("JavaScript", "TypeScript"):
            jsdoc_info = await self.get_jsdoc_info(project_path)
            result["documentation"]["jsdoc"] = jsdoc_info
            if jsdoc_info.get("available"):
                result["available_tools"].append("jsdoc")

        elif language == "Python":
            pydoc_info = await self.get_pydoc_info(project_path)
            result["documentation"]["pydoc"] = pydoc_info
            if pydoc_info.get("available"):
                result["available_tools"].append("pydoc")

        else:
            result["message"] = f"No built-in documentation tool support for {language}"

        return result

    def get_active_servers(self) -> dict[str, DocServerInfo]:
        """Get information about active documentation servers."""
        return {k: v for k, v in self._servers.items() if v.is_running}

    async def stop_all_servers(self):
        """Stop all running documentation servers."""
        for server_id, server in self._servers.items():
            if server.is_running and server.process:
                try:
                    server.process.terminate()
                    server.process.wait(timeout=5)
                    server.is_running = False
                    logger.info(f"Stopped documentation server: {server_id}")
                except Exception as e:
                    logger.error(f"Error stopping server {server_id}: {e}")
