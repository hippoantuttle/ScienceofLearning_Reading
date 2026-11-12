# 확장 UI 테마

업로드된 디자인 참고 이미지의 라벤더·보라·민트 팔레트를 Astryx 0.7.14 테마로 정의한다. `theme.ts`는 `astryx theme template`에서 시작했으며 실제 값은 `tokens.mjs`에서 관리한다.

이 폴더는 **빌드 도구**다. 기존 확장의 HTML·JavaScript·기능 계약을 유지하기 위해 React/Astryx 런타임을 설치본에 추가하지 않는다. React는 Astryx의 개발 의존성으로만 설치된다. 기존 화면을 유지하라는 `astryx build`의 기존 페이지 지침을 적용했다.

```powershell
cd design-system
npm ci
npm run build
npm run check
npx --no-install astryx doctor --built dist
```

- Astryx가 `theme.ts`를 검증하고 `dist/reading-lavender.*`를 생성한다.
- `export-css.mjs`가 같은 토큰 원본을 `../ui-theme.css`로 내보낸다. 이 파일을 손으로 수정하지 않는다.
- Chrome 최소 버전 116을 유지하기 위해 `light-dark()`와 `@scope` 대신 명시적인 `:root` 및 다크 미디어 쿼리로 출력한다.
- 두 제품 HTML은 `ui-theme.css`를 먼저 불러온다. `sidepanel.css`·`pdf-viewer.css`는 토큰을 사용해 기존 DOM을 스타일링한다.
- 기존 짧은 변수 이름은 호환 별칭이다. UI 이벤트·데이터·AI 게이트·원문 가림은 기존 컨트롤러가 계속 소유한다.
- 시스템 글꼴만 사용한다. 웹 폰트·CDN 요청은 없다. 한국어 시스템 글꼴 이름에 대한 Astryx의 폰트 로드 안내는 외부 폰트 추가 요구가 아니다.
- 색상·간격·크기는 테마에서 관리한다. 참고 이미지의 장식 보라 `#7B6CF6`와 흰 일반 텍스트 조합은 피하고, 주요 동작에는 `#6552D8`를 사용한다.
- 재생성한 공통 CSS는 확장 빌드의 고정 허용 목록에 포함한다. 이 폴더·node_modules·개발 문서와 미리보기 도구는 설치본에 포함하지 않는다.

검증 근거·설치본·미검증 항목은 `../docs/tasks/TASK-025-결과.md`를 따른다.
