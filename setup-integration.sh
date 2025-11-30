#!/bin/bash

# Language MCP Server Integration Setup Script
# This script helps you integrate the MCP server with Claude Desktop

set -e

echo "========================================="
echo "Language MCP Server Integration Setup"
echo "========================================="
echo ""

# Get the absolute path to the server
SERVER_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build/index.js"

echo "Server location: $SERVER_PATH"
echo ""

# Detect OS and set config path
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CONFIG_DIR="$HOME/.config/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    OS_NAME="Linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    OS_NAME="macOS"
else
    echo "⚠️  Unsupported operating system: $OSTYPE"
    echo "Please manually configure Claude Desktop."
    exit 1
fi

echo "Detected OS: $OS_NAME"
echo "Config file: $CONFIG_FILE"
echo ""

# Load nvm if available
if [ -d "$HOME/.nvm" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    echo "✓ nvm loaded"
fi

# Check if Node 18+ is available
echo "Checking Node.js version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js version: $NODE_VERSION"

    # Check if version is 18+
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        echo "⚠️  Node.js 18+ required. Current version: $NODE_VERSION"
        echo "Attempting to switch to Node 18..."
        if command -v nvm &> /dev/null; then
            nvm use 18 || nvm install 18
            NODE_VERSION=$(node --version)
            echo "✓ Now using Node.js version: $NODE_VERSION"
        else
            echo "⚠️  nvm not found. Please install Node 18+ manually."
            exit 1
        fi
    fi
else
    echo "⚠️  Node.js not found in PATH"
    echo "Make sure to load nvm before running Claude Desktop"
fi

echo ""

# Create config directory if it doesn't exist
if [ ! -d "$CONFIG_DIR" ]; then
    echo "Creating config directory: $CONFIG_DIR"
    mkdir -p "$CONFIG_DIR"
fi

# Backup existing config if it exists
if [ -f "$CONFIG_FILE" ]; then
    BACKUP_FILE="${CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "Backing up existing config to: $BACKUP_FILE"
    cp "$CONFIG_FILE" "$BACKUP_FILE"
fi

# Get node path from nvm
if [ -d "$HOME/.nvm" ]; then
    # Source nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    # Get node 18 path
    NODE18_PATH=$(nvm which 18 2>/dev/null || echo "")

    if [ -n "$NODE18_PATH" ]; then
        echo "Found Node 18 at: $NODE18_PATH"

        # Create config with direct path
        cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "language-analyzer": {
      "command": "$NODE18_PATH",
      "args": ["$SERVER_PATH"]
    }
  }
}
EOF
    else
        # Fallback to bash wrapper
        cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "language-analyzer": {
      "command": "bash",
      "args": [
        "-c",
        "source ~/.nvm/nvm.sh && nvm use 18 && node $SERVER_PATH"
      ]
    }
  }
}
EOF
    fi
else
    # No nvm, use system node
    NODE_PATH=$(which node)
    cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "language-analyzer": {
      "command": "$NODE_PATH",
      "args": ["$SERVER_PATH"]
    }
  }
}
EOF
fi

echo ""
echo "✓ Configuration written to: $CONFIG_FILE"
echo ""
echo "Configuration:"
cat "$CONFIG_FILE"
echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop completely (quit and reopen)"
echo "2. Ask Claude: 'What MCP tools do you have access to?'"
echo "3. You should see 18 language analysis tools"
echo ""
echo "Example queries:"
echo "  - Find all functions in $SERVER_PATH/../examples/go-sample"
echo "  - What tests exist in examples/python-sample?"
echo "  - Run the tests in examples/python-sample"
echo ""
echo "For troubleshooting, see INTEGRATION_GUIDE.md"
echo ""
