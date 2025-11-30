import { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { ProjectScanner } from "../project-discovery/scanner.js";
import { ProjectRegistry } from "../project-discovery/registry.js";
import { ProjectIndexer } from "../project-discovery/indexer.js";
import { ProjectFileWatcher } from "../project-discovery/file-watcher.js";
import { VectorDBManager } from "../vector-db/manager.js";
import { GoAnalyzer } from "./golang.js";
import { PythonAnalyzer } from "./python.js";
import { NodeAnalyzer } from "./node.js";

export class ProjectsAnalyzer {
  private scanner: ProjectScanner;
  private registry: ProjectRegistry;
  private indexer: ProjectIndexer | null = null;
  private watcher: ProjectFileWatcher | null = null;
  private vectorDB: VectorDBManager;
  private goAnalyzer: GoAnalyzer;
  private pythonAnalyzer: PythonAnalyzer;
  private nodeAnalyzer: NodeAnalyzer;

  constructor(
    vectorDB: VectorDBManager,
    goAnalyzer: GoAnalyzer,
    pythonAnalyzer: PythonAnalyzer,
    nodeAnalyzer: NodeAnalyzer
  ) {
    this.scanner = new ProjectScanner();
    this.registry = new ProjectRegistry();
    this.vectorDB = vectorDB;
    this.goAnalyzer = goAnalyzer;
    this.pythonAnalyzer = pythonAnalyzer;
    this.nodeAnalyzer = nodeAnalyzer;
  }

  /**
   * Initialize the project discovery system
   */
  async initialize(): Promise<void> {
    // Load existing registry
    await this.registry.load();

    // Initialize indexer
    this.indexer = new ProjectIndexer(
      this.registry,
      this.vectorDB,
      this.goAnalyzer,
      this.pythonAnalyzer,
      this.nodeAnalyzer
    );

    // Initialize file watcher
    this.watcher = new ProjectFileWatcher(this.registry, this.indexer);

    console.error("[ProjectsAnalyzer] Initialized");
  }

  /**
   * Start automatic background services
   */
  async startBackgroundServices(): Promise<void> {
    if (!this.indexer || !this.watcher) {
      throw new Error("ProjectsAnalyzer not initialized");
    }

    // Start auto-indexing (every hour)
    this.indexer.startAutoIndexing("0 * * * *");

    // Start file watchers
    this.watcher.startWatchingAll();

    console.error("[ProjectsAnalyzer] Background services started");
  }

  /**
   * Handle tool calls
   */
  async handleTool(name: string, args: any): Promise<CallToolResult> {
    if (!this.indexer || !this.watcher) {
      await this.initialize();
    }

    switch (name) {
      case "discover_projects":
        return await this.discoverProjects(args);

      case "list_projects":
        return await this.listProjects(args);

      case "reindex_project":
        return await this.reindexProject(args);

      case "get_project_stats":
        return await this.getProjectStats(args);

      case "start_auto_indexing":
        return await this.startAutoIndexing(args);

      case "stop_auto_indexing":
        return await this.stopAutoIndexing(args);

      case "watch_projects":
        return await this.watchProjects(args);

      case "unwatch_projects":
        return await this.unwatchProjects(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Discover projects on the system
   */
  private async discoverProjects(args: any): Promise<CallToolResult> {
    try {
      const useQuickScan = args.quick !== false; // Default to quick scan
      const maxDepth = args.max_depth || 3;

      console.error(
        `[ProjectsAnalyzer] Starting project discovery (quick: ${useQuickScan})...`
      );

      const projects = useQuickScan
        ? await this.scanner.quickDiscoverProjects()
        : await this.scanner.discoverProjects(maxDepth);

      // Add all discovered projects to registry
      for (const project of projects) {
        await this.registry.addProject(project);
      }

      // Start watching newly discovered projects
      if (this.watcher) {
        for (const project of projects) {
          const metadata = this.registry.getProject(project.path);
          if (metadata) {
            this.watcher.watchProject(metadata);
          }
        }
      }

      const result = {
        discovered: projects.length,
        projects: projects.map((p) => ({
          name: p.name,
          path: p.path,
          language: p.language,
          ide: p.ide,
          hasGit: p.hasGit,
          indicators: p.indicators,
        })),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          } as TextContent,
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to discover projects: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List all registered projects
   */
  private async listProjects(args: any): Promise<CallToolResult> {
    try {
      const language = args.language;
      const status = args.status;
      const ide = args.ide;

      let projects = this.registry.getAllProjects();

      // Apply filters
      if (language) {
        projects = projects.filter((p) => p.language === language);
      }
      if (status) {
        projects = projects.filter((p) => p.indexStatus === status);
      }
      if (ide) {
        projects = projects.filter((p) => p.ide === ide);
      }

      const result = {
        total: projects.length,
        projects: projects.map((p) => ({
          name: p.name,
          path: p.path,
          language: p.language,
          ide: p.ide,
          hasGit: p.hasGit,
          indexStatus: p.indexStatus,
          lastIndexed: p.lastIndexed
            ? new Date(p.lastIndexed).toISOString()
            : "never",
          symbolCount: p.symbolCount || 0,
          testCount: p.testCount || 0,
          docCount: p.docCount || 0,
          error: p.error,
        })),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          } as TextContent,
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Force reindex of a specific project
   */
  private async reindexProject(args: any): Promise<CallToolResult> {
    try {
      const { project_path } = args;

      if (!project_path) {
        throw new Error("project_path is required");
      }

      if (!this.indexer) {
        throw new Error("Indexer not initialized");
      }

      console.error(`[ProjectsAnalyzer] Reindexing ${project_path}...`);

      await this.indexer.reindexProject(project_path);

      const project = this.registry.getProject(project_path);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                project: {
                  name: project?.name,
                  path: project_path,
                  indexStatus: project?.indexStatus,
                  symbolCount: project?.symbolCount || 0,
                  testCount: project?.testCount || 0,
                  docCount: project?.docCount || 0,
                },
              },
              null,
              2
            ),
          } as TextContent,
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to reindex project: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get statistics about indexed projects
   */
  private async getProjectStats(args: any): Promise<CallToolResult> {
    try {
      if (!this.indexer) {
        throw new Error("Indexer not initialized");
      }

      const stats = this.indexer.getStats();
      const watcherStatus = this.watcher?.getStatus() || {
        watchedProjects: 0,
        pendingReindexes: 0,
      };

      const result = {
        indexing: {
          isIndexing: stats.isIndexing,
          autoIndexingEnabled: stats.autoIndexingEnabled,
        },
        fileWatcher: {
          enabled: this.watcher !== null,
          watchedProjects: watcherStatus.watchedProjects,
          pendingReindexes: watcherStatus.pendingReindexes,
        },
        projects: stats.projectStats,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          } as TextContent,
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get project stats: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Start automatic indexing
   */
  private async startAutoIndexing(args: any): Promise<CallToolResult> {
    try {
      if (!this.indexer) {
        throw new Error("Indexer not initialized");
      }

      const schedule = args.schedule || "0 * * * *"; // Default: every hour

      this.indexer.startAutoIndexing(schedule);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Auto-indexing started with schedule: ${schedule}`,
              },
              null,
              2
            ),
          } as TextContent,
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to start auto-indexing: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stop automatic indexing
   */
  private async stopAutoIndexing(args: any): Promise<CallToolResult> {
    try {
      if (!this.indexer) {
        throw new Error("Indexer not initialized");
      }

      this.indexer.stopAutoIndexing();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "Auto-indexing stopped",
              },
              null,
              2
            ),
          } as TextContent,
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to stop auto-indexing: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Start watching projects for file changes
   */
  private async watchProjects(args: any): Promise<CallToolResult> {
    try {
      if (!this.watcher) {
        throw new Error("File watcher not initialized");
      }

      this.watcher.startWatchingAll();

      const status = this.watcher.getStatus();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "File watchers started",
                watchedProjects: status.watchedProjects,
              },
              null,
              2
            ),
          } as TextContent,
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to start file watchers: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stop watching projects
   */
  private async unwatchProjects(args: any): Promise<CallToolResult> {
    try {
      if (!this.watcher) {
        throw new Error("File watcher not initialized");
      }

      this.watcher.stopWatchingAll();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "File watchers stopped",
              },
              null,
              2
            ),
          } as TextContent,
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to stop file watchers: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
