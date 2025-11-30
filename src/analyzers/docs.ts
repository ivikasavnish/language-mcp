import { VectorDBManager } from "../vector-db/manager.js";
import { DocScraper } from "../scrapers/doc-scraper.js";
import { DocServerManager } from "../doc-servers/server-manager.js";

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class DocsAnalyzer {
  private vectorDB: VectorDBManager;
  private scraper: DocScraper;
  private serverManager: DocServerManager;
  private initialized: boolean = false;

  constructor() {
    this.vectorDB = new VectorDBManager();
    this.scraper = new DocScraper();
    this.serverManager = new DocServerManager();
  }

  async initialize() {
    if (!this.initialized) {
      await this.vectorDB.initialize();
      this.initialized = true;
    }
  }

  async handleTool(toolName: string, args: any): Promise<ToolResponse> {
    // Ensure initialized
    await this.initialize();

    switch (toolName) {
      case "search_docs":
        return await this.searchDocs(args);
      case "scrape_docs":
        return await this.scrapeDocs(args);
      case "get_doc_stats":
        return await this.getDocStats(args);
      case "start_doc_server":
        return await this.startDocServer(args);
      case "stop_doc_server":
        return await this.stopDocServer(args);
      case "list_doc_servers":
        return await this.listDocServers(args);
      case "index_local_docs":
        return await this.indexLocalDocs(args);
      case "scrape_package_docs":
        return await this.scrapePackageDocs(args);
      default:
        throw new Error(`Unknown docs tool: ${toolName}`);
    }
  }

  private async searchDocs(args: any): Promise<ToolResponse> {
    const { query, language, type, limit = 10 } = args;

    try {
      const results = await this.vectorDB.search(
        query,
        { language, type },
        limit
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query,
                results_found: results.length,
                results: results.map((r) => ({
                  content: r.content.substring(0, 500) + "...", // Truncate for readability
                  full_content: r.content,
                  metadata: r.metadata,
                  relevance_score: r.score,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to search docs: ${error}`);
    }
  }

  private async scrapeDocs(args: any): Promise<ToolResponse> {
    const { languages = ["go", "python", "nodejs"] } = args;

    try {
      const results: any = {
        scraped: {},
        total_chunks: 0,
      };

      for (const language of languages) {
        console.error(`Scraping ${language} documentation...`);
        let docs: any[] = [];

        switch (language) {
          case "go":
            docs = await this.scraper.scrapeGoDocumentation();
            break;
          case "python":
            docs = await this.scraper.scrapePythonDocumentation();
            break;
          case "nodejs":
            docs = await this.scraper.scrapeNodeDocumentation();
            break;
        }

        if (docs.length > 0) {
          await this.vectorDB.addDocuments(docs);
          results.scraped[language] = docs.length;
          results.total_chunks += docs.length;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                ...results,
                message: `Successfully scraped and indexed ${results.total_chunks} documentation chunks`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to scrape docs: ${error}`);
    }
  }

  private async getDocStats(args: any): Promise<ToolResponse> {
    try {
      const stats = await this.vectorDB.getStats();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total_documents: stats.totalDocuments,
                by_language: stats.byLanguage,
                by_type: stats.byType,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get doc stats: ${error}`);
    }
  }

  private async startDocServer(args: any): Promise<ToolResponse> {
    const { language, project_path } = args;

    try {
      let server;

      switch (language) {
        case "go":
          server = await this.serverManager.startGoDocServer(project_path);
          break;
        case "python":
          server = await this.serverManager.startPythonDocServer(project_path);
          break;
        case "nodejs":
          const result = await this.serverManager.generateNodeDocs(project_path);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "success",
                    language,
                    message: result.output,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                language: server.language,
                port: server.port,
                url: server.url,
                message: `Documentation server started at ${server.url}`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to start doc server: ${error}`);
    }
  }

  private async stopDocServer(args: any): Promise<ToolResponse> {
    const { language } = args;

    try {
      const stopped = await this.serverManager.stopServer(language);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: stopped ? "success" : "not_found",
                language,
                message: stopped
                  ? `Stopped ${language} documentation server`
                  : `No ${language} documentation server running`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to stop doc server: ${error}`);
    }
  }

  private async listDocServers(args: any): Promise<ToolResponse> {
    try {
      const servers = this.serverManager.getAllServers();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                servers_running: servers.length,
                servers: servers.map((s) => ({
                  language: s.language,
                  port: s.port,
                  url: s.url,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to list doc servers: ${error}`);
    }
  }

  private async indexLocalDocs(args: any): Promise<ToolResponse> {
    const { project_path, language } = args;

    try {
      const docs = await this.serverManager.scrapeLocalDocs(
        project_path,
        language
      );

      if (docs.length > 0) {
        await this.vectorDB.addDocuments(docs);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                language,
                project_path,
                documents_indexed: docs.length,
                message: `Indexed ${docs.length} local documentation chunks`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to index local docs: ${error}`);
    }
  }

  private async scrapePackageDocs(args: any): Promise<ToolResponse> {
    const { package_name, language } = args;

    try {
      const docs = await this.scraper.scrapePackageDocs(package_name, language);

      if (docs.length > 0) {
        await this.vectorDB.addDocuments(docs);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                package_name,
                language,
                documents_indexed: docs.length,
                message: `Scraped and indexed ${docs.length} chunks from ${package_name}`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to scrape package docs: ${error}`);
    }
  }
}
