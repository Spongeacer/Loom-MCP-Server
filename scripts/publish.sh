#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# LOOM Release Publisher
# Publishes all @spongeacer packages to npm, creates a GitHub release tag.
#
# Usage:
#   ./scripts/publish.sh [patch|minor|major|<exact-version>]
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

log_info() { echo "[PUBLISH] $1"; }
log_err() { echo "[PUBLISH] $1" >&2; }

# ---------------------------------------------------------------------------
# 1. Determine new version
# ---------------------------------------------------------------------------
CURRENT_VERSION=$(node -p "require('./package.json').version")
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
# 3. Bump version in all workspace packages
# ---------------------------------------------------------------------------
log_info "Bumping all packages to v$NEW_VERSION"
npm version "$NEW_VERSION" --workspaces --include-workspace-root

git add -A
git commit -m "chore(release): v$NEW_VERSION"

# ---------------------------------------------------------------------------
# 4. Build & publish to npm
# ---------------------------------------------------------------------------
npm run build
npm publish --workspaces --access public
log_info "Published all packages to npm"

# ---------------------------------------------------------------------------
# 5. Git tag & push
# ---------------------------------------------------------------------------
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
git push origin main "v$NEW_VERSION"
log_info "Pushed git tag v$NEW_VERSION"

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "Release v$NEW_VERSION complete!"
echo "=========================================="
echo ""
echo "  npm packages:"
for pkg in loom-core loom-cli loom-mcp loom-cloud; do
  echo "    @spongeacer/$pkg"
done
echo ""
echo "  GitHub: https://github.com/Spongeacer/Loom-MCP-Server/releases/tag/v$NEW_VERSION"
echo ""
