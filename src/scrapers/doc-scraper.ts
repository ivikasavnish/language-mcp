import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { createHash } from "crypto";

interface ScrapedDoc {
  id: string;
  content: string;
  metadata: {
    source: string;
    language: string;
    url: string;
    type: "official_doc" | "local_doc" | "package_doc";
    timestamp: number;
    title?: string;
  };
}

export class DocScraper {
  private userAgent =
    "Mozilla/5.0 (compatible; LanguageMCPBot/1.0; +https://github.com/language-mcp)";

  async scrapeURL(
    url: string,
    language: string,
    type: "official_doc" | "package_doc" = "official_doc"
  ): Promise<ScrapedDoc[]> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove script and style tags
      $("script, style, nav, footer, .sidebar, #sidebar").remove();

      // Extract main content
      let content = "";
      let title = $("h1").first().text() || $("title").text();

      // Try to find main content area
      const mainSelectors = [
        "main",
        "article",
        ".content",
        ".documentation",
        "#content",
        ".main-content",
      ];

      for (const selector of mainSelectors) {
        const mainContent = $(selector);
        if (mainContent.length > 0) {
          content = mainContent.text();
          break;
        }
      }

      // Fallback to body if no main content found
      if (!content) {
        content = $("body").text();
      }

      // Clean up whitespace
      content = content.replace(/\s+/g, " ").trim();

      // Split into chunks (max 1000 chars per chunk for better search)
      const chunks = this.chunkText(content, 1000);

      return chunks.map((chunk, index) => ({
        id: this.generateId(url, index),
        content: chunk,
        metadata: {
          source: new URL(url).hostname,
          language,
          url,
          type,
          timestamp: Date.now(),
          title: index === 0 ? title : `${title} (part ${index + 1})`,
        },
      }));
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return [];
    }
  }

  async scrapeGoDocumentation(): Promise<ScrapedDoc[]> {
    const urls = [
      "https://go.dev/doc/effective_go",
      "https://go.dev/doc/tutorial/getting-started",
      "https://go.dev/doc/tutorial/create-module",
      "https://pkg.go.dev/std",
    ];

    const results: ScrapedDoc[] = [];
    for (const url of urls) {
      console.error(`Scraping Go docs: ${url}`);
      const docs = await this.scrapeURL(url, "go", "official_doc");
      results.push(...docs);
    }

    return results;
  }

  async scrapePythonDocumentation(): Promise<ScrapedDoc[]> {
    const urls = [
      "https://docs.python.org/3/tutorial/index.html",
      "https://docs.python.org/3/library/index.html",
      "https://docs.python.org/3/reference/index.html",
    ];

    const results: ScrapedDoc[] = [];
    for (const url of urls) {
      console.error(`Scraping Python docs: ${url}`);
      const docs = await this.scrapeURL(url, "python", "official_doc");
      results.push(...docs);
    }

    return results;
  }

  async scrapeNodeDocumentation(): Promise<ScrapedDoc[]> {
    const urls = [
      "https://nodejs.org/docs/latest/api/",
      "https://nodejs.org/en/learn/getting-started/introduction-to-nodejs",
    ];

    const results: ScrapedDoc[] = [];
    for (const url of urls) {
      console.error(`Scraping Node.js docs: ${url}`);
      const docs = await this.scrapeURL(url, "nodejs", "official_doc");
      results.push(...docs);
    }

    return results;
  }

  async scrapePackageDocs(
    packageName: string,
    language: "go" | "python" | "nodejs"
  ): Promise<ScrapedDoc[]> {
    let url = "";

    switch (language) {
      case "go":
        url = `https://pkg.go.dev/${packageName}`;
        break;
      case "python":
        url = `https://pypi.org/project/${packageName}/`;
        break;
      case "nodejs":
        url = `https://www.npmjs.com/package/${packageName}`;
        break;
    }

    console.error(`Scraping package docs: ${url}`);
    return await this.scrapeURL(url, language, "package_doc");
  }

  private chunkText(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = "";

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      } else {
        currentChunk += " " + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private generateId(url: string, index: number): string {
    const hash = createHash("md5").update(url + index).digest("hex");
    return `doc_${hash}`;
  }
}
