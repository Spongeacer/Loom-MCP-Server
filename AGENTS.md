# Agent 协作指南：LOOM 集成

> **版本**: LOOM v0.1.0  
> **目标用户**: Kimi Code / Claude Code / 其他支持 Tools / MCP 的 Agent

本项目已启用 **LOOM** 持久协作记忆系统。

---

## 核心原则（每次会话必读）

1. **会话开始时，必须优先加载 LOOM 上下文**。这是保证任务连续性的关键。
2. **当前上下文以 `.loom/cache/active-prompt.txt` 为准**。它比你自己推断更可靠。
3. **如果看到 `↣id` 但不确定细节，主动展开**。使用 `loom_expand` 或 `..loom expand <id>`。
4. **修改 artifact 前，优先查看 governance / risks / decisions**。
5. **形成稳定结论后，主动提议记录 Decision 或更新 Task**。

---

## 会话开场标准动作（Kimi Code）

每次新会话开始时，请按以下顺序执行：

### 步骤 1：读取活跃上下文（零开销）

```
ReadFile: .loom/cache/active-prompt.txt
```

如果该文件不存在，则初始化 LOOM：

```
Shell: ..loom init "Harness Explore"
```

**注意**：`active-prompt.txt` 的生成过程（`..loom status`）会自动触发文件系统扫描（`fs scan`），更新文件元数据、重建依赖图、运行健康分析——前提是距离上次自动扫描已超过 5 分钟。因此你看到的 `recent_files` 和 `fs_health` 通常是准实时的。

### 步骤 2：确认 active task

如果上下文中有 `<task>`，确认你是否应继续该任务。
如果是，继续；如果用户明显切换了话题，调用：

```
Shell: ..loom task create <新任务标题>
```

或：

```
Tool: loom_task_create
```

---

## 快速命令参考

### Shell CLI（始终可用）

| 命令 | 用途 |
|------|------|
| `..loom status` | 输出当前 slot-based prompt（同时刷新 active-prompt.txt） |
| `..loom expand <id>` | 展开 Entry 的 L3 详情 |
| `..loom explain <id>` | 查看 Entry 元数据、绑定、生命周期 |
| `..loom why <id>` | 了解该 Entry 为何被注入上下文 |
| `..loom task` | 列出所有任务 |
| `..loom task set <id>` | 切换活跃任务 |
| `..loom task create <title>` | 创建并激活新任务 |
| `..loom watch [dirs...]` | 启动后台文件监听守护进程 |
| `..loom watch stop` | 停止后台文件监听 |
| `..loom watch status` | 查看文件监听状态 |
| `..loom fs scan [dirs...]` | 扫描文件，更新元数据并重建依赖图 |
| `..loom fs deps <path>` | 查看文件依赖关系 |
| `..loom fs health` | 查看文件健康报告 |
| `..loom fs trash` | 查看建议清理的文件 |
| `..loom fs clean` | 将不健康文件归档到 `.loom/trash/` 或删除 |

### MCP Tools（如已启用 MCP Server）

如果当前环境支持 MCP，优先使用 Tools：

| Tool | 用途 |
|------|------|
| `loom_status` | 获取 slot-based prompt 上下文 |
| `loom_read_prompt` | 直接从缓存读取预渲染 prompt |
| `loom_expand` | 展开 Entry 详情 |
| `loom_explain` | 解释 Entry 元数据 |
| `loom_why` | 解释 Entry 相关性 |
| `loom_task_set` | 切换任务 |
| `loom_task_create` | 创建任务 |
| `loom_record_decision` | 记录关键决策 |
| `loom_watch_start` | 远程启动文件监听 |
| `loom_watch_stop` | 远程停止文件监听 |
| `loom_watch_status` | 查看监听状态 |
| `loom_fs_scan` | 扫描文件系统、重建依赖图、运行健康分析 |
| `loom_fs_deps` | 查询指定文件的 import / imported-by |
| `loom_fs_health` | 获取文件健康报告 |
| `loom_fs_trash` | 获取垃圾文件清理建议 |

---

## 上下文槽位说明

读取 `active-prompt.txt` 后，你会看到如下结构：

```xml
<loom_context>
  <protocol> ... </protocol>
  <governance> ↣rule-xxx ... </governance>
  <decisions> ↣decision-xxx ... </decisions>
  <dictionary> ↣task-xxx / ↣art-xxx ... </dictionary>
  <task id="..." status="active"> ... </task>
  <working_set> ↣art-xxx ... </working_set>
  <risks> ... </risks>
  <recovery> ... </recovery>
</loom_context>
```

**为什么是这个顺序？** 为了最大化 LLM 的 KV Cache / Prompt Cache 命中率：
- **静态层**（`protocol`、`governance`、`decisions`、`dictionary`）变化极慢，放在最前面，可以在多次会话中被长期缓存。
- **动态层**（`task`、`working_set`、`risks`、`recovery`）每会话都可能变化，放在后面，避免前面的稳定前缀因变动而失效。
- 所有列表槽位内部均按 `id` 字母序稳定排序，防止顺序抖动击穿缓存。

| 槽位 | 含义 | 变化频率 | 你的行动 |
|------|------|----------|----------|
| `protocol` | 你与 LOOM 的协作规则 | 极低 | 遵守 |
| `governance` | 硬规则/项目规范 | 低 | 修改相关文件前必须对照 |
| `decisions` | 已记录的决策 | 低 | 不要重复质疑，除非前提改变 |
| `dictionary` | 可导航的微摘要 | 中（增长型） | 不知道某个 id 是什么时，先看这里 |
| `task` | 当前活跃任务 | 高 | 围绕它组织行动 |
| `working_set` | 当前工作集 | 高 | 这些是你最可能修改的文件 |
| `risks` | 风险/低置信信息 | 高 | 修改前需额外谨慎 |
| `recovery` | 上次中断点 | 高 | 从这里继续 |
| `recent_files` | 最近修改的文件 | 高 | 了解当前活跃代码 |
| `fs_health` | 文件健康风险 | 高 |  unhealthy/orphan/legacy 文件需关注 |

---

## 文件自动跟踪（Background Watch）

LOOM 可以后台监听文件变化，自动注册 Artifact 和生成 Binding。

### 启动方式

通过 Shell：
```bash
..loom watch src tests
```

通过 MCP Tool（如支持）：
```
Tool: loom_watch_start
args: { "dirs": ["src", "tests"] }
```

### 守护进程行为

- 监听 `src/`、`tests/` 下的文件增删改
- 自动为新文件创建 `Artifact` entry
- 根据已有 Entry 的 `activation.paths` 自动生成 **Level 0 Binding**
- 忽略 `.loom/`、`node_modules/`、`dist/`、隐藏文件

---

## 决策记录规范

当你和用户在对话中达成一个**稳定的架构/设计选择**时，主动提议记录：

> "我已经将本次选择记录为 Decision：`decision-xxx`。后续会话会自动携带它，避免重复讨论。"

记录方式：
```bash
..loom record-decision  # 暂通过 MCP Tool 或手动编辑 entry
```

或通过 MCP：
```
Tool: loom_record_decision
args: {
  "question": "...",
  "chosen": "...",
  "rationale": "...",
  "impact_scope": ["..."]
}
```

---

## 数据存储

所有语义数据位于 `.loom/` 目录：

```
.loom/
├── entries/           # 7 种 Entry 类型
│   ├── rules/
│   ├── memories/
│   ├── skills/
│   ├── patterns/
│   ├── artifacts/
│   ├── tasks/
│   └── decisions/
├── bindings/          # 关系绑定文件 (*.yml)
├── events/
│   └── wal.jsonl      # 只追加的事件日志
└── cache/
    ├── active-prompt.txt    # ← 你每次应读的文件
    ├── working-set.yml
    ├── hot-entries.yml
    ├── manifest.yml
    ├── binding-graph.json
    ├── intent-map.yml
    ├── watch-pid.txt          # 文件监听守护进程 PID
    └── watch-dirs.txt         # 当前监听的目录
```

**注意**：`.loom/` 是真相源，请勿随意删除。

---

## 故障排查

### `LOOM not initialized`
运行 `..loom init <project-name>`

### active-prompt.txt 为空或过时
运行 `..loom status` 重新生成。

### watch daemon 异常
```bash
..loom watch stop
..loom watch src tests
```

### 某个 Entry 找不到
```bash
..loom explain <id>
```

---

## MCP Server 配置（高级）

如需在 Kimi Code 中持久化注册 LOOM MCP Server：

```json
{
  "mcpServers": {
    .loom": {
      "command": "node",
      "args": [
        "/absolute/path/to/Harness Explore/packages.loom/dist/mcp.js"
      ]
    }
  }
}
```

快捷入口：
```bash
./loom-mcp
```
