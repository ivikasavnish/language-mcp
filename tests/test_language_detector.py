"""Tests for the language detection module."""

import pytest

from language_mcp.language_detector import LANGUAGE_CONFIGS, LanguageDetector


class TestLanguageDetector:
    """Test the LanguageDetector class."""

    @pytest.fixture
    def detector(self):
        """Create a LanguageDetector instance."""
        return LanguageDetector()

    @pytest.fixture
    def multi_language_project(self, tmp_path):
        """Create a project with multiple languages."""
        # Python files
        (tmp_path / "main.py").write_text("print('Hello')")
        (tmp_path / "utils.py").write_text("def helper(): pass")

        # Go files
        go_dir = tmp_path / "pkg"
        go_dir.mkdir()
        (go_dir / "main.go").write_text("package main")

        # JavaScript files
        js_dir = tmp_path / "frontend"
        js_dir.mkdir()
        (js_dir / "app.js").write_text("console.log('Hello')")
        (js_dir / "utils.js").write_text("export const util = () => {}")

        # TypeScript files
        (js_dir / "types.ts").write_text("interface User {}")

        return str(tmp_path)

    @pytest.fixture
    def python_only_project(self, tmp_path):
        """Create a Python-only project."""
        (tmp_path / "main.py").write_text("print('Hello')")
        (tmp_path / "utils.py").write_text("def helper(): pass")
        (tmp_path / "models.py").write_text("class Model: pass")

        # Add a __pycache__ directory that should be ignored
        pycache = tmp_path / "__pycache__"
        pycache.mkdir()
        (pycache / "main.cpython-39.pyc").write_text("compiled")

        return str(tmp_path)

    def test_detect_languages_multi_language(self, detector, multi_language_project):
        """Test language detection on a multi-language project."""
        languages = detector.detect_languages(multi_language_project)

        assert "Python" in languages
        assert "Go" in languages
        assert "JavaScript" in languages
        assert "TypeScript" in languages

        # Check Python
        assert languages["Python"].file_count == 2
        assert ".py" in languages["Python"].file_extensions

        # Check Go
        assert languages["Go"].file_count == 1
        assert ".go" in languages["Go"].file_extensions

        # Check JavaScript
        assert languages["JavaScript"].file_count == 2
        assert ".js" in languages["JavaScript"].file_extensions

        # Check TypeScript
        assert languages["TypeScript"].file_count == 1
        assert ".ts" in languages["TypeScript"].file_extensions

    def test_detect_languages_python_only(self, detector, python_only_project):
        """Test language detection on a Python-only project."""
        languages = detector.detect_languages(python_only_project)

        assert len(languages) == 1
        assert "Python" in languages
        assert languages["Python"].file_count == 3
        assert languages["Python"].percentage == 100.0

    def test_detect_languages_ignores_pycache(self, detector, python_only_project):
        """Test that __pycache__ directories are ignored."""
        languages = detector.detect_languages(python_only_project)

        # Should not count the .pyc file in __pycache__
        assert languages["Python"].file_count == 3

    def test_detect_languages_nonexistent_path(self, detector):
        """Test language detection on a nonexistent path."""
        languages = detector.detect_languages("/nonexistent/path")
        assert languages == {}

    def test_get_primary_language(self, detector, multi_language_project):
        """Test getting the primary language."""
        primary = detector.get_primary_language(multi_language_project)

        # Python and JavaScript both have 2 files, but we should get one
        assert primary in ["Python", "JavaScript"]

    def test_get_primary_language_python_only(self, detector, python_only_project):
        """Test getting primary language for Python-only project."""
        primary = detector.get_primary_language(python_only_project)
        assert primary == "Python"

    def test_get_primary_language_no_files(self, detector, tmp_path):
        """Test getting primary language with no recognized files."""
        # Create a directory with only text files
        (tmp_path / "readme.txt").write_text("Hello")
        primary = detector.get_primary_language(str(tmp_path))
        assert primary is None

    def test_get_available_doc_tools(self, detector, multi_language_project):
        """Test getting available documentation tools."""
        doc_tools = detector.get_available_doc_tools(multi_language_project)

        assert "Python" in doc_tools
        assert "pydoc" in doc_tools["Python"] or "sphinx" in doc_tools["Python"]

        assert "Go" in doc_tools
        assert "godoc" in doc_tools["Go"] or "go doc" in doc_tools["Go"]

        assert "JavaScript" in doc_tools
        assert "jsdoc" in doc_tools["JavaScript"]

    def test_get_api_spec_formats(self, detector, multi_language_project):
        """Test getting supported API spec formats."""
        formats = detector.get_api_spec_formats(multi_language_project)

        # Go, JavaScript, and TypeScript all support swagger/openapi
        assert "swagger" in formats or "openapi" in formats

    def test_detect_api_specs_swagger(self, detector, tmp_path):
        """Test detecting Swagger specification files."""
        # Create swagger files
        (tmp_path / "swagger.json").write_text('{"swagger": "2.0"}')
        (tmp_path / "swagger.yaml").write_text("swagger: '2.0'")

        specs = detector.detect_api_specs(str(tmp_path))

        assert "swagger" in specs
        assert len(specs["swagger"]) == 2

    def test_detect_api_specs_openapi(self, detector, tmp_path):
        """Test detecting OpenAPI specification files."""
        # Create openapi files
        (tmp_path / "openapi.json").write_text('{"openapi": "3.0.0"}')

        specs = detector.detect_api_specs(str(tmp_path))

        assert "openapi" in specs
        assert len(specs["openapi"]) == 1

    def test_detect_api_specs_none(self, detector, tmp_path):
        """Test detecting API specs when none exist."""
        (tmp_path / "main.py").write_text("print('Hello')")

        specs = detector.detect_api_specs(str(tmp_path))

        # Should return empty dict when no specs found
        assert specs == {}

    def test_to_dict(self, detector, python_only_project):
        """Test converting language info to dictionary."""
        languages = detector.detect_languages(python_only_project)
        result = detector.to_dict(languages)

        assert "Python" in result
        assert result["Python"]["name"] == "Python"
        assert result["Python"]["file_count"] == 3
        assert result["Python"]["percentage"] == 100.0
        assert ".py" in result["Python"]["extensions"]
        assert "doc_tools" in result["Python"]

    def test_language_percentages(self, detector, multi_language_project):
        """Test that language percentages are calculated correctly."""
        languages = detector.detect_languages(multi_language_project)

        # Total should be 100%
        total_percentage = sum(lang.percentage for lang in languages.values())
        assert abs(total_percentage - 100.0) < 0.01  # Allow for floating point errors

    def test_language_configs_have_required_fields(self):
        """Test that all language configs have required fields."""
        for lang_name, config in LANGUAGE_CONFIGS.items():
            assert "extensions" in config
            assert "doc_tools" in config
            assert "api_specs" in config
            assert isinstance(config["extensions"], set)
            assert isinstance(config["doc_tools"], list)
            assert isinstance(config["api_specs"], list)
