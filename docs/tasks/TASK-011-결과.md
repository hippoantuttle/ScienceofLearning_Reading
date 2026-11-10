# [TASK-011] 작업 결과

## 제출 Worker 배포 후 스모크 (2026-11-10, 진행 중)
- 사용자가 제출 Worker 배포 명령 실행을 보고했다. 배포 버전 ID와 사전 점검 결과는 이 세션에서 확인하지 않았다.
- 배포 주소에 직접 요청하여 허용 Origin의 OPTIONS 204, Origin 없는 멤버십 GET의 가짜 토큰 401 및 무토큰 401, 다른 Origin의 GET 403, Origin 없는 POST 403을 확인했다. 이는 인증·출처 처리의 제한된 사례이며 저장과 재조회 성공을 증명하지 않는다.
- 사용자 보고: Chrome에서 저장 및 재조회 메시지와 중복 처리를 확인했고, 합성 제출 데이터를 삭제했다. dev가 직접 관찰하거나 삭제 후 재조회한 결과는 아니다. 오프라인 실패 시 입력 보존·재시도는 사용자가 지금 진행하지 않기로 했으며 미검증이다.
- 사용자 보고: 같은 과정에서 AI 추천이 오지 않았다. 확인 시 로컬 AI Worker의 8787 포트가 수신 중이 아니었고 확장 설정은 이 로컬 주소를 가리켰다. 로컬 Worker 재시작 후 사용자가 AI 추천이 정상 작동함을 확인했다. AI Worker 실배포 여부를 의미하지 않는다.
- `node --test`: 118개 중 117개 통과, 1개 실패. PowerShell 인코딩 테스트는 `Microsoft.PowerShell.Security` 모듈을 불러오지 못해 미검증이다.

## 최신 통합 진행
- 일반 테스트의 실환경 자동 호출 방지: `tests/no-live-auto.test.cjs`가 비밀 파일 읽기와 fetch를 차단하는 preload 아래 Node 테스트 탐색을 실행했고 1개 통과. 이 테스트 자체는 외부 연결을 하지 않는다.
- `submission-auth.js`, `submission-flow.js`, `submission-http.js`, `submission-panel.js` 및 `sidepanel.html`에 로그인·최종 작성값 수집·저장 후 재조회 확인·동일 스냅샷 재시도 경로 초안을 연결했다. `submission-config.js`는 빈 설정이므로 실제 확장에서 로그인·전송은 막힌다. 실패 시 기존 패널 값은 그대로 두지만 새로고침 후 보존은 없다. 동의 및 운영 조건은 PM 검토 전이며 개인정보 고지의 적절성은 미검증이다.
- 로컬 통합 실제 실행 `node scripts/verify-flow-local.cjs`: 테스트 계정의 실제 Supabase 인증 → 로컬 Node의 Worker 코드 → 실제 DB에 합성 작성값 저장 → 별도 GET 재조회와 값 비교 → 해당 합성 행 삭제·재조회 성공. 실제 Chrome 화면·Cloudflare 런타임·HTTP 장애에서 재시도는 이 실행으로 검증하지 않았다.
- 관련 테스트 20개 통과·0 실패; 패널 입력 보존·미설정 차단은 모의 DOM, 네트워크 오류 후 같은 스냅샷 재시도는 모의 어댑터 기준. 전체 테스트는 이번 변경 이후 재실행하지 않았다. `git diff --check` 종료 0, LF→CRLF 경고.
- 배포 검토 초안(미승인): 기존 AI Worker를 변경하지 않는 별도 Worker 이름 `reading-submissions-pilot`, 후보 `https://reading-submissions-pilot.patrick020308.workers.dev/submissions` (실제 생성·주소 확인 전). Worker 설정은 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 또는 `SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_ORIGIN`이며 service_role은 필요 없다. `ALLOWED_ORIGIN`은 실제 고정 확장 ID의 `chrome-extension://<ID>` 하나로 설정하되 ID 확정 및 일치 확인이 선행된다. 확장 host 권한 후보는 해당 Worker 원본과 전용 Supabase 원본 각각 `/*`이며 현재 manifest에는 추가하지 않았다. Supabase 공개 키만 클라이언트 설정에 사용한다. 실제 Worker 주소·확장 ID·CORS·초대 로그인 방식 및 동의/비용 조건을 PM 검토 후 별도 배포 승인 필요.

