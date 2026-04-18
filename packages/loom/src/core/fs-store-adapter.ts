import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml_1 from 'yaml';
import * as paths_js_1 from './paths.js';
import * as fs_utils_js_1 from './fs-utils.js';
import * as constants_js_1 from './constants.js';

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.FsStoreAdapter = void 0;
function atomicWriteFileSync(filePath, content) {
    const dir = path.dirname(filePath);
    const tempPath = path.join(dir, `.tmp-${path.basename(filePath)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    try {
        fs.writeFileSync(tempPath, content);
        fs.renameSync(tempPath, filePath);
    }
    catch (err) {
        try {
            fs.unlinkSync(tempPath);
        }
        catch { }
        throw err;
    }
}
function deepCopyEntry(entry) {
    return structuredClone(entry);
}
function deepCopyEntries(entries) {
    return entries.map(deepCopyEntry);
}
function deepCopyBindings(bindings) {
    return structuredClone(bindings);
}
class FsStoreAdapter {
    projectRoot;
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
    }
    get paths() {
        return (0, paths_js_1.getPaths)(this.projectRoot);
    }
    initWorkspace(projectName) {
        const paths = this.paths;
        (0, fs_utils_js_1.ensureDir)(paths.entriesRules);
        (0, fs_utils_js_1.ensureDir)(paths.entriesMemories);
        (0, fs_utils_js_1.ensureDir)(paths.entriesSkills);
        (0, fs_utils_js_1.ensureDir)(paths.entriesPatterns);
        (0, fs_utils_js_1.ensureDir)(paths.entriesArtifacts);
        (0, fs_utils_js_1.ensureDir)(paths.entriesTasks);
        (0, fs_utils_js_1.ensureDir)(paths.entriesDecisions);
        (0, fs_utils_js_1.ensureDir)(paths.bindings);
        (0, fs_utils_js_1.ensureDir)(paths.events);
        (0, fs_utils_js_1.ensureDir)(paths.cache);
        const config = {
            version: constants_js_1.LOOM_VERSION,
            project_name: projectName,
            initialized_at: new Date().toISOString(),
            default_namespace: 'project',
        };
        atomicWriteFileSync(paths.config, yaml_1.default.stringify(config));
        const workingSet = {
            active_task: null,
            pinned_entries: [],
            hot_entries: [],
            recently_expanded: [],
            blocked_entries: [],
        };
        atomicWriteFileSync(paths.workingSet, yaml_1.default.stringify(workingSet));
        atomicWriteFileSync(paths.wal, '');
        atomicWriteFileSync(paths.activePrompt, '<loom_context>\n  <protocol>LOOM initialized. No active task yet.</protocol>\n</loom_context>');
    }
    isInitialized() {
        return fs.existsSync(this.paths.root);
    }
    // ─── Entries ───
    listEntries() {
        const paths = this.paths;
        const entries = [];
        const dirs = [
            paths.entriesRules,
            paths.entriesMemories,
            paths.entriesSkills,
            paths.entriesPatterns,
            paths.entriesArtifacts,
            paths.entriesTasks,
            paths.entriesDecisions,
        ];
        for (const dir of dirs) {
            if (!fs.existsSync(dir))
                continue;
            for (const file of fs.readdirSync(dir)) {
                if (file.endsWith('.loom.yml')) {
                    const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
                    try {
                        const entry = yaml_1.default.parse(raw);
                        if (!entry)
                            continue;
                        if (entry.type === 'Artifact') {
                            const art = entry;
                            if (!art.artifact.fs) {
                                art.artifact.fs = {
                                    last_modified_at: new Date(0).toISOString(),
                                    last_seen_at: new Date().toISOString(),
                                    size_bytes: 0,
                                    exists: false,
                                };
                            }
                            if (!art.artifact.deps) {
                                art.artifact.deps = { imports: [], imported_by: [] };
                            }
                            if (!art.artifact.health) {
                                art.artifact.health = {
                                    status: 'healthy',
                                    score: 1.0,
                                    reasons: [],
                                    suggested_action: 'keep',
                                };
                            }
                        }
                        entries.push(entry);
                    }
                    catch (err) {
                        console.error('[LOOM] Failed to parse entry:', err);
                    }
                }
            }
        }
        return deepCopyEntries(entries);
    }
    getEntry(id) {
        const entries = this.listEntries();
        const entry = entries.find((e) => e.id === id);
        return entry ? deepCopyEntry(entry) : null;
    }
    saveEntry(entry) {
        if (/[\\/]/.test(entry.id) || entry.id === '..' || entry.id === '.') {
            throw new Error(`Invalid entry id contains path separators: ${entry.id}`);
        }
        const paths = this.paths;
        const dirMap = {
            Rule: paths.entriesRules,
            Memory: paths.entriesMemories,
            Skill: paths.entriesSkills,
            Pattern: paths.entriesPatterns,
            Artifact: paths.entriesArtifacts,
            Task: paths.entriesTasks,
            Decision: paths.entriesDecisions,
        };
        const dir = dirMap[entry.type];
        const filePath = path.join(dir, `${entry.id}.loom.yml`);
        const { bindings_out: _bindingsOut, bindings_in: _bindingsIn, ...entryWithoutBindings } = entry;
        atomicWriteFileSync(filePath, yaml_1.default.stringify(entryWithoutBindings));
    }
    // ─── Bindings ───
    listBindings() {
        const paths = this.paths;
        const bindings = [];
        if (!fs.existsSync(paths.bindings))
            return bindings;
        for (const file of fs.readdirSync(paths.bindings)) {
            if (file.endsWith('.yml')) {
                const raw = fs.readFileSync(path.join(paths.bindings, file), 'utf-8');
                try {
                    const b = yaml_1.default.parse(raw);
                    if (b)
                        bindings.push(b);
                }
                catch (err) {
                    console.error('[LOOM] Failed to parse binding:', err);
                }
            }
        }
        return deepCopyBindings(bindings);
    }
    saveBinding(binding) {
        const { makeBindingFileName } = require('./binding-utils.js');
        const bindingPath = path.join(this.paths.bindings, makeBindingFileName(binding.source, binding.target));
        atomicWriteFileSync(bindingPath, yaml_1.default.stringify(binding));
    }
    removeBinding(sourceId, targetId) {
        const { makeBindingFileName } = require('./binding-utils.js');
        const bindingPath = path.join(this.paths.bindings, makeBindingFileName(sourceId, targetId));
        if (fs.existsSync(bindingPath)) {
            fs.unlinkSync(bindingPath);
        }
    }
    // ─── Working Set ───
    getWorkingSet() {
        const paths = this.paths;
        if (!fs.existsSync(paths.workingSet)) {
            return {
                active_task: null,
                pinned_entries: [],
                hot_entries: [],
                recently_expanded: [],
                blocked_entries: [],
            };
        }
        try {
            const parsed = yaml_1.default.parse(fs.readFileSync(paths.workingSet, 'utf-8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return {
                    active_task: null,
                    pinned_entries: [],
                    hot_entries: [],
                    recently_expanded: [],
                    blocked_entries: [],
                };
            }
            return parsed;
        }
        catch {
            return {
                active_task: null,
                pinned_entries: [],
                hot_entries: [],
                recently_expanded: [],
                blocked_entries: [],
            };
        }
    }
    saveWorkingSet(ws) {
        atomicWriteFileSync(this.paths.workingSet, yaml_1.default.stringify(ws));
    }
    // ─── Config ───
    getConfig() {
        const paths = this.paths;
        if (!fs.existsSync(paths.config))
            return null;
        try {
            const parsed = yaml_1.default.parse(fs.readFileSync(paths.config, 'utf-8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                return null;
            return parsed;
        }
        catch {
            return null;
        }
    }
    // ─── Prompt Cache ───
    writeActivePrompt(content) {
        atomicWriteFileSync(this.paths.activePrompt, content);
    }
    // ─── Cache Version ───
    readCacheVersion() {
        const p = path.join(this.paths.cache, 'store-cache-version.txt');
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
    }
    bumpCacheVersion() {
        const p = path.join(this.paths.cache, 'store-cache-version.txt');
        atomicWriteFileSync(p, Date.now().toString());
    }
}
//# sourceMappingURL=fs-store-adapter.js.map
export { FsStoreAdapter };
