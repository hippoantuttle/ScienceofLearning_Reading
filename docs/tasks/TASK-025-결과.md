# [TASK-025] 작업 결과

## 결과 요약
- 상태: v3 AI 서버 배포·운영 설정 보존·원격 거절 검사 완료. 확장 교체 및 실제 모델/Chrome 수용 미완료.
- 요청서: `C:\Users\patri\ScienceofLearning_Reading\docs\tasks\TASK-025-AI-로그-활성화-사용성-검토.md` v4.
- 운영 로그 활성화 후 사용자 지시로 우선순위 1 전체를 수정했다. 안전한 기준 정렬·최초 제출 평가 안내도 반영했다. 300 회귀 통과 후 사용자 명시 승인으로 AI Worker만 배포했다. 커밋·병합·push 없음. 확장 화면 변경은 준비된 설치본으로 교체해야 반영된다.

## 변경 파일
- `server/ai/feedback.mjs`, `server/ai/pilot-worker.mjs` — 유효한 JSON 예시·공유 길이 제한·기준 이름 정렬, 공급자/응답/필드/인용 오류 분리, 안전한 구조화 로그와 요청 UUID.
- `feedback-panel.js`, `submission-flow.js`, `sidepanel.html` — 인증 대기 전 요청 잠금, 정상 토큰 회전과 인증 세대 변경 구분, 늦은 응답/오류 차단, 초기화 시 취소, 상황별 안내·접힌 문의 번호·이전 결과/편집 보존·최초 제출 평가 명시.
- `tests/feedback-panel.test.cjs`, `tests/feedback-prompt.test.mjs`, `tests/pilot-worker.test.mjs`, `tests/extension-build.test.cjs` — 재현 기반 회귀와 설치본 장애 후 직접 수정/저장 검증.
- `wrangler.pilot-ai.jsonc` — 후속 배포용 로그 설정 명시. 운영 적용은 코드 배포 없이 script-settings PATCH로 수행.
- `docs/tasks/TASK-025-AI-로그-활성화-사용성-검토.md` — 사용자 지시·범위·권한.
- `docs/tasks/TASK-025-사용성-검토.md` — 운영 증거·재현한 문제·개선안.
- `docs/tasks/TASK-025-결과.md`, `docs/변경이력.md` — 결과·결정 기록.

## 완료 기준별 검증
| 기준 ID | 결과 | 검증 근거 |
|---|---|---|
| AC-01 | 충족 | 운영 설정 GET으로 enabled/logs.enabled/persist/invocation_logs=true, 수집률 1, root redact_query_string=true 확인 |
| AC-02 | 충족, 조회 API 제한 별도 | 변경 전후 배포 이력·바인딩·비로그 script 설정 비교 일치, 합성 요청 401. 사용자가 제공한 저장 로그에서 해당 요청과 query 제거를 확인. 관리 OAuth의 저장 로그 조회 API 자체는 403 |
| AC-03 | 충족 | 사용성 검토 문서, 네트워크 없는 합성 재현 3건, 수정 순서와 수용 기준. 제품 변경과 운영 설정 변경을 분리 |
| AC-04 | 로컬 충족 / 운영 미검증 | HTTP·network·timeout·공백·JSON·출력 종료 사유·피드백 항목/인용 코드 분리. 응답 번호와 로그 번호 일치·허용 필드 외 로그 없음·합성 민감 문자열 누출 없음 확인. 기존 추천/후보 오류 계약은 유지 |
| AC-05 | 로컬 충족 / 모델 품질 미검증 | 전송 프롬프트 JSON 예시 실제 파싱·5개 판정/4개 기준/길이 제한 확인. 역순 기준은 재정렬, 중복/누락·없는 인용·따옴표뿐인 인용은 계속 거절. 내용 생성·정답·인용 재작성 없음 |
| AC-06 | 로컬 충족 / 실제 Chrome 미검증 | 지연 인증 두 클릭→1회, 같은 계정 토큰 회전→결과 표시, 만료 후 재로그인·계정/문서 전환/초기화 후 결과 차단. 이전 finally가 새 요청 잠금을 풀지 않는 회귀 통과 |
| AC-07 | 로컬 충족 | 401/403/429/timeout/공급자·형식 오류별 안내, 임의 오류 메시지/잘못된 UUID 비노출, 이전 결과·편집 유지, 자동 재호출 없음. 저장·재조회 후에만 피드백 상태를 만들며 최초 제출 평가임을 명시 |
| AC-08 | 로컬 충족 / 운영 수용 미완료 | 전체 300 통과/0 실패/0 skip, 서버 원본과 최종 묶음 dry-run, 확장 256개 파일 소스 일치·ZIP 해시 검증. 실제 모델 성공률/운영 로그 새 분류·Chrome 전체 흐름은 배포 후 확인 필요 |

