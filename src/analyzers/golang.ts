import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class GoAnalyzer {
  async handleTool(toolName: string, args: any): Promise<ToolResponse> {
    switch (toolName) {
      case "go_find_symbols":
        return await this.findSymbols(args);
      case "go_find_tests":
        return await this.findTests(args);
      case "go_find_callers":
        return await this.findCallers(args);
      case "go_get_ast":
        return await this.getAST(args);
      case "go_run_tests":
        return await this.runTests(args);
      case "go_find_implementations":
        return await this.findImplementations(args);
      default:
        throw new Error(`Unknown Go tool: ${toolName}`);
    }
  }

  private async findSymbols(args: any): Promise<ToolResponse> {
    const { path: projectPath, symbol_name, symbol_type = "all" } = args;

    try {
      // Use grep to find symbol definitions
      let grepPattern = "";

      switch (symbol_type) {
        case "function":
          grepPattern = "^func ";
          break;
        case "type":
          grepPattern = "^type ";
          break;
        case "variable":
          grepPattern = "^var ";
          break;
        case "constant":
          grepPattern = "^const ";
          break;
        case "interface":
          grepPattern = "^type .* interface";
          break;
        case "struct":
          grepPattern = "^type .* struct";
          break;
        default:
          grepPattern = "^(func|type|var|const) ";
      }

      if (symbol_name) {
        grepPattern = `^(func|type|var|const) .*${symbol_name}`;
      }

      const findCmd = `find "${projectPath}" -name "*.go" -type f ! -path "*/vendor/*" ! -path "*/.git/*"`;
      const { stdout: files } = await execAsync(findCmd);

      const fileList = files.trim().split("\n").filter(f => f);
      const results: any[] = [];

      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            if (line.match(new RegExp(grepPattern))) {
              results.push({
                file: file,
                line: index + 1,
                code: line.trim(),
                type: this.inferSymbolType(line),
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

  private inferSymbolType(line: string): string {
    if (line.startsWith("func ")) return "function";
    if (line.match(/^type .* struct/)) return "struct";
    if (line.match(/^type .* interface/)) return "interface";
    if (line.startsWith("type ")) return "type";
    if (line.startsWith("var ")) return "variable";
    if (line.startsWith("const ")) return "constant";
    return "unknown";
  }

  private async findTests(args: any): Promise<ToolResponse> {
    const { path: projectPath, test_name } = args;

    try {
      const findCmd = `find "${projectPath}" -name "*_test.go" -type f ! -path "*/vendor/*"`;
      const { stdout: files } = await execAsync(findCmd);

      const fileList = files.trim().split("\n").filter(f => f);
      const results: any[] = [];

      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            const testMatch = line.match(/func\s+(Test\w+|Benchmark\w+|Example\w+)\s*\(/);
            if (testMatch) {
              const testFuncName = testMatch[1];
              if (!test_name || testFuncName.includes(test_name)) {
                results.push({
                  file: file,
                  line: index + 1,
                  test_name: testFuncName,
                  type: testFuncName.startsWith("Test") ? "test" :
                        testFuncName.startsWith("Benchmark") ? "benchmark" : "example",
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
      // Search for function calls
      const findCmd = `find "${projectPath}" -name "*.go" -type f ! -path "*/vendor/*"`;
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
            if (callPattern.test(line) && !line.trim().startsWith("func ")) {
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
      // Create a temporary Go program to parse and print AST
      const astProgram = `
package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
)

func main() {
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, "${file_path}", nil, parser.ParseComments)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing file: %v\\n", err)
		os.Exit(1)
	}

	if "${format}" == "json" {
		data, _ := json.MarshalIndent(node, "", "  ")
		fmt.Println(string(data))
	} else {
		ast.Print(fset, node)
	}
}
`;

      const tempDir = "/tmp/go-ast-" + Date.now();
      await execAsync(`mkdir -p ${tempDir}`);
      await execAsync(`echo '${astProgram.replace(/'/g, "'\\''")}' > ${tempDir}/main.go`);

      const { stdout } = await execAsync(`cd ${tempDir} && go run main.go`, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      // Cleanup
      await execAsync(`rm -rf ${tempDir}`);

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
    const { path: projectPath, test_name, verbose = false } = args;

    try {
      let cmd = `cd "${projectPath}" && go test`;

      if (verbose) {
        cmd += " -v";
      }

      if (test_name) {
        cmd += ` -run ${test_name}`;
      } else {
        cmd += " ./...";
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
                command: `go test`,
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
    const { path: projectPath, interface_name } = args;

    try {
      // First, find the interface definition
      const findCmd = `find "${projectPath}" -name "*.go" -type f ! -path "*/vendor/*"`;
      const { stdout: files } = await execAsync(findCmd);

      const fileList = files.trim().split("\n").filter(f => f);
      let interfaceMethods: string[] = [];

      // Find interface definition and extract methods
      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");
          let inInterface = false;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.match(new RegExp(`type\\s+${interface_name}\\s+interface`))) {
              inInterface = true;
              continue;
            }

            if (inInterface) {
              if (line.includes("}")) {
                break;
              }
              // Extract method names
              const methodMatch = line.match(/^\s*(\w+)\s*\(/);
              if (methodMatch) {
                interfaceMethods.push(methodMatch[1]);
              }
            }
          }
        } catch (err) {
          // Skip files that can't be read
        }
      }

      if (interfaceMethods.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Interface '${interface_name}' not found or has no methods`,
            },
          ],
        };
      }

      // Now find types that implement all these methods
      const implementations: any[] = [];

      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");

          // Find receiver types
          const receiverTypes = new Set<string>();
          lines.forEach((line, index) => {
            const receiverMatch = line.match(/func\s+\((\w+)\s+\*?(\w+)\)\s+(\w+)\s*\(/);
            if (receiverMatch) {
              const [, , typeName, methodName] = receiverMatch;
              if (interfaceMethods.includes(methodName)) {
                receiverTypes.add(typeName);
              }
            }
          });

          // Check if any type implements all methods
          for (const typeName of receiverTypes) {
            const implementedMethods = lines
              .filter(line => {
                const match = line.match(/func\s+\(\w+\s+\*?(\w+)\)\s+(\w+)\s*\(/);
                return match && match[1] === typeName && interfaceMethods.includes(match[2]);
              })
              .map(line => {
                const match = line.match(/func\s+\(\w+\s+\*?\w+\)\s+(\w+)\s*\(/);
                return match ? match[1] : "";
              });

            if (implementedMethods.length === interfaceMethods.length) {
              implementations.push({
                file: file,
                type: typeName,
                methods: implementedMethods,
              });
            }
          }
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
                interface: interface_name,
                interface_methods: interfaceMethods,
                implementations_found: implementations.length,
                implementations: implementations,
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
