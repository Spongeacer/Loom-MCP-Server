# LOOM：语义驱动的持久协作操作系统

# 第一部分：定位

## 1.1 设计定位

LOOM v0.1 是一个面向 Claude Code / Agent Harness 的**任务中心型持久协作操作系统**。

它不是传统意义上的“记忆库”，也不是单纯的“代码知识图谱”，而是一个同时管理：

- **知识**
- **产物**
- **绑定**
- **任务**
- **决策**
- **生命周期**
- **可信度**
- **上下文编排**

的长期协作系统。

---

## 1.2 在方案 2 基础上的三项增强

相比原始方案 2，v0.1重点吸收了另外两个方案的三个优点：

### 增强 A：补强数据模型完备性
吸收方案 1：

- lifecycle 更完整
- trust_level 更明确
- conflict / override 更正式
- artifact 支持 symbol/span 粒度
- verifier layer 更完整

### 增强 B：补强任务编排表达
吸收方案 3：

- slot-based orchestration 的展示更清晰
- active context 的 prompt 结构更清楚
- 更适合作为 Claude 的 system prompt 片段

### 增强 C：补强开发路线与治理接口
吸收方案 1 + 3：

- Working Set Cache 显式化
- Decision 进入核心工作流
- .loom explain / why / verify / audit 形成最小治理闭环

---

# 第二部分：不可违反的架构原则

保留方案 2 的四条原则，同时做增强。

```yaml
principles:
  P1_llm_is_the_engine:
    statement: "LLM 是理解与决策中心，外部系统只做数据服务与轻量自动化"
    implication: "不在外部实现重型语义编排器，用协议 + 工具驱动 LLM"

  P2_cost_aware:
    statement: "每个能力都必须明确时间成本与 token 成本"
    implication: "能用路径匹配就不用 AST，能用 AST 就不用模型推理"

  P3_truth_is_distributed:
    statement: "Entries + Bindings + Event Log 是真相源，Manifest/Cache 都是派生物"
    implication: "中心索引可重建，不把单文件 manifest 当作唯一真相"

  P4_trust_is_earned:
    statement: "记忆不等于事实，所有条目与绑定都需要持续获得信任"
    implication: "推断项、旧关系、外部内容必须降权并可失效"

  P5_task_over_reference:
    statement: "系统优先围绕当前任务组织上下文，而不是围绕一般相关性组织"
    implication: "Task/Working Set/Decision 比纯 semantic match 更重要"

  P6_structured_context_over_text_dump:
    statement: "注入给模型的应该是职责化上下文，而不是文本堆砌"
    implication: "采用 slot-based orchestration，而非简单 L1/L2/L3 拼接"
```

---

# 第三部分：三层执行模型（保留方案 2 主干）

这一部分基本保留方案 2，因为它是整个架构最强的地方。

---

## 3.1 Layer 1：预计算层

职责：

- 加载 entries / bindings / WAL
- 生成 manifest cache
- 生成 hot entries
- 恢复 active task
- 构建 working set cache
- 计算风险条目
- 预算估算
- 标记 stale / dirty 对象

特点：

- 零 LLM 成本
- 会话开始前运行
- 偏批处理 / 预处理
- 目标：<100ms（小中型项目）

---

## 3.2 Layer 2：Hook 层

职责：

- Write/Edit 后注册 Artifact
- 低成本即时绑定
- 更新摘要失效标记
- 追加事件日志
- 触发 dirty-set 更新

特点：

- 极低成本
- 同步可完成
- 不做重型语义分析
- 目标：<50ms 每次 Hook

---

## 3.3 Layer 3：LLM 协议层

职责：

- 决定是否展开 L2/L3
- 判断当前任务和下一步动作
- 判断何时记录 Decision
- 判断何时提议新 Rule/Memory/Pattern
- 判断遇到风险信息时是否需要验证

特点：

- 只做语义理解与协作决策
- 通过 System Prompt 协议约束
- 借助 `loom_expand`, `loom_update_task`, `loom_record_decision`, `loom_verify` 等工具完成交互

---

# 第四部分：统一数据模型（吸收方案 1 优点）

---

## 4.1 Entry 类型体系

```yaml
EntryType:
  - Rule
  - Memory
  - Skill
  - Pattern
  - Artifact
  - Task
  - Decision
```

---

## 4.2 统一基类 Schema

这是对方案 2 的增强版基类：

```yaml
id: string
type: Rule | Memory | Skill | Pattern | Artifact | Task | Decision
version: number
namespace: project | user | auto | team | local

content:
  l1_5: string                # 微摘要，≤20~30字
  l2: string                  # 单行摘要，≤100字
  l3: string | file:path      # 完整内容或文件引用

lifecycle:
  state: draft | active | verified | stale | deprecated | archived | tombstone
  created: timestamp
  updated: timestamp
  last_accessed: timestamp
  last_activated: timestamp
  activation_count: number
  verification_count: number
  promoted_from: string | null
  demotion_reason: string | null

quality:
  freshness: number           # 时效性 [0,1]
  trust: number               # 可信度 [0,1]
  activity: number            # 活跃度 [0,1]
  composite_score: number

trust:
  level: trusted | verified | derived | inferred | untrusted
  source: human | tool | model | import | pattern | external

activation:
  paths: string[]
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

bindings_out:
  - target: string
    rel: string
    conf: number

bindings_in:
  - source: string
    rel: string
    conf: number
```

---

## 4.3 Artifact 增强字段

这里吸收方案 1 的“语义单元粒度”优势。

```yaml
artifact:
  path: string
  category: source_code | config | schema | migration | infra | docs
  file_type: string
  granularity: file | symbol | span | heading | config_key
  symbol: string | null
  span:
    start_line: number | null
    end_line: number | null
  line_count: number
  git_tracked: boolean
  last_git_commit: string | null
  last_modifier: agent | user | both
  content_hash: string
  summary_hash: string

  # 文件系统感知（Filesystem Awareness）
  fs:
    last_modified_at: ISO timestamp
    last_seen_at: ISO timestamp
    size_bytes: number
    exists: boolean

  deps:
    imports: string[]        # 该文件 import/require 的相对路径
    imported_by: string[]    # 哪些文件 import 了它

  health:
    status: healthy | stale | orphan | legacy | redundant | missing
    score: 0..1
    reasons: string[]
    suggested_action: keep | archive | delete | review
```

### 为什么要保留 granularity
因为 v0.1不应该永远只绑定到“整个文件”。  
至少要为未来的：

- function / class 级绑定
- config key path 级绑定
- 文档 heading 级绑定

预留能力。

---

## 4.4 Task 扩展字段

保留方案 2，同时吸收方案 1 的 working_set / unresolved_questions / acceptance_criteria 强表达。

```yaml
task:
  title: string
  status: open | active | blocked | done | abandoned
  intent: bugfix | feature | refactor | analysis | docs | ops
  priority: low | medium | high | critical

  working_set: string[]
  related_entries: string[]
  acceptance_criteria: string[]
  unresolved_questions: string[]

  progress:
    completed: string[]
    current: string | null
    next: string | null
    blocked_by: string | null

  started_in: string
  last_touched: string
```

---

## 4.5 Decision 扩展字段

保留方案 2，并增加 assumptions / impact_scope。

```yaml
decision:
  question: string
  chosen: string
  rationale: string
  rejected:
    - option: string
      reason: string
  assumptions: string[]
  impact_scope: string[]
  supersedes: string | null
  made_in: string
```

---

## 4.6 Binding 详情模型

保留方案 2 的独立 Binding 文件设计，但吸收方案 1 的治理能力。

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

---

# 第五部分：存储架构（保留方案 2，吸收方案 3 的可读性）

---

## 5.1 真相源

```text
1. entries/**/*.loom.yml
2. bindings/*.yml
3. events/wal.jsonl
```

---

## 5.2 派生索引

```text
1. cache/manifest.yml
2. cache/binding-graph.json
3. cache/intent-map.yml
4. cache/working-set.yml
5. cache/hot-entries.yml
```

---

## 5.3 目录结构

```text
.claude.loom/
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
│   ├── manifest.yml
│   ├── hot-entries.yml
│   ├── binding-graph.json
│   ├── working-set.yml
│   └── intent-map.yml
├── sessions/
└── config.yml
```

---

# 第六部分：上下文编排（重点吸收方案 3）

方案 2 原本已经有 slot-based 的雏形，但这里我们把它变得更适合 Claude / Agent Harness。

---

## 6.1 Prompt 槽位结构

```xml
<loom_context>
  <protocol>
    你拥有持久语义协作记忆系统。
    如果某个 ↣id 可能重要但你不确定细节，必须调用 loom_expand(id, level)。
    修改 artifact 前，优先查看其 governance / risks / decisions。
    如果形成稳定结论，可提议创建 Task / Decision / Rule / Memory。
  </protocol>

  <governance>
    ↣rule-auth-style: JWT+RBAC 认证必须统一走中间件
    ↣rule-test-real-db: 测试必须连接真实数据库
  </governance>

  <decisions>
    ↣decision-rbac-over-abac: 选择 RBAC，不选 ABAC
  </decisions>

  <dictionary>
    ↣pattern-error-envelope: 统一错误返回结构
    ↣rule-auth-style: JWT+RBAC 认证必须统一走中间件
    ↣rule-test-fixture: fixture 需最小共享状态
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
    ↣bind-rule-auth-art-auth-test: 绑定置信度降至 0.42
  </risks>

  <recovery>
    上次中断点: 已完成中间件主体重构，下一步修复测试夹具
  </recovery>

  <recent_files>
    ↣art-auth-test: src/auth/middleware.test.ts (modified 2026/4/14)
  </recent_files>

  <fs_health>
    ↣art-legacy-adapter: src/auth/legacy_adapter.ts is legacy (action: review) — Filename contains legacy/deprecated keyword
  </fs_health>
</loom_context>
```

