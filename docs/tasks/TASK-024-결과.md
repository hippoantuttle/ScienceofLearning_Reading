# [TASK-024] 1차 개발 결과

## 결과 요약
- 상태: **부분 완료 — 개발 착수 및 1차 로컬 구현. TASK-024 전체 완료 아님.**
- 요청서: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading\docs\tasks\TASK-024-초급-문장후보-구조화.md` v4 / 2026-11-12 Asia/Seoul.
- 저장소·작업 경로: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading`, 브랜치 `feature/guided-reading`, 기준 `fcab476`.
- 최신 인계 `handoff-reading-support-modes-2026-11-12.md`와 AI 피드백 인계를 확인했다. 계획 브랜치의 AGENTS·요청서·인덱스·변경이력을 선별 통합하고 최신 피드백·TASK-022를 보존했다. 다른 worktree·root 문서는 편집하지 않았다.
- 공통 구조도의 추가 서술을 기본 접힌 `왜 이렇게 연결했나요? (선택)`으로 변경했다. 웹·PDF의 기존 순서를 유지하며 빈 설명으로 Retell·초기 제출·수정본 저장·기록 조회가 가능하도록 로컬 경로를 연결했다.
- 초급은 원문 분할/ID·해시, 엄격한 후보 계약, 빈 유형/역할/연결에서 시작하는 편집 로직, 요청/취소/노출 게이트를 구현했다. **이 세 모듈은 아직 제품 화면·Worker·설치 패키지에 연결하지 않았다.** 실제 후보 요청이나 초급 활성화는 발생하지 않는다.

## 변경 파일
- `sentence-source.js` — 원문 스냅샷을 변경하지 않는 `sentence-v1`, UTF-16 범위·순서 ID·SHA-256. 긴 본문 거절, 절단 없음.
- `reading-support-contract.js` — 요청/응답의 정확한 키·버전·ID·해시 검사, 원문 순서 정렬, 2–8개 카드/1–16개 직접 연결·방향·출처·발췌 검사, 기존 primary/support 문자열 매핑.
- `reading-support.js` — 초급 순수 편집 로직과 독립 요청 게이트. 역할·유형·연결 자동 생성 없음. 유형 변경 시 사용자 작업 보존. 명시 동의/단계/계정/모드/웹/스위치 검사, 오류 재시도 1회, 늦은 성공·실패 무효화, 표시 여부와 수신 여부 분리, Retell 후보 가림.
- `sidepanel.html`, `sidepanel.js`, `sidepanel.css`, `worksheet.js`, `pdf-worksheet.js` — 접힌 선택 설명과 원문 근거 안내·유형별 보조 질문, 필수 검사 제외, 유형 변경/접기 시 내용 보존, 새 양식 초기화 시 닫기, 정상 미작성 표시.
- `submission-contract.js`, `record-contract.js`, `server/submissions/worker.mjs` — relation 키/문자·길이 검사를 유지하고 비공백 필수 조건만 제거. 공백만 입력은 빈 문자열, 작성된 설명은 그대로 보존.
- `server/migrations/20261112040245_optional_relation.sql` — 최초/수정본 relation_text의 CHECK만 완화. NOT NULL·10,000자 상한·RLS·권한·기존 데이터 유지. **learning_support/v2 저장 migration은 아직 없음.**
- `records-panel.js`, `feedback-panel.js`, `server/ai/feedback.mjs` — 동일한 선택 항목 명칭·정상 미작성 표시, 공백을 미저장 수정으로 오인하지 않음, 빈 reference.relation을 누락·감점 이유로 삼지 않도록 프롬프트 명시. 중급 Retell 루브릭/응답·인용 검사·토큰 결속 유지.
- 새 검사 `tests/reading-support.test.cjs`, `tests/optional-relation.test.cjs`; 기존 worksheet/records DB·패널/feedback 패널·프롬프트 검사 확장.
- `AGENTS.md`, 요청서, 작업 인덱스, 변경이력 — 계획 통합·착수 권한/담당/실제 경로 갱신.

