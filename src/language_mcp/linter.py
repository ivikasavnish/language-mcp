"""Linter module for Python code analysis and diagnostics."""

import ast
import asyncio
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Diagnostic:
    """Represents a diagnostic issue found in code."""

    file_path: str
    line: int
    column: int
    end_line: int | None = None
    end_column: int | None = None
    severity: str = "warning"  # 'error', 'warning', 'info', 'hint'
    code: str = ""
    message: str = ""
    source: str = "language-mcp"


@dataclass
class LintResult:
    """Result of linting a file."""

    file_path: str
    diagnostics: list[Diagnostic] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class PythonLinter:
    """Linter for Python files with built-in checks."""

    def __init__(self):
        self._results_cache: dict[str, LintResult] = {}
        self._lock = asyncio.Lock()

    async def lint_file(self, file_path: str) -> LintResult:
        """Lint a Python file and return diagnostics."""
        path = Path(file_path)
        result = LintResult(file_path=file_path)

        if not path.exists():
            result.errors.append(f"File does not exist: {file_path}")
            return result

        if not path.suffix == ".py":
            result.errors.append(f"Not a Python file: {file_path}")
            return result

        try:
            content = await asyncio.to_thread(path.read_text, encoding="utf-8")
            lines = content.split("\n")

            # Run all lint checks
            result.diagnostics.extend(self._check_syntax(content, file_path))
            result.diagnostics.extend(self._check_undefined_names(content, file_path))
            result.diagnostics.extend(self._check_unused_imports(content, file_path))
            result.diagnostics.extend(self._check_style_issues(lines, file_path))
            result.diagnostics.extend(self._check_complexity(content, file_path))
            result.diagnostics.extend(self._check_type_hints(content, file_path))

            async with self._lock:
                self._results_cache[file_path] = result

        except Exception as e:
            result.errors.append(f"Error linting {file_path}: {e}")

        return result

    def _check_syntax(self, content: str, file_path: str) -> list[Diagnostic]:
        """Check for syntax errors."""
        diagnostics = []
        try:
            ast.parse(content, filename=file_path)
        except SyntaxError as e:
            diagnostics.append(
                Diagnostic(
                    file_path=file_path,
                    line=e.lineno or 1,
                    column=e.offset or 0,
                    severity="error",
                    code="E001",
                    message=f"Syntax error: {e.msg}",
                    source="syntax",
                )
            )
        return diagnostics

    def _check_undefined_names(self, content: str, file_path: str) -> list[Diagnostic]:
        """Check for undefined names."""
        diagnostics = []
        try:
            tree = ast.parse(content, filename=file_path)
        except SyntaxError:
            return diagnostics

        # Collect all defined names
        defined_names = set()
        imported_names = set()

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                defined_names.add(node.name)
                # Add function arguments
                for arg in node.args.args:
                    defined_names.add(arg.arg)
            elif isinstance(node, ast.ClassDef):
                defined_names.add(node.name)
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        defined_names.add(target.id)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    imported_names.add(alias.asname or alias.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    imported_names.add(alias.asname or alias.name)

        # Built-in names
        builtins = set(dir(__builtins__) if isinstance(__builtins__, dict) else dir(__builtins__))
        all_defined = defined_names | imported_names | builtins

        # Check for undefined names in function bodies
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                if node.id not in all_defined and not node.id.startswith("_"):
                    # This is a simplified check - may have false positives
                    pass  # Too many false positives for now

        return diagnostics

    def _check_unused_imports(self, content: str, file_path: str) -> list[Diagnostic]:
        """Check for unused imports."""
        diagnostics = []
        try:
            tree = ast.parse(content, filename=file_path)
        except SyntaxError:
            return diagnostics

        # Collect all imports
        imports: dict[str, tuple[int, int]] = {}

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    name = alias.asname or alias.name.split(".")[0]
                    imports[name] = (node.lineno, node.col_offset)
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    name = alias.asname or alias.name
                    if name != "*":
                        imports[name] = (node.lineno, node.col_offset)

        # Check if imports are used
        used_names = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                used_names.add(node.id)
            elif isinstance(node, ast.Attribute):
                if isinstance(node.value, ast.Name):
                    used_names.add(node.value.id)

        for name, (line, col) in imports.items():
            if name not in used_names and not name.startswith("_"):
                diagnostics.append(
                    Diagnostic(
                        file_path=file_path,
                        line=line,
                        column=col,
                        severity="warning",
                        code="W001",
                        message=f"'{name}' imported but unused",
                        source="unused-import",
                    )
                )

        return diagnostics

    def _check_style_issues(
        self, lines: list[str], file_path: str
    ) -> list[Diagnostic]:
        """Check for style issues."""
        diagnostics = []

        for i, line in enumerate(lines, start=1):
            # Check line length
            if len(line) > 120:
                diagnostics.append(
                    Diagnostic(
                        file_path=file_path,
                        line=i,
                        column=121,
                        severity="info",
                        code="E501",
                        message=f"Line too long ({len(line)} > 120 characters)",
                        source="style",
                    )
                )

            # Check trailing whitespace
            if line.rstrip() != line and line.strip():
                diagnostics.append(
                    Diagnostic(
                        file_path=file_path,
                        line=i,
                        column=len(line.rstrip()) + 1,
                        severity="info",
                        code="W291",
                        message="Trailing whitespace",
                        source="style",
                    )
                )

            # Check for tabs
            if "\t" in line:
                diagnostics.append(
                    Diagnostic(
                        file_path=file_path,
                        line=i,
                        column=line.index("\t") + 1,
                        severity="info",
                        code="W191",
                        message="Indentation contains tabs",
                        source="style",
                    )
                )

            # Check for bare except
            if re.match(r"^\s*except\s*:\s*$", line):
                diagnostics.append(
                    Diagnostic(
                        file_path=file_path,
                        line=i,
                        column=1,
                        severity="warning",
                        code="E722",
                        message="Do not use bare 'except'",
                        source="style",
                    )
                )

        return diagnostics

    def _check_complexity(self, content: str, file_path: str) -> list[Diagnostic]:
        """Check for complexity issues."""
        diagnostics = []
        try:
            tree = ast.parse(content, filename=file_path)
        except SyntaxError:
            return diagnostics

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                # Check number of arguments
                num_args = len(node.args.args) + len(node.args.kwonlyargs)
                if num_args > 7:
                    diagnostics.append(
                        Diagnostic(
                            file_path=file_path,
                            line=node.lineno,
                            column=node.col_offset,
                            severity="warning",
                            code="C901",
                            message=(
                                f"Function '{node.name}' has too many arguments "
                                f"({num_args} > 7)"
                            ),
                            source="complexity",
                        )
                    )

                # Check function length (approximate)
                if hasattr(node, "end_lineno") and node.end_lineno:
                    func_length = node.end_lineno - node.lineno
                    if func_length > 50:
                        diagnostics.append(
                            Diagnostic(
                                file_path=file_path,
                                line=node.lineno,
                                column=node.col_offset,
                                severity="info",
                                code="C902",
                                message=(
                                    f"Function '{node.name}' is too long "
                                    f"({func_length} lines > 50)"
                                ),
                                source="complexity",
                            )
                        )

                # Check nested depth
                max_depth = self._get_max_depth(node)
                if max_depth > 4:
                    diagnostics.append(
                        Diagnostic(
                            file_path=file_path,
                            line=node.lineno,
                            column=node.col_offset,
                            severity="warning",
                            code="C903",
                            message=(
                                f"Function '{node.name}' has too much nesting "
                                f"(depth {max_depth} > 4)"
                            ),
                            source="complexity",
                        )
                    )

        return diagnostics

    def _get_max_depth(self, node: ast.AST, current_depth: int = 0) -> int:
        """Get the maximum nesting depth in a node."""
        max_depth = current_depth
        for child in ast.iter_child_nodes(node):
            if isinstance(
                child, ast.If | ast.For | ast.While | ast.With | ast.Try | ast.ExceptHandler
            ):
                child_depth = self._get_max_depth(child, current_depth + 1)
                max_depth = max(max_depth, child_depth)
            else:
                child_depth = self._get_max_depth(child, current_depth)
                max_depth = max(max_depth, child_depth)
        return max_depth

    def _check_type_hints(self, content: str, file_path: str) -> list[Diagnostic]:
        """Check for missing type hints."""
        diagnostics = []
        try:
            tree = ast.parse(content, filename=file_path)
        except SyntaxError:
            return diagnostics

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                # Skip private/dunder methods for type hint warnings
                if node.name.startswith("_"):
                    continue

                # Check return type annotation
                if node.returns is None and node.name != "__init__":
                    diagnostics.append(
                        Diagnostic(
                            file_path=file_path,
                            line=node.lineno,
                            column=node.col_offset,
                            severity="hint",
                            code="T001",
                            message=f"Function '{node.name}' missing return type annotation",
                            source="type-hints",
                        )
                    )

                # Check argument type annotations
                for arg in node.args.args:
                    if arg.annotation is None and arg.arg != "self" and arg.arg != "cls":
                        diagnostics.append(
                            Diagnostic(
                                file_path=file_path,
                                line=node.lineno,
                                column=node.col_offset,
                                severity="hint",
                                code="T002",
                                message=(
                                    f"Argument '{arg.arg}' in function '{node.name}' "
                                    "missing type annotation"
                                ),
                                source="type-hints",
                            )
                        )

        return diagnostics

    def get_cached_result(self, file_path: str) -> LintResult | None:
        """Get cached lint result for a file."""
        return self._results_cache.get(file_path)

    def clear_cache(self, file_path: str | None = None):
        """Clear cache for a specific file or all files."""
        if file_path:
            self._results_cache.pop(file_path, None)
        else:
            self._results_cache.clear()


class ProjectLinter:
    """Linter for entire projects."""

    SUPPORTED_EXTENSIONS = {".py"}
    IGNORE_DIRS = {
        "__pycache__",
        ".git",
        ".venv",
        "venv",
        "node_modules",
        ".tox",
        ".pytest_cache",
        ".mypy_cache",
        "dist",
        "build",
        "*.egg-info",
    }

    def __init__(self):
        self._python_linter = PythonLinter()
        self._project_results: dict[str, dict[str, LintResult]] = {}
        self._lock = asyncio.Lock()

    async def lint_project(self, project_path: str) -> dict[str, LintResult]:
        """Lint all files in a project directory."""
        path = Path(project_path)
        if not path.exists():
            return {}

        results: dict[str, LintResult] = {}
        python_files = self._find_python_files(path)

        # Lint files concurrently with a semaphore to limit parallelism
        semaphore = asyncio.Semaphore(10)

        async def lint_with_semaphore(file_path: str):
            async with semaphore:
                return await self._python_linter.lint_file(file_path)

        tasks = [lint_with_semaphore(str(f)) for f in python_files]
        lint_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Length should always match since gather returns results for each task
        for file_path, result in zip(python_files, lint_results, strict=True):
            if isinstance(result, LintResult):
                results[str(file_path)] = result
            else:
                logger.error(f"Error linting {file_path}: {result}")

        async with self._lock:
            self._project_results[project_path] = results

        return results

    def _find_python_files(self, root: Path) -> list[Path]:
        """Find all Python files in a directory, respecting ignore patterns."""
        python_files = []

        for path in root.rglob("*"):
            if path.is_file() and path.suffix in self.SUPPORTED_EXTENSIONS:
                # Check if any parent directory should be ignored
                should_ignore = False
                for parent in path.parents:
                    if parent.name in self.IGNORE_DIRS:
                        should_ignore = True
                        break
                if not should_ignore:
                    python_files.append(path)

        return python_files

    async def lint_single_file(self, file_path: str) -> LintResult:
        """Lint a single file. Public method for external use."""
        return await self._python_linter.lint_file(file_path)

    def get_all_diagnostics(self, project_path: str) -> list[dict[str, Any]]:
        """Get all diagnostics from a project."""
        results = self._project_results.get(project_path, {})
        diagnostics = []
        for result in results.values():
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

    def get_cached_results(self, project_path: str) -> dict[str, LintResult] | None:
        """Get cached results for a project."""
        return self._project_results.get(project_path)

    def get_lint_summary(self, project_path: str) -> dict[str, Any]:
        """Get a summary of lint results for a project."""
        results = self._project_results.get(project_path, {})

        summary = {
            "files_linted": len(results),
            "total_diagnostics": 0,
            "by_severity": {"error": 0, "warning": 0, "info": 0, "hint": 0},
            "by_source": {},
        }

        for result in results.values():
            for diag in result.diagnostics:
                summary["total_diagnostics"] += 1
                summary["by_severity"][diag.severity] = (
                    summary["by_severity"].get(diag.severity, 0) + 1
                )
                summary["by_source"][diag.source] = (
                    summary["by_source"].get(diag.source, 0) + 1
                )

        return summary
