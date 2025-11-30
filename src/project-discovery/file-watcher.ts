import { watch, FSWatcher } from "fs";
import { ProjectRegistry, ProjectMetadata } from "./registry.js";
import { ProjectIndexer } from "./indexer.js";
import * as path from "path";

export class ProjectFileWatcher {
  private registry: ProjectRegistry;
  private indexer: ProjectIndexer;
  private watchers: Map<string, FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceDelay = 5000; // 5 seconds

  constructor(registry: ProjectRegistry, indexer: ProjectIndexer) {
    this.registry = registry;
    this.indexer = indexer;
  }

  /**
   * Start watching all registered projects
   */
  startWatchingAll(): void {
    const projects = this.registry.getAllProjects();
    console.error(`[FileWatcher] Starting file watchers for ${projects.length} projects`);

    for (const project of projects) {
      this.watchProject(project);
    }
  }

  /**
   * Watch a specific project for changes
   */
  watchProject(project: ProjectMetadata): void {
    if (this.watchers.has(project.path)) {
      console.error(`[FileWatcher] Already watching ${project.name}`);
      return;
    }

    try {
      // Watch for changes in the project directory
      const watcher = watch(
        project.path,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFileChange(project, filename, eventType);
          }
        }
      );

      this.watchers.set(project.path, watcher);
      console.error(`[FileWatcher] Now watching ${project.name} at ${project.path}`);
    } catch (error) {
      console.error(`[FileWatcher] Failed to watch ${project.name}:`, error);
    }
  }

  /**
   * Handle file change events
   */
  private handleFileChange(
    project: ProjectMetadata,
    filename: string,
    eventType: string
  ): void {
    // Ignore common non-source directories
    if (this.shouldIgnoreFile(filename)) {
      return;
    }

    // Only reindex for source code changes
    if (!this.isSourceFile(filename, project.language)) {
      return;
    }

    console.error(
      `[FileWatcher] Detected ${eventType} in ${project.name}: ${filename}`
    );

    // Debounce reindexing to avoid too frequent updates
    this.debounceReindex(project);
  }

  /**
   * Debounce reindexing to avoid triggering too frequently
   */
  private debounceReindex(project: ProjectMetadata): void {
    // Clear existing timer for this project
    const existingTimer = this.debounceTimers.get(project.path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      console.error(`[FileWatcher] Reindexing ${project.name} after file changes`);
      try {
        await this.indexer.reindexProject(project.path);
      } catch (error) {
        console.error(`[FileWatcher] Error reindexing ${project.name}:`, error);
      } finally {
        this.debounceTimers.delete(project.path);
      }
    }, this.debounceDelay);

    this.debounceTimers.set(project.path, timer);
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnoreFile(filename: string): boolean {
    const ignorePaths = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "target",
      "__pycache__",
      ".venv",
      "venv",
      "env",
      "vendor",
      ".next",
      ".cache",
      "tmp",
      "temp",
      "coverage",
      ".pytest_cache",
      ".mypy_cache",
      ".idea",
      ".vscode",
    ];

    return ignorePaths.some((ignorePath) => filename.includes(ignorePath));
  }

  /**
   * Check if file is a source file based on language
   */
  private isSourceFile(filename: string, language: string): boolean {
    const ext = path.extname(filename);

    const sourceExtensions: Record<string, string[]> = {
      go: [".go"],
      python: [".py"],
      nodejs: [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"],
      mixed: [".go", ".py", ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"],
    };

    const extensions = sourceExtensions[language] || [];
    return extensions.includes(ext);
  }

  /**
   * Stop watching a specific project
   */
  stopWatchingProject(projectPath: string): void {
    const watcher = this.watchers.get(projectPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectPath);
      console.error(`[FileWatcher] Stopped watching ${projectPath}`);
    }

    // Clear any pending debounce timer
    const timer = this.debounceTimers.get(projectPath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(projectPath);
    }
  }

  /**
   * Stop watching all projects
   */
  stopWatchingAll(): void {
    console.error(`[FileWatcher] Stopping all file watchers`);

    for (const [projectPath] of this.watchers) {
      this.stopWatchingProject(projectPath);
    }
  }

  /**
   * Get status of all watchers
   */
  getStatus(): {
    watchedProjects: number;
    pendingReindexes: number;
  } {
    return {
      watchedProjects: this.watchers.size,
      pendingReindexes: this.debounceTimers.size,
    };
  }
}
