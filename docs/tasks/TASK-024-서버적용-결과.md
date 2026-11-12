# [TASK-024] 서버 적용·후보 기능 활성화 결과

작성: 2026-11-12 (Asia/Seoul).

## 결과 요약

- **DB ① → DB ② → 두 Worker 갱신 → 원격 검증 → 후보 기능 활성화 완료.** 실제 Google 계정의 전체 저장/후보 요청, 모델 의미 품질, Chrome 사람 QA는 남아 있으므로 TASK 전체 완료로 표시하지 않는다.
- 요청서: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading\docs\tasks\TASK-024-초급-문장후보-구조화.md` v7. 이번 사용자 명시 지시로 원격 적용·검증·활성화를 승인받았다.
- 실행 위치: 같은 개발 worktree, `feature/guided-reading` @ `2a35ef1`. 승인된 기존 회차 안에서 적용했다. 제품 코드 신규 수정 없이 검토된 기존 코드를 배포했다.
- 검토본 03 실검증은 사용자 요청대로 보류했다. 배포·합성 검증을 Chrome 검증이나 후보 품질 검증으로 대체하지 않는다.

## 변경 파일과 배포 대상

| 구분 | 적용 결과 |
|---|---|
| DB ① | 로컬 `20261112040245_optional_relation.sql`의 SQL 적용. 원격 이력 `20261112074359 optional_relation`. 최초 제출·수정본의 설명은 빈 문자열 허용, NOT NULL·10,000자 상한 유지 |
| DB ② | 로컬 `20261112042928_learning_support.sql`의 SQL 적용. 원격 이력 `20261112074541 learning_support`. nullable JSONB, v1/v2 제약, 컬럼 INSERT 권한과 capability 함수 추가 |
| 제출 Worker | `reading-submissions-pilot`: `b3233c5d-5a5a-4aa8-bee7-0c4e3fe52fa8` → **`7e56bbbb-6146-421e-aa26-959df009f5cb`** |
| AI Worker, 비활성 단계 | `reading-ai-pilot`: `8d69e47b-f268-4637-97c1-aaf33680eb3f` → `ecef07a5-ddb1-40c6-9f99-17f64bcca75d`, 후보 false |
| AI Worker, 활성화 단계 | 최종 **`f8d429ba-c4a8-46a5-9a29-5d1d4c2127d1`**, 후보 스위치 하나만 true로 변경 |
| 설치본 | `dist/task024-guided-team5-ai-01/extension/`, `extension.zip`. 클라이언트 `guidedReadingEnabled=true`, Google 로그인·기존 추천/피드백 활성 설정 |
| 기록 문서 | 요청서 v7, 이 결과, 기존 결과·사용자검증·작업 인덱스·변경이력 갱신. 서버 검토 보고서는 적용 전 조사 기록으로 보존 |

원격 이력의 타임스탬프는 Supabase 적용 도구가 생성한 값이다. 로컬 SQL 파일을 재명명하거나 예전 migration을 일괄 재실행하지 않았다. 기존 자료를 재작성하지 않았다.

## 운영 설정 보존

- 회차 `team5-20261110`, 기한 **2026-11-25 23:59:59 KST**, 사용자·전체 일일 한도 모두 `unlimited`, 기존 Origin·Supabase URL·전체 AI/추천/피드백 true를 보존했다. 서버 기한 문자열은 같은 시각의 정규 ISO 형식 `.000Z`로 맞췄다.
- 사전/사후 버전 메타데이터를 비교해 기존 평문 변수의 의미, Secret 이름 집합, AI 예산 Durable Object의 클래스·namespace가 보존됨을 확인했다. Secret 값은 조회·복사하지 않았다. `--keep-vars`로 기존 추가 설정도 유지했다.
- 신규 기본 저장소 설정은 false 그대로다. 승인된 배포 묶음과 전달 설치본에서만 후보 기능을 켰다. 참가자·회차·기간·한도를 확대하지 않았다.

## 완료 기준별 검증

| 관련 기준 | 실제 검증 | 미검증 범위 |
|---|---|---|
| AC-02/04/05 | 전체 합성 검사, 후보 API의 Origin·무인증·비활성·회차 거절, 활성화 전 disabled와 활성화 후 거절 동작 | 실제 Google 후보 성공·품질·지연·모델 오류율 |
| AC-06/07/10 | 원격 스키마·권한 확인, 합성 v2 최초 그래프 저장/본인 조회, 빈 설명 수정본, 불변 맥락, v2 null 거절, 타인/위조/비활성 거절, 익명 capability 거절, 부모 삭제 전파 | 실제 Google 계정의 Worker 경유 v2 저장 전체 흐름·구형 설치본 교차 실행 |
| AC-08 | 최신 피드백 루브릭·인용·지원 맥락의 자동 회귀, 배포 후 무효 토큰 401 | 실제 피드백 의미 품질·빈 설명 비감점 |
| AC-09 | 전체 283 통과/실패 0/skip 0, 두 Worker dry-run, 설치본 빌드·설정/소스 복사본 비교 | 사용자/PM 최종 수용 |
| AC-01/03 및 화면 관련 기준 | 기존 합성 회귀 유지 | 03을 포함한 실제 Chrome 재확인은 보류 |

## 실제 실행 결과

- 전체 회귀: `node --require ./tmp/task024-live/deny-external.cjs --test tests/*.test.*`, **283 통과 / 실패 0 / skip 0**, 약 26.4초. 루프백만 허용하고 외부 fetch와 실환경 비밀 설정 읽기를 차단했다. Windows PowerShell 기본 모듈 경로는 검사 프로세스에만 적용했다.
- 첫 실행은 모든 fetch를 차단하는 기존 preload 때문에 루프백 검사 3개가 실패했다(280 통과). 제품 수정 없이 검증 환경만 외부 통신 차단/루프백 허용으로 바로잡아 재실행했다. 실패 로그도 로컬 근거로 보존했다.
- Wrangler **4.158.0**의 실제 도움말을 확인했다. 두 Worker dry-run 종료 0, 의존 모듈 번들 성공. 배포 묶음은 `build/task024-live-01`, 현재 소스와 복사본의 SHA-256 일치 확인.
- 원격 DB 합성 검증은 임의 UUID의 임시 합성 인증/회원 자료와 답안을 하나의 트랜잭션에서 생성해 실제 `authenticated`/`anon` 역할과 RLS로 실행했다. 마지막에 **전체 ROLLBACK**했다. 기존 회원·실제 답안·실제 학습자 행은 조회하지 않았고 합성 계정/답안은 남기지 않았다. SQL 근거는 `tmp/task024-live/remote-db-verification.sql`.
- 배포 API 검증은 보호된 로컬 설정의 기존 합성 시험 계정으로 수행했다. 정보는 출력하지 않았고 관리자 키는 사용하지 않았다. 후보 false 단계 **21개**, true 단계 **18개** 점검 통과. 인증된 capability 200·계약, 기록 스키마 준비, 미인증 401, 잘못된 Origin 403, 허용 preflight 204, 비활성·Google 회차 밖 계정 거절을 확인했다.
- 합성 비밀번호 시험 계정은 Google 회차에 들어갈 수 없음을 확인했다. 이를 우회하거나 명단/회차 정책을 바꾸지 않았다. **실제 모델 호출과 실제 Google 성공 흐름은 실행하지 않았다.**
- DB 적용 전후 보안 advisor는 동일하다. 기존 RLS 정책 없음 INFO 3건은 직접 접근을 막는 회원/비공개 운영 테이블이며 이번에 새로 생기지 않았다. 기존 비밀번호 유출 방지 미활성 WARN도 유지된다. 이번 범위에서 인증 설정은 바꾸지 않았다. [RLS 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [비밀번호 보안 안내](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- 로컬 전용 근거: `tmp/task024-live/regression*.txt`, `remote-smoke-disabled.json`, `remote-smoke-enabled.json`, `predeploy-versions.json`, `postdeploy-versions.json`, `final-settings-verification.json`, `deploy-*.txt`. 비밀값·실제 답안이 없는 요약만 보존하며 Git에 넣지 않는다.

## 설치본과 남은 사용자 확인

- 설치 폴더: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading\dist\task024-guided-team5-ai-01\extension`.
- ZIP SHA-256: `36812a7375596403d35cead7862c4ec4681bee69a12df5c14d47c51d14212a6d`.
- 기준 커밋 `2a35ef1`, 빌드 보고서 `sourceDirty:true`(요청서 문서 변경 포함), 모드 `remote-configured-unverified`. 이후 문서 수정만으로 이 빌드 근거를 바꾸지 않는다.
- 실제 사용은 같은 확장 ID의 기존 설치본을 이 폴더로 교체해야 한다. 미저장 훈련을 마친 뒤 교체하며 새로고침 후 Google에 다시 로그인한다. 03은 네트워크 차단 검토본이므로 실제 후보 요청용으로 사용하지 않는다.
- 후속 확인: 사전 등록 Google 계정 → 합성 웹 글 → 초급·명시 후보 요청 → 직접 배치/연결 → 자기 말 중심 생각/Retell → 빈 설명으로 저장/재조회. 후보를 본 뒤 모두 제외하거나 직접 작성으로 전환해도 노출 이력이 유지되는지와 피드백 의미 품질을 확인한다. 실제 글·답안·토큰을 공개 자료로 보내지 않는다.

## 문제 발생 시

후보 기능만 중지하려면 `build/task024-live-01/wrangler.ai.review.json`(후보 false)을 `--keep-vars`로 배포한다. 이는 v2 조회/저장과 최신 피드백을 유지하는 비활성 버전이다. 클라이언트 false 설정도 같은 폴더에 있다. SQL 컬럼을 삭제하거나 v2를 모르는 구형 제출 Worker로 되돌리지 않는다. 이미 저장한 지원 이력·최초 그래프 조회를 보존한다.

## Git 상태와 PM 검토

- 기능 브랜치의 기존 코드 커밋 `2a35ef1`을 배포했다. 이번 변경은 미커밋 문서로 보존한다. 신규 커밋·main 병합·push 없음. root와 다른 worktree 미편집.
- 실제 SQL/배포 결과와 자동 근거는 위 범위에서 확인했다. 사용자/PM의 전체 수용, 모델 의미 품질과 실제 Chrome 검증은 미완료다.
