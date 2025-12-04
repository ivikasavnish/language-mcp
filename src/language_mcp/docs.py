"""Documentation reader module for extracting and parsing documentation."""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class DocSection:
    """A section of documentation."""

    title: str
    content: str
    level: int  # Heading level (1-6)
    children: list["DocSection"] = field(default_factory=list)


@dataclass
class DocFile:
    """Represents a documentation file."""

    file_path: str
    title: str
    sections: list[DocSection] = field(default_factory=list)
    content: str = ""
    last_modified: float = 0.0


class DocReader:
    """Reader for documentation files (Markdown, RST, etc.)."""

    DOC_EXTENSIONS = {".md", ".rst", ".txt", ".markdown"}
    DOC_FILENAMES = {
        "readme",
        "readme.md",
        "readme.rst",
        "contributing",
        "contributing.md",
        "changelog",
        "changelog.md",
        "history",
        "history.md",
        "license",
        "license.md",
        "authors",
        "authors.md",
    }

    def __init__(self):
        self._doc_cache: dict[str, DocFile] = {}
        self._project_docs: dict[str, dict[str, DocFile]] = {}
        self._lock = asyncio.Lock()

    async def read_doc_file(self, file_path: str) -> DocFile:
        """Read and parse a documentation file."""
        path = Path(file_path)
        doc = DocFile(file_path=file_path, title=path.name)

        if not path.exists():
            return doc

        try:
            doc.last_modified = path.stat().st_mtime
            content = await asyncio.to_thread(path.read_text, encoding="utf-8")
            doc.content = content

            # Parse based on file type
            if path.suffix in {".md", ".markdown"}:
                doc.sections = self._parse_markdown(content)
                doc.title = self._extract_title(doc.sections) or path.name
            elif path.suffix == ".rst":
                doc.sections = self._parse_rst(content)
                doc.title = self._extract_title(doc.sections) or path.name
            else:
                # Plain text - treat entire content as one section
                doc.sections = [
                    DocSection(title=path.name, content=content, level=1)
                ]

            async with self._lock:
                self._doc_cache[file_path] = doc

        except Exception as e:
            logger.error(f"Error reading documentation {file_path}: {e}")

        return doc

    def _parse_markdown(self, content: str) -> list[DocSection]:
        """Parse Markdown content into sections."""
        sections = []
        current_section: DocSection | None = None
        current_content: list[str] = []

        # Regex for markdown headings
        heading_pattern = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)

        lines = content.split("\n")
        i = 0

        while i < len(lines):
            line = lines[i]
            match = heading_pattern.match(line)

            if match:
                # Save previous section
                if current_section:
                    current_section.content = "\n".join(current_content).strip()
                    sections.append(current_section)

                # Start new section
                level = len(match.group(1))
                title = match.group(2).strip()
                current_section = DocSection(title=title, content="", level=level)
                current_content = []
            else:
                # Check for underline-style headings (setext)
                if i + 1 < len(lines):
                    next_line = lines[i + 1]
                    if line.strip() and re.match(r"^=+\s*$", next_line):
                        if current_section:
                            current_section.content = "\n".join(current_content).strip()
                            sections.append(current_section)
                        current_section = DocSection(
                            title=line.strip(), content="", level=1
                        )
                        current_content = []
                        i += 1  # Skip the underline
                    elif line.strip() and re.match(r"^-+\s*$", next_line):
                        if current_section:
                            current_section.content = "\n".join(current_content).strip()
                            sections.append(current_section)
                        current_section = DocSection(
                            title=line.strip(), content="", level=2
                        )
                        current_content = []
                        i += 1  # Skip the underline
                    else:
                        current_content.append(line)
                else:
                    current_content.append(line)

            i += 1

        # Don't forget the last section
        if current_section:
            current_section.content = "\n".join(current_content).strip()
            sections.append(current_section)
        elif current_content:
            # Content before any heading
            sections.insert(
                0, DocSection(title="", content="\n".join(current_content).strip(), level=0)
            )

        return sections

    def _parse_rst(self, content: str) -> list[DocSection]:
        """Parse reStructuredText content into sections."""
        sections = []
        current_section: DocSection | None = None
        current_content: list[str] = []

        # RST heading underlines can be any of these characters
        underline_chars = set("=-`:'\"~^_*+#<>")

        lines = content.split("\n")
        i = 0

        while i < len(lines):
            line = lines[i]

            # Check if this line might be a heading
            if i + 1 < len(lines) and line.strip():
                next_line = lines[i + 1]
                if (
                    len(next_line) >= len(line.rstrip())
                    and next_line.strip()
                    and all(c in underline_chars for c in next_line.strip())
                    and len(set(next_line.strip())) == 1
                ):
                    # This is a heading
                    if current_section:
                        current_section.content = "\n".join(current_content).strip()
                        sections.append(current_section)

                    # Determine level based on underline character
                    char = next_line.strip()[0]
                    level = {"=": 1, "-": 2, "~": 3, "^": 4}.get(char, 2)

                    current_section = DocSection(
                        title=line.strip(), content="", level=level
                    )
                    current_content = []
                    i += 1  # Skip underline
                else:
                    current_content.append(line)
            else:
                current_content.append(line)

            i += 1

        # Last section
        if current_section:
            current_section.content = "\n".join(current_content).strip()
            sections.append(current_section)
        elif current_content:
            sections.insert(
                0, DocSection(title="", content="\n".join(current_content).strip(), level=0)
            )

        return sections

    def _extract_title(self, sections: list[DocSection]) -> str | None:
        """Extract the main title from sections."""
        for section in sections:
            if section.level == 1 and section.title:
                return section.title
        return None

    async def scan_project_docs(self, project_path: str) -> dict[str, DocFile]:
        """Scan a project for documentation files."""
        path = Path(project_path)
        docs: dict[str, DocFile] = {}

        if not path.exists():
            return docs

        # Find documentation files
        doc_files = []

        # Check root directory for common doc files
        for item in path.iterdir():
            if item.is_file():
                if (
                    item.name.lower() in self.DOC_FILENAMES
                    or item.suffix.lower() in self.DOC_EXTENSIONS
                ):
                    doc_files.append(item)

        # Check docs directory if it exists
        docs_dir = path / "docs"
        if docs_dir.exists():
            for doc_file in docs_dir.rglob("*"):
                if doc_file.is_file() and doc_file.suffix.lower() in self.DOC_EXTENSIONS:
                    doc_files.append(doc_file)

        # Check doc directory (alternative)
        doc_dir = path / "doc"
        if doc_dir.exists():
            for doc_file in doc_dir.rglob("*"):
                if doc_file.is_file() and doc_file.suffix.lower() in self.DOC_EXTENSIONS:
                    doc_files.append(doc_file)

        # Read all docs concurrently
        semaphore = asyncio.Semaphore(10)

        async def read_with_semaphore(file_path: Path):
            async with semaphore:
                return await self.read_doc_file(str(file_path))

        tasks = [read_with_semaphore(f) for f in doc_files]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Length should always match since gather returns results for each task
        for file_path, result in zip(doc_files, results, strict=True):
            if isinstance(result, DocFile):
                docs[str(file_path)] = result
            else:
                logger.error(f"Error reading {file_path}: {result}")

        async with self._lock:
            self._project_docs[project_path] = docs

        return docs

    def get_cached_doc(self, file_path: str) -> DocFile | None:
        """Get a cached documentation file."""
        return self._doc_cache.get(file_path)

    def get_project_docs(self, project_path: str) -> dict[str, DocFile] | None:
        """Get cached documentation for a project."""
        return self._project_docs.get(project_path)

    def search_docs(
        self, project_path: str, query: str, case_sensitive: bool = False
    ) -> list[dict[str, Any]]:
        """Search documentation for a query string."""
        results = []
        docs = self._project_docs.get(project_path, {})

        if not case_sensitive:
            query = query.lower()

        for file_path, doc in docs.items():
            content = doc.content if case_sensitive else doc.content.lower()
            if query in content:
                # Find matching sections
                for section in doc.sections:
                    section_content = (
                        section.content if case_sensitive else section.content.lower()
                    )
                    if query in section_content:
                        results.append(
                            {
                                "file": file_path,
                                "section": section.title,
                                "level": section.level,
                                "preview": self._get_preview(
                                    section.content, query, case_sensitive
                                ),
                            }
                        )

        return results

    def _get_preview(
        self, content: str, query: str, case_sensitive: bool, context: int = 50
    ) -> str:
        """Get a preview of content around the query."""
        search_content = content if case_sensitive else content.lower()
        search_query = query if case_sensitive else query.lower()

        pos = search_content.find(search_query)
        if pos == -1:
            return content[:100] + "..." if len(content) > 100 else content

        start = max(0, pos - context)
        end = min(len(content), pos + len(query) + context)

        preview = content[start:end]
        if start > 0:
            preview = "..." + preview
        if end < len(content):
            preview = preview + "..."

        return preview
