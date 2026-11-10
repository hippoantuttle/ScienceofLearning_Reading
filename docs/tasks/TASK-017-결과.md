# [TASK-017] 작업 결과

## 결과 요약

- 상태: **부분 완료**. 로컬 빌드·모의 회귀 검증 완료. 호환 AI Worker의 신규 비활성 배포·원격 거절 검사는 완료했다. 실제 Chrome 산출물 설치·재열기 결함 해결·AI 활성화와 원격 전체 흐름은 미완료다.
- 요청서: `docs/tasks/TASK-017-확장-단독-사용-빌드-검증.md` v7. 저장소·실제 작업 경로: `C:\Users\patri\ScienceofLearning_Reading`, 브랜치 `feature/standalone-build`, 시작 기준 `baca19a`.
- 최근 커밋·브랜치·최신 handoff를 실제 확인해 TASK-017을 선정했다. 루트의 이전 `feature/week1-extension`은 보존하고 최신 `feature/panel-ux-completion`에서 새 브랜치를 생성했다. 별도 worktree는 수정하지 않았다.
- 설치본은 허용된 런타임 23개만 포함한다. 개발 UI·로컬 모의 요청·개발 스위치·로컬 설정 참조를 제거하고 공개 설정·HTTPS host 권한·CSP를 생성한다. 고정 manifest 공개 키를 유지하며 개인 서명키는 생성하지 않는다.
- 사용자 제공 anon 키는 프로젝트 ref·anon role 검사 후 Git 제외 공개 설정 입력에만 보관했다. 값은 이 문서·로그에 복제하지 않는다. 사용자가 확인한 원격 Worker는 제출용과 과거 고정 예문 실험용뿐이라 호환 원격 AI는 준비 대기다. AI 두 스위치를 false로 유지한다.

## 변경 파일

- `scripts/build-extension.cjs` — 의존성 없는 허용 목록 빌드·명시된 개발 영역 제거·설정/참조/JS/비밀 형식 검사·고정 시각 ZIP·SHA-256·기준 및 dirty 보고.
- `scripts/extension-config.public.json` — 실제 키 없는 공개 설정 양식.
- `ai-client.js`, `sidepanel.js`, `pilot-ai-panel.js`, `sidepanel.html` — 설치본에서 제외할 개발 영역 경계. 종료 시 개발 DOM 부재를 허용. 개발 원본의 기존 흐름 유지.
- `tests/extension-build.test.cjs` — 키·주소·개발 설정 거부, 제외 자료 sentinel, 허용 목록·결정적 ZIP, 실제 설치본 스크립트/DOM 모의 흐름, 읽기 중 차단·탭 전환 복원, 덮어쓰기 거부.
- `docs/확장-빌드-설치.md`, `README.md` — 명령·공개 설정·별도 프로필 설치/업데이트/복구·알려진 제한·AI 배포 준비안.
- TASK-017 요청·결과, 작업 인덱스·handoff·변경이력 — 착수 권한·실제 작업 상태와 미검증 보존.

## 완료 기준별 검증

| 기준 ID | 충족 / 미충족 / 미검증 | 검증 근거 |
|---|---|---|
| AC-01 | 로컬 빌드 기준 충족 | 명령으로 23개 파일 폴더·ZIP·보고서·해시 생성. JS 문법·HTML 참조·최소 host/CSP·개발 영역 제거·비밀 형식 거부 검사. Python ZIP CRC·각 파일 SHA-256·폴더 내용 동일 확인. 실제 배포용 AI 설정은 대기 |
| AC-02 | 미검증 | 별도 Chrome 프로필에 산출물 설치하지 않음. 호환 원격 AI Worker가 없어 웹/로컬 서버 없는 원격 전체 흐름 미실시. 기존 개발 폴더 사용자 정상 보고를 전용 산출물 근거로 사용하지 않음 |
| AC-03 | 미충족 | 설치본 모의 탭 전환·Retell 복원은 통과했으나 실제 아이콘 재열기 결함을 재현·진단·수정하지 못함. 기존 background 진단 코드는 그대로 유지. 실제 창/URL/닫기 복원 미검증 |
| AC-04 | 부분 검증 | 기존 인증·권한·한도·저장 멱등·응답 유실·수정본 재시도·AI 실패 회귀 검사 통과. 설치본 스크립트의 읽기 중 AI/기록 차단·미설정 실패 시 입력 보존 통과. 실제 원격 만료/오프라인/AI 한도·CORS·권한은 미검증 |
| AC-05 | 부분 완료 | 설치·업데이트·복구 및 제한 안내 작성. 기존 UX 대비 검사 유지. 실제 산출물의 Chrome 키보드·폭·라이트/다크와 설치·업데이트는 미검증 |

