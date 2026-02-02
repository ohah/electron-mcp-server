# Pull Request 생성 또는 수정

현재 브랜치에 대한 PR을 생성하거나 수정한다. 아래 순서를 따른다.

## 에이전트가 할 일

1. **현재 브랜치·PR 상태 확인**: `git branch --show-current`, `gh pr list --head <current-branch> --state all`
2. **현재 브랜치에 이미 열린 PR이 있으면**: 새 브랜치나 새 PR을 만들지 않는다. 현재 브랜치에 커밋을 추가하고 push하면 기존 PR에 자동 반영된다. 필요하면 PATCH로 PR 본문(및 라벨)을 갱신한다.
3. **베이스 브랜치 결정**: 사용자가 베이스 브랜치를 지정하면 (예: "base is main", "base feat/xyz") 그 브랜치를 머지 대상으로 쓴다.
   - **현재 브랜치가 베이스와 같으면** → 현재 브랜치에서 새 브랜치를 만들고, 그 새 브랜치를 head로 하는 PR을 연다 ("베이스와 현재 브랜치가 같을 때" 참고).
   - 그렇지 않으면 지정된 베이스를 쓴다.
4. **본문 준비**: `branch-summary.md`가 있고 필요한 섹션(목적, 설명, 테스트 방법 등 또는 제목 + 작업 내용)을 채우고 있으면 그걸 PR 본문으로 쓴다. 섹션이 부족하면 채운 뒤 사용한다.
5. **PR 생성 또는 수정**:
   - 열린 PR 없음 → `gh pr create --head <current-branch> --base <base> --title "<title>" --body-file branch-summary.md`
   - 열린 PR 있음 → 본문 수정 (베이스가 지정됐고 PR이 열려 있으면 PATCH로 베이스도 수정).
6. **Push**: 푸시 안 된 커밋이 있으면 `git push origin <current-branch>` 실행.
7. **라벨**: PR 생성·수정 후 `gh label list`로 확인하고 PR 성격에 맞는 라벨 추가 (예: feat, fix, docs).

## 베이스 브랜치 (사용자가 지정했을 때)

- 사용자가 **베이스 브랜치를 지정**하면 (예: "base is main", "base feat/mcp-tools") **항상** 그 브랜치를 머지 대상(베이스)으로 쓴다.
- **생성 시**: `gh pr create`에 `--base <user-specified-branch>` 전달.
- **수정 시**: PR이 **열려 있으면** REST PATCH로 베이스 수정. PR이 **닫혀 있으면** 베이스는 바꿀 수 없고 본문만 수정.
  ```bash
  gh api repos/ohah/electron-mcp-server/pulls/<PR-number> -X PATCH -f body=@branch-summary.md -f base="<user-specified-branch>"
  ```
  (베이스 변경 시 422가 나오면 닫힌 PR로 간주하고 본문만 PATCH.)

## 베이스와 현재 브랜치가 같을 때

- 사용자가 base=XXX로 지정했고 **현재 브랜치도 XXX**이면, self-merge는 허용되지 않는다. **현재 브랜치에서 새 브랜치를 만들어** 그걸 PR head로 쓴다.
- 순서:
  1. 현재 브랜치(XXX)에서 새 브랜치 생성: `git checkout -b feat/xxx-description` (작업 내용으로 이름 짓기).
  2. 커밋 안 된 변경이 있으면 새 브랜치에서 스테이징·커밋(및 push).
  3. `gh pr create --head <new-branch> --base XXX --title "..." --body-file branch-summary.md --assignee @me`
  4. 새 브랜치 push: `git push -u origin <new-branch>`

## 이 레포의 gh 계정·SSH remote (ohah 전용)

이 레포(ohah/electron-mcp-server)는 push·PR에 **ohah** GitHub 계정을 쓴다.

- **SSH remote**: push가 ohah로 인증되도록 origin을 `github.com-private` 호스트로 맞춘다 (`~/.ssh/config` 참고). push 전에 origin이 아래인지 확인한다:
  ```bash
  git remote set-url origin git@github.com-private:ohah/electron-mcp-server.git
  ```
  (이미 이 URL이면 생략.)
- **gh auth switch**: push 또는 `gh pr create` / `gh api .../pulls/...` PATCH 전에 `gh api user -q .login`으로 현재 사용자 확인. 결과가 `ohah`가 아니면 `gh auth switch --hostname github.com --user ohah` 실행하고 **이전 로그인을 기억**한다 (예: `PREV_GH_USER=<그 값>`).
- **모든 push·gh PR 작업이 끝난 뒤**: ohah로 바꿨다면 `gh auth switch --hostname github.com --user <PREV_GH_USER>`로 이전 계정을 복원해 전역 gh 설정이 유지되게 한다.

## 작업 순서

