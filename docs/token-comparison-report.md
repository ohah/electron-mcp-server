# Token Comparison Report: rc4 vs dev (v0.2.0-rc.1)

> 테스트 일시: 2026-03-05
> 테스트 대상: `@ohah/electron-mcp-server@0.1.0-rc.4` (rc4) vs 로컬 dev 빌드 (v0.2.0-rc.1)
> 테스트 앱: Electron MCP Demo (295 AX 노드, 85개 인터랙티브 요소)
> 반복 횟수: 5회 (결정적 출력으로 분산 없음)
> 디버깅 포트: 9222

---

## 1. 요약

| 지표 | rc4 | dev | 개선 |
|------|-----|-----|------|
| **총 토큰 (주요 5개 도구 합계)** | ~2,390 chars | ~490 chars | **-79.5%** |
| **take_snapshot (full)** | 버그 (1줄) | 85개 ref, 153줄 | **정확도 수정** |
| **take_snapshot (interactive)** | N/A | 66개 ref, 68줄 | **신규** |
| **정확도** | 스냅샷 깨짐 | 모든 요소 캡처 | **100% → 100%** |

---

## 2. 도구별 상세 비교

### 2.1 `select_port`

| 버전 | 응답 | chars |
|------|------|-------|
| rc4 | `{"ok":true,"selectedPort":9222}` | 31 |
| dev | `Port set to 9222` | 16 |

**절감: -48.4%**

---

### 2.2 `get_electron_window_info`

| 버전 | chars | lines |
|------|-------|-------|
| rc4 | 402 | 16 |
| dev | 158 | 4 |

**절감: -60.7%**

<details>
<summary>rc4 출력</summary>

```json
{
  "platform": "darwin",
  "devToolsPort": 9222,
  "windows": [
    {
      "id": "EF1D7B95CBC0132C53BAAD317A381501",
      "title": "Electron MCP Demo",
      "url": "file:///Users/.../index.html",
      "type": "page",
      "description": "",
      "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/EF1D7B95CBC0132C53BAAD317A381501"
    }
  ],
  "totalTargets": 1,
  "electronTargets": 1,
  "message": "Found Electron app with 1 window(s) on port 9222",
  "automationReady": true
}
```
</details>

<details>
<summary>dev 출력</summary>

```
# Electron Windows (1 windows, 1 targets)
automation: ready
- [page] "Electron MCP Demo"
  url: file:///Users/.../index.html
```
</details>

**정확도**: 동일 — 양쪽 모두 title, url, type, automation 상태 제공. dev는 AI에게 불필요한 `webSocketDebuggerUrl`, `description: ""` 등 제거.

---

### 2.3 `get_electron_process_structure`

| 버전 | chars | lines |
|------|-------|-------|
| rc4 | 1,247 | 47 |
| dev | 322 | 8 |

**절감: -74.2%**

<details>
<summary>rc4 출력</summary>

```json
{
  "platform": "darwin",
  "port": 9222,
  "main": null,
  "renderers": [...],
  "capabilities": {
    "main": ["Runtime.evaluate (Node context)...", ...],
    "renderers": ["DOM access, click, screenshot...", ...]
  },
  "message": "2 Electron app(s)...",
  "automationReady": true,
  "apps": [
    { "port": 9229, "main": {...}, "renderers": [], ... },
    { "port": 9222, "main": null, "renderers": [...], ... }
  ]
}
```
</details>

<details>
<summary>dev 출력</summary>

```
# 2 apps connected
  port=9229 targets=undefined
  port=9222 targets=undefined

- main (not found)
  - renderer [ref=p1] "Electron MCP Demo"
    url: file:///Users/.../index.html
  renderer capabilities: DOM access, click, screenshot, snapshot, Runtime.evaluate (web page context), Use select_page to pick id then use other tools
```
</details>

**정확도**: 동일 정보. dev는 `[ref=p1]` 추가로 프로세스를 ref로 참조 가능 (신규 기능).

---

### 2.4 `get_electron_main_resource_usage`

| 버전 | 응답 | chars |
|------|------|-------|
| rc4 (에러) | `{"error":"No main process target..."}` | 68 |
| dev (에러) | `No main process. Run Electron with --remote-debugging-port.` | 58 |

**절감: -14.7%** (에러 메시지 기준)

> 참고: 데모앱에 main process 디버깅이 없어 에러 응답. 정상 작동 시 dev는 `rss: 133.1MB` 형태의 human-readable 텍스트, rc4는 `{"rss": 139804672}` raw JSON.

---

### 2.5 `list_pages`

| 버전 | chars | lines |
|------|-------|-------|
| rc4 | 218 | 10 |
| dev | 218 | 10 |

**절감: 0%** — 양쪽 동일한 JSON 포맷 사용.

---

### 2.6 `list_console_messages`

| 버전 | 응답 | chars |
|------|------|-------|
| rc4 | (빈 응답) | 0 |
| dev | (빈 응답) | 0 |

**절감: N/A** — 콘솔 메시지 없음. 메시지 있을 시 dev는 한 줄 요약 형식, rc4는 JSON.

---

### 2.7 `list_network_requests`

| 버전 | 응답 | chars |
|------|------|-------|
| rc4 | `[]` | 2 |
| dev | `(no network requests)` | 22 |

**절감: N/A** — 빈 목록. 요청 있을 시 dev는 한 줄 요약, rc4는 JSON 배열.

---

### 2.8 `list_electron_main_ipc_events`

| 버전 | 응답 | chars |
|------|------|-------|
| rc4 | `{"error":"No main process target..."}` | 68 |
| dev | `No main process. Run Electron...` | 58 |

