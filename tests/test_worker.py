"""Tests for the background worker module."""

import asyncio

import pytest

from language_mcp.worker import BackgroundWorker


class TestBackgroundWorker:
    """Test the BackgroundWorker class."""

    @pytest.fixture
    def worker(self):
        """Create a BackgroundWorker instance."""
        return BackgroundWorker()

    @pytest.fixture
    def sample_project(self, tmp_path):
        """Create a sample project directory."""
        # Create a Python file
        main_py = tmp_path / "main.py"
        main_py.write_text('''
def main():
    """Main function."""
    print("Hello, world!")


class MyClass:
    """A sample class."""
    pass
''')

        # Create a README
        readme = tmp_path / "README.md"
        readme.write_text("# Test Project\n\nA test project.")

        return tmp_path

    @pytest.mark.asyncio
    async def test_add_project(self, worker, sample_project):
        """Test adding a project."""
        await worker.start()
        try:
            project = await worker.add_project(str(sample_project))

            assert project.path == str(sample_project.resolve())
            assert project.name == sample_project.name
            assert str(sample_project.resolve()) in worker.projects
        finally:
            await worker.stop()

    @pytest.mark.asyncio
    async def test_add_project_with_name(self, worker, sample_project):
        """Test adding a project with a custom name."""
        await worker.start()
        try:
            project = await worker.add_project(str(sample_project), name="my-project")

            assert project.name == "my-project"
        finally:
            await worker.stop()

    @pytest.mark.asyncio
    async def test_remove_project(self, worker, sample_project):
        """Test removing a project."""
        await worker.start()
        try:
            await worker.add_project(str(sample_project))
            removed = await worker.remove_project(str(sample_project))

            assert removed is True
            assert str(sample_project.resolve()) not in worker.projects
        finally:
            await worker.stop()

    @pytest.mark.asyncio
    async def test_remove_nonexistent_project(self, worker):
        """Test removing a project that doesn't exist."""
        await worker.start()
        try:
            removed = await worker.remove_project("/nonexistent/path")
            assert removed is False
        finally:
            await worker.stop()

    @pytest.mark.asyncio
    async def test_initial_analysis_runs(self, worker, sample_project):
        """Test that initial analysis runs when a project is added."""
        await worker.start()
        try:
            await worker.add_project(str(sample_project))

            # Wait a bit for analysis to complete
            await asyncio.sleep(0.5)

            # Should have analysis results
            symbols = worker.get_all_symbols(str(sample_project))
            assert len(symbols) > 0

            # Should have found our function and class
            symbol_names = {s["name"] for s in symbols}
            assert "main" in symbol_names
            assert "MyClass" in symbol_names
        finally:
            await worker.stop()

    @pytest.mark.asyncio
    async def test_get_all_dependencies(self, worker, tmp_path):
        """Test getting all dependencies."""
        # Create a file with imports
        main_py = tmp_path / "main.py"
        main_py.write_text('''
import os
import json
from pathlib import Path
''')

        await worker.start()
        try:
            await worker.add_project(str(tmp_path))
            await asyncio.sleep(0.5)

            deps = worker.get_all_dependencies(str(tmp_path))
            dep_names = {d["name"] for d in deps}

            assert "os" in dep_names
            assert "json" in dep_names
            assert "pathlib" in dep_names
        finally:
            await worker.stop()

    @pytest.mark.asyncio
    async def test_get_all_docs(self, worker, sample_project):
        """Test getting all documentation."""
        await worker.start()
        try:
            await worker.add_project(str(sample_project))
            await asyncio.sleep(0.5)

            docs = worker.get_all_docs(str(sample_project))
            assert len(docs) > 0

            # Should have found the README
            assert any("README.md" in d["file"] for d in docs)
        finally:
            await worker.stop()

    @pytest.mark.asyncio
    async def test_refresh_project(self, worker, sample_project):
        """Test refreshing a project."""
        await worker.start()
        try:
            await worker.add_project(str(sample_project))
            await asyncio.sleep(0.5)

            # Add a new file
            new_file = sample_project / "new_file.py"
            new_file.write_text("def new_function(): pass")

            # Refresh
            refreshed = await worker.refresh_project(str(sample_project))
            assert refreshed is True

            # Wait for refresh
            await asyncio.sleep(0.5)

            # Should now include the new symbol
            symbols = worker.get_all_symbols(str(sample_project))
            symbol_names = {s["name"] for s in symbols}
            assert "new_function" in symbol_names
        finally:
            await worker.stop()

    @pytest.mark.asyncio
    async def test_event_handler(self, worker, sample_project):
        """Test event handlers are called."""
        events = []

        async def handler(path, event_type, data):
            events.append((path, event_type, data))

        worker.add_event_handler(handler)

        await worker.start()
        try:
            await worker.add_project(str(sample_project))
            await asyncio.sleep(1)

            # Should have received an analysis_complete event
            event_types = {e[1] for e in events}
            assert "analysis_complete" in event_types
        finally:
            await worker.stop()
