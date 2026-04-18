const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pkgDir = path.resolve(__dirname, '..');
const srcDir = path.join(pkgDir, 'src');
const lockFile = path.join(pkgDir, 'node_modules', '.loom-build-lock');
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function getMaxMtime(dir) {
  let max = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      max = Math.max(max, getMaxMtime(fullPath));
    } else {
      max = Math.max(max, fs.statSync(fullPath).mtimeMs);
    }
  }
  return max;
}

function isStale(targetJs) {
  const distFile = path.join(pkgDir, 'dist', targetJs);
  if (!fs.existsSync(distFile)) return true;
  if (!fs.existsSync(srcDir)) return false;
  const distMtime = fs.statSync(distFile).mtimeMs;
  const srcMtime = getMaxMtime(srcDir);
  return srcMtime > distMtime;
}

function acquireBuildLock() {
  try {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') return false;
    // Lock exists; check if stale
    try {
      const stat = fs.statSync(lockFile);
      if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
        fs.unlinkSync(lockFile);
        fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }
}

function releaseBuildLock() {
  try {
    const pid = fs.readFileSync(lockFile, 'utf-8').trim();
    if (pid === String(process.pid)) {
      fs.unlinkSync(lockFile);
    }
  } catch {
    // ignore
  }
}

function waitForBuildLock(maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (!fs.existsSync(lockFile)) return true;
    try {
      const stat = fs.statSync(lockFile);
      if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
        fs.unlinkSync(lockFile);
        return true;
      }
    } catch {
      return true;
    }
    // Cross-platform sleep (Windows lacks `sleep` command)
    if (process.platform === 'win32') {
      spawnSync('powershell', ['-command', 'Start-Sleep -Milliseconds 200']);
    } else {
      spawnSync('sleep', ['0.2']);
    }
  }
  return false;
}

function runBuild(forceFull = false) {
  const nodeModules = path.join(pkgDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    console.error('[LOOM] node_modules missing. Running npm install...');
    const install = spawnSync('npm', ['install'], { cwd: pkgDir, stdio: 'inherit' });
    if (install.status !== 0) {
      console.error('[LOOM] npm install failed. Please run it manually in ' + pkgDir);
      process.exit(1);
    }
  }

  const tsBuildInfo = path.join(pkgDir, 'tsconfig.tsbuildinfo');
  if (forceFull && fs.existsSync(tsBuildInfo)) {
    console.error('[LOOM] Clearing incremental cache for full rebuild...');
    try { fs.unlinkSync(tsBuildInfo); } catch {}
  }

  console.error('[LOOM] Running npm run build...');
  const build = spawnSync('npm', ['run', 'build'], { cwd: pkgDir, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error('[LOOM] Build failed. Please check the output above.');
    process.exit(1);
  }
  console.error('[LOOM] Auto-build succeeded.');
}

function bootstrap(targetJs) {
  const distFile = path.join(pkgDir, 'dist', targetJs);
  const missing = !fs.existsSync(distFile);

  if (missing || isStale(targetJs)) {
    const rel = path.relative(process.cwd(), distFile);
    console.error(`[LOOM] ${rel} is stale or missing. Attempting auto-build...`);

    if (!acquireBuildLock()) {
      console.error('[LOOM] Another build is in progress. Waiting...');
      if (!waitForBuildLock()) {
        console.error('[LOOM] Timed out waiting for build. Please try again.');
        process.exit(1);
      }
      // After waiting, dist should be fresh; if not, try once more
      if (!fs.existsSync(distFile)) {
        console.error('[LOOM] Build finished but target still missing. Aborting.');
        process.exit(1);
      }
    } else {
      try {
        runBuild(missing);
      } finally {
        releaseBuildLock();
      }
    }
  }

  require(distFile);
}

module.exports = bootstrap;