## 최신 실환경 합성 검증 (진행 중)
- dev가 전용 Supabase에 자체 가상 계정 3개를 생성하고 각각 재조회했다. A·B 활성, C 비활성 멤버십을 재조회했다. 테스트 자격과 ID는 Git 제외 로컬 비밀 파일에만 보관하며, 해당 계정과 멤버십은 테스트 후에도 남아 있다. 실제 참가자 초대는 하지 않았다.
- `node scripts/verify-supabase-test.cjs`: 로그인, 활성 A·B/비활성 C 확인, 비활성 삽입 및 타인 소유 위조 거부, A 합성 행 저장과 본인 재조회, 동일 세션 중복 409, 비인증·활성 B의 타인 조회 거부, 생성 행 삭제와 재조회 성공. 실제 DB 대상이며 제한된 사례의 동작 결과이지 전체 정책 증명이 아니다.
- `node scripts/verify-worker-local.cjs`: 배포하지 않은 Worker 코드를 로컬 Node에서 실행하되 실제 Supabase 인증·합성 DB에 연결했다. 합성 저장, 동일 요청 재전송 시 같은 영수증, 상이한 내용의 같은 세션 충돌, Worker 조회 일치와 대상 합성 행 삭제·재조회 성공. Cloudflare 런타임·Chrome·동시 요청·네트워크 실패는 검증하지 않았다.
- 주의: 첫 `node --test`가 `scripts/verify-supabase-test.cjs`를 테스트 파일로 자동 발견해 의도하지 않게 위 합성 DB 검증을 한 번 더 실행했다. 두 번째 실행도 삭제 재조회가 성공했다. 이후 Node 테스트 컨텍스트 자동 실행 방지 가드를 추가했고 전체 테스트 재실행에서 합성 DB 검증 출력 없이 78개 통과·0 실패를 확인했다. 이후 비밀 파일 읽기·fetch 차단 preload를 이용한 별도 회귀 테스트도 통과했다.
- 정책 메타데이터(`pg_policies`, RLS 활성 플래그) 직접 재조회는 아직 하지 못했다. 기존 로컬 자격은 REST API용이며 SQL 메타데이터를 조회할 DB/관리 API 경로는 확인되지 않았다. 테이블 REST 조회와 위 행동 검증을 정책 정의 재조회로 대체하지 않는다.
- 변경: `scripts/provision-test-accounts.cjs`, `scripts/verify-worker-local.cjs`, `scripts/verify-supabase-test.cjs`, `tests/provision-test-accounts.test.cjs`, `tests/verify-worker-local.test.cjs`. 신규 Worker 검증 도구는 모의 검증을 실제 실행 전에 추가했으나 실패 우선 실행은 하지 못했다. 커밋·배포·실제 AI 호출 없음.

