# MCP Server Examples

This document demonstrates the Language MCP Server in action using sample projects.

## Sample Projects

We've created three sample projects in the `examples/` directory:

- **go-sample**: A Go user management system with interfaces and tests
- **python-sample**: A Python user repository with pytest tests
- **node-sample**: A TypeScript user service with Jest-style tests

## Example Demonstrations

### 1. Finding Symbols 🔍

**Query**: "Find all functions in the Go project"

**Tool Used**: `go_find_symbols`

**Parameters**:
```json
{
  "path": "/home/vikasavn/language-mcp/examples/go-sample",
  "symbol_type": "function"
}
```

**Result**:
```json
{
  "symbols_found": 5,
  "symbols": [
    {
      "file": "./examples/go-sample/main.go",
      "line": 24,
      "code": "func (h *UserHandler) Handle(request string) error {",
      "type": "function"
    },
    {
      "file": "./examples/go-sample/main.go",
      "line": 30,
      "code": "func (h *UserHandler) Validate() bool {",
      "type": "function"
    },
    {
      "file": "./examples/go-sample/main.go",
      "line": 35,
      "code": "func GetUserByID(id int, users []User) *User {",
      "type": "function"
    },
    {
      "file": "./examples/go-sample/main.go",
      "line": 45,
      "code": "func CreateUser(name, email string) User {",
      "type": "function"
    }
  ]
}
```

**What Claude would tell you**:
> "I found 5 functions in your Go project:
> - `Handle` at main.go:24 - processes requests
> - `Validate` at main.go:30 - validates handler state
> - `GetUserByID` at main.go:35 - finds users by ID
> - `CreateUser` at main.go:45 - creates new users
> - `main` at main.go:52 - entry point"

---

### 2. Finding Tests 🧪

**Query**: "What tests exist in the Python project?"

**Tool Used**: `python_find_tests`

**Parameters**:
```json
{
  "path": "/home/vikasavn/language-mcp/examples/python-sample"
}
```

**Result**:
```json
{
  "test_files_found": 1,
  "tests_found": 7,
  "tests": [
    {
      "file": "./examples/python-sample/test_users.py",
      "line": 7,
      "test_name": "TestUser",
      "framework": "unittest",
      "type": "class"
    },
    {
      "file": "./examples/python-sample/test_users.py",
      "line": 10,
      "test_name": "test_user_creation",
      "framework": "pytest",
      "type": "function"
    },
    {
      "file": "./examples/python-sample/test_users.py",
      "line": 17,
      "test_name": "test_user_to_dict",
      "framework": "pytest",
      "type": "function"
    },
    {
      "file": "./examples/python-sample/test_users.py",
      "line": 28,
      "test_name": "test_add_user",
      "framework": "pytest",
      "type": "function"
    },
    {
      "file": "./examples/python-sample/test_users.py",
      "line": 35,
      "test_name": "test_get_user_by_id",
      "framework": "pytest",
      "type": "function"
    }
  ]
}
```

**What Claude would tell you**:
> "Your Python project has 7 tests in test_users.py:
>
> **TestUser class** (2 tests):
> - test_user_creation - verifies user object creation
> - test_user_to_dict - tests dictionary conversion
>
> **TestUserRepository class** (3 tests):
> - test_add_user - tests adding users
> - test_get_user_by_id - tests finding users by ID
> - test_get_user_by_id_not_found - tests not found case
>
> **Standalone tests** (2 tests):
> - test_create_user - tests factory function
> - test_validate_email - tests email validation"

---

### 3. Finding Function Callers 📞

**Query**: "Where is GetUserByID called in the Go project?"

**Tool Used**: `go_find_callers`

**Parameters**:
```json
{
  "path": "/home/vikasavn/language-mcp/examples/go-sample",
  "function_name": "GetUserByID"
}
```

**Result**:
```json
{
  "function": "GetUserByID",
  "callers_found": 3,
  "callers": [
    {
      "file": "./examples/go-sample/main.go",
      "line": 58,
      "code": "user := GetUserByID(1, users)"
    },
    {
      "file": "./examples/go-sample/main_test.go",
      "line": 11,
      "code": "user := GetUserByID(1, users)"
    },
    {
      "file": "./examples/go-sample/main_test.go",
      "line": 48,
      "code": "GetUserByID(1, users)"
    }
  ]
}
```

**What Claude would tell you**:
> "GetUserByID is called in 3 places:
> 1. main.go:58 - In the main function to demonstrate usage
> 2. main_test.go:11 - In TestGetUserByID test
> 3. main_test.go:48 - In the benchmark test BenchmarkGetUserByID
>
> This function is well-tested with both unit tests and performance benchmarks."

---

### 4. Finding Implementations 🔗

**Query**: "Find all implementations of the Handler interface"

**Tool Used**: `go_find_implementations`

**Parameters**:
```json
{
  "path": "/home/vikasavn/language-mcp/examples/go-sample",
  "interface_name": "Handler"
}
```

