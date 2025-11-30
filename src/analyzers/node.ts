import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class NodeAnalyzer {
  async handleTool(toolName: string, args: any): Promise<ToolResponse> {
    switch (toolName) {
      case "node_find_symbols":
        return await this.findSymbols(args);
      case "node_find_tests":
        return await this.findTests(args);
      case "node_find_callers":
        return await this.findCallers(args);
      case "node_get_ast":
        return await this.getAST(args);
      case "node_run_tests":
        return await this.runTests(args);
      case "node_find_implementations":
        return await this.findImplementations(args);
      default:
        throw new Error(`Unknown Node tool: ${toolName}`);
    }
  }

  private async findSymbols(args: any): Promise<ToolResponse> {
    const { path: projectPath, symbol_name, symbol_type = "all" } = args;

    try {
      const findCmd = `find "${projectPath}" -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" | grep -v node_modules | grep -v dist | grep -v build`;
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

            // Match function declarations
            if ((symbol_type === "all" || symbol_type === "function") &&
                (match = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/))) {
              type = "function";
            }
            // Match arrow functions
            else if ((symbol_type === "all" || symbol_type === "function") &&
                     (match = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/))) {
              type = "function";
            }
            // Match classes
            else if ((symbol_type === "all" || symbol_type === "class") &&
                     (match = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/))) {
              type = "class";
            }
            // Match interfaces (TypeScript)
            else if ((symbol_type === "all" || symbol_type === "interface") &&
                     (match = line.match(/(?:export\s+)?interface\s+(\w+)/))) {
              type = "interface";
            }
            // Match type aliases (TypeScript)
            else if ((symbol_type === "all" || symbol_type === "type") &&
                     (match = line.match(/(?:export\s+)?type\s+(\w+)/))) {
              type = "type";
            }
            // Match variables
            else if ((symbol_type === "all" || symbol_type === "variable") &&
                     (match = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/))) {
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
      const findCmd = `find "${projectPath}" -name "*.test.js" -o -name "*.test.ts" -o -name "*.spec.js" -o -name "*.spec.ts" | grep -v node_modules`;
      const { stdout: files } = await execAsync(findCmd);

      const fileList = files.trim().split("\n").filter(f => f);
      const results: any[] = [];

      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            // Match describe blocks
            let match = line.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/);
            if (match) {
              const suiteName = match[1];
              if (!test_name || suiteName.includes(test_name)) {
                results.push({
                  file: file,
                  line: index + 1,
                  test_name: suiteName,
                  type: "suite",
                  framework: this.detectFramework(content),
                  code: line.trim(),
                });
              }
            }

            // Match test/it blocks
            match = line.match(/(?:test|it)\s*\(\s*['"`]([^'"`]+)['"`]/);
            if (match) {
              const testName = match[1];
              if (!test_name || testName.includes(test_name)) {
                results.push({
                  file: file,
                  line: index + 1,
                  test_name: testName,
                  type: "test",
                  framework: this.detectFramework(content),
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

  private detectFramework(content: string): string {
    if (content.includes("@jest") || content.includes("jest.")) return "jest";
    if (content.includes("vitest") || content.includes("vi.")) return "vitest";
    if (content.includes("mocha") || content.includes("chai")) return "mocha";
    return "unknown";
  }

  private async findCallers(args: any): Promise<ToolResponse> {
    const { path: projectPath, function_name } = args;

    try {
      const findCmd = `find "${projectPath}" -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" | grep -v node_modules`;
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
            if (callPattern.test(line) &&
                !line.trim().startsWith("function ") &&
                !line.trim().startsWith("//")) {
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
      // Create a Node.js script using @babel/parser for AST generation
      const astScript = `
const parser = require('@babel/parser');
const fs = require('fs');

const code = fs.readFileSync('${file_path}', 'utf-8');

const ast = parser.parse(code, {
  sourceType: 'module',
  plugins: [
    'typescript',
    'jsx',
    'decorators-legacy',
    'classProperties',
    'dynamicImport'
  ]
});

if ('${format}' === 'json') {
  console.log(JSON.stringify(ast, null, 2));
} else {
  console.log(JSON.stringify(ast, null, 2));
}
`;

      const tempFile = `/tmp/ast-${Date.now()}.js`;
      await writeFile(tempFile, astScript);

      try {
        const { stdout } = await execAsync(`node ${tempFile}`, {
          maxBuffer: 10 * 1024 * 1024,
        });

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
        // If @babel/parser is not available, use a simpler approach with acorn
        const simpleScript = `
const fs = require('fs');

const code = fs.readFileSync('${file_path}', 'utf-8');

// Simple regex-based parsing for structure
const structure = {
  imports: [],
  exports: [],
  functions: [],
  classes: [],
  variables: []
};

const lines = code.split('\\n');
lines.forEach((line, index) => {
  if (line.match(/^import /)) structure.imports.push({line: index + 1, code: line.trim()});
  if (line.match(/^export /)) structure.exports.push({line: index + 1, code: line.trim()});
  if (line.match(/function\\s+\\w+/)) structure.functions.push({line: index + 1, code: line.trim()});
  if (line.match(/class\\s+\\w+/)) structure.classes.push({line: index + 1, code: line.trim()});
  if (line.match(/(?:const|let|var)\\s+\\w+/)) structure.variables.push({line: index + 1, code: line.trim()});
});

console.log(JSON.stringify(structure, null, 2));
`;

        await writeFile(tempFile, simpleScript);
        const { stdout } = await execAsync(`node ${tempFile}`, {
          maxBuffer: 10 * 1024 * 1024,
        });

        await execAsync(`rm ${tempFile}`);

        return {
          content: [
            {
              type: "text",
              text: "Note: Using simplified AST (install @babel/parser for full AST)\n\n" + stdout,
            },
          ],
        };
      }
    } catch (error) {
      throw new Error(`Failed to generate AST: ${error}`);
    }
  }

  private async runTests(args: any): Promise<ToolResponse> {
    const { path: projectPath, test_name, framework = "auto", verbose = false } = args;

    try {
      let cmd = "";

      if (framework === "auto") {
        // Try to detect from package.json
        try {
          const packageJson = JSON.parse(
            await readFile(path.join(projectPath, "package.json"), "utf-8")
          );

          if (packageJson.devDependencies?.jest || packageJson.dependencies?.jest) {
            cmd = `cd "${projectPath}" && npm test`;
          } else if (packageJson.devDependencies?.vitest || packageJson.dependencies?.vitest) {
            cmd = `cd "${projectPath}" && npx vitest run`;
          } else if (packageJson.devDependencies?.mocha || packageJson.dependencies?.mocha) {
            cmd = `cd "${projectPath}" && npx mocha`;
          } else {
            cmd = `cd "${projectPath}" && npm test`;
          }
        } catch {
          cmd = `cd "${projectPath}" && npm test`;
        }
      } else if (framework === "jest") {
        cmd = `cd "${projectPath}" && npx jest`;
      } else if (framework === "vitest") {
        cmd = `cd "${projectPath}" && npx vitest run`;
      } else if (framework === "mocha") {
        cmd = `cd "${projectPath}" && npx mocha`;
      } else {
        cmd = `cd "${projectPath}" && npm test`;
      }

      if (test_name && framework !== "npm") {
        cmd += ` ${test_name}`;
      }

      if (verbose && framework !== "npm") {
        cmd += " --verbose";
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
                command: "test runner",
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
      const findCmd = `find "${projectPath}" -name "*.ts" -o -name "*.tsx" | grep -v node_modules`;
      const { stdout: files } = await execAsync(findCmd);

      const fileList = files.trim().split("\n").filter(f => f);
      const results: any[] = [];

      for (const file of fileList) {
        try {
          const content = await readFile(file, "utf-8");
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            // Match class implementing interface
            let match = line.match(/class\s+(\w+)\s+implements\s+([^{]+)/);
            if (match) {
              const [, className, interfaces] = match;
              if (interfaces.includes(interface_name)) {
                results.push({
                  file: file,
                  line: index + 1,
                  class: className,
                  implements: interfaces.split(",").map(s => s.trim()),
                  code: line.trim(),
                });
              }
            }

            // Match class extending another class
            match = line.match(/class\s+(\w+)\s+extends\s+(\w+)/);
            if (match) {
              const [, className, baseClass] = match;
              if (baseClass === interface_name) {
                results.push({
                  file: file,
                  line: index + 1,
                  class: className,
                  extends: baseClass,
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
                interface: interface_name,
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
