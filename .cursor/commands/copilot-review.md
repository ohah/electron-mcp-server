# GitHub Copilot 리뷰 피드백 반영

브랜치/PR에 대한 Copilot 피드백을 확인하고, 제안된 변경을 코드에 반영한다.

## 입력

- **브랜치/PR 링크** (선택): 사용자가 링크를 줄 수 있음 (예: `https://github.com/owner/repo/pull/123`). 없으면 **현재 브랜치**의 PR을 GitHub CLI로 찾는다:

  ```bash
  gh pr view --json number,url  # 레포 루트에서; 현재 브랜치에 PR 없으면 실패
  # 또는
  gh pr list --head $(git branch --show-current) --state open --json number,url
  ```

  - 현재 브랜치에 PR이 정확히 하나 있으면 그 PR 사용. 없거나 여러 개면 PR 링크(또는 붙여넣은 리뷰 텍스트)를 요청한다.

- **리뷰 텍스트**: 사용자가 Copilot 리뷰 텍스트를 직접 붙여넣을 수 있음; 그걸 피드백 소스로 쓴다.

## 단계

1. **리뷰 확보**:
   - 사용자가 PR 링크를 붙여넣었으면: 그 PR을 열어 GitHub Copilot 리뷰(요약·파일 코멘트)를 찾는다.
   - **링크를 주지 않았으면**: 레포 루트에서 `gh pr view` (또는 `gh pr list --head $(git branch --show-current) --state open`) 실행. 현재 브랜치에 PR이 하나 있으면 그걸 쓴다; 없으면 "현재 브랜치에 PR이 없습니다" 또는 "PR이 여러 개입니다"라고 하고 링크를 요청한다.
   - 리뷰 텍스트를 직접 붙여넣었으면: 그걸 피드백 소스로 쓴다.
   - PR이 있으면: `gh pr view <number>` 또는 웹 URL로 PR 대화에서 Copilot 리뷰를 확인한다.

2. **피드백 파악**:
   - Copilot이 뭘 제안했는지 요약 (스타일, 보안, 로직, 테스트 등).
   - 각 코멘트가 어떤 파일·라인을 가리키는지 파악한다.

3. **변경 반영**:
   - 제안이 타당한 부분만 코드에 반영한다.
   - 정확성·보안·유지보수성을 높이는 제안은 받아들이고, 프로젝트 규칙·의도와 어긋나는 건 건너뛰거나 수정해 반영한다.
   - 수정 후 포맷·린트 실행 (TS/JS: `bun run format`, `bun run lint`).

4. **사용자에게 답변**:
   - 무엇을 바꿨고 무엇을 건너뛰었는지 (이유가 있으면) 나열.
   - PR 링크(또는 붙여넣은 리뷰 텍스트)는 `gh pr view` / `gh pr list`로 현재 브랜치 PR을 찾지 못했을 때, 또는 사용자가 다른 PR을 지정해야 할 때만 요청한다.

5. **PR 내용 갱신** (Copilot 리뷰 반영 후):
   - `branch-summary.md`(또는 PR 설명 소스)에 Copilot이 뭘 제안했고 뭘 반영했는지 짧게 적는다 (예: "Copilot 리뷰: AGENTS.MD 대소문자, MCP 도구 네이밍, 트랜스포트 정리 반영").
   - 브랜치가 이미 push됐고 PR이 있으면 `gh pr edit --body-file branch-summary.md`를 제안하거나 실행해 PR 설명을 갱신한다. `branch-summary.md`는 커밋하지 않는다; PR 본문용으로만 쓴다.

6. **리뷰 스레드 해결** (피드백 반영 후):
   - 반영한 Copilot 코멘트 스레드는 GitHub에서 **resolved**로 표시해 PR에 미해결 스레드가 남지 않게 한다.
   - **웹**: PR → "Files changed" → 각 코멘트 열기 → "Resolve conversation".
   - **CLI**: `gh`에는 resolve 명령이 없으므로 GraphQL 사용:
     `gh api graphql -f query='mutation { resolveReviewThread(input: { threadId: "PRRT_xxx" }) { thread { isResolved } } }'` (PR에서 thread ID 확인, 예: `pull-requests/pr-N/comments.json` 또는 리뷰 코멘트 페이로드). 미해결 스레드마다 한 번씩 실행.

## 참고

- **PR 소스**: 링크를 주지 않았으면 먼저 `gh pr view` (또는 `gh pr list --head $(git branch --show-current)`)로 현재 브랜치에 PR이 있는지 확인; 하나만 있으면 그걸 쓴다. PR이 없거나 다른 PR을 지정해야 할 때만 링크나 붙여넣은 리뷰 텍스트를 요청한다.
- 자동 커밋하지 않는다; 사용자가 diff 확인 후 `/commit`으로 커밋할 수 있게 한다.
- Copilot 리뷰 반영 후에는 항상 PR 내용(branch-summary.md)을 갱신하고, 필요하면 `gh pr edit --body-file branch-summary.md`로 PR 본문을 다시 올린다.
- 피드백 반영 후에는 반영한 리뷰 스레드를 GitHub에서 resolved 처리한다 (웹 "Resolve conversation" 또는 `gh api graphql`의 `resolveReviewThread` + thread ID).
