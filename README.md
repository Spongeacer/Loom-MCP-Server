# LOOM

**AI Agent 的持久化上下文操作系统**

**语言**: **中文** | [English](README_EN.md) | [한국어](README_KO.md) | [Español](README_ES.md)

> **🎉 v0.3.0 已发布 — Monorepo 架构重构**：将核心代码拆分为 `@loom/core` / `@loom/cli` / `@loom/mcp` / `@loom/cloud` / `loom-vscode` 五个包，CLI 与 MCP 共用 `@loom/core` 业务逻辑层，52 个测试全量通过。

```bash
npm install -g loom-mcp
loom init "My Project"
loom status
```

---

## LOOM 是什么？

LOOM 是一个面向 Claude Code、Kimi Code 等 AI 编程 Agent 的**语义化上下文操作系统**。大多数 AI 助手在聊天会话结束后会丢失所有上下文。LOOM 通过在本地结构化知识库中持久化存储任务、决策、代码产物及其关系来解决这个问题。每次 Agent 开启新会话时，LOOM 都会注入一个紧凑且缓存优化的 Prompt，让 Agent 立刻知道你上次做到哪里了。

它不仅存储记忆，还能理解你的项目文件。LOOM 追踪文件新鲜度、构建 import 依赖图，并自动标记陈旧、孤立或冗余的代码。

---

## 为什么需要 LOOM？

### 问题：会话失忆（Session Amnesia）

当你关闭与 AI 编程助手的对话后，以下内容全部消失：
- 当前进行中的任务及进度
- 你刚刚确认的架构决策
- 你正在修改的文件
- 某些文件为什么相关

下次开始时，你必须重新解释一遍。对于一次性提问还好，但对于持续数天的重构或复杂功能开发来说，这非常累人。

### LOOM 的解决方案

LOOM 在会话之间持久化以下四个核心要素：

1. **任务与进度** — 你在做什么、已完成什么、被什么阻塞、下一步是什么
2. **决策** — 只要前提不变，就无需再次质疑的架构选择
3. **工作集（Working Set）** — 当前任务相关的文件和规则
4. **文件系统健康状态** — 哪些文件最新、哪些陈旧、哪些是孤立文件、谁依赖谁

当 Agent 启动时，LOOM 自动生成一个包含以上所有信息的结构化 Prompt。Agent 无需猜测，直接知晓。

---

## 安装

### 方式一：npm（最简单，推荐 ⭐）

```bash
git clone https://github.com/Spongeacer/Loom-MCP-Server.git
cd Loom-MCP-Server
npm install
npm run build
./loom init "My Project"
./loom status
```

如需注册 MCP Server，在支持的客户端配置中添加：

```json
{
  "mcpServers": {
    "loom": {
      "command": "node",
      "args": ["/path/to/Loom-MCP-Server/packages/loom-mcp/dist/server.js"]
    }
  }
}
```

> 💡 配置写入后，**请重启或 Reload Window** 你的 MCP 客户端以生效。

---

### 方式二：VS Code 扩展（一键零配置）

在 VS Code 扩展市场搜索并安装 **「LOOM MCP」** 扩展。

安装后扩展会自动：
1. 检测 `loom-mcp` 是否在环境中
2. 自动注册到 `kimi.mcpServers`（Kimi Code Extension）和 `mcpServers`（通用）
3. 在侧边栏展示 LOOM 上下文树

> 💡 安装扩展后，执行 `Developer: Reload Window` 即可生效。

---

### 方式三：一键脚本（自动配置 MCP）

脚本会优先尝试 `npm install -g loom-mcp`，失败时回退到源码构建。

#### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.sh | bash
```

#### Windows

```powershell
irm https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.ps1 | iex
```

安装脚本会自动完成：
1. 优先通过 npm 全局安装（无需本地构建）
2. 将 `loom` 和 `loom-mcp` 添加到 `PATH`
3. 检测并自动配置 **Kimi Code CLI / Extension**、**Claude Desktop** 等 MCP
4. 在当前目录自动初始化 LOOM 工作区

---

### 方式四：Homebrew（macOS / Linux）

> 目前 Formula 位于本仓库中，尚未合并到 Homebrew/core。
> ```bash
> brew install --formula ./Formula/loom-mcp.rb
> ```

---

## 快速开始

安装完成后，即可使用 `loom` 命令：

```bash
# 初始化工作区（首次使用）
loom init "My Project"

