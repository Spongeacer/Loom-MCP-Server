#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# LOOM MCP One-Line Installer
# Fetches the latest release tarball from GitHub, builds locally, and sets up
# PATH + MCP config.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.sh | bash
#   LOOM_VERSION=0.1.0 curl -fsSL ... | bash
#   bash install.sh --dry-run
# ---------------------------------------------------------------------------

REPO="Spongeacer/Loom-MCP-Server"
DEFAULT_INSTALL_DIR="${HOME}/.loom"
LOOM_INSTALL_DIR="${LOOM_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
LOOM_SKIP_MCP_SETUP="${LOOM_SKIP_MCP_SETUP:-false}"
LOOM_AUTO_INIT="${LOOM_AUTO_INIT:-true}"
DRY_RUN=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[LOOM]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[LOOM]${NC} $1"; }
log_err() { echo -e "${RED}[LOOM]${NC} $1" >&2; }

# Parse CLI flags
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    *)
      log_warn "Unknown argument: $arg"
      ;;
  esac
done

if [ "$DRY_RUN" = true ]; then
  log_info "=== DRY RUN MODE ==="
  log_info "No files will be modified. Showing what would happen..."
  echo ""
fi

# ---------------------------------------------------------------------------
# 0. Platform & dependency checks
# ---------------------------------------------------------------------------
command -v curl >/dev/null 2>&1 || { log_err "curl is required but not installed."; exit 1; }
command -v tar >/dev/null 2>&1 || { log_err "tar is required but not installed."; exit 1; }
command -v node >/dev/null 2>&1 || { log_err "Node.js >= 18 is required but not installed."; exit 1; }
command -v npm >/dev/null 2>&1 || { log_err "npm is required but not installed."; exit 1; }

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  log_err "Node.js >= 18 is required. Found: $NODE_VERSION"
  exit 1
fi

NODE_BIN=$(command -v node)
log_info "Node.js version: $NODE_VERSION ($NODE_BIN)"

# ---------------------------------------------------------------------------
# 0.5 Fast path: try npm global install first
# ---------------------------------------------------------------------------
NPM_GLOBAL_INSTALLED=false
LOOM_MCP_JS=""

if [ "$DRY_RUN" != true ]; then
  log_info "Attempting npm global install for fastest setup..."
  if npm install -g @spongeacer/loom-mcp@latest 2>/dev/null; then
    GLOBAL_LOOM_MCP=$(command -v loom-mcp 2>/dev/null || true)
    if [ -n "$GLOBAL_LOOM_MCP" ]; then
      log_info "Installed loom-mcp globally via npm: $GLOBAL_LOOM_MCP"
      BIN_DIR=$(dirname "$GLOBAL_LOOM_MCP")
      LOOM_INSTALL_DIR=$(dirname "$BIN_DIR")
      NPM_GLOBAL_INSTALLED=true
      # Resolve dist/server.js path for VS Code Extension registration
      if command -v npm >/dev/null 2>&1; then
        GLOBAL_NODE_MODULES=$(npm root -g)
        LOOM_MCP_JS="$GLOBAL_NODE_MODULES/@spongeacer/loom-mcp/dist/server.js"
      fi
      # Skip download/build steps
      goto_mcp_setup="true"
    fi
  else
    log_warn "npm global install failed, falling back to source build..."
  fi
fi

# ---------------------------------------------------------------------------
# 1. Resolve version
# ---------------------------------------------------------------------------
if [ "${goto_mcp_setup:-}" != "true" ]; then
  if [ -n "${LOOM_VERSION:-}" ]; then
    VERSION="$LOOM_VERSION"
    log_info "Installing LOOM MCP v${VERSION}..."
  else
    log_info "Resolving latest release..."
    LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"tag_name": "v?([^"]+)".*/\1/')
    if [ -z "$LATEST" ]; then
      log_err "Could not determine latest release version."
      exit 1
    fi
    VERSION="$LATEST"
    log_info "Latest version is v${VERSION}"
  fi

  TARBALL_URL="https://github.com/${REPO}/archive/refs/tags/v${VERSION}.tar.gz"

  if [ "$DRY_RUN" = true ]; then
    log_info "Would download: $TARBALL_URL"
    log_info "Would extract to: $LOOM_INSTALL_DIR"
    log_info "Would run: npm install && npm run build"
  fi

  # ---------------------------------------------------------------------------
  # 2. Download and extract
  # ---------------------------------------------------------------------------
  if [ "$DRY_RUN" != true ]; then
    rm -rf "$LOOM_INSTALL_DIR"
    mkdir -p "$LOOM_INSTALL_DIR"

    log_info "Downloading release tarball..."
    curl -fsSL "$TARBALL_URL" | tar -xz --strip-components=1 -C "$LOOM_INSTALL_DIR"
  fi

  # ---------------------------------------------------------------------------
  # 3. Build
  # ---------------------------------------------------------------------------
  if [ "$DRY_RUN" != true ]; then
    log_info "Installing dependencies and building..."
    cd "$LOOM_INSTALL_DIR"
    npm install
    npm run build
  fi
fi

# ---------------------------------------------------------------------------
# 4. Add loom / loom-mcp to PATH via wrapper scripts
# ---------------------------------------------------------------------------
if [ "$NPM_GLOBAL_INSTALLED" = "true" ]; then
  if [ "$DRY_RUN" = true ]; then
    log_info "Would skip wrapper creation (using npm-global binaries in $BIN_DIR)"
  else
    log_info "Using npm-global loom CLI at $BIN_DIR/loom"
  fi
else
  BIN_DIR=""
  for d in "$HOME/.local/bin" "$HOME/bin"; do
    if [ -d "$d" ] || mkdir -p "$d" 2>/dev/null; then
      case ":$PATH:" in
        *":$d:") BIN_DIR="$d"; break ;;
      esac
    fi
  done

  if [ -z "$BIN_DIR" ]; then
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"
  fi

  if [ "$DRY_RUN" = true ]; then
    log_info "Would create wrapper scripts:"
    log_info "  $BIN_DIR/loom -> $LOOM_INSTALL_DIR/bin/loom"
    log_info "  $BIN_DIR/loom-mcp -> $LOOM_INSTALL_DIR/bin/loom-mcp"
  else
    cat > "$BIN_DIR/loom" <<EOF
#!/usr/bin/env bash
exec "$LOOM_INSTALL_DIR/bin/loom" "\$@"
EOF
    chmod +x "$BIN_DIR/loom"

    cat > "$BIN_DIR/loom-mcp" <<EOF
#!/usr/bin/env bash
exec "$LOOM_INSTALL_DIR/bin/loom-mcp" "\$@"
EOF
    chmod +x "$BIN_DIR/loom-mcp"

    log_info "Installed loom CLI to $BIN_DIR/loom"
    log_info "Installed loom-mcp to $BIN_DIR/loom-mcp"

    if ! echo "$PATH" | grep -q "$BIN_DIR"; then
      log_warn "$BIN_DIR is not in your PATH."
      log_warn "Add the following line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
      log_warn "  export PATH=\"$BIN_DIR:\$PATH\""
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 5. MCP client auto-configuration
# ---------------------------------------------------------------------------
MCP_REGISTERED=""

register_kimi() {
  local config_path="$HOME/.kimi/mcp.json"
  if [ "$DRY_RUN" = true ]; then
    log_info "Would register Kimi Code MCP: $config_path -> command: $BIN_DIR/loom-mcp"
    MCP_REGISTERED="kimi"
    return
  fi

  mkdir -p "$(dirname "$config_path")"
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
  log_info "Registered LOOM MCP for Kimi Code CLI: $config_path"
  MCP_REGISTERED="kimi-cli"
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
  if [ "$DRY_RUN" = true ]; then
    log_info "Would register Claude Desktop MCP: $config_path -> command: $BIN_DIR/loom-mcp"
    MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }claude-desktop"
    return
  fi

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

register_cursor() {
  local config_path="$HOME/.cursor/mcp.json"
  if [ "$DRY_RUN" = true ]; then
    log_info "Would register Cursor MCP: $config_path -> command: $BIN_DIR/loom-mcp"
    MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }cursor"
    return
  fi

  mkdir -p "$(dirname "$config_path")"
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
  log_info "Registered LOOM MCP for Cursor: $config_path"
  MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }cursor"
}

register_cline() {
  local config_path="$HOME/.cline/data/settings/cline_mcp_settings.json"
  if [ "$DRY_RUN" = true ]; then
    log_info "Would register Cline MCP: $config_path -> command: $BIN_DIR/loom-mcp"
    MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }cline"
    return
  fi

  mkdir -p "$(dirname "$config_path")"
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
  log_info "Registered LOOM MCP for Cline: $config_path"
  MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }cline"
}

