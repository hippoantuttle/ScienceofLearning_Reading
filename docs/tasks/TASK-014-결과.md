# [TASK-014] 작업 결과

## 결과 요약
- 상태: 부분 완료 (1단계 구현·자동 테스트·사용자 Chrome 확인 완료. 2·3단계 미착수)
- 요청서 경로·버전: docs/tasks/TASK-014-사이드패널-UX-개선.md v2
- 구현 내용 (1단계):
  - 개발·모의 도구(가상 전송 미리보기, 가상 예문 AI 추천, 로컬 모의 토큰, 합성 예시 모의 저장)를 `details.dev-only`로 묶었다. 기본값은 `hidden` + `inert`이고, AI 엔드포인트가 http 루프백일 때만 표시한다(D-1).
  - 읽기 준비 순서를 다음과 같이 바꿨다: 1. 글 연결 → 2. 기존 지식 떠올리기(제출·저장 안 됨 표시, D-4) → 3. AI 핵심 용어·배경 추천(선택) → 「읽기·구조화 시작」. 2·3단계와 시작 버튼은 글을 연결한 뒤에만 보인다.
  - 로그인을 상단 계정 바 하나로 통합했다. 로그인 상태(이메일)와 로그아웃을 표시한다. 제출 화면의 별도 로그인을 제거했다.
  - 새 시도(글 재연결)에서도 로그인이 유지되도록 했다. `SubmissionFlow`에 `adopt`·`getIdentity`를 추가했으며, 대기 중인 제출이 있는 flow에는 로그인을 옮기지 않는다. 이전에는 로그인 뒤 글을 연결하면 토큰이 초기화되었다.
  - 단계 표시를 5단계(읽기 준비 / 읽기·구조화 / 다시 말하기 / 정리·제출 / 피드백·수정)로 확장했다. 현재 단계는 `aria-current="step"`, 지난 단계는 완료로 표시한다.
  - 디자인 토큰(라이트/다크)과 버튼 위계(primary / 기본 / quiet)를 정의하고, 포커스 링과 비활성 표시를 추가했다.

## 변경 파일
- `sidepanel.html` — 계정 바, 5단계 표시, 읽기 준비 재배치, 개발자 도구 묶음, 제출 영역 로그인 제거, 버튼 클래스
- `sidepanel.css` — 토큰·버튼 위계·계정 바·단계 표시·개발자 도구 스타일
- `account-bar.js` (신규) — 단일 로그인·로그아웃·상태 표시
- `panel-shell.js` (신규) — 개발자 도구 노출 판정, 단계 표시 갱신(MutationObserver)
- `ai-client.js` — `isLoopbackEndpoint` 공용 판정 추가
- `sidepanel.js` — 반복 추천 허용 판정에 공용 함수 사용(동작 동일)
- `pilot-ai-panel.js` — 로그인 핸들러를 계정 바로 이동
- `submission-flow.js` — `adopt`, `getIdentity` 추가
- `submission-panel.js` — 새 시도 시 로그인 유지, `panelSignOut`, 제출 화면 로그인 제거, 미로그인 제출 안내
- `tests/account-bar.test.cjs`, `tests/panel-shell.test.cjs` (신규), `tests/submission-flow.test.cjs` (adopt 테스트 추가)
- `tests/pilot-ai-panel.test.cjs`, `tests/submission-panel.test.cjs`, `tests/submission-membership.test.cjs` — 로그인 버튼 이동에 맞춰 호출 경로 수정(검증 내용 유지, 로그인 시 비밀번호 비움 검증은 account-bar 테스트로 이동)

## 완료 기준별 검증
| 기준 ID | 충족 / 미충족 / 미검증 | 검증 근거 |
|---|---|---|
| AC-01 | 충족(1단계 범위) | HTML 정적 검사: 읽기 준비 첫 컨트롤이 `analyze`. 개발 도구 기본 숨김, 로그인 입력 1곳. 380px 폭 정적 렌더링 확인. 2026-11-10 사용자가 실제 Chrome에서 UX 전체가 정상 동작한다고 보고(dev 직접 관찰 아님) |
| AC-02 | 미검증 (2·3단계 범위) | 인라인 오류·Retell 문구는 2·3단계 |
| AC-03 | 충족(자동 테스트) | 읽기 시작 후 AI 차단·지연 응답 폐기·Retell 가림 관련 기존 테스트 전부 통과 |
| AC-04 | 부분 | 토큰 대비 계산(본문·버튼 AA 이상), 포커스 링 추가. 비활성 이유 연결은 3단계. 키보드 실사용·다크 모드 실제 렌더링 미확인 |

## 실제 실행 결과
- 실행 위치: 위 worktree, Node v24.18.0
- 명령: `node --test tests/*.test.cjs tests/*.test.mjs`
- 실제 결과: 141개 테스트 전부 통과(실패 0)
- 수동 확인: 브라우저 패널에서 sidepanel.html 정적 렌더링(380px)으로 레이아웃 확인. Chrome 확장 API가 없는 상태라 단계 전환·로그인·개발 도구 표시 전환은 확인하지 못함.
- 사용자 확인(2026-11-10): 실제 Chrome에서 1단계 UX가 모두 정상 동작한다고 보고. AI 추천·피드백의 connection refused는 로컬 AI Worker(8793) 미실행이 원인이었고, Worker 재실행 후 정상 동작한다고 보고.
- dev가 직접 관찰하지 못한 항목: 실제 Chrome 화면, 다크 모드 렌더링.
- 민감정보: `submission-config.local.js`, `.dev.vars`는 열람·출력하지 않음.

## 핵심 원칙·안전 점검
- 읽기 중 AI 개입 차단: 게이트·`pilotAiStartReading` 로직은 변경하지 않음. 관련 테스트 통과. AI 결과 영역은 읽기 준비 섹션 안에 있어 읽기 화면에서 보이지 않음(D-3).
- 시크릿·개인정보: 토큰·이메일은 패널 메모리에만 있음. 비밀번호는 로그인 시도 직후 비움. 저장소에 실제 값을 추가하지 않음.
- 개발 도구 숨김은 화면 표시 통제일 뿐이며 서버 측 제한을 대신하지 않음.
- 기존 기능 영향: 로그아웃 시 피드백 화면이 초기화되므로, 대기 중이거나 완료된 제출이 있으면 확인을 거침. 새 시도에서 로그인이 유지되도록 동작이 바뀜(의도된 수정).

## 미해결 문제와 필요한 결정
- 원격(https) AI 엔드포인트에서 개발 도구가 숨겨지는지는 자동 테스트로만 확인.
- Supabase 액세스 토큰 만료(장시간 사용) 시 재로그인 안내는 기존과 같음(미개선).
- 요청서는 별도 worktree를 제안했으나, 로컬 설정 파일을 복사하지 않기 위해 기존 worktree에서 새 브랜치로 전환함.

## Git 상태
- 작업 경로·브랜치: `.claude/worktrees/local-git-status-task-progress-a93081`, `feature/sidepanel-ux` (기준 `feature/ai-worker-pilot` 5c06884)
- 커밋 여부: `feature/sidepanel-ux`에 로컬 커밋(문서·기능 2개)
- main 병합 여부: 아니오
- 원격 push 여부: 아니오
- 남은 미커밋 변경: 없음(커밋 시점 기준)

## PM 검토 (PM 작성)
- 실제 diff·실행 근거 확인:
- 수용 / 수정 요청 / 사용자 판단 필요:
- 남은 위험:
