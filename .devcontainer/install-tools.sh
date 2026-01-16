#!/bin/bash
set -e

# Configure NODE_OPTIONS for memory management (avoid containerEnv parsing issues)
export NODE_OPTIONS="--max-old-space-size=2048"

# Also persist to bashrc for future sessions
echo 'export NODE_OPTIONS="--max-old-space-size=2048"' >> ~/.bashrc

echo "============================================"
echo "Installing Development Tools"
echo "============================================"

REPORT_FILE=".devcontainer/installation-report.md"
echo "# Installation Report" > "$REPORT_FILE"
echo "Generated: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

log_install() {
    local tool=$1
    local status=$2
    local version=$3
    echo "| $tool | $status | $version |" >> "$REPORT_FILE"
}

echo "## Installed Tools" >> "$REPORT_FILE"
echo "| Tool | Status | Version |" >> "$REPORT_FILE"
echo "|------|--------|---------|" >> "$REPORT_FILE"

# Update package lists
echo "[1/8] Updating package lists..."
sudo apt-get update -qq

# Install tmux (skip on Windows/WSL if issues)
echo "[2/8] Installing tmux..."
if command -v tmux &> /dev/null; then
    log_install "tmux" "Already installed" "$(tmux -V)"
else
    if sudo apt-get install -y tmux > /dev/null 2>&1; then
        log_install "tmux" "Installed" "$(tmux -V)"
        echo "  - tmux installed successfully"
    else
        log_install "tmux" "Skipped" "N/A"
        echo "  - tmux installation skipped (may not be available)"
    fi
fi

# Install Claude Code CLI
echo "[3/8] Installing Claude Code CLI..."
if command -v claude &> /dev/null; then
    log_install "claude-code" "Already installed" "$(claude --version 2>/dev/null || echo 'unknown')"
else
    npm install -g @anthropic-ai/claude-code
    log_install "claude-code" "Installed" "$(claude --version 2>/dev/null || echo 'latest')"
    echo "  - Claude Code CLI installed"
fi

# Install UV (fast Python package manager)
echo "[4/8] Installing UV..."
if command -v uv &> /dev/null; then
    log_install "uv" "Already installed" "$(uv --version)"
else
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
    log_install "uv" "Installed" "$(uv --version 2>/dev/null || echo 'latest')"
    echo "  - UV installed"
fi

# Install claude-monitor for token tracking
echo "[5/8] Installing claude-monitor..."
if npm list -g claude-monitor > /dev/null 2>&1; then
    log_install "claude-monitor" "Already installed" "latest"
else
    npm install -g claude-monitor 2>/dev/null || {
        log_install "claude-monitor" "Skipped" "N/A"
        echo "  - claude-monitor not available, skipping"
    }
fi

# Install claude-flow for multi-agent orchestration
echo "[6/8] Installing claude-flow..."
if npm list -g claude-flow > /dev/null 2>&1; then
    log_install "claude-flow" "Already installed" "alpha"
else
    npm install -g claude-flow@alpha 2>/dev/null || {
        log_install "claude-flow" "Skipped" "N/A"
        echo "  - claude-flow not available, skipping"
    }
fi

# Install ccusage for cost tracking
echo "[7/8] Installing ccusage..."
if command -v ccusage &> /dev/null; then
    log_install "ccusage" "Already installed" "latest"
else
    npm install -g ccusage 2>/dev/null || {
        log_install "ccusage" "Skipped" "N/A"
        echo "  - ccusage not available, skipping"
    }
fi

# Verify GitHub CLI (installed via feature)
echo "[8/8] Verifying GitHub CLI..."
if command -v gh &> /dev/null; then
    log_install "gh" "Available" "$(gh --version | head -1)"
    echo "  - GitHub CLI available"
else
    log_install "gh" "Not found" "N/A"
fi

echo "" >> "$REPORT_FILE"
echo "## Environment Variables" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
echo "CLAUDE_FLOW_MAX_AGENTS=$CLAUDE_FLOW_MAX_AGENTS" >> "$REPORT_FILE"
echo "AGENT_MEMORY_LIMIT_MB=$AGENT_MEMORY_LIMIT_MB" >> "$REPORT_FILE"
echo "MEMORY_PRESSURE_THRESHOLD=$MEMORY_PRESSURE_THRESHOLD" >> "$REPORT_FILE"
echo "NODE_OPTIONS=$NODE_OPTIONS" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"

# Start memory monitor daemon in background
echo ""
echo "Starting memory monitor daemon..."
nohup bash .devcontainer/monitor-memory.sh > /dev/null 2>&1 &

echo ""
echo "============================================"
echo "Installation Complete!"
echo "============================================"
echo "See $REPORT_FILE for details"
echo ""
echo "Next steps:"
echo "  1. Run 'gh auth login' to authenticate with GitHub"
echo "  2. Set ANTHROPIC_API_KEY via DevPod secrets - never commit"
echo "  3. Run 'claude' to start Claude Code CLI"
echo ""
