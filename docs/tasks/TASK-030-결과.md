# [TASK-030] 발표 시연용 50명 정원 준비 결과

## 결과 요약
- 상태: 완료 — 승인된 로컬 준비 범위. 운영 적용은 사용자 요청으로 보류.
- 요청서: `C:\Users\patri\ScienceofLearning_Reading\docs\tasks\TASK-030-시연-50명-정원.md` v2.
- 운영 DB·Worker·Google 설정·실제 초대 명단은 변경하지 않았다. 이번 범위에서 원격 변경 도구도 호출하지 않았다. 진단 당시 운영 정원은 5명이며 준비 결과를 운영 50명 적용 완료로 취급하지 않는다.
- 새 DB 제약은 5/14/50을 허용한다. schema 변경과 실제 정원 변경을 분리해 각각 검토할 수 있다. 기존 TASK-020 승인 함수는 수정하지 않는다.
- 신규 계정은 기존 정책에 따라 비공개 초대 명단에 사전 등록해야 한다. 50명 정원은 기존 5명을 포함한다.

## 변경 파일
- `server/migrations/20261118042724_cohort_capacity_50.sql` — 기존 5/14 제약을 확인하고 50을 추가. 실제 회차 값·회원·초대·기록은 수정하지 않는다.
- `server/operations/set-active-cohort-capacity-50.sql` — 활성 회차가 한 개이며 사용 기간 안에 있을 때 그 회차의 정원만 50으로 변경. 잠금/문장 시간 제한 포함.
- `server/operations/register-google-invites.template.sql` — 관리자 SQL Editor용 등록 양식. 예시·빈 명단·잘못된 이메일은 전체 취소. 기존 초대·UID·비활성 상태는 보존.
- `scripts/prepare-cohort-environment.cjs` — 50명 후보와 새 SQL 소스의 로컬 검토 묶음 지원.
- `tests/google-access-db.test.mjs`, `tests/cohort-environment.test.cjs` — SQL 확대·승인 경계·권한 보존·등록 양식과 준비 도구 검증.
- `docs/Google-로그인-50명-시연-준비.md` — 사용자 준비, 향후 적용·확인·계정 등록·재로그인·실패 복구 절차.
- 기존 5인 안내·작업 인덱스·변경 이력·TASK-030 요청/결과 — 현재 범위와 운영 보류 상태 명시.
- Git 제외 `build/task030-capacity50-review-01/` — 배포 전 검토용 SQL·안내 복사본 및 SHA-256 보고서. 자동 배포 기능·실제 명단·비밀값 없음.

## 완료 기준별 검증
| 기준 ID | 충족 / 미충족 / 미검증 | 검증 근거 |
|---|---|---|
| AC-01 | 충족(로컬) | PGlite에서 실제 기존 SQL과 후속 migration 실행. 5/14/50 승인 경계와 0/6/49/51 거절 확인. schema 변경만으로 기존 회차 정원은 5를 유지함 |
| AC-02 | 충족(로컬) | 기존 5명을 승인한 뒤 50으로 확대. 회원/역할/초대/회차 기한/RLS/권한/함수 정의 snapshot 및 저장 원본 일치. 기존 운영자 역할 보존, 신규 participant 역할 확인, 50명까지 승인·51번째 거절·미등록 거절·본인 기록 격리·기한/회수 검사 통과 |
| AC-03 | 충족 | 5/14/50 후보와 50명 명시적 무제한 생성 통과. 잘못된 정원·기한·식별자 거절. 새 migration 복사본 일치 |
| AC-04 | 충족(준비 범위) | 운영 적용·초대 등록·확인·실패 복구 안내 및 SQL 양식 준비. 로컬에서 회차 없음/기한 밖/제약 미적용·예시/빈 명단/잘못된 입력의 전체 취소와 중복·기존 비활성/계정 결속 보존 확인. 운영 실행 없음 |
| AC-05 | 충족 | 실제 diff·신규 SQL 검토, 아래 48검사 통과·skip 0. 검토 묶음의 복사본 해시 일치 확인. 미검증 범위와 Git 상태 기록 |

## 실제 실행 결과
- 실행 위치: `C:\Users\patri\ScienceofLearning_Reading`, `feature/cohort-capacity-50`.
- 이미 캐시에 있는 Supabase CLI v2.116.0의 도움말 확인 후 `migration new cohort_capacity_50`으로 빈 파일 생성. CLI가 생성한 파일명을 유지해 저장소의 기존 `server/migrations/` 위치로 이동했다. CLI의 운영 연결·적용 명령은 실행하지 않았다.
- 최종 실행:

```text
node --test tests/google-access-db.test.mjs tests/cohort-environment.test.cjs tests/cohort-worker.test.mjs tests/google-auth.test.cjs tests/google-flow.test.cjs tests/session-auth.test.cjs tests/submission-worker.test.mjs
```

- 실제 결과: tests 48 / pass 48 / fail 0 / skipped 0 / cancelled 0 / 종료 코드 0. 실행 약 48초.
- 추가 확인: `git diff --check` 통과. 기존 Worker·학습 로직·확장 설정을 수정하지 않았고 공개 문서·SQL·테스트에는 합성 이메일만 사용했다.
- 원본 개인정보·학습자 응답·운영 로그를 저장하지 않았다. 검토 묶음 보고서는 소스 경로·해시·로컬 검증 요약만 담는다.

## 핵심 원칙·안전 점검
- 읽기 중 AI 개입 차단: 학습/AI 제품 코드 변경 없음. 회차 Worker·인증·제출 관련 회귀 통과. 초급 예외와 Retell 가림 정책 유지.
- 시크릿·개인정보: 신규 SQL은 관리자 화면에서만 실제 이메일을 입력하게 안내한다. 미완성 `.invalid` 예시의 우발 등록은 차단한다. 실제 계정·토큰·서비스 키·서명 키는 추가하지 않았으며 커밋 직전 명시한 12개 파일의 스테이징 내용과 시크릿·이메일 패턴을 확인한다. 기존 `.claude/`는 제외한다.
- 기존 기능: 권한·함수·기존 역할/기록 snapshot 비교 및 로그인·갱신·회수·제출 회귀로 검증. 실제 운영 적용 후에는 사전점검과 사람 확인을 다시 수행한다.
- 로컬 PGlite는 단일 연결이므로 독립 연결 간 동시 로그인 경합·실제 50명 동시 사용 성능을 검증한 것은 아니다. 기존 서버의 회차 행 잠금 구현은 변경하지 않았다.

## 미해결 문제와 필요한 결정
- 현재 사용자의 테스트 종료 후 운영 적용 승인·시간 지정이 필요하다. 이번 결과는 배포 승인 요청이 아니며 준비 단계에서 멈춘다.
- 추가 계정의 실제 이메일은 사용자가 비공개 관리자 SQL Editor에서 입력해야 한다. 이 작업에서 누구도 자동 승인하지 않았다.
- 사용 기한은 2026-11-25 23:59:59 KST. 이후 발표라면 DB와 두 Worker의 기한 연장을 별도로 결정한다.
- 원격 migration 적용·운영 후 검증·실제 추가 계정 로그인/학습 확인은 이번 범위에서 미실시다. 추후 CLI 전체 push 전에는 기존 수동 적용 이력과 로컬 파일명 차이를 검토하며, 이번 새 migration만 대상으로 적용한다.

## 사용자 지정 커밋과의 호환 확인 (2026-11-18 후속 지시)
- 비교 대상: `claude/source-restore-check-error-151dd3` @ `4ed817573d3693ebf6f12c3d6aa81a26191bb51c` (`fix: 기사 탭 새로고침 후 다시 주입해 작성 이어가기`). 공통 기준은 `0222c96`이다.
- 상대 변경: `content.js`, `sidepanel.js`, 기사 재연결 검사와 기존 확장 빌드/패널 UX 검사 보완, 변경 이력 추가. DB·인증·정원·준비 도구는 변경하지 않는다.
- 공통 수정 파일은 `docs/변경이력.md` 한 개다. TASK-030은 표 위쪽, 상대 커밋은 마지막에 행을 추가하므로 양쪽 기록을 보존한 자동 병합이 가능하다. Git의 `core.autocrlf=true` 정규화 기준으로 3방향 병합을 확인했다.
- 상대 커밋을 archive한 임시 복사본에 TASK-030의 12개 변경 파일을 합치고, 변경 이력은 3방향 자동 병합본을 사용했다. 실제 작업 트리·상대 worktree·운영 서버를 수정하지 않았다. PGlite는 기존 로컬 의존성에 연결했다.
- 결합 검증: 위 7개 검사 파일에 `tests/article-reload.test.cjs`, `tests/extension-build.test.cjs`, `tests/panel-ux.test.cjs`를 더해 실행. **tests 97 / pass 97 / fail 0 / skipped 0 / 종료 코드 0**, 약 30초. 기사 재주입·본문 변경 차단·Retell 재확인·확장 빌드·로그인·정원 경계가 함께 통과했다.
- 결론: 파일 병합 충돌 및 이번 두 변경 사이의 기능상 충돌을 발견하지 않았다. 실제 Chrome 사람 확인·운영 적용·독립 연결 부하 검증을 대신하지는 않는다.
- 후속 로컬 커밋에는 TASK-030 준비 변경만 포함하며 상대 커밋 자체를 병합하지 않는다.

## Git 상태
- 경로·브랜치: `C:\Users\patri\ScienceofLearning_Reading`, `feature/cohort-capacity-50` (main @ 0222c96에서 분기).
- 커밋: 사용자 조건부 승인과 위 호환 확인을 근거로 이 결과서를 포함한 TASK-030 변경을 로컬 커밋에 보존한다. 커밋 식별자는 이 문서를 포함하는 커밋의 Git 이력에서 확인한다.
- 상대 브랜치 병합·main 병합·원격 push: 없음.
- 포함 범위: TASK-030 관련 12개 파일. 기존 untracked `.claude/`와 다른 worktree는 수정·커밋하지 않는다.

## PM 검토
- 실제 diff·실행 근거: Codex가 변경 diff·신규 SQL·단독 48검사와 결합 97검사 결과·문서 병합·검토 묶음 해시를 직접 확인했다. 별도 검토자에 의한 검토로 표시하지 않는다.
- 수용 판단: 로컬 준비 기준 충족. 운영 적용은 보류.
- 남은 위험: 운영 환경의 추후 변경, 실제 계정 일치, 발표일 이후 만료, 실제 동시 접속 성능은 적용 시 별도 확인한다.
