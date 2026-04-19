# LOOM v0.4.0 Architecture

> **版本**: 0.4.0  
> **日期**: 2026-04-19  
> **基础**: 从 v0.2.5 干净分支重新设计，吸收 v0.2.x-dead 的全部教训

---

## 1. 设计目标

| 目标 | v0.2.x 状态 | 0.4.0 状态 |
|------|------------|-----------|
| 消除重复代码 | ~20× `unlink` 重复，4× shutdown 重复 | ✅ 统一 utils 层，零复制粘贴 |
| 清晰模块边界 | `@ts-ignore` 跨包引用构建产物 | ✅ npm workspace + 严格类型导入 |
| 安全无妥协 | Fake Ed25519 fallback（确定性密钥） | ✅ 无 fallback，失败即崩溃 |
| 存储可替换 | store.ts 直接操作 fs | ✅ StoreAdapter 接口 + FS/Memory 实现 |
| Trash 恢复 | 硬删除，无恢复 | ✅ 软删除 + 恢复 CLI |
| 测试覆盖 | 20+ 文件无测试 | ✅ 92 个测试全部通过 |
| Monorepo | 幽灵包，无 workspace | ✅ 根 workspace，正确依赖链 |
| Cloud 自托管 | 无 | ✅ 阿里云 ECS + Docker + HTTPS |
| License 商业化 | 无 | ✅ 100 内测 license + admin 分配 |

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
│   │   │   └── builder.ts        # buildSlotPrompt + 11 个 slot 注入
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
│   │   │   ├── cloud.ts          # Cloud signup/login/register/activate/sync
│   │   │   ├── trash.ts
│   │   │   └── ...
│   │   ├── cli.ts                # 命令路由（支持最多 3 词命令）
│   │   └── __tests__/
│   ├── bin/
│   │   ├── loom                  # shell wrapper
│   │   └── loom-mcp              # shell wrapper（delegate 到 loom-mcp 包）
│   ├── package.json
│   └── tsconfig.json
│
├── loom-mcp/           # MCP Server — JSON-RPC stdio，工具注册
│   ├── src/
│   │   ├── server.ts             # 裸 JSON-RPC MCP 服务器（无官方 SDK）
│   │   ├── router.ts             # 工具路由
│   │   ├── tools/
│   │   │   ├── cloud-tools.ts    # loom_activate_license / loom_cloud_status
│   │   │   ├── task-tools.ts
│   │   │   ├── entry-tools.ts
│   │   │   └── fs-tools.ts
│   │   └── __tests__/
│   ├── package.json
│   └── tsconfig.json
│
├── loom-cloud/         # Cloud Sync + License + Device Identity + Server
│   ├── src/
│   │   ├── auth.ts               # 设备密钥（Ed25519，无 fallback）
│   │   ├── license.ts            # 许可证生成/验证（Ed25519 签名）
│   │   ├── sync-engine.ts        # 双向同步引擎（先 pull 后 push）
│   │   ├── conflict-resolver.ts  # 确定性冲突解决
│   │   ├── cloud-api.ts          # HTTP 客户端
│   │   └── server/               # 自托管后端
│   │       ├── server.ts         # 原生 HTTP 服务器（signup/login/register/push/pull/admin）
│   │       ├── db.ts             # 文件系统数据库（users/devices/entries/licenses）
│   │       └── index.ts          # 容器入口
│   ├── deploy/                   # 阿里云 ECS 部署文件
│   │   ├── docker-compose.prod.yml
│   │   ├── docker-compose.http.yml
│   │   ├── nginx.conf
│   │   ├── nginx.ssl.conf
│   │   ├── install.sh
│   │   ├── quick-start.sh
│   │   ├── switch-to-ssl.sh
│   │   └── aliyun-ecs.md
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── tsconfig.json
│
└── loom-vscode/        # VS Code 扩展
    └── ...
```

---

## 3. 核心数据模型

### 3.1 Entry 类型

```ts
// packages/loom-core/src/types/index.ts
export type EntryType =
  | 'Rule'
  | 'Memory'
  | 'Skill'
  | 'Pattern'
  | 'Artifact'
  | 'Task'
  | 'Decision';

export interface Entry {
  id: string;
  type: EntryType;
  version: number;
  namespace: string;
  content: { l1_5: string; l2: string; l3: string };
  lifecycle: { state: string; created: string; updated: string; ... };
  quality: { freshness: number; trust: number; activity: number; composite_score: number };
  trust: { level: string; source: string };
  activation: { paths: string[]; keywords: string[]; intents: string[]; tools: string[] };
  conflicts: { supersedes: string[]; conflicts_with: string[]; precedence: number };
  // 类型特有字段
  task?: { title: string; status: string; priority: string; ... };
  artifact?: { fs: { path: string; exists: boolean; last_modified_at: string; health: { status: string } } };
  // 关系
  bindings_out: Binding[];
  bindings_in: Binding[];
}
```

### 3.2 StoreAdapter 接口

```ts
export interface StoreAdapter {
  // 生命周期
  initWorkspace(projectName: string): void;
  isInitialized(): boolean;
  
  // Entry CRUD
  listEntries(): Entry[];
  getEntry(id: string): Entry | null;
  saveEntry(entry: Entry): void;
  removeEntry(id: string): void;        // → 移动到 trash
  
  // Binding CRUD
  listBindings(): Binding[];
  saveBinding(binding: Binding): void;
  removeBinding(sourceId: string, targetId: string): void;
  
  // Working Set
  getWorkingSet(): WorkingSet;
  saveWorkingSet(ws: WorkingSet): void;
  
  // Config
  getConfig(): LoomConfig | null;
  
  // Prompt Cache
  writeActivePrompt(content: string): void;
  readActivePrompt(): string;
  
  // Cache Version（单调递增，解决 Date.now() 碰撞）
  readCacheVersion(): string;
  bumpCacheVersion(): void;
  
  // Trash
  listTrash(): TrashItem[];
  restoreFromTrash(id: string): void;
  purgeTrash(olderThanDays?: number): void;
}
```

---

## 4. 提示构建器（Prompt Builder）

11 个 slot，按 KV Cache 命中率优化排序（静态 → 动态）：

```
<loom_context>
  <protocol>LOOM v0.4.0</protocol>
  <project>项目名称</project>
  <governance>      # Rules（最多 20 条）
  <decisions>       # Decisions（最多 N 条）
  <dictionary>      # 所有 Entry 的 l1_5 摘要
  <task>            # 当前活跃任务
  <working_set>     # pinned + hot entries（最多 20 个）
  <risks>           # blocked entries
  <recovery>        # recently expanded entries
  <recent_files>    # 按修改时间排序的 Artifacts
  <fs_health>       # unhealthy/orphan/legacy 文件
</loom_context>
```

---

## 5. Cloud 架构

### 5.1 数据流

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐
│  Local CLI  │────▶│  SyncEngine │────▶│  CloudApiClient (HTTPS)     │
│  / MCP      │◀────│ (pull→push) │◀────│                             │
└─────────────┘     └─────────────┘     └─────────────────────────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────────────────┐
                                        │  nginx:443 (reverse proxy)  │
                                        │  Let's Encrypt SSL          │
                                        └─────────────────────────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────────────────┐
                                        │  loom-cloud:8765            │
                                        │  (Node.js native HTTP)      │
                                        │  • signup / login           │
                                        │  • register (Ed25519)       │
                                        │  • activate (license)       │
                                        │  • push / pull              │
                                        │  • admin allocate / stats   │
                                        └─────────────────────────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────────────────┐
                                        │  LoomCloudDb (文件系统)      │
                                        │  /data/                     │
                                        │    users/                   │
                                        │      <userId>/              │
                                        │        user.json            │
                                        │        devices/             │
                                        │        entries/             │
                                        │    licenses.json            │
                                        └─────────────────────────────┘
```

### 5.2 用户隔离

- 每个用户独立目录：`/data/users/<userId>/`
- entries 按 userId 隔离，不同用户互不可见
- 一个 license 只能绑定一个用户，激活后永久锁定

### 5.3 License 生命周期

```
Server 启动
  → 检查 licenses.json
    → 为空 → 自动生成 100 个 LOOM-BETA-XXXX-XXXX-XXXX

Admin 分配
  → POST /admin/allocate (需 LOOM_ADMIN_SECRET)
  → 原子标记 allocatedAt
  → 返回 key 给内测用户

用户激活
  → POST /activate (需 userToken + licenseKey)
  → 检查：key 存在？未被激活？用户无其他 license？
  → 绑定 activatedBy = userId

使用
  → push / pull 时检查 hasActiveLicense()
  → 无 license → HTTP 402
```

### 5.4 四层严格防重复

| 层级 | 机制 | 代码位置 |
|------|------|----------|
| 自动分配隔离 | `allocate()` 只选 `!allocatedAt && !activatedBy` | `db.ts:allocateLicense()` |
| 分配后锁定 | allocatedAt 标记后不会再被 allocate | `db.ts:allocateLicense()` |
| 激活后永久绑定 | `activateLicense()` 检查 `activatedBy` | `db.ts:activateLicense()` |
| 一人一 license | 用户已激活则拒绝再次激活 | `server.ts:/activate` |

---

## 6. 部署架构（阿里云 ECS）

```
阿里云 ECS (Docker 应用镜像)
│
├── docker-compose.prod.yml
│   ├── loom-cloud    :8765  (volume: ./dist → /app/dist)
│   ├── nginx         :80 / :443  (反向代理 + SSL)
│   └── certbot       (Let's Encrypt 自动续期)
│
├── .env
│   ├── LOOM_CLOUD_SECRET
│   └── LOOM_ADMIN_SECRET
│
├── dist/              ← 本地构建产物挂载
├── nginx.conf         ← HTTP 配置
├── nginx.ssl.conf     ← HTTPS 配置（证书获取后切换）
└── data/              ← Docker Volume (用户数据持久化)
```

**安全组规则**：仅开放 80/443，8765 不暴露公网。

---

## 7. 同步引擎（SyncEngine）

```ts
// 关键修复：先 pull 后 push，避免 lastSync 时间戳过新导致数据遗漏
async sync(): Promise<SyncResult> {
  // 1. Pull（使用 index 中最早的 lastSyncedAt 作为 since）
  const lastSync = Object.values(this.index.entries)
    .map((s) => s.lastSyncedAt)
    .sort()[0] ?? new Date(0).toISOString();
  const pullResult = await this.api.pull(this.token, lastSync);
  // resolveConflict → saveEntry → result.pulled++

  // 2. Push（所有 dirty entries）
  await this._pushDirty();
  result.pushed = ...;
}
```

**冲突解决策略**：
- Cloud only → `cloud-wins`
- Cloud newer + local clean → `cloud-wins`
- Cloud newer + local dirty → `fork-local`（cloud 获胜，本地 fork 为 draft）
- Local same or newer → `local-wins`

---

## 8. MCP 服务器

- **传输**: stdio JSON-RPC（裸实现，无官方 `@modelcontextprotocol/sdk`）
- **生产体积**: 2.7M（yaml + chokidar + 业务逻辑）
- **工具集**: task/entry/fs/watch/trash/meta/cloud
- **新增 cloud tools**: `loom_activate_license`, `loom_cloud_status`

---

## 9. 测试策略

| 层级 | 范围 | 数量 | 工具 |
|------|------|------|------|
| 单元测试 | loom-core 函数/类 | 65 | `node --test` |
| Cloud 测试 | license/sync/server | 11 | `node --test` |
| CLI 测试 | 命令行输出 | 6 | 调用 CLI 函数 |
| MCP 测试 | JSON-RPC 交互 | 10 | Mock transport |
| **合计** | | **92** | |

---

## 10. 数据目录结构（.loom/）

```
.loom/
├── entries/
│   ├── rules/
│   ├── memories/
│   ├── skills/
│   ├── patterns/
│   ├── artifacts/
│   ├── tasks/
│   └── decisions/
├── bindings/
├── events/
│   └── wal.jsonl
├── cache/
│   ├── active-prompt.txt
│   └── version.txt        ← 单调递增版本号
├── trash/
│   └── <id>.<timestamp>.yml
└── config.yml
```

---

*设计日期: 2026-04-19*
