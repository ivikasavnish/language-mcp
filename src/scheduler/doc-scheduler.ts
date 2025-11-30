import cron from "node-cron";
import { VectorDBManager } from "../vector-db/manager.js";
import { DocScraper } from "../scrapers/doc-scraper.js";

export class DocScheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private vectorDB: VectorDBManager;
  private scraper: DocScraper;

  constructor(vectorDB: VectorDBManager, scraper: DocScraper) {
    this.vectorDB = vectorDB;
    this.scraper = scraper;
  }

  /**
   * Start daily documentation scraping at 2 AM
   */
  startDailyScraping() {
    // Run every day at 2 AM
    const task = cron.schedule("0 2 * * *", async () => {
      console.error("[Scheduler] Starting daily documentation scraping...");
      await this.scrapeAllDocs();
    });

    this.tasks.set("daily_scrape", task);
    console.error("[Scheduler] Daily scraping scheduled for 2 AM");
  }

  /**
   * Start weekly deep scraping on Sundays at 3 AM
   */
  startWeeklyScraping() {
    // Run every Sunday at 3 AM
    const task = cron.schedule("0 3 * * 0", async () => {
      console.error("[Scheduler] Starting weekly deep documentation scraping...");
      // Clear old docs and rescrape everything
      await this.vectorDB.clearAll();
      await this.scrapeAllDocs();
    });

    this.tasks.set("weekly_deep_scrape", task);
    console.error("[Scheduler] Weekly deep scraping scheduled for Sunday 3 AM");
  }

  /**
   * Run scraping immediately
   */
  async scrapeNow() {
    console.error("[Scheduler] Running immediate documentation scraping...");
    await this.scrapeAllDocs();
  }

  /**
   * Stop all scheduled tasks
   */
  stopAll() {
    this.tasks.forEach((task, name) => {
      task.stop();
      console.error(`[Scheduler] Stopped task: ${name}`);
    });
    this.tasks.clear();
  }

  /**
   * Get status of all scheduled tasks
   */
  getStatus(): any {
    const status: any = {
      active_tasks: this.tasks.size,
      tasks: [],
    };

    this.tasks.forEach((task, name) => {
      status.tasks.push({
        name,
        running: true,
      });
    });

    return status;
  }

  /**
   * Scrape documentation for all languages
   */
  private async scrapeAllDocs() {
    try {
      const languages = ["go", "python", "nodejs"];
      let totalDocs = 0;

      for (const language of languages) {
        try {
          console.error(`[Scheduler] Scraping ${language} documentation...`);
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
            totalDocs += docs.length;
            console.error(
              `[Scheduler] Indexed ${docs.length} ${language} documentation chunks`
            );
          }
        } catch (error) {
          console.error(`[Scheduler] Error scraping ${language}:`, error);
        }
      }

      console.error(
        `[Scheduler] Scraping complete. Total documents indexed: ${totalDocs}`
      );
    } catch (error) {
      console.error("[Scheduler] Error in scrapeAllDocs:", error);
    }
  }
}
