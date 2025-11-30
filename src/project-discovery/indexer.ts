import { ProjectRegistry, ProjectMetadata } from "./registry.js";
import { GoAnalyzer } from "../analyzers/golang.js";
import { PythonAnalyzer } from "../analyzers/python.js";
import { NodeAnalyzer } from "../analyzers/node.js";
import { VectorDBManager } from "../vector-db/manager.js";
import * as cron from "node-cron";
import { readdir } from "fs/promises";
import * as path from "path";

export class ProjectIndexer {
  private registry: ProjectRegistry;
  private vectorDB: VectorDBManager;
  private goAnalyzer: GoAnalyzer;
  private pythonAnalyzer: PythonAnalyzer;
  private nodeAnalyzer: NodeAnalyzer;
  private isIndexing = false;
  private cronTask: cron.ScheduledTask | null = null;

  constructor(
    registry: ProjectRegistry,
    vectorDB: VectorDBManager,
    goAnalyzer: GoAnalyzer,
    pythonAnalyzer: PythonAnalyzer,
    nodeAnalyzer: NodeAnalyzer
  ) {
    this.registry = registry;
    this.vectorDB = vectorDB;
    this.goAnalyzer = goAnalyzer;
    this.pythonAnalyzer = pythonAnalyzer;
    this.nodeAnalyzer = nodeAnalyzer;
  }

  /**
   * Start automatic indexing on a schedule (every hour)
   */
  startAutoIndexing(cronSchedule: string = "0 * * * *"): void {
    if (this.cronTask) {
      console.error("[ProjectIndexer] Auto-indexing already running");
      return;
    }

    this.cronTask = cron.schedule(cronSchedule, async () => {
      await this.indexPendingProjects();
    });

    console.error(`[ProjectIndexer] Auto-indexing started (schedule: ${cronSchedule})`);
  }

