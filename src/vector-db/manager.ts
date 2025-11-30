import { ChromaClient, Collection } from "chromadb";
import { pipeline } from "@xenova/transformers";
import * as path from "path";
import * as fs from "fs/promises";

interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    language: string;
    url?: string;
    type: "official_doc" | "local_doc" | "package_doc";
    timestamp: number;
  };
}

export class VectorDBManager {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embedder: any = null;
  private dbPath: string;

  constructor(dbPath: string = "./chroma_db") {
    this.dbPath = dbPath;
    this.client = new ChromaClient({
      path: dbPath,
    });
  }

  async initialize() {
    try {
      // Initialize the embedding model (uses local sentence-transformers)
      console.error("Loading embedding model...");
      this.embedder = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      );

      // Create or get collection
      try {
        this.collection = await this.client.getOrCreateCollection({
          name: "documentation",
          metadata: { description: "Documentation for Go, Python, and Node.js" },
        });
        console.error("Vector DB collection ready");
      } catch (error) {
        console.error("Error creating collection:", error);
        throw error;
      }
    } catch (error) {
      console.error("Failed to initialize vector DB:", error);
      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error("Embedder not initialized");
    }

    const output = await this.embedder(text, {
      pooling: "mean",
      normalize: true,
    });

    return Array.from(output.data);
  }

  async addDocuments(documents: DocumentChunk[]): Promise<void> {
    if (!this.collection) {
      throw new Error("Collection not initialized");
    }

    const ids = documents.map((doc) => doc.id);
    const contents = documents.map((doc) => doc.content);
    const metadatas = documents.map((doc) => doc.metadata);

    // Generate embeddings for all documents
    const embeddings = await Promise.all(
      contents.map((content) => this.generateEmbedding(content))
    );

    await this.collection.add({
      ids,
      embeddings,
      documents: contents,
      metadatas,
    });

    console.error(`Added ${documents.length} documents to vector DB`);
  }

  async search(
    query: string,
    filters?: {
      language?: string;
      type?: string;
    },
    limit: number = 10
  ): Promise<
    Array<{
      content: string;
      metadata: any;
      score: number;
    }>
  > {
    if (!this.collection) {
      throw new Error("Collection not initialized");
    }

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Build where clause for filtering
    const where: any = {};
    if (filters?.language) {
      where.language = filters.language;
    }
    if (filters?.type) {
      where.type = filters.type;
    }

    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      where: Object.keys(where).length > 0 ? where : undefined,
    });

    // Format results
    const formattedResults = [];
    if (results.documents && results.documents[0]) {
      for (let i = 0; i < results.documents[0].length; i++) {
        formattedResults.push({
          content: results.documents[0][i] || "",
          metadata: results.metadatas?.[0]?.[i] || {},
          score: results.distances?.[0]?.[i] || 0,
        });
      }
    }

    return formattedResults;
  }

  async getStats(): Promise<{
    totalDocuments: number;
    byLanguage: Record<string, number>;
    byType: Record<string, number>;
  }> {
    if (!this.collection) {
      throw new Error("Collection not initialized");
    }

    const count = await this.collection.count();

    // Get all documents to calculate stats
    const allDocs = await this.collection.get();

    const byLanguage: Record<string, number> = {};
    const byType: Record<string, number> = {};

    if (allDocs.metadatas) {
      allDocs.metadatas.forEach((meta: any) => {
        if (meta.language) {
          byLanguage[meta.language] = (byLanguage[meta.language] || 0) + 1;
        }
        if (meta.type) {
          byType[meta.type] = (byType[meta.type] || 0) + 1;
        }
      });
    }

    return {
      totalDocuments: count,
      byLanguage,
      byType,
    };
  }

  async deleteBySource(source: string): Promise<number> {
    if (!this.collection) {
      throw new Error("Collection not initialized");
    }

    const docs = await this.collection.get({
      where: { source },
    });

    if (docs.ids && docs.ids.length > 0) {
      await this.collection.delete({
        ids: docs.ids,
      });
      return docs.ids.length;
    }

    return 0;
  }

  async clearAll(): Promise<void> {
    if (!this.collection) {
      throw new Error("Collection not initialized");
    }

    await this.client.deleteCollection({ name: "documentation" });
    this.collection = await this.client.createCollection({
      name: "documentation",
      metadata: { description: "Documentation for Go, Python, and Node.js" },
    });
  }
}