## 이전 시점 기록 — 전용 Supabase 승인 이후 준비
> 아래 항목은 작성 당시 상태이며 위 최신 검증 결과보다 우선하지 않는다.
- **dev 직접 조회:** 키 값을 출력하지 않고 지정 URL 일치·레거시 anon/service_role 값 존재·A/B 계정값 미입력을 확인했다. `git check-ignore` 제외 및 `git ls-files` 미추적 확인. service_role로 테이블 메타데이터 최소 REST 조회 시 `pilot_members`·`pilot_submissions` 각각 HTTP 200, anon의 submissions 조회는 HTTP 401. 이는 테이블 API 응답과 익명 거부만을 보여 주며 RLS 정책 내용·활성 A/B 격리·삭제 통과는 입증하지 않는다.
- `scripts/verify-supabase-test.cjs`는 레거시 쌍과 신규 publishable/secret 쌍을 각각 지원하며 혼용은 거부한다. 신규 API 키는 `apikey`만, 로그인 사용자의 JWT는 별도 `Authorization`에 전달한다. Worker도 신규 publishable/레거시 공개 키와 사용자 JWT를 분리한다. 두 방식 모두 모의 fetch 테스트만 통과했고 실제 신규 키는 검증하지 않았다. 테스트 도구의 현재 선행 조건은 활성 테스트 계정 A·B와 별도 비활성 C이다. 계정 생성·멤버십 등록·실제 검증은 아직 하지 않았다.
- **사용자 보고:** 전용 프로젝트에서 `001-pilot-draft.sql` 실행이 성공했다. dev 직접 관찰은 아니며 실제 테이블·정책 재조회 및 본인/타인 접근·삭제 검증은 아직 미실시다. SQL을 재실행하지 않는다.
- **사용자 보고:** 읽기 전용 사전 확인 쿼리에서 대상 테이블 2개와 함수 1개 모두 `false`. dev가 직접 DB를 조회한 것은 아니며, 스키마·정책 적용 및 실제 접근 제어가 검증됐다는 뜻은 아니다. PM이 충돌 방지·공백 판정 수정이 포함된 SQL을 재확인하고 사용자에게 적용을 안내했다. 이후 사용자는 실행 성공을 보고했다.
- 준비된 실행 명령은 CMD에서 저장소 경로의 `node scripts\verify-supabase-test.cjs`. 단, **지금 실행 금지**: 스키마 적용 사용자 보고, 별도 테스트 계정 3개(A·B 활성, C 비활성) 생성 및 활성 상태 설정, `.env.supabase-test`에 지정 URL·공개 키·서비스 역할 키·세 계정 자격의 사용자 직접 입력, PM의 최신 스크립트 보안 검토가 선행돼야 한다. 운영자용 키는 로컬 파일에만 입력하며 채팅·확장·Git에 절대 넣지 않는다. 도구는 합성 행을 특정 owner와 무작위 session으로 삽입하고 finally에서 해당 조건만 삭제·재조회한다. 테스트 계정 생성·멤버십 등록·스키마/정책 존재 확인이나 운영자 삭제·30일 자동 삭제 기능을 대신하지 않는다. 프로세스 강제 종료·네트워크 실패 시 잔여 데이터가 생길 수 있다.
- `scripts/verify-supabase-test.cjs`: A·B 활성 및 C 비활성 여부 확인 후 위조 삽입·중복 삽입·비인증/타인 조회 차단과 합성 행 저장·재조회·대상 삭제를 검증하도록 준비. 모의 fetch에서만 실행했고 실제 호출 전 PM 재검토가 필요하다. 강제 종료·네트워크 장애에는 합성 행이 남을 수 있다.
- 입력 파일 `C:\Users\patri\ScienceofLearning_Reading\.env.supabase-test`는 처음에 빈 템플릿으로 생성했다. 이후 사용자가 레거시 키 입력 완료를 보고했고 dev는 값 출력 없이 존재만 확인했다. 계정 자격은 아직 비어 있다. service_role은 서버/로컬 검증용이며 확장에 넣지 않는다.
- 사용자 승인 범위는 요청서에 기록. dev는 위와 같이 읽기 전용 테이블 API 조회만 실행했고, SQL 적용은 사용자 성공 보고이다. 테스트 계정 생성·합성 데이터 저장은 아직 하지 않았다.
- 이전 준비 시점: `.env.example`에 빈 테스트 계정 변수 이름만 추가했고 `git check-ignore .env.supabase-test`로 제외 규칙을 확인했다. 이후 위와 같이 빈 로컬 파일을 생성했다. ignore는 유출 방지 보증이 아니다.
- 사전 확인 SQL `server/migrations/000-preflight-readonly.sql`: 대상 객체 존재 여부만 조회. 적용 후보 `server/migrations/001-pilot-draft.sql`: 기존 테이블 또는 동명 함수 충돌을 감지하면 변경 전 트랜잭션을 중단하도록 보강했으나 SQL 자체는 DB에서 미실행·미검증. 다른 기존 데이터는 임의 삭제하지 않는다. 정책 적용 전 대상·충돌·내용을 PM과 재확인한다.
- `server/submissions/worker.mjs`: Supabase Auth 사용자 조회 후 검증된 ID로 저장하고 RLS 적용 사용자 자격으로 재조회 및 동일성 검사하는 로컬 코드. 요청자 owner 위조·인증 실패·동일 세션 동일/상이 내용은 모의 fetch에서 확인했으나 실제 Supabase·Worker 환경·동시성·RLS·운영 배포는 미검증. Worker 설정의 허용 origin·프로젝트 ID와 CORS는 배포 전 검토 필수.
- 길이 정책은 클라이언트·Worker·SQL 초안에 유니코드 코드포인트 10,000자 및 ASCII 공백류 판정으로 맞추었다. 클라이언트·Worker 경계는 모의 테스트를 통과했으나 PostgreSQL에서 SQL 실행·비교는 미검증이며 임시 제한은 운영 정책 확정값이 아니다.
- `node --test tests/submission-contract.test.cjs tests/submission-worker.test.mjs tests/submission-http.test.cjs`: 8개 통과·0 실패; `node --check server/submissions/worker.mjs`, `git diff --check` 종료 0. 전체 테스트는 이번 추가 코드 후 재실행하지 않았다. 로그인 UI·실제 제출 UI, 관리자 삭제·파일럿 종료일 기준 삭제 절차 및 실환경 확인은 진행 중이다.

