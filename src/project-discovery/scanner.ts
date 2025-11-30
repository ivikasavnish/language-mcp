import { exec } from "child_process";
import { promisify } from "util";
import { readdir, stat, readFile } from "fs/promises";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

export interface DiscoveredProject {
  path: string;
  name: string;
  language: "go" | "python" | "nodejs" | "mixed";
  ide: "vscode" | "jetbrains" | "multiple" | "none";
  hasGit: boolean;
  lastModified: number;
  indicators: string[];
}

export class ProjectScanner {
  private searchPaths: string[] = [];

  constructor() {
    const homeDir = os.homedir();

    // Common project locations
    this.searchPaths = [
      path.join(homeDir, "Desktop"),
      path.join(homeDir, "Documents"),
      path.join(homeDir, "Projects"),
      path.join(homeDir, "Development"),
      path.join(homeDir, "dev"),
      path.join(homeDir, "workspace"),
      path.join(homeDir, "GolandProjects"),
      path.join(homeDir, "PycharmProjects"),
      path.join(homeDir, "IdeaProjects"),
      homeDir, // Scan home directory too
    ];
  }

  /**
   * Discover all projects by scanning for IDE markers
   */
  async discoverProjects(maxDepth: number = 3): Promise<DiscoveredProject[]> {
    const projects: DiscoveredProject[] = [];
    const seen = new Set<string>();

    console.error("[ProjectScanner] Starting project discovery...");

    for (const searchPath of this.searchPaths) {
      try {
        const foundProjects = await this.scanDirectory(
          searchPath,
          maxDepth,
          0,
          seen
        );
        projects.push(...foundProjects);
      } catch (error) {
        console.error(`[ProjectScanner] Error scanning ${searchPath}:`, error);
      }
    }

    console.error(`[ProjectScanner] Discovered ${projects.length} projects`);
    return projects;
  }