### 槽位顺序设计原则（KV Cache 优化）

Prompt 槽位按**内容稳定性**从高到低排列：

1. **静态层**（`protocol` → `governance` → `decisions` → `dictionary`）：变化极慢，放在最前面，可在多次会话中享受 LLM 的前缀缓存（Prompt Cache / KV Cache）复用。
2. **动态层**（`task` → `working_set` → `risks` → `recovery`）：每会话都可能变化，放在后面，避免击穿前面稳定前缀的缓存。
3. **稳定排序**：所有列表型槽位（governance、decisions、dictionary、working_set 等）内部均按 `id` 字母序排序，防止条目顺序随机抖动导致缓存失效。

---

## 6.2 槽位定义

保留方案 2 的预算意识，同时吸收方案 1 的职责划分：

| Slot | 内容 | 预算 |
|------|------|------|
| protocol | LOOM 协议规则 | ~150-200 |
| governance | 硬规则/偏好 | ~300 |
| active task | 当前任务 | ~200 |
| working set | 当前工作集 | ~400 |
| decisions | 已有决策 | ~200 |
| risks | 风险与低置信信息 | ~150 |
| recovery | 上次中断点/摘要 | ~150 |
| dictionary | 可导航微摘要 | ~300-500 |
| recent_files | 最近修改的文件（Top N） | ~150 |
| fs_health | 文件健康异常摘要 | ~150 |
| expanded | 按需展开 L2/L3 | ~3000 |

### 建议总预算
- 固定槽位：1500~2100
- 动态展开：~3000
- 总上限：不超过总上下文的 8%~15%

### Cache 意识
由于静态层（protocol + governance + decisions + dictionary）通常占固定槽位的 60% 以上，且跨会话高度稳定，实际推理时这部分 token 往往可以 **100% 命中前缀缓存**，显著降低首 token 延迟（TTFT）和计算成本。

---

## 6.3 文件系统感知槽位（Filesystem Awareness）

LOOM 不仅管理语义记忆，也直接理解**项目文件系统的真实状态**。Prompt 中新增两个动态槽位：

- `<recent_files>` — 最近修改的 N 个文件（按 `mtime` 排序）
- `<fs_health>` — 健康状态异常的文件（missing / orphan / legacy / stale / redundant）

### 核心能力

| 能力 | 说明 | 对应命令 |
|------|------|----------|
| **Freshness Tracking** | 记录每个 Artifact 的 `last_modified_at`、`size_bytes`、`exists` | 自动触发 / .loom fs scan` |
| **Dependency Graph** | 通过静态解析 import/require/include，构建文件级依赖图 | 自动触发 / .loom fs deps <path>` |
| **Health Analysis** | 检测 stale（长期未改）、orphan（无人引用）、legacy（命名含 old/deprecated）、redundant（内容重复）、missing（已删除） | 自动触发 / .loom fs health` |
| **Trash & Clean** | 生成清理建议，并可一键归档到 `.loom/trash/` 或删除 | .loom fs trash` / .loom fs clean` |

### 自动触发机制

文件系统感知能力**默认自动运行**，无需手动调用：

1. **每次 .loom status` 生成 Prompt 时** — 如果距离上次完整 `fs scan` 超过 **5 分钟**，会自动在后台执行一次轻量扫描（更新元数据 + 依赖图 + 健康分析）。这意味着 Agent 每次会话开始时看到的 `recent_files` 和 `fs_health` 都是最新的。
2. **Watch Daemon 批处理文件变化后** — 当守护进程处理完一批文件增删改（flush），会自动触发一次增量 scan，确保新文件立即被分析依赖关系和健康状态。

### 健康状态定义

| 状态 | 判定条件 | 建议动作 |
|------|----------|----------|
| `healthy` | 正常活跃文件 | keep |
| `stale` | 超过 90 天未修改 | review |
| `orphan` | 没有任何 binding 或 entry 引用 | review |
| `legacy` | 文件名包含 old/backup/deprecated 等 | review |
| `redundant` | 内容 hash 与其他文件完全相同 | archive |
| `missing` | 磁盘上已不存在 | delete |

### 为什么放在 Prompt 里
当 Agent 看到 `<fs_health>` 中提示 `↣art-xxx: src/utils/helper.ts is orphan` 时，它可以在后续行动中：
1. 验证该文件是否确实无用
2. 与用户确认后执行 .loom fs clean` 进行归档
3. 避免项目长期积累“技术债务文件”

---

# 第七部分：绑定发现与防腐化（融合两案）

---

## 7.1 分级绑定策略

### Level 0：即时绑定
- path match
- keyword match
- import scan
- config path match

### Level 1：延迟验证
- AST 分析
- LSP reference
- symbol dependency
- test relation check

### Level 2：深度审计
- 模型推理
- git co-evolution
- cross-file semantic inference
- human confirmation

---

## 7.2 衰减公式

```typescript
effectiveConfidence =
  baseConfidence *
  freshnessFactor *
  evidenceWeight *
  usageBoost -
  driftPenalty
```

---

## 7.3 建议半衰期

| 证据类型 | 半衰期 |
|---|---|
| dialogue inference | 14d |
| path match | 30d |
| import scan | 60d |
| AST/LSP | 90d |
| test evidence | 120d |
| human confirmed | 365d |

---

## 7.4 Binding 状态阈值

| 状态 | 阈值 |
|---|---|
| active | > 0.5 |
| weak | 0.3 - 0.5 |
| broken | < 0.3 |

---

# 第八部分：Working Set Cache（吸收方案 1）

方案 2 原来有 task，但 working set cache 还不够显式，这里增强。

```yaml
working_set:
  active_task: task-auth-refactor
  pinned_entries:
    - rule-auth-style
    - art-auth-middleware
  hot_entries:
    - art-auth-test
    - decision-rbac-over-abac
  recently_expanded:
    - pattern-error-envelope
  blocked_entries:
    - legacy-session-adapter
```

### 作用
- 保持任务内连续性
- 降低重复检索成本
- 让“刚刚确认过的东西”持续可见
- 让系统更像协作工作台，而不是纯检索器

---

# 第九部分：Verifier Layer（重点增强）

这部分是方案 2 原版里应该加强的地方。

---

## 9.1 Verifier 接口

```typescript
interface Verifier {
  canVerify(subject): boolean
  verify(subject): VerificationResult
}
```

---

## 9.2 结果结构

```yaml
verification:
  status: passed | weakened | failed | inconclusive
  score_delta: number
  checked_at: timestamp
  method: ast_match | import_scan | git_diff | test_pass | human_confirm | lsp_reference
  notes: string
```

---

## 9.3 Verifier 类型

- RuleVerifier
- ArtifactVerifier
- BindingVerifier
- MemoryVerifier
- TaskVerifier
- DecisionVerifier

---

# 第十部分：最小治理接口（融合方案 1/3）

必须补足 observability。

---

## 10.1 CLI / Tool 能力

```text
.loom status
.loom explain <id>
.loom why <id>
.loom verify <id|binding>
.loom audit
.loom task
.loom pin <id>
.loom untrust <id>
.loom rebuild
```

---

## 10.2 示例

### `.loom why art-auth-middleware`

```text
Injected because:
- it is in current task working_set
- it is governed by ↣rule-auth-style
- user is actively editing src/auth/middleware.ts
- related decision ↣decision-rbac-over-abac is active
```

---

# 第十一部分：实施路线图（保留方案 2，略增强）

---

## Phase 1：基础骨架
- WAL + entries + cache
- L1.5 微摘要
- Task / Decision
- slot-based prompt
- `loom_expand`

## Phase 2：任务连续性与治理
- working set cache
- Level 0 即时绑定
- risks slot
- `.loom status`, `.loom explain`, `.loom why`

## Phase 3：防腐化与验证
- decay engine
- verifier layer
- binding invalidation
- `.loom audit`, `.loom verify`

## Phase 4：高精度增强
- AST / LSP
- symbol/span artifact
- embedding retrieval
- co-evolution analysis

---

# 第十二部分：最终优先级

如果只做 3 件事：

### P0-1：Task + Decision + Working Set
让系统真正具备“连续工作能力”。

### P0-2：L1.5 + Slot-Based Prompt
让模型真正能用这些记忆。

### P0-3：Binding Decay + Verifier
让系统长期不腐化。

---

# 最终结论

**LOOM v0.1** 延续了方案 2 最重要的优点：

- 三层执行模型清晰
- 成本意识强
- 存储架构可落地
- 阶段性实施合理

同时吸收了方案 1 和方案 3 的关键优势：

- 更完整的生命周期 / trust / conflict / verifier 模型
- 更强的 Task / Decision / Working Set 表达
- 更适合 Claude 的 slot-based prompt 编排

---

如果你愿意，我下一步可以直接继续帮你做两件非常实用的事之一：

1. **把这个 LOOM v0.1 方案整理成正式 ADR / RFC 文档格式**  
2. **直接把它拆成工程实现清单（目录结构 + 接口 + 数据结构 + hooks + prompt builder + CLI）**

如果是要准备开工，我建议我下一步直接给你出 **“工程实现清单版”**。