register_windsurf() {
  local config_path="$HOME/.codeium/windsurf/mcp_config.json"
  if [ "$DRY_RUN" = true ]; then
    log_info "Would register Windsurf MCP: $config_path -> command: $BIN_DIR/loom-mcp"
    MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }windsurf"
    return
  fi

  mkdir -p "$(dirname "$config_path")"
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
  log_info "Registered LOOM MCP for Windsurf: $config_path"
  MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }windsurf"
}

register_vscode_kimi() {
  local settings_path=""
  if [ "$(uname -s)" = "Darwin" ]; then
    settings_path="$HOME/Library/Application Support/Code/User/settings.json"
  else
    settings_path="$HOME/.config/Code/User/settings.json"
  fi

  if [ "$DRY_RUN" = true ]; then
    log_info "Would register Kimi Code Extension MCP in VS Code settings: $settings_path"
    MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }kimi-extension"
    return
  fi

  if [ ! -f "$settings_path" ]; then
    return 1
  fi

  if [ -n "$LOOM_MCP_JS" ] && [ -f "$LOOM_MCP_JS" ]; then
    node -e "
      const fs = require('fs');
      const path = '$settings_path';
      const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
      data['kimi.mcpServers'] = data['kimi.mcpServers'] || {};
      data['kimi.mcpServers'].loom = { command: '$NODE_BIN', args: ['$LOOM_MCP_JS'] };
      fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
    "
  else
    node -e "
      const fs = require('fs');
      const path = '$settings_path';
      const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
      data['kimi.mcpServers'] = data['kimi.mcpServers'] || {};
      data['kimi.mcpServers'].loom = { command: '$BIN_DIR/loom-mcp', args: [] };
      fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
    "
  fi
  log_info "Registered LOOM MCP for Kimi Code Extension: $settings_path"
  MCP_REGISTERED="${MCP_REGISTERED:+$MCP_REGISTERED, }kimi-extension"
}

if [ "$LOOM_SKIP_MCP_SETUP" != "true" ]; then
  if command -v kimi >/dev/null 2>&1 || [ -d "$HOME/.kimi" ]; then
    register_kimi
  fi
  if [ -f "$HOME/Library/Application Support/Code/User/settings.json" ] || [ -f "$HOME/.config/Code/User/settings.json" ]; then
    register_vscode_kimi
  fi
  if [ "$(uname -s)" = "Darwin" ] && [ -d "$HOME/Library/Application Support/Claude" ]; then
    register_claude_desktop
  fi
  if [ -d "$HOME/.cursor" ]; then
    register_cursor
  fi
  if [ -d "$HOME/.cline" ]; then
    register_cline
  fi
  if [ -d "$HOME/.codeium" ]; then
    register_windsurf
  fi
  if [ -z "$MCP_REGISTERED" ]; then
    if [ "$DRY_RUN" = true ]; then
      log_warn "No supported MCP client detected. Would skip auto-registration."
    else
      log_warn "No supported MCP client detected automatically."
      log_warn "Please register manually with your client using:"
      log_warn "  command: $NODE_BIN"
      log_warn "  args:    [\"$BIN_DIR/loom-mcp\"]"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 6. Auto-init in current directory
# ---------------------------------------------------------------------------
CWD="$(pwd)"
if [ "$LOOM_AUTO_INIT" = "true" ] && [ ! -d "$CWD/.loom" ]; then
  if [ "$DRY_RUN" = true ]; then
    log_info "Would initialize LOOM workspace in $CWD"
  else
    log_info "Initializing LOOM workspace in $CWD..."
    "$BIN_DIR/loom" init "$(basename "$CWD")" >/dev/null || true
  fi
else
  if [ "$DRY_RUN" = true ]; then
    log_info "LOOM workspace already exists in $CWD. Would skip init."
  else
    log_info "LOOM workspace already initialized in $CWD."
  fi
fi

# ---------------------------------------------------------------------------
# 7. Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$DRY_RUN" = true ]; then
  log_info "=== DRY RUN COMPLETE ==="
  echo ""
  echo "  Version:     v${VERSION}"
  echo "  Install dir: $LOOM_INSTALL_DIR"
  echo "  PATH dir:    $BIN_DIR"
  if [ -n "$MCP_REGISTERED" ]; then
    echo "  MCP clients to configure: $MCP_REGISTERED"
  fi
  echo ""
  echo "Run without --dry-run to perform the actual installation."
else
  log_info "Installation complete!"
  echo ""
  echo "  Version:     v${VERSION}"
  echo "  CLI:         loom status"
  echo "  MCP:         loom-mcp"
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
fi
