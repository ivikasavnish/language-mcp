import { readFile, writeFile, mkdir } from "fs/promises";
import * as path from "path";
import { DiscoveredProject } from "./scanner.js";

export interface ProjectMetadata extends DiscoveredProject {
  lastIndexed?: number;
  indexStatus: "pending" | "indexing" | "completed" | "failed";
  symbolCount?: number;
  testCount?: number;
  docCount?: number;
  error?: string;
}

export class ProjectRegistry {
  private projects: Map<string, ProjectMetadata> = new Map();
  private registryPath: string;

  constructor(dataDir: string = "./project_data") {
    this.registryPath = path.join(dataDir, "registry.json");
  }

  /**
   * Load registry from disk
   */
  async load(): Promise<void> {
    try {
      const data = await readFile(this.registryPath, "utf-8");
      const parsed = JSON.parse(data);

      this.projects.clear();
      for (const project of parsed.projects || []) {
        this.projects.set(project.path, project);
      }

      console.error(`[ProjectRegistry] Loaded ${this.projects.size} projects`);
    } catch (error) {
      console.error("[ProjectRegistry] No existing registry, starting fresh");
      this.projects.clear();
    }
  }

  /**
   * Save registry to disk
   */
  async save(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.registryPath);
      await mkdir(dir, { recursive: true });

      const data = {
        version: "1.0",
        lastUpdated: new Date().toISOString(),
        projects: Array.from(this.projects.values()),
      };

      await writeFile(this.registryPath, JSON.stringify(data, null, 2));
      console.error(`[ProjectRegistry] Saved ${this.projects.size} projects`);
    } catch (error) {
      console.error("[ProjectRegistry] Error saving registry:", error);
    }
  }

  /**
   * Add or update a project
   */
  async addProject(project: DiscoveredProject): Promise<void> {
    const existing = this.projects.get(project.path);

    const metadata: ProjectMetadata = {
      ...project,
      indexStatus: existing?.indexStatus || "pending",
      lastIndexed: existing?.lastIndexed,
      symbolCount: existing?.symbolCount,
      testCount: existing?.testCount,
      docCount: existing?.docCount,
    };

    this.projects.set(project.path, metadata);
    await this.save();
  }

  /**
   * Update project index status
   */
  async updateIndexStatus(
    projectPath: string,
    status: ProjectMetadata["indexStatus"],
    metadata?: {
      symbolCount?: number;
      testCount?: number;
      docCount?: number;
      error?: string;
    }
  ): Promise<void> {
    const project = this.projects.get(projectPath);
    if (!project) return;

    project.indexStatus = status;
    if (status === "completed") {
      project.lastIndexed = Date.now();
    }

    if (metadata) {
      Object.assign(project, metadata);
    }

    this.projects.set(projectPath, project);
    await this.save();
  }

  /**
   * Get all projects
   */
  getAllProjects(): ProjectMetadata[] {
    return Array.from(this.projects.values());
  }

  /**
   * Get projects by status
   */
  getProjectsByStatus(
    status: ProjectMetadata["indexStatus"]
  ): ProjectMetadata[] {
    return this.getAllProjects().filter((p) => p.indexStatus === status);
  }

  /**
   * Get projects by language
   */
  getProjectsByLanguage(
    language: DiscoveredProject["language"]
  ): ProjectMetadata[] {
    return this.getAllProjects().filter((p) => p.language === language);
  }

  /**
   * Get project by path
   */
  getProject(projectPath: string): ProjectMetadata | undefined {
    return this.projects.get(projectPath);
  }

  /**
   * Remove project
   */
  async removeProject(projectPath: string): Promise<void> {
    this.projects.delete(projectPath);
    await this.save();
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    byLanguage: Record<string, number>;
    byStatus: Record<string, number>;
    byIDE: Record<string, number>;
  } {
    const projects = this.getAllProjects();

    return {
      total: projects.length,
      byLanguage: this.groupBy(projects, "language"),
      byStatus: this.groupBy(projects, "indexStatus"),
      byIDE: this.groupBy(projects, "ide"),
    };
  }

  /**
   * Helper to group by field
   */
  private groupBy(
    projects: ProjectMetadata[],
    field: keyof ProjectMetadata
  ): Record<string, number> {
    const result: Record<string, number> = {};

    for (const project of projects) {
      const value = String(project[field]);
      result[value] = (result[value] || 0) + 1;
    }

    return result;
  }

  /**
   * Get projects that need indexing
   */
  getProjectsNeedingIndex(): ProjectMetadata[] {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    return this.getAllProjects().filter((p) => {
      // Never indexed
      if (!p.lastIndexed) return true;

      // Failed last time
      if (p.indexStatus === "failed") return true;

      // Not indexed in last 24 hours
      if (now - p.lastIndexed > ONE_DAY) return true;

      return false;
    });
  }
}