## 실제 실행 결과

- 위치: `C:\Users\patri\ScienceofLearning_Reading`.
- 최초 `node --test`: 177개 중 171 통과 / 실패 5 / skip 1 / 종료 1. 실패는 샌드박스 루프백 EACCES와 PowerShell AuthorizationManager 차단, skip은 루트 worktree의 PGlite 부재였다.
- 기존 최신 worktree에 설치되어 있던 `@electric-sql/pglite@0.5.16` 패키지 폴더만 루트의 Git 제외 `tmp/task015/node_modules/@electric-sql/pglite`로 복사했다. 비밀 파일·사용자 자료는 읽거나 복사하지 않았다. 새 다운로드 없음.
- `node --test tests/extension-build.test.cjs tests/records-db.test.mjs`: **7 통과 / 실패 0 / skip 0 / 종료 0**.
- 승인된 외부 실행 `powershell.exe -NoProfile -Command "node --test"`: **177 통과 / 실패 0 / skip 0 / 종료 0**. 실제 Supabase 검증 스크립트는 일반 테스트에서 네트워크/비밀 읽기를 수행하지 않는 기존 가드를 유지한다.
- 이후 중복 개발 경계 주석과 빌더의 경계 검사 표현만 정리했다. 최종 `node --test tests/extension-build.test.cjs tests/pilot-ai-panel.test.cjs tests/panel-shell.test.cjs tests/panel-ux.test.cjs`는 **28 통과 / 실패 0 / skip 0 / 종료 0**.
- `node scripts/build-extension.cjs --review-only --label task017-review-02`: 네트워크 차단 검토 전용본.
- `node scripts/build-extension.cjs --config build/extension-settings.public.json --label task017-auth-02`: 제공된 공개 키·기존 인증/제출 주소, AI 주소 비움·비활성 설치본. 빌드 자체는 외부 연결을 수행하지 않는다.
- 산출물 폴더: `C:\Users\patri\ScienceofLearning_Reading\dist\task017-review-02` 및 `...\dist\task017-auth-02`. 각 `extension` 폴더가 로드 대상이며 ZIP은 전달·보관용이다. 초기 `-01` 산출물도 보존했다.
- 확장 버전 `0.1.0`, 공개 키로 계산한 ID `jenapgoakhnmlmjcdnkfakkkgjobbfbb`, Origin `chrome-extension://jenapgoakhnmlmjcdnkfakkkgjobbfbb`. 기존 두 Wrangler 공개 Origin 설정과 일치한다. 실제 설치·서버 동작 확인을 뜻하지 않는다.
- ZIP SHA-256: review `8af0e1d65483c069507b44211980ae22506be612f700e9d1b49e43d631ee3a7e`, auth `0f4f6416b7599ab9f411ed604ae75a3baa395d80517d61ebae8e6266670e9d43`. 최종 build-report·SHA256SUMS 및 Python 독립 검증으로 확인했다. 초기 `-01`과 최종 `-02`의 런타임 ZIP 내용은 같고 소스/빌더 메타데이터는 빌드 시점별로 다르다.
- Python `zipfile`/`hashlib` 검사로 최종 두 산출물의 CRC·23개 파일 해시·폴더 동일성·빌더/소스 해시·AI 비활성·초기 ZIP과의 재현성을 모두 확인했다(종료 0).
- 미커밋 코드/문서에서 생성한 산출물임을 보고서에 명시한다. 보고서의 기준 HEAD는 `baca19a`이며 새 커밋 릴리스로 표시하지 않는다. 문서 변경 여부는 `documentsDirty`로 별도 기록한다.