## v2 실제 실행 결과와 산출물
- 작업 위치·브랜치: `C:\Users\patri\ScienceofLearning_Reading`, `feature/ai-observability-review`, 기준 `8ea8a05`의 미커밋 후보.
- 외부 fetch와 `.env.supabase-test` 읽기를 차단한 합성 검사. 전체 `node --require ./tmp/task025-deny-external.cjs --test tests/*.test.*`와 동등한 목록 실행: **300 통과 / 0 실패 / 0 skip**, 약 31.1초. `tmp/task025-regression-final.log`.
- 초기 제한 환경 검사는 로컬 통신/PowerShell 실행 제한과 옛 실패 문구 기대 때문에 실패했다. 승인된 로컬 검사로 환경 문제를 해소하고, 설치본 통합 검사의 문구 기대를 새 사용자 안내에 맞춰 수정했다. 뒤의 최종 300 통과만 수용 근거로 사용한다.
- 프롬프트/패널/Worker/Google 결속 관련 중간 검사 51 통과 뒤 client timeout 회귀를 추가했으며, 최종 전체 결과에 포함됐다.
- 원문·실제 답안·실제 모델 사용 없이 synthetic transport로 성공·실패·타이밍·늦은 결과를 검증했다. 공급자 응답 처리는 여전히 전체 필수 검증을 통과해야 반환된다. 출력 토큰 2,000 / 서버 50초 / 클라이언트 60초 제한은 유지했다.
- 확장 후보: `dist/task025-feedback-fix-01/extension/`, `extension.zip`. 기존 승인된 Google/초급/추천/피드백 공개 설정 재사용. 같은 확장 ID, 새로운 키/계정 정보 없음. 빌드의 256개 파일을 현재 소스에서 다시 조립한 파일과 해시 비교했고 ZIP 해시도 일치했다.
- ZIP SHA-256: `a0482a6c8bbdfbf2f0ef6e6b2176738f1e000b6690f901b16a8feb7c00e7d39d`. `sourceDirty:true`, `remoteVerified:false`, `chromeVerified:false`.
- AI Worker 후보: `build/task025-ai-fix-01/wrangler.ai.review.json`, main `bundle/pilot-worker.js`. 기존 운영 회차/기한/무제한/기능과 로그 활성 설정을 유지하는 검토본. 소스 dry-run과 최종 bundle dry-run 모두 종료 0. 묶음 SHA-256: `4a7a2f2e1df1a563f18443285fa7c60c246a13ca49b7ffaa469b501893ffc9d0`.
- dry-run에서 상대 출력 경로가 중첩 생성되어 번들/맵을 고정된 `bundle/` 경로에 복사하고 최종 config로 다시 검증했다. 재배포·재실행 자동화는 추가하지 않았다.
- `build/task025-ai-fix-01/review-manifest.json`에 Worker/확장/소스 해시와 승인 후 적용 조건을 보존했다. 산출물은 Git 제외이며 다른 worktree는 읽기만 했다.
- 배포 승인 시: 현재 운영 버전/설정 재확인 → 검토한 AI Worker만 `--keep-vars`로 배포 → Secret 이름·변수·버전·로그 설정 재확인 → 무인증/Origin 거절 검사 → 사용자 확장 교체 후 합성 글로 피드백 성공/새 오류 분류 확인. 제출 Worker·DB는 변경하지 않는다. 실제 모델 호출은 사용자의 동의한 요청으로 수행하며 임의 재호출하지 않는다.

## v1 실제 실행 결과 (로그 활성화 이력)
- 위치: `C:\Users\patri\ScienceofLearning_Reading`, `feature/ai-observability-review`.
- 2026-11-17 15:46 KST부터 저장 로그 활성화. 15:46:51에 최종 URL query 제거까지 설정 재확인했다.
- 처음 API 스키마 문서상 위치로 보낸 query 제거 값이 실제 서버에서 반영되지 않아, 반환값과 Wrangler 4.158.0의 스키마에 맞춰 observability 바로 아래로 수정했다. 재확인 전체 9조건 통과, 최종 스크립트 종료 0. 중간 결과도 로컬에 보존했다.
- AI Worker 버전 `f8d429ba-c4a8-46a5-9a29-5d1d4c2127d1` 유지. binding·회차·기간·기능·한도·키·다른 Worker 변경 없음.
- 요청·console 로그 100% 수집/저장, URL query 제거. traces는 false, 외부 Logpush는 false 유지.
- 합성 무인증 진단 요청 401, 모델 호출 없음. 사용자 export의 15:47:53.203 기록과 시각·상태·URL 경로 일치, 합성 query가 제거됨. 저장 로그 6항목/요청 4건, 피드백 실패 2건을 같은 요청 ID의 invocation/console 쌍으로 확인.
- 저장 로그의 피드백 오류는 5.508/7.628초 뒤 502/provider이며, 대응 시간대 DeepSeek subrequest는 HTTP 200/completed였다. 정확한 검사 탈락 항목은 계속 미확정이다.
- `node tmp/review-feedback-ux-20261117.cjs`: 종료 0, JSON 예시 오류·중복 요청·토큰 변경 시 결과 유실 재현. 기존 코드를 수정하는 테스트를 추가한 것은 아니다.
- Wrangler `deploy --dry-run --config wrangler.pilot-ai.jsonc --outdir tmp/task025-dry-run`: 종료 0, 설정/번들 검증. 실제 배포 아님. 기본 기능 비활성 설정을 운영 서버에 덮어쓰지 않았다.
- 제품 소스 변경이 없어 전체 회귀를 다시 실행하지 않았다. `git diff --check` 통과.
- 로컬 근거: `tmp/task025-logging-safe.json`, `tmp/task025-logging-initial-safe.json`, `tmp/task025-log-query-safe.json`, `tmp/task025-pasted-logs-safe.json`, `tmp/task025-provider-status-safe.json`, `tmp/task025-ux-reproductions-safe.json`. Git 제외.

## v3 승인된 AI 서버 배포 결과
- 사용자 「AI 서버 수정본을 배포해줘」 명시 지시로 실행했다. 대상은 `reading-ai-pilot` 하나다.
- 배포 전 현재 활성 버전이 기준 `f8d429ba-c4a8-46a5-9a29-5d1d4c2127d1` 100%임을 확인했고, 5개 제품 소스 해시와 검토 묶음 SHA-256 `4a7a2f2e1df1a563f18443285fa7c60c246a13ca49b7ffaa469b501893ffc9d0`의 일치를 확인했다. 실제 Secret 값은 읽지 않고 이름만 비교했다.
- 실제 배포: Wrangler 4.158.0, `deploy --config build/task025-ai-fix-01/wrangler.ai.review.json --no-bundle --keep-vars --message task025-feedback-reliability`, 종료 0. 검토한 번들을 재생성하지 않고 올렸다.
- 새 활성 버전: **`90cbe87a-7be7-45ce-ae89-3948a51359cb`**, 트래픽 **100%**. 주소: `https://reading-ai-pilot.patrick020308.workers.dev`.
- 배포 전후 비교 6개 항목 모두 일치: 평문 운영 변수, Secret 이름 집합, 기타 바인딩/AI budget namespace, observability 전체 설정, 외부 Logpush 설정, 제출 Worker 버전/설정.
- 5인 회차·11/25 기한·사용자/전체 무제한·기존 AI/추천/피드백/후보 스위치를 보존했다. 로그 수집률 100%·저장 활성·URL query 제거·traces false 유지. 제출 Worker는 `7e56bbbb-6146-421e-aa26-959df009f5cb` 100% 그대로다. DB·계정·키 값·권한 변경 없음.
- 원격 검사 **14개 모두 통과**: 네 AI 경로의 허용 Origin preflight 204, 무인증 401, 다른 Origin 403, 피드백 합성 무효 토큰 401 및 잘못된 본문 400. CORS와 no-store 확인. 모델 호출 0, 실제 학습자 자료 사용 0.
- 이미 수행한 로컬 300 회귀와 원격 배포 검증을 구분한다. 운영의 새 세부 오류 코드/실제 모델 성공률은 사용자가 피드백을 요청한 뒤 확인해야 한다. 이를 배포 검사만으로 완료 처리하지 않는다.
- 확장 설치본 `dist/task025-feedback-fix-01/extension/`은 준비된 상태로 유지했다. 브라우저 확장을 자동 교체하거나 재시작하지 않았다. 서버의 프롬프트·검증·오류 분류는 즉시 적용되지만 중복 클릭 방지/로그인 갱신 결과 표시/상세 안내 등 화면 수정은 설치본 교체 후 적용된다.
- 로컬 배포 근거: `tmp/task025-predeploy-safe.json`, `tmp/task025-deploy-ai.txt`, `tmp/task025-postdeploy-safe.json`, `tmp/task025-postdeploy-smoke-safe.json`. Git 제외. 원격 저장 로그 조회 권한 확대 없음.

## 핵심 원칙·안전 점검
- 읽기 중 AI 차단·초급 후보 예외·Retell 가림·제출 후 피드백 조건 유지. v2 제품 수정과 v3 AI 서버 배포는 위 범위에 한정했다.
- 원문·학습자 응답·생성 응답·키·인증값을 새로 console에 기록하지 않았다. 사용자 로그 원본은 첨부 위치에 두고 저장소에 복사하지 않았다. 로컬 요약은 필드 허용 목록으로 작성했다.
- Cloudflare 기본 invocation은 네트워크/헤더 메타데이터를 포함하며, 확인한 authorization은 가려져 있었다. 원본 로그의 외부 공유·공개 커밋은 피해야 한다.
- v1 로그 설정 변경에 이어 v3 사용자 승인으로 AI 제품 서버만 배포했다. 실제 모델 호출·제출 서버/DB 변경 없음.

## 미해결 문제와 필요한 결정
- 운영 서버는 새 분류 코드가 있는 v3 배포 버전이다. 실제 피드백 요청의 새 오류 분류/모델 성공률 확인은 남아 있다.
- 잘못된 JSON 예시·중복 요청·토큰 회전 결과 유실은 로컬 수정·검증을 완료했다. 과거 실제 실패의 특정 검사 항목 및 수정 후 모델 성공률은 아직 미확정이다.
- 인용 ID 방식·새 수정본 재평가·자동 재생성은 이번 구현에 포함하지 않는다. 후속 분류 결과에 근거해 별도 설계한다.
- 관리 OAuth의 저장 로그 조회 권한은 확대하지 않았다. 사용자 dashboard export로 수집 검증을 완료했다.

## Git 상태
- v4 사용자 승인: `feature/ai-observability-review`에서 이번 범위 로컬 커밋 후 검증된 상태를 main에 fast-forward한다. 실제 커밋 식별자·main 일치는 최종 Git 조회 및 OS 임시 handoff에서 확인한다. 원격 push 없음.
- 변경: 위 제품/검사/설정/문서. 기존 `.claude/` 미추적 상태는 유지하고 다른 worktree는 편집하지 않았다. 실제 비밀/키/참가자 자료를 스테이징하지 않았다.

## PM 검토
- 사용자 운영 배포 승인은 받아 실행했다. 사용자/PM의 결과 수용·확장 교체와 실제 모델 품질/Chrome 실사용 확인은 남아 있다. 미검증을 완료로 취급하지 않는다.
- v4 최종 로컬 점검: 소스/번들 해시가 300 회귀 및 실제 배포한 검토본과 일치하고 diff 서식 검사를 통과했다. 확인된 차단 결함은 없으므로 사용자 지시에 따라 로컬 main 반영 대상으로 판단한다. 실제 모델 품질·확장 교체 수용은 별개로 남긴다.
