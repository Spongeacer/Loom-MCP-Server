#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# LOOM Release Publisher
# Publishes loom-mcp to npm, creates a GitHub release tag, and generates a
# Homebrew Formula.
#
# Usage:
#   ./scripts/publish.sh [patch|minor|major|<exact-version>]
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOOM_DIR="$PROJECT_ROOT/packages/loom"

cd "$PROJECT_ROOT"

log_info() { echo "[PUBLISH] $1"; }
log_err() { echo "[PUBLISH] $1" >&2; }

# ---------------------------------------------------------------------------
# 1. Determine new version
# ---------------------------------------------------------------------------
CURRENT_VERSION=$(node -p "require('$LOOM_DIR/package.json').version")
log_info "Current version: $CURRENT_VERSION"

BUMP="${1:-patch}"
NEW_VERSION=""

if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$BUMP"
else
  NEW_VERSION=$(node -e "
    const [major, minor, patch] = '$CURRENT_VERSION'.split('.').map(Number);
    if ('$BUMP' === 'major') console.log(\`\${major+1}.0.0\`);
    else if ('$BUMP' === 'minor') console.log(\`\${major}.\${minor+1}.0\`);
    else console.log(\`\${major}.\${minor}.\${patch+1}\`);
  ")
fi

log_info "New version will be: $NEW_VERSION"
read -rp "Continue? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  log_info "Aborted."
  exit 0
fi

# ---------------------------------------------------------------------------
# 2. Pre-flight checks
# ---------------------------------------------------------------------------
if ! npm whoami >/dev/null 2>&1; then
  log_err "You are not logged in to npm. Please run: npm login"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  log_err "Git working tree is not clean. Please commit or stash changes first."
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Bump version in package.json
# ---------------------------------------------------------------------------
cd "$LOOM_DIR"
npm version "$NEW_VERSION" --no-git-tag-version
log_info "Bumped package.json to v$NEW_VERSION"

# Commit version bump
cd "$PROJECT_ROOT"
git add "$LOOM_DIR/package.json"
git commit -m "chore(release): v$NEW_VERSION"

# ---------------------------------------------------------------------------
# 4. Build & publish to npm
# ---------------------------------------------------------------------------
cd "$LOOM_DIR"
npm run build
npm publish --access public
log_info "Published loom-mcp@$NEW_VERSION to npm"

# ---------------------------------------------------------------------------
# 5. Git tag & push
# ---------------------------------------------------------------------------
cd "$PROJECT_ROOT"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
git push origin main "v$NEW_VERSION"
log_info "Pushed git tag v$NEW_VERSION"

# ---------------------------------------------------------------------------
# 6. Generate Homebrew Formula
# ---------------------------------------------------------------------------
log_info "Waiting for npm registry to propagate..."
sleep 5

NPM_TARBALL_URL="https://registry.npmjs.org/loom-mcp/-/loom-mcp-${NEW_VERSION}.tgz"
TMP_TARBALL="/tmp/loom-mcp-${NEW_VERSION}.tgz"
curl -fsSL "$NPM_TARBALL_URL" -o "$TMP_TARBALL"
SHA256=$(shasum -a 256 "$TMP_TARBALL" | awk '{print $1}')
rm -f "$TMP_TARBALL"
log_info "SHA256: $SHA256"

mkdir -p "$PROJECT_ROOT/Formula"
cat > "$PROJECT_ROOT/Formula/loom-mcp.rb" <<EOF
class LoomMcp < Formula
  desc "Semantic persistent context OS for AI agents via MCP"
  homepage "https://github.com/Spongeacer/Loom-MCP-Server"
  url "${NPM_TARBALL_URL}"
  sha256 "${SHA256}"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["\#{libexec}/bin/*"]
  end

  test do
    system "\#{bin}/loom", "doctor"
  end
end
EOF

log_info "Generated Homebrew Formula: Formula/loom-mcp.rb"

# ---------------------------------------------------------------------------
# 7. Summary
# ---------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "Release v$NEW_VERSION complete!"
echo "=========================================="
echo ""
echo "  npm:     https://www.npmjs.com/package/loom-mcp"
echo "  GitHub:  https://github.com/Spongeacer/Loom-MCP-Server/releases/tag/v$NEW_VERSION"
echo ""
echo "Homebrew Formula ready at:"
echo "  Formula/loom-mcp.rb"
echo ""
echo "To submit to Homebrew/core:"
echo "  1. brew install --build-from-source Formula/loom-mcp.rb"
echo "  2. brew test Formula/loom-mcp.rb"
echo "  3. brew audit --strict --online Formula/loom-mcp.rb"
echo "  4. Fork https://github.com/Homebrew/homebrew-core"
echo "  5. Copy Formula/loom-mcp.rb to your fork under Formula/l/loom-mcp.rb"
echo "  6. Open a PR"
echo ""
echo "Alternative: maintain your own tap:"
echo "  brew tap-new Spongeacer/tap"
echo "  cp Formula/loom-mcp.rb \\$(brew --repo Spongeacer/tap)/Formula/loom-mcp.rb"
echo "  git -C \\$(brew --repo Spongeacer/tap) add . && git commit -m 'add loom-mcp' && git push"
echo ""