1. **사용자 입력 확인**: 베이스 브랜치가 지정됐으면 위 규칙대로 베이스 설정.
2. **SSH remote**: origin이 `git@github.com-private:ohah/electron-mcp-server.git`인지 확인; 아니면 `git remote set-url origin git@github.com-private:ohah/electron-mcp-server.git` 실행.
3. **gh 계정**: 현재 사용자 확인: `gh api user -q .login`. ohah가 아니면 `gh auth switch --hostname github.com --user ohah` 실행하고 이전 로그인을 저장해 나중에 복원.
4. **GitHub CLI로 PR 생성·수정**:
   - 브랜치가 이미 push됐으면 → 생성 시 `--head <branch-name>` 사용.
   - 베이스가 지정됐으면 → 생성 시 항상 `--base <base>` 전달, 또는 수정 시 PR이 열려 있으면 PATCH에 베이스 포함.

   ```bash
   gh pr create --head $(git branch --show-current) --base <base> --title "<title>" --body-file branch-summary.md
   ```

   - PR이 이미 있으면 → 본문 수정. 베이스가 지정됐고 PR이 열려 있으면 PATCH로 본문·베이스 모두 수정.

   ```bash
   # 본문만:
   gh api repos/ohah/electron-mcp-server/pulls/<PR-number> -X PATCH -f body=@branch-summary.md
   # 본문 + 베이스:
   gh api repos/ohah/electron-mcp-server/pulls/<PR-number> -X PATCH -f body=@branch-summary.md -f base="<base>"
   ```

5. **Push**: 생성·수정 후 푸시 안 된 커밋이 있으면 push해 PR이 최신 커밋을 반영하도록 한다.

   ```bash
   git push origin $(git branch --show-current)
   ```

6. **`gh`가 없을 때**: [GitHub CLI](https://cli.github.com/) 설치하거나 브라우저에서 PR 연 뒤 (레포 → Compare & pull request) `branch-summary.md` 내용을 설명란에 붙여넣는다.

7. **라벨**: 생성 시 `--label <name>` (여러 개 가능). 수정 시 `gh pr edit <PR-number> --add-label <name>`. `gh label list`에서 PR 성격에 맞는 라벨 선택 (예: feat, fix, docs, config).

8. **gh 계정 복원**: 3단계에서 ohah로 바꿨다면 `gh auth switch --hostname github.com --user <previous-login>`으로 원래 계정 복원.

## PR 제목 규칙

- **사용자가 제목을 줬으면**: 그대로 쓴다.
- **사용자가 이슈 참조를 줬으면** (예: `/pr fixes #123`): `[#123]` 같은 접두사 + 짧은 제목.
- **둘 다 없으면**: branch-summary 첫 줄이나 주요 변경에서 짧은 명령형 제목. **한글**로 작성. 마침표 없음.

## PR 본문 형식

PR 본문은 `branch-summary.md`를 쓴다. 최소 다음을 포함한다:

- **제목** (또는 목적): 이 PR이 무엇을 위한 것인지.
- **작업 내용** (또는 설명): 무엇을 어떻게 바꿨는지, 문장으로. 테스트 추가·수정이 있으면 적는다 (예: "…에 대한 테스트 추가" 또는 "테스트 커버리지에 … 포함").

**이슈와 관련된 PR**: 특정 이슈를 다루는 PR이면 본문에 해당 이슈를 **반드시** 링크한다. 본문 상단 또는 하단에 다음 중 하나를 넣는다.

- 머지 시 이슈 자동 종료: `Fixes #123` 또는 `Closes #123`
- 참고만 할 때: `관련 이슈: #123` 또는 `Ref #123`

레포에 `.github/PULL_REQUEST_TEMPLATE.md`가 있으면 작성·수정 시 `branch-summary.md`를 그 섹션(목적, 설명, 테스트 방법, 추가 정보, 스크린샷 등)에 맞춘다.

## 참고

- **기존 PR**: 현재 브랜치에 이미 열린 PR이 있으면 새 브랜치·새 PR을 만들지 않는다. 같은 브랜치에 커밋을 push해 그 PR에 반영하고, 필요하면 본문·라벨만 수정한다.
- **언어**: PR 제목·본문은 **한글**로 작성 (프로젝트 규칙).
- **베이스**: 사용자가 베이스 브랜치를 지정했으면 생성·수정 시 항상 그걸 쓴다 (베이스와 현재 브랜치가 같을 때는 새 head 브랜치를 만든다).
- **본문**: `branch-summary.md`를 최신으로 유지하고 PR 설명용으로만 쓴다; 프로젝트에서 허용하지 않는 한 커밋하지 않는다.
- **Push**: PR 본문을 수정한 뒤 푸시 안 된 커밋이 있으면 push해 PR이 최신 코드를 반영하도록 한다.
- **라벨**: `gh label list`로 PR 유형(feat, fix, docs 등)에 맞는 라벨을 붙인다.
- **이슈 링크**: PR이 이슈와 관련되면 본문에 `Fixes #N` / `Closes #N` 또는 `관련 이슈: #N`을 넣어 링크한다. 제목에 이슈 번호를 쓸 때는 `[#N] 제목` 형태로 한다.