## 핵심 원칙·안전 점검

- 읽기 중 AI·과거 답안 차단 및 Retell만 원문 가림: 기존 전체 회귀 검사와 생성된 설치본 스크립트 모의 실행에서 확인. 실제 Chrome·실제 모델 의미 출력은 미검증.
- 개발자 비밀 설정·개인키·참가자 자료를 열람/복사하지 않는 허용 목록 빌드다. 공개 키와 서버 전용 비밀을 구분한다. 초기 로컬 빌드에서는 원격 AI·DB·서버 배포·실제 학습자 응답 전송 없음. 후속 명시 승인으로 신규 AI Worker 비활성 배포만 추가했다.
- 사전에 삽입한 **합성** 제외 파일 sentinel과 허용 파일 내 가상 비밀 형식이 설치본에 혼입되거나 통과하지 않는지 검사했다. 검사는 알려진 패턴 검사이며 모든 종류의 개인정보를 자동 판별하는 기능은 아니다.
- `git diff --check`, 상태·스테이징 경로 및 변경 텍스트의 비밀 형식 검사. 실제 공개 설정 입력·빌드 산출물·로컬 DB 의존성은 Git 제외 상태를 확인한다. 스테이징·커밋은 하지 않는다.

## 미해결 문제와 필요한 결정

- TASK-017 전체 완료가 아니다. 실제 Chrome 재열기 재현·진단과 설치본 전체 경로·장애 검증을 계속해야 한다.
- 초기 빌드 시 호환 `reading-ai-pilot` Worker 준비가 필요했다. 아래 사용자 후속 승인·신규 비활성 배포로 이 조건은 갱신됐다. 실제 활성화/전체 흐름은 여전히 대기다. 기존 `reading-prereading-experiment`를 재사용하면 인증·본문·피드백 계약이 다르다. 새 pilot Worker는 후속 승인으로 비활성 배포했으며 활성화·비용/합성 데이터 검증은 별도 승인 후 실행한다. 구체 준비안은 `docs/확장-빌드-설치.md` 마지막 절을 따른다.
- TASK-014 팀원 관찰·PM 최종 수용, TASK-015 잔여 AC와 실험 이후로 연기된 운영 점검은 유지한다. TASK-018 웹·TASK-016 복습은 착수하지 않는다.

## Git 상태

- 실제 경로·브랜치: `C:\Users\patri\ScienceofLearning_Reading`, `feature/standalone-build`.
- 커밋: 없음, 기준 HEAD `baca19a`. 요청서의 사전 확인 규칙을 유지하며 이번 사용자 지시를 새 커밋 허용으로 확대하지 않았다.
- main 병합·원격 push: 없음. `.git/index` 갱신을 위한 브랜치 전환만 승인받아 수행했다. 사용자 후속 명시 승인으로 아래 신규 Worker 배포만 추가 실행했다.
- 남은 변경: 이 결과의 변경 파일 목록. 다른 worktree·main·기존 기능 브랜치는 수정하지 않았다.

## PM 검토 (PM 작성)

- 실제 diff·실행 근거 확인: 미작성.
- 수용 / 수정 요청 / 사용자 판단 필요: 로컬 빌드·원격/Chrome 미검증을 구분해 검토 필요.
- 남은 위험: 위 AC-02~05 및 AI Worker 부재·재열기 결함.


## 후속 승인·신규 AI Worker 비활성 배포 (2026-11-10)

