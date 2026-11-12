# [TASK-024] 서버 변경 검토

작성: 2026-11-12 (Asia/Seoul). 사용자 요청: 검토본 03의 실검증은 보류하고 필요한 서버 변경을 보고한다.

후속 상태: 사용자 v7 적용 지시에 따라 이 계획의 서버 적용과 후보 활성화를 진행했다. 이 문서는 적용 전 조사 기록이며, 현재 상태는 [서버 적용 결과](TASK-024-서버적용-결과.md)를 따른다.

## 결과 요약

- **DB 마이그레이션 2개와 Cloudflare Worker 2종 갱신이 필요하다.** 새 서버를 별도로 구축하는 작업은 계획에 없다. 필요한 코드와 SQL은 개발 브랜치에 작성돼 있으며, 원격 적용과 실제 모델 검증이 남아 있다.
- 실제 개발 저장소: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading`, `feature/guided-reading` @ `2a35ef1`.
- 요청서: [TASK-024 v6](TASK-024-초급-문장후보-구조화.md). 기존 구현·검증은 [결과서](TASK-024-결과.md), 기존 원격 적용 조건은 [사용자검증](TASK-024-사용자검증.md)을 따른다.
- 이번 검토는 코드·SQL 확인, 원격 DB 메타데이터 읽기, 기존 합성 테스트 실행이다. 제품 코드·원격 DB·Worker·스위치는 변경하지 않았다. 03 검증 보류를 통과나 배포 승인으로 해석하지 않는다.

## 현재 원격 DB에서 직접 확인한 차이

Supabase 연결 도구로 `information_schema.columns`, `pg_constraint`, `pg_proc`와 migration 이력만 조회했다. 학습자 행·답안·명단·비밀값은 조회하지 않았다.

| 항목 | 원격 확인 결과 | 필요한 변경 |
|---|---|---|
| 최초 제출 `relation_text` | 비공백 필수 CHECK가 남아 있음 | 빈 문자열 허용, NOT NULL·10,000자 상한 유지 |
| 수정본 `relation_text` | 같은 비공백 필수 CHECK가 남아 있음 | 최초 제출과 함께 선택 설명 허용 |
| 최초 제출 `schema_version` | `schema_version = 1` CHECK | v1/기존 자료와 새 v2 자료 모두 수용 |
| `learning_support` 컬럼 | 조회 결과 없음 | nullable JSONB 추가 |
| `reading_support_capabilities()` | 조회 결과 없음 | 서버·DB 준비 확인용 함수 추가 |

따라서 DB 쪽 TASK-024 변경이 아직 적용되지 않은 것은 메타데이터로 확인했다. Cloudflare의 현재 활성 코드·환경변수·Secret은 이번에 직접 조회하지 않았다. AI Worker의 마지막 배포 기록은 [피드백 배포 인계](../handoff/2026-11-12-AI피드백-루브릭-배포후.md)이며, 현재 상태의 직접 증거와 구분한다.

## 적용해야 할 변경

| 구분 | 변경 내용과 목적 | 로컬 근거 |
|---|---|---|
| DB ① | 최초 제출·수정본의 추가 설명만 선택화한다. 기존 내용과 다른 필수 입력은 보존한다. | `server/migrations/20261112040245_optional_relation.sql` |
| DB ② | 최초 제출에 지원 모드, 실제 후보 노출 이력, 사용 문장·역할·연결의 최초 그래프를 저장한다. 기존 행은 v1/null 유지. 새 버전 제약·컬럼 INSERT 권한·준비 확인 RPC를 추가한다. | `server/migrations/20261112042928_learning_support.sql` |
| 제출·조회 Worker | v1/v2 수용, 빈 설명 정규화, 허용 필드·상태·그래프 검사, 같은 sessionId/payload 재시도와 충돌 검사. `support=1`로 새 정보를 명시 조회하고 `capabilities=2`로 DB 준비를 확인한다. 수정본은 텍스트만 저장하고 최초 그래프는 보존한다. | `server/submissions/worker.mjs`, `server/submissions/records.mjs`, `learning-support.js` |
| AI Worker: 후보 | `POST /reading-candidates` 추가. 서버가 원문을 분할하고 모델에는 문장 ID/텍스트만 보낸다. 모델의 ID 목록을 검증해 원문 순서로 반환한다. 기존 인증·회원·회차·기한·공유 예산을 적용한다. | `server/ai/pilot-worker.mjs`, `server/ai/reading-candidates.mjs`, `server/ai/prompts/reading-candidates-v1.mjs`, `sentence-source.js`, `reading-support-contract.js` |
| AI Worker: 피드백 | 본인 저장 자료에서 지원 맥락을 읽고 모델에는 mode/실제 노출/출처만 추가한다. 평가 대상은 Retell이며 선택 설명 미작성을 감점하지 않도록 지시한다. 최신 중급 루브릭·응답 형식·인용 검사를 유지한다. | `server/ai/pilot-worker.mjs`, `server/ai/feedback.mjs` |

DB ②는 DB ①이 선행되지 않으면 적용을 거절한다. 현재 새 클라이언트의 v2 저장과 빈 설명 저장은 두 변경을 확인하는 capability 응답을 요구한다. DB ①만 적용하고 새 저장 흐름이 준비됐다고 판단하면 안 된다.

본문은 후보 요청에서 UTF-16 12,000자, 요청 JSON은 UTF-8 50,000바이트 이내다. 후보는 기본 3–5개(원문 2문장이면 2개)이며 추가 필드·중복/미등록 ID는 거절한다. 서버 모델 요청 제한은 50초다. 후보 실패도 기존 정책대로 공유 예산을 소모한다. 새로운 전용 예산 저장소나 신규 AI 키는 현재 코드에 필요하지 않다.

기존 본인 행 RLS와 권한은 유지하며 capability 함수는 SECURITY INVOKER, anon/PUBLIC 실행 금지로 작성돼 있다. 적용 후에는 실제 권한도 확인해야 한다. Supabase는 객체 접근 권한과 행 접근 RLS를 별도로 적용하므로 두 층을 함께 검증한다. [공식 Data API 보안 문서](https://supabase.com/docs/guides/api/securing-your-api)

## 배포 준비에서 특히 주의할 점

1. **기본 Wrangler 설정을 그대로 운영에 배포하지 않는다.** 저장소 `wrangler.pilot-ai.jsonc`는 기존 AI 스위치도 false이고 기본 한도는 사용자 5/전체 100이다. `wrangler.submissions.jsonc`에는 운영 회차 변수가 없다. 두 회차 변수가 모두 없으면 `server/pilot-access.mjs`는 회차 검사를 끈다. 현재 운영 설정을 확인한 뒤 이를 보존한 배포 설정을 만들어야 한다.
2. 마지막 운영 기록의 회차는 `team5-20261110`, 기한은 **2026-11-25 23:59:59 KST**, 한도는 사용자·전체 모두 `unlimited`다. 이 값들은 기록 기준이며 배포 직전에 재확인한다. 회차/기한/Origin/Supabase URL/기존 추천·피드백 스위치와 `PILOT_BUDGET` 바인딩을 보존한다. Secret은 기존 저장소에서 유지하고 값은 문서·클라이언트로 복사하지 않는다.
3. 새 서버 스위치 `PILOT_GUIDED_CANDIDATES_ENABLED`는 우선 **false**로 배포한다. 기존 전체 AI 스위치도 적용된다. 클라이언트 `guidedReadingEnabled`도 별도 스위치다. 환경 준비 스크립트의 review 출력도 두 신규 스위치는 false이므로, 기존 AI를 켠 설정이라고 초급 후보까지 켜지는 것은 아니다.
4. 구 배포 폴더의 소스를 재사용하면 최신 코드가 빠질 수 있다. 개발 worktree의 최신 소스와 공용 의존 모듈을 묶어 두 Worker를 번들 검증해야 한다. 기존 준비 스크립트의 소스 목록에는 신규 모듈이 추가돼 있다.
5. 원격 migration 이력 조회에는 `20261110063133 revision_storage` 한 건만 반환됐다. 로컬 SQL의 타임스탬프/목록과 일치하지 않으므로 **기존 migration 전체를 일괄 재실행하지 않는다.** 실제 스키마와 이력을 대조해 이번 두 SQL만 적용할 경로를 정한다. CLI를 쓴다면 설치 버전·도움말부터 확인한다. [CLI v3 변경 안내](https://supabase.com/changelog/supabase-cli-v3)

## 권장 적용 순서와 완료 판단

1. 현재 운영 Worker 버전·설정·Secret 이름, DB 제약·권한과 migration 이력을 확인하고 배포 묶음을 로컬에서 준비한다.
2. 별도 원격 적용 승인 후 DB ① → DB ② 순으로 적용한다. 기존 행을 재작성하지 않는다.
3. 제출 Worker와 AI Worker를 갱신하되 후보 기능은 false로 유지한다. 운영 회차·한도·추천·피드백 설정을 보존한다.
4. 인증된 capability 응답, 기존 v1/새 v2 저장·조회·수정본, 빈 설명, 타인/미인증/비활성 접근 차단을 확인한다. 지원 맥락을 버리는 v1 폴백은 사용하지 않는다.
5. 승인된 소수 범위에서 서버·클라이언트 후보 스위치를 켜고 합성 글로 실제 모델 품질·지연·실패·노출 이력·피드백을 검증한다. 03 Chrome 검증은 별도 보류 항목으로 남는다.

후보 기능에 문제가 생기면 후보 스위치를 끄되, 이미 저장한 v2 자료의 조회 API와 JSONB 컬럼은 보존한다. 구형 서버로 전체 롤백하거나 컬럼을 삭제하는 방식은 새 기록의 접근/저장 호환성을 훼손할 수 있다.

새 테이블·팀원 교차 열람·PDF AI·자유 질의·AI 피드백 영속 저장·새 루브릭은 이번 서버 변경에 포함되지 않는다. 실제 후보 노출과 학습 단계 전환은 클라이언트 관찰/게이트이며 서버가 독립 수행을 증명하는 구조는 아니다. 후보의 핵심성·맥락·학습 효과와 빈 설명 비감점은 형식 검사만으로 검증되지 않는다.

## 이번 검증과 남은 한계

- 실행 위치: 위 개발 worktree. 기존 테스트 6개 파일을 `node --require ./tests/deny-live-preload.cjs --test --test-reporter=dot`으로 실행해 **종료 코드 0**을 확인했다. 대상: `candidates`, `learning-support`, `optional-relation`, `records-db`, `feedback-prompt`, `submission-http`.
- API/모델은 모의 응답, DB는 로컬 PGlite를 사용하는 검사다. preload로 전역 fetch를 차단했다. 원격 사용자 자료·실제 모델을 사용하지 않았다.
- 원격 DB는 메타데이터 읽기만 수행했다. SQL 적용, 실환경 쓰기/RLS 검증, Worker 배포·번들 검증, 실제 모델 호출, 03 Chrome 실검증은 이번 보고에서 실행하지 않았다.
- 이 문서만 추가했으며 제품 코드 변경·커밋·main 병합·push는 하지 않았다. 기존 AC 완료 상태와 제품 설계는 변경하지 않는다.
