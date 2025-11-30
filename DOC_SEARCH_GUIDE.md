# Documentation Search & Vector DB Guide

## 🚀 New Features in v2.0

The Language MCP Server now includes powerful documentation search capabilities powered by vector databases and semantic search!

### What's New

✅ **Vector Database Integration** - ChromaDB with local embeddings
✅ **Semantic Documentation Search** - Natural language queries
✅ **Auto-scraping** - Background jobs to keep docs up-to-date
✅ **Local Doc Servers** - Start godoc, pydoc, typedoc servers
✅ **Package Documentation** - Scrape docs from pkg.go.dev, PyPI, npm
✅ **Local Project Indexing** - Index your own project docs

---

## 🔧 Installation & Setup

### 1. Dependencies Already Installed

The new dependencies are already included:
- `chromadb` - Vector database
- `@xenova/transformers` - Local embedding model
- `cheerio` - HTML parsing
- `node-fetch` - HTTP requests
- `node-cron` - Scheduled tasks

### 2. Enable Auto-Scraping (Optional)

To enable automatic daily documentation scraping:

```bash
# Edit your Claude Desktop config
nano ~/.config/Claude/claude_desktop_config.json
```

Add the environment variable:

```json
{
  "mcpServers": {
    "language-analyzer": {
      "command": "/home/vikasavn/.nvm/versions/node/v18.20.8/bin/node",
      "args": ["/home/vikasavn/language-mcp/build/index.js"],
      "env": {
        "ENABLE_AUTO_SCRAPING": "true"
      }
    }
  }
}
```

**Auto-scraping Schedule:**
- **Daily** at 2 AM - Incremental updates
- **Weekly** on Sunday at 3 AM - Full rescrape

---

## 📚 New Tools (8 Total)

### 1. `search_docs` - Semantic Documentation Search

Search through indexed documentation using natural language queries.

**Parameters:**
- `query` (required): Natural language search query
- `language` (optional): Filter by "go", "python", or "nodejs"
- `type` (optional): Filter by "official_doc", "local_doc", or "package_doc"
- `limit` (optional): Max results (default: 10)

**Example:**
```
Ask Claude: "Search the docs for how to handle HTTP requests in Go"

Claude uses: search_docs
{
  "query": "handle HTTP requests",
  "language": "go",
  "limit": 5
}
```

**Returns:**
- Relevant documentation chunks
- Source URLs
- Relevance scores
- Full content

---

### 2. `scrape_docs` - Scrape Official Documentation

Manually trigger scraping of official documentation from:
- **Go**: go.dev, pkg.go.dev
- **Python**: docs.python.org
- **Node.js**: nodejs.org

**Parameters:**
- `languages` (optional): Array of languages to scrape (default: all)

**Example:**
```
Ask Claude: "Scrape the latest Go documentation"

Claude uses: scrape_docs
{
  "languages": ["go"]
}
```

**What it scrapes:**
- Go: Effective Go, tutorials, standard library
- Python: Tutorial, library reference, language reference
- Node.js: API docs, getting started guides

---

### 3. `get_doc_stats` - View Documentation Stats

Get statistics about your indexed documentation.

**Parameters:** None

**Example:**
```
Ask Claude: "How much documentation is indexed?"

Claude uses: get_doc_stats
```

**Returns:**
- Total documents indexed
- Breakdown by language
- Breakdown by type (official/local/package)

---

### 4. `start_doc_server` - Start Local Doc Server

Start a language-specific documentation server for browsing.

**Parameters:**
- `language` (required): "go", "python", or "nodejs"
- `project_path` (required): Path to your project

**Example:**
```
Ask Claude: "Start a godoc server for my Go project"

Claude uses: start_doc_server
{
  "language": "go",
  "project_path": "/path/to/go/project"
}
```

**What it starts:**
- **Go**: `godoc -http:6060` at http://localhost:6060
- **Python**: `python -m pydoc -p 6061` at http://localhost:6061
- **Node.js**: Generates TypeDoc/JSDoc in `docs/` folder

---

### 5. `stop_doc_server` - Stop Doc Server

Stop a running documentation server.

**Parameters:**
- `language` (required): "go", "python", or "nodejs"

**Example:**
```
Ask Claude: "Stop the Python doc server"

Claude uses: stop_doc_server
{
  "language": "python"
}
```

---

### 6. `list_doc_servers` - List Running Servers

List all currently running documentation servers.

**Parameters:** None

**Example:**
```
Ask Claude: "What doc servers are running?"

Claude uses: list_doc_servers
```

---

### 7. `index_local_docs` - Index Your Project Docs

Index documentation from your local project into the vector database.

**Parameters:**
- `project_path` (required): Path to your project
- `language` (required): "go", "python", or "nodejs"

**Example:**
```
Ask Claude: "Index the documentation from my Go microservice"

Claude uses: index_local_docs
{
  "project_path": "/home/user/my-service",
  "language": "go"
}
```

**What it indexes:**
- **Go**: Output from `go doc -all`
- **Python**: Docstrings via `pydoc`
- **Node.js**: JSDoc/TypeDoc comments

---

### 8. `scrape_package_docs` - Scrape Package Docs

Scrape and index documentation for a specific third-party package.

**Parameters:**
- `package_name` (required): Package name
- `language` (required): "go", "python", or "nodejs"

**Example:**
```
Ask Claude: "Get documentation for the gin Go framework"

Claude uses: scrape_package_docs
{
  "package_name": "github.com/gin-gonic/gin",
  "language": "go"
}
```

**Sources:**
- **Go**: pkg.go.dev
- **Python**: pypi.org
- **Node.js**: npmjs.com