**Result**:
```json
{
  "interface": "Handler",
  "interface_methods": ["Handle", "Validate"],
  "implementations_found": 1,
  "implementations": [
    {
      "file": "./examples/go-sample/main.go",
      "type": "UserHandler",
      "methods": ["Handle", "Validate"]
    }
  ]
}
```

**What Claude would tell you**:
> "The Handler interface requires 2 methods: Handle and Validate.
>
> I found 1 implementation:
> - **UserHandler** (main.go) - implements both Handle and Validate methods
>
> UserHandler properly implements the interface by providing both required methods."

---

### 5. Running Tests ✅

**Query**: "Run the Python tests"

**Tool Used**: `python_run_tests`

**Parameters**:
```json
{
  "path": "/home/vikasavn/language-mcp/examples/python-sample",
  "verbose": true
}
```

**Result**:
```json
{
  "command": "cd \"/home/vikasavn/language-mcp/examples/python-sample\" && python3 -m pytest -v",
  "stdout": "============================= test session starts ==============================\nplatform linux -- Python 3.10.12, pytest-7.4.3, pluggy-1.5.0\ncollected 7 items\n\ntest_users.py::TestUser::test_user_creation PASSED                       [ 14%]\ntest_users.py::TestUser::test_user_to_dict PASSED                        [ 28%]\ntest_users.py::TestUserRepository::test_add_user PASSED                  [ 42%]\ntest_users.py::TestUserRepository::test_get_user_by_id PASSED            [ 57%]\ntest_users.py::TestUserRepository::test_get_user_by_id_not_found PASSED  [ 71%]\ntest_users.py::test_create_user PASSED                                   [ 85%]\ntest_users.py::test_validate_email PASSED                                [100%]\n\n============================== 7 passed in 0.01s ===============================",
  "stderr": "",
  "success": true
}
```

**What Claude would tell you**:
> "✅ All tests passed! (7/7)
>
> Test results:
> - TestUser::test_user_creation ✓
> - TestUser::test_user_to_dict ✓
> - TestUserRepository::test_add_user ✓
> - TestUserRepository::test_get_user_by_id ✓
> - TestUserRepository::test_get_user_by_id_not_found ✓
> - test_create_user ✓
> - test_validate_email ✓
>
> Completed in 0.01 seconds. Your code is working correctly!"

---

### 6. Getting AST 🌳

**Query**: "Show me the AST structure of users.py"

**Tool Used**: `python_get_ast`

**Parameters**:
```json
{
  "file_path": "/home/vikasavn/language-mcp/examples/python-sample/users.py",
  "format": "pretty"
}
```

**Result** (simplified):
```
Module contains 6 top-level elements:
1. Docstring: "User management module"
2. Class: User (line 3)
   - Methods: __init__, to_dict
   - Docstring: "Represents a user in the system"
3. Class: UserRepository (line 20)
   - Methods: __init__, add_user, get_user_by_id, get_all_users
   - Docstring: "Repository for user data"
4. Function: create_user (line 42)
   - Arguments: name, email
   - Returns: User
5. Function: validate_email (line 47)
   - Arguments: email
   - Returns: bool
6. Variable: MAX_USERS = 1000
```

**What Claude would tell you**:
> "The users.py file has a clean structure:
>
> **Classes**:
> - User: Data class with __init__ and to_dict methods
> - UserRepository: Manages user collection with CRUD operations
>
> **Functions**:
> - create_user: Factory function for creating users
> - validate_email: Email validation utility
>
> **Constants**:
> - MAX_USERS: Set to 1000
>
> The AST shows good separation of concerns with data models, repository pattern, and utility functions."

---

## Summary of Capabilities

| Feature | What It Does | Example Use Case |
|---------|--------------|------------------|
| **Symbol Finding** | Locates functions, classes, types | "Where is the login function?" |
| **Test Discovery** | Finds all tests in a project | "What tests cover authentication?" |
| **Caller Analysis** | Shows where functions are called | "What depends on this database call?" |
| **Implementation Finding** | Finds interface/class implementations | "What implements the Handler interface?" |
| **AST Generation** | Shows code structure | "Analyze the structure of this module" |
| **Test Execution** | Runs tests and reports results | "Run all the tests" |

## How to Try These Examples

1. **Install and build the MCP server** (see INSTALL.md)
2. **Configure Claude Desktop** with the server
3. **Restart Claude Desktop**
4. **Ask questions** about the example projects:
   - "Find all classes in examples/python-sample"
   - "Where is createUser called in the TypeScript project?"
   - "Run the Go tests in examples/go-sample"

## Real-World Usage

These examples show toy projects, but the same tools work on large production codebases:

- **Large Go microservices**: Find all implementations of service interfaces
- **Django projects**: Discover all test cases, run specific test suites
- **React applications**: Find all components, locate where hooks are used
- **Any codebase**: Understand call graphs, analyze structure, run tests

The MCP server scales to projects with thousands of files!