## 완료 기준별 검증
| 기준 ID | 충족 / 미충족 / 미검증 | 검증 근거 |
|---|---|---|
| AC-01 | 미충족 | 중급/PDF 공통 설명 선택화 자동 회귀 통과. 초급 제품 흐름 UI는 미구현. |
| AC-02 | 미충족 | 순수 후보 계약·원문 일치 검사 통과. Worker/모델 어댑터 미구현, 실제 후보 의미 품질 미검증. |
| AC-03 | 미충족 | 빈 유형/역할/연결, 원문 추가·제외·직접 배치/연결·상한·매핑 검사 통과. 클릭/키보드 제품 UI·좁은 패널 QA 미구현/미검증. |
| AC-04 | 미충족 | 순수 게이트의 명시 동의·실행 단계·병렬 요청·취소 후 늦은 성공/실패 검사 통과. 실제 계정/글 변경 훅과 Worker 인증·회차·공유 한도 연결은 남음. |
| AC-05 | 미충족 | 미지원 글/모드/스위치 거절, 오류 재시도 상한, 표시 전후 취소·노출 유지 검사 통과. 제품 실패/수동 전환 UI와 HTTP/시간 제한 어댑터는 남음. |
| AC-06 | 미충족 | v1 초기/수정본 빈 설명 저장·조회·멱등·삭제 및 기존 설명 보존을 로컬 PostgreSQL에서 확인. v2 learningSupport 저장/조회 미구현. 구형 편집 계약의 빈 설명 거절 확인(아래). |
| AC-07 | 미검증 | 공통 설명 변경에 대해 기존 로컬 DB RLS/본인·타인·비활성·삭제 회귀 통과. 새 초급 서버 경로/원격 환경은 미구현·미검증. |
| AC-08 | 미충족 | 기존 Retell 가림·피드백/로그인 회귀 및 순수 게이트의 Retell 후보 가림 통과. 초급 실제 DOM 가림/저장 출처 reference 연결·모델 의미 QA는 남음. |
| AC-09 | 미검증 | 자동 전체 회귀/검토 빌드 결과는 아래 실제 실행 결과. 초급 전체 설치 후보·실제 Chrome·별도 PM 수용은 미완료. |
| AC-10 | 미충족 | 공통 웹/PDF의 빈칸 진행, 초기/수정본 로컬 DB·기록/비교·기존 설명 보존·구형 계약 검사 통과. 초급 UI·실제 Chrome·빈 reference 의미 QA는 남음. |

