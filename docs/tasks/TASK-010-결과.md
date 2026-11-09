# [TASK-010] 작업 결과

## 결과 요약
- 상태: 부분 완료 / Chrome 로컬 모의 표시는 사용자 보고로 확인. 고정 가상 예문 실호출에서 사용자가 사용량 수신을 보고했고 PM이 비활성 복귀를 확인했다. 추천 내용 품질·실제 AI의 확장 연동은 미검증. 요청서 `docs/tasks/TASK-010-AI-읽기전-추천.md` 변경 이력 v13.
- 응답 형식 검증, 읽기 시작 후 지연 응답 폐기, 로컬 모의 서버 연결 및 테스트를 구현했다.
- 사용자 승인한 `http://127.0.0.1:8787/*` host 권한만 추가. 로컬 모의 HTTP는 빈 JSON만 전송하고 토큰은 패널 메모리에서 사용하며 입력 필드에서 즉시 지운다. 실제 기사·학습자 응답은 전송하지 않았다. 고정 가상 예문의 실제 호출 사용량은 아래 사용자 보고 참조.

## 변경 파일 및 이전 검증 이력
- 아래 배포 여부·테스트 수 등은 각 항목 시점의 이력이다. 현재 재배포 결과는 '실제 실행 결과'의 2026-11-09 항목을 따른다.
- 2026-11-09 사용자·PM 요청 반영: 로컬 `server/ai/worker.mjs`의 진입점과 Durable Object 양쪽 최대 미래 허용 범위를 15분, 기존 `calls` 누적 상한을 3회로 조정. 저장소 초기화 없음. 실패·timeout에도 예약 유지, 만료 시각 변경으로 사용 횟수 초기화하지 않음. `node --test`: 41개 통과·0개 실패(마지막 경계 테스트 추가 전). 추가 경계 검사 3개 통과. Wrangler 로컬 모의 제공자 8개 동시 요청: 200 3개, 429 5개. 실제 배포/활성화/실호출 하지 않았고 실제 재배포 후 보존은 미검증. 비용 상한은 여전히 미증명.
- 이전 로컬 변경(위 15분·3회로 대체): `Budget`은 기존 공유 Durable Object의 `calls`를 영속적으로 1회 한도로 사용하고, 내부 예약 직전까지 13자리 UTC epoch 밀리초 만료시각(현재 기준 미래 최대 5분)을 확인한다. 실패·timeout도 예약을 환불하지 않는다. namespace 삭제·재생성, 새 Worker/계정, 저장소 복구 등으로 범위를 우회할 수 있으며 기존 예약은 보존한다. 기존 배포에는 아직 반영되지 않음.
- `scripts/request-experiment-once.ps1`: PowerShell 숨김 입력·단일 POST·모의 결과/usage 표시 및 수동 false 복귀 안내. 가상 로컬 서버에서 PTY 가상 토큰으로 한 번 실행, 별표 마스킹·모의 결과 표시·종료 0 확인. 파이프 입력은 시간 초과했고 대화형 터미널이 필요하다. 네트워크 실패·timeout 상황의 실제 UI 사용은 미검증. 자동 false 복귀 없음.
- 로컬 통합: Wrangler 4.157.0, 모의 제공자·가상 Secret, 동시 8회에서 200 1개·429 7개, 동일 저장소로 프로세스 재시작 뒤 429 확인. 실제 Cloudflare 재배포 후 상태 보존은 미검증. Node 모의 테스트에서 제공자 실패·timeout 이후 재시도 429 확인. 전체 `node --test` 최신 39개 통과·0개 실패. `wrangler deploy --dry-run` 성공, 실배포 없음.
- 첫 실호출 도구 준비 중: `scripts/experiment-runner.cjs`는 주입된 모의 on/request/off/상태확인으로만 동작하는 제어 로직이다. `node --test tests/experiment-runner.test.cjs` 4개 통과·0개 실패: 성공·실패·timeout 후 off/상태조회 호출과 복귀 미확인 시 실패 처리. **실제 Cloudflare 설정 어댑터·CLI·숨김 입력·비공개 응답 전달은 미연결이므로 실사용 도구나 실제 비활성 복귀 검증이 아니다.** 프로세스 강제 종료·네트워크 장애 시 finally만으로 원격 복귀를 보장할 수 없다.
- 사용자 키 등록 보고 후 `wrangler secret list`와 실제 활성 배포 버전 조회로 ACCESS_TOKEN·DEEPSEEK_API_KEY 이름 및 `EXPERIMENT_ENABLED=false`를 확인(Secret 값·유효성은 미확인). 실호출·스위치 변경 없음.
- `scripts/check-inactive-worker.ps1`: 사용자 직접 입력용 비활성 인증 점검 준비. 입력은 PowerShell 보안 입력으로 숨기고 HTTP 상태만 표시하도록 작성. 파서 구문 검사만 통과했으며 실제 토큰으로 실행하지 않았고, 운영 환경 정책에 의한 기록 여부는 별도 확인 필요.
- `wrangler.jsonc`: Worker 이름 후보 `reading-prereading-experiment`, SQLite Durable Object 바인딩/마이그레이션 및 기본값 `EXPERIMENT_ENABLED=false` 명시. 기본 Worker는 switch가 정확히 true이고 API 키가 있을 때만 예약 및 제공자 호출을 시도한다. 공개 배포 및 실제 도메인 확인 결과는 아래 실제 실행 결과 참조. US$1 한도 미증명으로 승인된 안전 조건 충족 전 활성화 금지.
- `server/ai/worker.mjs`: 실험 switch와 필수 키 확인 후 예약→고정 요청→응답 형식·64KiB 크기·usage 검증을 연결. 기본값은 비활성으로 예약하지 않는다. 인증 응답은 no-store, 학습자 패널에 연결되지 않음. 모의 테스트만 수행.
- `server/ai/prompts/pre-reading-v1.mjs`: 서버 관리 버전 프롬프트를 모듈로 분리해 system 메시지에 사용. `.md` 대신 Workers와 Node가 직접 같은 텍스트를 가져오는 `.mjs`이며 전송 데이터는 여전히 고정 가상 예문만이다.
- 서버·패널 응답 검증기는 현재 별도 구현이며 6개 가상 경계 사례에서 결과 일치 확인(완전한 동등성 증명 아님). 종전 요청 본문 무시 동작은 2026-11-05에 변경: 비어 있지 않은 객체, 배열, null, 잘못된 JSON은 예약 전에 400, 1024바이트 초과는 413으로 거부. 현재 승인된 고정 예문만 사용한다.
- 형식상 정상인 본문 내용 누출 예시가 검증을 통과하는 것을 확인했다. 내용 누출 차단이나 모델의 지시 준수는 미검증이며 실제 사용 승인 근거가 되지 않는다.
- `server/ai/worker.mjs`, `tests/worker.test.mjs`: `callProvider`의 고정 가상 예문·모델 설정·응답 형식 검사를 모의 fetch로 검사. Worker 실험 입구에 연결했으나 기본 비활성·실제 호출은 없다. 단가·입력 토큰 상한과 비용 예약의 연계, timeout·로그 실환경 검증 필요. 형식 검사는 답안 누출을 방지하지 못한다.
- `.gitignore`: `.wrangler/`, `.dev.vars`, `.dev.vars.*` 제외. `.wrangler/cache/cf.json`의 JSON 최상위 키만 확인(Cloudflare 요청 메타데이터 형태); 값과 시크릿 존재 여부는 확인하지 않았고 파일을 삭제하지 않았다. `git ls-files .wrangler` 출력 없음, `git check-ignore` 제외 확인. ignore만으로 보안 보장 불가.
- `server/ai/worker.mjs`, `tests/worker.test.mjs`: 인증 후 단일 `experiment` Durable Object에 호출 예약 요청을 연결하고, 제한 상태면 429·저장 실패면 503을 반환. 횟수와 회당 임시 10만 마이크로달러를 한 트랜잭션으로 예약하나 이 금액은 모델·입출력 상한과 아직 연결·검증되지 않았다. 기본 비활성 상태에서는 예약하지 않으며, 실험 활성 상태에서는 예약 후 공급자를 호출한다. 동시 횟수 제한은 Wrangler 로컬에서 모의 제공자로 확인했으나 실제 비용 상한·배포 환경은 미검증.
- `ai-client.js`: 응답 키·개수·길이·타입/태그 검사와 읽기 시작 후 요청·지연 응답 차단.
- `manifest.json`: 승인된 루프백 포트 host 권한만 추가.
- `sidepanel.html`, `sidepanel.js`: 패널 내 일시 토큰 입력과 로컬 모의 서버 연결. 실제 AI가 아님을 표시.
- `server/ai/relay.cjs`: 로컬 loopback 모의 응답 서버. 토큰 인증·요청 크기·빈도 제한, 본문이 비어 있지 않으면 거부. 실제 공급자 연결 없음.
- `tests/ai-contract.test.cjs`, `tests/worksheet.test.cjs`: 계약·모의 서버·기존 UI 모의 테스트.
- `.env.example`: 값 없는 로컬 테스트 토큰 이름만 추가.
- `README.md`, `docs/tasks/TASK-009-결과.md`, `docs/tasks/TASK-010-결과.md`: 현 상태·사용자 보고·결과.

