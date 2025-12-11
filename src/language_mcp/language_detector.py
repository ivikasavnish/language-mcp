"""Language detection module for identifying programming languages in projects."""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class LanguageInfo:
    """Information about a detected language in a project."""

    name: str
    file_count: int
    file_extensions: set[str] = field(default_factory=set)
    percentage: float = 0.0
    doc_tools: list[str] = field(default_factory=list)  # Available documentation tools


# Language configurations with extensions and documentation tools
LANGUAGE_CONFIGS = {
    "Python": {
        "extensions": {".py", ".pyw", ".pyi"},
        "doc_tools": ["pydoc", "sphinx"],
        "api_specs": [],
    },
    "Go": {
        "extensions": {".go"},
        "doc_tools": ["godoc", "go doc"],
        "api_specs": ["swagger"],
    },
    "Java": {
        "extensions": {".java"},
        "doc_tools": ["javadoc"],
        "api_specs": ["swagger"],
    },
    "JavaScript": {
        "extensions": {".js", ".jsx", ".mjs", ".cjs"},
        "doc_tools": ["jsdoc"],
        "api_specs": ["swagger", "openapi"],
    },
    "TypeScript": {
        "extensions": {".ts", ".tsx"},
        "doc_tools": ["typedoc", "jsdoc"],
        "api_specs": ["swagger", "openapi"],
    },
    "C": {
        "extensions": {".c", ".h"},
        "doc_tools": ["doxygen"],
        "api_specs": [],
    },
    "C++": {
        "extensions": {".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx"},
        "doc_tools": ["doxygen"],
        "api_specs": [],
    },
    "C#": {
        "extensions": {".cs"},
        "doc_tools": ["docfx", "sandcastle"],
        "api_specs": ["swagger"],
    },
    "Ruby": {
        "extensions": {".rb"},
        "doc_tools": ["rdoc", "yard"],
        "api_specs": [],
    },
    "Rust": {
        "extensions": {".rs"},
        "doc_tools": ["rustdoc"],
        "api_specs": [],
    },
    "Swift": {
        "extensions": {".swift"},
        "doc_tools": ["jazzy"],
        "api_specs": [],
    },
    "Kotlin": {
        "extensions": {".kt", ".kts"},
        "doc_tools": ["dokka"],
        "api_specs": [],
    },
    "PHP": {
        "extensions": {".php"},
        "doc_tools": ["phpdoc"],
        "api_specs": ["swagger"],
    },
}

# Build reverse mapping for quick lookup
EXTENSION_TO_LANGUAGE: dict[str, str] = {}
for lang, config in LANGUAGE_CONFIGS.items():
    for ext in config["extensions"]:
        EXTENSION_TO_LANGUAGE[ext] = lang


class LanguageDetector:
    """Detector for identifying programming languages in projects."""

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
        "target",  # Maven/Gradle build directory
        "bin",
        "obj",  # .NET build directories
    }

    def detect_languages(self, project_path: str) -> dict[str, LanguageInfo]:
        """
        Detect programming languages used in a project.

        Args:
            project_path: Path to the project directory

        Returns:
            Dictionary mapping language names to LanguageInfo objects
        """
        path = Path(project_path)
        if not path.exists():
            logger.warning(f"Project path does not exist: {project_path}")
            return {}

        # Count files by extension
        extension_counts: dict[str, int] = {}
        total_files = 0

        for file_path in path.rglob("*"):
            if file_path.is_file():
                # Check if file is in an ignored directory
                should_ignore = False
                for parent in file_path.parents:
                    if parent.name in self.IGNORE_DIRS:
                        should_ignore = True
                        break

                if not should_ignore:
                    ext = file_path.suffix.lower()
                    if ext in EXTENSION_TO_LANGUAGE:
                        extension_counts[ext] = extension_counts.get(ext, 0) + 1
                        total_files += 1

        # Build language information
        language_info: dict[str, LanguageInfo] = {}

        for ext, count in extension_counts.items():
            lang = EXTENSION_TO_LANGUAGE[ext]
            if lang in language_info:
                language_info[lang].file_count += count
                language_info[lang].file_extensions.add(ext)
            else:
                config = LANGUAGE_CONFIGS[lang]
                language_info[lang] = LanguageInfo(
                    name=lang,
                    file_count=count,
                    file_extensions={ext},
                    doc_tools=config["doc_tools"].copy(),
                )

        # Calculate percentages
        if total_files > 0:
            for info in language_info.values():
                info.percentage = (info.file_count / total_files) * 100

        return language_info

    def get_primary_language(self, project_path: str) -> str | None:
        """
        Get the primary (most used) language in a project.

        Args:
            project_path: Path to the project directory

        Returns:
            Name of the primary language, or None if no languages detected
        """
        languages = self.detect_languages(project_path)
        if not languages:
            return None

        # Return the language with the most files
        primary = max(languages.values(), key=lambda x: x.file_count)
        return primary.name

    def get_available_doc_tools(self, project_path: str) -> dict[str, list[str]]:
        """
        Get available documentation tools for each language in the project.

        Args:
            project_path: Path to the project directory

        Returns:
            Dictionary mapping language names to lists of available doc tools
        """
        languages = self.detect_languages(project_path)
        doc_tools: dict[str, list[str]] = {}

        for lang_name, info in languages.items():
            if info.doc_tools:
                doc_tools[lang_name] = info.doc_tools

        return doc_tools

    def get_api_spec_formats(self, project_path: str) -> list[str]:
        """
        Get supported API specification formats for the project.

        Args:
            project_path: Path to the project directory

        Returns:
            List of supported API spec formats (e.g., ['swagger', 'openapi'])
        """
        languages = self.detect_languages(project_path)
        api_specs = set()

        for lang_name in languages:
            if lang_name in LANGUAGE_CONFIGS:
                specs = LANGUAGE_CONFIGS[lang_name]["api_specs"]
                api_specs.update(specs)

        return sorted(api_specs)

    def detect_api_specs(self, project_path: str) -> dict[str, list[str]]:
        """
        Detect API specification files in the project.

        Args:
            project_path: Path to the project directory

        Returns:
            Dictionary mapping spec type to list of file paths
        """
        path = Path(project_path)
        if not path.exists():
            return {}

        spec_files: dict[str, list[str]] = {
            "swagger": [],
            "openapi": [],
        }

        # Common API spec file patterns
        swagger_patterns = ["swagger.json", "swagger.yaml", "swagger.yml"]
        openapi_patterns = ["openapi.json", "openapi.yaml", "openapi.yml"]

        for file_path in path.rglob("*"):
            if file_path.is_file():
                name_lower = file_path.name.lower()

                # Check for Swagger files
                if name_lower in swagger_patterns or "swagger" in name_lower:
                    spec_files["swagger"].append(str(file_path))

                # Check for OpenAPI files
                if name_lower in openapi_patterns or "openapi" in name_lower:
                    spec_files["openapi"].append(str(file_path))

        # Remove empty lists
        return {k: v for k, v in spec_files.items() if v}

    def to_dict(self, languages: dict[str, LanguageInfo]) -> dict[str, Any]:
        """
        Convert language information to a dictionary for JSON serialization.

        Args:
            languages: Dictionary of LanguageInfo objects

        Returns:
            JSON-serializable dictionary
        """
        result: dict[str, Any] = {}
        for lang_name, info in languages.items():
            result[lang_name] = {
                "name": info.name,
                "file_count": info.file_count,
                "percentage": round(info.percentage, 2),
                "extensions": sorted(info.file_extensions),
                "doc_tools": info.doc_tools,
            }
        return result
