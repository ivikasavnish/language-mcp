import { spawn, ChildProcess } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface DocServer {
  language: string;
  port: number;
  process: ChildProcess | null;
  url: string;
}

export class DocServerManager {
  private servers: Map<string, DocServer> = new Map();
  private basePort = 6060;

  async startGoDocServer(projectPath: string): Promise<DocServer> {
    const port = this.basePort;

    // Check if godoc is installed
    try {
      await execAsync("which godoc");
    } catch {
      throw new Error(
        "godoc not found. Install with: go install golang.org/x/tools/cmd/godoc@latest"
      );
    }

    const server: DocServer = {
      language: "go",
      port,
      process: null,
      url: `http://localhost:${port}`,
    };

    // Start godoc server
    const godocProcess = spawn("godoc", ["-http", `:${port}`], {
      cwd: projectPath,
      detached: false,
    });

    godocProcess.stdout?.on("data", (data) => {
      console.error(`[godoc] ${data}`);
    });

    godocProcess.stderr?.on("data", (data) => {
      console.error(`[godoc] ${data}`);
    });

    server.process = godocProcess;
    this.servers.set("go", server);

    return server;
  }

  async startPythonDocServer(projectPath: string): Promise<DocServer> {
    const port = this.basePort + 1;

    const server: DocServer = {
      language: "python",
      port,
      process: null,
      url: `http://localhost:${port}`,
    };

    // Start pydoc server
    const pydocProcess = spawn("python3", ["-m", "pydoc", "-p", port.toString()], {
      cwd: projectPath,
      detached: false,
    });

    pydocProcess.stdout?.on("data", (data) => {
      console.error(`[pydoc] ${data}`);
    });

    pydocProcess.stderr?.on("data", (data) => {
      console.error(`[pydoc] ${data}`);
    });

    server.process = pydocProcess;
    this.servers.set("python", server);

    return server;
  }

  async generateNodeDocs(projectPath: string): Promise<{ output: string }> {
    // Check if jsdoc or typedoc is available
    try {
      // Try typedoc first (for TypeScript)
      try {
        const { stdout } = await execAsync(
          `cd "${projectPath}" && npx typedoc --out ./docs --json ./docs/typedoc.json`,
          { maxBuffer: 10 * 1024 * 1024 }
        );
        return { output: `TypeDoc generated at ${projectPath}/docs` };
      } catch {
        // Fallback to jsdoc
        const { stdout } = await execAsync(
          `cd "${projectPath}" && npx jsdoc -r . -d ./docs`,
          { maxBuffer: 10 * 1024 * 1024 }
        );
        return { output: `JSDoc generated at ${projectPath}/docs` };
      }
    } catch (error: any) {
      throw new Error(`Failed to generate Node.js docs: ${error.message}`);
    }
  }

  getServerInfo(language: string): DocServer | null {
    return this.servers.get(language) || null;
  }

  getAllServers(): DocServer[] {
    return Array.from(this.servers.values());
  }

  async stopServer(language: string): Promise<boolean> {
    const server = this.servers.get(language);
    if (server?.process) {
      server.process.kill();
      this.servers.delete(language);
      return true;
    }
    return false;
  }

  async stopAllServers(): Promise<void> {
    for (const [language, server] of this.servers.entries()) {
      if (server.process) {
        server.process.kill();
      }
    }
    this.servers.clear();
  }

  async scrapeLocalDocs(projectPath: string, language: string): Promise<any[]> {
    const docs: any[] = [];

    switch (language) {
      case "go":
        // Use `go doc` to extract documentation
        try {
          const { stdout } = await execAsync(`cd "${projectPath}" && go doc -all`, {
            maxBuffer: 10 * 1024 * 1024,
          });

          // Parse go doc output
          const sections = stdout.split("\n\n");
          sections.forEach((section, index) => {
            if (section.trim()) {
              docs.push({
                id: `local_go_${index}`,
                content: section.trim(),
                metadata: {
                  source: "local",
                  language: "go",
                  type: "local_doc",
                  path: projectPath,
                  timestamp: Date.now(),
                },
              });
            }
          });
        } catch (error) {
          console.error("Error extracting Go docs:", error);
        }
        break;

      case "python":
        // Use pydoc to extract documentation
        try {
          const { stdout } = await execAsync(
            `cd "${projectPath}" && python3 -m pydoc -w .`,
            { maxBuffer: 10 * 1024 * 1024 }
          );
          docs.push({
            id: `local_python_${Date.now()}`,
            content: stdout,
            metadata: {
              source: "local",
              language: "python",
              type: "local_doc",
              path: projectPath,
              timestamp: Date.now(),
            },
          });
        } catch (error) {
          console.error("Error extracting Python docs:", error);
        }
        break;

      case "nodejs":
        // Generate docs using jsdoc/typedoc
        await this.generateNodeDocs(projectPath);
        docs.push({
          id: `local_node_${Date.now()}`,
          content: "Documentation generated in docs/ folder",
          metadata: {
            source: "local",
            language: "nodejs",
            type: "local_doc",
            path: projectPath,
            timestamp: Date.now(),
          },
        });
        break;
    }

    return docs;
  }
}
