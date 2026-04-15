#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# LOOM MCP One-Line Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.sh | bash
# ---------------------------------------------------------------------------

REPO_URL="https://github.com/Spongeacer/Loom-MCP-Server.git"
DEFAULT_INSTALL_DIR="${HOME}/.loom-server"
LOOM_INSTALL_DIR="${LOOM_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
LOOM_SKIP_MCP_SETUP="${LOOM_SKIP_MCP_SETUP:-false}"
LOOM_AUTO_INIT="${LOOM_AUTO_INIT:-true}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[LOOM]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[LOOM]${NC} $1"; }
log_err() { echo -e "${RED}[LOOM]${NC} $1" >&2; }

# ---------------------------------------------------------------------------
# 0. Platform & dependency checks
# ---------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || { log_err "git is required but not installed."; exit 1; }
command -v node >/dev/null 2>&1 || { log_err "Node.js is required but not installed. Please install Node >= 18."; exit 1; }
command -v npm >/dev/null 2>&1 || { log_err "npm is required but not installed."; exit 1; }

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  log_err "Node.js >= 18 is required. Found: $NODE_VERSION"
  exit 1
fi

log_info "Node.js version: $NODE_VERSION"

# ---------------------------------------------------------------------------
# 1. Clone or update
# ---------------------------------------------------------------------------
if [ -d "$LOOM_INSTALL_DIR/.git" ]; then
  log_info "Existing installation found at $LOOM_INSTALL_DIR. Pulling latest..."
  git -C "$LOOM_INSTALL_DIR" pull --ff-only
else
  log_info "Cloning LOOM into $LOOM_INSTALL_DIR..."
  rm -rf "$LOOM_INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$LOOM_INSTALL_DIR"
fi

# ---------------------------------------------------------------------------
# 2. Build
# ---------------------------------------------------------------------------
log_info "Installing dependencies and building..."
cd "$LOOM_INSTALL_DIR/packages/loom"
npm install
npm run build

# ---------------------------------------------------------------------------
# 3. Add loom / loom-mcp to PATH via wrapper scripts
# ---------------------------------------------------------------------------
BIN_DIR=""
for d in "$HOME/.local/bin" "$HOME/bin"; do
  if [ -d "$d" ] || mkdir -p "$d" 2>/dev/null; then
    case ":$PATH:" in
      *":$d:"*) BIN_DIR="$d"; break ;;
    esac
  fi
done

# Fallback: prefer ~/.local/bin even if not in PATH yet
if [ -z "$BIN_DIR" ]; then
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
fi

cat > "$BIN_DIR/loom" <<EOF
#!/usr/bin/env bash
exec "$LOOM_INSTALL_DIR/loom" "\$@"
EOF
chmod +x "$BIN_DIR/loom"

cat > "$BIN_DIR/loom-mcp" <<EOF
#!/usr/bin/env bash
exec "$LOOM_INSTALL_DIR/loom-mcp" "\$@"
EOF
chmod +x "$BIN_DIR/loom-mcp"

log_info "Installed loom CLI to $BIN_DIR/loom"
log_info "Installed loom-mcp to $BIN_DIR/loom-mcp"

if ! echo "$PATH" | grep -q "$BIN_DIR"; then
  log_warn "$BIN_DIR is not in your PATH."
  log_warn "Add the following line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
  log_warn "  export PATH=\"$BIN_DIR:\$PATH\""
fi

# ---------------------------------------------------------------------------
# 4. MCP client auto-configuration
# ---------------------------------------------------------------------------
MCP_REGISTERED=""

register_kimi() {
  local config_path="$HOME/.kimi/mcp.json"
  mkdir -p "$(dirname "$config_path")"

  local mcp_entry
  mcp_entry=$(cat <<JSON
  "loom": {
    "command": "$BIN_DIR/loom-mcp",
    "args": []
  }
JSON
)

  if [ -f "$config_path" ]; then
    # Use node to safely inject without breaking JSON
    node -e "
      const fs = require('fs');
      const path = '$config_path';
      const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
      data.mcpServers = data.mcpServers || {};
      data.mcpServers.loom = { command: '$BIN_DIR/loom-mcp', args: [] };
      fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
    "
  else
    echo "{" > "$config_path"
    echo "  \"mcpServers\": {" >> "$config_path"
    echo "$mcp_entry" >> "$config_path"
    echo "  }" >> "$config_path"
    echo "}" >> "$config_path"
  fi

  log_info "Registered LOOM MCP for Kimi Code: $config_path"
  MCP_REGISTERED="kimi"
}

register_claude_desktop() {
  local config_dir=""
  if [ "$(uname -s)" = "Darwin" ]; then
    config_dir="$HOME/Library/Application Support/Claude"
  elif [ "$(uname -s)" = "Linux" ]; then
    config_dir="$HOME/.config/claude"
  else
    return 1
  fi

  local config_path="$config_dir/claude_desktop_config.json"
  mkdir -p "$config_dir"

  if [ -f "$config_path" ]; then
    node -e "
      const fs = require('fs');
      const path = '$config_path';
      const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
      data.mcpServers = data.mcpServers || {};
      data.mcpServers.loom = { command: '$BIN_DIR/loom-mcp', args: [] };
      fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
    "
  else
    cat > "$config_path" <<EOF
{
  "mcpServers": {
    "loom": {
      "command": "$BIN_DIR/loom-mcp",
      "args": []
    }
  }
}
EOF
  fi

  log_info "Registered LOOM MCP for Claude Desktop: $config_path"
  MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }claude-desktop"
}

if [ "$LOOM_SKIP_MCP_SETUP" != "true" ]; then
  # Detect Kimi Code
  if command -v kimi >/dev/null 2>&1 || [ -d "$HOME/.kimi" ]; then
    register_kimi
  fi

  # Detect Claude Desktop
  if [ "$(uname -s)" = "Darwin" ] && [ -d "$HOME/Library/Application Support/Claude" ]; then
    register_claude_desktop
  fi

  if [ -z "$MCP_REGISTERED" ]; then
    log_warn "No supported MCP client detected automatically."
    log_warn "Please register manually with your client using:"
    log_warn "  command: $BIN_DIR/loom-mcp"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Auto-init in current directory
# ---------------------------------------------------------------------------
CWD="$(pwd)"
if [ "$LOOM_AUTO_INIT" = "true" ] && [ ! -d "$CWD/.loom" ]; then
  log_info "Initializing LOOM workspace in $CWD..."
  "$BIN_DIR/loom" init "$(basename "$CWD")" >/dev/null || true
else
  log_info "LOOM workspace already initialized in $CWD."
fi

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
echo ""
log_info "Installation complete!"
echo ""
echo "  CLI:        loom status"
echo "  MCP:        loom-mcp"
echo "  Install dir: $LOOM_INSTALL_DIR"
if [ -n "$MCP_REGISTERED" ]; then
  echo "  MCP clients configured: $MCP_REGISTERED"
  log_warn "Please restart your MCP client to load the new server."
fi
echo ""
echo "Quick start:"
echo "  loom status              # View context"
echo "  loom task create '...'   # Create a task"
echo "  loom fs health           # Check file health"
echo ""
