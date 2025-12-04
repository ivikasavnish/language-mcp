"""Tests for the AST analyzer module."""


import pytest

from language_mcp.analyzer import ProjectAnalyzer, PythonAnalyzer


class TestPythonAnalyzer:
    """Test the PythonAnalyzer class."""

    @pytest.fixture
    def analyzer(self):
        """Create a PythonAnalyzer instance."""
        return PythonAnalyzer()

    @pytest.fixture
    def sample_python_file(self, tmp_path):
        """Create a sample Python file for testing."""
        content = '''
"""Module docstring."""

import os
from pathlib import Path

MY_CONSTANT = 42


class MyClass:
    """A sample class."""

    def my_method(self, x: int) -> str:
        """A sample method."""
        return str(x)


def my_function(a: str, b: int = 10) -> bool:
    """A sample function."""
    return len(a) > b


async def async_func():
    """An async function."""
    pass
'''
        file_path = tmp_path / "sample.py"
        file_path.write_text(content)
        return str(file_path)

    @pytest.mark.asyncio
    async def test_analyze_file_extracts_symbols(self, analyzer, sample_python_file):
        """Test that analyze_file correctly extracts symbols."""
        result = await analyzer.analyze_file(sample_python_file)

        assert result.file_path == sample_python_file
        assert len(result.errors) == 0

        # Check we found all expected symbols
        symbol_names = {s.name for s in result.symbols}
        assert "MyClass" in symbol_names
        assert "my_method" in symbol_names
        assert "my_function" in symbol_names
        assert "async_func" in symbol_names
        assert "MY_CONSTANT" in symbol_names

    @pytest.mark.asyncio
    async def test_analyze_file_extracts_dependencies(self, analyzer, sample_python_file):
        """Test that analyze_file correctly extracts dependencies."""
        result = await analyzer.analyze_file(sample_python_file)

        dep_names = {d.name for d in result.dependencies}
        assert "os" in dep_names
        assert "pathlib" in dep_names

    @pytest.mark.asyncio
    async def test_analyze_file_extracts_docstrings(self, analyzer, sample_python_file):
        """Test that analyze_file extracts docstrings."""
        result = await analyzer.analyze_file(sample_python_file)

        my_class = next(s for s in result.symbols if s.name == "MyClass")
        assert my_class.docstring == "A sample class."

        my_function = next(s for s in result.symbols if s.name == "my_function")
        assert my_function.docstring == "A sample function."

    @pytest.mark.asyncio
    async def test_analyze_file_extracts_signatures(self, analyzer, sample_python_file):
        """Test that analyze_file extracts function signatures."""
        result = await analyzer.analyze_file(sample_python_file)

        my_function = next(s for s in result.symbols if s.name == "my_function")
        assert "def my_function" in my_function.signature
        assert "a: str" in my_function.signature
        assert "-> bool" in my_function.signature

    @pytest.mark.asyncio
    async def test_analyze_nonexistent_file(self, analyzer):
        """Test analyzing a non-existent file."""
        result = await analyzer.analyze_file("/nonexistent/file.py")
        assert len(result.errors) > 0
        assert "does not exist" in result.errors[0]

    @pytest.mark.asyncio
    async def test_analyze_non_python_file(self, analyzer, tmp_path):
        """Test analyzing a non-Python file."""
        file_path = tmp_path / "readme.txt"
        file_path.write_text("Hello world")

        result = await analyzer.analyze_file(str(file_path))
        assert len(result.errors) > 0
        assert "Not a Python file" in result.errors[0]

    @pytest.mark.asyncio
    async def test_analyze_syntax_error(self, analyzer, tmp_path):
        """Test analyzing a file with syntax errors."""
        file_path = tmp_path / "bad.py"
        file_path.write_text("def foo(:\n    pass")

        result = await analyzer.analyze_file(str(file_path))
        assert len(result.errors) > 0
        assert "Syntax error" in result.errors[0]


class TestProjectAnalyzer:
    """Test the ProjectAnalyzer class."""

    @pytest.fixture
    def analyzer(self):
        """Create a ProjectAnalyzer instance."""
        return ProjectAnalyzer()

    @pytest.fixture
    def sample_project(self, tmp_path):
        """Create a sample project directory."""
        # Create main module
        main_py = tmp_path / "main.py"
        main_py.write_text('''
import os
from helper import do_something

def main():
    do_something()
''')

        # Create helper module
        helper_py = tmp_path / "helper.py"
        helper_py.write_text('''
def do_something():
    print("Hello")
''')

        # Create a __pycache__ directory that should be ignored
        pycache = tmp_path / "__pycache__"
        pycache.mkdir()
        (pycache / "main.cpython-312.pyc").write_text("binary")

        return tmp_path

    @pytest.mark.asyncio
    async def test_analyze_project(self, analyzer, sample_project):
        """Test analyzing a complete project."""
        results = await analyzer.analyze_project(str(sample_project))

        # Should have found 2 Python files
        assert len(results) == 2

        # Check main.py was analyzed
        main_path = str(sample_project / "main.py")
        assert main_path in results
        assert any(s.name == "main" for s in results[main_path].symbols)

    @pytest.mark.asyncio
    async def test_ignores_pycache(self, analyzer, sample_project):
        """Test that __pycache__ is ignored."""
        results = await analyzer.analyze_project(str(sample_project))

        # No file paths should contain __pycache__
        for path in results.keys():
            assert "__pycache__" not in path

    @pytest.mark.asyncio
    async def test_get_project_symbols(self, analyzer, sample_project):
        """Test getting all symbols from a project."""
        await analyzer.analyze_project(str(sample_project))
        symbols = analyzer.get_project_symbols(str(sample_project))

        symbol_names = {s.name for s in symbols}
        assert "main" in symbol_names
        assert "do_something" in symbol_names

    @pytest.mark.asyncio
    async def test_build_dependency_tree(self, analyzer, sample_project):
        """Test building the dependency tree."""
        await analyzer.analyze_project(str(sample_project))
        tree = analyzer.build_dependency_tree(str(sample_project))

        assert "project" in tree
        assert "files" in tree
        assert "external_dependencies" in tree
        assert "os" in tree["external_dependencies"]
