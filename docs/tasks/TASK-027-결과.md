# [TASK-027] 결과 — 단계 전환·이전 단계 이동·임시저장·읽기 전 추천 반복

작성: 2026-11-17 (Asia/Seoul). 요청서: `docs/tasks/TASK-027-사용성-개선-묶음.md` v2. 1차(A·B) 결과 아래에 2차(C·F) 결과를 이어 적는다.

## 결과 요약
- 상태: **로컬 구현·자동 검증·합성 브라우저 확인 완료 / 사용자 Chrome 설치본 확인 대기**.
- 위치: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\handoff-improvement-review-d7fc22`, 브랜치 `feature/panel-flow-ux` (기준 `feature/design-language` `761e6d5`). **미커밋**.
- 서버·DB·Worker 변경, 모델 호출, 원격 전송 없음.

## 변경 파일과 동작
- `panel-shell.js`: 단계가 바뀌면 `body[data-step-dir]`에 앞/뒤 방향을 기록한다. 새 단계 시작이 화면 위로 벗어나 있으면 그 위치로 즉시 이동한다. 단계 표시는 계속 읽기 전용이다.
- `sidepanel.css`: 단계 섹션 등장 전환(220ms, 앞=오른쪽에서, 뒤=왼쪽에서). `prefers-reduced-motion: reduce`에서는 끈다. 저장 후 정리 화면 고치기 버튼 숨김.
- `sidepanel.html`: 정리 화면 제목 아래 `← 다시 말하기 고치기`·`← 읽기·구조화 고치기`와 재확인 기록 안내. 초급 `← 구조도 다시 고치기`. 기존 `읽기 준비로 돌아가기`에 화살표 표기.
- `sidepanel.js`
  - `읽기·구조화 고치기`: 작성 내용을 그대로 두고 읽기·구조화로 돌아간다. `rechecked=true`.
  - `다시 말하기 고치기`: 기존 Retell 진입 경로로 원문을 다시 가린 뒤에만 Retell을 연다. 가림에 실패하면 정리 화면에 남고 재확인 기록도 바꾸지 않는다. 성공하면 `rechecked=true`.
  - 저장 중(버튼 비활성)·저장 후(`data-saved`)·재시도 대기(`panelSubmissionPending`) 중에는 두 경로 모두 막는다. 재시도 대기 중 수정하면 이전 답안이 재전송되는 불일치를 막기 위해서다.
- `submission-panel.js`: `panelSubmissionPending()` 추가(읽기 전용 조회).
- `guided-panel.js`: 중심 생각 단계에서 `구조도 다시 고치기`가 보이고, 누르면 기존 `resumeStructuring` 경로로 구조화로 돌아간다. 중심 생각 입력은 보존되고 비활성화되며, AI 후보 요청은 다시 열지 않는다. 구조도를 다시 확인하면 중심 생각이 다시 열린다.

## 완료 기준별 검증
| 기준 | 결과 | 근거 |
|---|---|---|
| AC-01 전환 | 통과(합성) | 브라우저 하네스에서 앞으로 `step-enter-forward`, 뒤로 `step-enter-back` 적용 확인. CSS 검사로 동작 줄이기 해제 확인 |
| AC-02 정리→이전 | 통과 | `tests/panel-ux.test.cjs` 신규 2건: 내용 보존·재확인·가림 실패 시 잔류. 브라우저 하네스에서 재가림·안내 문구·이동 위치 확인 |
| AC-03 저장 후 차단 | 통과 | 신규 1건(저장 중·저장 후·재시도 대기), 하네스에서 저장 후 버튼 `display:none` 확인 |
| AC-04 초급 구조화 복귀 | 통과(자동) | `tests/extension-build.test.cjs` 초급 전체 흐름에 복귀·중심 생각 보존·AI 호출 수 1 유지 검사 추가 |
| AC-05 회귀 | 통과 | `node --test tests/*.test.*` → **293개 중 287 통과 / 실패 0 / 건너뜀 6**(기존과 같은 환경 의존 건너뜀). 신규 테스트 추가 전(코드 변경 후) 287개 중 281 통과 |

## 실제 실행
- 브라우저 확인: 앱 내장 브라우저에서 `tmp/task027/`(Git 제외)의 합성 하네스를 사용했다. 가짜 `chrome` API와 합성 문장만 쓰고 로그인·AI·원격 요청은 하지 않았다. 400px 폭에서 확인했다. 확인 뒤 하네스 서버를 종료했고 임시 `.claude/launch.json`도 지웠다.
- 발견·수정: 부드러운 스크롤(`smooth`)이 포커스 이동과 겹쳐 실행되지 않는 것을 확인하고 즉시 이동으로 바꿨다.
- 초급 블록 화면은 하네스 설정에서 꺼져 있어 브라우저로 보지 못했고, 자동 테스트로만 확인했다.

## 미검증
- 실제 Chrome 확장 설치본(사이드패널 폭, 다크 모드, 키보드 순회, 실제 기사 탭 가림/복원)에서의 사람 확인.
- 초급 블록 화면에서 `구조도 다시 고치기`의 실제 화면 배치.
- 설치본 빌드(`scripts/build-extension.cjs`)는 이번에 만들지 않았다. 새 파일이 없어 허용 목록 변경은 없다.

## Git·보안
- 미커밋, main 병합·push 없음. 다른 worktree 미편집.
- 실제 학습자 응답·개인정보·키 없음. 테스트·하네스 문장은 합성 자료다.

---

# 2차 결과 — 임시저장(C)·읽기 전 추천 반복(F)

## 결과 요약
- 상태: **로컬 구현·자동 검증·합성 브라우저 확인 완료 / 사용자 Chrome 설치본 확인 대기**. 같은 브랜치, **미커밋**. 서버·DB·Worker 변경 없음.

## 변경 파일
- `training-draft.js`(신규): 임시저장 형식 검사(허용 키·단계·길이·전체 크기), `chrome.storage.session` 어댑터, SHA-256(본문·계정 해시), 안내 문구.
- `draft-panel.js`(신규): 입력·클릭·단계 변화 뒤 0.4초 모아 저장, 패널을 다시 열면 이어가기 안내, 이어가기·삭제, 삭제 시점 연결.
- `reading-support.js`: 초급 게이트 `restore()` — 요청은 항상 닫힘, 실제 본 후보만 노출 복원, Retell은 중심 생각 단계로, 미표시 응답·진행 중 요청은 취소.
- `pdf-worksheet.js`: `snapshot()`·`restore()` — 단위 수가 같을 때만, 모두 작성했을 때만 구조도 단계로.
- `guided-panel.js`: `guidedDraft()`·`guidedResume()` — 배치·연결을 다시 쌓고 후보 목록을 되살림. AI 요청 없음.
- `sidepanel.js`: 읽기 시작을 `enterReadingView()`로, 정리 화면 구성을 `showReview()`로 분리해 이어가기와 공유. 새 연결·훈련 종료 때 임시저장 삭제. 읽기 전 추천 반복 허용(`repeatPreReadingRecommendations`).
- `pilot-ai-panel.js`·`ai-client.js`: 성공 뒤 버튼을 `본문 보내고 추천 다시 받기`로 바꾸고 다시 켬, 새 결과가 이전 결과를 대체한다는 안내.
- `records-panel.js`·`submission-panel.js`: 내 기록 이동·로그아웃 때 임시저장 삭제.
- `sidepanel.html`·`sidepanel.css`: 이어가기 안내 상자, 미저장 경고 문구를 임시저장 안내로 변경.
- `scripts/build-extension.cjs`: 신규 2개 파일을 설치본 허용 목록에 추가.

## 개인정보·학습 원칙
- 저장소는 `chrome.storage.session`(브라우저를 닫으면 삭제, 접근 수준 TRUSTED_CONTEXTS로 콘텐츠 스크립트 접근 불가). 서버 전송 없음.
- 글 본문은 저장하지 않고 해시만 둔다. 다만 답안 입력값과 초급 구조도에 놓은 원문 문장(발췌)은 저장된다. 계정은 해시, 토큰·AI 응답 원문 미저장.
- 다시 말하기·정리 단계 이어가기는 원문 재확인(`rechecked=true`)으로 기록한다. 다시 말하기는 원문을 다시 가린 뒤에만 연다.
- 초급 후보는 이어가기에서 재요청하지 않는다. 읽기 전 추천 반복은 읽기 시작 전에만 가능하며 초급 후보 재생성 정책은 바꾸지 않았다.

## 검증
| 항목 | 결과 | 근거 |
|---|---|---|
| 형식·저장소·계정 해시·안내 문구 | 통과 | `tests/training-draft.test.cjs` 신규 6건 |
| 초급 게이트·PDF 복원 규칙 | 통과 | 같은 파일 |
| 초급 구조화 중 저장 → 새 패널에서 이어가기(본문 미저장, 배치·연결·중심 생각 복원, 네트워크 0, 요청 닫힘) | 통과 | `tests/extension-build.test.cjs` 신규 |
| 다시 말하기 단계 이어가기(재가림 1회, 재확인 기록, 구조도 가림) | 통과 | 같은 파일 |
| 본문 불일치 시 이어가지 않고 유지, 삭제·훈련 종료·저장 완료 시 삭제 | 통과 | 같은 파일 |
| 읽기 전 추천 반복·대체·읽기 시작 후 차단 | 통과 | `tests/pilot-ai-panel.test.cjs` 갱신 |
| 전체 회귀 | 통과 | `node --test tests/*.test.*` → **302개 중 296 통과 / 실패 0 / 건너뜀 6** |
| 브라우저(합성 하네스, 400px) | 통과 | 다시 말하기·정리 단계에서 새로고침 뒤 안내 표시, 이어가기로 입력·가림·재확인·정리 요약 복원 확인. 저장값에 본문 없음 확인 |

## 알려진 한계·미검증
- 초급에서 유형을 바꿔 규칙에 맞지 않게 된 연결은 복원되지 않는다. 연결점 위치, 「이전 구성 화면으로 돌아가기」 상태도 복원하지 않는다.
- 글 탭을 닫았거나 주소가 바뀌면 이어갈 수 없다(같은 글을 다시 열어도 탭이 달라 이어지지 않음). 이때 임시저장은 남아 있어 직접 삭제해야 한다.
- 실제 Chrome 사이드패널을 닫았다 여는 동작, PDF 뷰어 이어가기, Google 로그인 상태의 계정 일치 확인은 사람 확인이 필요하다. 하네스는 페이지 새로고침으로 패널 재열기를 흉내 냈다.

## 설치본 (2026-11-17)
- 실제 연결 설치본: `dist/task027-flow-team5-ai-01/extension` 및 `extension.zip` (Git 제외 폴더)
  - 명령: `node scripts/build-extension.cjs --config C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading\build\task024-live-01\extension.guided.public.json --label task027-flow-team5-ai-01` (TASK-025·026과 같은 공개 설정)
  - ZIP SHA-256 `7892483064597c1c96194eaa9fbbb225a87a4fd2f19195ffedbd07dfb3ddda64`, 확장 ID `jenapgoakhnmlmjcdnkfakkkgjobbfbb`(기존과 동일)
  - 기준 `761e6d5` 위 미커밋 변경으로 빌드(`sourceDirty:true`). 커밋 SHA만으로 재현할 수 없으며 정확한 파일 근거는 `build-report.json`·`SHA256SUMS`다.
  - `training-draft.js`·`draft-panel.js` 포함, `@development` 블록·개발 설정 문자열 없음 확인. 원격 서버·DB 변경 없음.
- 설치: 미저장 훈련을 마친 뒤 기존과 같은 압축 해제 설치 폴더를 이 폴더로 교체하고 확장 프로그램 새로고침 → Google 다시 로그인.
- 사용자 확인(2026-11-17): 설치본 `task027-flow-team5-ai-01`이 「잘 작동한다」고 보고. 항목별 세부 근거(PDF 이어가기·Google 계정 일치 등)는 따로 받지 않았으므로 해당 미검증 범위는 유지한다.