# 查看当前上下文（如果过时，还会自动运行文件系统扫描）
loom status

# 创建并激活一个任务
loom task create "Refactor auth middleware"
loom task set task-auth-refactor

# 检查文件健康状态和依赖关系
loom fs health
loom fs deps src/auth/middleware.ts

# 运行自检
loom doctor
```

这会暴露 19 个工具，包括 `loom_status`、`loom_expand`、`loom_fs_scan`、`loom_record_decision`、`loom_doctor` 和 `loom_ping`。

---

## 核心概念

### Entry：上下文的原子单位

LOOM 中的一切都是 **Entry（条目）**。共有 7 种类型：

| 类型 | 用途 |
|------|---------|
| **Rule** | 硬约束（例如"所有 JWT 认证必须走中间件"） |
| **Pattern** | 可复用的代码或设计模式 |
| **Memory** | 通用项目知识 |
| **Skill** | 可复用的能力描述 |
| **Artifact** | 文件、代码、配置——包含文件系统元数据 |
| **Task** | 活跃目标、进度和工作集 |
| **Decision** | 已记录的架构决策 |

每个 Entry 共享相同的基础 Schema：

```yaml
id: string
type: Rule | Memory | Skill | Pattern | Artifact | Task | Decision
version: number
namespace: project | user | auto | team | local

content:
  l1_5: string           # 微摘要，约 20 字
  l2: string             # 单行摘要，约 100 字
  l3: string | file:path # 完整内容或文件引用

lifecycle:
  state: draft | active | verified | stale | deprecated | archived | tombstone
  created: timestamp
  updated: timestamp
  last_accessed: timestamp
  last_activated: timestamp
  activation_count: number
  verification_count: number

quality:
  freshness: number      # [0,1]
  trust: number          # [0,1]
  activity: number       # [0,1]
  composite_score: number

trust:
  level: trusted | verified | derived | inferred | untrusted
  source: human | tool | model | import | pattern | external

activation:
  paths: string[]        # 激活该条目的文件路径
  keywords: string[]
  intents: string[]
  tools: string[]
  entry_refs: string[]

conflicts:
  supersedes: string[]
  conflicts_with: string[]
  overridden_by: string | null
  precedence: number
  resolution_policy: newest_wins | verified_wins | manual_wins | scoped_wins

bindings_out: { target, rel, conf }[]
bindings_in:  { source, rel, conf }[]
```

### Binding：连接组织

**Binding（绑定）**是两个 Entry 之间的持久化、带类型的关系。与简单标签不同，Binding 包含置信度分数、证据、衰减模型和失效追踪。

```yaml
source: string
target: string
relationship: governs | realized_in | depends_on | exemplifies | co_evolves | impacts | blocked_by
directionality: forward | bidirectional | inferred_reverse
status: active | weak | broken | superseded
confidence: number

confidence_model:
  base: number
  freshness_factor: number
  evidence_weight: number
  usage_boost: number
  drift_penalty: number

evidence:
  - type: path_match | import_scan | ast_pattern | lsp_reference | dialogue | test_pass | git_cochange | user_confirmed
    detail: string
    weight: number
    discovered: timestamp

decay:
  half_life_days: number
  last_reconfirmed: timestamp

invalidation:
  invalidated_by: string | null
  reason: string | null

verification_history:
  - date: timestamp
    method: ast_scan | lsp | import_scan | test_pass | user_confirm
    result: passed | weakened | failed | inconclusive
