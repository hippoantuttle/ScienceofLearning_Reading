# [TASK-026] 참고 이미지 디자인 언어 적용 결과

## 결과 요약
- 상태: 로컬 구현·자동 검증·브라우저 합성 확인·로컬 커밋 완료. 실제 Chrome 설치 확인과 사용자 디자인 수용은 대기 중이다.
- 요청서: `docs/tasks/TASK-026-디자인-언어-적용.md` v1
- TASK-025의 색 토큰 위에 참고 이미지의 컴포넌트 문법을 올렸다. 제품 JS의 상태·전송·게이트·저장 로직은 바꾸지 않았다.

## 변경 파일
- `design-system/tokens.mjs`: 중립 칩, 빈 칸(산호), 원문 세리프(`--font-family-source`), STEP 라벨 크기, 칩 높이, 하단 바 여백·그림자 토큰을 추가했다. 라이트·다크 모두 정의했다.
- `ui-theme.css`: `npm run build`로 다시 생성했다. `npm run check` 통과.
- `chip-select.js` (신규): `select[data-chips]` 옆에 칩 행을 붙인다.
  - 기존 select가 유일한 컨트롤이다. 칩 행은 `aria-hidden`, `tabIndex=-1`이다.
  - 칩을 누르면 select 값을 바꾸고 `change`를 보낸다.
  - 컨트롤러가 이벤트 없이 바꾸는 `value`·`disabled`도 따라 표시한다.
  - DOM이 없는 테스트 환경에서는 아무것도 하지 않는다.
- `sidepanel.html`:
  - `chip-select.js` 로드.
  - `#structure`·`#reading-mode`에 `data-chips` 추가.
  - h2에 `data-eyebrow="STEP n"` 추가.
  - Retell 카드 머리에 `원문 가림` 배지와 장식용 가림 상자(`aria-hidden`) 추가.
  - 주요 버튼 5곳을 `.step-footer`로 감쌌다. 그중 동의 버튼 2곳(읽기 시작, 동의하고 저장)은 `.in-flow`다. id·문구·aria 연결·DOM 순서는 그대로다.
- `sidepanel.css`: STEP 타일(완료 민트, 현재 보라), eyebrow, 배지, 칩, 하단 액션 바, Retell 가림 장식, 원문 세리프, 산호 빈 칸, 구조 셀 캡션과 가벼운 블록 버튼, 오류 ⓘ, 헤더 pill, 기록 카드 행을 추가했다. coarse pointer에서는 44px, forced-colors 대응도 넣었다.
- `pdf-viewer.css`: 단위 번호를 pill 칩으로 바꿨다(완료 민트). 읽기 중 막대는 현재 단위 보라, 완료 단위 민트다. 도구막대 버튼은 pill이다.
- `scripts/build-extension.cjs`: 허용 목록에 `chip-select.js` 1줄을 추가했다.
- `tests/panel-ux.test.cjs`: 새 색 쌍 6개의 대비 검사와 칩·가림·하단 바 구조 검사를 추가했다.

## 구현 중 바꾼 결정
- 하단 바를 모든 단계에 띄우면 「읽기 시작 · 본문 보내고 문장 후보 받기」 버튼이 바로 위의 AI 사용 안내를 가렸다(360px 합성 화면에서 확인). 동의가 걸린 버튼 2곳은 떠 있지 않은 `.in-flow`로 바꾸고 검사로 고정했다. 떠 있는 바는 「다시 말하기로」 「정리·저장으로」 「수정본 저장」에만 남았다.
- 구조 유형은 계획대로 라디오 그룹으로 바꾸지 않았다. 기존 select를 JS 약 20곳과 테스트가 직접 읽고 쓰기 때문에, select를 유지하고 칩은 화면 표시만 따라가게 했다. 키보드 사용자는 기존처럼 select를 쓰고, 포커스 링은 칩 행에 보인다.
- 카드 머리 상태 배지는 정적인 곳에만 붙였다(Retell `원문 가림`, 구조 유형 요약). 동적 상태 배지는 JS 변경이 필요해 넣지 않았다.
- 피드백 다섯 단락의 소제목 위계는 결과가 `textContent` 한 덩어리라 CSS만으로는 만들 수 없어 제외했다.

