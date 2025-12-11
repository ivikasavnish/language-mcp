"""Tests for the documentation server helper module."""

import json
import pytest

from language_mcp.doc_server import DocServerHelper, APISpec


class TestDocServerHelper:
    """Test the DocServerHelper class."""

    @pytest.fixture
    def helper(self):
        """Create a DocServerHelper instance."""
        return DocServerHelper()

    @pytest.fixture
    def go_project(self, tmp_path):
        """Create a simple Go project."""
        go_file = tmp_path / "main.go"
        go_file.write_text("""
package main

import "fmt"

// HelloWorld prints a greeting
func HelloWorld() {
    fmt.Println("Hello, World!")
}

func main() {
    HelloWorld()
}
""")
        # Create go.mod
        (tmp_path / "go.mod").write_text("module example.com/hello\n\ngo 1.21\n")
        return str(tmp_path)

    @pytest.fixture
    def java_project(self, tmp_path):
        """Create a simple Java project."""
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        java_file = src_dir / "Main.java"
        java_file.write_text("""
/**
 * Main class
 */
public class Main {
    /**
     * Main method
     */
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
""")
        return str(tmp_path)

    @pytest.fixture
    def js_project(self, tmp_path):
        """Create a simple JavaScript project."""
        js_file = tmp_path / "app.js"
        js_file.write_text("""
/**
 * Greet the user
 * @param {string} name - The name to greet
 * @returns {string} The greeting
 */
function greet(name) {
    return `Hello, ${name}!`;
}
""")
        # Create package.json without jsdoc
        package_json = tmp_path / "package.json"
        package_json.write_text(json.dumps({
            "name": "test-app",
            "version": "1.0.0"
        }))
        return str(tmp_path)

    @pytest.fixture
    def swagger_json_file(self, tmp_path):
        """Create a Swagger JSON file."""
        swagger_file = tmp_path / "swagger.json"
        swagger_content = {
            "swagger": "2.0",
            "info": {
                "title": "Test API",
                "description": "A test API",
                "version": "1.0.0"
            },
            "paths": {
                "/users": {
                    "get": {
                        "summary": "Get all users",
                        "description": "Returns a list of users",
                        "operationId": "getUsers"
                    },
                    "post": {
                        "summary": "Create a user",
                        "operationId": "createUser"
                    }
                },
                "/users/{id}": {
                    "get": {
                        "summary": "Get a user by ID",
                        "operationId": "getUserById"
                    }
                }
            }
        }
        swagger_file.write_text(json.dumps(swagger_content, indent=2))
        return str(swagger_file)

    @pytest.fixture
    def openapi_json_file(self, tmp_path):
        """Create an OpenAPI JSON file."""
        openapi_file = tmp_path / "openapi.json"
        openapi_content = {
            "openapi": "3.0.0",
            "info": {
                "title": "Test API v3",
                "description": "An OpenAPI 3.0 test API",
                "version": "2.0.0"
            },
            "paths": {
                "/products": {
                    "get": {
                        "summary": "Get all products",
                        "operationId": "getProducts"
                    }
                }
            }
        }
        openapi_file.write_text(json.dumps(openapi_content, indent=2))
        return str(openapi_file)

    @pytest.mark.asyncio
    async def test_check_tool_available_python(self, helper):
        """Test checking if Python is available (should always be true)."""
        available = await helper.check_tool_available("python")
        # Python should be available in test environment
        assert available or await helper.check_tool_available("python3")

    @pytest.mark.asyncio
    async def test_check_tool_available_nonexistent(self, helper):
        """Test checking for a nonexistent tool."""
        available = await helper.check_tool_available("nonexistent-tool-xyz")
        assert not available

    @pytest.mark.asyncio
    async def test_get_pydoc_info(self, helper, tmp_path):
        """Test getting pydoc info for a Python project."""
        result = await helper.get_pydoc_info(str(tmp_path))

        assert result["tool"] == "pydoc"
        assert result["available"] is True
        assert "message" in result

    @pytest.mark.asyncio
    async def test_get_pydoc_info_nonexistent_path(self, helper):
        """Test getting pydoc info for nonexistent path."""
        result = await helper.get_pydoc_info("/nonexistent/path")
        assert "error" in result

    @pytest.mark.asyncio
    async def test_get_jsdoc_info(self, helper, js_project):
        """Test getting JSDoc info for a JavaScript project."""
        result = await helper.get_jsdoc_info(js_project)

        assert result["tool"] == "jsdoc"
        assert "available" in result
        # May or may not be installed in test environment

    @pytest.mark.asyncio
    async def test_get_jsdoc_info_nonexistent_path(self, helper):
        """Test getting JSDoc info for nonexistent path."""
        result = await helper.get_jsdoc_info("/nonexistent/path")
        assert "error" in result

    @pytest.mark.asyncio
    async def test_parse_swagger_spec_json(self, helper, swagger_json_file):
        """Test parsing a Swagger JSON specification."""
        spec = await helper.parse_swagger_spec(swagger_json_file)

        assert spec.file_path == swagger_json_file
        assert spec.spec_type == "swagger"
        assert spec.version == "2.0"
        assert spec.title == "Test API"
        assert spec.description == "A test API"
        assert len(spec.endpoints) == 3  # GET /users, POST /users, GET /users/{id}

        # Check endpoints
        paths = [e["path"] for e in spec.endpoints]
        assert "/users" in paths
        assert "/users/{id}" in paths

        methods = [e["method"] for e in spec.endpoints]
        assert "GET" in methods
        assert "POST" in methods

    @pytest.mark.asyncio
    async def test_parse_openapi_spec_json(self, helper, openapi_json_file):
        """Test parsing an OpenAPI JSON specification."""
        spec = await helper.parse_swagger_spec(openapi_json_file)

        assert spec.spec_type == "openapi"
        assert spec.version == "3.0.0"
        assert spec.title == "Test API v3"
        assert spec.description == "An OpenAPI 3.0 test API"
        assert len(spec.endpoints) == 1

        # Check endpoint
        endpoint = spec.endpoints[0]
        assert endpoint["path"] == "/products"
        assert endpoint["method"] == "GET"
        assert endpoint["operationId"] == "getProducts"

    @pytest.mark.asyncio
    async def test_parse_swagger_spec_nonexistent(self, helper):
        """Test parsing a nonexistent spec file."""
        spec = await helper.parse_swagger_spec("/nonexistent/swagger.json")
        assert spec.error is not None

    @pytest.mark.asyncio
    async def test_get_language_docs_python(self, helper, tmp_path):
        """Test getting language docs for Python."""
        result = await helper.get_language_docs(str(tmp_path), "Python")

        assert result["language"] == "Python"
        assert result["project_path"] == str(tmp_path)
        assert "pydoc" in result["documentation"]
        assert "pydoc" in result["available_tools"]

    @pytest.mark.asyncio
    async def test_get_language_docs_unsupported_language(self, helper, tmp_path):
        """Test getting language docs for an unsupported language."""
        result = await helper.get_language_docs(str(tmp_path), "UnknownLang")

        assert result["language"] == "UnknownLang"
        assert "message" in result

    @pytest.mark.asyncio
    async def test_get_active_servers(self, helper):
        """Test getting active servers."""
        servers = helper.get_active_servers()
        assert isinstance(servers, dict)
        # Should be empty initially
        assert len(servers) == 0

    @pytest.mark.asyncio
    async def test_stop_all_servers(self, helper):
        """Test stopping all servers."""
        # Should not raise any errors even with no servers
        await helper.stop_all_servers()

    def test_api_spec_dataclass(self):
        """Test APISpec dataclass initialization."""
        spec = APISpec(file_path="/path/to/spec.json", spec_type="swagger")

        assert spec.file_path == "/path/to/spec.json"
        assert spec.spec_type == "swagger"
        assert spec.version is None
        assert spec.title is None
        assert spec.description is None
        assert spec.endpoints == []

    @pytest.mark.asyncio
    async def test_parse_swagger_spec_with_all_fields(self, helper, swagger_json_file):
        """Test that parsing extracts all endpoint information."""
        spec = await helper.parse_swagger_spec(swagger_json_file)

        # Find the GET /users endpoint
        get_users = next(
            (e for e in spec.endpoints if e["path"] == "/users" and e["method"] == "GET"),
            None
        )

        assert get_users is not None
        assert get_users["summary"] == "Get all users"
        assert get_users["description"] == "Returns a list of users"
        assert get_users["operationId"] == "getUsers"