---

## 🎯 Use Cases

### 1. Learning a New API

**Query:**
> "Search the docs for how to create a web server in Python"

Returns relevant Flask/Django/FastAPI documentation.

### 2. Finding Examples

**Query:**
> "Show me examples of using goroutines in Go"

Returns official Go documentation with goroutine examples.

### 3. Understanding Dependencies

**Query:**
> "Get documentation for the requests Python package"

Scrapes and indexes the requests package docs from PyPI.

### 4. Exploring Your Codebase

**Query:**
> "Index the docs from my microservice and search for authentication implementation"

Indexes your local docs, then searches them semantically.

### 5. Quick Reference

**Query:**
> "Search for string formatting in Python"

Finds relevant docs about f-strings, .format(), etc.

---

## 🔍 How Vector Search Works

### 1. **Document Chunking**
- Documentation is split into ~1000 character chunks
- Preserves context while enabling granular search

### 2. **Embeddings**
- Uses `all-MiniLM-L6-v2` model (local, no API keys needed)
- Converts text to 384-dimensional vectors
- Runs entirely on your machine

### 3. **Semantic Search**
- Finds documents by meaning, not just keywords
- Query: "error handling" matches "exception management"
- Query: "HTTP requests" matches "fetch data from API"

### 4. **Filtering**
- Filter by language (go, python, nodejs)
- Filter by type (official, local, package)
- Combine for precise results

---

## 📊 Vector Database

### Storage

Documentation is stored in:
```
/home/vikasavn/language-mcp/chroma_db/
```

### Management

**View stats:**
```
get_doc_stats
```

**Clear and rescrape:**
```bash
# Remove the database
rm -rf /home/vikasavn/language-mcp/chroma_db

# Restart server - will recreate on first use
```

**Backup:**
```bash
# Backup database
cp -r /home/vikasavn/language-mcp/chroma_db /home/vikasavn/chroma_db_backup
```

---

## 🛠️ Advanced Configuration

### Customize Scraping Schedule

Edit `src/scheduler/doc-scheduler.ts`:

```typescript
// Change from daily at 2 AM to every 6 hours
startDailyScraping() {
  const task = cron.schedule("0 */6 * * *", async () => {
    await this.scrapeAllDocs();
  });
}
```

### Add More Documentation Sources

Edit `src/scrapers/doc-scraper.ts`:

```typescript
async scrapeGoDocumentation(): Promise<ScrapedDoc[]> {
  const urls = [
    "https://go.dev/doc/effective_go",
    "https://go.dev/blog/",  // Add Go blog
    "https://gobyexample.com/",  // Add Go by Example
  ];
  // ...
}
```

### Adjust Chunk Size

Edit `src/scrapers/doc-scraper.ts`:

```typescript
// Change from 1000 to 2000 characters per chunk
const chunks = this.chunkText(content, 2000);
```

---

## 🐛 Troubleshooting

### "Embedder not initialized"

**Cause:** Vector DB not initialized
**Solution:** Restart the MCP server - it initializes on first doc tool use

### Slow first search

**Cause:** Embedding model loads on first use (~100MB)
**Solution:** Normal - subsequent searches are fast

### No results found

**Cause:** Documentation not scraped yet
**Solution:** Run `scrape_docs` to index official documentation

### Doc server won't start

**For Go:**
```bash
# Install godoc
go install golang.org/x/tools/cmd/godoc@latest
```

**For Python:** Built-in, should work

**For Node.js:**
```bash
# Install TypeDoc globally
npm install -g typedoc
```

---

## 📈 Performance

### First-time Setup
- **Embedding model download**: ~2 minutes (one-time)
- **Scraping all docs**: ~5-10 minutes
- **Indexing**: ~30 seconds per language

### Regular Usage
- **Search query**: <1 second
- **Scraping update**: ~2-3 minutes per language
- **Local indexing**: ~5-10 seconds per project

### Resource Usage
- **Disk**: ~500MB for vector DB (full index)
- **Memory**: ~200MB for embedding model
- **CPU**: Minimal except during scraping

---

## 🎓 Example Workflow

### Day 1: Initial Setup

```
1. Ask Claude: "Scrape all official documentation"
   → Indexes Go, Python, Node.js docs

2. Ask Claude: "Get documentation stats"
   → Shows ~500-1000 indexed documents

3. Ask Claude: "Search for HTTP routing in Go"
   → Returns net/http and gorilla/mux examples
```

### Day 2: Add Your Project

```
4. Ask Claude: "Index docs from /home/user/my-api"
   → Adds your project documentation

5. Ask Claude: "Search for authentication in my local docs"
   → Finds your auth implementation
```

### Day 3: Add Dependencies

```
6. Ask Claude: "Get docs for the cobra Go package"
   → Scrapes cobra documentation from pkg.go.dev

7. Ask Claude: "Search cobra docs for subcommands"
   → Finds specific cobra subcommand documentation
```

---

## 📞 Support

- **Documentation Issues**: Check scraping logs in stderr
- **Search Not Working**: Verify docs are indexed with `get_doc_stats`
- **Performance Issues**: Reduce chunk count or increase chunk size
- **Integration Help**: See INTEGRATION_GUIDE.md

---

## 🎉 Summary

You now have:
- ✅ 26 total tools (18 code + 8 docs)
- ✅ Semantic documentation search
- ✅ Automatic background scraping
- ✅ Local documentation servers
- ✅ Package documentation indexing
- ✅ Project-specific doc search

**Ask Claude anything about Go, Python, or Node.js - it has the docs at its fingertips!**