```

这意味着你可以询问 `loom why art-auth-middleware`，并得到精确的因果链：*"它在当前任务的工作集中，受 rule-auth-style 约束，且用户正在积极编辑它。"*

### Artifact：有智能的文件

LOOM 中的 Artifact 不仅仅是文件路径，它理解文件系统：

```yaml
artifact:
  path: string
  category: source_code | config | schema | migration | infra | docs
  file_type: string
  granularity: file | symbol | span | heading | config_key
  symbol: string | null
  span: { start_line, end_line }
  line_count: number
  git_tracked: boolean
  last_git_commit: string | null
  last_modifier: agent | user | both
  content_hash: string
  summary_hash: string

  # 文件系统感知
  fs:
    last_modified_at: ISO timestamp
    last_seen_at: ISO timestamp
    size_bytes: number
    exists: boolean

  deps:
    imports: string[]       # 该 Artifact 引入的文件
    imported_by: string[]   # 引入该 Artifact 的文件

  health:
    status: healthy | stale | orphan | legacy | redundant | missing
    score: 0..1
    reasons: string[]
    suggested_action: keep | archive | delete | review
```

---

## Slot-Based Prompt 编排

LOOM 不会把文本随意倾倒进上下文窗口。它生成一个按稳定性排序的结构化 XML Prompt，以最大化 LLM 的 KV-Cache 命中率。

```xml
<loom_context>
  <protocol>
    你拥有一个持久化语义记忆系统。
    如果某个 ↣id 可能重要但你不确定细节，请调用 loom_expand(id, level)。
    修改 artifact 前，优先查看 governance / risks / decisions。
    如果形成了稳定结论，可提议创建 Task / Decision / Rule / Memory。
  </protocol>

  <governance>
    ↣rule-auth-style: JWT+RBAC 认证必须统一走中间件
  </governance>

  <decisions>
    ↣decision-rbac-over-abac: 选择 RBAC，不选 ABAC
  </decisions>

  <dictionary>
    ↣pattern-error-envelope: 统一错误返回结构
    ↣task-auth-refactor: 重构认证中间件并保持测试通过
  </dictionary>

  <task id="task-auth-refactor" status="active">
    目标: 重构认证中间件并保持测试通过
    当前: 修复 middleware 中 RBAC 权限判定
    待决: 是否保留旧 session fallback
  </task>

  <working_set>
    ↣art-auth-middleware: src/auth/middleware.ts
    ↣art-auth-test: src/auth/middleware.test.ts
  </working_set>

  <risks>
    ↣art-auth-test: 用户修改后摘要尚未验证
  </risks>

  <recovery>
    上次中断点: 已完成中间件主体重构，下一步修复测试夹具
  </recovery>

  <recent_files>
    ↣art-auth-test: src/auth/middleware.test.ts (modified 2026/4/14)
  </recent_files>

  <fs_health>
    ↣art-legacy-adapter: src/auth/legacy_adapter.ts is legacy (action: review)
  </fs_health>
