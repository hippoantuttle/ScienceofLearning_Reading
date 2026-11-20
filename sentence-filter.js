'use strict';
// 2026-11-19 초급 「원문에서 추가」 목록 정리(1단계, 패널 전용).
// - 문장 분할(SentenceSource)·문장 ID·본문은 바꾸지 않고, 화면 목록에서만 숨기거나 표시를 붙인다.
// - AI를 쓰지 않는 결정적 규칙이다. 숨긴 문장은 학습자가 「숨긴 문장 보기」로 다시 고를 수 있다.
// - 판단 근거: (A) 페이지 구조 힌트(content.js가 본문 영역 안의 버튼·화면낭독기 전용 글자·광고 영역·사진 설명에서 모은 줄),
//   (B) 글자 모양 규칙(이메일·주소·기자 이름·저작권·광고 표시·날짜·시간·사진 출처·아주 짧은 줄).
var SentenceFilter = (() => {
  const MAX_HINTS = 400, MAX_HINT_LENGTH = 2000, SHORT_LETTERS = 5;
  const norm = text => String(text || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const letters = text => (text.match(/[\p{L}]/gu) || []).length;
  const AGENCY = '(?:연합뉴스|뉴스1|뉴시스|로이터|AP|AFP|EPA|UPI|신화|Xinhua|게티이미지(?:뱅크|코리아)?|Getty ?Images|이미지투데이|셔터스톡|Shutterstock)';
  const RULES = [
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,                       // 이메일(기자 연락처)
    /(?:https?:\/\/|www\.)\S+/i,                                             // 주소
    /ⓒ|©|무단\s*(?:전재|복제|배포)|재배포\s*금지|all rights reserved|저작권자/i, // 저작권
    /^(?:광고|AD|ADVERTISEMENT|Advertisement|스폰서|Sponsored|협찬|PR)$/,      // 광고 표시
    /^(?:입력|수정|등록|승인|업데이트|기사입력|최종수정|발행)\s*:?\s*\d{2,4}[.\-/년]/, // 날짜 줄
    /^[\d\s:./\-]+$/,                                                        // 숫자·시간만(오디오 플레이어 5:01 등)
    /^(?:사진|그래픽|자료|영상|일러스트)\s*[=:]/,                              // 사진 출처
    new RegExp('^(?:\\S+\\s){0,3}' + AGENCY + '(?:\\s?(?:연합뉴스|뉴스1|뉴시스))?$', 'i') // 통신사 출처(AFP 연합뉴스 등)
  ];
  const BYLINE = /^[가-힣]{2,5}\s?(?:기자|특파원|선임기자|논설위원|객원기자|통신원|기자단)(?:\s|$)/;

  function noiseByText(text) {
    if (!text) return true;
    if (RULES.some(rule => rule.test(text))) return true;
    if (text.length <= 40 && BYLINE.test(text)) return true;
    return letters(text) < SHORT_LETTERS;
  }
  // content.js가 보낸 힌트를 검사·정리한다. 형식이 틀리면 빈 힌트.
  function hints(value) {
    const clean = list => Array.isArray(list) ? [...new Set(list.filter(x => typeof x === 'string').map(norm).filter(x => x && x.length <= MAX_HINT_LENGTH))].slice(0, MAX_HINTS) : [];
    return value && typeof value === 'object' ? {noise: clean(value.noise), captions: clean(value.captions)} : {noise: [], captions: []};
  }
  // 문장마다 'noise'(기본 숨김) | 'caption'(사진 설명 표시) | null(본문). 결과는 {문장ID: 종류}.
  function classify(sentences, rawHints) {
    const h = hints(rawHints), noise = new Set(h.noise), result = {};
    for (const sentence of Array.isArray(sentences) ? sentences : []) {
      const text = norm(sentence?.text);
      let kind = null;
      if (noiseByText(text) || noise.has(text)) kind = 'noise';
      else if (h.captions.some(caption => caption.includes(text))) kind = 'caption';
      result[sentence.id] = kind;
    }
    return result;
  }
  // 검색: 대소문자·공백 차이를 무시한 부분 일치(띄어쓰기 없이 입력해도 찾는다).
  const searchKey = text => String(text || '').normalize('NFC').toLowerCase().replace(/\s+/g, '');
  function matches(text, query) { const key = searchKey(query); return !key || searchKey(text).includes(key); }
  return {MAX_HINTS, MAX_HINT_LENGTH, hints, classify, matches, noiseByText};
})();
if (typeof module !== 'undefined') module.exports = SentenceFilter;