## 완료 기준별 검증
| 기준 ID | 충족 / 미충족 / 미검증 | 검증 근거 |
|---|---|---|
| AC-01 | 부분 검증 | 고정 가상 예문 1회 실호출의 사용량은 사용자 보고로 수신. 추천 전문·품질과 승인된 실제 원문 및 확장의 실제 AI 연동은 미검증. |
| AC-02 | 부분 검증 | Node에서 읽기 시작 후 지연 성공/실패 폐기 및 재요청 거부 확인. 네트워크 timeout·Chrome UI 실검증 미실시. |
| AC-03 | 미검증 | 실제 추천과 승인 원문 없음. 구조 검증은 답안·의미적 유출 차단을 보장하지 않음. |
| AC-04 | 부분 검증 | 키 이름만 예제에 추가, 확장에 키 없음. 모의 서버는 인증 및 빈 요청만 허용하나 운영 인증·전송 동의·제공자 정책은 미확정. |

## 실제 실행 결과
- 2026-11-09 사용자 보고: 추가 고정 가상 예문 호출에서 한글 JSON과 사용량 입력 257·출력 129·합계 386을 수신. PM은 false 복귀 확인을 보고하고, 용어·구조 형식은 수용 가능하나 배경은 본문 재진술·근거 없는 일반화의 위험이 있어 품질 미통과로 판단했다. 응답 전문은 공개 문서에 복제하지 않는다. 개발자는 실제 호출이나 Cloudflare 복귀를 직접 관찰하지 않았다.
- 로컬 `pre-reading-v2.mjs`는 배경의 본문 재진술·근거 없는 일반화를 금지하고 불필요 시 빈 배열을 허용한다. v1은 보존하고 Worker의 로컬 import만 v2로 변경. 테스트는 실제 요청 조립의 v2 지시문과 빈 배열 수용을 검증하며 가상의 재진술·일반화가 구조 검사를 통과함도 확인한다. 즉 내용 차단이나 모델 준수는 입증하지 못함. 테스트 선행 시 v2 모듈 미존재로 실패, 구현 후 전체 `node --test` 43개 통과·0개 실패, Worker 및 v2 문법 검사 종료 0. 추가 실호출·배포·초기화 없음: 운영 Worker에는 v2 미반영.
- 확장 연결 검토: 현재 `ai-client.js`는 `127.0.0.1:8787`에 빈 객체와 일시 테스트 토큰만 보내고 mock 응답만 수용한다. `manifest.json` 권한도 해당 루프백만 허용한다. 현 Worker 역시 고정 예문을 사용하고 빈 객체 외 입력은 거부하므로 실제 기사 맞춤 추천은 불가. 실제 기사·학습자 답안 전송 및 공개 Worker host 권한은 승인되지 않았으며 추가 전송 범위·고지·동의, 인증 방식과 키 보호, 제공자 보관·학습·처리 위치, 호출 비용·한도, 읽기 시작 후 요청 차단·지연 폐기 및 의미적 안전성 검증을 PM·사용자와 확정해야 한다. 기존 임시 ACCESS_TOKEN을 확장에 내장하지 않는다. 구조화 중 AI 개입 금지·Retell에서만 가림을 유지한다.
- 2026-11-09 한글 깨짐 점검: 사용자가 보고한 실제 출력은 인코딩이 깨져 내용 품질 판정 불가. 실제 응답의 원본 바이트는 확보하지 않아 모델 응답 자체는 확정 불가. `scripts/request-experiment-once.ps1`은 `RawContentStream` 원본 바이트를 엄격 UTF-8로 디코딩한 뒤 JSON 변환하도록 수정했다. `tests/request-experiment-encoding.test.cjs`는 charset 없는 로컬 UTF-8 응답과 가상 토큰으로 실제 Windows PowerShell 5.1.26100.9711 스크립트를 호출한다. 수정 전 한글 보존 단언 실패, 수정 후 1개 통과. 표준 출력 인코딩을 테스트에서 UTF-8로 지정하고 숨김 입력을 모의했으므로 사용자의 실제 CMD 화면·실토큰 입력을 검증한 것은 아니다. 전체 `node --test` 43개 통과·0개 실패. 서버 charset 명시는 후속 보완으로 남기며 Worker 수정·재배포·추가 DeepSeek 호출 없음.
- 2026-11-09 사용자 보고: 승인된 고정 가상 예문 첫 실호출 후 `prompt_tokens=257`, `completion_tokens=122`, `total_tokens=379`가 표시됐다. 개발자는 호출·추천 JSON을 직접 보지 못했으며, 사용량만으로 추천 내용이나 품질을 판정할 수 없다. PM은 이후 실제 Cloudflare 설정에서 `EXPERIMENT_ENABLED=false` 복귀를 직접 확인했다고 보고했다. 청구 금액, 응답의 내용 검토 및 확장 화면에서의 실 AI 연동은 미검증. TASK-010은 부분 완료이며 TASK-011은 착수하지 않았다.
- 2026-11-09 사용자 보고: 새 토큰으로 비활성 인증 점검 결과 HTTP 503 확인. PM은 토큰 갱신이 최신 배포에 적용되고 두 Secret 이름 및 `EXPERIMENT_ENABLED=false`가 유지됐다고 별도 조회해 보고했다. 개발자가 토큰·요청을 직접 보지는 않았으며, 이는 실제 DeepSeek 호출 성공을 뜻하지 않는다. 승인된 고정 가상 예문 첫 실호출 1회 안내 단계에 진입했고 실제 응답·사용량·실행 후 비활성 복귀는 결과 수신 전으로 미검증이다. 실패·timeout 시 자동 재시도 없이 중단한다.
- 2026-11-09 사용자 보고: 새 ACCESS_TOKEN을 입력했지만 401이 나왔다. 개발자가 요청·입력값을 직접 보지 않아 사용된 정확한 버전과 불일치 원인은 미확인이다. PM은 현재 배포의 `false`와 두 Secret 이름을 조회했다고 보고했다. 코드상 인증 거절은 예약 및 제공자 호출 전에 발생한다. 사용자 동의는 고정 가상 예문의 제공자 데이터 처리 조건 미확인 상태에서 첫 실험에 한정하며, 인증 해결 전 활성화·실호출은 보류한다.
- 2026-11-09 사용자 승인에 따라 Wrangler 4.157.0으로 체크포인트 `153d98c`의 변경본을 같은 Worker에 비활성 배포했다. 사전 dry-run 종료 0; `node --test` 첫 실행은 `stdin is not a tty` 종료 1, 재실행은 42개 통과·0개 실패. 실제 배포 version `7e68c9b9-88ca-44cc-ae0f-c45e94c1fa4f`에 100% 트래픽, 버전 조회에서 `EXPERIMENT_ENABLED=false`, `BUDGET (Budget)` 및 두 Secret 이름 확인. 미인증 POST `{}`는 HTTP 401. Secret 값·유효성, namespace ID 및 기존 누적 횟수의 재배포 전후 동일성은 직접 확인하지 않았다. 실제 AI 호출·활성화·저장소 초기화는 하지 않았다.
- `node --test tests/ai-contract.test.cjs tests/worksheet.test.cjs tests/retell.test.cjs tests/runtime.test.cjs`: 11개 통과, 0개 실패, 종료 0.
- 이전 계약 테스트에서 인증 없음 401, 본문 포함 400, 잘못된 JSON 400, 1024바이트 초과 413, 인증된 빈 요청에 모의 응답 200을 localhost 실제 HTTP로 확인. 외부 네트워크·실제 기사 미사용. 동시성·장시간 실행은 미검증.
- 지연 실패 폐기 테스트는 수정 전 실패, 수정 후 통과. 기존 워크시트 검사는 모의 DOM 사용.
- 이전 재실행 `node --test tests/ai-contract.test.cjs tests/worksheet.test.cjs tests/retell.test.cjs tests/runtime.test.cjs`: 13개 통과, 0개 실패, 종료 0. 이 중 인증된 10회 요청은 200, 11번째는 429; 미완성 요청이 약 5초간 멈추면 연결이 종료됨을 실제 loopback HTTP로 확인. 이는 비활성 timeout이지 요청 전체 지속시간 제한을 증명하지 않음.
- 2026-11-05 사용자 보고: 인증 요청에 HTTP 503 확인. 개발자가 토큰이나 요청을 직접 보지 않았으며 503만으로 실제 AI 연결을 입증하지 않는다. Wrangler 배포 조회에서 사용자 대시보드 변경 후 version `17ad76a3-3fa2-4ba4-b2ac-2bb2381672a9`가 100%, 해당 버전 바인딩 `ACCESS_TOKEN`은 secret_text, `EXPERIMENT_ENABLED=false` 확인. `wrangler secret list`에도 ACCESS_TOKEN 이름만 확인. 값은 열람하지 않음.
- 2026-11-05 사용자 승인에 따라 비활성 `reading-prereading-experiment`를 Cloudflare에 배포. 대상은 Wrangler가 보고한 단일 계정, 배포 전 deployments 조회는 해당 Worker 없음(10007). 실제 URL `https://reading-prereading-experiment.patrick020308.workers.dev`; version `2eb5baf6-f7a7-40a8-89a2-74989c80bd82`. 배포 조회에서 이 버전 100%, 버전 설정 조회에서 `EXPERIMENT_ENABLED=false`와 BUDGET 바인딩 확인. 실제 URL `/recommend`에 미인증 POST `{}`: HTTP 401 (종료 0). 당시 실제 인증된 503은 Secret 미등록으로 미검증. 당시 DeepSeek 호출·Secret 등록·활성화 없음.
- 비활성 배포 준비 점검: `wrangler whoami` 결과 인증되지 않음(종료 0; 로그인 필요). 실제 대상 계정·동명 Worker·workers.dev 주소는 미확인. `wrangler dev --local`에서 가상 Secret과 false 설정을 사용해 미인증 401, 인증된 빈 요청 503 확인. 관련 Node 모의 테스트 3개 통과, 예약·제공자 호출 미발생을 검증. 배포는 사용자 승인 전 미실행.
- 최신 `node --test` 31개 통과·0개 실패. Wrangler 4.157.0 로컬 실험 경로에서 가짜 키·모의 제공자로 12개 동시 요청: 200 10개, 429 2개, 성공 10개 모두 가상 usage 검증. 서버 종료; 실제 DeepSeek 미호출. `deploy --dry-run` 성공·실배포 없음.
- 배포 설정 추가 후 `node --test` 28개 통과·0개 실패, `node --check server/ai/worker.mjs` 성공. Wrangler 4.157.0 `deploy --dry-run --config wrangler.jsonc --outdir <임시경로>` 종료 0, BUDGET 및 false 변수 바인딩 표시. dry-run은 공개 배포·실제 인증·호출 성공이 아니다.
- 2026-11-05: `node --test` 27개 통과·0개 실패 및 `node --check server/ai/worker.mjs` 통과. 기사·Retell·임의 필드·빈 이름 필드·배열·null·잘못된 JSON·크기 초과를 테스트 전용 경로에서 예약/모의 호출 전 거부함을 확인. 변경 전 기사 요청 및 빈 이름 필드는 각각 회귀 테스트 실패. Worker 실제 런타임에서 새 검증은 미확인.
- 프롬프트 분리 후 `node --test`: 27개 통과·0개 실패, 종료 0. 추가 빈 응답 검증 후 `node --test tests/worker.test.mjs`: 12개 통과·0개 실패. `node --check` 대상 worker 및 prompt 각각 종료 0. 모의 응답으로 검증한 결과이고 실제 모델 출력 검증은 아님.
- 테스트 전용 주입 경로 `createTestWorker`는 예산 예약 → 모의 제공자 → 계약 검증을 실행한다. 실제 기본 Worker는 계속 503 차단. Node에서 제공자 실패 후 재시도 각각 예약, 10초 abort를 모의 시험했다. Wrangler 4.157.0 로컬의 가상 바인딩·모의 제공자로 15개 동시 요청 시 200 10개(검증된 응답 10개), 429 5개. 실제 제공자·배포 환경 아님. `node --test`: 24개 통과·0개 실패.
- 비용 근거 미확보: DeepSeek 공식 [가격](https://api-docs.deepseek.com/quick_start/pricing/)은 deepseek-flash 입력 캐시 미적중 피크 $0.30/100만 토큰, 출력 $1.20/100만 토큰이며 최대 출력 512 설정. [토큰 문서](https://api-docs.deepseek.com/quick_start/token_usage)는 오프라인 토크나이저를 안내하나, 서버 대화 템플릿·특수 토큰 및 과금 처리의 고정 요청에 대한 보장된 상한을 아직 확인하지 못했다. 문자열 길이와 반환 후 usage는 사전 상한의 근거가 아니다. 따라서 1회 $0.10 예약이 실제 상한을 덮는지 검증하지 못했고 실호출 차단 유지. 출력 상한·피크 단가, 고정 입력의 과금 포함 상한 및 가격 변경 시 차단이 모두 예약과 연결되어야 한다.
- 최신 `node --test`: 21개 통과·0개 실패, 종료 0. 신규 제공자 함수는 모의 fetch에서 고정 요청 및 잘린 응답·초과 필드 거부만 시험. `node --check server/ai/worker.mjs` 종료 0.
- Wrangler 4.157.0을 임시 폴더에 설치해 `wrangler dev --local`을 127.0.0.1에서 실행. 가상 인증으로 동시 15회 요청한 결과 503 10개·429 5개(종료 0), 서버 종료. 이 503은 호출 예약 후 실제 제공자 호출을 막은 상태이며 동시 횟수 제한에 대한 로컬 증거일 뿐, 실제 비용 상한·실제 API·배포 환경을 검증한 것은 아님.
- 예산 연결·예약 변경 후 `node --test tests/worker.test.mjs`: 4개 통과·0개 실패; `node --check server/ai/worker.mjs`: 종료 0. 앞선 `npx --no-install wrangler --version`은 30초 timeout(종료 124), 임시 폴더 설치 후 별도 실행은 정상.
- 초기 Workers 테스트 포함 `node --test tests/worker.test.mjs tests/ai-contract.test.cjs tests/worksheet.test.cjs tests/retell.test.cjs tests/runtime.test.cjs`: 17개 통과·0개 실패, 종료 0. `node --check server/ai/worker.mjs`: 종료 0. Worker 테스트는 Node 모의 환경이며 실제 중계·동시성·비용 상한을 증명하지 않음.
- 최신 `node --test tests/ai-contract.test.cjs tests/worksheet.test.cjs tests/retell.test.cjs tests/runtime.test.cjs`: 15개 통과, 0개 실패. Node 클라이언트에서 127.0.0.1:8787 실제 모의 서버로 빈 요청 및 가상 테스트 토큰을 보내 고정 모의 응답 수신도 성공(종료 0). 브라우저 확장 연결을 입증하지 않음.
- 클라이언트 timeout·인증 오류는 모의 fetch 테스트에서 확인, 실제 Chrome의 오류·읽기 시작 후 늦은 응답 표시는 미검증.
- `node --check ai-client.js`, `node --check sidepanel.js`, `node --check server/ai/relay.cjs`: 종료 0.
- 사용자 그룹 대화 보고: 실제 Chrome 확장에서 로컬 모의 서버의 예시가 표시됨. 사용자 보고이며 개발자 직접 관찰은 아님. 인증 실패·timeout·읽기 후 차단·지연 응답 UI의 실제 Chrome 검증은 여전히 미실시. 사용자 지정 예문이나 실기사 외부 전송 없음.

## 핵심 원칙·안전 점검
- 예시 UI는 로컬 모의 서버의 고정 문구이며 명시적 테스트 표시, 읽기 시작 후 숨기고 요청을 제한한다. 모델 응답이 아니며 기사 분석을 수행하지 않는다.
- 로컬 모의 서버의 정적 응답은 빈 요청만 수용하고 기사·학습자 텍스트를 거부한다. CORS는 인증으로 취급하지 않음. 토큰을 확장에 내장하지 않았으며 모의 서버는 운영 보호 중계라고 간주하지 않음.
- 실사용 키·모델·비용 상한·원문 전송 범위·보관·동의·프롬프트 주입 방어 및 의미적 유출 검토는 미구현·미확정.

## 미해결 문제와 필요한 결정
- 2026-11-09 사용자 후속 결정: US$1 실제 비용 상한 보장은 실험 선행 조건에서 보류. 고정 가상 예문, 15분·공유 누적 3회, 실패·timeout 시 소모 및 자동 재시도 금지는 유지. PM은 최초 1회 결과부터 검토하도록 지시했다. 실제 지출 상한은 보장되지 않고 데이터 보관·학습 이용·처리 위치의 API 적용 조건도 여전히 미확인이다. 실제 기사·학습자 응답·개인정보 전송은 승인되지 않았다. 다음 세 항목은 이 후속 결정 전 비용·데이터 검토 이력이다.
- 2026-11-09 비용·데이터 검토: 현행 1달러 실제 과금 상한은 검증되지 않아 기존 승인 조건대로는 실호출 불가. 공식 가격표(https://api-docs.deepseek.com/quick_start/pricing/)는 입력·출력 토큰 기반 요금과 가격 변동 가능성을 명시한다. 코드의 `max_tokens=512`와 0.10달러 내부 예약은 입력 과금 상한·가격 변경·별도 경로 사용을 강제하지 않는다. 토큰 안내(https://api-docs.deepseek.com/quick_start/token_usage)는 문자 비율을 근사치로 설명하며, 요청 전 과금 상한을 보증하지 않는다. 잔액 부족 시 중단 가능성은 약관(https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html) 6.1의 재량 표현으로, 잔액 자체가 확실한 지출 상한이라는 근거는 아니다.
- DeepSeek 공식 문서(https://api-docs.deepseek.com/guides/kv_cache)에 따르면 API 문맥 캐시는 기본 활성이고 디스크에 저장되며 미사용 시 보통 수 시간~수일 후 삭제된다. 이는 전체 API 로그·입출력의 보존 기간이나 학습 사용 여부를 규정하지 않는다. 일반 개인정보처리방침(https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html) 및 플랫폼 약관 5.5는 개발자 하위 서비스 최종 이용자의 개인정보 처리 규칙을 포괄하지 않는다고 한다. API 입력·출력의 전체 보관·학습 사용·처리 위치에 대한 적용 범위와 보증은 확인되지 않았다. 실제 기사·학습자 답안·개인정보는 전송 불가.
- PM 판단 및 사용자 선택 필요: (A) 공급자의 서면 확인 또는 강제 가능한 비용 상한·데이터 조건을 확보할 때까지 보류하거나, (B) 고정 가상 예문 단일 요청에 한해 실제 비용이 1달러 이하임을 보장하지 못하고 제공자의 데이터 처리 조건이 미확인임을 명시적으로 수용하는 조건 변경을 요청한다. B도 별도 승인 전 실행 불가이며 비용 무제한 승인으로 취급하지 않는다. 승인 시 허용 가능한 실제 지출 위험 및 비용 확인·중단 기준을 사용자와 명확히 정한다. 기존 3회 공유 제한을 1회로 코드에서 강제하지 못하므로 수동 1회·추가 요청 금지, 사용량·청구 내역 확인, 즉시 false 복귀를 운영 통제로 구분한다. namespace ID·기존 횟수의 재배포 전후 동일성 및 운영 로그·실제 비활성 복귀도 미검증이다.
- 제한 실험은 학습자 화면에 연결하지 않고 인증된 응답을 PM이 확인하는 방식이다. 실호출 경로는 코드에 연결했으나 실제 공급자와 배포 환경은 미검증이다. 사용량은 응답의 토큰 수만 반환하고 비용을 계산·기록하지 않는다.
- 실호출 전 조건: 고정 입력과 출력 상한에 근거한 동시 요청·재시도 포함 최대 비용 검증, DeepSeek API의 보관·학습 이용·처리 위치에 적용되는 조건 확인, 실험 인증·Worker 이름·실제 도메인 확정 및 공개 배포 별도 승인, 로그 미기록·제공자 응답 크기 제한·입력 읽기 timeout 검증. 같은 키를 다른 곳에서도 쓰면 이 Worker의 예약만으로 전체 과금을 제한할 수 없다.
- 최소 절차(미실행): 위 안전 조건 및 공개 승인 후 사용자가 Cloudflare Secret에 직접 키 설정 → 실험자가 승인된 고정 예문에 대해서만 `{}` 요청 1회 → 학습자 화면에 표시하지 않고 PM이 비공개로 내용과 사용량 확인 → 횟수·비용을 확인한 후 추가 호출 여부 판단. 실패·timeout도 예약을 유지한다. 실행 전 인증 및 안전 검증과 비공개 요청 절차 확인이 필요하다.
- 인증 실패·timeout·늦은 응답 폐기의 실제 Chrome 실검증 필요. 사용자 보고로 정상 모의 응답 표시는 확인됨. 운영 중계의 인증 구조·호스팅은 별도 검토 및 승인 필요.
- 실제 API 호출 전 제공자·정확한 모델 ID·요청/비용 상한·원문 범위·보관·승인된 테스트 원문·키 보호/중계 호스팅을 사용자와 합의해야 함. 승인 이전 호출 금지.
- 구조도 유형 자동 추천 및 품질·답안 유출 검토 미구현. 읽기 중 AI 개입 배제의 의미적 보장은 형식 검사만으로 증명할 수 없음.
- 이전 TASK-009 다중 창·가림 복구와 아이콘 재열기 문제는 남아 있음.

## Git 상태
- `C:\Users\patri\ScienceofLearning_Reading`, `feature/week1-extension`: 체크포인트 `153d98c`는 원격에 push됨. 이번 재배포 승인·결과 문서는 로컬 미커밋 변경. main 병합 및 이번 변경의 추가 커밋·push 없음.

## PM 검토 (PM 작성)
- 실제 diff·실행 근거 확인:
- 수용 / 수정 요청 / 사용자 판단 필요:
- 남은 위험:
