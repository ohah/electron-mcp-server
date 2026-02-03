# Electron MCP Server 스펙

## 개요

Electron과 Model Context Protocol (MCP)을 결합한 MCP 서버. Cursor, Claude Desktop 등 MCP 클라이언트에서 stdio 또는 HTTP로 연동한다.

## 주요 기능

### 1. MCP 서버

- **Tools**: LLM이 호출할 수 있는 함수 (계산, 부수 효과, 네트워크 호출)
- **Resources**: 클라이언트가 읽는 읽기 전용 데이터
- **Prompts**: 재사용 가능한 프롬프트 템플릿

### 2. 트랜스포트

- **stdio**: Cursor, Claude Desktop이 프로세스를 spawn하고 stdin/stdout으로 JSON-RPC 통신. **stdout에 로그를 쓰지 않는다** (메시지 손상).
- **HTTP/SSE**: 원격·헤드리스 환경에서는 Streamable HTTP 또는 SSE 고려.

### 3. 기술 스택

- **Electron** (선택): 데스크탑 앱 또는 stdio 전용 진입점
- **TypeScript** + **Node.js**
- **@modelcontextprotocol/sdk** + **zod**
- **oxlint** / **oxfmt** (코드 품질)
- **mise** (도구 버전 관리)

## MCP 구현 스펙

- **도구 동작·스펙은 Chrome DevTools MCP(ChromeDevTools/chrome-devtools-mcp)와 완전 동일하게 구현한다.** 도구 이름, 파라미터, 동작 방식(예: 상시 수집 vs 호출 시점 수집), 반환 형식을 레퍼런스에 맞춘다.

## 레퍼런스 저장소 (Reference repositories)

구현·설계 참고용 코드는 다음 4개 저장소를 사용한다.

| 저장소 | URL | 참고 내용 |
|--------|-----|-----------|
| halilural/electron-mcp-server | https://github.com/halilural/electron-mcp-server | Electron + MCP 결합, 이슈 |
| microsoft/playwright-mcp | https://github.com/microsoft/playwright-mcp | MCP 서버 구조, stdio/SSE, 도구 등록 |
| ChromeDevTools/chrome-devtools-mcp | https://github.com/ChromeDevTools/chrome-devtools-mcp | MCP 설정, Cursor/Claude 연동 |
| hypothesi/mcp-server-tauri | https://github.com/hypothesi/mcp-server-tauri | MCP + 데스크탑 플러그인(Tauri v2), UI 자동화·IPC·도구 설계 |

## 프로젝트 구조

```
electron-mcp-server/
├── src/                 # TypeScript 소스
├── dist/                # 빌드 산출물 (gitignore)
├── .cursor/
│   ├── commands/        # commit, pr, init-pr, review, review-apply, copilot-review
│   ├── rules/           # commit-rules.mdc, architecture-rules.mdc
│   └── agents/          # sub-agent-mcp, sub-agent-mcp-setup, sub-agent-review, sub-agent-architecture
├── .mise.toml           # mise 도구 버전
├── .oxfmtrc.json       # oxfmt 설정
├── .oxlintrc.json      # oxlint 설정
├── oxlint.json
├── AGENTS.MD            # 이 파일
└── reference/           # 참조 코드 (gitignore)
```

## 개발 명령어

```bash
# 도구 버전 (mise)
mise install

# 코드 품질
mise exec -- bun run format   # oxfmt
mise exec -- bun run lint    # oxlint

# 빌드·실행
bun run build
bun run mcp                  # Node만 사용, stdio MCP 서버
bun run start                # Electron 앱
```

## 아키텍처 (MCP 서버 소스 구조)

- **tools 중심, utils 비사용**: 툴 전용·공통 로직 모두 `packages/electron-mcp-server/src/tools/` 아래에 둔다. 코드가 커지면 `tools/<이름>/` 폴더를 만들고 `index.ts` 로 분리.
- **룰**: `.cursor/rules/architecture-rules.mdc`
- **아키텍처 관리자**: `.cursor/agents/sub-agent-architecture.mdc` — 구조 설계·리팩터링·새 툴 추가 시 적용.

## 세팅 문제 해결 (Bun 모노레포, npx·.bin·심링크)

- **electron-mcp-server 세팅 전문가**: `.cursor/agents/sub-agent-mcp-setup.mdc` — Bun 모노레포에서 `npx -y electron-mcp-server` 실패, `Cannot find module ... dist/mcp-server/index.js`, Windows "인식할 수 없는 명령" 등 원인·해결(workspace devDep, package-lock 제거, npx 캐시 클리어) 정리.

## 커밋·PR 규칙

- **커밋**: `.cursor/rules/commit-rules.mdc`, `.cursor/commands/commit.md` 참고. type(scope): subject 형식, pre-commit에 format/lint 필수.
- **PR**: `.cursor/commands/pr.md`, `init-pr.md` 참고. 이 레포(ohah/electron-mcp-server)는 **ohah** GitHub 계정으로 push·PR; SSH는 `git@github.com-private:ohah/electron-mcp-server.git`.
- **리뷰**: `.cursor/commands/review.md`, `review-apply.md`, `.cursor/agents/sub-agent-review.mdc` 참고.

## 이 레포 PR·push (ohah 전용)

- **SSH remote**: `git remote set-url origin git@github.com-private:ohah/electron-mcp-server.git`
- **gh**: PR 생성·수정·리뷰 제출 전에 `gh auth switch --hostname github.com --user ohah` 로 ohah로 전환. 작업 후 원래 계정으로 복원.

자세한 절차는 `.cursor/commands/init-pr.md`, `.cursor/commands/pr.md`, `.cursor/commands/review.md` 를 참고한다.
