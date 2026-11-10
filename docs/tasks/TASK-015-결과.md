# [TASK-015] 작업 결과

## 결과 요약
- 상태: **부분 완료 — 로컬 구현·합성 검증 완료, 실환경 적용·Chrome 재열기 검증 대기**
- 요청서 경로·버전: docs/tasks/TASK-015-수정본-저장-확장-내-재조회.md v2.
- 2026-11-10 사용자 후속 지시(최신 브랜치·handoff를 읽고 필요한 task 수행)에 따라 지정된 feature/revision-storage worktree에서 단독 착수했다.
- 구현: 최초본 불변 수정 이력, 멱등 저장·별도 재조회, 패널 수정본 저장, 본인 최근 기록·페이지·최초본/선택 수정본 비교, 독해 종료/원문 복원 게이트.
- 구체 설계·API·선택 메타데이터·삭제/백업 한계는 [저장설계](TASK-015-저장설계.md)에 기록했다. TASK-015 전체 완료나 TASK-017 단독 설치 버전 수용으로 간주하지 않는다.

## 변경 파일
- record-contract.js / record-client.js — 수정본 계약, HTTPS 기록 API, 15초 timeout, 실패 뒤 동일 요청 재시도와 별도 재조회 일치 검사.
- server/submissions/records.mjs / worker.mjs — 기존 제출 호환, 본인 기록 목록·원본·수정 이력·멱등 저장 API.
- server/migrations/20261110045614_revision_storage.sql — 검토용 초안. 복합 FK·본인/활성 회원 RLS·INSERT 열 권한·원본 연쇄 삭제·목록 인덱스.
- feedback-panel.js / submission-panel.js / submission-flow.js / account-bar.js — 저장 UI, 미저장/저장 구분, 인증 만료 시 입력 유지, 재로그인.
- records-panel.js / sidepanel.html / sidepanel.css / sidepanel.js — 확장 내 기록 UI, 선택 메타데이터 동의, 종료/복원 확인, 과거 응답 폐기와 화면 전환 경합 방지.
- tests/records-db.test.mjs / records-panel.test.cjs / feedback-panel.test.cjs — DB·API 합성 통합 및 패널 상태 검증.
- 요청서·README·변경이력·저장설계·이 보고서·새 handoff — 상태와 후속 작업 기록.

## 후속 디버깅: 수정본 저장의 invalid (2026-11-10)
- 사용자 보고: 수정본 저장 클릭 시 연결 실패 문구와 invalid 응답 발생.
- 읽기 전용 확인: 원격 DB의 pilot_revisions가 없고 article_title/source_url 열도 0개다. 새 제약 이름 충돌은 없으며 기존 RLS는 활성 상태다. 제출 Worker 최신 배포는 2026-11-10 08:47 KST로 이번 수정본 API 구현 이전이다.
- 원인 재현: e00b2ce의 기존 Worker에 합성 수정본 요청을 보냈더니 400 / error=invalid가 재현됐다. 기존 서버는 신규 경로를 구분하지 않고 최초 제출 형식으로 검사한다. 클라이언트도 400을 일반 연결 실패로 표시하고 있었다. DB 미적용 문제도 별도로 존재한다.
- 수정: 인증된 capabilities 준비 검사에서 limit=0으로 스키마/관계만 검사한다. 미지원 서버는 records_api_unavailable, 테이블/열/관계 미준비는 records_schema_missing으로 구분한다. 준비 실패 시 답안 POST는 0회이며, 실패한 식별자·입력은 유지한다. HTTP 400 입력 거절도 연결 실패와 구분한다.
- 검증: 구형 Worker 실제 코드 재현 도구에서 legacyPostStatus=400, legacyBody.error=invalid, 수정 클라이언트의 guardedPostCount=0 확인. tests/records-readiness.test.mjs 등 대상 23개 통과, 전체 **156개 통과 / 실패 0 / skip 0 / 종료 0**.
- Worker deploy --dry-run 재검증: 18.64 KiB, 종료 0. 실제 배포·실환경 DB 변경은 하지 않았다. 실제 자료·비밀 파일은 읽지 않았다.
- 적용 준비안: server/migrations/20261110045614_revision_storage.sql 적용(원본 불변·수정본 RLS/FK·입력 열 권한·스키마 캐시 갱신) → reading-submissions-pilot만 기존 변수/공개 키/Origin을 유지하여 배포 → 준비 응답·인증/권한·합성 저장/재조회 검증. AI Worker·main·push는 범위 밖.
- 요청서의 별도 승인 규칙에 따라 위 실환경 적용은 승인 대기다. 패널의 미저장 입력이 있으므로 점검 중 확장을 새로고침하거나 재시작하지 않았다.

## 완료 기준별 검증
| 기준 ID | 충족 / 미충족 / 미검증 | 검증 근거 |
|---|---|---|
| AC-01 | 로컬 부분 충족 / 실환경 미검증 | 실제 PostgreSQL WASM에서 최초본 불변·여러 수정본·새 클라이언트 동일 기록 재조회 통과. 실제 확장 종료·재열기·재로그인과 원격 영속성은 미검증 |
| AC-02 | 로컬 부분 충족 / 실제 Chrome 미검증 | 빈 목록·10개 페이지·추가 이력·글 정보 없는 기록·이전 articleSession 없는 상세 조회를 합성 검증. IAB 320px 합성 미리보기에서 긴 제목과 방향키 수정본 선택·항목별 비교를 관찰 |
| AC-03 | 로컬 충족 / 실환경 미검증 | 동일 요청 동시 재시도·상이 내용 409·응답 유실·오프라인·401/403/404 구분·재조회 불일치·실패 후 입력 보존 검증. 실제 Auth 만료/네트워크 장애는 미검증 |
| AC-04 | 로컬 충족 / 실환경 미검증 | 합성 A/B 활성·C 비활성·미인증·타인 조회/저장 거절. 실제 SQL 역할에서 RLS와 복합 FK로 타인 원본 연결 거절, 익명 SELECT/수정본 UPDATE/DELETE/시각·id 위조 INSERT 거절. 잘못된 Origin/Origin 없는 POST 거절 |
| AC-05 | 로컬 충족 / 실환경·백업 미검증 | 원본 삭제 후 연결 수정본 0개, 원본·특정 수정본·재저장 404, 선택 글 정보도 목록에서 사라짐. 사용자 담당·종료 후 30일 이내 삭제·관리자 경로·백업 한계 문서화 |
| AC-06 | 로컬 충족 / Chrome 전체 회귀 미검증 | 최신 전체 156개 통과(기존 AI 추천/피드백/Retell 포함). 이동 취소·복원 실패 시 기록 조회 없음, 종료·복원 후 조회, 새 훈련/로그아웃 뒤 늦은 응답 폐기. 기록 조회의 AI 호출·기사 전문/피드백 신규 저장 없음 |

## 실제 실행 결과
- 실행 위치: C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\local-git-status-task-progress-a93081.
- 로컬 DB 의존성: npm install --no-save --package-lock=false --prefix tmp/task015 @electric-sql/pglite@0.5.16. 무시되는 tmp 아래에만 설치했다. 미설치 환경에서는 DB 테스트 1개가 명시 skip되므로 전체 통과로 보고하면 안 된다.
- 대상 검증: node --test tests/records-db.test.mjs tests/records-panel.test.cjs tests/feedback-panel.test.cjs tests/worksheet.test.cjs tests/account-bar.test.cjs tests/panel-shell.test.cjs — **24개 통과, 0 실패, 종료 0**.
- 최종 전체: powershell.exe -NoProfile -Command 'node --test' — **156개 통과, 0 실패, 0 skip, 종료 0**. 최초 구현 시 152개에서 서버 준비 검사 4개를 추가했다.
- 환경 차이: 최초 샌드박스 실행은 기존 루프백 연결·PowerShell 실행 제한으로 실패했다. 제한 밖 직접 node 실행은 150/151, Windows PowerShell 모듈 로드 1개 실패. 같은 검사를 Windows PowerShell에서 명시 실행하자 단독·전체가 통과했다. 테스트 코드·OS 보안 설정은 변경하지 않았다.
- Worker: 캐시된 Wrangler 4.158.0의 deploy --dry-run --config wrangler.submissions.jsonc --outdir tmp/task015-worker — **종료 0**, 17.68 KiB 번들 생성, 업로드·배포 없음. 최초 실행의 로그 쓰기 제한은 제한 밖 재검증으로 해소했다.
- Supabase: 연결된 기존 프로젝트에서 열·RLS·정책·권한 **메타데이터만 읽기 전용 조회**. 최초본 SELECT/INSERT와 수정본 미존재를 확인했다. 실제 사용자·답안·비밀 파일은 읽지 않았다.
- 최종 정적 점검: 변경·추가 파일 23개, JS 구문 14개, 내부 링크 16개·HTML id 111개 중복 없음, 시크릿 패턴 검출 0·스테이징 0. git diff --check 종료 0. 루트 worktree도 변경 없이 유지했다.
- 브라우저: 별도 IAB에서 실제 HTML/CSS/패널 코드와 합성 API만 사용한 320px 미리보기. 목록·정보 없음·선택 상세·방향키 수정본 전환·줄바꿈 관찰. 사용 중인 확장/로컬 AI 서버 재시작 없음. 이 관찰은 원격 DB나 Chrome 확장 재열기 성공 근거가 아니다.
- 공개 가능한 근거: 위 합성 테스트 소스와 저장설계. 실제 응답·인증값·개인 자료·원본 로그는 보고서에 넣지 않았다.

## 핵심 원칙·안전 점검
- 읽기 중 개입 차단: 기록 화면으로 이동하기 전 훈련 종료 동의·원문 복원을 확인하고 추천/피드백 세대 및 articleSession을 초기화한다. 취소/복원 실패는 조회 전 차단한다.
- 초안 자동 보관·기존 지식 제출·AI 결과 지속 저장·기록 조회 시 AI 요청을 추가하지 않았다. 실패한 수정본은 메모리에만 유지한다.
- 글 정보는 자동 수집하지 않는다. 선택한 공개 제목·출처 사이트 origin만 별도 동의로 제출한다. 기존 기록에는 값을 추정하지 않는다.
- 시크릿·개인정보: 변경/추가 경로·내용만 점검. 실제 .env·.dev.vars·submission-config.local.js·개인 서명키·참가자 자료 열람/스테이징 없음. 브라우저와 DB 테스트에는 합성값만 사용했다.
- 기존 제출·AI 추천·피드백·Retell의 로컬 회귀가 통과했다. 실제 Chrome 다중 창·동적 페이지·복구는 후속 실검증 대상이다.

## 미해결 문제와 필요한 결정
- 요청서의 실환경 경계에 따라 DB 마이그레이션·Worker 배포·실제 데이터 전송은 실행하지 않았다. 현재 원격 Worker/DB만으로 새 기록 UI가 작동한다고 가정하지 않는다.
- 승인 후 현재 DB advisors·스키마 차이·PostgREST 중첩 관계/커서 처리와 두 합성 사용자·비활성자·직접 DB 권한을 재검증해야 한다.
- 실제 확장 재열기·재로그인·여러 수정본 조회·독해 중 차단·원문 복원·삭제를 Chrome에서 검증해야 한다.
- 선택 글 정보 동의와 실제 전송 범위, 백업/PITR 보존·export·복구 후 재삭제 절차는 운영 전에 검토한다.
- TASK-014 잔여 UX 및 TASK-017 빌드/재열기 결함 해결은 다음 순서다. 전체 AC가 수용되지 않은 상태에서 파일럿 운영·웹 개발 완료를 주장하지 않는다.

## Git 상태
- 작업 경로·브랜치: 위 worktree / feature/revision-storage. 루트 feature/week1-extension은 편집하지 않았다.
- 시작 HEAD: e00b2ce. 사용자가 2026-11-10 세션 종료·handoff·로컬 커밋을 명시 승인했다. 이 결과·코드·SQL 초안·테스트·최신 handoff를 포함한 세션 종료 커밋으로 보존하며 식별자는 git log로 확인한다.
- main 병합·원격 push·배포·실환경 DB 변경 없음.
- 스테이징 내용의 경로·시크릿·개인정보·diff 검사를 거쳐 명시된 세션 변경만 커밋한다. 실환경 적용은 이번 세션에서 진행하지 않기로 했으며 다음 작업자는 [최신 handoff](../handoff/2026-11-10-TASK-015-세션종료.md)를 따른다.

## PM 검토 (PM 작성)
- 실제 diff·실행 근거 확인: 대기.
- 수용 / 수정 요청 / 사용자 판단 필요: 실환경 적용 및 검증 승인 필요.
- 남은 위험: 위 실환경·Chrome·백업 미검증. 로컬 결과만으로 전체 완료 처리하지 않는다.
