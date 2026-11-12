# [TASK-025] Astryx 디자인 적용 결과

## 결과 요약
- 상태: 완료 (요청한 로컬 프론트엔드 구현·검증 범위). 실제 사용자 Chrome 설치 확인·최종 수용은 별도.
- 요청서: `docs/tasks/TASK-025-Astryx-디자인-적용.md` v2 (로컬 커밋·OS 임시 폴더 인계 승인 반영; 구현 범위 동일).
- 참고 이미지의 라벤더 배경·보라색 주요 동작·민트 완료 표시를 공통 테마로 적용했다. 패널의 여백·작성란·단계·문장 블록·안내·기록과 PDF 도구막대·단위 표시를 통일했다.
- 제품 JavaScript 33개, manifest 및 최신 설치본 공개 설정이 기준과 동일하다. 두 HTML의 차이는 `ui-theme.css` 링크 1개씩뿐이다. 문구·필드·이벤트·학습 단계·AI 게이트·서버/DB를 변경하지 않았다.

## 변경 파일
- `design-system/theme.ts`, `tokens.mjs`, `export-css.mjs`, `package.json`, `package-lock.json`, `AGENTS.md`, `GEMINI.md`, `README.md` — Astryx 0.7.14 빌드 전용 테마와 고정 의존성·재생성 안내. `astryx init`과 `astryx theme template`을 사용했다.
- `ui-theme.css` — 같은 테마 원본에서 생성한 Chrome 116 호환 정적 토큰. React/Astryx 런타임·CDN·웹 폰트는 제품에 추가하지 않았다.
- `sidepanel.css`, `pdf-viewer.css` — 토큰 기반 디자인과 좁은 폭의 배치, 포커스·상태 스타일. 숨김과 블록/SVG 포인터 계층은 보존했다.
- `sidepanel.html`, `pdf-viewer.html` — 공통 CSS 링크만 추가.
- `scripts/build-extension.cjs` — 공통 CSS를 고정 허용 목록에 추가하는 한 줄만 변경.
- `tests/panel-ux.test.cjs` — 분리된 공통 테마의 실제 라이트/다크 값과 상태 배경·버튼·입력 경계를 검사하도록 기존 대비 검사를 갱신. 팔레트 누락에 따른 빈 검사 통과도 방지.
- `tests/extension-build.test.cjs` — 두 HTML이 참조하는 스타일 파일이 모두 설치본에 포함되는지 확인.
- 요청·결과·작업 목록·변경 이력 — 범위와 근거 기록.

## 완료 기준별 검증
| 기준 ID | 결과 | 검증 근거와 한계 |
|---|---|---|
| AC-01 | 충족 | IAB 브라우저에서 실제 패키지 HTML/JS/CSS를 사용한 첫 화면·초급 블록·Retell·정리·PDF 렌더링 확인. 역할/연결 자동 생성이나 새 기능 없음 |
| AC-02 | 충족 (검증 범위 내) | 첫 화면과 블록 2개/연결점 8개에서 뷰포트 320/360/420/480의 가로 넘침 없음. 세로 스크롤바가 있을 때 실제 콘텐츠 폭은 305/345/405/465. PDF 도구막대 320/700/1100도 가로 넘침 없음. 다크 팔레트 360px 렌더링·로그인 폼, 색 대비 자동 검사 통과 |
| AC-03 | 충족 | 관련 70개 검사 통과. 최종 전체 280 통과/실패 0/skip 6. 실제 브라우저에서 원문 문장 직접 배치, Enter로 두 접점 연결, Delete로 연결 삭제, 중급 직접 작성→Retell→정리 확인. Retell에서 구조도·후보의 렌더링 사각형이 없음을 확인 |
| AC-04 | 충족 | 기존 공개 설정 유지 설치본 및 네트워크 차단 초급 검토본 모두 빌드 종료 0. 패키지 스타일 포함/개발 파일 제외 검사 통과. 미커밋이므로 정확한 파일 근거는 빌드 보고서와 SHA256SUMS |

## 실제 실행 결과
- 작업 위치: `C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\astryx-ui-refresh`.
- `design-system`에서 `npm run build`·`npm run check`: 종료 0. Astryx 테마 검증 및 정적 CSS 재현 확인. 산출물은 `design-system/dist/reading-lavender.*`, 제품은 공통 CSS만 사용.
- `npx --no-install astryx doctor --built dist`: 종료 0, pass 10 / warn 2 / fail 0. 사용자 정의 테마이므로 테마 패키지 미설치 안내가 있으며 Windows `.cmd` 경로 판별 경고가 있다. 실제 로컬 CLI/Core 0.7.14 실행·버전 일치·테마 빌드·check는 성공했다. React 컴포넌트 순도 검사는 JSX가 없어 미검사이며 컴포넌트 런타임 통합을 했다고 표시하지 않는다.
- 관련 검사: `node --require ./tests/deny-live-preload.cjs --test tests/panel-ux.test.cjs tests/panel-shell.test.cjs tests/extension-build.test.cjs tests/reading-support.test.cjs tests/retell.test.cjs tests/pdf-reading.test.cjs tests/prereading-transitions.test.cjs`, **70 통과 / 실패 0 / skip 0**.
- 최종 전체: `node --require ./tmp/task025/deny-external.cjs --test tests/*.test.*`, 종료 0, **280 통과 / 실패 0 / skip 6**, 약 24.1초. guard는 외부 fetch와 저장소 실제 비밀 파일 읽기를 차단하고 합성 루프백 요청만 허용한다. Windows PowerShell 하위 프로세스에는 OS 내장 모듈 경로를 제공했다.
- 최초 전체 시도에서는 기존 모든 fetch 차단 preload가 합성 루프백 검사도 막고, 호스트 PowerShell 7 모듈 경로가 Windows PowerShell 하위 검사를 방해했다. 제품 코드가 아닌 위 로컬 검증 환경을 보정한 뒤 최종 결과를 얻었다.
- skip 6개는 선택적 로컬 PGlite 미설치로 인한 PostgreSQL 검사다. DB·마이그레이션은 이번 변경에 포함하지 않으며 DB 검증 완료로 확대하지 않는다.
- `tmp/task025/verify-style-only.cjs`: 제품 JS 33개 기준 HEAD와 동일, HTML은 CSS 링크 외 동일, manifest·최신 `task024-blocks-team5-ai-02`의 공개 설정과 동일. `git diff --check` 통과.
- 색상 대비: 원래 장식 보라/흰 글자 약 3.95:1 대신 주요 버튼을 `#6552D8`로 조정(흰 글자 약 5.60:1). 실제 라이트/다크 본문·보조·상태·버튼 대비 4.5:1 이상, 입력 경계 3:1 이상 자동 검사 통과.

### 브라우저 검증의 범위
- 실제 제품 패키지를 `tmp/task025/serve-ui.cjs`의 고정 파일 목록으로 루프백에 제공하고 Chrome API만 합성 구현했다. 실제 기사·계정·학습자 자료·AI/원격 저장 요청은 사용하지 않았다.
- 초급은 로그인 없이 원문에서 직접 추가하는 기존 대체 흐름으로 확인했다. AI 후보 성공·의미 품질을 검증한 것으로 보지 않는다.
- 다크 모드는 브라우저 색상 에뮬레이션 API가 없어 검증 서버에서 공통 CSS의 다크 미디어 조건만 강제로 활성화했다. 제품에는 변경이 없으며 실제 OS 다크 모드 전환 확인과 구분한다.
- 합성 한글 PDF를 실제 PDF.js로 열고 2개 단위 자동 지정·지정 완료를 확인했다. 원문 렌더링은 유지했다. 실제 설치본의 확장 간 메시지 연결은 회귀 검사 근거이며 이 브라우저 합성 검증으로 실환경 확인을 대신하지 않는다.
- 캡처: `tmp/task025/preparation-light.jpg`, `preparation-dark.jpg`, `blocks-light.jpg`, `retell-light.jpg`, `review-light.jpg`, `pdf-light.jpg`. 모두 로컬 합성 근거이며 Git 추적 대상이 아니다.
- 브라우저 검증 탭 정리·뷰포트 초기화, 루프백 서버 종료 완료.

### 빌드와 설치
- 기존 연결 설정 유지: `dist/task025-astryx-team5-ai-01/extension` 및 `extension.zip`.
- 명령: `node scripts/build-extension.cjs --config C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading\build\task024-live-01\extension.guided.public.json --label task025-astryx-team5-ai-01`.
- ZIP SHA-256: `8ec5b6208d1b64e23f0f57abd60e83bdf1d1b062aa0c8b30ba0e6eae5ef9d2ce`.
- 원격 접근 차단 검토본: `node scripts/build-extension.cjs --review-only --guided-review --label task025-astryx-local-review-01`.
- 검토본 ZIP SHA-256: `262d800edb85f350787bd71a1ba68d4d9c098538d415d2114330b0794af4c963`.
- 기준 HEAD `8ea8a05`, `sourceDirty:true`. 기존 빌드 도구 보고서의 `task:TASK-017`은 패키징 도구의 역사적 태그이며 이번 UI 작업 ID는 TASK-025다. 빌드별 보고서의 파일 해시와 `SHA256SUMS`가 산출물 근거다.
- 사용자 확인 시 미저장 훈련을 마친 뒤 동일 확장 ID의 압축 해제 설치 경로를 새 `extension` 폴더로 교체해 새로고침한다. 기존 정책에 따라 다시 로그인해야 할 수 있다. 이 작업에서 사용자의 설치본을 교체하지 않았다.

## 핵심 원칙·안전 점검
- 읽기 중 AI 개입 제한·초급 후보 예외·지연 결과 차단·Retell 숨김은 기존 제품 JS와 회귀 검사로 유지 확인.
- 새 전송 항목·기능 스위치·서버/DB 변경 없음. 최신 공개 설정은 동일하며 실제 모델·원격 저장을 호출하지 않았다.
- 참고 이미지의 자동 저장·AI 내용 힌트·점수/확신도 그래프·새 학습 단계를 추가하지 않았다.
- 실제 비밀 설정·서명키·참가자 자료를 결과물에 넣지 않았다. 설치본은 기존 고정 허용 목록을 따르며 개발 도구·의존성·문서는 포함하지 않는다.

## 미해결 문제와 필요한 결정
- 실제 설치 Chrome에서 전체 훈련·Google 세션·원격 저장/피드백·물리 터치·OS 다크 모드·보조기술 확인 및 사용자 최종 디자인 수용은 별도다. 본 결과를 이 실환경 검증 완료로 확대하지 않는다.
- PGlite가 필요한 DB 검사 6개는 미실행. 이번 프론트엔드 diff와 무관한 기존 선택 의존성이다.

## Git 상태
- 작업 경로·브랜치: 위 worktree / `feature/astryx-ui-refresh`.
- 사용자 후속 지시로 제품 스타일·테마·빌드 허용 목록·검사·이 결과서를 포함한 관련 문서의 로컬 커밋을 허용받았다. 커밋 식별자는 이 파일을 포함하는 커밋의 `git log` 및 OS 임시 폴더의 핸드오프 문서에서 확인한다.
- main 병합·원격 push·배포 없음. root 및 다른 worktree는 편집하지 않았다. 로컬 커밋 승인은 사용자 설치 확인이나 최종 디자인 수용을 뜻하지 않는다.

## PM 검토
- 동일 담당자가 실제 diff·원본 동일성·회귀·브라우저 합성 화면·빌드 근거를 확인했다. 별도 독립 PM 검토로 표시하지 않는다.
- 로컬 구현 범위의 완료 근거를 확보했으며 사용자 최종 수용은 대기다.
