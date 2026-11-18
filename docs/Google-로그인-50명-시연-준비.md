# Google 로그인 50명 시연 준비와 계정 추가

2026-11-18 / TASK-030 v3. **운영 정원 50명 적용·검증 완료.** 새 제약과 정원 변경은 이미 실행했으므로 재실행하지 않는다. 추가 계정은 아래의 참여 명단 등록 절차를 진행한다. [서버 적용 결과](tasks/TASK-030-서버적용-결과.md)

## 현재 상태와 변경안

11/18 읽기 전용 진단 당시 운영 회차 `team5-20261110`은 정원 5명, 사용 슬롯 5개, 초대 명단 5개였다. 사용자 승인으로 이 회차 정원을 50명으로 확대했고 14:02 KST에 확인했다. 현재 사용 슬롯과 초대 명단은 각 5개이며 잔여 슬롯은 45개다. 회차 이름에 `team5`가 있어도 실제 정원은 DB의 capacity 값으로 결정되므로 이름을 바꿀 필요가 없다.

- 정원은 전체 승인 계정 수다. 기존 5명을 포함해 50명이며 추가 여유는 45명이다. 동시 접속 50명에 대한 성능 검증은 별도다.
- 추가 대상은 앱의 비공개 참여 명단에 사전 등록해야 한다. Google 인증 성공이나 Google Cloud 테스트 사용자 등록만으로 참여 권한이 생기지 않는다.
- 기존 계정·역할·학습 기록·회차 ID·시작/종료 시각은 유지한다. 새로 승인되는 계정의 역할은 기존 승인 함수에 따라 participant다.
- 이번 정원 변경에는 제출/AI Worker 재배포나 확장 재설치가 필요하지 않다. 기존 서버가 DB의 회차 정원을 읽는다.
- 사용 기한은 **2026-11-25 23:59:59 KST**다. 발표가 이후라면 DB 회차와 제출/AI Worker의 기한을 함께 연장하는 별도 작업이 필요하다. 이번 준비에 연장은 포함되지 않는다.

## 사용자가 지금 준비할 것

1. 시연·테스트에 사용할 실제 Google 계정 이메일을 비공개로 정리한다. 오늘 추가한 두 계정도 포함한다. 기존 5명을 포함한 총인원이 50명을 넘지 않게 한다.
2. 정원 확대는 이미 승인·적용됐다. 준비한 추가 계정을 아래 관리자 등록 양식으로 사전 등록하고 해당 사용자에게 재로그인을 안내한다.
3. 발표가 11/25 이후라면 발표 날짜와 필요한 이용 종료일을 정한다.

실제 이메일은 이 저장소의 문서·SQL 파일·커밋에 적지 않는다. 아래의 초대 양식을 Supabase 관리자 SQL Editor에 복사한 뒤 그 화면에서만 입력한다.

## 운영 적용 순서 (v3에서 수행 완료한 기록)

**아래의 제약·정원 변경은 이미 적용했다. 재실행하지 않는다.** 원격 migration 이력 `20261118050030_cohort_capacity_50`이 로컬 검토 파일 `20261118042724_cohort_capacity_50.sql`에 해당한다. 이후 자동 배포 전에 이 매핑과 기존 수동 적용 이력을 확인한다. 아래는 검토·적용 당시 절차이며 읽기 전용 점검 SQL은 현재 상태 확인에 사용할 수 있다.

