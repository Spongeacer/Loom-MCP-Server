# LOOM

**AI 에이전트를 위한 지속적 컨텍스트 운영체제**

**언어**: [中文](README.md) | [English](README_EN.md) | **한국어** | [Español](README_ES.md)

```bash
npm install -g loom-mcp
loom init "My Project"
loom status
```

---

## LOOM이란?

LOOM은 Claude Code, Kimi Code와 같은 AI 코딩 에이전트를 위해 설계된 **의미 기반 컨텍스트 운영체제**입니다. 기존의 대부분 AI 코딩 어시스턴트는 채팅 세션이 종료되면 모든 컨텍스트를 잃어버립니다. LOOM은 작업, 결정, 코드 아티팩트, 그리고 이들 간의 관계를 구조화된 로컬 지식 기반에 지속적으로 저장함으로써 이 문제를 해결합니다. 에이전트가 새로운 세션을 시작할 때마다 LOOM은 캐시에 최적화된 컴팩트한 프롬프트를 주입하여, 사용자가 이전에 어디까지 진행했는지 정확히 알 수 있도록 합니다.

LOOM은 단순히 기억을 저장하는 것에 그치지 않고 프로젝트의 파일을 이해합니다. 파일의 최신 상태를 추적하고, import 의존성 그래프를 구축하며, 오래되었거나 고아가 된, 혹은 중복된 코드를 자동으로 감지합니다.

---

## 왜 LOOM인가?

### 문제: 세션 기억 상실(Session Amnesia)

AI 코딩 어시스턴트와의 채팅을 종료하면 다음과 같은 모든 것이 사라집니다:
- 진행 중이던 작업과 그 진행 상황
- 방금 합의한 아키텍처 결정
- 어떤 파일들을 작업하고 있었는지
- 특정 파일들이 왜 관련이 있었는지

다음에 다시 시작할 때 모든 것을 다시 설명해야 합니다. 한 번의 질문에는 괜찮을지 몰라도, 며칠에 걸친 리팩토링이나 복잡한 기능 개발에서는 매우 비효율적입니다.

### LOOM의 해결책

LOOM은 세션 간에 다음 4가지 핵심 요소를 지속적으로 유지합니다:

1. **작업 및 진행 상황** — 무엇을 하고 있는지, 완료된 것, 차단된 것, 다음 단계
2. **결정** — 전제가 바뀌지 않는 한 다시 논의되지 않아야 할 아키텍처 선택
3. **작업 집합(Working Set)** — 현재 작업과 관련된 파일과 규칙
4. **파일 시스템 상태** — 어떤 파일이 최신인지, 오래된 것인지, 고아 파일인지, 무엇이 무엇에 의존하는지

에이전트가 시작될 때 LOOM은 이 모든 것을 포함하는 구조화된 프롬프트를 자동으로 생성합니다. 에이전트는 추측하지 않고 알고 있습니다.

---

## 설치

### 방법 1: npm (가장 간단, 권장)

```bash
npm install -g loom-mcp
loom init "My Project"
loom status
```

설치 후 MCP를 수동으로 등록해야 합니다(Kimi Code 예시):

```bash
kimi mcp add --transport stdio loom -- loom-mcp
```

### 방법 2: 원클릭 설치 스크립트 (MCP 자동 구성)

스크립트는 GitHub Release에서 소스를 다운로드하고 빌드한 후 PATH에 추가하고 MCP를 자동 구성합니다.

#### macOS / Linux — 바로 설치

```bash
curl -fsSL https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.sh | bash
```

#### macOS / Linux — 먼저 검토 후 설치 (보안을 중시하는 사용자 권장)

```bash
curl -fsSL https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.sh -o install-loom.sh
cat install-loom.sh          # 스크립트 내용 검토
bash install-loom.sh         # 확인 후 실행
```

#### 드라이 런 (파일을 변경하지 않고 설치 과정 미리보기)

```bash
curl -fsSL https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.sh | bash -s -- --dry-run
```

#### Windows

```powershell
irm https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.ps1 | iex
```

설치 스크립트가 다음 작업을 자동으로 수행합니다:
1. 해당 release tag의 소스를 `~/.loom-server`에 다운로드
2. 의존성 설치 및 빌드
3. `loom` 및 `loom-mcp` 명령어를 `PATH`에 추가
4. **Kimi Code** 또는 **Claude Desktop**의 MCP 설정 자동 구성
5. 현재 디렉터리에 LOOM 워크스페이스 자동 초기화

설치 후 **MCP 클라이언트를 재시작**하여 새 서버를 로드하세요.

### 방법 3: Homebrew (macOS / Linux)

> 현재 Formula는 저장소에 있으며 Homebrew/core에 아직 포함되지 않았습니다. 직접 설치하려면:
> ```bash
> brew install --formula ./Formula/loom-mcp.rb
> ```
> 또는 향후 `brew install loom-mcp`를 기다리세요.

---

## 빠른 시작

설치가 완료되면 `loom` 명령어를 바로 사용할 수 있습니다:

```bash
# 워크스페이스 초기화 (첫 사용)
loom init "My Project"

# 현재 컨텍스트 확인 (오래된 경우 파일 시스템 스캔도 자동 실행)
loom status

# 작업 생성 및 활성화
loom task create "Refactor auth middleware"
loom task set task-auth-refactor

# 파일 상태 및 의존성 확인
loom fs health
loom fs deps src/auth/middleware.ts

# 자가 진단 실행
loom doctor
```

이렇게 하면 `loom_status`, `loom_expand`, `loom_fs_scan`, `loom_record_decision`, `loom_doctor`, `loom_ping` 등 19개의 도구를 사용할 수 있습니다.

---

## 핵심 개념

### Entry: 컨텍스트의 원자

LOOM의 모든 것은 **Entry(엔트리)**입니다. 총 7가지 타입이 있습니다:

| 타입 | 목적 |
|------|---------|
| **Rule** | 강력한 제약 조건 (예: "모든 JWT 인증은 미들웨어를 거쳐야 함") |
| **Pattern** | 재사용 가능한 코드나 디자인 패턴 |
| **Memory** | 일반적인 프로젝트 지식 |
| **Skill** | 재사용 가능한 기능 설명 |
| **Artifact** | 파일, 코드, 설정—파일 시스템 메타데이터 포함 |
| **Task** | 활성 목표, 진행 상황, 작업 집합 |
| **Decision** | 기록된 아키텍처 선택 |

모든 Entry는 동일한 기본 스키마를 공유합니다:

```yaml
id: string
type: Rule | Memory | Skill | Pattern | Artifact | Task | Decision
version: number
namespace: project | user | auto | team | local

content:
  l1_5: string           # 마이크로 요약, 약 20자
  l2: string             # 한 줄 요약, 약 100자
  l3: string | file:path # 전체 내용 또는 파일 참조

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
  paths: string[]        # 이 엔트리를 활성화하는 파일 경로
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

### Binding: 연결 조직

**Binding(바인딩)**은 두 Entry 간의 지속적이고 타입이 지정된 관계입니다. 단순한 태그와 달리, Binding은 신뢰도 점수, 증거, 감소 모델, 무효화 추적을 포함합니다.

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

따라서 `loom why art-auth-middleware`라고 물으면 다음과 같은 정확한 인과 관계를 얻을 수 있습니다: *"현재 작업의 작업 집합에 포함되어 있고, rule-auth-style에 의해 관리되며, 사용자가 활발히 편집 중입니다."*

### Artifact: 지능을 가진 파일

LOOM에서 Artifact는 단순한 파일 경로가 아닙니다. 파일 시스템을 이해합니다:

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

  # 파일 시스템 인식
  fs:
    last_modified_at: ISO timestamp
    last_seen_at: ISO timestamp
    size_bytes: number
    exists: boolean

  deps:
    imports: string[]       # 이 아티팩트가 import하는 파일
    imported_by: string[]   # 이 아티팩트를 import하는 파일

  health:
    status: healthy | stale | orphan | legacy | redundant | missing
    score: 0..1
    reasons: string[]
    suggested_action: keep | archive | delete | review
```

---

## 슬롯 기반 프롬프트 오케스트레이션

LOOM은 텍스트를 컨텍스트 창에 무작위로 덤프하지 않습니다. 안정성에 따라 정렬된 구조화된 XML 프롬프트를 생성하여 LLM의 KV-캐시 적중률을 극대화합니다.

```xml
<loom_context>
  <protocol>
    지속적 의미 기반 메모리 시스템을 보유하고 있습니다.
    ↣id가 중요할 수 있지만 확실하지 않다면 loom_expand(id, level)을 호출하세요.
    아티팩트를 수정하기 전에 governance / risks / decisions를 확인하세요.
    안정적인 결론에 도달했다면 Task / Decision / Rule / Memory 생성을 제안하세요.
  </protocol>

  <governance>
    ↣rule-auth-style: JWT+RBAC 인증은 미들웨어를 거쳐야 함
  </governance>

  <decisions>
    ↣decision-rbac-over-abac: ABAC 대신 RBAC 선택
  </decisions>

  <dictionary>
    ↣pattern-error-envelope: 통합된 오류 반환 구조
    ↣task-auth-refactor: 인증 미들웨어 리팩토링 및 테스트 유지
  </dictionary>

  <task id="task-auth-refactor" status="active">
    목표: 인증 미들웨어 리팩토링 및 테스트 통과 유지
    현재: 미들웨어의 RBAC 권한 로직 수정
    미결정: 이전 세션 폴드백 유지 여부
  </task>

  <working_set>
    ↣art-auth-middleware: src/auth/middleware.ts
    ↣art-auth-test: src/auth/middleware.test.ts
  </working_set>

  <risks>
    ↣art-auth-test: 사용자 편집 후 요약이 아직 검증되지 않음
  </risks>

  <recovery>
    마지막 체크포인트: 미들웨어 주체 리팩토링 완료, 다음 단계 테스트 fixture 수정
  </recovery>

  <recent_files>
    ↣art-auth-test: src/auth/middleware.test.ts (수정일 2026/4/14)
  </recent_files>

  <fs_health>
    ↣art-legacy-adapter: src/auth/legacy_adapter.ts는 legacy 상태 (조치: review)
  </fs_health>
</loom_context>
```

### 왜 이런 순서인가?

슬롯은 **가장 안정적인 것에서 가장 변동성이 높은 것** 순으로 정렬됩니다:

1. **정적 레이어** (`protocol` → `governance` → `decisions` → `dictionary`): 매우 천천히 변경됩니다. 먼저 배치되어 세션 간 LLM이 이를 캐싱할 수 있습니다.
2. **동적 레이어** (`task` → `working_set` → `risks` → `recovery` → `recent_files` → `fs_health`): 매 세션 변경될 수 있습니다. 뒤에 배치되어 변경이 앞의 캐싱된 접두사를 무효화하지 않도록 합니다.

모든 목록 슬롯은 날짜 순서가 아닌 `id` 기준으로 내림차순 정렬되어, 순서 변동으로 인한 캐시 적중 실패를 방지합니다.

### 토큰 예산 인식

| 슬롯 | 대략적인 토큰 수 |
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
| expanded (on demand) | ~3000 |

고정 슬롯은 1500-2100 토큰을 목표로 합니다. 전체 주입 컨텍스트는 모델의 컨텍스트 창의 8-15% 이하로 유지되어야 합니다.

---

## 파일 시스템 인식

LOOM은 프로젝트의 파일을 단순한 텍스트가 아닌 살아있는 시스템으로 이해합니다.

### 핵심 기능

| 기능 | 설명 | 트리거 |
|------------|-------------|---------|
| **신선도 추적** | 모든 아티팩트의 `mtime`, `size_bytes`, `exists` 추적 | 자동 / `loom fs scan` |
| **의존성 그래프** | JS/TS/Python/Go/Rust/Java 등의 import 파싱 | 자동 / `loom fs deps <path>` |
| **상태 분석** | stale, orphan, legacy, redundant, missing 파일 감지 | 자동 / `loom fs health` |
| **정리 및 삭제** | `.loom/trash/`로 아카이브 또는 삭제 제안 및 실행 | `loom fs trash` / `loom fs clean` |

### 자동 트리거 동작

스캔을 기억해서 실행할 필요가 없습니다:

1. **`loom status` 실행 시** — 마지막 스캔 이후 5분 이상 경과한 경우, LOOM은 프롬프트를 생성하기 전에 가벼운 파일 시스템 스캔(메타데이터 + 의존성 그래프 + 상태 분석)을 자동으로 실행합니다.
2. **Watch Daemon flush 시** — 데몬이 파일 변경 배치를 처리한 후, 자동으로 증분 스캔을 트리거합니다.

### 상태 정의

| 상태 | 조건 | 제안된 조치 |
|--------|-----------|------------------|
| `healthy` | 정상적인 활성 파일 | keep |
| `stale` | 90일 이상 수정되지 않음 | review |
| `orphan` | 바인딩이나 참조가 없음 | review |
| `legacy` | 파일명에 old/backup/deprecated 등 포함 | review |
| `redundant` | 다른 파일과 동일한 콘텐츠 해시 | archive |
| `missing` | 디스크에 더 이상 존재하지 않음 | delete |

---

## 3단계 실행 레이어

LOOM의 핵심에는 비용 의식이 자리 잡고 있습니다.

### 레이어 1: 사전 계산 (LLM 비용 0)

세션 시작 전에 실행됩니다:
- 모든 엔트리, 바인딩, WAL 로드
- 매니페스트 캐시, 핫 엔트리, 작업 집합 캐시 재구축
- 활성 작업 복원
- 파일 시스템 스캔 및 상태 분석 실행
- 위험 및 stale/dirty 마커 계산

**목표:** 중소형 프로젝트 기준 100ms 미만.

### 레이어 2: 훅 (매우 낮은 비용)

파일 쓰기/편집 후 동기적으로 실행됩니다:
- 새 아티팩트 등록
- 저비용 즉시 바인딩 생성(경로 매칭, 키워드 매칭)
- 요약 stale 마킹
- WAL 추가
- dirty-set 업데이트 트리거

**목표:** 훅당 50ms 미만.

### 레이어 3: LLM 프로토콜 (토큰 비용, 하지만 통제됨)

LLM이 결정합니다:
- L2/L3 세부 정보를 확장할지 여부
- 다음 조치가 무엇이어야 하는지
- Decision을 기록할 시점
- 새 Rule/Memory/Pattern을 제안할 시점
- 위험이 검증이 필요한지 여부

LLM은 시스템 프롬프트에 의해 제약되며, `loom_expand`, `loom_record_decision`, `loom_verify`와 같은 도구를 사용하여 상호 작용합니다.

---

## CLI 및 MCP 도구

### 셸 CLI

| 명령어 | 목적 |
|---------|---------|
| `./loom init <name>` | `.loom/` 워크스페이스 초기화 |
| `./loom status` | 슬롯 기반 프롬프트 컨텍스트 표시 |
| `./loom expand <id> [l2\|l3]` | 엔트리 확장 |
| `./loom explain <id>` | 메타데이터 및 바인딩 표시 |
| `./loom why <id>` | 현재 컨텍스트와의 관련성 설명 |
| `./loom task` | 작업 목록 |
| `./loom task set <id>` | 작업 활성화 |
| `./loom task create <title>` | 새 작업 생성 |
| `./loom doctor` | 자가 진단 실행 |
| `./loom skill [list \| extract <task-id>]` | 추출된 스킬 관리 |
| `./loom session [summary\|recent]` | 최근 세션 활동 회상 |
| `./loom watch [dirs...]` | 파일 감시 데몬 시작 |
| `./loom watch stop` | 감시자 중지 |
| `./loom fs scan [dirs...]` | 파일 스캔, 메타데이터 업데이트, 의존성 재구축 |
| `./loom fs deps <path>` | import 및 imported-by 표시 |
| `./loom fs health` | 상태 보고서 표시 |
| `./loom fs trash` | 정리 후보 목록 |
| `./loom fs clean` | 비정상 파일 아카이브/삭제 |

### MCP 도구

| 도구 | 목적 |
|------|---------|
| `loom_status` | 현재 컨텍스트 프롬프트 가져오기 |
| `loom_read_prompt` | 캐시된 프롬프트 직접 읽기 |
| `loom_expand` | 엔트리 세부 정보 확장 |
| `loom_explain` | 엔트리 메타데이터 설명 |
| `loom_why` | 엔트리 관련성 설명 |
| `loom_session_recall` | 최근 세션 활동 회상 |
| `loom_task_set` | 활성 작업 전환 |
| `loom_task_create` | 새 작업 생성 |
| `loom_record_decision` | 아키텍처 결정 기록 |
| `loom_skill_extract` | Task로부터 재사용 가능한 Skill 추출 |
| `loom_watch_start` | 감시 데몬 시작 |
| `loom_watch_stop` | 감시 데몬 중지 |
| `loom_watch_status` | 감시자 상태 확인 |
| `loom_doctor` | 자가 진단 실행 |
| `loom_fs_scan` | 파일 시스템 스캔 트리거 |
| `loom_fs_deps` | 파일 의존성 표시 |
| `loom_fs_health` | 상태 보고서 표시 |
| `loom_fs_trash` | 정리 후보 표시 |
| `loom_ping` | 빠른 상태 확인 |

---

## 디렉토리 구조

```
.loom/                         # 진실의 원천
├── entries/
│   ├── rules/
│   ├── memories/
│   ├── skills/
│   ├── patterns/
│   ├── artifacts/
│   ├── tasks/
│   └── decisions/
├── bindings/                  # *.yml 관계 파일
├── events/
│   └── wal.jsonl              # 추가 전용 이벤트 로그
├── cache/
│   ├── active-prompt.txt      # 에이전트 세션에 주입됨
│   ├── manifest.yml
│   ├── binding-graph.json
│   ├── working-set.yml
│   ├── hot-entries.yml
│   ├── intent-map.yml
│   └── last-fs-scan.txt
├── sessions/
└── config.yml

packages/loom/
├── src/
│   ├── cli.ts
│   ├── mcp.ts
│   ├── mcp-cache.ts
│   ├── mcp-router.ts
│   ├── mcp-utils.ts
│   ├── types/
│   │   └── index.ts
│   ├── commands/
│   │   ├── doctor.ts
│   │   ├── expand.ts
│   │   ├── explain.ts
│   │   ├── fs.ts
│   │   ├── init.ts
│   │   ├── session.ts
│   │   ├── skill.ts
│   │   ├── status.ts
│   │   ├── task.ts
│   │   ├── watch.ts
│   │   └── why.ts
│   └── core/
│       ├── binding-discovery.ts
│       ├── dependency-graph.ts
│       ├── doctor.ts
│       ├── fs-scan.ts
│       ├── fs-tracker.ts
│       ├── garbage-collector.ts
│       ├── paths.ts
│       ├── prompt-builder.ts
│       ├── session-recall.ts
│       ├── skill-extraction.ts
│       ├── store.ts
│       ├── user-profile.ts
│       ├── wal-queue.ts
│       ├── watch-daemon-runner.ts
│       └── watch-daemon.ts
├── bin/loom
├── bin/loom-mcp
├── eslint.config.mjs
├── package.json
├── tsconfig.json
└── src/__tests__/              # 단위 테스트 (29 suites, 107 tests)
```

**중요:** `.loom/`은 진실의 원천입니다. 캐시 파일은 entries + bindings + WAL로부터 재구축할 수 있습니다.

---

## 개발 및 테스트

```bash
cd packages/loom

# 의존성 설치
npm install

# 빌드 (TypeScript → dist/)
npm run build

# 테스트 실행 (node --test)
npm test

# 린터 실행
npx eslint src/
```

### 테스트 커버리지

현재 코드베이스에는 **29개 테스트 스위트, 107개 통과 케이스**가 포함되어 있습니다. 다음을 커버합니다:

- **코어 모듈**: `store`, `wal-queue`, `prompt-builder`, `dependency-graph`, `health-analyzer`, `binding-discovery`, `fs-tracker`, `fs-scan`, `dirty-tracker`, `session-recall`, `skill-extraction`, `user-profile`
- **CLI 명령어**: `init`, `task`, `watch`, `doctor`, `fs`, `expand`, `explain`, `session`, `skill`, `why`
- **MCP 통합**: `mcp-router`, `mcp-cache`, `mcp-utils`

### 최근 품질 개선 사항

- 임시 디렉터리 삭제 후 `ENOENT`에서 WAL 큐 무한 재시도로 인한 좀비 프로세스 제거
- `session-recall` tail-read가 유효한 이벤트를 잘라 버리는 문제 수정
- 테스트 픽스처의 stale hardcoded 경로로 인한 `doctor` 오탐(False Positive) 수정
- 죽은 코드 제거: `clearMcpCache`, `getBindingsForEntry`, 미사용 export
- 레거시 SDP 네이밍 잔여물 정리
- `typescript-eslint` 기반 ESLint 추가 및 모든 린트 오류 수정

---

## 설계 원칙

```yaml
P1_llm_is_the_engine:
  statement: "LLM은 이해와 의사 결정의 중심입니다."
  implication: "외부 시스템은 데이터와 가벼운 자동화만 제공합니다."

P2_cost_aware:
  statement: "모든 기능은 시간과 토큰 비용을 인식해야 합니다."
  implication: "AST보다 경로 매칭을, 모델 추론보다 AST를 선호합니다."

P3_truth_is_distributed:
  statement: "Entries + Bindings + Event Log가 진실의 원천입니다."
  implication: "매니페스트와 캐시는 파생물이며 재구축 가능합니다."

P4_trust_is_earned:
  statement: "기억은 사실이 아닙니다. 모든 엔트리와 바인딩은 신뢰를 획득해야 합니다."
  implication: "추론/오래된/외부 콘텐츠는 가중치가 감소하고 무효화 가능해야 합니다."

P5_task_over_reference:
  statement: "컨텍스트는 일반 유사성이 아닌 현재 작업 중심으로 구성됩니다."
  implication: "Task / Working Set / Decision이 순수한 의미론적 매칭보다 중요합니다."

P6_structured_context_over_text_dump:
  statement: "책임 기반 컨텍스트를 주입하고, 텍스트 덤프는 피합니다."
  implication: "평면적인 L1/L2/L3 연결이 아닌 슬롯 기반 오케스트레이션을 사용합니다."
```

---

## 로드맵

### Phase 1: 골격
- WAL + entries + cache
- L1.5 마이크로 요약
- Task / Decision
- 슬롯 기반 프롬프트
- `loom_expand`

### Phase 2: 작업 연속성 및 거버넌스
- 작업 집합 캐시
- 레벨 0 즉시 바인딩
- 위험 슬롯
- `loom status`, `loom explain`, `loom why`

### Phase 3: 감소 및 검증
- 감소(decay) 엔진
- 검증자(verifier) 레이어
- 바인딩 무효화
- `loom audit`, `loom verify`

### Phase 4: 고정밀 향상
- AST / LSP 통합
- 심볼/스팬 아티팩트
- 임베딩 검색
- 공동 진화(co-evolution) 분석

---

## 라이선스

MIT