  /**
   * Stop automatic indexing
   */
  stopAutoIndexing(): void {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      console.error("[ProjectIndexer] Auto-indexing stopped");
    }
  }

  /**
   * Index all projects that need indexing
   */
  async indexPendingProjects(): Promise<void> {
    if (this.isIndexing) {
      console.error("[ProjectIndexer] Already indexing, skipping...");
      return;
    }

    this.isIndexing = true;

    try {
      const projectsToIndex = this.registry.getProjectsNeedingIndex();
      console.error(`[ProjectIndexer] Found ${projectsToIndex.length} projects to index`);

      for (const project of projectsToIndex) {
        await this.indexProject(project);
      }
    } catch (error) {
      console.error("[ProjectIndexer] Error during batch indexing:", error);
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Index a single project
   */
  async indexProject(project: ProjectMetadata): Promise<void> {
    console.error(`[ProjectIndexer] Indexing ${project.name} (${project.language})...`);

    try {
      // Update status to indexing
      await this.registry.updateIndexStatus(project.path, "indexing");

      // Index based on language
      let symbolCount = 0;
      let testCount = 0;
      let docCount = 0;

      if (project.language === "go") {
        const result = await this.indexGoProject(project);
        symbolCount = result.symbolCount;
        testCount = result.testCount;
        docCount = result.docCount;
      } else if (project.language === "python") {
        const result = await this.indexPythonProject(project);
        symbolCount = result.symbolCount;
        testCount = result.testCount;
        docCount = result.docCount;
      } else if (project.language === "nodejs") {
        const result = await this.indexNodeProject(project);
        symbolCount = result.symbolCount;
        testCount = result.testCount;
        docCount = result.docCount;
      } else if (project.language === "mixed") {
        // For mixed projects, try to index all languages
        const results = await Promise.allSettled([
          this.indexGoProject(project),
          this.indexPythonProject(project),
          this.indexNodeProject(project),
        ]);

        for (const result of results) {
          if (result.status === "fulfilled") {
            symbolCount += result.value.symbolCount;
            testCount += result.value.testCount;
            docCount += result.value.docCount;
          }
        }
      }

      // Update status to completed
      await this.registry.updateIndexStatus(project.path, "completed", {
        symbolCount,
        testCount,
        docCount,
      });

      console.error(
        `[ProjectIndexer] ✓ Indexed ${project.name}: ${symbolCount} symbols, ${testCount} tests, ${docCount} docs`
      );
    } catch (error) {
      console.error(`[ProjectIndexer] ✗ Failed to index ${project.name}:`, error);

      await this.registry.updateIndexStatus(project.path, "failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Index a Go project
   */
  private async indexGoProject(
    project: ProjectMetadata
  ): Promise<{ symbolCount: number; testCount: number; docCount: number }> {
    let symbolCount = 0;
    let testCount = 0;
    let docCount = 0;

    try {
      // Find and index symbols
      const symbolsResult = await this.goAnalyzer.handleTool("go_find_symbols", {
        path: project.path,
      });

      if (symbolsResult.content?.[0]?.text) {
        const symbols = JSON.parse(symbolsResult.content[0].text);
        symbolCount = symbols.length || 0;

        // Index symbols into vector DB
        const symbolDocs = symbols.map((symbol: any) => ({
          id: `${project.path}:go:symbol:${symbol.name}`,
          text: `${symbol.name} ${symbol.type} in ${symbol.file}\n${symbol.signature || ""}`,
          metadata: {
            type: "local_symbol",
            language: "go",
            project_path: project.path,
            project_name: project.name,
            symbol_name: symbol.name,
            symbol_type: symbol.type,
            file: symbol.file,
            line: symbol.line,
          },
        }));

        if (symbolDocs.length > 0) {
          await this.vectorDB.addDocuments(symbolDocs);
        }
      }

      // Find and index tests
      const testsResult = await this.goAnalyzer.handleTool("go_find_tests", {
        path: project.path,
      });

      if (testsResult.content?.[0]?.text) {
        const tests = JSON.parse(testsResult.content[0].text);
        testCount = tests.length || 0;

        // Index tests into vector DB
        const testDocs = tests.map((test: any) => ({
          id: `${project.path}:go:test:${test.name}`,
          text: `Test: ${test.name} in ${test.file}`,
          metadata: {
            type: "local_test",
            language: "go",
            project_path: project.path,
            project_name: project.name,
            test_name: test.name,
            file: test.file,
            line: test.line,
          },
        }));

        if (testDocs.length > 0) {
          await this.vectorDB.addDocuments(testDocs);
        }
      }

      // Index README and documentation files
      docCount = await this.indexProjectDocs(project, "go");
    } catch (error) {
      console.error(`[ProjectIndexer] Error indexing Go project ${project.name}:`, error);
    }

    return { symbolCount, testCount, docCount };
  }

  /**
   * Index a Python project
   */
  private async indexPythonProject(
    project: ProjectMetadata
  ): Promise<{ symbolCount: number; testCount: number; docCount: number }> {
    let symbolCount = 0;
    let testCount = 0;
    let docCount = 0;

    try {
      // Find and index symbols
      const symbolsResult = await this.pythonAnalyzer.handleTool("python_find_symbols", {
        path: project.path,
      });

      if (symbolsResult.content?.[0]?.text) {
        const symbols = JSON.parse(symbolsResult.content[0].text);
        symbolCount = symbols.length || 0;

        const symbolDocs = symbols.map((symbol: any) => ({
          id: `${project.path}:python:symbol:${symbol.name}`,
          text: `${symbol.name} ${symbol.type} in ${symbol.file}\n${symbol.signature || ""}`,
          metadata: {
            type: "local_symbol",
            language: "python",
            project_path: project.path,
            project_name: project.name,
            symbol_name: symbol.name,
            symbol_type: symbol.type,
            file: symbol.file,
            line: symbol.line,
          },
        }));

        if (symbolDocs.length > 0) {
          await this.vectorDB.addDocuments(symbolDocs);
        }
      }

      // Find and index tests
      const testsResult = await this.pythonAnalyzer.handleTool("python_find_tests", {
        path: project.path,
      });

      if (testsResult.content?.[0]?.text) {
        const tests = JSON.parse(testsResult.content[0].text);
        testCount = tests.length || 0;

        const testDocs = tests.map((test: any) => ({
          id: `${project.path}:python:test:${test.name}`,
          text: `Test: ${test.name} in ${test.file}`,
          metadata: {
            type: "local_test",
            language: "python",
            project_path: project.path,
            project_name: project.name,
            test_name: test.name,
            file: test.file,
            line: test.line,
          },
        }));

        if (testDocs.length > 0) {
          await this.vectorDB.addDocuments(testDocs);
        }
      }

      // Index documentation
      docCount = await this.indexProjectDocs(project, "python");
    } catch (error) {
      console.error(`[ProjectIndexer] Error indexing Python project ${project.name}:`, error);
    }

    return { symbolCount, testCount, docCount };
  }

  /**
   * Index a Node.js project
   */
  private async indexNodeProject(
    project: ProjectMetadata
  ): Promise<{ symbolCount: number; testCount: number; docCount: number }> {
    let symbolCount = 0;
    let testCount = 0;
    let docCount = 0;

    try {
      // Find and index symbols
      const symbolsResult = await this.nodeAnalyzer.handleTool("node_find_symbols", {
        path: project.path,
      });

      if (symbolsResult.content?.[0]?.text) {
        const symbols = JSON.parse(symbolsResult.content[0].text);
        symbolCount = symbols.length || 0;

        const symbolDocs = symbols.map((symbol: any) => ({
          id: `${project.path}:node:symbol:${symbol.name}`,
          text: `${symbol.name} ${symbol.type} in ${symbol.file}\n${symbol.signature || ""}`,
          metadata: {
            type: "local_symbol",
            language: "nodejs",
            project_path: project.path,
            project_name: project.name,
            symbol_name: symbol.name,
            symbol_type: symbol.type,
            file: symbol.file,
            line: symbol.line,
          },
        }));

        if (symbolDocs.length > 0) {
          await this.vectorDB.addDocuments(symbolDocs);
        }
      }

      // Find and index tests
      const testsResult = await this.nodeAnalyzer.handleTool("node_find_tests", {
        path: project.path,
      });

      if (testsResult.content?.[0]?.text) {
        const tests = JSON.parse(testsResult.content[0].text);
        testCount = tests.length || 0;

        const testDocs = tests.map((test: any) => ({
          id: `${project.path}:node:test:${test.name}`,
          text: `Test: ${test.name} in ${test.file}`,
          metadata: {
            type: "local_test",
            language: "nodejs",
            project_path: project.path,
            project_name: project.name,
            test_name: test.name,
            file: test.file,
            line: test.line,
          },
        }));

        if (testDocs.length > 0) {
          await this.vectorDB.addDocuments(testDocs);
        }
      }

      // Index documentation
      docCount = await this.indexProjectDocs(project, "nodejs");
    } catch (error) {
      console.error(`[ProjectIndexer] Error indexing Node.js project ${project.name}:`, error);
    }

    return { symbolCount, testCount, docCount };
  }

  /**
   * Index project documentation files (README, docs/, etc.)
   */
  private async indexProjectDocs(
    project: ProjectMetadata,
    language: string
  ): Promise<number> {
    let docCount = 0;
    const docDocs: any[] = [];

    try {
      const docPatterns = [
        "README.md",
        "README.txt",
        "README",
        "CHANGELOG.md",
        "CONTRIBUTING.md",
        "docs",
        "documentation",
      ];

      for (const pattern of docPatterns) {
        const docPath = path.join(project.path, pattern);
        try {
          const stat = await import("fs/promises").then((fs) => fs.stat(docPath));

          if (stat.isFile()) {
            const content = await import("fs/promises").then((fs) =>
              fs.readFile(docPath, "utf-8")
            );

            docDocs.push({
              id: `${project.path}:doc:${pattern}`,
              text: content,
              metadata: {
                type: "local_doc",
                language,
                project_path: project.path,
                project_name: project.name,
                file: pattern,
              },
            });

            docCount++;
          } else if (stat.isDirectory()) {
            // Index all markdown files in docs directory
            const files = await readdir(docPath);
            for (const file of files) {
              if (file.endsWith(".md") || file.endsWith(".txt")) {
                const filePath = path.join(docPath, file);
                const content = await import("fs/promises").then((fs) =>
                  fs.readFile(filePath, "utf-8")
                );

                docDocs.push({
                  id: `${project.path}:doc:${pattern}/${file}`,
                  text: content,
                  metadata: {
                    type: "local_doc",
                    language,
                    project_path: project.path,
                    project_name: project.name,
                    file: `${pattern}/${file}`,
                  },
                });

                docCount++;
              }
            }
          }
        } catch {
          // File/directory doesn't exist, continue
        }
      }

      // Add all doc documents in batch
      if (docDocs.length > 0) {
        await this.vectorDB.addDocuments(docDocs);
      }
    } catch (error) {
      console.error(`[ProjectIndexer] Error indexing docs for ${project.name}:`, error);
    }

    return docCount;
  }

  /**
   * Force reindex of a specific project
   */
  async reindexProject(projectPath: string): Promise<void> {
    const project = this.registry.getProject(projectPath);
    if (!project) {
      throw new Error(`Project not found: ${projectPath}`);
    }

    await this.indexProject(project);
  }

  /**
   * Get indexing statistics
   */
  getStats(): {
    isIndexing: boolean;
    autoIndexingEnabled: boolean;
    projectStats: ReturnType<ProjectRegistry["getStats"]>;
  } {
    return {
      isIndexing: this.isIndexing,
      autoIndexingEnabled: this.cronTask !== null,
      projectStats: this.registry.getStats(),
    };
  }
}
