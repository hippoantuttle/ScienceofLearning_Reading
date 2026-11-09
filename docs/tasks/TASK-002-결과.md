# [TASK-002] 작업 결과

## 결과 요약
- 상태: 부분 완료 — 실제 Chrome 확장 실검증 미실시.
- 요청서: `docs/tasks/TASK-002-본문-추출.md` v1.
- 기사 영역 추출·메시지 응답, 세션 탭/URL 저장, 예시 어휘, 오류 및 재시도 UI 구현. 스타일 주입은 이번 작업에 스타일 파일이 없어 미구현이며 TASK-003에서 필요함.

## 변경 파일
- `background.js` — PM 요청에 따른 패널 열기 방식 비교 실험.
- `content.js` — article/main/문단 컨테이너 탐색, body 폴백, 집계와 중복 리스너 방지.
- `sidepanel.js` — 탭 식별·주입·메시지·오류 처리, 메모리 세션 및 화면 갱신.
- `sidepanel.html` — 기존 화면과 연결된 분석 버튼·결과·고정 예시 표시.
- `docs/tasks/TASK-002-결과.md` — 보고서.
- `docs/tasks/TASK-001-결과.md` — PM 요청에 따라 사용자 수동 검증 출처와 미검증 항목 갱신.

## 완료 기준별 검증
| 기준 ID | 충족 / 미충족 / 미검증 | 검증 근거 |
|---|---|---|
| AC-01 | 부분 검증 | Node VM의 DOM 모의 fixture에서 article/main/body 값·집계 성공. 실제 Chrome fixture 미검증, 문단 후보 실 DOM 미검증. |
| AC-02 | 미검증 | 프로토콜/스토어 페이지 사전 차단 및 오류 표시는 작성했으나 실제 Chrome에서 확인하지 않음. |
| AC-03 | 부분 검증 | Node VM에서 동일 스크립트 2회 실행 시 리스너 1개 확인. 실제 Chrome 반복 주입 및 네트워크/저장 관찰 미실시. 코드상 서버 전송·영구 저장 호출 없음. |

## 실제 실행 결과
- 위치: `C:\Users\patri\ScienceofLearning_Reading`, `feature/week1-extension`.
- 테스트: `node C:/Users/patri/AppData/Local/Temp/reading-task002-test.cjs` — 구현 전 content.js 없음으로 실패(1), 구현 후 article·main·body·빈 본문·반복 주입 검증 PASS(0). 브라우저 DOM을 모방한 단위 테스트이며 브라우저 E2E 아님. 테스트 코드는 저장소 외 임시 경로.
- `node --check content.js` 및 `node --check sidepanel.js` — 종료 코드 0.
- 실제 Chrome E2E: 사용자가 기존 버전에서 분석 시 '탭을 확인할 수 없습니다' 오류를 보고. 패널 DevTools에서 lastFocusedWindow 조회는 빈 배열, 별도 조회는 활성 탭이 있으나 URL 없음으로 보고됨. DevTools 포커스의 영향과 아이콘 재클릭 후 권한 상태는 아직 확인 중.
- 후속 진단을 위해 탭 부재와 URL 부재 오류를 분리. 임시 Node 모의 테스트에서 수정 전 동일 문구로 실패(1), 수정 후 구분 PASS(0); 실제 원인 해결을 의미하지 않음.
- 실제 Chrome unpacked 재로드, fixture 및 주입 불가 페이지, 탭 변경·종료·권한 오류는 미실시. 사용자 검증 필요.
- 집계: 문자 수는 JS 문자열 길이, 단어 수는 공백으로 나눈 비어 있지 않은 토큰 수.

