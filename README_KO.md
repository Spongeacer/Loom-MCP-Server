# LOOM

> **LOOM**은 AI 에이전트를 위한 지속적인 메모리 시스템입니다. 세션 간에 작업, 결정, 파일 관계를 저장하고, 매번 재시작할 때 구조화되고 캐시 최적화된 프롬프트에 주입합니다. 파일 상태를 추적하고, 의존성을 매핑하며, 오래된 코드를 자동으로 감지합니다. MCP 또는 CLI를 통해 단편적인 대화를 지속적이고 프로젝트를 인식하는 협업으로 전환하세요.

**언어**: [中文](README.md) | [English](README_EN.md) | **한국어** | [Español](README_ES.md)

---

## 왜 LOOM인가?

대부분의 AI 코딩 어시스턴트는 채팅이 끝나면 컨텍스트를 잃어버립니다. LOOM은 다음을 통해 이 문제를 해결합니다:

- 세션 간 **작업과 결정 유지**
- **파일 관계 추적** (import, binding, 상태)
- 에이전트 프롬프트에 **구조화된 컨텍스트 자동 주입**
- 기술 부채가 되기 전에 **오래된/고아/레거시 파일 감지**

---

## 빠른 시작

```bash
# LOOM 워크스페이스 초기화
./loom init "My Project"

# 현재 컨텍스트 확인 (파일 시스템 스캔도 자동 실행)
./loom status

# 작업 관리
./loom task create "Refactor auth"
./loom task set task-auth-refactor

# 파일 시스템 인식
./loom fs scan src tests
./loom fs health
./loom fs trash
./loom fs clean

# 파일 감시 (아티팩트 자동 등록)
./loom watch src tests
```

---

## MCP 서버

LOOM은 MCP를 통해 15개의 도구를 제공합니다:

| 도구 | 설명 |
|------|-------------|
| `loom_status` | 전체 컨텍스트 프롬프트 가져오기 |
| `loom_expand` | 엔트리 상세 정보 확장 |
| `loom_task_set` / `loom_task_create` | 작업 관리 |
| `loom_record_decision` | 아키텍처 결정 기록 |
| `loom_fs_scan` | 파일 스캔 및 의존성 그래프 재구축 |
| `loom_fs_health` | 파일 상태 보고서 |
| `loom_fs_trash` | 정리 대상 목록 |
| `loom_watch_start` / `loom_watch_stop` | 파일 감시자 |

---

## 핵심 아키텍처

### 1. 슬롯 기반 프롬프트

LOOM은 최대 KV-캐시 재사용을 위해 안정적인 순서로 구조화된 XML 프롬프트를 생성합니다:

```xml
<loom_context>
  <protocol> ... </protocol>
  <governance> ... </governance>
  <decisions> ... </decisions>
  <dictionary> ... </dictionary>
  <task> ... </task>
  <working_set> ... </working_set>
  <risks> ... </risks>
  <recent_files> ... </recent_files>
  <fs_health> ... </fs_health>
</loom_context>
```

### 2. 엔트리 타입

- **Rule** — 하드 제약 (예: "모든 JWT 인증은 미들웨어를 거쳐야 함")
- **Pattern** — 재사용 가능한 코드/디자인 패턴
- **Memory** — 일반 지식
- **Skill** — 재사용 가능한 기능
- **Artifact** — 파일, 코드, 설정 (파일 시스템 메타데이터 포함)
- **Task** — 진행 상황과 작업 집합이 포함된 활성 목표
- **Decision** — 기록된 아키텍처 선택

### 3. 파일 시스템 인식

모든 Artifact는 다음을 추적합니다:

```yaml
fs: { last_modified_at, size_bytes, exists }
deps: { imports, imported_by }
health: { status, score, reasons, suggested_action }
```

상태 종류: `healthy` | `stale` | `orphan` | `legacy` | `redundant` | `missing`

### 4. 3단계 실행 계층

| 계층 | 비용 | 책임 |
|-------|------|----------------|
| L1 사전 계산 | LLM 비용 0 | 엔트리 로드, 캐시 구축, fs 스캔 실행 |
| L2 훅 | 매우 낮음 | 아티팩트 등록, 바인딩 생성, WAL 추가 |
| L3 LLM 프로토콜 | 토큰 비용 | 시스템 프롬프트 + 도구를 통한 의미 결정 |

---

## 디자인 원칙

1. **LLM이 엔진** — 외부 시스템은 데이터와 가벼운 자동화만 제공
2. **비용 인식** — AST보다 경로 매칭을, 모델 추론보다 AST를 선호
3. **진실은 분산** — Entries + Bindings + WAL이 진실의 원천
4. **신뢰는 획득** — 추론/오래된/외부 콘텐츠는 가중치 감소 및 무효화 가능해야 함
5. **작업 우선 참조** — 컨텍스트는 일반 유사성이 아닌 현재 작업 중심으로 구성
6. **구조화된 컨텍스트 우선 텍스트 덤프** — 단순 텍스트 연결이 아닌 슬롯 기반 오케스트레이션

---

## 디렉토리 구조

```
.loom/
├── entries/           # 7가지 엔트리 타입 (*.loom.yml)
├── bindings/          # 관계 파일 (*.yml)
├── events/
│   └── wal.jsonl      # 추가 전용 이벤트 로그
└── cache/
    ├── active-prompt.txt
    ├── manifest.yml
    └── last-fs-scan.txt

packages/loom/
├── src/
│   ├── cli.ts
│   ├── mcp.ts
│   └── core/
│       ├── store.ts
│       ├── prompt-builder.ts
│       ├── fs-tracker.ts
│       ├── dependency-graph.ts
│       ├── garbage-collector.ts
│       └── watch-daemon.ts
├── bin/loom
└── bin/loom-mcp
```

---

## 전체 설계 문서

완전한 아키텍처, 데이터 모델, 로드맵은 [중국어 README](README.md)를 참조하세요.

---

## 라이선스

MIT