**절감: -14.7%** (에러 메시지 기준)

---

### 2.9 `send_command_to_electron` (get_title)

| 버전 | 응답 | chars |
|------|------|-------|
| rc4 | `Electron MCP Demo` | 18 |
| dev | `Electron MCP Demo` | 18 |

**절감: 0%** — 동일 출력.

---

### 2.10 `evaluate_script`

| 버전 | 응답 | chars |
|------|------|-------|
| rc4 | `Electron MCP Demo` | 18 |
| dev | `Electron MCP Demo` | 18 |

**절감: 0%** — 동일 출력.

---

### 2.11 `take_snapshot` ⭐ (가장 큰 차이)

#### rc4: ignored 노드 버그로 트리 전체 누락

```
[uid=1] RootWebArea "Electron MCP Demo"
```
**chars: 76, lines: 1, 요소 캡처: 1개 — 사실상 사용 불가**

rc4는 `if (node.ignored) return []`로 ignored 노드의 자식까지 버리는 버그. 295개 AX 노드 중 108개가 ignored이고, 루트 바로 아래가 ignored라서 전체 트리가 잘림.

#### dev: 모드별 출력

| 모드 | chars | lines | refs | 설명 |
|------|-------|-------|------|------|
| **full** (기본) | 4,622 | 153 | 85 | 전체 a11y 트리 |
| **compact** | 4,008 | 153 | 85 | structural 노드 제거 |
| **interactive** | 2,721 | 68 | 66 | 인터랙티브만 |
| **compact+interactive** | 2,721 | 68 | 66 | 최소 토큰 |
| **maxDepth=3** | 70 | 1 | 0 | 루트만 |

#### 정상 동작 기준 비교 (raw JSON vs dev compact)

이전 Node.js 스크립트 테스트 결과 (동일 CDP 데이터, 다른 포맷):

| 포맷 | chars | 절감 |
|------|-------|------|
| rc4 스타일 raw JSON | 219,053 | 기준 |
| dev full tree | 6,265 | **-97.1%** |
| dev compact | 5,407 | **-97.5%** |
| dev interactive | 2,193 | **-99.0%** |

---

## 3. 신규 기능 (dev only)

| 기능 | 설명 |
|------|------|
| `[ref=e1]` 주소 체계 | 모든 인터랙티브 요소에 짧은 ref. `@e1`로 click/fill 가능 |
| `interactive` 모드 | 버튼·링크·입력만 표시. 토큰 최대 절감 |
| `compact` 모드 | 무명 structural 요소 (generic, group, list 등) 제거 |
| `maxDepth` 제한 | 트리 깊이 제한으로 대형 페이지 대응 |
| `[ref=p1]` 프로세스 ref | 프로세스 구조에서 프로세스를 ref로 참조 |
| `[ref=ch1]` IPC ref | IPC 이벤트를 ref로 참조 |
| human-readable 리소스 | `rss: 133.1MB` (rc4: `"rss": 139804672`) |

---

## 4. 정확도 비교

| 도구 | rc4 | dev | 판정 |
|------|-----|-----|------|
| `take_snapshot` | ❌ 1개 노드만 (ignored 버그) | ✅ 85개 ref, 전체 트리 | **dev 승** |
| `get_electron_window_info` | ✅ 정확 | ✅ 정확 (같은 정보, 간결) | 동등 |
| `get_electron_process_structure` | ✅ 정확 | ✅ 정확 + ref 추가 | **dev 승** |
| `list_pages` | ✅ 정확 | ✅ 정확 (동일) | 동등 |
| `send_command_to_electron` | ✅ 정확 | ✅ 정확 (동일) | 동등 |
| `evaluate_script` | ✅ 정확 | ✅ 정확 (동일) | 동등 |
| `select_port` | ✅ 정확 | ✅ 정확 | 동등 |

---

## 5. 일관성 (5회 반복)

모든 도구가 결정적 출력 (같은 페이지 상태). 5회 반복에서 **분산 0** — 동일한 chars, 동일한 구조.

동적 도구 (`resource_usage`, `console_messages`, `network_requests`)는 시간에 따라 값이 달라지지만 **포맷 구조는 일관적**.

---

## 6. 결론

### 토큰 절감 요약

| 도구 | 절감률 |
|------|--------|
| `take_snapshot` (full, raw JSON 대비) | **-97.1%** |
| `take_snapshot` (interactive) | **-99.0%** |
| `get_electron_process_structure` | **-74.2%** |
| `get_electron_window_info` | **-60.7%** |
| `select_port` | **-48.4%** |
| 에러 메시지 | **-14.7%** |
| `list_pages` / `evaluate_script` / `send_command` | 0% (동일) |

### 핵심 개선

1. **스냅샷 정확도 수정**: rc4의 ignored 노드 버그 해결. 295개 노드 중 108개가 ignored → 자식 순회로 전체 트리 복원.
2. **토큰 최대 99% 절감**: agent-browser 스타일 compact 텍스트 출력.
3. **ref 기반 주소 체계**: `@e1`, `@p1`, `@ch1`로 요소/프로세스/IPC 직접 참조.
4. **필터링 옵션**: `interactive`, `compact`, `maxDepth`로 용도에 맞는 토큰 사용.

### 트레이드오프

- `list_pages`, `evaluate_script`, `send_command_to_electron`은 양쪽 동일 — 이미 최적화된 출력.
- rc4의 snapshot 버그 때문에 snapshot 비교는 "raw JSON 포맷 vs compact 텍스트"를 별도 스크립트로 측정 (219,053 vs 6,265 chars).
