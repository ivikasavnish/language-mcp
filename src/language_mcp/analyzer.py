"""AST analyzer module for parsing and analyzing code files."""

import ast
import asyncio
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Symbol:
    """Represents a code symbol (function, class, variable, etc.)."""

    name: str
    kind: str  # 'function', 'class', 'variable', 'method', 'import'
    line: int
    column: int
    file_path: str
    docstring: str | None = None
    parent: str | None = None  # For nested symbols (methods in classes)
    signature: str | None = None  # For functions/methods


@dataclass
class Dependency:
    """Represents a dependency (import)."""

    name: str
    alias: str | None
    is_from_import: bool
    imported_names: list[str] = field(default_factory=list)
    file_path: str = ""


@dataclass
class AnalysisResult:
    """Result of analyzing a file."""

    file_path: str
    symbols: list[Symbol] = field(default_factory=list)
    dependencies: list[Dependency] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    last_modified: float = 0.0


class PythonAnalyzer:
    """Analyzer for Python files using AST."""

    def __init__(self):
        self._results_cache: dict[str, AnalysisResult] = {}
        self._lock = asyncio.Lock()

    async def analyze_file(self, file_path: str) -> AnalysisResult:
        """Analyze a Python file and extract symbols and dependencies."""
        path = Path(file_path)
        result = AnalysisResult(file_path=file_path)

        if not path.exists():
            result.errors.append(f"File does not exist: {file_path}")
            return result

        if not path.suffix == ".py":
            result.errors.append(f"Not a Python file: {file_path}")
            return result

        try:
            result.last_modified = path.stat().st_mtime
            content = await asyncio.to_thread(path.read_text, encoding="utf-8")
            tree = ast.parse(content, filename=file_path)

            # Extract symbols and dependencies
            result.symbols = self._extract_symbols(tree, file_path)
            result.dependencies = self._extract_dependencies(tree, file_path)

            async with self._lock:
                self._results_cache[file_path] = result

        except SyntaxError as e:
            result.errors.append(f"Syntax error in {file_path}: {e}")
        except Exception as e:
            result.errors.append(f"Error analyzing {file_path}: {e}")

        return result

    def _extract_symbols(self, tree: ast.AST, file_path: str) -> list[Symbol]:
        """Extract symbols from AST."""
        symbols = []

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                # Check if it's a method (inside a class)
                parent = self._find_parent_class(tree, node)
                symbols.append(
                    Symbol(
                        name=node.name,
                        kind="method" if parent else "function",
                        line=node.lineno,
                        column=node.col_offset,
                        file_path=file_path,
                        docstring=ast.get_docstring(node),
                        parent=parent,
                        signature=self._get_function_signature(node),
                    )
                )
            elif isinstance(node, ast.ClassDef):
                symbols.append(
                    Symbol(
                        name=node.name,
                        kind="class",
                        line=node.lineno,
                        column=node.col_offset,
                        file_path=file_path,
                        docstring=ast.get_docstring(node),
                    )
                )
            elif isinstance(node, ast.Assign):
                # Module-level variables
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        symbols.append(
                            Symbol(
                                name=target.id,
                                kind="variable",
                                line=node.lineno,
                                column=node.col_offset,
                                file_path=file_path,
                            )
                        )

        return symbols

    def _find_parent_class(self, tree: ast.AST, node: ast.AST) -> str | None:
        """Find if a node is inside a class definition."""
        for parent in ast.walk(tree):
            if isinstance(parent, ast.ClassDef):
                for child in ast.iter_child_nodes(parent):
                    if child is node:
                        return parent.name
        return None

    def _get_function_signature(
        self, node: ast.FunctionDef | ast.AsyncFunctionDef
    ) -> str:
        """Extract function signature."""
        args = []
        for arg in node.args.args:
            arg_str = arg.arg
            if arg.annotation:
                try:
                    arg_str += f": {ast.unparse(arg.annotation)}"
                except Exception:
                    pass
            args.append(arg_str)

        returns = ""
        if node.returns:
            try:
                returns = f" -> {ast.unparse(node.returns)}"
            except Exception:
                pass

        prefix = "async " if isinstance(node, ast.AsyncFunctionDef) else ""
        return f"{prefix}def {node.name}({', '.join(args)}){returns}"

    def _extract_dependencies(self, tree: ast.AST, file_path: str) -> list[Dependency]:
        """Extract import dependencies from AST."""
        dependencies = []

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    dependencies.append(
                        Dependency(
                            name=alias.name,
                            alias=alias.asname,
                            is_from_import=False,
                            file_path=file_path,
                        )
                    )
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imported_names = [alias.name for alias in node.names]
                    dependencies.append(
                        Dependency(
                            name=node.module,
                            alias=None,
                            is_from_import=True,
                            imported_names=imported_names,
                            file_path=file_path,
                        )
                    )

        return dependencies

    def get_cached_result(self, file_path: str) -> AnalysisResult | None:
        """Get cached analysis result for a file."""
        return self._results_cache.get(file_path)

    def clear_cache(self, file_path: str | None = None):
        """Clear cache for a specific file or all files."""
        if file_path:
            self._results_cache.pop(file_path, None)
        else:
            self._results_cache.clear()


