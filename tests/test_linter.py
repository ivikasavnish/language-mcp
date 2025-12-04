"""Tests for the linter module."""

import pytest

from language_mcp.linter import PythonLinter, ProjectLinter, Diagnostic


class TestPythonLinter:
    """Test the PythonLinter class."""

    @pytest.fixture
    def linter(self):
        """Create a PythonLinter instance."""
        return PythonLinter()

    @pytest.fixture
    def sample_python_file_with_issues(self, tmp_path):
        """Create a sample Python file with linting issues."""
        content = '''
import os
import json  # unused

def my_function(a, b, c, d, e, f, g, h):
    """Function with too many args."""
    x = 1
    if True:
        if True:
            if True:
                if True:
                    if True:
                        print("deeply nested")
    return x

def no_type_hints(x, y):
    return x + y

class MyClass:
    def method(self):
        pass
'''
        file_path = tmp_path / "issues.py"
        file_path.write_text(content)
        return str(file_path)

    @pytest.fixture
    def sample_python_file_clean(self, tmp_path):
        """Create a clean Python file."""
        content = '''
"""A clean module."""

def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b
'''
        file_path = tmp_path / "clean.py"
        file_path.write_text(content)
        return str(file_path)

    @pytest.fixture
    def sample_python_file_syntax_error(self, tmp_path):
        """Create a Python file with syntax error."""
        content = '''
def broken(:
    pass
'''
        file_path = tmp_path / "broken.py"
        file_path.write_text(content)
        return str(file_path)

    @pytest.mark.asyncio
    async def test_lint_file_finds_unused_imports(
        self, linter, sample_python_file_with_issues
    ):
        """Test that linter finds unused imports."""
        result = await linter.lint_file(sample_python_file_with_issues)

        assert len(result.errors) == 0
        unused_import_diags = [
            d for d in result.diagnostics if d.code == "W001"
        ]
        assert len(unused_import_diags) >= 1
        assert any("json" in d.message for d in unused_import_diags)

    @pytest.mark.asyncio
    async def test_lint_file_finds_too_many_args(
        self, linter, sample_python_file_with_issues
    ):
        """Test that linter finds functions with too many arguments."""
        result = await linter.lint_file(sample_python_file_with_issues)

        too_many_args = [d for d in result.diagnostics if d.code == "C901"]
        assert len(too_many_args) >= 1
        assert any("too many arguments" in d.message for d in too_many_args)

    @pytest.mark.asyncio
    async def test_lint_file_finds_deep_nesting(
        self, linter, sample_python_file_with_issues
    ):
        """Test that linter finds deeply nested code."""
        result = await linter.lint_file(sample_python_file_with_issues)

        deep_nesting = [d for d in result.diagnostics if d.code == "C903"]
        assert len(deep_nesting) >= 1
        assert any("nesting" in d.message for d in deep_nesting)

    @pytest.mark.asyncio
    async def test_lint_file_finds_missing_type_hints(
        self, linter, sample_python_file_with_issues
    ):
        """Test that linter finds missing type hints."""
        result = await linter.lint_file(sample_python_file_with_issues)

        type_hints = [d for d in result.diagnostics if d.source == "type-hints"]
        assert len(type_hints) >= 1

    @pytest.mark.asyncio
    async def test_lint_file_finds_syntax_errors(
        self, linter, sample_python_file_syntax_error
    ):
        """Test that linter finds syntax errors."""
        result = await linter.lint_file(sample_python_file_syntax_error)

        syntax_errors = [d for d in result.diagnostics if d.code == "E001"]
        assert len(syntax_errors) == 1
        assert syntax_errors[0].severity == "error"

    @pytest.mark.asyncio
    async def test_lint_clean_file(self, linter, sample_python_file_clean):
        """Test linting a clean file."""
        result = await linter.lint_file(sample_python_file_clean)

        # Should have minimal issues (possibly only minor style hints)
        errors = [d for d in result.diagnostics if d.severity == "error"]
        assert len(errors) == 0

    @pytest.mark.asyncio
    async def test_lint_nonexistent_file(self, linter):
        """Test linting a non-existent file."""
        result = await linter.lint_file("/nonexistent/file.py")
        assert len(result.errors) > 0
        assert "does not exist" in result.errors[0]


class TestProjectLinter:
    """Test the ProjectLinter class."""

    @pytest.fixture
    def linter(self):
        """Create a ProjectLinter instance."""
        return ProjectLinter()

    @pytest.fixture
    def sample_project(self, tmp_path):
        """Create a sample project with multiple files."""
        # File with issues
        file1 = tmp_path / "module1.py"
        file1.write_text('''
import os  # unused

def func1(a, b):
    return a + b
''')

        # Another file
        file2 = tmp_path / "module2.py"
        file2.write_text('''
def func2(x: int) -> int:
    """A typed function."""
    return x * 2
''')

        # Create a __pycache__ directory that should be ignored
        pycache = tmp_path / "__pycache__"
        pycache.mkdir()
        (pycache / "module.cpython-312.pyc").write_text("binary")

        return tmp_path

    @pytest.mark.asyncio
    async def test_lint_project(self, linter, sample_project):
        """Test linting an entire project."""
        results = await linter.lint_project(str(sample_project))

        # Should have linted 2 Python files
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_lint_project_ignores_pycache(self, linter, sample_project):
        """Test that __pycache__ is ignored."""
        results = await linter.lint_project(str(sample_project))

        for path in results.keys():
            assert "__pycache__" not in path

    @pytest.mark.asyncio
    async def test_get_all_diagnostics(self, linter, sample_project):
        """Test getting all diagnostics from a project."""
        await linter.lint_project(str(sample_project))
        diagnostics = linter.get_all_diagnostics(str(sample_project))

        # Should have at least one diagnostic (unused import)
        assert len(diagnostics) >= 1

    @pytest.mark.asyncio
    async def test_get_lint_summary(self, linter, sample_project):
        """Test getting lint summary."""
        await linter.lint_project(str(sample_project))
        summary = linter.get_lint_summary(str(sample_project))

        assert "files_linted" in summary
        assert "total_diagnostics" in summary
        assert "by_severity" in summary
        assert summary["files_linted"] == 2
