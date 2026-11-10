# Google 로그인·사전 등록 기반 5인 배포 준비

2026-11-10 / TASK-020 v1. 상태: **로컬 구현·합성 검증 완료, 실제 설정·배포·사람 QA 대기**.

## 사용자에게 보이는 흐름

확장 설치 → 「Google 계정으로 로그인」 → Google 계정 선택·동의 → 사전 등록 확인 → 글 연결·직접 독해·Retell·제출·직접 수정·내 기록.

- 별도 파일럿 비밀번호를 배부하지 않는다. Google 계정 인증 뒤 Supabase가 내부 사용자 ID를 생성/연결하고 기존 DB·JWT·본인 기록 접근을 재사용한다. Supabase 프로젝트 관리 권한을 참가자에게 주지 않는다.
- 사전 등록 Google 이메일은 서버 비공개 명단과 비교한다. 미등록/미확인/회수된 계정은 학습 서버·AI에 접근할 수 없다. Google 인증 사용자 레코드 생성과 앱 참여 승인은 구분된다.
- 요청 범위는 openid/email/profile이다. Gmail 메일·연락처·Drive를 읽는 권한을 요청하지 않는다. 이름·사진은 화면에 추가 표시/저장하지 않는다.
- 토큰·이메일 표시값·PKCE 검증값은 패널 메모리에만 사용한다. 패널 종료 후 재로그인이 필요할 수 있다. Google 제공자 토큰·refresh token은 보관하지 않는다.

## 현재 실제 확인과 후보

- 기존 공개 설정으로 Supabase `/auth/v1/settings`를 읽기 전용 확인한 결과 Google 제공자는 **false**였다. 계정·명단·모델 요청 없이 이 boolean만 출력했다. 실제 설정은 변경하지 않았다.
- 설치 후보: `dist/task020-google-team5-01/extension/`, 전달 ZIP: 같은 폴더 상위 `extension.zip`. Google 로그인 켜짐·AI 두 UI 스위치 꺼짐·identity 권한 추가. **실제 설정 전 설치/로그인 성공을 보증하지 않는다.**
- ZIP SHA-256: `62c3aea979ec3870b2652474999ac6892ec0a6bf0487745908cfa5b987846e7b`.
- 서버/공개 UI 검토 후보: Git 제외 `build/task020-google-team5-review-01`. AI 기본 비활성/활성 검토 설정과 제출 Worker 설정, SQL 초안·소스 해시·준비 보고서가 있다. 명단·UID·Google Client Secret은 없다.
- 회차 후보 ID는 `team5-20261110`, 정원5, 사용자 UTC 일일4회/회차 전체 일일20회다. **검토값**이며 배포/호출 확대 승인이 아니다. 검토용 기한은 preparation-report.json에 있고 실제 적용 직전에 승인한 기한으로 재생성한다. 기존 본인 시험 기한은 바꾸지 않았다.
- 신규 AI 예산은 회차별 Durable Object로 구분하고 같은 회차 ID의 기한/배포 변경으로 예산을 재설정하지 않는다. 일일 요청 횟수 제한이며 시험 전체/금액 상한이 아니다. 실패도 예약을 소모한다. 14인 후보는 같은 도구의 capacity14로 준비할 수 있으나 실제 확대는 5인 QA 후 별도 승인한다.

## 1. Google OAuth 등록 (사용자/관리자 수행)

1. Google Cloud의 사용할 프로젝트와 OAuth 동의 화면을 정한다. 외부 팀원/참가자라면 조직 내부 전용으로 제한하지 않는다. 테스트 사용자 제한을 쓰면 실제 참여할 Google 계정만 해당 관리 화면에 등록한다. 실명·이메일을 이 저장소에 복사하지 않는다.
2. Supabase를 인증 서버로 사용하는 이번 구현은 **Web application OAuth 클라이언트**를 사용한다. Chrome extension 유형의 별도 클라이언트나 Gmail API를 추가하지 않는다.
3. Google의 Authorized redirect URI에 `https://mxhlxenfboiaywyhgyqs.supabase.co/auth/v1/callback`을 등록한다. Google → Supabase 복귀 주소이며 아래 Supabase → 확장 주소와 다르다.
4. 범위는 openid와 이메일/프로필만 사용한다. Client ID와 Client Secret을 확보하고 **Supabase Google provider 설정의 비밀 입력란에 직접 등록**한다. Secret을 채팅·Git·공개 설정·확장에 전달하지 않는다.

공식 근거: [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-sign-in/auth-google). 실제 Google 로그인 화면은 각 사용자가 직접 진행한다.

## 2. Supabase 복귀 주소·DB 준비 (실환경 변경 별도 승인)

