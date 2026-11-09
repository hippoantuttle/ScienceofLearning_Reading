const LocalPreview = (() => {
  const SYNTHETIC_TEXT = '동네 도서관은 주말에 어린이를 위한 가상의 독서 모임을 엽니다. 이 글은 기능 검증을 위해 작성한 예시입니다.';
  function validateInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value,'text')) return false;
    const text=value.text;
    return typeof text === 'string' && text.trim().length > 0 && text.isWellFormed() && Array.from(text).length <= 4000 && new TextEncoder().encode(text).length <= 16000;
  }
  function createLocalPreview() {
    let reading=false, used=false, generation=0;
    return {
      async request(consent, simulate) {
        if (reading || used || consent !== true || !validateInput({text:SYNTHETIC_TEXT})) throw new Error('읽기 전 동의 후 한 번만 검사할 수 있습니다.');
        used=true; const id=generation;
        try { const result=await simulate({text:SYNTHETIC_TEXT}); return reading || id!==generation ? null : result; }
        catch(error) { if(reading || id!==generation) return null; throw error; }
      },
      startReading() { reading=true;generation++; },
      reset() { reading=false;used=false;generation++; }
    };
  }
  return {SYNTHETIC_TEXT,validateInput,createLocalPreview};
})();
if(typeof module!=='undefined')module.exports=LocalPreview;
