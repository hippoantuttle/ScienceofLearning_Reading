# [TASK-024] 초급 기능 통합 개발 결과

## 결과 요약
- 상태: **로컬 통합 구현·자동 검증 완료 / 실제 Chrome·모델·원격 검증 대기**. TASK 전체의 사람 수용·운영 완료는 아니다.
- 요청서: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading\docs\tasks\TASK-024-초급-문장후보-구조화.md` v6.
- 실행 위치: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading`, 브랜치 `feature/guided-reading`, 시작 HEAD `91288c2`.
- 초급 화면·전용 후보 API·v2 지원 맥락/최초 그래프 저장·조회·피드백·설치 패키지 연결을 구현했다. 이전 1차 결과는 `git show 91288c2:docs/tasks/TASK-024-결과.md`에서 확인할 수 있다.
- 자동 전체 검사 **283개 통과 / 실패 0 / skip 0**, 약 28.4초. 네트워크 차단 초급 UI 검토본을 준비했다.
- 서버·제품 클라이언트 스위치 기본 false. 원격 DB/Worker·실제 모델/자료 전송·기능 활성화·신규 커밋·main 병합·push는 하지 않았다.

## 변경 파일과 동작
- `guided-panel.js`, `sidepanel.html/js/css`, `reading-support.js`, `pilot-ai-panel.js`: 웹 글의 도움 방식 선택(중급 기본) → 명시 요청 → 원문 후보 → 주장–근거 기본 유형(변경 가능)과 빈 역할/연결에서 직접 구성 → 자기 말 중심 생각 → Retell. 원문에서 추가/제외, 2–8개 카드와 최대 16개 직접 연결, 클릭/키보드 조작, 선택 설명, 실패/미지원 시 직접 작성 경로. 중급/PDF 기존 순서 유지.
- 초급에서 기존 추천 카드/구조 유형 추천을 가리고 늦은 추천도 표시하지 않는다. 모드 선택·로그인·글 연결만으로 후보를 호출하지 않는다. 구조화 시작·수동 전환·계정/글 변경·Retell/종료 시 취소/세대로 늦은 성공·실패를 차단한다. 수신/실제 노출을 구분하며 노출 후 수동 전환에도 이력을 유지한다.
- `server/ai/reading-candidates.mjs`, `server/ai/prompts/reading-candidates-v1.mjs`, `server/ai/pilot-worker.mjs`: `/reading-candidates` 전용 경로. 기존 인증·활성 회원·회차/기한·공유 예산 예약을 재사용. 기본 false 서버 스위치와 전체 AI 스위치를 모두 적용한다. 실패도 예약을 소모한다. 모델에는 서버 분할 문장의 ID/원문만 전달한다. ID 외 추가 필드·잘못된/중복 ID는 거절하고 원문 순서로 반환한다. 서버 50초/클라이언트 60초, 스트림 크기 상한, 공급자 리다이렉트 거절.
- `learning-support.js`: v2 learningSupport의 허용 키·자료형·모드/활동/노출/시도 조합·출처·그래프 참조·텍스트 매핑 검사 및 구조적 깊은 동일성 비교. 원문 전문/미사용 후보 텍스트 필드는 거절한다.
- 저장 필드: `version, mode, activity, candidateExposure, requestStatus, attempts, segmentationVersion, promptVersion, modelId, documentHash, candidateIds, graph`. 그래프 노드는 사용한 발췌만, 연결은 from/to/relationType만 저장한다. 중급은 independent/manual/no-exposure, 초급 수동은 노출 true/false 모두, 초급 graph는 유효한 카드/연결 필수다.
- `submission-contract.js`, `submission-flow.js`, `submission-http.js`, `submission-panel.js`: schemaVersion 2의 지원 정보를 최초 답안과 한 번에 저장하고 동일 스냅샷/키로 재시도한다. JSON 객체 키 순서와 무관한 깊은 재조회 비교. 지원 정보를 잃는 v1 폴백 없음.
- `server/submissions/worker.mjs`, `records.mjs`, `record-client.js`: v1/v2 양쪽 수용, 명시적 `support=1`로 새 세부 정보를 요청. 구형 응답은 기존 v1 텍스트 형식으로 유지한다. 목록/상세에서 선택 모드와 실제 노출을 구분한다. 읽기 중 과거 기록 차단 유지.
- **준비 전 저장 차단:** v2 또는 빈 설명 저장 전 `capabilities=2`로 새 Worker·DB 기능을 확인한다. 준비되지 않으면 POST하지 않고 업데이트 안내/입력을 보존한다. 수정본의 빈 설명도 동일하게 확인한다. 이전 검토에서 발견한 기존 DB의 비공백 CHECK 실패를 실제 저장 전에 막는다.
- `server/migrations/20261112042928_learning_support.sql`: 기존 본인 행에 nullable JSONB 추가, v1/null·v2/object 버전 CHECK, 크기/기본 형식, 새 컬럼 insert 권한만 추가. 기존 RLS·수정본·권한 유지. capability 함수는 SECURITY INVOKER이고 anon/PUBLIC 실행 금지. 선택 설명 migration이 먼저 적용되지 않았으면 거절한다. 데이터 재작성/삭제 없음.
- `support-view.js`, `records-panel.js`, `feedback-panel.js`, `server/ai/feedback.mjs`: 정리/기록/수정 화면에 실제 노출 및 최초 그래프를 구분 표시. 수정본은 텍스트만 저장. 피드백 모델에는 최소 mode/exposure/출처만 추가하고 전체 그래프·ID·미사용 후보는 보내지 않는다. Retell 중급 루브릭·응답/인용 검사·TASK-022 토큰 검사·빈 선택 설명 비감점 지침 유지.
- `scripts/build-extension.cjs`, 환경 준비 스크립트, `wrangler.pilot-ai.jsonc`, `submission-config.js`: 신규 모듈 허용 목록/스크립트 순서·공개 설정 검증·서버 소스 묶음 반영. 원격 스위치 false 유지. `--review-only --guided-review`는 네트워크 권한 없이 초급 UI만 검토하는 별도 옵션이다.
- `scripts/guided-review.cjs`: 직접 작성한 합성 글만 루프백에서 제공하는 사용자 검토 보조 서버. AI/인증/답안 수집/외부 요청 없음.

## 완료 기준별 검증
| 기준 ID | 자동 검증 | 사람/실환경 검증 |
|---|---|---|
| AC-01 | 설치 패키지 스크립트의 후보→직접 배치/연결→중심 생각→Retell→v2 저장·재조회 통과. 중급/PDF 회귀 통과 | 실제 Chrome 순서/부담 확인 대기 |
| AC-02 | 서버/클라이언트 ID·순서·해시·허용 키/개수·원문 매핑 검사 통과. 모델 입력에서 식별자/답안/URL 제외 확인 | 실제 후보 핵심성·맥락·지연 미검증 |
| AC-03 | 주장–근거 기본값, 명시 역할/연결, 제외·원문 추가·상한·중복/자기/미연결 검사 통과. 네이티브 버튼/select 사용 | 키보드·좁은 패널·밝기/다크 Chrome QA 대기 |
| AC-04 | API Origin/스위치/인증/회원/회차·공유 한도, 게이트 병렬/재시도·늦은 성공/실패, 설치본 구조화·로그아웃 취소 통과 | 원격 설정·실제 Google 세션 경합 미검증 |
| AC-05 | 미지원 입력/모드, 실패 재시도 상한, 수동 전환·노출 이력 보존, 기존 장애 복구 회귀 통과 | 실제 네트워크/기기 체감 대기 |
| AC-06 | 실제 로컬 PostgreSQL의 v1/v2 저장/명시 재조회·깊은 멱등/충돌·불변 최초 맥락·수정본·부모 삭제 통과 | 원격 DB 및 기존 설치본 교차 실행 대기. 빈 설명 편집은 구형 업데이트 필요 |
| AC-07 | 로컬 본인/타인/비활성·RLS/권한·NULL/빈 객체/길이 제약·anon 함수 권한 검사 통과 | 원격 권한·운영 설정 미검증 |
| AC-08 | Retell에서 읽기 영역 전체 가림·후보 getter 차단, 원문 재확인·복원 회귀, 최소 지원 맥락/인용·응답 형식 검사 통과 | Chrome 실제 가림 및 모델 의미 QA 대기 |
| AC-09 | 전체 283개/빌드·허용 목록·스위치·민감 패턴 검사 통과 | 별도 PM·사용자 수용 대기 |
| AC-10 | 선택 설명 기본 접힘/빈값 진행·초기/수정본 저장/재조회·유형 변경 보존·공백 정규화·프롬프트 검사 통과 | 실제 모델이 미작성 감점하지 않는지 사람 검증 대기 |