class ProjectAnalyzer:
    """Analyzer for entire projects."""

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
        self._python_analyzer = PythonAnalyzer()
        self._project_results: dict[str, dict[str, AnalysisResult]] = {}
        self._lock = asyncio.Lock()

    async def analyze_project(self, project_path: str) -> dict[str, AnalysisResult]:
        """Analyze all files in a project directory."""
        path = Path(project_path)
        if not path.exists():
            return {}

        results: dict[str, AnalysisResult] = {}
        python_files = self._find_python_files(path)

        # Analyze files concurrently with a semaphore to limit parallelism
        semaphore = asyncio.Semaphore(10)

        async def analyze_with_semaphore(file_path: str):
            async with semaphore:
                return await self._python_analyzer.analyze_file(file_path)

        tasks = [analyze_with_semaphore(str(f)) for f in python_files]
        analysis_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Length should always match since gather returns results for each task
        for file_path, result in zip(python_files, analysis_results, strict=True):
            if isinstance(result, AnalysisResult):
                results[str(file_path)] = result
            else:
                logger.error(f"Error analyzing {file_path}: {result}")

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

    def get_project_symbols(self, project_path: str) -> list[Symbol]:
        """Get all symbols from a project."""
        results = self._project_results.get(project_path, {})
        symbols = []
        for result in results.values():
            symbols.extend(result.symbols)
        return symbols

    def get_project_dependencies(self, project_path: str) -> list[Dependency]:
        """Get all dependencies from a project."""
        results = self._project_results.get(project_path, {})
        dependencies = []
        seen = set()
        for result in results.values():
            for dep in result.dependencies:
                if dep.name not in seen:
                    dependencies.append(dep)
                    seen.add(dep.name)
        return dependencies

    def build_dependency_tree(
        self, project_path: str
    ) -> dict[str, Any]:
        """Build a dependency tree for the project."""
        results = self._project_results.get(project_path, {})

        # Build file -> dependencies mapping
        tree: dict[str, Any] = {
            "project": project_path,
            "files": {},
            "external_dependencies": set(),
            "internal_modules": set(),
        }

        for file_path, result in results.items():
            rel_path = os.path.relpath(file_path, project_path)
            tree["files"][rel_path] = {
                "imports": [],
                "exports": [],
            }

            # Add imports
            for dep in result.dependencies:
                tree["files"][rel_path]["imports"].append(
                    {
                        "name": dep.name,
                        "from_import": dep.is_from_import,
                        "imported_names": dep.imported_names,
                    }
                )

                # Classify as internal or external
                if dep.name.startswith(".") or self._is_internal_module(
                    dep.name, project_path
                ):
                    tree["internal_modules"].add(dep.name)
                else:
                    tree["external_dependencies"].add(dep.name)

            # Add exports (public symbols)
            for symbol in result.symbols:
                if not symbol.name.startswith("_"):
                    tree["files"][rel_path]["exports"].append(
                        {
                            "name": symbol.name,
                            "kind": symbol.kind,
                        }
                    )

        # Convert sets to lists for JSON serialization
        tree["external_dependencies"] = sorted(tree["external_dependencies"])
        tree["internal_modules"] = sorted(tree["internal_modules"])

        return tree

    def _is_internal_module(self, module_name: str, project_path: str) -> bool:
        """Check if a module is internal to the project."""
        # Check if there's a corresponding file or package
        parts = module_name.split(".")
        path = Path(project_path)

        # Try as a package (directory with __init__.py)
        package_path = path / "/".join(parts)
        if package_path.is_dir() and (package_path / "__init__.py").exists():
            return True

        # Try as a module file
        module_path = path / "/".join(parts[:-1] if len(parts) > 1 else []) / f"{parts[-1]}.py"
        if module_path.exists():
            return True

        return False

    async def analyze_single_file(self, file_path: str) -> AnalysisResult:
        """Analyze a single file. Public method for external use."""
        return await self._python_analyzer.analyze_file(file_path)

    def get_cached_results(self, project_path: str) -> dict[str, AnalysisResult] | None:
        """Get cached results for a project."""
        return self._project_results.get(project_path)
