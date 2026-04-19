# LOOM v0.4.0 Architecture

> **版本**: 0.4.0  
> **日期**: 2026-04-18  
> **基础**: 从 v0.2.5 干净分支重新设计，吸收 v0.2.x-dead 的全部教训

---

## 1. 设计目标

| 目标 | v0.2.x 状态 | 0.3.0 目标 |
|------|------------|-----------|
| 消除重复代码 | ~20× `unlink` 重复，4× shutdown 重复 | 统一 utils 层，零复制粘贴 |
| 清晰模块边界 | `@ts-ignore` 跨包引用构建产物 | npm workspace + 严格类型导入 |
| 安全无妥协 | Fake Ed25519 fallback（确定性密钥） | 无 fallback，失败即崩溃 |
| 存储可替换 | store.ts 直接操作 fs | StoreAdapter 接口 + FS/Memory 实现 |
| Trash 恢复 | 硬删除，无恢复 | 软删除 + 恢复 CLI |
| 测试覆盖 | 20+ 文件无测试 | 每个源文件对应测试文件 |
| Monorepo | 幽灵包，无 workspace | 根 workspace，正确依赖链 |

---

## 2. 包结构

```
packages/
├── loom-core/          # 纯逻辑层 — 类型、存储抽象、工具函数、提示构建
│   ├── src/
│   │   ├── types/
│   │   │   └── index.ts          # 所有 Entry / Binding / Config 类型
│   │   ├── store/
│   │   │   ├── adapter.ts        # StoreAdapter 接口
│   │   │   ├── fs-adapter.ts     # FileSystemStoreAdapter 实现
│   │   │   ├── memory-adapter.ts # MemoryStoreAdapter（测试用）
│   │   │   └── trash.ts          # Trash 管理（list/restore/purge）
│   │   ├── utils/
│   │   │   ├── fs-safe.ts        # safeUnlink, safeMkdir, atomicWrite
│   │   │   ├── pid-file.ts       # PID + health 文件统一管理
│   │   │   ├── shutdown.ts       # 统一的 graceful shutdown
│   │   │   ├── crypto.ts         # Ed25519 封装（无 fallback）
│   │   │   └── yaml.ts           # YAML 解析封装（空值/错误处理）
│   │   ├── prompt/
│   │   │   └── builder.ts        # buildSlotPrompt + slot 注入
│   │   └── __tests__/
│   ├── package.json
│   └── tsconfig.json
│
├── loom-cli/           # CLI 入口 — 命令解析、 runner 脚本
│   ├── src/
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── status.ts
│   │   │   ├── task.ts
│   │   │   ├── watch.ts
│   │   │   ├── fs.ts
│   │   │   ├── trash.ts          # NEW: trash list/restore/purge
│   │   │   └── ...
│   │   ├── cli.ts                # 命令路由（原 cli.ts 简化）
│   │   └── __tests__/
│   ├── bin/
│   │   ├── loom                  # shell wrapper
│   │   └── loom-mcp              # shell wrapper（delegate 到 loom-mcp 包）
│   ├── package.json
│   └── tsconfig.json
│
├── loom-mcp/           # MCP Server — 工具注册、路由、生命周期
│   ├── src/
│   │   ├── server.ts             # MCP Server 启动（原 mcp.ts）
│   │   ├── router.ts             # 工具路由（原 mcp-router.ts）
│   │   ├── tools/
│   │   │   ├── registry.ts       # 工具注册表
│   │   │   ├── task-tools.ts
│   │   │   ├── entry-tools.ts
│   │   │   └── fs-tools.ts
│   │   └── __tests__/
│   ├── package.json
│   └── tsconfig.json
│
├── loom-cloud/         # Cloud Sync + License（从 v0.2.x 重新设计）
│   ├── src/
│   │   ├── auth.ts               # 设备密钥（Ed25519，无 fallback）
│   │   ├── license.ts            # 许可证生成/验证
│   │   ├── sync-engine.ts        # 双向同步引擎
│   │   ├── conflict-resolver.ts  # 确定性冲突解决
│   │   ├── cloud-api.ts          # HTTP 客户端
│   │   └── __tests__/
│   ├── package.json
│   └── tsconfig.json
│
└── loom-vscode/        # VS Code 扩展（保持不变，仅更新依赖）
    └── ...
```

---

## 3. StoreAdapter 接口

```ts
// packages/loom-core/src/store/adapter.ts
export interface StoreAdapter {
  // ── 生命周期 ──
  initWorkspace(projectName: string): void;
  isInitialized(): boolean;
  
  // ── Entry CRUD ──
  listEntries(): Entry[];
  getEntry(id: string): Entry | null;
  saveEntry(entry: Entry): void;
  removeEntry(id: string): void;        // → 移动到 trash
  
  // ── Binding CRUD ──
  listBindings(): Binding[];
  saveBinding(binding: Binding): void;
  removeBinding(sourceId: string, targetId: string): void;
  
  // ── Working Set ──
  getWorkingSet(): WorkingSet;
  saveWorkingSet(ws: WorkingSet): void;
  
  // ── Config ──
  getConfig(): LoomConfig | null;
  
  // ── Prompt Cache ──
  writeActivePrompt(content: string): void;
  readActivePrompt(): string;
  
  // ── Cache Version ──
  readCacheVersion(): string;
  bumpCacheVersion(): void;
  
  // ── Trash ──
  listTrash(): TrashItem[];
  restoreFromTrash(id: string): void;
  purgeTrash(olderThanDays?: number): void;
}
```

---

## 4. Trash 机制

```ts
// packages/loom-core/src/store/trash.ts
export interface TrashItem {
  id: string;
  type: EntryType;
  deletedAt: string;      // ISO timestamp
  expiresAt: string;      // deletedAt + 30 days
  entry: Entry;           // 完整备份
}
```

- **删除**: `removeEntry()` 将 Entry 序列化为 YAML，写入 `.loom/trash/<id>.<timestamp>.yml`
- **列表**: `listTrash()` 读取 `.loom/trash/`，按 `deletedAt` 排序
- **恢复**: `restoreFromTrash(id)` 从 trash 读回，调用 `saveEntry()`，删除 trash 文件
- **清理**: `purgeTrash(30)` 删除 `expiresAt < now` 的 trash 文件
- **自动清理**: watch-daemon 每次启动时执行 `purgeTrash(30)`

---

## 5. Utils 层（消除重复）

### 5.1 fs-safe.ts

```ts
export function safeUnlink(path: string): void;
export function safeUnlinkAsync(path: string): Promise<void>;
export function safeMkdir(dir: string): void;
export function atomicWriteFile(filePath: string, content: string): void;
export function readYamlFile<T>(path: string, fallback: T): T;
export function writeYamlFile(path: string, data: unknown): void;
```

### 5.2 pid-file.ts

```ts
export interface DaemonStatus { pid: number | null; healthy: boolean; startedAt: string | null; }
export function writePidFile(pidPath: string, healthPath: string): void;
export function readDaemonStatus(pidPath: string, healthPath: string): DaemonStatus;
export function stopDaemon(pidPath: string, healthPath: string): boolean;
```

### 5.3 shutdown.ts

```ts
export type CleanupFn = () => void | Promise<void>;
export function registerCleanup(fn: CleanupFn, timeoutMs?: number): void;
export function gracefulShutdown(code?: number): Promise<void>;
```

### 5.4 crypto.ts

```ts
export interface KeyPair { publicKey: string; privateKey: string; } // base64 PEM
export function generateEd25519KeyPair(): KeyPair;
export function signChallenge(privateKeyPem: string, challenge: string): string;
export function verifySignature(publicKeyPem: string, challenge: string, signature: string): boolean;
// 无 fallback。失败抛异常。
```

---

## 6. 提示构建器（Prompt Builder）

v0.2.x 的 `prompt-builder.ts` 直接操作 `store.ts`。0.3.0 改为依赖 `StoreAdapter` 接口：

```ts
// packages/loom-core/src/prompt/builder.ts
export function buildSlotPrompt(adapter: StoreAdapter, options?: BuildOptions): string;
```

Slot 注入顺序（优化 KV Cache 命中率）：
1. `protocol`（静态，几乎不变）
2. `governance`（变化慢）
3. `decisions`（变化慢）
4. `dictionary`（增长型）
5. `task`（高变化）
6. `working_set`（高变化）
7. `risks` / `recovery` / `recent_files` / `fs_health`

---

## 7. 测试策略

| 层级 | 范围 | 工具 |
|------|------|------|
| 单元测试 | 单个函数/类 | `node --test` |
| 集成测试 | StoreAdapter 实现 | `node --test` + MemoryStoreAdapter |
| CLI 测试 | 命令行输出 | 调用 CLI 函数，断言 stdout |
| MCP 测试 | 工具调用 | Mock transport |

**覆盖率要求**: 
- `loom-core`: 90%+（这是地基）
- `loom-cli`, `loom-mcp`, `loom-cloud`: 80%+

---

## 8. 迁移路线图

### Phase 1: 地基（loom-core）
- [ ] 创建 `packages/loom-core/` 包结构
- [ ] 迁移 `types/index.ts`（零改动，类型已稳定）
- [ ] 实现 `utils/` 层（fs-safe, pid-file, shutdown, crypto, yaml）
- [ ] 实现 `StoreAdapter` 接口 + `FileSystemStoreAdapter` + `MemoryStoreAdapter`
- [ ] 实现 `Trash` 机制
- [ ] 迁移 `prompt/builder.ts`
- [ ] **目标**: `loom-core` 全部测试通过

### Phase 2: CLI（loom-cli）
- [ ] 创建 `packages/loom-cli/`
- [ ] 依赖 `loom-core`，使用 `StoreAdapter`
- [ ] 迁移所有命令（init, status, task, watch, fs, trash...）
- [ ] **目标**: 所有 CLI 命令测试通过

### Phase 3: MCP（loom-mcp）
- [ ] 创建 `packages/loom-mcp/`
- [ ] 迁移 MCP Server + Router
- [ ] 所有工具通过 `StoreAdapter` 操作数据
- [ ] **目标**: MCP 工具测试通过

### Phase 4: Cloud（loom-cloud）
- [ ] 创建 `packages/loom-cloud/`
- [ ] 依赖 `loom-core`（通过 workspace）
- [ ] 迁移 auth, license, sync-engine, conflict-resolver, cloud-api
- [ ] 移除所有 `@ts-ignore` 和 `require()`
- [ ] **目标**: Cloud 同步测试通过

### Phase 5: 集成
- [ ] 根 workspace 配置
- [ ] 端到端测试
- [ ] 版本号统一升级到 0.3.0
- [ ] 发布

---

*设计日期: 2026-04-19*
