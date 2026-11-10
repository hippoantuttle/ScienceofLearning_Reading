# TASK-015 v2 — 후속 검토와 실환경 적용안

2026-11-10 / Codex dev. 최신 handoff의 후속 검토 기록이며 실환경 변경 승인이나 PM 수용 기록이 아니다.

후속 승인 및 실행: 사용자가 이 적용안 제시 후 「다음 범위를 진행해줘」로 DB 마이그레이션·제출 Worker 배포·합성 저장/조회/삭제 검증을 승인했고 해당 실행은 완료했다. 아래 승인 대기 표기는 작성 당시 기록이며 실제 근거는 [결과](TASK-015-결과.md)의 최신 실환경 절과 [후속 인계](../handoff/2026-11-10-TASK-015-실환경적용후.md)에 기록했다. Chrome·백업·PM 수용은 남아 있다.

## 기준과 작업 위치

- 저장소: `C:\Users\patri\ScienceofLearning_Reading`.
- 실제 작업 경로: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\local-git-status-task-progress-a93081`.
- 브랜치·시작 커밋: `feature/revision-storage` / `aba146a`. 시작 시 미커밋 변경 없음.
- 요청서: [TASK-015 v2](TASK-015-수정본-저장-확장-내-재조회.md). 인계: [세션 종료](../handoff/2026-11-10-TASK-015-세션종료.md).
- 메인 폴더의 이전 `feature/week1-extension`은 편집하지 않았다. 커밋·main 병합·push는 수행하지 않는다.

## 실제 확인

- 실제 diff·Worker·클라이언트·SQL·테스트를 검토했다. 원본 불변, 소유자 복합 FK, 활성 회원·본인 RLS, 열 단위 INSERT, 멱등/충돌, 삭제 연쇄를 로컬 합성 PostgreSQL에서 다시 확인했다.
- 수정본 ID가 없는 두 응답을 정상으로 취급하는 클라이언트 경계 오류를 재현·수정했다. 저장 성공에는 비어 있지 않은 문자열 ID와 재조회 일치를 요구한다. 입력·대기 요청은 실패 뒤 유지된다.
- 기존 전체 156 통과, 새 회귀의 수정 전 1 실패, 수정 후 대상 17 통과, 최종 전체 **157 통과 / 실패 0 / skip 0 / 종료 0**. 실제 명령은 [결과](TASK-015-결과.md)의 후속 재검토 절 참조.
- 전용 Supabase `mxhlxenfboiaywyhgyqs`의 카탈로그·권한만 읽기 전용 조회했다. `pilot_revisions` 없음, `article_title`·`source_url` 없음. `pilot_submissions` RLS 활성 및 본인 SELECT/INSERT 정책 유지. 새 제약·인덱스 이름 충돌 없음. 개인 행·답안·비밀 파일은 조회하지 않았다.
- Worker의 현재 원격 버전은 이번 재검토에서 조회하지 않았다. 구현 전 버전이라는 기록은 직전 handoff 근거이며 배포 직전 다시 확인해야 한다.

## 기존 advisors 항목

- 보안 INFO: `pilot_members`의 RLS는 활성이나 정책이 없다. 현 구조는 직접 조회 권한을 막고 본인의 활성 여부만 함수로 반환한다. 정책 부재를 해소하려고 회원 목록 조회 권한을 추가하지 않는다. [진단 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- 보안 WARN: `is_active_pilot_member()`는 authenticated가 실행할 수 있는 SECURITY DEFINER다. 카탈로그에서 인자 없음·내부 `auth.uid()`만 조회·고정 search_path와 anon 실행 불허를 확인했다. 기존 설계상 의도된 경로이나 이번 로컬 검사로 모든 환경의 안전성이 입증되는 것은 아니다. [진단 안내](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- 보안 WARN: 유출 비밀번호 보호 비활성. 이번 TASK에서 Auth 설정·요금제는 변경하지 않았다. 운영 전 별도 검토 항목이다. [설정 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- 성능 WARN 2개: 최초본 SELECT/INSERT 정책의 행별 auth 함수 호출. 기존 정책이며 이번 수정본 SQL은 `(select ...)`를 사용한다. 기존 정책 최적화는 이번 변경에 섞지 않았다. [진단 안내](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

## 별도 승인 후 수행할 구체 변경

1. 위 전용 DB의 충돌·권한·RLS를 다시 확인한 뒤 [검토된 SQL](../../server/migrations/20261110045614_revision_storage.sql)을 트랜잭션으로 적용한다. 최초본에 선택 글 정보 열·복합 유일 제약·인덱스를 추가하고 INSERT 열을 제한한다. 수정본 테이블·복합 FK·RLS·열 권한·인덱스와 PostgREST 캐시 갱신을 적용한다. 기존 답안 UPDATE/DELETE 권한은 추가하지 않는다.
2. `reading-submissions-pilot`만 현 코드로 배포한다. 기존 프로젝트·공개 키·변수와 정확한 확장 Origin `chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb`를 유지한다. 기존 배포 버전·설정은 값 노출 없이 확인하고 복구 기준을 기록한다. AI Worker는 변경하지 않는다.
3. 기존 합성 테스트 계정으로 인증된 준비 응답과 실제 PostgREST 관계를 확인한다. 최초본 불변·여러 수정본·재조회·멱등/충돌·두 활성 사용자 격리·비활성자/비인증 차단·직접 DB 권한을 검증한다. 검증에서 만든 합성 행만 소유자와 식별자를 함께 한정해 삭제하고 재조회한다. 실제 사용자 답안이나 계정은 시험·삭제 대상으로 삼지 않는다.
4. 미저장 입력을 보존한 별도 Chrome 검증 환경에서 종료·재열기·재로그인·목록/수정본·독해 중 차단·원문 복원을 확인한다. AI 유료 호출은 이 적용안에 필요하지 않다. 실제 Chrome 성공을 로컬 테스트로 대체하지 않는다.
5. 적용 후 advisors·정책·권한을 재확인하고 AC별 실제 결과를 기록한다. TASK-015 수용 후에만 TASK-014 잔여 → TASK-017 → TASK-018 → TASK-016 순서로 진행한다.

## 현재 경계

- 요청서와 최신 handoff는 새 명시 승인 전 DB 적용·Worker 배포·실환경 합성 전송을 금지한다. 이번 사용자 요청으로 로컬 검토·수정·검증까지 진행했으며 해당 외부 변경은 아직 실행하지 않았다.
- 실제 Chrome, 원격 저장/삭제, PostgREST 통합, 백업/PITR·복구 후 재삭제는 미검증이다. TASK-015는 부분 완료이며 설치 가능한 단독 버전 수용은 TASK-017에서 별도 검증한다.
- 기존 원격 DB 구조는 그대로다. 이번 변경은 `record-client.js`, 회귀 테스트와 이 검토/결과 문서의 미커밋 로컬 변경이다. 확장·AI 로컬 서버를 새로고침하거나 재시작하지 않았다.