- Google provider를 위 값으로 구성하고 활성화한다. 신규 Google 사용자의 내부 Auth 계정 생성 허용 여부를 확인한다. 공개 Auth 사용자 레코드가 생기는 것과 앱의 실제 접근 허용은 다르다. 원하지 않는 가입 자체 차단이 필요하면 별도 Auth hook을 검토하며 이번 코드에 구현됐다고 가정하지 않는다.
- Supabase Auth의 허용 redirect URL은 `https://jenapgoakhnmlmjcdnkfakkkgjobbfbb.chromiumapp.org/google-callback?flow=*`처럼 고정 확장 ID·고정 경로와 세션용 flow 쿼리를 허용하는 좁은 규칙으로 설정한다. 실제 해당 플랫폼의 glob 매칭을 테스트 계정으로 확인한다. 허용하지 않아 Site URL로 되돌아가는 경우 앱은 잘못된 복귀로 거절한다. 임의의 외부 도메인 와일드카드는 쓰지 않는다.
- 코드도 callback origin/path/일회성 flow/PKCE와 확인된 Supabase 사용자 ID를 검사한다. 인증 URL에 토큰·이메일·답안을 넣지 않는다. Google/Supabase 콜백과 검증값을 로그로 남기지 않는다. [Chrome identity](https://developer.chrome.com/docs/extensions/reference/api/identity), [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [redirect 설정](https://supabase.com/docs/guides/auth/redirect-urls)
- DB 초안은 `server/migrations/20261110140000_google_cohort_access.sql`이다. **현재 로컬 PostgreSQL 검증용이고 원격에 적용하지 않았다.** 실제 테이블/기존 함수/정책·grants·노출 schema·advisors를 재확인하고 정식 migration을 생성·검토한 뒤 승인된 변경만 적용한다. 충돌 시 초기화를 하지 않는다.
- `pilot_private.cohorts`와 `pilot_private.google_invites`는 Data API 노출 schema에 추가하지 않는다. 두 테이블은 RLS·직접 권한 회수로 보호한다. public에는 인자 없는 자기 승인 RPC와 자기 자격 확인 invoker 함수만 제공한다. 새 public 함수의 API 노출/캐시를 확인한다.
- 기간 만료는 새 최초본/수정본 쓰기·AI를 차단한다. 기존 승인 사용자에게는 본인 기록 조회를 유지한다. 명단 또는 회원 자체를 비활성화하면 기존 기록 접근도 차단된다. 기존 legacy 본인 계정 접근은 유지하지만 5인 회차 제한 Worker에서 새 학습/AI를 하려면 해당 회차 자격이 필요하다.

## 3. 실제 Google 이메일 사전 등록 (보호된 관리자 경로)

- 회차 메타데이터를 관리자가 등록한다: 후보/승인된 ID·정원5·시작/종료·enabled. 한 번에 활성 회차는 하나다. 실제 적용 기한과 Worker의 UTC 기한을 일치시킨다.
- 관리 콘솔 또는 승인된 매개변수 SQL 경로로 팀원 5명의 **실제 Google 계정 이메일**을 `pilot_private.google_invites`에 등록한다. 공백 제거·소문자 변환만 한다. Gmail 점/plus 별칭을 임의로 병합하지 않는다. 파일을 공유하거나 Git에 넣지 않는다.
- user_id는 비워 두고 enabled만 설정한다. 실제 Google 로그인 시 서버가 `auth.users`의 확인된 이메일과 Google `auth.identities`의 email_verified/이메일을 비교해 그 사용자에게만 연결한다. 클라이언트에서 email/UID/role/승인 여부를 제출하는 경로는 없다.
- 회차 row 잠금으로 승인 수를 정원 안에서 처리하고 같은 계정의 반복 로그인은 정원을 늘리지 않는다. 이미 사용한 슬롯은 단순 비활성화만으로 다른 사람에게 자동 재할당하지 않는다. 기존 disabled 회원은 자동 복구하지 않는다.
- 운영자는 참가자에게 프로젝트 관리자 권한이나 공용 계정을 주지 않는다. 팀원 5명 외 운영자를 여섯 번째 사용자로 등록하면 정원5를 초과한다. 운영자 점검을 포함할지 별도 계획하며 실제 명단이나 정원을 임의 변경하지 않는다.
- 승인 회수는 초대 row의 enabled=false 또는 회원 enabled=false로 처리한다. 이미 발급된 JWT가 있더라도 다음 서버/DB 접근에서 적용되도록 검사한다. 타인 답안 열람 권한은 이번 작업에 없다.

## 4. 배포·설치 순서와 검증

1. DB 초안·Google/Supabase 설정·정확한 5인 명단·시험 기한·호출 예산·전송 고지를 검토한다. 비밀/명단 값은 공개 보고서에 포함하지 않는다.
2. 승인 후 DB/승인 RPC를 적용하고 비민감 테스트 계정의 정상/거절·직접 API RLS를 확인한다. 실제 계정·답안으로 자동 테스트하지 않는다.
3. 신규 회차 설정으로 제출 Worker 및 AI 기본 비활성 후보를 검토/배포한다. 기존 Origin/소유권/회원 확인을 유지한다. 배포 결과·Secret 존재/타입만 확인하고 값을 복제하지 않는다.
4. Google만 켜진 설치 후보로 실제 Google 로그인·사전 등록 거절/성공·직접 작성/저장/재조회부터 확인한다. 기존 본인/검증 프로필의 미저장 입력을 보존한다. ZIP을 직접 Chrome에 설치하지 않는다.
5. AI를 실제 사용할 범위·기한·한도·전송·비용을 승인한 뒤 활성 검토 후보와 UI AI 스위치를 함께 적용한다. 한도/기간/회수 거절 검증은 모델을 실제로 호출하는 부하검사로 대체하지 않는다.
6. [5인 사람 QA](tasks/TASK-020-5인-QA.md)를 수행한다. 새 Google 기능은 기존 본인 사용자 보고로 완료 처리하지 않는다. 치명 결함이 있으면 확대를 중단하고 수정·해당 회귀·사람 재확인 후 재개한다.

이번 세션은 1~6의 실행 승인을 요청한 것이 아니라, 실행할 구체안과 로컬 후보를 준비한 상태다. 실제 Google 계정 생성/로그인·Client Secret 등록·실환경 DB/서버 변경·초대/참가자 수집·유료 모델 호출은 수행하지 않았다.