## 실제 실행 결과
- `node --test tests/*.test.*`: 283 통과, 실패 0, skip 0, 종료 0. 로그 `tmp/task024-final-regression.txt`(Git 제외). 기존 루프백 HTTP 검사 때문에 승인된 샌드박스 외 실행, Windows PowerShell 기본 PSModulePath를 해당 테스트 프로세스에만 지정했다. 실제 모델/DB 네트워크 호출은 모의 응답으로 대체했다.
- 핵심 새 검사: `tests/candidates.test.mjs`, `tests/learning-support.test.cjs`, `tests/extension-build.test.cjs`의 패키지 전체 초급 흐름/지연 취소/노출 후 수동 전환, `tests/records-db.test.mjs`의 v2 DB 검사, 지원 출처 피드백/저장 capability 검사.
- 로컬 PostgreSQL(PGlite): 기존 Git 제외 설치 재사용. CLI 2.116.0 버전·`migration new --help` 확인 후 `migration new learning_support --workdir tmp/task024-schema`로 생성한 파일을 server/migrations에 작성했다. 원격 연결·CLI 업그레이드 없음. DB/RLS 검증은 실제 로컬 SQL 실행이며 원격 환경의 증명이 아니다.
- `node scripts/build-extension.cjs --review-only --guided-review --label task024-guided-local-review-02`: 종료 0.
- 검토본: `dist/task024-guided-local-review-02/extension/`, `extension.zip`, ZIP SHA-256 `f26fd76809353c2334e10986e6a6551e5fea4d70dc6c240f4298d64c8f60c063`.
- 기준 `91288c2`, `sourceDirty:true`, `guidedReview:true`, `mode:review-only-network-disabled`. 신규 6개 런타임 모듈 포함. 호스트 권한 없음, CSP connect-src self. 실제 후보/원격 저장 검증용으로 표시하지 않는다.
- `git diff --check`: 종료 0. 스테이징 없음. 변경 파일/패키지에 환경파일·서명키·참가자 자료 경로 없음. 키 패턴 1건은 기존 빌드 검사에 있던 명시적 합성 sentinel(`tests/extension-build.test.cjs`)이며 실제 비밀값이 아니다. 실제 키 추가 없음.
- 실제 Chrome 설치/시각/키보드·실제 모델·원격 DB/Worker 검증은 실행하지 않았다. 기존 5인 QA 완료로 소급하지 않았다.

## 핵심 원칙·안전 점검
- AI 예외는 원문 문장 ID 선정만. 문장 생성/번역/요약/역할·관계 정답/실시간 판정/다른 AI 차단 완화 없음. 후보를 읽기 전에 임의 자동 호출하지 않는다.
- 실제 노출은 UI 관찰 이력이며 서버가 학습 과정의 독립 수행을 증명한 것으로 주장하지 않는다. 분할/ID 검사만으로 후보 품질/학습 효과를 보장하지 않는다.
- 시크릿·환경파일·참가자/실제 학습자 답안을 읽거나 로그/테스트/문서에 추가하지 않았다. 테스트와 검토 글은 합성 자료다.
- 최초 그래프/선택 발췌는 답안과 같은 부모 행에 저장되어 기존 보관/삭제 정책을 따른다. 미사용 후보는 ID/노출 사실만 저장한다. 별도 분석 원문 저장소 없음.
- PDF AI 미사용과 중급 직접 작성·제출 후 최신 피드백·브라우저 세션 정책 유지.

## 사용자 검증 요청 및 미해결 사항
- 설치/실행/항목별 확인은 [사용자 검증](TASK-024-사용자검증.md)을 따른다. **우선 네트워크 차단 검토본에서 초급/중급/PDF·역할/연결·선택 설명·Retell 가림·키보드/보기 확인을 요청한다.**
- 원격 검증에는 두 SQL의 순차 적용·제출/AI Worker 배포·설정 검증·승인된 소수 활성화 및 실제 합성 글 모델 호출이 필요하다. 요청서의 별도 승인 대상이며 이번에 수행하지 않았다.
- 구형 설치본은 새 빈 설명을 편집/저장하지 못할 수 있으므로 업데이트가 필요하다. 새 서버/DB가 없는 환경에서는 capability 안내로 저장을 차단하며 값을 자동 생성해 우회하지 않는다.
- 사람 후보 품질/피드백 의미 검사와 PM 수용이 끝나기 전에는 전체 완료·main 병합·운영 완료로 표시하지 않는다.

## Git 상태
- `feature/guided-reading` @ `91288c2` 위의 v5/v6 코드·테스트·문서 변경을 사용자 후속 명시 지시로 로컬 커밋한다. 최종 식별자와 커밋 후 Git 상태는 OS 임시 폴더의 최신 handoff 및 최종 사용자 보고 참조.
- main 병합·push 없음. root 계획 트리와 타 worktree 편집 없음. 원격 DB/Worker/스위치 변경 없음.

## PM 검토 (후속 PM 작성)
- 작성자 실제 diff·핵심 계약/상태·자동 실행 근거 자체 검토: 실시.
- 별도 PM/사용자의 Chrome 및 의미 QA 수용: 대기. 미검증 항목을 완료로 취급하지 않는다.

## v6 사용자 피드백 반영
- 후보 없이 직접 구성은 원문 목록을 즉시 열고 이전 화면 복귀 버튼을 제공한다. 직접 작성에서도 이전 그래프/후보로 복귀할 수 있다. 입력한 배치·연결·선택 서술과 노출 이력을 보존하며 AI 요청을 다시 열지 않는다.
- 초급 UI 기본 유형을 주장–근거로 변경했다. 중심 생각·Retell은 숨기지 않고 비활성 상태와 순서 안내를 제공하며 구조도 확인 후 활성화한다. 역할/연결 자동 생성 없음.
- v6 검증·검토본 근거는 아래에 추가한다. 위 v5 수치는 당시 통합 결과다.

- v6 관련 패키지/핵심 검사 34개 통과(실패/skip 0), 최종 복귀·기본값/단계 시나리오 2개 재실행 통과. 입력한 수동 유형을 바꿨다가 복귀해도 원래 그래프 유형과 배치/연결이 일치함을 확인했다.
- v6 검토본: `dist/task024-guided-local-review-03/extension/` 및 `extension.zip`, SHA-256 `578fcf85bc820571a54f86383f19d4fef736eff4959205a59b13f6d8085f84d4`. 빌드 종료 0, 네트워크 권한 없음.
- 실제 Chrome의 복귀 버튼·주장–근거 기본값·비활성 안내는 사용자 재확인 대기. 검증 당시 원격 적용/커밋/병합 없음. 후속 사용자 지시로 이번 로컬 커밋만 허용되었다.