  /**
   * Scan a directory recursively for projects
   */
  private async scanDirectory(
    dir: string,
    maxDepth: number,
    currentDepth: number,
    seen: Set<string>
  ): Promise<DiscoveredProject[]> {
    if (currentDepth > maxDepth) return [];

    // Skip if already seen
    const realPath = await this.getRealPath(dir);
    if (seen.has(realPath)) return [];
    seen.add(realPath);

    const projects: DiscoveredProject[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      // Check if current directory is a project
      const project = await this.analyzeDirectory(dir, entries.map(e => e.name));
      if (project) {
        projects.push(project);
        // Don't recurse into found projects
        return projects;
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip common non-project directories
        if (this.shouldSkipDirectory(entry.name)) continue;

        const subDir = path.join(dir, entry.name);
        const subProjects = await this.scanDirectory(
          subDir,
          maxDepth,
          currentDepth + 1,
          seen
        );
        projects.push(...subProjects);
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return projects;
  }

  /**
   * Analyze a directory to determine if it's a project
   */
  private async analyzeDirectory(
    dir: string,
    entries: string[]
  ): Promise<DiscoveredProject | null> {
    const indicators: string[] = [];
    let ide: "vscode" | "jetbrains" | "multiple" | "none" = "none";
    let language: "go" | "python" | "nodejs" | "mixed" = "nodejs";
    let hasGit = false;

    // Check for IDE markers
    const hasVSCode = entries.includes(".vscode");
    const hasJetBrains = entries.includes(".idea");

    if (hasVSCode && hasJetBrains) {
      ide = "multiple";
      indicators.push(".vscode", ".idea");
    } else if (hasVSCode) {
      ide = "vscode";
      indicators.push(".vscode");
    } else if (hasJetBrains) {
      ide = "jetbrains";
      indicators.push(".idea");
    }

    // Check for Git
    if (entries.includes(".git")) {
      hasGit = true;
      indicators.push(".git");
    }

    // Check for language-specific files
    const hasGoMod = entries.includes("go.mod");
    const hasGoSum = entries.includes("go.sum");
    const hasRequirementsTxt = entries.includes("requirements.txt");
    const hasSetupPy = entries.includes("setup.py");
    const hasPipfile = entries.includes("Pipfile");
    const hasPackageJson = entries.includes("package.json");
    const hasTsConfig = entries.includes("tsconfig.json");
    const hasPyprojectToml = entries.includes("pyproject.toml");

    // Determine primary language
    const languageScores = {
      go: 0,
      python: 0,
      nodejs: 0,
    };

    if (hasGoMod || hasGoSum) {
      languageScores.go += 10;
      indicators.push(hasGoMod ? "go.mod" : "go.sum");
    }

    if (hasRequirementsTxt || hasSetupPy || hasPipfile || hasPyprojectToml) {
      languageScores.python += 10;
      if (hasRequirementsTxt) indicators.push("requirements.txt");
      if (hasSetupPy) indicators.push("setup.py");
      if (hasPipfile) indicators.push("Pipfile");
      if (hasPyprojectToml) indicators.push("pyproject.toml");
    }

    if (hasPackageJson || hasTsConfig) {
      languageScores.nodejs += 10;
      if (hasPackageJson) indicators.push("package.json");
      if (hasTsConfig) indicators.push("tsconfig.json");
    }

    // Count source files
    const goFiles = entries.filter(e => e.endsWith(".go")).length;
    const pyFiles = entries.filter(e => e.endsWith(".py")).length;
    const jsFiles = entries.filter(e => e.match(/\.(js|ts|jsx|tsx)$/)).length;

    languageScores.go += goFiles;
    languageScores.python += pyFiles;
    languageScores.nodejs += jsFiles;

    // Determine language
    const maxScore = Math.max(
      languageScores.go,
      languageScores.python,
      languageScores.nodejs
    );

    if (maxScore === 0) return null; // Not a code project

    const activeLanguages = Object.entries(languageScores).filter(
      ([, score]) => score > 0
    ).length;

    if (activeLanguages > 1) {
      language = "mixed";
    } else if (languageScores.go === maxScore) {
      language = "go";
    } else if (languageScores.python === maxScore) {
      language = "python";
    } else {
      language = "nodejs";
    }

    // Must have at least one indicator to be considered a project
    if (indicators.length === 0) return null;

    // Get last modified time
    let lastModified = Date.now();
    try {
      const stats = await stat(dir);
      lastModified = stats.mtimeMs;
    } catch {
      // Use current time if can't get stats
    }

    return {
      path: dir,
      name: path.basename(dir),
      language,
      ide,
      hasGit,
      lastModified,
      indicators,
    };
  }

  /**
   * Get real path (resolve symlinks)
   */
  private async getRealPath(p: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`realpath "${p}"`);
      return stdout.trim();
    } catch {
      return p;
    }
  }

  /**
   * Determine if directory should be skipped
   */
  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "target",
      "__pycache__",
      ".venv",
      "venv",
      "env",
      ".env",
      "vendor",
      ".next",
      ".cache",
      "tmp",
      "temp",
      ".npm",
      ".yarn",
      "coverage",
      ".pytest_cache",
      ".mypy_cache",
      ".tox",
      "eggs",
      ".eggs",
      "lib",
      "lib64",
      "parts",
      "sdist",
      "wheels",
      ".idea",
      ".vscode",
    ];

    return skipDirs.includes(name) || name.startsWith(".");
  }

  /**
   * Quick scan using 'find' command for better performance
   */
  async quickDiscoverProjects(): Promise<DiscoveredProject[]> {
    const projects: DiscoveredProject[] = [];
    const homeDir = os.homedir();

    try {
      // Find all .vscode and .idea directories
      const { stdout } = await execAsync(
        `find "${homeDir}" -maxdepth 4 -type d \\( -name ".vscode" -o -name ".idea" \\) 2>/dev/null || true`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const ideMarkers = stdout.trim().split("\n").filter(Boolean);

      for (const marker of ideMarkers) {
        const projectPath = path.dirname(marker);
        const entries = await readdir(projectPath);
        const project = await this.analyzeDirectory(projectPath, entries);
        if (project) {
          projects.push(project);
        }
      }
    } catch (error) {
      console.error("[ProjectScanner] Quick scan failed, falling back:", error);
      // Fallback to regular scan
      return this.discoverProjects(2);
    }

    console.error(`[ProjectScanner] Quick scan found ${projects.length} projects`);
    return projects;
  }
}
