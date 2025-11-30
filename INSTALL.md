# Installation Instructions

## Prerequisites

This MCP server requires **Node.js 18 or higher** to run.

### Check Your Node Version

```bash
node --version
```

If you have Node.js 12 or lower, you'll need to upgrade.

## Installing/Upgrading Node.js

### Using nvm (recommended)

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node.js 18 or later
nvm install 18
nvm use 18

# Verify installation
node --version
```

### Using System Package Manager

#### Ubuntu/Debian
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### macOS (using Homebrew)
```bash
brew install node@18
```

#### Windows
Download from https://nodejs.org/

## Building the MCP Server

Once you have Node.js 18+:

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Configuring Claude Desktop

Add this to your Claude Desktop config:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "language-analyzer": {
      "command": "node",
      "args": ["/absolute/path/to/language-mcp/build/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/language-mcp` with the actual path to this directory.

## Testing

Test the server using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## Troubleshooting

### "Unsupported engine" errors
This means your Node.js version is too old. Upgrade to Node 18 or higher.

### Build errors
Make sure you've run `npm install` successfully before `npm run build`.

### Server not appearing in Claude Desktop
1. Check that the path in the config is absolute (not relative)
2. Restart Claude Desktop after updating the config
3. Check Claude Desktop's logs for errors
