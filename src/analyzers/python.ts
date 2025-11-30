import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class PythonAnalyzer {
  async handleTool(toolName: string, args: any): Promise<ToolResponse> {
    switch (toolName) {
      case "python_find_symbols":
        return await this.findSymbols(args);
      case "python_find_tests":
        return await this.findTests(args);
      case "python_find_callers":
        return await this.findCallers(args);
      case "python_get_ast":
        return await this.getAST(args);
      case "python_run_tests":
        return await this.runTests(args);
      case "python_find_implementations":
        return await this.findImplementations(args);
      default:
        throw new Error(`Unknown Python tool: ${toolName}`);
    }
  }

  private async findSymbols(args: any): Promise<ToolResponse> {
    const { path: projectPath, symbol_name, symbol_type = "all" } = args;

    try {
      const findCmd = `find "${projectPath}" -name "*.py" -type f ! -path "*/__pycache__/*" ! -path "*/.venv/*" ! -path "*/venv/*"`;
      const { stdout: files } = await execAsync(findCmd);

      const fileList = files.trim().split("\n").filter(f => f);
      const results: any[] = [];

      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            let match = null;
            let type = "";

            // Match functions
            if ((symbol_type === "all" || symbol_type === "function") &&
                (match = line.match(/^def\s+(\w+)\s*\(/))) {
              type = "function";
            }
            // Match classes
            else if ((symbol_type === "all" || symbol_type === "class") &&
                     (match = line.match(/^class\s+(\w+)/))) {
              type = "class";
            }
            // Match methods (indented def)
            else if ((symbol_type === "all" || symbol_type === "method") &&
                     (match = line.match(/^\s+def\s+(\w+)\s*\(/))) {
              type = "method";
            }
            // Match variable assignments at module level
            else if ((symbol_type === "all" || symbol_type === "variable") &&
                     (match = line.match(/^(\w+)\s*=/))) {
              type = "variable";
            }

            if (match) {
              const symbolName = match[1];
              if (!symbol_name || symbolName.includes(symbol_name)) {
                results.push({
                  file: file,
                  line: index + 1,
                  symbol: symbolName,
                  type: type,
                  code: line.trim(),
                });
              }
            }
          });
        } catch (err) {
          // Skip files that can't be read
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                symbols_found: results.length,
                symbols: results,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find symbols: ${error}`);
    }
  }

  private async findTests(args: any): Promise<ToolResponse> {
    const { path: projectPath, test_name } = args;

    try {
      const findCmd = `find "${projectPath}" -name "test_*.py" -o -name "*_test.py" | grep -v __pycache__`;
      const { stdout: files } = await execAsync(findCmd);

      const fileList = files.trim().split("\n").filter(f => f);
      const results: any[] = [];

      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            // Match pytest style: def test_*
            let match = line.match(/def\s+(test_\w+)\s*\(/);
            if (match) {
              const testFuncName = match[1];
              if (!test_name || testFuncName.includes(test_name)) {
                results.push({
                  file: file,
                  line: index + 1,
                  test_name: testFuncName,
                  framework: "pytest",
                  type: "function",
                  code: line.trim(),
                });
              }
            }

            // Match unittest style: class Test* and def test_*
            match = line.match(/class\s+(Test\w+)/);
            if (match) {
              const testClassName = match[1];
              if (!test_name || testClassName.includes(test_name)) {
                results.push({
                  file: file,
                  line: index + 1,
                  test_name: testClassName,
                  framework: "unittest",
                  type: "class",
                  code: line.trim(),
                });
              }
            }
          });
        } catch (err) {
          // Skip files that can't be read
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                test_files_found: fileList.length,
                tests_found: results.length,
                tests: results,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find tests: ${error}`);
    }
  }

  private async findCallers(args: any): Promise<ToolResponse> {
    const { path: projectPath, function_name } = args;

    try {
      const findCmd = `find "${projectPath}" -name "*.py" -type f ! -path "*/__pycache__/*"`;
      const { stdout: files } = await execAsync(findCmd);

      const fileList = files.trim().split("\n").filter(f => f);
      const results: any[] = [];

      // Pattern to match function calls
      const callPattern = new RegExp(`\\b${function_name}\\s*\\(`, "g");

      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            if (callPattern.test(line) && !line.trim().startsWith("def ")) {
              results.push({
                file: file,
                line: index + 1,
                code: line.trim(),
              });
            }
          });
        } catch (err) {
          // Skip files that can't be read
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                function: function_name,
                callers_found: results.length,
                callers: results,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find callers: ${error}`);
    }
  }

  private async getAST(args: any): Promise<ToolResponse> {
    const { file_path, format = "pretty" } = args;

    try {
      // Create a Python script to generate AST
      const astScript = `
import ast
import json
import sys

with open("${file_path}", "r") as f:
    source = f.read()

tree = ast.parse(source, filename="${file_path}")

if "${format}" == "json":
    def ast_to_dict(node):
        if isinstance(node, ast.AST):
            result = {"_type": node.__class__.__name__}
            for field, value in ast.iter_fields(node):
                if isinstance(value, list):
                    result[field] = [ast_to_dict(item) for item in value]
                else:
                    result[field] = ast_to_dict(value)
            return result
        elif isinstance(node, list):
            return [ast_to_dict(item) for item in node]
        else:
            return node

    print(json.dumps(ast_to_dict(tree), indent=2))
else:
    print(ast.dump(tree, indent=2))
`;

      const tempFile = `/tmp/ast-${Date.now()}.py`;
      await writeFile(tempFile, astScript);

      const { stdout } = await execAsync(`python3 ${tempFile}`, {
        maxBuffer: 10 * 1024 * 1024,
      });

      // Cleanup
      await execAsync(`rm ${tempFile}`);

      return {
        content: [
          {
            type: "text",
            text: stdout,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to generate AST: ${error}`);
    }
  }

  private async runTests(args: any): Promise<ToolResponse> {
    const { path: projectPath, test_name, framework = "auto", verbose = false } = args;

    try {
      let cmd = "";

      if (framework === "pytest" || framework === "auto") {
        cmd = `cd "${projectPath}" && python3 -m pytest`;
        if (verbose) cmd += " -v";
        if (test_name) cmd += ` -k ${test_name}`;
      } else if (framework === "unittest") {
        cmd = `cd "${projectPath}" && python3 -m unittest discover`;
        if (verbose) cmd += " -v";
        if (test_name) cmd += ` -k ${test_name}`;
      }

      const { stdout, stderr } = await execAsync(cmd, {
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                command: cmd,
                stdout: stdout,
                stderr: stderr,
                success: true,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                command: "pytest/unittest",
                stdout: error.stdout || "",
                stderr: error.stderr || "",
                error: error.message,
                success: false,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async findImplementations(args: any): Promise<ToolResponse> {
    const { path: projectPath, class_name } = args;

    try {
      const findCmd = `find "${projectPath}" -name "*.py" -type f ! -path "*/__pycache__/*"`;
      const { stdout: files } = await execAsync(findCmd);

      const fileList = files.trim().split("\n").filter(f => f);
      const results: any[] = [];

      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            // Match class inheritance
            const match = line.match(/class\s+(\w+)\s*\((.*)\)/);
            if (match) {
              const [, derivedClass, baseClasses] = match;
              if (baseClasses.includes(class_name)) {
                results.push({
                  file: file,
                  line: index + 1,
                  class: derivedClass,
                  base_classes: baseClasses.split(",").map(s => s.trim()),
                  code: line.trim(),
                });
              }
            }
          });
        } catch (err) {
          // Skip files that can't be read
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                base_class: class_name,
                implementations_found: results.length,
                implementations: results,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find implementations: ${error}`);
    }
  }
}