## 실제 실행 결과
- 실행 위치: 위 개발 worktree.
- Supabase 스킬 및 Postgres 스킬을 읽고 공식 [변경이력](https://supabase.com/changelog.md), [로컬 마이그레이션 안내](https://supabase.com/docs/guides/deployment/managing-environments), [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/ddl-alter.html)을 확인했다. 설치 CLI `2.116.0`의 `migration new --help` 확인 후 로컬 임시 디렉터리에 `migration new optional_relation`으로 생성한 파일을 server/migrations에 배치했다. CLI 업그레이드·원격 DB 연결 없음.
- 로컬 PostgreSQL 검사: 기존 root의 Git 제외 `tmp/task015/node_modules/@electric-sql/pglite`를 작업 트리의 동일 임시 경로로 복사해 재사용. 네트워크 설치 없음. 마이그레이션 전 빈 설명 저장 실패 → 마이그레이션 후 초기/수정본 빈값·ASCII/한글 공백 정규화·재조회·동일 재시도·과거 내용 보존·NOT NULL/길이 제한·필수 다른 답안·타인 차단·부모 삭제 확인. 기존 TASK-015 DB 전체 검사도 통과.
- 브라우저 전역 모듈 로딩: 세 신규 모듈을 require/module 없는 VM에 순서대로 로드하여 빈 편집기 생성 확인(실제 Chrome 검증과 구분).
- 구형 호환: `git show fcab476:record-contract.js`를 별도 VM에서 검사. 기존 비공백 설명은 수용하고 새 빈 설명의 수정본 입력은 거절함을 확인했다. 기존 기록 표시 경로는 값을 직접 렌더링하므로 자동 문구를 넣어 우회하지 않았다. **빈 설명을 수정/저장하려는 구형 설치본은 업데이트가 필요하다.**
- 1차 전체 검사: 샌드박스 루프백 연결/PowerShell 실행 차단으로 실패 5개. 승인된 재실행에서는 루프백 검사 통과, 기존 Windows PowerShell 검사 1개는 PowerShell 7 모듈 경로 상속으로 실패. 테스트 프로세스의 PSModulePath만 Windows PowerShell 기본 경로로 지정한 단독 검사 통과. 시스템 설정·제품/기존 검사 코드를 바꾸지 않았다.
- 최종 전체 검사: `node --test tests/*.test.*` (테스트 프로세스에 Windows PowerShell 기본 PSModulePath 적용). **총 272개 통과 / 실패 0 / skip 0, 종료 코드 0**. 소요 약 26.8초.
- 검토 빌드: `node scripts/build-extension.cjs --review-only --label task024-shared-explanation-review-01` 종료 0. `dist/task024-shared-explanation-review-01/extension.zip`, SHA-256 `7862047f9f9afb924cd7a8cd950aca864714cfa388ef9f9b997a04256a56b010`.
- 빌드 mode `review-only-network-disabled`, 기준 `fcab476`, `sourceDirty:true`. 공통 선택 설명의 검토용이다. 신규 초급 모듈은 아직 runtime 허용 목록/HTML에 연결하지 않아 패키지에 포함되지 않는다. 이 ZIP으로 초급 전체 흐름·실제 원격 저장을 검증했다고 보지 않는다.
- 실제 모델 호출/기사 전송·원격 DB/Worker 적용·Chrome 사람 QA·의미 품질 검사는 실행하지 않았다. 기존 5인 QA도 완료 처리하지 않았다.
- 상세 자동 로그는 Git 제외 `tmp/task024-regression*.txt`; 테스트는 자체 합성 자료만 사용한다.

## 핵심 원칙·안전 점검
- 읽기 중 AI 개입: 기존 읽기 전 게이트를 변경하지 않았다. 초급 신규 코드는 순수 로직이며 제품에 연결하지 않아 신규 AI 전송·구조 추천·답안 생성 없음. 실제 후보 기능 연결 때 전체 단계/계정/글 변경과 지연 응답 회귀를 다시 해야 한다.
- 시크릿·개인정보: 실제 환경파일/키/학습자 응답/참가자 자료를 읽거나 추가하지 않았다. 새 테스트/문서는 합성 자료. 최종 Git/패키지 점검은 아래 최종 검증 기록 참조.
- 기존 기능: 최신 Retell 피드백 출력 형식·인용 검사·점수/수정 예시 금지 및 TASK-022 응답 시점 토큰 검사를 유지했다. PDF AI 미사용 유지.

## 미해결 문제와 다음 구현
1. 전용 `/reading-candidates`와 서버 스위치 false 기본값, 모델 ID 전용 프롬프트/어댑터, 인증·회차·공유 예산·본문 크기/시간 제한을 연결한다.
2. 모드 선택/동의·본문 미리보기, 초급 카드 배치/연결과 수동 전환, 구조화→중심 아이디어, 실제 계정/글/훈련 종료 dispose·Retell 가림을 제품 화면에 연결한다. 현재 게이트는 UI 동의·계정 변경을 대신 입증하지 않는다.
3. v2 learningSupport·노출·최초 그래프/출처 저장, nullable JSONB/호환 API·멱등 비교, 기록 표시/삭제·피드백 reference, 공개 스위치/빌드/환경 준비 스크립트를 통합한다. 지원 맥락을 잃는 v1 폴백은 하지 않는다.
4. 실제 Chrome 접근성/밝기/좁은 패널/가림 QA, 승인된 모델 의미 품질·빈 설명 비감점 검증, 독립 PM 수용을 수행한다. 문장 분할의 언어적 타당성/후보 핵심성은 ID 검사로 보장되지 않는다.
5. 원격 운영 전 공통 선택 설명 migration과 제출 서버 준비가 필요하다. 현 원격 DB에 이 로컬 UI만 연결하면 빈 설명 저장이 실패할 수 있다. 원격 적용·기능 활성화·실제 자료 사용은 별도 승인 대상이다.

## Git 상태
- 작업 경로·브랜치: 위 `guided-reading` worktree / `feature/guided-reading`.
- 사용자 후속 명시 지시로 이번 1차 구현·검사·문서를 로컬 커밋한다. 커밋 식별자와 커밋 후 상태는 사용자 최종 보고의 Git 그래프 참조.
- main 병합·원격 push 없음. 원격 DB/Worker·기능 활성화 변경 없음.
- 이 결과서 및 위 파일의 구현/통합 문서·검사를 같은 커밋으로 보존한다. root 계획 트리와 다른 기존 worktree 보존.

## PM 검토 (후속 PM 작성)
- 작성자의 실제 diff·자동 실행 근거 확인: 실시. 별도 PM의 독립 수용 검토: 미실시.
- 수용 여부: **TASK-024 전체 수용 미완료**. 위 1차 범위와 미구현을 구분해 후속 검토할 것.
- 남은 위험: 초급 실제 UI/API/저장 미연결, 언어 경계/후보 의미 품질 미검증, 원격 DB·설치본 버전 조합, Chrome/사람 QA.

## 최종 검증 기록
- 전체 회귀: 272/272 통과, 실패 0, skip 0, 종료 0 (`tmp/task024-regression-final.txt`).
- `git diff --check` 종료 0. 커밋 전 1차 검사 당시 변경/신규 27개 파일, 스테이징 0개. 변경 파일 및 검토 패키지에서 환경파일·서명키·참가자 자료 경로 없음, 주요 실제 비밀키 패턴 발견 0개(값을 출력하지 않는 검사).
- root는 원래 `feature/guided-reading-plan` @ `23e7a0f`, 기존 `.claude/` untracked만 유지. root 추적 파일·타 worktree 편집 없음.
- handoff 스킬에 따라 최신 개발 인계는 이 세션의 OS 임시 폴더에 별도 작성하며 Git에 포함하지 않는다.
