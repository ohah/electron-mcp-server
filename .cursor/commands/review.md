# Pull Request 리뷰 (AI 리뷰 + 요약·인라인 제안)

현재 브랜치의 PR을 가져와 AI가 코드·설명을 리뷰한 뒤, **요약 리뷰(본문)** 와 **라인별 제안(인라인 코멘트)** 를 PR에 올린다.

- **요약 리뷰**: PR 목적·설명과 변경 일치 여부, 잘된 점, 개선 제안(버그·엣지케이스·성능·테스트), 테스트 관점을 담은 리뷰 본문을 **한글**로 작성한다.
- **라인별 제안**: 구체적인 코드 수정이 필요한 곳에는 해당 파일·라인에 인라인 코멘트를 달고, 가능하면 ` ```suggestion ``` ` 블록을 넣어 작성자가 GitHub에서 "Commit suggestion"으로 적용할 수 있게 한다.

## 이 레포의 gh 계정 (ohah 전용)

이 레포(ohah/electron-mcp-server)는 리뷰 제출에 **ohah** GitHub 계정을 쓴다.

- **제출 전**: `gh api user -q .login`으로 현재 사용자 확인. 결과가 `ohah`가 아니면 `gh auth switch --hostname github.com --user ohah` 실행하고 **이전 로그인을 기억**한다 (예: `PREV_GH_USER=<그 값>`).
- **제출 후**: ohah로 바꿨다면 `gh auth switch --hostname github.com --user <PREV_GH_USER>`로 이전 계정을 복원해 전역 gh 설정이 바뀌지 않게 한다.

## 작업 순서

1. **브랜치·gh 계정 (이 레포 / ohah 전용)**
   - 레포 루트에서 실행. 리뷰 대상은 **현재 브랜치**의 PR이다.
   - 현재 gh 사용자 확인: `gh api user -q .login`. ohah가 아니면 `gh auth switch --hostname github.com --user ohah` 실행하고 이전 로그인을 저장해 나중에 복원.

2. **현재 브랜치의 PR 찾기**
   - PR이 없으면 "현재 브랜치에 해당하는 PR이 없습니다"라고 하고 중단.

   ```bash
   gh pr view --json number,title,body,url,additions,deletions,changedFiles
   ```

   - 실패 시(PR 없음): `gh pr list --head $(git branch --show-current)`로 확인.

3. **PR 상세·diff 수집**
   - PR 메타·본문: `gh pr view`
   - 변경 파일: `gh pr diff --name-only`
   - 전체 diff: `gh pr diff`
   - 위 내용으로 리뷰용 맥락을 만든다.

4. **AI 리뷰 작성 (요약 + 라인 제안)**
   - **요약 본문** (한글):
     - **목적·설명**: PR 목적·설명이 실제 변경과 맞는가?
     - **잘된 점**: 구조, 네이밍, 컨벤션, 일관성.
     - **개선 제안**: 버그·엣지케이스·성능·테스트 등.
   - **라인별 제안**: 수정이 필요한 곳마다 인라인 코멘트 준비:
     - **path**: 레포 루트 기준 상대 경로 (예: `src/mcp-server.ts`)
     - **line**: diff **새 버전(우측)** 기준 라인 번호.
     - **side**: `"RIGHT"`
     - **body**: 짧은 설명; 구체적인 코드 수정이면 ` ```suggestion ``` ` 블록을 넣어 GitHub "Commit suggestion"이 되게 한다.

5. **리뷰 제출 (인라인 제안이 있으면 요약+인라인을 한 번에)**
   - **5-a. 인라인 제안이 하나 이상 있을 때**
     **body**와 **comments** 배열을 모두 포함한 **한 번의** 리뷰로 제출.
     - **body**: 4단계에서 쓴 요약 (잘된 점, 개선 요약, 테스트 관점).
     - **comments**: 제안마다 하나씩, 예:
       - **path**: 레포 루트 기준 경로
       - **line**: **새(우측)** 버전 기준 라인 번호. 실제 파일과 맞는지 확인.
       - **side**: `"RIGHT"`
       - **body**: 짧은 설명 + (해당 시) ` ```suggestion ` … ` ``` ` 블록.
     - 예시 페이로드 파일 (`review-payload.json`):
       ````json
       {
         "commit_id": "<headRefOid>",
         "event": "COMMENT",
         "body": "## AI 리뷰\n\n### 잘된 점\n- ...\n\n### 개선 제안\n- ...\n\n### 테스트\n- ...",
         "comments": [
           {
             "path": "src/mcp-server.ts",
             "line": 42,
             "side": "RIGHT",
             "body": "연결 해제 시 트랜스포트 정리를 권장합니다.\n\n```suggestion\n  transport.close();\n```"
           }
         ]
       }
       ````
     - 명령:
       ```bash
       gh pr view --json headRefOid -q .headRefOid   # commit_id로 사용
       gh api repos/ohah/electron-mcp-server/pulls/$(gh pr view --json number -q .number)/reviews --input review-payload.json
       ```
     - 제출 후 `review-payload.json`은 삭제해도 됨.

   - **5-b. 인라인 제안이 없을 때**
     요약만 단일 코멘트로 올린다:

     ```bash
     gh pr comment $(gh pr view --json number -q .number) --body-file review-comment.md
     ```

     (4단계 요약을 먼저 `review-comment.md`에 쓴다. 올린 뒤 삭제해도 됨.)

   - **규칙**: 라인별 제안이 있으면 5-a(본문+comments 한 번). 없으면 5-b(코멘트만).

6. **gh 계정 복원 (이 레포 / ohah 전용)**: 1단계에서 ohah로 바꿨다면 `gh auth switch --hostname github.com --user <PREV_GH_USER>`로 원래 계정 복원.

## 참고

- 레포 루트에서 `gh` 인증된 상태로 실행. 이 레포(ohah/electron-mcp-server): 리뷰 제출은 ohah 사용; 제출 전 gh 전환·제출 후 복원 ("이 레포의 gh 계정" 및 1단계, 6단계 참고).
- 현재 브랜치에 PR이 없으면 리뷰를 올리지 않고 위 메시지만 출력한다.
- **인라인 코멘트**: `line`은 diff **새(우측)** 버전 기준 라인 번호; `side`는 `"RIGHT"`. 잘못된 라인 번호는 422를 유발하므로 실제 파일과 맞는지 확인한다.
- **제안 블록**: 코멘트 본문에 제안 코드를 ` ```suggestion ` 와 ` ``` ` 사이에 넣어 GitHub "Commit suggestion"이 되게 한다.
- 리뷰는 GitHub 코멘트 길이 제한 안에서, 불릿·짧은 문단으로 쓴다.
