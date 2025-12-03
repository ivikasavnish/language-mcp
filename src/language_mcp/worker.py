"""Background worker for continuous analysis and documentation reading."""

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable

from watchfiles import Change, awatch

from .analyzer import AnalysisResult, ProjectAnalyzer
from .docs import DocFile, DocReader
from .linter import LintResult, ProjectLinter

logger = logging.getLogger(__name__)


@dataclass
class Project:
    """Represents a registered project."""

    path: str
    name: str
    analysis_results: dict[str, AnalysisResult] = field(default_factory=dict)
    documentation: dict[str, DocFile] = field(default_factory=dict)
    lint_results: dict[str, LintResult] = field(default_factory=dict)
    is_analyzing: bool = False
    is_watching: bool = False
    last_full_analysis: float = 0.0


class BackgroundWorker:
    """Background worker for continuous code analysis and documentation reading."""

    def __init__(self):
        self._projects: dict[str, Project] = {}
        self._analyzer = ProjectAnalyzer()
        self._doc_reader = DocReader()
        self._linter = ProjectLinter()
        self._watch_tasks: dict[str, asyncio.Task] = {}
        self._running = False
        self._lock = asyncio.Lock()
        self._event_handlers: list[Callable[[str, str, dict], Awaitable[None]]] = []

    @property
    def projects(self) -> dict[str, Project]:
        """Get all registered projects."""
        return self._projects

    async def start(self):
        """Start the background worker."""
        self._running = True
        logger.info("Background worker started")

    async def stop(self):
        """Stop the background worker and all watch tasks."""
        self._running = False

        # Cancel all watch tasks
        for project_path, task in self._watch_tasks.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Error cancelling watch task for {project_path}: {e}")

        self._watch_tasks.clear()
        logger.info("Background worker stopped")

    def add_event_handler(
        self, handler: Callable[[str, str, dict], Awaitable[None]]
    ):
        """Add an event handler for project updates.

        Handler signature: async def handler(project_path: str, event_type: str, data: dict)
        """
        self._event_handlers.append(handler)

    async def _emit_event(self, project_path: str, event_type: str, data: dict):
        """Emit an event to all handlers."""
        for handler in self._event_handlers:
            try:
                await handler(project_path, event_type, data)
            except Exception as e:
                logger.error(f"Error in event handler: {e}")

    async def add_project(self, project_path: str, name: str | None = None) -> Project:
        """Add a project to be monitored and analyzed."""
        path = Path(project_path).resolve()
        path_str = str(path)

        if path_str in self._projects:
            return self._projects[path_str]

        if not path.exists():
            raise ValueError(f"Project path does not exist: {path_str}")

        project_name = name or path.name
        project = Project(path=path_str, name=project_name)

        async with self._lock:
            self._projects[path_str] = project

        # Start initial analysis
        asyncio.create_task(self._initial_analysis(project))

        # Start file watching
        if self._running:
            self._start_watching(project)

        logger.info(f"Added project: {project_name} at {path_str}")
        return project

    async def remove_project(self, project_path: str) -> bool:
        """Remove a project from monitoring."""
        path = Path(project_path).resolve()
        path_str = str(path)

        if path_str not in self._projects:
            return False

        # Stop watching
        if path_str in self._watch_tasks:
            self._watch_tasks[path_str].cancel()
            try:
                await self._watch_tasks[path_str]
            except asyncio.CancelledError:
                pass
            del self._watch_tasks[path_str]

        async with self._lock:
            del self._projects[path_str]

        logger.info(f"Removed project: {path_str}")
        return True

    async def _initial_analysis(self, project: Project):
        """Perform initial analysis of a project."""
        project.is_analyzing = True

        try:
            # Analyze code
            logger.info(f"Starting analysis of {project.name}")
            results = await self._analyzer.analyze_project(project.path)
            project.analysis_results = results

            # Scan documentation
            logger.info(f"Scanning documentation for {project.name}")
            docs = await self._doc_reader.scan_project_docs(project.path)
            project.documentation = docs

            # Lint code
            logger.info(f"Linting code for {project.name}")
            lint_results = await self._linter.lint_project(project.path)
            project.lint_results = lint_results

            project.last_full_analysis = asyncio.get_event_loop().time()

            # Calculate lint summary
            total_diagnostics = sum(
                len(r.diagnostics) for r in lint_results.values()
            )

            # Emit event
            await self._emit_event(
                project.path,
                "analysis_complete",
                {
                    "files_analyzed": len(results),
                    "docs_found": len(docs),
                    "symbols": sum(len(r.symbols) for r in results.values()),
                    "dependencies": sum(len(r.dependencies) for r in results.values()),
                    "diagnostics": total_diagnostics,
                },
            )

            logger.info(
                f"Analysis complete for {project.name}: "
                f"{len(results)} files, {len(docs)} docs, {total_diagnostics} diagnostics"
            )

        except Exception as e:
            logger.error(f"Error analyzing project {project.name}: {e}")
            await self._emit_event(
                project.path, "analysis_error", {"error": str(e)}
            )

        finally:
            project.is_analyzing = False

    def _start_watching(self, project: Project):
        """Start watching a project for file changes."""
        if project.path in self._watch_tasks:
            return

        task = asyncio.create_task(self._watch_project(project))
        self._watch_tasks[project.path] = task
        project.is_watching = True

    async def _watch_project(self, project: Project):
        """Watch a project for file changes and update analysis."""
        try:
            async for changes in awatch(project.path):
                if not self._running:
                    break

                for change_type, changed_path in changes:
                    await self._handle_file_change(project, change_type, changed_path)

        except asyncio.CancelledError:
            logger.info(f"Watch task cancelled for {project.name}")
        except Exception as e:
            logger.error(f"Error watching project {project.name}: {e}")
        finally:
            project.is_watching = False

    async def _handle_file_change(
        self, project: Project, change_type: Change, file_path: str
    ):
        """Handle a file change event."""
        path = Path(file_path)

        # Ignore hidden files and directories
        if any(part.startswith(".") for part in path.parts):
            return

        # Ignore __pycache__ and other common ignore patterns
        ignore_patterns = {
            "__pycache__",
            ".git",
            ".venv",
            "venv",
            "node_modules",
            ".tox",
            ".pytest_cache",
            ".mypy_cache",
        }
        if any(part in ignore_patterns for part in path.parts):
            return

        logger.debug(f"File change detected: {change_type} {file_path}")

        # Handle Python files
        if path.suffix == ".py":
            if change_type in (Change.added, Change.modified):
                # Re-analyze the file
                result = await self._analyzer.analyze_single_file(file_path)
                project.analysis_results[file_path] = result

                # Re-lint the file
                lint_result = await self._linter.lint_single_file(file_path)
                project.lint_results[file_path] = lint_result

                await self._emit_event(
                    project.path,
                    "file_updated",
                    {
                        "file": file_path,
                        "symbols": len(result.symbols),
                        "dependencies": len(result.dependencies),
                        "diagnostics": len(lint_result.diagnostics),
                    },
                )

            elif change_type == Change.deleted:
                project.analysis_results.pop(file_path, None)
                project.lint_results.pop(file_path, None)
                await self._emit_event(
                    project.path, "file_deleted", {"file": file_path}
                )

        # Handle documentation files
        elif path.suffix.lower() in {".md", ".rst", ".txt", ".markdown"}:
            if change_type in (Change.added, Change.modified):
                doc = await self._doc_reader.read_doc_file(file_path)
                project.documentation[file_path] = doc

                await self._emit_event(
                    project.path,
                    "doc_updated",
                    {"file": file_path, "title": doc.title},
                )

            elif change_type == Change.deleted:
                project.documentation.pop(file_path, None)
                await self._emit_event(
                    project.path, "doc_deleted", {"file": file_path}
                )

    async def refresh_project(self, project_path: str) -> bool:
        """Force a full refresh of a project's analysis."""
        path = Path(project_path).resolve()
        path_str = str(path)

        if path_str not in self._projects:
            return False

        project = self._projects[path_str]
        await self._initial_analysis(project)
        return True

    def get_project(self, project_path: str) -> Project | None:
        """Get a project by path."""
        path = Path(project_path).resolve()
        return self._projects.get(str(path))

    def get_all_symbols(self, project_path: str) -> list[dict]:
        """Get all symbols from a project."""
        project = self.get_project(project_path)
        if not project:
            return []

        symbols = []
        for result in project.analysis_results.values():
            for symbol in result.symbols:
                symbols.append(
                    {
                        "name": symbol.name,
                        "kind": symbol.kind,
                        "file": symbol.file_path,
                        "line": symbol.line,
                        "column": symbol.column,
                        "docstring": symbol.docstring,
                        "parent": symbol.parent,
                        "signature": symbol.signature,
                    }
                )
        return symbols

    def get_all_dependencies(self, project_path: str) -> list[dict]:
        """Get all dependencies from a project."""
        project = self.get_project(project_path)
        if not project:
            return []

        deps = []
        seen = set()
        for result in project.analysis_results.values():
            for dep in result.dependencies:
                if dep.name not in seen:
                    deps.append(
                        {
                            "name": dep.name,
                            "alias": dep.alias,
                            "is_from_import": dep.is_from_import,
                            "imported_names": dep.imported_names,
                            "file": dep.file_path,
                        }
                    )
                    seen.add(dep.name)
        return deps

    def get_dependency_tree(self, project_path: str) -> dict:
        """Get the dependency tree for a project."""
        return self._analyzer.build_dependency_tree(project_path)

    def get_all_docs(self, project_path: str) -> list[dict]:
        """Get all documentation from a project."""
        project = self.get_project(project_path)
        if not project:
            return []

        docs = []
        for file_path, doc in project.documentation.items():
            docs.append(
                {
                    "file": file_path,
                    "title": doc.title,
                    "sections": [
                        {"title": s.title, "level": s.level} for s in doc.sections
                    ],
                }
            )
        return docs

    def search_docs(
        self, project_path: str, query: str, case_sensitive: bool = False
    ) -> list[dict]:
        """Search documentation for a query."""
        return self._doc_reader.search_docs(project_path, query, case_sensitive)

    def get_all_diagnostics(self, project_path: str) -> list[dict[str, Any]]:
        """Get all lint diagnostics from a project."""
        project = self.get_project(project_path)
        if not project:
            return []

        diagnostics = []
        for result in project.lint_results.values():
            for diag in result.diagnostics:
                diagnostics.append(
                    {
                        "file": diag.file_path,
                        "line": diag.line,
                        "column": diag.column,
                        "end_line": diag.end_line,
                        "end_column": diag.end_column,
                        "severity": diag.severity,
                        "code": diag.code,
                        "message": diag.message,
                        "source": diag.source,
                    }
                )
        return diagnostics

    def get_diagnostics_by_severity(
        self, project_path: str, severity: str
    ) -> list[dict[str, Any]]:
        """Get diagnostics filtered by severity."""
        all_diags = self.get_all_diagnostics(project_path)
        return [d for d in all_diags if d["severity"] == severity]

    def get_diagnostics_by_file(
        self, project_path: str, file_path: str
    ) -> list[dict[str, Any]]:
        """Get diagnostics for a specific file."""
        all_diags = self.get_all_diagnostics(project_path)
        return [d for d in all_diags if d["file"] == file_path]

    def get_lint_summary(self, project_path: str) -> dict[str, Any]:
        """Get a summary of lint results for a project."""
        project = self.get_project(project_path)
        if not project:
            return {}

        summary: dict[str, Any] = {
            "files_linted": len(project.lint_results),
            "total_diagnostics": 0,
            "by_severity": {"error": 0, "warning": 0, "info": 0, "hint": 0},
            "by_source": {},
        }

        for result in project.lint_results.values():
            for diag in result.diagnostics:
                summary["total_diagnostics"] += 1
                summary["by_severity"][diag.severity] = (
                    summary["by_severity"].get(diag.severity, 0) + 1
                )
                summary["by_source"][diag.source] = (
                    summary["by_source"].get(diag.source, 0) + 1
                )

        return summary

    async def lint_file(self, file_path: str) -> list[dict[str, Any]]:
        """Lint a single file and return diagnostics."""
        result = await self._linter.lint_single_file(file_path)
        return [
            {
                "file": d.file_path,
                "line": d.line,
                "column": d.column,
                "severity": d.severity,
                "code": d.code,
                "message": d.message,
                "source": d.source,
            }
            for d in result.diagnostics
        ]