1. [ScienceofLearningDB SQL Editor](https://supabase.com/dashboard/project/mxhlxenfboiaywyhgyqs/sql/new)를 연다. 기존 사용자 테스트가 끝났고 변경 승인이 있는지 확인한다.
2. 아래 읽기 전용 점검으로 활성 회차가 하나이고, ID·기한·기존 사용 슬롯이 예상과 같은지 확인한다. 다르면 중단하고 현재 상태부터 검토한다.
3. 새 migration `server/migrations/20261118042724_cohort_capacity_50.sql`만 적용한다. 기존에 적용된 TASK-020 전체 migration은 재실행하지 않는다. 새 migration은 허용 정원에 50을 추가하며 실제 회차 정원은 아직 바꾸지 않는다. 연결된 배포 도구로 적용하면 migration 이력에도 남긴다. SQL Editor로 직접 실행한 경우 실행 경로·시각을 결과서에 기록하고 나중에 자동 migration 배포 전 이력을 맞춘다.
4. `server/operations/set-active-cohort-capacity-50.sql`을 실행한다. 활성 회차 한 개가 현재 사용 기간 안에 있을 때만 정원 50으로 변경한다. ID·기한·초대·회원·학습 기록은 수정하지 않는다.
5. 읽기 전용 점검을 다시 실행한다. capacity=50, 기존 ID·기한 동일, 기존 초대·사용 슬롯 수 동일인지 확인한다. 신규 사용자가 로그인하기 전이라면 진단 당시 기준 초대/사용 슬롯은 각 5개다.

두 SQL은 트랜잭션으로 실행하며 잠금 대기는 최대 5초, 문장 실행은 최대 30초다. 제약 변경 중 짧은 테이블 잠금이 발생하므로 테스트 종료 후 적용한다. 실패하면 해당 트랜잭션은 전부 취소된다. SQL Editor에 트랜잭션 중단 상태가 남으면 `rollback;`으로 닫고 원인을 확인한다. 실패한 명령을 일부 생략해 강행하지 않는다.

```sql
select c.id, c.capacity, c.enabled,
  c.starts_at at time zone 'Asia/Seoul' as starts_kst,
  c.expires_at at time zone 'Asia/Seoul' as expires_kst,
  (select count(*) from pilot_private.google_invites i
    where i.cohort_id=c.id) as invited_count,
  (select count(*) from pilot_private.google_invites i
    where i.cohort_id=c.id and i.enabled) as enabled_invites,
  (select count(*) from pilot_private.google_invites i
    where i.cohort_id=c.id and i.user_id is not null) as claimed_slots
from pilot_private.cohorts c where c.enabled;

select pg_get_constraintdef(oid) as capacity_constraint
from pg_constraint
where conrelid='pilot_private.cohorts'::regclass
  and conname='cohorts_capacity_check';
```

## 두 계정 및 이후 시연 계정 등록

정원 변경을 완료한 뒤 다음 순서로 진행한다.

1. `server/operations/register-google-invites.template.sql`을 SQL Editor의 새 쿼리로 복사한다.
2. 관리자 화면에서 `v_emails` 배열의 예시 두 개를 실제 Google 이메일로 바꾼다. 더 필요하면 배열에 추가한다. 공백 제거·소문자 변환만 하며 Gmail 점이나 plus 별칭을 임의로 합치지 않는다. 예시 `.invalid`가 남아 있으면 전체 등록을 중단하도록 되어 있다.
3. 실행 결과의 초대 수가 늘어났는지 확인한다. 예를 들어 기존 5개에 서로 다른 신규 2개를 추가하면 초대 7개, 아직 로그인 전 사용 슬롯 5개다. 기존 초대는 중복 생성하지 않는다. 이미 비활성화한 계정의 초대도 자동 복구하지 않는다.
4. 해당 사용자가 확장에서 **Google 계정으로 로그인**을 다시 누르고 등록한 동일 계정을 선택한다. 신규 사용자의 `user_id`는 비워 두며 서버가 확인된 Google 계정에 자동 연결한다. Supabase Auth에서 비밀번호 계정을 따로 만들거나 `pilot_members`를 직접 채우지 않는다.
5. 두 계정의 로그인 후 사용 슬롯이 7개로 늘어났는지 확인한다. 글 연결·훈련·제출·본인 기록 조회를 사용자와 확인한다. 기존 사용자도 로그인/본인 기록 접근을 유지하는지 확인한다. 실제 사람 확인은 로컬 자동 검증과 별도로 기록한다.

Google Cloud의 기존 테스트 사용자 등록은 유지해도 된다. 현재 코드처럼 기본 로그인 범위 `openid email profile`만 요청하는 경우 Google은 테스트 사용자 명단 제한의 예외를 안내한다. 다른 권한 범위가 설정된 경우에는 Google Cloud → Google Auth Platform → Audience에서 테스트 사용자 정책을 별도로 확인한다. 이번 계정의 앱 승인 실패를 해결하는 필수 단계는 위의 **앱 참여 명단 등록**이다. [Google 공식 안내](https://support.google.com/cloud/answer/15549945?hl=en)

## 실패 시 확인과 복구

- migration이 기존 제약 불일치로 멈추면 현재 DB의 제약을 확인한다. 이미 적용한 파일을 중복 적용하지 않는다.
- 정원 변경이 회차 없음·기간 만료·잠금 시간 초과로 멈추면 원인 확인 후 승인된 시간에 재시도한다. 기한을 임의로 바꾸거나 진행 중인 사용자를 강제 로그아웃하지 않는다.
- 신규 계정이 여전히 거절되면 사전 등록 이메일과 실제 선택한 Google 계정이 같은지, 초대와 회원이 활성인지, 사용 기간과 50개 슬롯이 유효한지 확인한다.
- 운영 정원을 되돌려야 한다면 신규 등록/로그인을 먼저 중지하고 기존 정원 이하의 사용 슬롯인지 확인한다. 신규 사용자가 추가된 뒤에는 정원을 줄여도 승인된 계정이 자동 회수되지 않는다. 5개를 초과한 상태에서는 무작정 5명으로 줄이거나 초대·계정을 삭제하지 말고 접근 영향부터 검토한다.
- schema의 50 허용 제약은 그 자체로 계정을 추가하거나 권한을 부여하지 않는다. 정원 값 복구를 위해 기존 제약을 급히 되돌릴 필요는 없다.

## 로컬 준비 묶음

- `build/task030-capacity50-review-01/`: 새 migration, 정원 변경 SQL, 초대 양식, 이 안내의 복사본과 해시 보고서. 로컬 검토용이며 적용 자동화나 실제 명단은 없다.
- 회차 준비 도구도 5/14/50을 지원하도록 수정했다. 이 도구가 만드는 Worker 검토 설정은 정원 변경 시 사용할 필요가 없다. 현재 운영 Worker 변수·AI 기능·예산을 보존한다.
- 정원 50은 AI 호출 수·금액 상한이 아니다. 기존 AI 예산은 이번 작업에서 변경하지 않는다.
