# Agent 协作指南：SDP 集成

> **版本**: SDP v0.1.0  
> **目标用户**: Kimi Code / Claude Code / 其他支持 Tools / MCP 的 Agent

本项目已启用 **SDP（Semantic-Driven Persistence）** 持久协作记忆系统。

---

## 核心原则（每次会话必读）

1. **会话开始时，必须优先加载 SDP 上下文**。这是保证任务连续性的关键。
2. **当前上下文以 `.sdp/cache/active-prompt.txt` 为准**。它比你自己推断更可靠。
3. **如果看到 `↣id` 但不确定细节，主动展开**。使用 `sdp_expand` 或 `./sdp expand <id>`。
4. **修改 artifact 前，优先查看 governance / risks / decisions**。
5. **形成稳定结论后，主动提议记录 Decision 或更新 Task**。

---

## 会话开场标准动作（Kimi Code）

每次新会话开始时，请按以下顺序执行：

### 步骤 1：读取活跃上下文（零开销）

```
ReadFile: .sdp/cache/active-prompt.txt
```

如果该文件不存在，则初始化 SDP：

```
Shell: ./sdp init "Harness Explore"
```

**注意**：`active-prompt.txt` 的生成过程（`./sdp status`）会自动触发文件系统扫描（`fs scan`），更新文件元数据、重建依赖图、运行健康分析——前提是距离上次自动扫描已超过 5 分钟。因此你看到的 `recent_files` 和 `fs_health` 通常是准实时的。

### 步骤 2：确认 active task

如果上下文中有 `<task>`，确认你是否应继续该任务。
如果是，继续；如果用户明显切换了话题，调用：

```
Shell: ./sdp task create <新任务标题>
```

或：

```
Tool: sdp_task_create
```

---

## 快速命令参考

### Shell CLI（始终可用）

| 命令 | 用途 |
|------|------|
| `./sdp status` | 输出当前 slot-based prompt（同时刷新 active-prompt.txt） |
| `./sdp expand <id>` | 展开 Entry 的 L3 详情 |
| `./sdp explain <id>` | 查看 Entry 元数据、绑定、生命周期 |
| `./sdp why <id>` | 了解该 Entry 为何被注入上下文 |
| `./sdp task` | 列出所有任务 |
| `./sdp task set <id>` | 切换活跃任务 |
| `./sdp task create <title>` | 创建并激活新任务 |
| `./sdp watch [dirs...]` | 启动后台文件监听守护进程 |
| `./sdp watch stop` | 停止后台文件监听 |
| `./sdp watch status` | 查看文件监听状态 |
| `./sdp fs scan [dirs...]` | 扫描文件，更新元数据并重建依赖图 |
| `./sdp fs deps <path>` | 查看文件依赖关系 |
| `./sdp fs health` | 查看文件健康报告 |
| `./sdp fs trash` | 查看建议清理的文件 |
| `./sdp fs clean` | 将不健康文件归档到 `.sdp/trash/` 或删除 |

### MCP Tools（如已启用 MCP Server）

如果当前环境支持 MCP，优先使用 Tools：

| Tool | 用途 |
|------|------|
| `sdp_status` | 获取 slot-based prompt 上下文 |
| `sdp_read_prompt` | 直接从缓存读取预渲染 prompt |
| `sdp_expand` | 展开 Entry 详情 |
| `sdp_explain` | 解释 Entry 元数据 |
| `sdp_why` | 解释 Entry 相关性 |
| `sdp_task_set` | 切换任务 |
| `sdp_task_create` | 创建任务 |
| `sdp_record_decision` | 记录关键决策 |
| `sdp_watch_start` | 远程启动文件监听 |
| `sdp_watch_stop` | 远程停止文件监听 |
| `sdp_watch_status` | 查看监听状态 |
| `sdp_fs_scan` | 扫描文件系统、重建依赖图、运行健康分析 |
| `sdp_fs_deps` | 查询指定文件的 import / imported-by |
| `sdp_fs_health` | 获取文件健康报告 |
| `sdp_fs_trash` | 获取垃圾文件清理建议 |

---

## 上下文槽位说明

读取 `active-prompt.txt` 后，你会看到如下结构：

```xml
<sdp_context>
  <protocol> ... </protocol>
  <governance> ↣rule-xxx ... </governance>
  <decisions> ↣decision-xxx ... </decisions>
  <dictionary> ↣task-xxx / ↣art-xxx ... </dictionary>
  <task id="..." status="active"> ... </task>
  <working_set> ↣art-xxx ... </working_set>
  <risks> ... </risks>
  <recovery> ... </recovery>
</sdp_context>
```

**为什么是这个顺序？** 为了最大化 LLM 的 KV Cache / Prompt Cache 命中率：
- **静态层**（`protocol`、`governance`、`decisions`、`dictionary`）变化极慢，放在最前面，可以在多次会话中被长期缓存。
- **动态层**（`task`、`working_set`、`risks`、`recovery`）每会话都可能变化，放在后面，避免前面的稳定前缀因变动而失效。
- 所有列表槽位内部均按 `id` 字母序稳定排序，防止顺序抖动击穿缓存。

| 槽位 | 含义 | 变化频率 | 你的行动 |
|------|------|----------|----------|
| `protocol` | 你与 SDP 的协作规则 | 极低 | 遵守 |
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

SDP 可以后台监听文件变化，自动注册 Artifact 和生成 Binding。

### 启动方式

通过 Shell：
```bash
./sdp watch src tests
```

通过 MCP Tool（如支持）：
```
Tool: sdp_watch_start
args: { "dirs": ["src", "tests"] }
```

### 守护进程行为

- 监听 `src/`、`tests/` 下的文件增删改
- 自动为新文件创建 `Artifact` entry
- 根据已有 Entry 的 `activation.paths` 自动生成 **Level 0 Binding**
- 忽略 `.sdp/`、`node_modules/`、`dist/`、隐藏文件

---

## 决策记录规范

当你和用户在对话中达成一个**稳定的架构/设计选择**时，主动提议记录：

> "我已经将本次选择记录为 Decision：`decision-xxx`。后续会话会自动携带它，避免重复讨论。"

记录方式：
```bash
./sdp record-decision  # 暂通过 MCP Tool 或手动编辑 entry
```

或通过 MCP：
```
Tool: sdp_record_decision
args: {
  "question": "...",
  "chosen": "...",
  "rationale": "...",
  "impact_scope": ["..."]
}
```

---

## 数据存储

所有语义数据位于 `.sdp/` 目录：

```
.sdp/
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

**注意**：`.sdp/` 是真相源，请勿随意删除。

---

## 故障排查

### `SDP not initialized`
运行 `./sdp init <project-name>`

### active-prompt.txt 为空或过时
运行 `./sdp status` 重新生成。

### watch daemon 异常
```bash
./sdp watch stop
./sdp watch src tests
```

### 某个 Entry 找不到
```bash
./sdp explain <id>
```

---

## MCP Server 配置（高级）

如需在 Kimi Code 中持久化注册 SDP MCP Server：

```json
{
  "mcpServers": {
    "sdp": {
      "command": "node",
      "args": [
        "/absolute/path/to/Harness Explore/packages/sdp/dist/mcp.js"
      ]
    }
  }
}
```

快捷入口：
```bash
./sdp-mcp
```
