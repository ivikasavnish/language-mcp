"""Tests for the documentation reader module."""

import pytest

from language_mcp.docs import DocReader


class TestDocReader:
    """Test the DocReader class."""

    @pytest.fixture
    def reader(self):
        """Create a DocReader instance."""
        return DocReader()

    @pytest.fixture
    def sample_markdown_file(self, tmp_path):
        """Create a sample Markdown file."""
        content = '''# My Project

Welcome to my project.

## Installation

Run the following command:

```bash
pip install my-project
```

## Usage

### Basic Usage

Import and use:

```python
from my_project import main
```

### Advanced Usage

See the advanced guide.

## License

MIT
'''
        file_path = tmp_path / "README.md"
        file_path.write_text(content)
        return str(file_path)

    @pytest.fixture
    def sample_rst_file(self, tmp_path):
        """Create a sample RST file."""
        content = '''My Project
==========

Welcome to my project.

Installation
------------

Run pip install.

Usage
-----

Import and use.
'''
        file_path = tmp_path / "README.rst"
        file_path.write_text(content)
        return str(file_path)

    @pytest.mark.asyncio
    async def test_read_markdown_file(self, reader, sample_markdown_file):
        """Test reading a Markdown file."""
        doc = await reader.read_doc_file(sample_markdown_file)

        assert doc.file_path == sample_markdown_file
        assert doc.title == "My Project"
        assert len(doc.sections) > 0

    @pytest.mark.asyncio
    async def test_markdown_heading_levels(self, reader, sample_markdown_file):
        """Test that heading levels are correctly parsed."""
        doc = await reader.read_doc_file(sample_markdown_file)

        # Find the main heading
        main_heading = next(s for s in doc.sections if s.title == "My Project")
        assert main_heading.level == 1

        # Find a level 2 heading
        installation = next(s for s in doc.sections if s.title == "Installation")
        assert installation.level == 2

        # Find a level 3 heading
        basic_usage = next(s for s in doc.sections if s.title == "Basic Usage")
        assert basic_usage.level == 3

    @pytest.mark.asyncio
    async def test_read_rst_file(self, reader, sample_rst_file):
        """Test reading an RST file."""
        doc = await reader.read_doc_file(sample_rst_file)

        assert doc.file_path == sample_rst_file
        assert doc.title == "My Project"

    @pytest.mark.asyncio
    async def test_read_nonexistent_file(self, reader):
        """Test reading a non-existent file."""
        doc = await reader.read_doc_file("/nonexistent/file.md")

        # Should return a DocFile with empty content
        assert doc.content == ""
        assert len(doc.sections) == 0

    @pytest.mark.asyncio
    async def test_scan_project_docs(self, reader, tmp_path):
        """Test scanning a project for documentation."""
        # Create a README
        readme = tmp_path / "README.md"
        readme.write_text("# Project\n\nDescription")

        # Create a docs directory with more docs
        docs_dir = tmp_path / "docs"
        docs_dir.mkdir()
        (docs_dir / "guide.md").write_text("# Guide\n\nHow to use")
        (docs_dir / "api.md").write_text("# API Reference\n\nAPI docs")

        docs = await reader.scan_project_docs(str(tmp_path))

        # Should find all 3 docs
        assert len(docs) == 3

    @pytest.mark.asyncio
    async def test_search_docs(self, reader, tmp_path):
        """Test searching documentation."""
        # Create docs
        readme = tmp_path / "README.md"
        readme.write_text("# Project\n\n## Installation\n\nRun pip install")

        await reader.scan_project_docs(str(tmp_path))
        results = reader.search_docs(str(tmp_path), "pip install")

        assert len(results) > 0
        assert any("pip install" in r["preview"] for r in results)

    @pytest.mark.asyncio
    async def test_search_docs_case_insensitive(self, reader, tmp_path):
        """Test case-insensitive search."""
        readme = tmp_path / "README.md"
        readme.write_text("# Project\n\nThis is IMPORTANT")

        await reader.scan_project_docs(str(tmp_path))

        # Should find with lowercase search
        results = reader.search_docs(str(tmp_path), "important")
        assert len(results) > 0

    @pytest.mark.asyncio
    async def test_get_preview(self, reader):
        """Test preview generation."""
        content = "This is a long text that contains some important keywords in the middle of it."
        preview = reader._get_preview(content, "important", False, context=10)

        assert "important" in preview
        assert "..." in preview  # Should have ellipsis
