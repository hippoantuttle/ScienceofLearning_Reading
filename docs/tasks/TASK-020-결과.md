# [TASK-020] 작업 결과

## 결과 요약
- 상태: **로컬 구현·검증 완료 / 실제 OAuth·DB·서버 설정·5인 사람 QA 대기**.
- 요청서: docs/tasks/TASK-020-Google-로그인-5인-배포.md v2. v1 구현/검증·v2 이번 로컬 커밋 승인. 저장소·실제 작업 경로: C:\Users\patri\ScienceofLearning_Reading.
- 브랜치: feature/google-cohort-pilot. 0f8f8fd 및 이전 미커밋 TASK-017/019 변경을 보존해 생성했다. 기존 별도 worktree는 편집하지 않았다.
- 개인 Google 로그인(PKCE), 사전 등록 이메일 자동 승인, 서버 회차·정원·기한·회수, 본인 자료 RLS·새 쓰기/기존 조회 분리, Google 설치 후보·비활성 배포 후보를 구현했다.
- 사용자 결정으로 남은 TASK-017 Chrome QA를 5인 사람 검증에 이관했다. 실제 수행/통과 기록은 아직 없다. PDF는 후속 TASK-019 계획으로 보존했다.

## 변경 파일
- google-auth.js — 사용자 버튼 기반 Chrome identity/Supabase provider PKCE. 고정 callback·랜덤 flow·5분 시도·서버 확인 사용자·Google 검증 이메일, 오류/취소·중복/늦은 결과 차단. 토큰/검증값 지속 저장 없음.
- account-bar.js, sidepanel.html, submission-flow.js, submission-panel.js — Google 로그인 표시·자동 승인 RPC·UID/이메일/로그인 방식 결속·만료 후 같은 계정 재시도·새 시도 로그인 유지. 로그인/기록/AI의 기존 세션을 재사용.
- manifest.json, scripts/build-extension.cjs, scripts/extension-config.public.json — 선택적 googleLoginEnabled, 실제 Google 설치본만 identity 권한, Google 서버 fetch/Gmail 권한 없이 기존 Auth 호스트와 콜백 사용. 기본·이전 설정·검토 전용 빌드 호환 유지. 런타임24개.
- server/migrations/20261110140000_google_cohort_access.sql — 비공개 회차/이메일 명단, provider-controlled Google identity 확인·정원 잠금·disabled 회원 보호, 사전 등록 자동 연결, RLS·회수·기한 후 조회/쓰기 분리. public RPC는 invoker wrapper, 권한 있는 내부 함수는 비노출 schema에 위치. 정식 migration/원격 적용 전 초안.
- server/pilot-access.mjs, server/ai/pilot-worker.mjs, server/submissions/worker.mjs — 선택적 회차/기한·현재 자격 확인, 잘못된 설정 실패 거절. 회차별 AI 예산 분리. 기존 본인 모드 보존. 기간 종료 후 새 AI/POST 거절·본인 GET 경로 유지.
- ai-client.js — 회차 종료/미승인/승인 서비스 장애의 안전한 안내 문구.
- scripts/prepare-cohort-environment.cjs, scripts/prepare-pilot-environment.cjs — 명단·Secret 없는 분리 검토 후보, 서버 import 의존 소스·해시 보존, 기존 본인 준비 도구 호환. 자동 배포/기한 변경 없음.
- tests/google-auth.test.cjs, google-flow.test.cjs, google-access-db.test.mjs, cohort-worker.test.mjs, cohort-environment.test.cjs, extension-build.test.cjs — 인증·승인·RLS/정원/회수·서버 거절·패키지/설치본 통합 회귀.
- docs/Google-로그인-5인-배포-준비.md, TASK-020 요청/사람 QA/결과, TASK-017 v9·관련 상태/실행 인덱스·변경이력 — 실제 환경 대기와 Chrome QA 이관 기록.

## 완료 기준별 검증
| 기준 | 로컬 결과·근거 | 실제 환경/남은 범위 |
|---|---|---|
| AC-01 | PKCE challenge/verifier·복귀 origin/path/flow·취소/만료/변조·Google 확인 주체·같은 UID 재시도·설치본 자동 승인 통합 검사 통과 | 실제 Google consent/복귀·계정 연결·패널 생명주기는 사람 QA 대기 |
| AC-02 | 실제 로컬 PostgreSQL에서 사전 등록·verified identity·5/14명·반복·미등록/가짜 metadata/다른 제공자/회수·다른 사용자 자료·기간 후 읽기/쓰기 분리 통과 | PGlite 단일 연결에서 동시 호출이 큐 처리됨. 다중 DB 연결의 실제 경합/실환경 정책·노출/운영 확인은 대기 |
| AC-03 | Worker 코드에서 회차 누락/만료/거절/RPC 실패가 예산·모델·저장 전에 차단. 만료 후 GET 유지. 기존 본인 모드/AI 실패·읽기 중 차단 회귀 통과 | 실제 서버·DB·계정·모델의 전체 결합은 미실시. 외부 인증/모델 요청은 합성 검사로 대체 |
| AC-04 | 공개 입력만으로 Google 설치 폴더·ZIP, 비활성/활성 검토·제출 Worker 후보 생성. 독립 CRC·파일 해시·폴더·권한·AI off 확인 | Google/Supabase 설정·정식 migration/명단·배포 대기. 현재 프로젝트 Google provider는 false |
| AC-05 | 전체 자동217 통과, 5인 사람 QA 문서에 TASK-017 잔여·판정/중단/14인 확대 기준 기록 | 5인 QA/PM 수용 미실시. 실제 설치·접근성·재열기·모델 의미 안전성 등 이관 항목은 미검증 |

## 실제 실행 결과
- 위치: C:\Users\patri\ScienceofLearning_Reading.
- Google/flow/account/설치본 관련 초기 검사31 통과. DB fixture의 필수 rechecked 누락, VM fixture의 URLSearchParams 누락, 기존 런타임23개 고정 가정은 검증 fixture/기대값을 정정했다. 제품 실패와 구분한다.
- `node --test tests/google-access-db.test.mjs tests/cohort-worker.test.mjs`: 8 통과/실패0/skip0/종료0. 기존 로컬 PGlite@0.5.16 사용. 서버 비밀/실제 답안·명단·새 외부 패키지 설치 없음.
- `node --test tests/extension-build.test.cjs tests/cohort-environment.test.cjs`: 최종18 통과/실패0/skip0/종료0.
- 승인된 외부 실행 `powershell.exe -NoProfile -Command "node --test"`: **217 통과/실패0/skip0/종료0**, 약26초. 기존194개+Google/승인/회차 관련23개(부모/하위 시나리오 포함). 이후 런타임 변경 없음.
- 기존 공개 설정으로 `/auth/v1/settings` GET: 샌드박스 연결 실패 뒤 승인된 외부 실행으로 **external.google=false**만 확인. 사용자·명단·모델 요청 없음. 이 확인은 OAuth 실제 로그인·DB 정책 검증이 아니다.
- `prepare-cohort-environment` 로컬 생성, `build-extension --config build/task020-google-team5-review-01/extension.google.public.json --label task020-google-team5-01`: 종료0. 정확한 경로/후보값/주의는 [배포 준비 안내](../Google-로그인-5인-배포-준비.md).
- 독립 Python zipfile/hashlib 검사: **24개 파일, CRC·각 SHA-256·설치 폴더 일치·권한·Google on/AI off·dirty 근거 통과**. Git 제외 build/task020-google-team5-package-check.json.
- 설치 후보 ZIP SHA-256: `62c3aea979ec3870b2652474999ac6892ec0a6bf0487745908cfa5b987846e7b`.

## 핵심 원칙·안전 점검
- 읽기 중 AI/과거 답안 차단·Retell만 가림·제출 저장/재조회 및 별도 동의 후 피드백 회귀 유지. 새 Google 기능은 읽기 내용을 생성하지 않는다.
- Client Secret·서비스 역할 키·이메일 명단·실제 UID/토큰/응답을 클라이언트·요청/결과서·Git에 넣지 않았다. 공개 설정만 빌드 입력으로 사용한다.
- 서버는 user_metadata나 화면 이메일을 승인 근거로 쓰지 않고 auth.uid()의 확인된 기본 이메일과 Google auth.identities를 비교한다. 명단/역할/승인 직접 변경은 차단하고 새 RLS를 실제 PostgreSQL에서 확인했다.
- 팀원도 본인 자료만 접근한다. 임의 Gmail 주소 전체 허용이나 운영자의 참가자 답안 교차 조회를 추가하지 않았다.
- Google 인증 토큰의 세션/프로필과 앱 참여 승인 구분. 미등록 사용자의 Auth row 생성 자체를 막는 hook은 구현하지 않았으므로 가입 자체 차단을 주장하지 않는다.

## 미해결·다음 실제 단계
- 사용자/관리자가 Google Web application OAuth 클라이언트와 Supabase Google provider·정확한 redirect를 구성해야 한다. Secret은 해당 관리 화면에 직접 입력한다.
- 실제 DB 스키마/권한·노출·advisors 재확인과 정식 migration 생성/검토/승인, 보호된 실제5인 명단·회차/기한·예산 확정, Worker 배포가 필요하다. 현재 SQL은 로컬 초안이다.
- 준비 후보는 단독 본인 시험의 활성/기한/한도를 변경하지 않았다. 새 회차의 검토용24시간 기한과 일일4/20회는 승인값이 아니며 실제 적용 전에 재생성한다. 실제 비용 상한·전체 기간 총량 장치는 별도다.
- 설정 뒤 Google 로그인·미등록 거절·저장/조회부터 확인하고 [5인 사람 QA](TASK-020-5인-QA.md)를 수행한다. 14인 확대와 실제 자료 전송/동의·삭제/보관은 별도 판단한다.

## Git 상태
- 사용자 명시 후속 요청으로 feature/google-cohort-pilot의 TASK-017/019 및 이번 TASK-020 변경을 로컬 커밋에 보존한다. 실제 식별자는 이 절을 포함한 커밋의 git log -1 --oneline으로 확인한다. main 병합·원격 push 없음.
- dist/build 후보는 Git 제외. 실제 OAuth/DB/서버 변경·초대 발송·명단 입력·참가자 수집·실제 모델 자동 호출 없음.

## PM 검토
- 사용자/PM 실제 설정·실환경·5인 결과 검토 대기. 로컬 검사 통과를 사람 QA 또는 전체 배포 수용으로 대체하지 않는다.

## 세션 인계·로컬 커밋 (2026-11-10)
- 사용자 요청 및 handoff 스킬에 따라 세션 인계는 OS 임시 폴더에 작성한다. 기존 요청/결과·설정 안내·QA·코드/검증 내용은 인계에 중복하지 않고 경로로 참조한다.
- Google provider=false 확인·실환경 설정/DB/명단/배포·사람 QA 대기, 기존 본인 시험 기한과 검토 후보의 차이를 유지한다. 후보 산출물을 이번 커밋 기반 릴리스로 소급 표시하지 않는다.
- 구현 후 전체 자동217 통과 근거와 후속 테스트 정리 보호 검사1개 통과를 유지한다. 이번 인계/권한 기록은 문서 변경이며 런타임 변경 없음.

## 실환경 적용·본인 확인 (2026-11-10 후속)

- Google provider 활성(google=true) 확인. 사용자가 SQL Editor로 `server/migrations/20261110140000_google_cohort_access.sql`(사전점검 포함)·회차 team5-20261110(정원5, 2026-11-25T14:59:59Z)·초대5를 적용하고 읽기 전용 확인 결과를 보고. pilot_private API 비노출(PGRST106)·anon RPC 401 확인.

- 배포: 제출 Worker b3233c5d(회차 모드), AI Worker 90c15001(회차 모드·사용자/전체 무제한). 비호출 원격 점검 통과. 설치본 `dist/task020-google-team5-ai-01`(Google·AI UI on), ZIP SHA-256 `fa0fdfb2257247870160eb9c1e1d2ec05c5443464d4319fe38f8d585713c20eb`.

- 사용자 보고: 본인 Google 로그인·제출 성공, 이어서 AI 추천·피드백 성공. 미등록 계정 거절과 팀원 4명 QA는 아직 미보고(미검증).

- 자동 검사 219 통과. 비용 상한은 DeepSeek 잔액에만 의존.
