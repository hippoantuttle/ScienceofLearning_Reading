'use strict';
// Shared deterministic segmentation. Offsets refer to the unchanged UTF-16 snapshot.
var SentenceSource = (() => {
  const VERSION = 'sentence-v1', MAX_LENGTH = 12000;
  const abbreviation = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Fig|No|e\.g|i\.e)\.$/i;
  function segment(article) {
    if (typeof article !== 'string' || !article.isWellFormed() || article.includes('\0') || !article.trim() || article.length > MAX_LENGTH) throw Error('unsupported_source');
    const sentences = [];
    let start = 0;
    function append(end) {
      let from = start, to = end;
      while (from < to && /\s/u.test(article[from])) from++;
      while (to > from && /\s/u.test(article[to - 1])) to--;
      if (to > from) sentences.push({id:'s' + String(sentences.length + 1).padStart(4, '0'), start:from, end:to, text:article.slice(from, to)});
      start = end;
    }
    for (let i = 0; i < article.length; i++) {
      const c = article[i];
      if (c === '\n' || c === '\r') { append(i); start = i + 1; continue; }
      if (!/[.!?。？！]/u.test(c)) continue;
      if (c === '.') {
        const before = article.slice(start, i + 1);
        if ((/\d/.test(article[i - 1] || '') && /\d/.test(article[i + 1] || '')) ||
            (/[A-Za-z]/.test(article[i - 1] || '') && /[A-Za-z]/.test(article[i + 1] || '')) ||
            abbreviation.test(before) || /\b(?:[A-Za-z]\.){2,}$/.test(before) || /^\s*\d+\.$/.test(before)) continue;
      }
      while (/[.!?。？！]/u.test(article[i + 1] || '')) i++;
      while (/["'”’」』)\]】]/u.test(article[i + 1] || '')) i++;
      append(i + 1);
    }
    append(article.length);
    return {segmentationVersion:VERSION, article, sentences};
  }
  async function hash(article, subtle = globalThis.crypto.subtle) {
    // Validate without normalizing, truncating or changing the snapshot.
    segment(article);
    const bytes = await subtle.digest('SHA-256', new TextEncoder().encode(article));
    return 'sha256:' + Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
  }
  return {VERSION, MAX_LENGTH, segment, hash};
})();
if (typeof module !== 'undefined') module.exports = SentenceSource;
