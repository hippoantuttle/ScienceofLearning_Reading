# [TASK-022] 작업 결과

## 결과 요약
- 상태: **로컬 구현·자동 검증 완료 / 2026-11-12 사용자 정상 동작 보고**. 개별 Chrome 검사 범위는 아래 참조.
- 요청서: `C:\Users\patri\ScienceofLearning_Reading\docs\tasks\TASK-022-Google-로그인-유지.md` v2.
- 브라우저 종료 전까지 Google 로그인을 유지한다. 패널·워커 재생성 시 서버 검증 후 복원하며 필요한 요청 직전에 Supabase 토큰을 갱신한다. 브라우저 재시작·확장 비활성화/새로고침/업데이트 뒤 복원은 제외한다.
- 회차 종료는 로그인 삭제 조건으로 쓰지 않는다. 기존 승인자의 기록 조회와 새 학습/AI 권한은 기존 서버 정책을 따른다.

## 변경 파일
- `session-auth.js`, `background.js` — 워커 인증 관리·session 저장소·접근 제한·서버 확인·회전 토큰 교체·동시 갱신 통합·현재 세션 로그아웃·세대 검증.
- `panel-session.js`, `account-bar.js`, `submission-flow.js`, `submission-panel.js` — 패널 복원·상태 전파·UID 결속 및 매 요청의 최신 토큰 사용. Google OAuth와 refresh token은 패널 밖으로 이동.
- `submission-http.js`, `record-client.js` — 401 시 한 번 갱신하여 같은 요청으로 재시도. 저장 내용·요청 식별자는 유지. 네트워크/5xx/권한 오류에 무조건 재전송하지 않음.
- `pilot-ai-panel.js`, `feedback-panel.js`, `records-panel.js` — 최신 인증 연결·로그아웃/계정 변경 뒤 늦은 AI 결과 차단·403 권한 거절과 로그인 만료 구분. AI 자동 재전송 없음.
- `google-auth.js`, `sidepanel.html`, `manifest.json`, `scripts/build-extension.cjs` — 워커용 Supabase 세션 반환·패널 스크립트 변경·Google 설치본에 한해 identity/storage 권한·새 모듈 패키징.
- `tests/session-auth.test.cjs`, `tests/google-auth.test.cjs`, `tests/extension-build.test.cjs` — 인증 관리자·실제 패키지 스크립트/워커 합성 통합 검사.
- 요청/결과·작업 인덱스·TASK-020 후속 조건·설치/Google 안내·변경이력 — 브라우저 수명 세션 정책 반영. 이전 사용자 결정 행은 보존.

## 완료 기준별 검증
| 기준 ID | 충족 / 미충족 / 미검증 | 검증 근거 |
|---|---|---|
| AC-01 | 합성 검사 충족 / 실제 Chrome 미검증 | 저장소를 유지한 패널·워커 재생성 뒤 사용자 확인·회원 RPC 후 복원. 비운 저장소로 새 워커 시작 시 미로그인. 패키지 복원이 OAuth·AI·기록을 자동 호출하지 않음 |
| AC-02 | 자동 검사 충족 | 만료 임박·여러 동시 요청의 단일 갱신·회전 토큰 보관·401 한 번 재시도·403 거절·일시 장애 보존·UID 불일치·로그아웃 뒤 늦은 OAuth/refresh/restore 차단 |
| AC-03 | 자동 검사·코드 점검 충족 | 전체 245 통과/실패 0/skip 0. content script/다른 확장/임의 페이지 메시지 거절·TRUSTED_CONTEXTS·패널 응답에 refresh token 없음. 기존 읽기/Retell/AI 게이트 회귀 유지 |
| AC-04 | 설치 후보·정적 검증 충족 / 실제 Chrome 수용 미검증 | 새 label로 빌드 성공. ZIP 249개 파일 CRC·SHA-256·설치 폴더 바이트·권한 일치. 브라우저 실제 lifecycle·Google 창·설치 권한 변경은 미검증 |

## 실제 실행 결과
- 실행 위치: `C:\Users\patri\ScienceofLearning_Reading`.
- 초기 전체 실행: 240 통과·5 실패. 로컬 HTTP 연결 EACCES 및 Windows PowerShell 실행 제약으로 실패.
- 승인된 직접 Node 실행: 244 통과·1 실패. 기존 UTF-8 PowerShell 검사의 Security 모듈 로드 문제. 제품 인증 실패가 아님.
- Windows PowerShell에서 해당 검사 단독 재확인: 1 통과. 이어 같은 환경으로 전체 재실행:
  `powershell.exe -NoProfile -Command "node --test tests/*.test.cjs tests/*.test.mjs > tmp/task022-tests-final.log 2>&1"`
  → **245 통과 / 실패 0 / skip 0 / 종료 0**, 약 26.5초.
- 로그: Git 제외 `tmp/task022-tests-final.log`. 이전 환경별 로그는 같은 tmp 폴더에 보관. 실제 계정·응답·원격 모델 호출 없음.
- 빌드: `node scripts/build-extension.cjs --config build/task020-google-team5-review-03/extension.google-ai-review.public.json --label task022-google-session-team5-ai-01` → 종료 0.
- 후보: `C:\Users\patri\ScienceofLearning_Reading\dist\task022-google-session-team5-ai-01\extension` 및 상위 `extension.zip`, `build-report.json`, `SHA256SUMS`.
- ZIP SHA-256: `8b09588ede99217ca51771f1e0f9b7fe9c1c45527456263e6cb8cff4e9383c0a`.
- 독립 Python zipfile/hashlib 검사: 249개 항목·CRC·각 SHA-256·설치 폴더 바이트·보고서 ZIP 해시 일치. 권한 `sidePanel, activeTab, scripting, identity, storage`.
- 빌드는 미커밋 소스 후보(`sourceDirty=true`, `chromeVerified=false`, `remoteVerified=false`). 현재 실행/배포 중인 확장을 교체하지 않았다.

## 핵심 원칙·안전 점검
- 복원/갱신은 Auth 사용자 확인 및 참여 권한 RPC만 사용한다. AI/저장/기록 자동 호출 없음. 실제 AI 요청은 기존 버튼·학습 게이트로 제한한다.
- Google 제공자 토큰·비밀번호·PKCE 검증값·학습 초안은 저장하지 않는다. Supabase refresh token은 워커와 브라우저 메모리 session 저장소에만 두고 panel/content script 메시지에 보내지 않는다. local/sync 저장소 미사용.
- 저장된 이메일이나 user_metadata로 참여 승인하지 않고 서버 사용자·확인된 Google identity·기존 회원 RPC를 검사한다. UID가 바뀐 세션으로 원래 대기 제출·수정본을 보내지 않는다.
- 오프라인/일시 5xx에는 저장 세션을 보존하되 검증 전 보호 요청은 실행하지 않는다. 확정 갱신 거절/회원 회수에는 세션을 지운다.
- 로그아웃은 로컬 제거·다른 패널 상태 갱신·현재 Supabase 세션 refresh 권한 회수를 처리한다. 회수 실패를 구분한다. 이미 발급된 JWT의 즉시 무효화나 Google 계정 전체 로그아웃은 보장하지 않는다.
- 빌드의 공개 설정/비밀 형식 검사 통과. 실제 환경파일·서명키·참가자 자료는 열람/스테이징하지 않았다. `git diff --check` 통과.

## 미해결 문제와 필요한 결정
- 2026-11-12 사용자가 「잘 된다」고 정상 동작을 보고했다. Google 로그인 유지 기능의 사용자 확인으로 기록한다. 로그인/패널 재열기/저장/기록/로그아웃 각각의 상세 실행 결과는 받지 않았으므로 개별 검사나 5인 QA 완료로 확대하지 않는다. 위 AC 표의 실제 Chrome 미검증 표시는 이 상세 검사 범위를 뜻한다.
- 실제 브라우저 종료/재시작 및 확장 reload/update 후 미로그인, 두 창 동시 사용, 실제 만료 경과를 확인해야 한다. 합성 검사가 실제 Chrome 검증을 대체하지 않는다.
- 기존 아이콘 재열기 관련 알려진 문제와 최신 UX/PDF/DeepSeek 사람 QA 미검증은 별개로 유지한다. 이번 작업에서 원격 환경이나 AI 제공자를 바꾸지 않았다.

## Git 상태
- 경로: `C:\Users\patri\ScienceofLearning_Reading`, 브랜치 `feature/google-session`, 기준 HEAD `b7e5d05`.
- 사용자 후속 지시로 이번 구현·문서·검사를 로컬 커밋에 보존한다. 식별자는 이 문서를 포함한 커밋의 git log로 확인한다. main 병합·원격 push·배포 없음.
- 기존 `.claude/`는 untracked 그대로이며 다른 worktree 미편집. build/dist/tmp와 OS 임시 폴더 인계는 커밋하지 않는다.

## PM 검토 (PM 작성)
- dev가 실제 diff·자동 검사·독립 패키지 검증을 점검했다. 사용자 정상 동작 보고는 확보했으며 미보고 상세 검사와 팀원 QA는 별도로 유지한다.
