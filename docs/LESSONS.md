# LOOM v0.2.x → v0.3.0 教训总结

> **状态**: 已归档 — v0.2.x 已标记为 `v0.2.x-dead`，所有代码冻结。
> **来源**: 两次失败的跨包重构尝试（agent-btfn6vwo、agent-j02dtfqd 均超时），一次架构审计。

---

## 一、开发流程教训

### 1.1 不要用后台 Agent 做大规模跨包重构
- **后果**: 两个 agent 均在 300s 超时，git workspace 处于 broken 状态
- **原因**: 跨包重构涉及 `packages/loom/`、`packages/loom-cloud/`、`packages/loom-vscode/`，依赖关系复杂，后台 agent 无法及时获得人类反馈
- **0.3.0 做法**: 所有架构重构在前台执行，每次只改一个包，改完立即 `tsc` + `test`

### 1.2 每次文件修改后必须立即跑 `tsc`
- **后果**: 批量修改 10+ 文件后才发现类型错误，回滚困难
- **0.3.0 做法**: 强制 `tsc --noEmit` 作为 pre-commit hook

### 1.3 永远不要把 `dist/` 提交到 git
- **后果**: merge conflict 地狱，`.loom-cloud/dist/` 有 40+ 个生成的 `.js` 文件在 git 中
- **0.3.0 做法**: 根 `.gitignore` 统一排除所有 `dist/`、`out/`、`*.{js,js.map,d.ts,d.ts.map}`（除了 `bin/` 和真正的 JS 源码）

---

## 二、代码质量教训

### 2.1 重复代码是技术债务的温床

| 重复模式 | 出现次数 | 位置 |
|---------|---------|------|
| `try { fs.unlinkSync(...) } catch {}` | ~20× | store.ts, watch-daemon.ts, dev-mode.ts, fs-scan.ts, lock.ts 等 |
| `deepCopyEntry` / `deepCopyBindings` | 2× | store.ts + fs-store-adapter.ts |
| PID + health 文件管理 | 2× | watch-daemon.ts (~80行) ↔ dev-mode.ts (~80行) |
| Graceful shutdown handler | 4× | mcp.ts, watch-daemon-runner.ts, dev-mode-runner.ts, sync-daemon-runner.ts |

**0.3.0 做法**: 统一提取到 `loom-core/utils/` 层，一个实现，到处引用。

### 2.2 安全漏洞：Fake Ed25519 Fallback

```ts
// v0.2.x 的致命代码（已删除）
catch {
  // Fallback: deterministic key from SHA-512 seed
  const seed = createHash('sha512').update('loom-device-key-v1').digest();
  // ... 手动构造 DER ...
}
```

- **风险**: 所有设备生成相同的密钥对，完全失去身份认证意义
- **0.3.0 做法**: Node 18+ 原生支持 Ed25519，**没有 fallback**。如果 `generateKeyPairSync('ed25519')` 失败，直接抛异常终止程序。

### 2.3 模块边界违规

```ts
// v0.2.x 的错误做法
// @ts-ignore
import { SyncEngine } from '../../loom-cloud/dist/sync-engine.js';
```

- **问题**: `loom` 包直接依赖 `loom-cloud` 的构建产物路径，ESM `require()` 导致运行时崩溃
- **0.3.0 做法**: 
  - `loom-core` 是纯类型+逻辑包，无外部依赖
  - `loom-cloud` 依赖 `loom-core`（通过 workspace protocol）
  - `loom-cli` 和 `loom-mcp` 依赖 `loom-core`，可选依赖 `loom-cloud`
  - 所有跨包引用通过 npm workspace 的 `import '@loom/core'` 解决

---

## 三、测试教训

### 3.1 测试直接修改私有字段

```ts
// v0.2.x sync-engine.test.ts
engine['_isSyncing'] = false;
engine['_index'] = { ... };
```

- **问题**: 测试与实现耦合过深，重构时测试先崩
- **0.3.0 做法**: 
  - 需要测试的状态通过公开 getter 暴露
  - 核心逻辑优先单元测试，集成测试次之

### 3.2 20+ 源文件无测试

| 无测试文件 | 风险等级 |
|-----------|---------|
| `fs-store-adapter.ts` | 🔴 高 — 存储层核心 |
| `lock.ts` | 🔴 高 — 并发安全 |
| `logger.ts` | 🟡 中 — 日志格式 |
| `mcp-registry.ts` | 🔴 高 — MCP 配置解析 |

**0.3.0 做法**: 每个 `.ts` 源文件必须有对应的 `.test.ts`。

---

## 四、架构设计教训

### 4.1 Monorepo 没有 Workspace 配置

v0.2.x 的 `packages/loom-cloud/` 是一个"幽灵包"——它有自己的 `package.json` 和 `tsconfig.json`，但根目录没有 `workspaces` 配置。

**0.3.0 做法**: 根 `package.json` 配置 `workspaces: ["packages/*"]`。

### 4.2 存储层没有抽象接口

v0.2.x 的 `store.ts` 直接操作文件系统，无法替换为远程存储。

**0.3.0 做法**: 定义 `StoreAdapter` 接口，实现 `FileSystemStoreAdapter`（默认）和 `MemoryStoreAdapter`（测试用）。

### 4.3 没有 Trash 机制

v0.2.x 的删除是硬删除，用户无法恢复误删的 Entry。

**0.3.0 做法**: 
- 删除操作改为移动到 `.loom/trash/`
- `loom trash list` 查看已删除
- `loom trash restore <id>` 恢复
- `loom trash purge` 永久清除

---

## 五、包依赖关系（0.3.0 目标）

```
┌─────────────────┐     ┌─────────────────┐
│   loom-vscode   │     │   loom-cloud    │
│   (extension)   │     │  (sync/license) │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │    ┌─────────────────┐│
         └───►│    loom-mcp     │◄┘
              │  (MCP server)   │
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              │    loom-cli     │
              │  (CLI runner)   │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │    loom-core    │
              │ (types/store/   │
              │  utils/prompt)  │
              └─────────────────┘
```

**依赖规则**:
- `loom-core` 不依赖任何其他 loom 包
- `loom-cli` 和 `loom-mcp` 依赖 `loom-core`
- `loom-cloud` 依赖 `loom-core`
- `loom-vscode` 不直接依赖 loom 包（通过 MCP 协议通信）
- 不允许循环依赖

---

*归档日期: 2026-04-18*