## 비교 실험 (PM 요청)
- 가설: 자동 패널 열기 경로 대신 action 클릭 리스너에서 직접 열면 activeTab 임시 권한이 부여될 수 있다. 확정된 원인은 아님.
- 변경: `background.js`에서 `openPanelOnActionClick: false`를 명시하고, `chrome.action.onClicked` 안에서 대기 없이 `chrome.sidePanel.open({windowId: tab.windowId})` 호출. manifest 권한 변경 없음.
- 모의 Chrome API 테스트: 변경 전 예상한 true/false 불일치 실패(종료 1), 변경 후 설정과 해당 창 ID 호출 PASS(종료 0). 실제 사용자 제스처·권한 테스트 아님. 기존 Node 추출 및 오류 구분 테스트도 PASS.
- 실제 Chrome 비교: 사용자가 확장 새로고침 후 아이콘으로 패널을 열고 분석했을 때 문자 수와 예시 어휘가 표시됐다고 보고함. URL 접근 및 추출 성공을 뒷받침하는 사용자 보고이나 개발자 직접 관찰은 아님. 닫기/재열기 및 아이콘 재클릭 동작은 미검증.
- 진단용으로 `background.js`에 고정 단계 로그(action-click, open-call, open-resolved/open-rejected/open-threw)를 추가. URL·탭 정보·오류 상세를 출력하지 않음. Node 모의 성공·비동기 실패·동기 예외 테스트 및 기존 action 테스트 PASS, Chrome 실제 로그 미확인. 해당 진단 테스트는 코드 변경 후 작성했으므로 TDD로 검증하지는 못함. 진단 후 제거 필요.
- 사용자 추가 보고: 아이콘 재열기가 안 되는 듯하나 정확히 패널 자체가 안 열리는지 미확인. 확장을 껐다 켠 뒤 분석은 성공했다고 보고함. 이는 임시 우회이며 재열기 해결이나 기존 검증 유지의 근거가 아님. `action.onClicked` 실행 및 `sidePanel.open` 실패 여부는 미확인.
- 되돌리기: `background.js`에서 action 리스너를 제거하고 `setPanelBehavior({openPanelOnActionClick: true})`로 복원한 뒤 확장 새로고침. 이 조치는 자동 토글을 되돌리지만 원래 URL 접근 문제도 재현될 수 있음.

## 핵심 원칙·안전 점검
- 기사 전문은 패널에 표시하거나 로그에 기록하지 않고 메모리에서만 보관. AI·외부 전송·영구 저장 코드는 없음. 런타임 네트워크 검사는 미실시.
- 예시 어휘는 고정값이며 기사 분석 결과가 아님을 표시. 기사 추출은 AI 분석이 아님.
- 기존 미커밋 변경 보존. 다른 확장 및 기존 기능 회귀 검사는 미실시.

## 미해결 문제와 필요한 결정
- 실제 Chrome E2E 미검증. `chrome://extensions`에서 확장 새로고침 후 기사 페이지에서 분석 및 재분석, 제한 페이지에서 오류와 재시도를 검증해야 함. article/main/body fixture는 별도로 실제 브라우저 확인 필요.
- 사용자 재시도: 아이콘 클릭 후에도 URL 부재 오류가 표시됨. [Chromium issue 336592430](https://issues.chromium.org/issues/336592430)에 동일한 setPanelBehavior/activeTab 증상 및 action.onClicked 대안 보고가 있으나 이 사례의 원인 확정은 아님. 공식 activeTab 문서는 action 실행 시 임시 권한을 설명함.
- 임시 최소 확장 `C:/Users/patri/AppData/Local/Temp/reading-sidepanel-probe`를 작성하여 격리된 Chrome headless에 `--load-extension`으로 실행했으나 DevTools 대상 목록에서 해당 확장 서비스 워커를 확인하지 못해 클릭/권한 검증 불가. 격리 프로세스 종료. 실제 최소 확장 비교 검증은 남음.
- CSS 주입·가림 동작은 TASK-003에서 구현 및 검증 필요. 페이지 URL 재확인은 추출 직후 수행하며, 이후 세션 사용 시점의 변경 감지는 후속 기능에서 반드시 구현해야 함.
- 사이트 DOM 구조에 따라 본문 추출은 부정확할 수 있음.

## Git 상태
- 작업 경로·브랜치: 위 저장소 / `feature/week1-extension`.
- 커밋·main 병합·push: 모두 미실시.
- 기존 변경을 포함해 모든 작업은 미커밋.

## PM 검토 (PM 작성)
- 실제 diff·실행 근거 확인:
- 수용 / 수정 요청 / 사용자 판단 필요:
- 남은 위험:
