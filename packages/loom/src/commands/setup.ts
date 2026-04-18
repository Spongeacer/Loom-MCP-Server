import * as path from 'node:path';
import * as store_js_1 from '../core/store.js';
import * as install_mcp_js_1 from './install-mcp.js';

function runSetup(rest = []) {
    const dryRun = rest.includes('--dry-run');
    // 1. MCP client auto-configuration (reuses install-mcp logic)
    const mcpOutput = (0, install_mcp_js_1.runInstallMcp)(rest);
    // 2. Auto-init workspace in current directory
    const cwd = process.cwd();
    let initOutput = '';
    if (!(0, store_js_1.isInitialized)(cwd)) {
        const projectName = path.basename(cwd);
        if (dryRun) {
            initOutput = `\nWould initialize LOOM workspace: ${projectName}\n`;
        }
        else {
            (0, store_js_1.initWorkspace)(projectName, cwd);
            initOutput = `\n✓ Initialized LOOM workspace: ${projectName}\n`;
        }
    }
    else {
        initOutput = `\n○ LOOM workspace already initialized in ${cwd}\n`;
    }
    // 3. Quick-start hints
    const hints = `
Quick start:
  loom status              # View context
  loom task create '...'   # Create a task
  loom fs health           # Check file health
`;
    return mcpOutput + initOutput + hints;
}
//# sourceMappingURL=setup.js.map
export { runSetup };