## 접근 정책과 실제 연결 준비 — 로컬 초안
- 사용자 결정에 따라 초대 이메일, 참가자·팀원·운영자 구분을 문서화했다. 팀원의 참가자 답안 열람은 미결이므로 초안에서는 세 역할 모두 본인 것만 접근한다. 관리자 교차 조회·삭제, 이메일 초대 및 30일 삭제 절차는 아직 구현되지 않았다.
- `server/migrations/001-pilot-draft.sql`: Supabase용 멤버 역할·활성 상태, 소유자·세션별 유일 제약과 본인 행 읽기·삽입 RLS 정책 초안. 외부 DB에 적용하지 않았고 SQL 실행·실제 RLS·익명·타 사용자·역할 위조·동시 멱등 검증 모두 미실시. auth 계정이 있는 것만으로는 접근하지 못하도록 별도 활성 멤버십을 요구하나 실제 초대 전용 설정은 별도 필요. 운영용으로 간주 금지.
- `submission-http.js`: 런타임에서 명시한 HTTPS 중계와 로그인 토큰 제공 함수에 연결하는 전송 어댑터 초안. 리다이렉트 금지, 오류 전달. 지정 주소의 신뢰성·허용 목록, 인증 발급·갱신, 서버 인증·검증·멱등 및 UI 연결은 미구현이며 실제 전송을 하지 않았다. 고정 엔드포인트와 인증 정책 합의 후 연결해야 한다.
- `node --test` 전체 66개 통과·0 실패, `node --check submission-http.js` 및 `git diff --check` 종료 0(LF→CRLF 경고). 새 HTTP 어댑터는 주입한 모의 fetch·가상 토큰으로만 시험했다. 실제 인증·서버·DB는 시험하지 않았다.
- 입력 제한에 대한 주의: 현재 클라이언트는 JS UTF-16 길이, SQL 초안은 PostgreSQL 문자 길이를 사용한다. 공백 판정·문자 길이 정책을 일치시키고 서버 측 검증과 경계 테스트를 완성하기 전 운영 적용 금지.