- 사용자 「좋아 새 reading-ai-pilot worker 을 배포해줘」에 따라 제안한 기본 비활성 신규 배포를 수행했다. 실제 AI 활성화·유료 호출·DB 변경·기존 Worker 변경·Git 커밋/병합/push는 하지 않았다.
- CLI: Wrangler 4.158.0. 샌드박스 npm 조회는 ENOTFOUND로 실패해 승인된 외부 실행으로 전환했다. 기존 Cloudflare 로그인 1개 계정을 확인하고, 그 계정에서 기존 제출용·과거 실험용 두 Worker 조회 성공 및 신규 대상 부재(10007)를 확인한 후 배포했다. 계정 이메일·인증값은 출력·기록하지 않았다.
- 로컬 공개 소스·설정 5개만 `build/ai-pilot-deploy-01`에 복사했다. `.env` 자동 로드를 비활성화하고 기존 `.dev.vars`·로컬 설정·제공자 비밀을 열람·복사하지 않았다. esbuild 입력은 pilot-worker·worker·feedback·pre-reading-v2의 공개 모듈 4개뿐임을 확인했다.
- 명시한 스위치: `PILOT_AI_ENABLED=false`, `PILOT_ARTICLE_ENABLED=false`, `PILOT_FEEDBACK_ENABLED=false`. 사용자별 일일 5회·전체 100회 및 기존 고정 Origin 유지. `PILOT_BUDGET`/`PilotBudget` SQLite Durable Object 초기 migration v1을 신규 Worker에 적용했다. Supabase DB migration은 없다.
- 관련 `node --test tests/pilot-worker.test.mjs tests/pilot-local-worker.test.mjs`: **20 통과 / 실패 0 / skip 0 / 종료 0**.
- `wrangler deploy --config wrangler.pilot-ai.jsonc --dry-run --outdir dry-run --metafile bundle-meta.json --no-autoconfig`: 통과, 업로드 예정 19.94 KiB / gzip 5.60 KiB. 소스 해시 일치·허용 입력 검사 통과.
- 실제 명령: `wrangler deploy --config wrangler.pilot-ai.jsonc --no-autoconfig --tag task017-disabled --message "TASK-017 initial disabled pilot deployment"` (같은 분리 폴더, .env 로드·metrics 비활성, CI 모드). 업로드·트리거 배포 성공 / 종료 0.
- URL: https://reading-ai-pilot.patrick020308.workers.dev
- 버전 ID: `707ca371-8f51-4799-85c0-6b426d0849ae`. 원격 deployment list 재조회로 이 버전 포함을 확인했다. 기존 `reading-submissions-pilot` 및 `reading-prereading-experiment`의 배포 이력은 배포 전후 정확히 같았다.
- 실제 계정·기사 없이 원격 스모크 **7/7 통과**: Origin 없음/틀림 403 forbidden 각 1개, 허용 Origin·토큰 없음 401 unauthorized, 허용 preflight 204 및 CORS, 허용 Origin·시험용 비실제 토큰의 `/recommend`·`/recommend-article`·`/feedback` 각각 503 disabled. 서버 코드상 인증/제공자/예산 접근 이전 비활성 경로이며 실제 AI·DB 요청을 실행하지 않았다.
- 비밀값 설정 명령은 실행하지 않았다. 제공자 키 및 서버 공개 키 Secret 설정·AI 활성화는 후속 작업이다. 현재 주소가 존재하는 것과 실제 추천·피드백 사용 가능 상태는 구분한다.
- 세부 비민감 근거는 Git 제외 `build/ai-pilot-deploy-01/source-hashes.json`, `bundle-meta.json`, `deployment-baseline.json`, `deployment-verification.json`, `remote-smoke.json`. 인증/계정/작성자 정보는 제외했다.
- 새 원격 주소를 공개 설정 양식과 Git 제외 입력에 반영하고 AI 두 스위치는 false로 유지했다. 새 산출물 `dist/task017-auth-03`의 폴더·ZIP을 생성했다. ZIP SHA-256 `08d3148cae58faa9a0eb7163bd46af1c1ed5bcb6224226be8278f97250d0845c`. Python으로 ZIP CRC·23개 파일 해시·폴더 일치·AI host 권한·AI 비활성을 확인했다. 기존 -01/-02는 보존했다.
- AC-02 실제 Chrome 원격 전체 흐름, AC-03 재열기 결함, AC-04 실제 인증/한도/장애, AC-05 실제 설치본 접근성은 계속 미검증/미충족이다. 이번 거절 검사로 사용자 인증·모델 정상 결과를 통과 처리하지 않는다.


## 사용자 저장 404 후속 수정 (2026-11-10)

- 사용자 오류: 「저장 요청 실패 (404) … 작성 내용은 유지됩니다」. 실제 답안·인증값을 수집하지 않았다.
- 원인: Codex가 만든 공개 빌드 설정의 endpoint가 `https://reading-submissions-pilot.patrick020308.workers.dev`로 끝나 `/submissions`가 누락됐다. 빌더도 잘못 `/`만 허용했다. 최초 제출 어댑터는 설정 URL로 그대로 POST하므로 서버의 `/submissions` 검사에서 404가 된다. 기록 클라이언트 역시 이 잘못된 기반 주소에 `/records`를 붙여 계약이 어긋났다. 서버·DB 장애로 판단하지 않는다.
- 수정: 공개 설정 양식·Git 제외 빌드 입력의 endpoint를 `https://reading-submissions-pilot.patrick020308.workers.dev/submissions`로 수정하고 빌드 검증에서 해당 정확한 경로를 요구한다. 루트·잘못된 경로·중복 슬래시를 가진 잘못된 설치본을 만들지 않는다. 서버 API·DB·권한·학습 원칙 변경 없음.
- 회귀 근거: 생성된 패키지의 전체 패널 스크립트와 실제 `server/submissions/worker.mjs`를 함께 실행했다. 인증/DB는 합성 전송 함수로 대체하고 네트워크를 쓰지 않았다. 이전 루트 설정은 동일한 저장 404·DB 쓰기 0·입력/대기 제출 보존을 재현했다. 수정 설정은 로그인→읽기/Retell→최초 제출→저장 후 동일 내용 재조회→`/submissions/records` 준비 검사·목록까지 성공했다.
- 기존 검사는 패키지 스크립트 모의 흐름과 Worker를 각각 확인해 공개 설정의 경로 계약 누락을 놓쳤다. 이 통합 검사는 그 결합을 직접 검증한다. 초기 auth-01~03의 저장 기능은 정상 수용된 설치본으로 취급하지 않는다.
- 관련 `node --test tests/extension-build.test.cjs`: **7 통과 / 실패 0 / skip 0 / 종료 0**. 최종 `powershell.exe -NoProfile -Command "node --test"`: **178 통과 / 실패 0 / skip 0 / 종료 0**.
- 교정 산출물: `dist/task017-auth-04/extension` 및 `extension.zip`을 새로 생성하고 이전 산출물은 이력으로 보존했다. ZIP SHA-256은 `029fe8a204461fc9176c5e22441bdc1937b9038c7fcdd0d214c73e0444991846`이다. Python으로 23개 파일·CRC/해시·폴더 일치·정확한 /submissions 설정·AI 비활성을 확인했다. 실제 사용자 Chrome에서 저장·재조회 성공은 재확인 대기다. 사용자 검증은 [TASK-017 실검증](TASK-017-실검증.md)을 따른다.
- 작성 중인 입력과 pending 제출은 패널 메모리다. 업데이트/새로고침 전에 사용자가 본인 로컬에 필요한 입력을 보존해야 하며 실제 응답을 채팅/Git에 복제하지 않는다. 이번 수정에서 초안 자동 보관을 추가하지 않았다.
- 원격 Worker 재배포·Supabase DB 변경·실제 계정/응답 전송·실제 AI 호출·Git 커밋/병합/push 없음.


## 본인 1명 실험 환경 우선 개발 (2026-11-10)

- 사용자 auth-04 정상 작동 확인을 저장·조회 교정의 사용자 근거로 반영했다. 직접 Chrome 관찰·세부 장애/접근성·AI 수용으로 확대하지 않는다. 사용자 지시로 닫기/재열기 해결의 우선순위를 낮췄으나 AC-03 미충족/보류는 유지한다.
- 사용자 선택: 본인 1명 원격 통합 검증부터 준비. 팀원/참가자 확대는 제외한다.
- `server/ai/pilot-worker.mjs`: 선택적 `PILOT_SELFTEST_ONLY` 모드, 서버 Secret의 지정 UID와 검증된 사용자 ID 비교, 기한 만료/잘못된 설정 거절 추가. 기존 활성 멤버십·Origin·한도·저장된 본인 답안 검증은 유지한다. 기본 비활성/범용 기존 동작과 로컬 전용 Worker는 회귀 검사했다.
- `ai-client.js`: 본인 전용·시험 종료 응답을 안전한 문구로 표시. 읽기 중 요청/지연 결과 차단은 유지한다.
- `scripts/prepare-pilot-environment.cjs`: 공개 입력만 사용해 서버 공개 모듈 4개·분리된 비활성/활성 검토 설정·본인 5/5 일일 한도·시험 기한·공개 UI 설정·소스/생성기 해시 보고를 생성. 계정 UID와 제공자 비밀값은 포함하지 않는다. 로컬 준비만 수행하며 배포하지 않는다.
- `scripts/verify-pilot-environment.cjs`: 명시 `--remote` 때만 고정 Worker의 비인증 경로 7개 점검. 실제 토큰·본문·답안을 읽지 않고 결과를 실제 모델/계정 검증으로 표시하지 않는다. 알 수 없는 응답 본문을 결과에 복제하지 않는다.
- 관련 자동 검사: `node --test tests/pilot-environment.test.cjs tests/pilot-worker.test.mjs tests/pilot-client.test.cjs tests/pilot-ai-panel.test.cjs` **41 통과 / 실패 0 / skip 0 / 종료 0**. 최종 전체 `powershell.exe -NoProfile -Command "node --test"` **185 통과 / 실패 0 / skip 0 / 종료 0**.
- 준비 결과: Git 제외 `build/pilot-selftest-01`. 기한은 준비 시점부터 4시간인 검토용이며 실제 배포 직전에 새 기한으로 재생성해야 한다. `wrangler.disabled.json`과 `wrangler.selftest-review.json`을 분리했다. 시험 ID는 Secret 등록 후에만 서버가 허용하므로 후보가 활성 설정이어도 값이 없으면 거절한다.
- 본인 서버 후보 dry-run: Wrangler 4.158.0, 21.00 KiB/gzip 5.84 KiB, 단일 계정/기한/5·5회·고정 Origin 바인딩 확인, 종료 0. **원격 업로드는 하지 않았다.** npm 동시 캐시 설치 충돌이 발생해 실패한 1회는 보존하고, 기존 정상 설치된 동일 버전 Wrangler를 직접 순차 실행해 검증했다. 캐시 삭제/OS 보안 변경 없음.
- 원격 읽기 전용 확인: 현재 버전 `707ca371-8f51-4799-85c0-6b426d0849ae` 메타데이터 및 Secret 이름 목록만 조회, 목록은 **0개**. 계정/작성자 정보·Secret 값은 출력하지 않았다. `node scripts/verify-pilot-environment.cjs --remote`의 Origin 403·미인증 401·preflight204·AI 세 경로503 disabled **7/7 통과**. 실제 모델/DB 데이터 요청 없음.
- 검토용 UI 산출물 `dist/task017-selftest-review-01` 생성, ZIP SHA-256 `d8df3f901cad62d5728b6cbd0a3e7715def296b196bd0eaae2de731258b29c4f`. 아직 설치 권장본은 auth-04이며 검토본은 서버 활성화·설정 확인 후 제공한다.
- 사용자 다음 행동은 [본인 원격실험 준비](../본인-원격실험-준비.md)의 세 Secret을 Cloudflare에 직접 등록하는 것이다. 값은 채팅/Git에 보내지 않는다. Secret 실제 유효성·AI 활성화/배포·유료 합성 호출·기존 Chrome 전체 흐름은 대기다.
- 이번 후속 개발에서 원격 배포·Secret 변경·Supabase DB 변경·실제 AI 호출·참가자 접촉·Git 커밋/병합/push 없음.


## Secret 등록 후 본인 전용 배포·활성화 (2026-11-10)

- 본인 전용 배포/활성화 안내에 따라 사용자가 Secret 등록 완료를 보고했다. 첫 읽기 전용 점검에서 DEEPSEEK_API_KEY만 확인돼 SUPABASE_PUBLISHABLE_KEY·PILOT_SELFTEST_USER_ID 누락을 안내했고, 사용자 보완 보고 후 세 항목의 Secret 타입을 확인했다. 값·UID·계정 이메일은 출력하거나 로컬 파일/Git에 복제하지 않았다.
- 새 4시간 기한으로 `build/pilot-selftest-02` 생성. 공개 소스 4개 해시 일치 확인, 관련 자동 검사 25개 통과. 같은 Wrangler 4.158.0 dry-run 21.00 KiB/gzip 5.84 KiB 통과.
- `wrangler deploy --config wrangler.selftest-review.json --no-autoconfig --tag task017-selftest --message "TASK-017 single-person time-limited pilot"` 실행 / 종료0. 대상 reading-ai-pilot만 배포. .env 자동 로드·metrics 비활성, CI 모드, 서버 Secret 파일/값 사용 없음. 기존 remote false→true 세 스위치·본인/기한 추가·전체100→5 차이는 준비안과 같았다.
- URL: https://reading-ai-pilot.patrick020308.workers.dev / 버전 `ccccecd2-687c-4830-94fb-bb216c7d19a4`. 배포 목록은 오래된 순으로 반환돼 created_on 최댓값으로 최신 버전/트래픽100%를 확인했다. 직전 최신 비활성 버전은 사용자 Secret 반영 버전 `c24a2806-38ee-4955-8ed5-1259c80c5771`이었다. 최초 비활성 버전707ca371도 이력으로 보존한다.
- 원격 버전 공개 vars가 로컬 후보와 완전히 같고 필수 Secret 타입/보존이 확인됐다. 본인 전용 모드·고정 Origin·활성 멤버십·사용자/전체 UTC 일일 각5회, 종료시각 `2026-11-10T14:55:55.385Z` = 한국시간 **2026-11-10 23:55:55**. 만료 후 새 AI 요청을 차단하며 진행 중 요청 취소나 서버 자동 비활성 배포를 의미하지 않는다.
- 최초 원격 점검은 /recommend401, 본문·피드백400이었다. 점검 도구의 빈 JSON이 활성 API 입력 계약에 맞지 않았기 때문이다. 실제 서버 오류/AI 성공으로 표시하지 않고, 고정 가상 문장·가상 세션 UUID를 사용하도록 도구를 수정했다. 실제 Worker 코드와 결합해 세 경로에서 인증 거절·모델 호출0을 확인하는 회귀1개를 추가했다.
- 교정 후 원격 점검 **7/7 통과**: Origin없는/틀린 요청403 각1, 미인증401, preflight204/CORS, 계약에 맞는 가상 입력·가짜 토큰의 활성 AI 세 경로 각각401 unauthorized. 실제 계정/기사/답안을 쓰지 않았고 모델/답안 조회/예산에 접근하지 않았다. actualAiVerified=false·accountVerified=false는 유지한다.
- 비민감 근거는 Git 제외 `build/pilot-selftest-02/preflight.json`, `activation-verification.json`, `active-smoke.json`(최초 실패), `active-smoke-corrected.json`(성공), preparation-report/bundle-meta다. 이전 preflight의 배열 첫 항목/707ca371 선택은 위 최신 시각 기준 재확인으로 정정한다.
- 관련 교정 검사 `node --test tests/pilot-environment.test.cjs tests/pilot-worker.test.mjs`: **26 통과 / 실패0 / skip0**. 최종 전체 `powershell.exe -NoProfile -Command "node --test"`는 **186 통과 / 실패0 / skip0 / 종료0**다.
- 새 시험 설치본 `dist/task017-selftest-01/extension` 및 ZIP 생성. SHA-256 `d8df3f901cad62d5728b6cbd0a3e7715def296b196bd0eaae2de731258b29c4f`. 검토용 selftest-review-01과 런타임 내용은 동일하나 이번에는 실제 본인 모드 배포·설정·Secret 보존을 확인한 별도 산출물이다. ZIP CRC·23개 파일 해시/폴더 일치·정확한 저장/AI 주소·UI 두 스위치 true·서버 비밀/UID 설정의 클라이언트 제외를 확인했다.
- 사용자는 [본인 원격실험 준비](../본인-원격실험-준비.md)의 마지막 본인 시험 순서를 따른다. 실제 DeepSeek 키·공개 키 유효성, 본인 UID와 로그인 계정 일치, 추천·피드백 실제 결과/의미 안전성·Chrome 전체 경로는 미검증이다.
- 에이전트 실제 모델 호출·Supabase DB 변경·참가자 자료 수집·기존 두 Worker 변경·Git 커밋/병합/push는 하지 않았다. 닫기/재열기 보류와 기존 운영 점검 보류를 유지한다.


## 사용자 본인 시험 정상 확인·로컬 커밋 인계 (2026-11-10)

- 직전 selftest-01 설치/갱신→본인 로그인→가상 글 읽기 전 추천→읽기·Retell·제출→제출 후 피드백 안내에 대해 사용자가 「정상적으로 작동함을 확인했어」라고 보고했다. 사용자 본인 확인으로 기록한다. dev가 실제 모델 결과/Chrome을 직접 관찰한 것은 아니며 글·답안·키·UID·토큰·사용량을 수집하지 않았다.
- 이 보고로 본인 원격 AI 흐름의 사용자 확인 대기를 해소한다. 제공자 키/본인 접근의 실사용 정상 보고와 자동/비호출 검사 근거를 구분한다. 세부 장애·다른 계정 접근·모델 의미 안전성·전체 접근성·팀원/참가자 실사용·PM 최종 수용은 미검증이다. 재열기 결함은 사용자 지시에 따라 계속 보류하므로 TASK-017 전체 완료로 표시하지 않는다.
- 사용자가 이번 변경의 로컬 커밋·branch 상태 보고·handoff를 명시 요청했다. 이번 코드/테스트/문서를 로컬 커밋에 함께 보존하며 실제 식별자는 이 절을 포함한 커밋에 대해 `git log -1 --oneline`으로 확인한다. 원격 push·main 병합·추가 배포·기한 연장 없음.
- 새 최신 인계: [TASK-017 본인 시험 확인 후](../handoff/2026-11-10-TASK-017-본인시험확인후.md). 위치·branch·배포 버전·23:55:55 KST 종료 기한·설치본/해시·Git 제외 로컬 근거·186개 자동 검사·사용자 확인·다음 행동/잔여 위험을 정리했다. 기존 혼재된 로컬 빌드 handoff는 최신 인계 링크로 정리하고 상세 단계별 이력은 본 결과서에 보존했다.
- 기능/코드의 추가 변경은 없고 사용자 정상 보고·권한·최신 인계만 갱신했다. 직전 전체 자동 검사 **186 통과 / 실패0 / skip0 / 종료0** 근거를 유지한다. 커밋 전 실제 staged 내용·금지 파일/비밀 형식·공백 오류를 검사하고 Git 제외 산출물이 포함되지 않음을 확인한다.