## 완료 기준별 검증
| 기준 | 결과 | 근거와 한계 |
|---|---|---|
| AC-01 | 충족(합성 화면) | 내장 브라우저 합성 화면에서 준비→읽기·구조화(중급)→Retell→정리, 초급 블록 2개 배치를 확인했다. PDF 단위 칩은 PDF를 열어야 보여서 미확인이다(도구막대만 확인) |
| AC-02 | 충족(320/360/380px) | `scrollWidth`가 뷰포트 폭과 같았다. 420/480px은 따로 재지 않았다. `scroll-padding-bottom`으로 떠 있는 바 아래 포커스를 보정했지만, 블록 연결선을 화면 아래쪽에서 끌 때 바가 겹칠 수 있다(미확인) |
| AC-03 | 충족(자동) | 라이트·다크 새 색 쌍 대비 4.5:1 이상, 빈 칸 경계 3:1 이상. 다크는 colorScheme 에뮬레이션으로 확인했다. 실제 OS 다크 모드, 스크린리더, forced-colors는 미확인 |
| AC-04 | 충족 | 칩 클릭 시 select 값 변경과 `change` 처리 확인: 도움 방식 → 동의 안내 표시, 구조 유형 → 라벨이 「핵심 정보 · 원인」으로 바뀜. 전체 검사 통과 |
| AC-05 | 충족 | Retell에서 `#reading` hidden 유지. 기존 Retell·게이트 검사 통과. 새 AI 표시 없음 |
| AC-06 | 충족 | 빌드 허용 목록 반영, `extension-build` 검사 통과. 설치용 ZIP은 만들지 않았다 |

## 실제 실행 결과
- `cd design-system && npm ci && npm run build && npm run check`: 종료 0. Astryx의 "시스템 서체 이름 미로드" 안내는 TASK-025와 같은 정보성 메시지다.
- 전체 검사: `node --require <scratchpad>/deny-external.cjs --test tests/*.test.*` → 287개 중 **281 통과 / 실패 0 / skip 6**.
  - 사용한 guard는 TASK-025와 같은 루프백 허용·외부 차단·비밀 파일 읽기 차단 방식이다.
  - 기본 `deny-live-preload.cjs`로 돌리면 루프백 HTTP 검사 3개가 `NETWORK_BLOCKED`로 실패한다. 환경 조건이며 제품 변경과 무관하다.
  - skip 6은 선택 의존성 PGlite 미설치로 인한 DB 검사다.
- `git diff --check` 통과.
- 브라우저 합성 확인은 TASK-025의 합성 미리보기 서버를 이 worktree 경로로 복사해 실행했다. 실제 기사·계정·AI·원격 저장은 쓰지 않았다. 확인 후 서버를 종료했고, 임시 `.claude/launch.json`은 삭제했다.

## 핵심 원칙·안전 점검
- 읽기 중 AI 질문 카드, 근거 위치, 확신도·점수, 자동 저장 표시, 단어장, "Nibble" 이름·로고는 넣지 않았다.
- 민트 완료색은 단계 진행과 PDF 단위 작성 여부에만 쓴다. 내용 정오는 표시하지 않는다.
- 동의 버튼은 안내문을 가리지 않는다(`.in-flow`, 검사로 고정).
- 세리프는 원문에서 가져온 문장과 전송 미리보기에만 쓴다. 학습자 작성란은 산세리프다.
- 비밀값·참가자 자료는 다루지 않았다.

## 후속: AI 결과 표시 가독성 (2026-11-13 사용자 요청)
- 원인: 서버는 이미 구조화된 JSON을 보내는데, 패널이 이를 한 덩어리 텍스트(`pre-line`)로 이어 붙여 표시했다.
- 변경: `ai-result-view.js`(신규)가 구조 그대로 화면 요소를 만든다. 모든 문자열은 `textContent`로 넣고, 마크다운은 해석하지 않는다.
  - 읽기 전 추천(`pilot-ai-panel.js`): 「핵심 용어」(이름 굵게, 뜻은 보조 색), 「배경」(목록), 「구조도 유형」(배지 + 참고용 안내). 소제목은 h4.
  - 피드백(`feedback-panel.js`의 `feedbackFormat` → `feedbackSections`): 총평, 항목별 근거(항목명|이유 두 열, 360px 이하는 한 열), 잘한 점·개선 제안(학습자 문장 인용 + 설명), 누락 아이디어. 소제목은 h3.
- 시각 복잡성 제한: 강조는 고정 위치(소제목·용어 이름·항목명)에만 둔다. AI가 강조를 정하지 않는다. 새 색은 없다. 인용은 학습자 문장이라 세리프가 아닌 산세리프 + 왼쪽 선이다.
- 서버·프롬프트·응답 검증·전송 범위는 변경 없음.
- 테스트: `tests/fake-dom.cjs`(신규 보조)로 패널 테스트의 DOM 스텁을 보강했다. 소제목 순서·레벨, 용어 dt/dd, 항목 8칸, 인용, 마크다운 기호 없음을 검사한다. 전체 287개 중 **281 통과 / 실패 0 / skip 6**.
- 브라우저 합성 확인: 실제 렌더 함수에 합성 데이터를 넣어 360/420px, 라이트·다크에서 확인했다. 가로 넘침 없음. 실제 AI 응답으로는 확인하지 않았다.

## 후속: PDF 단위 지정 hover (2026-11-13 사용자 요청)
- 단위를 지정할 때 마우스를 올리면 연보라 바탕이 글자를 가려 보기 불편하다는 지적이 있었다. hover는 이제 테두리만 실선 보라로 바꾸고 바탕은 투명하게 둔다(`pdf-viewer.css`).
- 이미 선택한 단위의 옅은 바탕(`.selected`)과 읽기 중 현재 단위의 바탕은 그대로다.
- 확인: 뷰어 화면에 합성 단위 상자를 넣고 hover → 바탕 `rgba(0,0,0,0)`, 테두리 solid `#6552D8`. 다른 상자는 점선 유지. 전체 검사 281 통과 / 실패 0 / skip 6. 실제 PDF로는 확인하지 않았다.
- 이 수정을 반영한 설치본은 아래 「설치본 (hover 수정 반영)」을 쓴다. 그 아래 첫 설치본은 수정 전이다.

## 설치본 (hover 수정 반영, 최신 · 2026-11-13)
- 기준 커밋 `8da107d`, `sourceDirty:false`.
- 실제 연결 설치본: `dist/task026-design-team5-ai-02/extension` 및 `extension.zip`
  - ZIP SHA-256 `7c8f04302961893f66a85de2cc584092a7787934eff9e85cb3d38f14b8401f90`
- 오프라인 검토본: `dist/task026-design-local-review-02/extension` 및 `extension.zip`
  - ZIP SHA-256 `804d316065157a4fef26612e21589436d8ec745e037190963633e70cd3bc4c36`
- 명령과 공개 설정은 아래 첫 설치본과 같다(라벨만 `-02`). 두 설치본 모두 hover 수정, `chip-select.js`, `ai-result-view.js`를 포함한다. `@development` 블록·비밀 파일·개발 폴더는 없다.

## 설치본 (2026-11-13)
- 실제 연결 설치본: `dist/task026-design-team5-ai-01/extension` 및 `extension.zip`
  - 명령: `node scripts/build-extension.cjs --config C:\Users\patri\ScienceofLearning_Reading\.claude\worktrees\guided-reading\build\task024-live-01\extension.guided.public.json --label task026-design-team5-ai-01` (TASK-025와 같은 공개 설정)
  - ZIP SHA-256 `7cb094d87d9c7d8f979726b587e434f410213a05c3b2deaa9dffe1ca4a352d69`, mode `remote-configured-unverified`
- 오프라인 검토본: `dist/task026-design-local-review-01/extension` 및 `extension.zip`
  - 명령: `node scripts/build-extension.cjs --review-only --guided-review --label task026-design-local-review-01`
  - ZIP SHA-256 `b9a8a99099ddc5d1d65e8f981b565dc9ab8a0e94e1cc797dd913cb2ec1451ab8`, mode `review-only-network-disabled`
- 두 설치본 모두 `chip-select.js`·`ai-result-view.js`를 포함하고 `@development` 블록·비밀 파일·개발 폴더는 없다. 루프백 문자열은 기존 URL 검증 허용 목록뿐이다. 확장 ID는 `jenapgoakhnmlmjcdnkfakkkgjobbfbb`(기존과 동일).
- 미커밋 상태에서 빌드했다(`sourceDirty:true`). 커밋 후 파일과의 대응은 각 `build-report.json`과 `SHA256SUMS`로 확인한다. `dist/`는 Git 제외 대상이다.

## 남은 일
- 실제 Chrome 설치본에서 전 과정 확인: PDF 단위 칩·막대, 터치, OS 다크 모드, 스크린리더.
- 사용자 디자인 수용 후 로컬 커밋 여부 결정. TASK-025가 아직 main에 없으므로 병합 순서는 TASK-025 → TASK-026이다.

## Git 상태
- 브랜치: `feature/design-language` (기준 `ae95a73`). 2026-11-13 사용자 커밋 지시로 TASK-026 변경·검사·문서를 로컬 커밋했다. 커밋 식별자는 `git log`로 확인한다. main 병합·push·배포는 하지 않았다. 커밋은 실제 Chrome 확인이나 디자인 최종 수용을 뜻하지 않는다.