## DeepSeek 공식 자료 재확인 — 저장 승인과 별개
- 2026-11-09 직접 HTTP 조회한 [모델·가격 문서](https://api-docs.deepseek.com/quick_start/pricing/)는 `deepseek-flash` 모델 ID와 당시 버전 `DeepSeek-V4.1-Flash-1017`을 표시한다. 100만 토큰당 피크 입력 캐시 미적중 $0.30, 출력 $1.20이며 가격 변경 가능성을 명시한다. 가격은 재확인 시점의 표이며 실제 청구 또는 상한을 보장하지 않는다. 모델 ID가 같아도 공급자 버전은 바뀔 수 있다.
- [문맥 캐시 안내](https://api-docs.deepseek.com/guides/kv_cache)는 요청에 디스크 캐시가 생성되며 사용하지 않게 되면 보통 수 시간~수일 내 자동 제거된다고 설명한다. 이는 전체 입출력 보존·모델 학습 이용·처리 위치·삭제 권리의 보장이 아니다.
- [Open Platform 약관 3.3·5.5](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html)는 다운스트림 최종 사용자의 개인정보 처리에 관해 개발자의 고지·법적 근거 등 의무를 설명하며 5.5는 해당 최종 사용자 처리 규칙이 일반 개인정보처리방침에 포함되지 않는다고 명시한다. 전체 API 입출력의 보존 기간·학습 이용·처리 위치·하위 처리자·삭제 조건은 이번 조회에서도 확인하지 못했다. 법률적 적합성은 별도 검토 필요.
- 검색/추출 서비스는 각각 할당량 초과/403, 별도 브라우저는 실행 실패했으나 공식 문서를 `curl`로 직접 읽어 위 사항을 확인했다. 일반 개인정보처리방침의 API 적용 범위는 확인되지 않았다. 실제 기사·참가자 응답·AI 호출은 여전히 별도 승인 전 금지.

## 실제 연결 준비 — 로컬 계약 (검토 중)
- `submission-contract.js`: 실제 작성값 형태의 필수 필드·선택 필드·재확인 이력과 세션 ID를 명시적으로 구성하고 추가 필드(URL·원문 등)는 거부한다. 각 텍스트의 임시 기술 상한 10,000 JS 코드 단위는 운영 정책이 아니라 로컬 검증 기본값이며 PM 검토가 필요하다.
- 주입형 `adapter.save(payload, idempotencyKey)` 경계만 제공한다. 첫 제출 시 스냅샷을 복사하고 실패 후 같은 스냅샷·세션 키로 재시도하며, 동시 요청과 불완전한 저장 응답을 거부한다. 기존 UI·실제 네트워크·DB에는 연결하지 않았다. 서버측 멱등 처리와 응답 신뢰·사용자 소유권 검증은 별도 구현이 필요하다. 복사본은 메모리에만 있고 새로고침 후 보존되지 않는다.
- 전체 `node --test` 재실행 64개 통과·0 실패·종료 0, `git diff --check` 종료 0(LF→CRLF 경고).
- `node --test tests/submission-contract.test.cjs tests/submission.test.cjs tests/submission-ui.test.cjs`: 7개 통과, 0 실패, 종료 0. `node --check submission-contract.js` 종료 0. 새로운 계약 테스트는 파일 부재 상태에서 실패 후 구현해 통과했다. 재시도는 모의 어댑터 검증이며 실제 네트워크 중복·시간초과·UI 원본 보존은 미검증이다.
- 외부 저장·인증 권고안은 사용자 결정 대기. 참여자 실제 응답 수집·운영 배포·실제 AI 호출 및 사용자 자료 전송은 별도 승인 없이 하지 않는다.

## 결과 요약
- 상태: 부분 완료 / 요청서 `docs/tasks/TASK-011-서버-제출.md` v2. 로컬 코드와 실제 Supabase 간 합성 저장·조회 및 접근 사례 검증은 성공했으나 Chrome 전체 경로와 배포 준비는 미완료.
- 실제 작성 필드를 받는 패널 제출 초안을 연결했으나 서버 설정을 비워 실제 확장 전송은 차단했다. 기존 고정 합성 예시 메모리 모의는 별개다.

## 변경 파일
- `submission-client.js`: 고정 가상 데이터만 허용하는 프로세스 메모리 모의 저장·재조회·중복 처리, 가상 사용자 격리.
- `submission-demo.js`, `sidepanel.html`: 최종 확인 화면의 합성 예시 모의 저장·재조회 버튼과 한계 안내. 실제 작성물은 전송하지 않는다.
- `tests/submission.test.cjs`, `tests/submission-ui.test.cjs`: 합성 데이터 재조회·중복·가상 타인 거절·실패 표시 모의 검사.
- 요청서 TASK-006·010·011·012와 TASK-010 결과: 사용자 마감 목표·작업 순서·사용자 Chrome 보고 기록.

## 완료 기준별 검증
| 기준 | 상태 | 근거 |
|---|---|---|
| AC-01 | 부분 검증 | 로컬 인증·Worker 코드와 실제 DB로 합성 저장·재조회 성공. Chrome 전체 경로는 미검증. |
| AC-02 | 부분 검증 | 실제 DB 동일 세션 차단과 로컬 Worker 동일 요청 영수증을 확인. 장애 재시도와 패널 보존은 모의이며 Chrome E2E 미검증. |
| AC-03 | 부분 검증 | 실제 활성 A·B, 비활성 C와 비인증·타인·위조 사례 차단 확인. 정책 정의·운영자 삭제·전체 접근 통제는 미검증. |
| AC-04 | 부분 검증 | 최신 관련 테스트 20개 통과, 이전 전체 78개 통과. 최신 전체 및 실제 Chrome·Cloudflare는 미검증. |

## 실제 실행 결과
- Windows, Node v22.23.1: `node --test` 61개 통과·0 실패·종료 0. `node --check submission-client.js` 및 `submission-demo.js` 종료 0.
- 모의 UI 성공은 재조회 값 일치 후에만 표시하며 오류 시 모의 실패를 표시. 합성 데이터 외 저장은 거부한다.
- 실제 Chrome의 새 버튼 및 훈련→제출 전체 경로는 실행하지 못했다. 실제 저장소·서비스 선택·인증·배포는 사용자 결정 및 승인 전 미실행.

## 핵심 원칙·안전 점검
- 기존 읽기·구조화 중 AI 내용 개입 금지와 Retell에만 원문 가림은 변경하지 않음. 효과의 입증 아님.
- 서버 키·참가자 실자료는 사용하지 않음. 모의 소유자 구분은 보안 통제의 증거가 아니다.

## 미해결 문제와 필요한 결정
- 저장 서비스/호스팅·비용·사용자별 인증·접근 제한·동의와 보관/삭제, AI 공급자·모델·입력 범위·비용·처리 조건을 합의해야 한다.
- 실제 작성값을 전송하는 경로, 실패 시 재시도·입력 보존·실제 저장 재조회, 14명 접근 격리와 삭제 및 실제 Chrome 검증은 미구현·미검증이다.
- 추가 구현·실제 전송·배포 및 시크릿 설정은 승인 범위에 따라 진행. TASK-010 전체 완료도 아님.

## Git 상태
- `C:\Users\patri\ScienceofLearning_Reading`, `feature/week1-extension`, 기존 및 이번 변경 미커밋. 커밋·push·main 병합·배포·실호출 없음.

## PM 검토 (PM 작성)
- 실제 diff·실행 근거 확인:
- 수용 / 수정 요청 / 사용자 판단 필요:
- 남은 위험:
