# [TASK-015] 작업 결과

## 결과 요약
- 상태: **부분 완료 — 원격 DB·API 검증 완료, 재로그인 후 내 기록 조회·학습 흐름은 사용자 정상 보고 / 제목 자동 입력 개선은 로컬 구현·검증 완료, 새 UI·PM 수용 대기. 운영 조건 점검은 실험 이후 보류**
- 요청서 경로·버전: docs/tasks/TASK-015-수정본-저장-확장-내-재조회.md v2.
- 2026-11-10 사용자 후속 지시(최신 브랜치·handoff를 읽고 필요한 task 수행)에 따라 지정된 feature/revision-storage worktree에서 단독 착수했다.
- 구현: 최초본 불변 수정 이력, 멱등 저장·별도 재조회, 패널 수정본 저장, 본인 최근 기록·페이지·최초본/선택 수정본 비교, 독해 종료/원문 복원 게이트.
- 구체 설계·API·선택 메타데이터·삭제/백업 한계는 [저장설계](TASK-015-저장설계.md)에 기록했다. TASK-015 전체 완료나 TASK-017 단독 설치 버전 수용으로 간주하지 않는다.

## 최신: 내 기록 사용자 확인·탭 제목 자동 입력 (2026-11-10)

- 사용자 「잘 동작 한다」 보고: 같은 계정 재로그인 → 내 기록 선택 → 최초본/수정본 조회 경로를 설명한 뒤 정상 동작을 보고했다. dev의 직접 Chrome 관찰이나 모든 장애 시나리오 통과로 확대하지 않는다.
- 작업 ID TASK-015 v2, 저장소 `C:\Users\patri\ScienceofLearning_Reading`, 실제 작업·요청서 `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\local-git-status-task-progress-a93081\docs\tasks\TASK-015-수정본-저장-확장-내-재조회.md`의 후속 제목 개선으로 단독 진행했다.
- 사용자 탭 제목 저장 요청에 따라 `sidepanel.js`에서 글 연결·URL 일치 확인 후 해당 탭 제목을 기존 선택 제목란에 자동 입력한다. 제출 때 다른 활성 탭을 다시 읽지 않으며, 새 글 연결·실패 시 이전 제목/동의를 초기화한다. 제목 없음은 본문 연결을 막지 않는다.
- 제목의 제어문자·잘못된 유니코드를 정리하고 200 UTF-16 단위 안에서 서로게이트 쌍을 보존한다. `sidepanel.html`의 제목 영역을 기본으로 펼쳐 저장 전에 확인·수정·삭제할 수 있게 했다. 별도 저장 동의는 기본 미선택으로 유지하며, 동의한 제목만 기존 articleTitle 필드로 전송한다. sourceUrl은 수동 선택이고 제목만 저장도 가능하다.
- 기존 API·DB 열·내 기록 제목 표시를 재사용한다. DB 변경·재배포·실제 자료 전송·AI 호출·커밋·push·main 병합 없음. 제목이 없는 과거 기록을 추정·수정하지 않으며 새 제출부터 적용된다. 확장 새로고침 전 미저장 입력 보존이 필요하다.
- 테스트: `tests/article-title.test.cjs`에 연결한 탭 제목·재연결 초기화·제어문자/유니코드·탐색/추출 실패·제목 없음·수정/비동의 전송 제외를 추가했다. 구현 전 새 검사 중 제목 자동 채움 2개 실패, 최종 대상 25개 통과·0 실패. 전체 `powershell.exe -NoProfile -Command 'node --test'` → **164 통과 / 실패 0 / skip 0 / 종료 0**. `node --check sidepanel.js` 종료 0. 새 제목 UI의 실제 Chrome 관찰은 미실시다.

## 이전 사용자 확인·점검 시점 변경 (2026-11-10)

- 사용자 「2번항목은 잘 된다」 보고: 직전 점검 안내의 독해 중 과거 답안 차단·Retell 종료 시 원문 복원·저장 실패 시 입력 유지에 대한 사용자 정상 보고로 기록한다. dev 직접 Chrome 관찰이나 개별 장애 재현 근거로 확대하지 않는다.
- 사용자 「1번 항목은 서버를 켜줘야 할 것 같다」: 실제 Chrome 저장→종료/재열기→재로그인→최초본/수정본 조회는 아직 확인 대기다. 해당 저장/조회는 원격 API를 사용해 로컬 AI 서버 없이도 동작해야 하며, 로컬 AI 서버 시작만으로 이 AC가 충족됐다고 보지 않는다.
- 요청에 따라 로컬 AI 서버를 `127.0.0.1:8793`에 시작했다. 인증 없는 POST가 401로 차단됨을 확인했고 AI·Supabase 호출은 보내지 않았다. 실행·종료 방법은 [로컬 서버 안내](../로컬서버-실행.md)에 보존했다. 프로세스는 다음 세션에 다시 확인한다.
- 사용자 「3번 항목은 실험 이후로 미뤄줘」: 직전 안내의 운영 조건 점검(삭제 담당·기한 확인, 백업 보존·복구 후 재삭제 절차)을 **실험 이후로 연기**한다. 이번 변경은 점검 시점 변경이며 해당 항목을 검증 완료로 처리하거나 기존 삭제 규칙을 폐기하는 것은 아니다. 요청서·변경이력·handoff에도 반영했다.
- 기능 코드·저장 정책·AI 전송 범위·Git 권한은 변경하지 않았다.

## 실환경 적용·합성 검증 (2026-11-10 후속 승인)

- 사용자 「다음 범위를 진행해줘」에 따라 [적용안](TASK-015-적용전-검토.md)의 DB 마이그레이션·제출 Worker 배포·기존 합성 계정 검증을 실행했다. 실제 참가자 자료·AI 호출·Git 작업 권한으로 확대하지 않았다.
- DB: 전용 `mxhlxenfboiaywyhgyqs`에 `server/migrations/20261110045614_revision_storage.sql` 적용 성공. 원격 이력은 MCP가 부여한 `20261110063133 / revision_storage`이며, 로컬 파일과의 매핑을 이 기록으로 보존한다. SQL 파일 SHA-256: `22EB4BD61D6AD21743F95F3F73B0184901F4CA84D9EE7B97A47CE8AF8EE2E6E0`.
- 적용 후 카탈로그 재조회: 두 테이블 RLS 활성, 수정본 본인 SELECT/INSERT 정책, 소유자 복합 FK와 ON DELETE CASCADE, 수정본 ID/시각 INSERT·UPDATE·DELETE 및 최초본 UPDATE 권한 없음 확인. 최초본 입력 열 INSERT는 유지한다.
- Worker: Wrangler 4.158.0 `deploy --config wrangler.submissions.jsonc --keep-vars --strict --message task015-revision-storage`, 종료 0, 18.64 KiB. 현재 버전 `5686793f-653b-457e-8d67-214e0f45e7e2`, 배포 주소 `https://reading-submissions-pilot.patrick020308.workers.dev`.
- 복구 기준: 직전 Worker 버전 `234ba782-17fb-40c9-8f38-ffee8d15e4d4`. 배포 후 버전 메타데이터에서 기존 Supabase URL·정확한 확장 Origin 값 일치와 `SUPABASE_ANON_KEY` secret 바인딩 유지를 확인했다. 키 값은 출력하지 않았다. Worker 버전 복구는 DB 마이그레이션을 되돌리지 않으며 기존 자료·테이블을 임의 삭제하지 않는다.
- 실제 실행: `node scripts/verify-records-remote.cjs C:/Users/patri/ScienceofLearning_Reading/.env.supabase-test` → **종료 0**. 첫 실행 뒤 직접 쓰기 거절을 `403 / PostgreSQL 42501`로 강화한 최종 실행도 종료 0. 로컬 비밀 파일은 Git 제외·미추적 확인 후 도구 안에서만 읽었고 값·계정·답안·행 식별자는 출력하지 않았다.
- 두 활성 합성 계정·별도 비활성 계정의 실제 Auth와 배포 Worker/실제 PostgREST를 사용했다. 준비 응답, 최초본 저장/동일 재전송/내용 충돌, 별도 재조회 일치, 동시 같은 수정 요청, 다른 내용 충돌, 저장 응답 유실 후 동일 요청 재확인, 새 클라이언트 조회, 최초본 불변, 선택 메타데이터를 확인했다.
- 각 실행에서 최초본 12개(A 11·B 1)와 수정본 12개를 생성해 10개 단위 커서 페이지·중복 없는 이력·수정본 표시·타인 목록 배제를 확인했다. B·비활성 C의 API/직접 DB 타인 조회, 타인 원본 연결·owner 위조, ID/시각 입력, UPDATE/DELETE와 비인증·잘못된 Origin·Origin 없는 POST를 차단했다.
- 각 실행의 finally에서 **시험 소유자 + 무작위 세션 조건으로 생성한 최초본만 삭제하고 0행 재조회**했다. 주 시험 원본의 연결 수정본 0행과 API 상세/수정 이력/요청별 재조회/재저장 404를 확인했다. 두 실행 모두 `deleted=true`, `cascadeVerified=true`. 테스트 계정과 기존 멤버십은 삭제·변경하지 않았다.
- 검증 도구·모의 안전 테스트를 저장소에 추가했다. 대상 불일치 시 무호출, 응답 실패 뒤 제한 삭제/재조회, 정리 실패 시 실패 처리, 일반 Node 테스트에서 실환경 비밀 읽기·호출 없음의 **4개 통과**. 전체 회귀 `powershell.exe -NoProfile -Command 'node --test'` → **160 통과 / 실패 0 / skip 0 / 종료 0**. 마지막 권한 코드 강화 뒤 실환경 재검증도 통과했다.
- 적용 전후 보안 advisors는 기존 INFO 1·WARN 2로 동일하다([기존 항목과 근거](TASK-015-적용전-검토.md)). 성능은 기존 최초본 auth 함수 호출 WARN 2 외 새 인덱스의 unused INFO와 복합 FK covering-index INFO가 있다. 후자는 FK 순서가 submission_id/owner_id, 인덱스가 owner_id/submission_id인 상태다. 합성 상수로 해당 두 열 동등 조회 EXPLAIN에서 `pilot_revision_recent`의 Index Only Scan과 두 열 Index Cond를 확인했으므로 중복 인덱스를 추가하지 않았다. [외래 키 진단](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused index 진단](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). 대량 데이터·실제 연쇄 삭제 부하는 별도 미검증이다.
- 실제 Chrome 화면·확장 재열기·Auth 만료·브라우저 오프라인·가림 복원·백업/PITR·운영 동의는 이 실행으로 검증하지 않았다. 확장·로컬 AI 서버를 재시작하지 않았으며 AI Worker·공급자 호출·실제 사용자 자료·커밋·push·main 병합은 없다. 다음 인계: [실환경 적용 후](../handoff/2026-11-10-TASK-015-실환경적용후.md).

## 변경 파일
- record-contract.js / record-client.js — 수정본 계약, HTTPS 기록 API, 15초 timeout, 실패 뒤 동일 요청 재시도와 별도 재조회 일치 검사.
- server/submissions/records.mjs / worker.mjs — 기존 제출 호환, 본인 기록 목록·원본·수정 이력·멱등 저장 API.
- server/migrations/20261110045614_revision_storage.sql — 검토용 초안. 복합 FK·본인/활성 회원 RLS·INSERT 열 권한·원본 연쇄 삭제·목록 인덱스.
- feedback-panel.js / submission-panel.js / submission-flow.js / account-bar.js — 저장 UI, 미저장/저장 구분, 인증 만료 시 입력 유지, 재로그인.
- records-panel.js / sidepanel.html / sidepanel.css / sidepanel.js — 확장 내 기록 UI, 선택 메타데이터 동의, 종료/복원 확인, 과거 응답 폐기와 화면 전환 경합 방지.
- tests/records-db.test.mjs / records-panel.test.cjs / feedback-panel.test.cjs — DB·API 합성 통합 및 패널 상태 검증.
- 요청서·README·변경이력·저장설계·이 보고서·새 handoff — 상태와 후속 작업 기록.

## 후속 재검토 및 보강 (2026-11-10)
- 최신 handoff와 실제 Git을 대조해 `feature/revision-storage` / `aba146a`의 깨끗한 worktree에서 시작했다. 사용자 최신 지시에 따라 TASK-015 검토·로컬 보강을 단독 진행했으며 다음 TASK의 수용 선행 조건은 유지한다.
- 발견·수정: 수정본 저장 응답과 별도 재조회에 ID가 모두 없으면 `undefined === undefined`로 비교를 통과해 완료 처리될 수 있었다. `record-client.js`에서 저장 응답의 ID가 비어 있지 않은 문자열인지 먼저 검사한다. 실패 시 기존 요청과 입력을 유지한다.
- 회귀: `tests/records-panel.test.cjs`에 ID 누락/null/빈 문자열/공백/숫자/객체 응답 거절과 이후 같은 요청·내용으로 재확인하는 검사를 추가했다. 수정 전 7 통과·1 실패(`Missing expected rejection`), 수정 후 관련 17 통과·0 실패·0 skip.
- 최신 전체: Windows / Node v24.18.0, `powershell.exe -NoProfile -Command 'node --test'` → **157 통과·0 실패·0 skip·종료 0**. 최초 샌드박스 실행의 루프백 EACCES·PowerShell AuthorizationManager 실패는 권한 확장 실행에서 해소됐다. OS 정책과 테스트 동작은 변경하지 않았다.
- 원격 DB는 메타데이터와 advisors만 읽었다. 수정본 테이블·글 정보 열은 여전히 없고 최초본 RLS는 활성, authenticated의 테이블 권한은 SELECT·INSERT뿐이다. 새 제약·인덱스 이름 충돌은 없다. 실제 사용자/답안/인증값은 조회하지 않았다.
- 적용 대상·순서·기존 advisor 항목과 미검증은 [적용 전 검토](TASK-015-적용전-검토.md)에 정리했다. 이번 코드 보강은 기존 저장 확인 기준을 충족하기 위한 수정이며 저장 범위·설계 결정 변경은 없다.
- 이번 후속 변경은 미커밋이며 스테이징·main 병합·push·배포·원격 DB 변경·실환경 합성 전송은 하지 않았다. TASK-015 전체 AC와 PM 수용은 계속 대기다.

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
| AC-01 | 원격 API 부분 충족 / 사용자 정상 보고 | 실제 DB·배포 API에서 최초본 불변·여러 수정본·새 클라이언트 재조회 성공. 내 기록 경로 안내 후 사용자가 정상 동작 보고. dev의 실제 Chrome 직접 관찰은 없음 |
| AC-02 | 원격 API·로컬 UI 부분 충족 / Chrome 미검증 | 실제 원본/수정본 커서 페이지·수정본 유무와 로컬 빈 목록·글 정보 없는 기록 검증. 이전 IAB 320px 관찰은 실제 확장 성공 근거와 구분 |
| AC-03 | 원격 합성 API 부분 충족 / 브라우저 장애 미검증 | 실제 동시 멱등·충돌·저장 응답 유실 후 재확인·삭제 후 404. 로컬 ID 누락/재조회 불일치·입력 보존 통과. 실제 Auth 만료·Chrome 오프라인은 대기 |
| AC-04 | 실환경 제한 사례 충족 | 두 활성·비활성·비인증·타인·직접 DB owner/FK·id/시각 위조·UPDATE/DELETE·Origin 차단 확인. 카탈로그 RLS/권한도 재조회. 전체 권한 정책의 형식적 증명은 아님 |
| AC-05 | 실환경 합성 삭제 충족 / 백업 미검증 | 각 실행의 시험 원본 12개 삭제·0행 확인 및 연결 수정본 0행·API 재접근/재저장 404. 사용자 담당·보관 기간·백업 한계 문서화. 실제 백업/PITR 검증은 대기 |
| AC-06 | 로컬 충족 / Chrome 전체 회귀 미검증 | 제목 개선 후 전체 164 통과·0 skip. 독해 중 조회 차단·취소/복원 실패·늦은 응답 폐기는 모의 DOM 근거 및 일부 사용자 정상 보고. AI 호출·원문/피드백 신규 저장 없음 |

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
- 최신 제목 개선: 연결한 탭 제목은 로컬 입력란에 자동 채우고 사용자 확인·수정과 별도 동의 후 제출한다. 기사 URL은 자동 수집하지 않고 사이트 origin만 직접 입력할 수 있다. 기존 기록에는 값을 추정하지 않는다.
- 시크릿·개인정보: 변경/추가 경로·내용만 점검. 실제 .env·.dev.vars·submission-config.local.js·개인 서명키·참가자 자료 열람/스테이징 없음. 브라우저와 DB 테스트에는 합성값만 사용했다.
- 기존 제출·AI 추천·피드백·Retell의 로컬 회귀가 통과했다. 실제 Chrome 다중 창·동적 페이지·복구는 후속 실검증 대상이다.

## 미해결 문제와 필요한 결정
- 최신 상태: 원격 검증은 완료했고, 내 기록 조회·학습 흐름은 사용자 정상 보고다. 제목 자동 입력 UI의 직접 Chrome 관찰, 실제 만료/오프라인·키보드/폭 등 잔여 검증과 PM 수용은 남아 있다. 운영 조건 점검은 사용자 결정으로 실험 이후로 연기했다. 아래 승인 대기·Chrome 조회 대기는 이전 시점 기록이다.
- 요청서의 실환경 경계에 따라 DB 마이그레이션·Worker 배포·실제 데이터 전송은 실행하지 않았다. 현재 원격 Worker/DB만으로 새 기록 UI가 작동한다고 가정하지 않는다.
- 승인 후 현재 DB advisors·스키마 차이·PostgREST 중첩 관계/커서 처리와 두 합성 사용자·비활성자·직접 DB 권한을 재검증해야 한다.
- 실제 확장 재열기·재로그인·여러 수정본 조회·독해 중 차단·원문 복원·삭제를 Chrome에서 검증해야 한다.
- 선택 글 정보 동의와 실제 전송 범위, 백업/PITR 보존·export·복구 후 재삭제 절차는 운영 전에 검토한다.
- TASK-014 잔여 UX 및 TASK-017 빌드/재열기 결함 해결은 다음 순서다. 전체 AC가 수용되지 않은 상태에서 파일럿 운영·웹 개발 완료를 주장하지 않는다.

## Git 상태
- 최신 정리: `feature/revision-storage`, 이번 후속 작업의 시작 HEAD는 `aba146a`다. 사용자가 최근 범위까지 handoff와 변경사항 로컬 커밋을 명시 요청했다. ID 검증 보강·실환경 검증 도구/테스트·탭 제목 자동 입력·실행 안내·결과/인계를 이번 정리 커밋에 포함한다. 최종 식별자는 `git log -1 --oneline`과 임시 폴더의 최신 handoff를 따른다. main 병합·push·추가 배포는 포함하지 않는다.
- 작업 경로·브랜치: 위 worktree / feature/revision-storage. 루트 feature/week1-extension은 편집하지 않았다.
- 시작 HEAD: e00b2ce. 사용자가 2026-11-10 세션 종료·handoff·로컬 커밋을 명시 승인했다. 이 결과·코드·SQL 초안·테스트·최신 handoff를 포함한 세션 종료 커밋으로 보존하며 식별자는 git log로 확인한다.
- main 병합·원격 push·배포·실환경 DB 변경 없음.
- 이전 세션에서는 실환경 적용을 보류했으나, 이번 후속 대화에서 명시 승인 후 적용·검증을 완료했다. 현재 인계는 [후속 작업 정리](../handoff/2026-11-10-TASK-015-실환경적용후.md)이며 이전 세션 종료 문서는 이력으로 보존한다.

## PM 검토 (PM 작성)
- 실제 diff·실행 근거 확인: PM 최종 검토 대기. dev 후속 실행 근거는 위 실환경 절과 보존된 검증 도구에 기록했다.
- 수용 / 수정 요청 / 사용자 판단 필요: 실환경 적용·합성 검증은 사용자 승인 후 수행 완료. 실제 Chrome·백업 등 잔여 AC와 PM 수용은 대기.
- 남은 위험: 실제 Chrome·브라우저 장애·백업·운영 조건 미검증. API 통과만으로 전체 완료 처리하지 않는다.