</loom_context>
```

### 为什么是这个顺序？

槽位按**最稳定到最易变**排序：

1. **静态层**（`protocol` → `governance` → `decisions` → `dictionary`）：变化极慢，放在最前面，可在多次会话中享受 LLM 前缀缓存复用。
2. **动态层**（`task` → `working_set` → `risks` → `recovery` → `recent_files` → `fs_health`）：每会话都可能变化，放在后面，避免击穿前面稳定前缀的缓存。

所有列表型槽位内部均按 `id` 字母序稳定排序，防止顺序抖动导致缓存失效。

### 预算意识

| 槽位 | 大约 Token 数 |
|------|----------------|
| protocol | 150-200 |
| governance | ~300 |
| decisions | ~200 |
| dictionary | 300-500 |
| task | ~200 |
| working_set | ~400 |
| risks | ~150 |
| recovery | ~150 |
| recent_files | ~150 |
| fs_health | ~150 |
| expanded (按需展开) | ~3000 |

固定槽位目标 1500-2100 token。总注入上下文应控制在模型上下文窗口的 8%-15% 以内。

---

## 文件系统感知

LOOM 不仅将项目文件理解为文本，而是将其视为一个活的系统。

### 核心能力

| 能力 | 说明 | 触发方式 |
|------------|-------------|---------|
| **新鲜度追踪** | 追踪每个 Artifact 的 `mtime`、`size_bytes`、`exists` | 自动 / `loom fs scan` |
| **依赖图构建** | 解析 JS/TS/Python/Go/Rust/Java 等语言的 import | 自动 / `loom fs deps <path>` |
| **健康分析** | 检测 stale、orphan、legacy、redundant、missing 文件 | 自动 / `loom fs health` |
| **垃圾清理** | 建议并执行归档到 `.loom/trash/` 或删除 | `loom fs trash` / `loom fs clean` |

### 自动触发机制

你无需记住手动运行扫描：

1. **执行 `loom status` 时** — 如果距离上次扫描已超过 5 分钟，LOOM 会在生成 Prompt 前自动执行一次轻量级文件系统扫描（元数据 + 依赖图 + 健康分析）。
2. **Watch Daemon flush 时** — 当守护进程处理完一批文件变更后，会自动触发增量扫描。

### 健康状态定义

| 状态 | 判定条件 | 建议动作 |
|--------|-----------|------------------|
| `healthy` | 正常活跃文件 | keep |
| `stale` | 超过 90 天未修改 | review |
| `orphan` | 没有任何 binding 或引用 | review |
| `legacy` | 文件名包含 old/backup/deprecated 等 | review |
| `redundant` | 内容 hash 与其他文件完全相同 | archive |
| `missing` | 磁盘上已不存在 | delete |

---

## 三层执行模型

LOOM 的核心设计理念是强烈的成本意识。

### Layer 1：预计算层（零 LLM 成本）

会话开始前运行：
- 加载所有 entries、bindings、WAL
- 重建 manifest 缓存、hot entries、working set cache
- 恢复活跃任务
- 执行文件系统扫描和健康分析
- 计算风险及 stale/dirty 标记

**目标：** 中小项目 < 100ms。

### Layer 2：Hook 层（极低成本）

文件写入/编辑后同步运行：
- 注册新 Artifact
- 创建低成本即时绑定（路径匹配、关键词匹配）
- 标记摘要为 stale
- 追加 WAL
- 触发 dirty-set 更新

**目标：** 每次 hook < 50ms。

### Layer 3：LLM 协议层（有 Token 成本，但受控）

由 LLM 决定：
- 是否展开 L2/L3 详情
- 下一步动作应该是什么
- 何时记录 Decision
- 何时提议新的 Rule/Memory/Pattern
- 某个风险是否需要验证

LLM 受 System Prompt 约束，通过 `loom_expand`、`loom_record_decision`、`loom_verify` 等工具进行交互。

---

## CLI 与 MCP 工具

### Shell CLI

| 命令 | 用途 |
|---------|---------|
| `./loom init <name>` | 初始化 `.loom/` 工作区 |
| `./loom status` | 显示 slot-based Prompt 上下文 |
| `./loom expand <id> [l2\|l3]` | 展开条目详情 |
| `./loom explain <id>` | 显示元数据和绑定关系 |
| `./loom why <id>` | 解释该条目与当前上下文的相关性 |
| `./loom task` | 列出所有任务 |
| `./loom task set <id>` | 激活任务 |
| `./loom task create <title>` | 创建新任务 |
| `./loom doctor` | 运行自检 |
| `./loom skill [list \| extract <task-id>]` | 管理提取的技能 |
| `./loom session [summary\|recent]` | 回顾近期会话活动 |
| `./loom diary [task-id] [--save]` | 为当前任务生成日报（默认预览） |
| `./loom watch [dirs...]` | 启动文件监听守护进程 |
| `./loom watch stop` | 停止监听 |
| `./loom fs scan [dirs...]` | 扫描文件、更新元数据、重建依赖图 |
| `./loom fs deps <path>` | 显示 import 和 imported-by |
| `./loom fs health` | 显示健康报告 |
| `./loom fs trash` | 列出建议清理的文件 |
| `./loom fs clean` | 归档/删除不健康文件 |

### MCP 工具

| 工具 | 用途 |
|------|---------|
| `loom_status` | 获取当前上下文 Prompt |
| `loom_read_prompt` | 直接从缓存读取 Prompt |
| `loom_expand` | 展开条目详情 |
| `loom_explain` | 解释条目元数据 |
| `loom_why` | 解释条目相关性 |
| `loom_session_recall` | 回顾近期会话活动 |
| `loom_diary_generate` | 为任务生成日报（需要 KIMI_API_KEY / OPENAI_API_KEY） |
| `loom_task_set` | 切换活跃任务 |
| `loom_task_create` | 创建新任务 |
| `loom_record_decision` | 记录架构决策 |
| `loom_skill_extract` | 从 Task 中提取可复用 Skill |
| `loom_watch_start` | 启动监听守护进程 |
| `loom_watch_stop` | 停止监听守护进程 |
| `loom_watch_status` | 检查监听状态 |
| `loom_doctor` | 运行自检 |
| `loom_fs_scan` | 触发文件系统扫描 |
| `loom_fs_deps` | 显示文件依赖关系 |
| `loom_fs_health` | 显示健康报告 |
| `loom_fs_trash` | 显示清理建议 |
| `loom_ping` | 快速健康检查 |

---

## 目录结构

```
.loom/                         # 真相源
├── entries/
│   ├── rules/
│   ├── memories/
│   ├── skills/
│   ├── patterns/
│   ├── artifacts/
│   ├── tasks/
│   └── decisions/
├── bindings/                  # *.yml 关系文件
├── events/
│   └── wal.jsonl              # 只追加事件日志
├── cache/
│   ├── active-prompt.txt      # 注入 Agent 会话
│   ├── manifest.yml
│   ├── binding-graph.json
│   ├── working-set.yml
│   ├── hot-entries.yml
│   ├── intent-map.yml
│   └── last-fs-scan.txt
├── sessions/
└── config.yml

packages/
├── loom-core/         # 核心库：类型、存储适配器、分析、WAL、prompt builder
│   ├── src/
│   │   ├── types/
│   │   ├── store/     # FS/Memory 适配器、Trash
│   │   ├── utils/     # fs-safe、yaml、lock、crypto、pid-file、shutdown
│   │   ├── commands/  # 共用业务逻辑层（doctor、session、skill、diary、fs）
│   │   ├── prompt/
│   │   └── __tests__/ # 35 tests
│   ├── package.json
│   └── tsconfig.json
├── loom-cli/          # 命令行界面（参数解析 + 文本格式化）
│   ├── src/
│   │   ├── cli.ts
│   │   └── commands/  # 6 tests
│   ├── bin/loom
│   └── bin/loom-mcp
├── loom-mcp/          # MCP Server（15+ tools via JSON-RPC）
│   ├── src/
│   │   ├── server.ts
│   │   ├── router.ts
│   │   └── tools/
│   ├── bin/loom-mcp
│   └── package.json
├── loom-cloud/        # 云同步、Ed25519 设备身份、License、冲突解决
│   ├── src/
│   │   ├── auth.ts
│   │   ├── sync-engine.ts
│   │   ├── conflict-resolver.ts
│   │   ├── license.ts
│   │   └── cloud-api.ts
│   └── __tests__/     # 11 tests
└── loom-vscode/       # VS Code 扩展
    ├── src/
    │   └── extension.ts
    └── package.json

root/
├── loom / loom-mcp          # 入口脚本
├── install.sh / install.ps1 # 一键安装
└── Formula/loom-mcp.rb      # Homebrew formula
```

**重要：** `.loom/` 是真相源。缓存文件可以从 entries + bindings + WAL 重建。

---

## 开发与测试

```bash
cd packages/loom

# 安装依赖
npm install

# 构建（TypeScript → dist/）
npm run build

# 运行测试（node --test）
npm test

# 运行代码检查
npx eslint src/
```

### 测试覆盖

当前代码库包含 **29 个测试套件、107 个通过用例**，覆盖：

- **核心模块**：`store`、`wal-queue`、`prompt-builder`、`dependency-graph`、`health-analyzer`、`binding-discovery`、`fs-tracker`、`fs-scan`、`dirty-tracker`、`session-recall`、`skill-extraction`、`user-profile`
- **CLI 命令**：`init`、`task`、`watch`、`doctor`、`fs`、`expand`、`explain`、`session`、`skill`、`why`、`diary`
- **MCP 集成**：`mcp-router`、`mcp-cache`、`mcp-utils`

### 近期质量改进

- 新增 `loom diary` 每日日报生成，支持通过环境变量调用外部 LLM（Kimi / OpenAI）
- 消除 WAL 队列在临时目录删除后的无限重试死循环（僵尸进程根因）
- 修复 `session-recall` tail-read 提前截断导致遗漏有效事件的问题
- 修复 `doctor` 对测试文件中的模拟数据产生假阳性 stale path 告警的问题
- 移除旧版本（SDP）遗留的死代码与未使用导出
- 初始化 ESLint + `typescript-eslint` 静态检查

---

## 设计原则

```yaml
P1_llm_is_the_engine:
  statement: "LLM 是理解与决策中心。"
  implication: "外部系统只提供数据和轻量自动化。"

P2_cost_aware:
  statement: "每个能力都必须明确时间成本和 token 成本。"
  implication: "能用路径匹配就不用 AST，能用 AST 就不用模型推理。"

P3_truth_is_distributed:
  statement: "Entries + Bindings + Event Log 是真相源。"
  implication: "Manifest 和 Cache 都是派生物，可以重建。"

P4_trust_is_earned:
  statement: "记忆不等于事实，所有条目与绑定都需要持续获得信任。"
  implication: "推断项、旧关系、外部内容必须降权并可失效。"

P5_task_over_reference:
  statement: "系统优先围绕当前任务组织上下文，而不是围绕一般相关性组织。"
  implication: "Task / Working Set / Decision 比纯 semantic match 更重要。"

P6_structured_context_over_text_dump:
  statement: "注入给模型的应该是职责化上下文，而不是文本堆砌。"
  implication: "采用 slot-based orchestration，而非简单 L1/L2/L3 拼接。"
```

---

## v0.2.0 更新摘要

### 架构升级
- **Store Transaction Layer**：新增 `withStoreTransaction` / `withStoreTransactionAsync`，保证多步写入的原子性与缓存一致性。
- **Commands 纯化**：所有 `commands/` 下的命令改为返回字符串的纯函数，彻底移除 `console.log` 和 `process.exit`，实现 CLI 与 MCP 的运行时隔离。
- **MCP 安全加固**：修复 `withLock` 永久锁泄漏、同进程异步锁塌陷、路径遍历漏洞，并增加 `SIGTERM/SIGINT` 优雅退出与 WAL drain。

### 清理与重构
- 移除 `captureStdout` monkey-patching、同步 `appendWal` 包装器、以及所有相关死代码。
- 移除已废弃的 Git-based lazy change detection 遗留逻辑（`syncDirtyFromGit`、`detectMtimeChanges` 等）。
- 清理从未被读取的缓存文件初始化（`manifest.yml`、`hot-entries.yml`、`binding-graph.json`、`intent-map.yml`）。
- 将 `ToolResult` 下沉到 `types/index.ts`，打破 `mcp-cache.ts` ↔ `mcp-router.ts` 的循环依赖。

---

## 路线图

### Phase 1：基础骨架
- WAL + entries + cache
- L1.5 微摘要
- Task / Decision
- Slot-based prompt
- `loom_expand`

### Phase 2：任务连续性与治理
- Working set cache
- Level 0 即时绑定
- Risks slot
- `loom status`, `loom explain`, `loom why`

### Phase 3：防腐化与验证
- Decay engine
- Verifier layer
- Binding invalidation
- `loom audit`, `loom verify`

### Phase 4：高精度增强
- AST / LSP 集成
- Symbol/span artifact
- Embedding 检索
- Co-evolution 分析

---

## 许可证

MIT
