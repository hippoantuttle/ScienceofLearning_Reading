const localPreviewGate=LocalPreview.createLocalPreview();
const previewText=document.getElementById('local-preview-text');
const previewConsent=document.getElementById('local-preview-consent');
const previewRun=document.getElementById('local-preview-run');
const previewStatus=document.getElementById('local-preview-status');
previewText.textContent=LocalPreview.SYNTHETIC_TEXT;
function localPreviewStartReading(){localPreviewGate.startReading();previewConsent.checked=false;previewConsent.disabled=true;previewRun.disabled=true;previewStatus.textContent='읽기 시작 후에는 로컬 모의 검증을 요청할 수 없습니다.';}
function localPreviewReset(){localPreviewGate.reset();previewConsent.checked=false;previewConsent.disabled=false;previewRun.disabled=false;previewStatus.textContent='';}
previewRun.addEventListener('click',async()=>{
  if(!previewConsent.checked){previewStatus.textContent='로컬 모의 검증 동의가 필요합니다. 동의하지 않아도 자료 없이 진행할 수 있습니다.';return;}
  previewRun.disabled=true;previewConsent.disabled=true;
  try {
    const result=await localPreviewGate.request(true,async payload=>LocalPreview.validateInput(payload)?'가상 입력 형식 확인 완료. 외부 전송 없음.':null);
    if(result!==null)previewStatus.textContent=result;
  } catch {previewStatus.textContent='로컬 검증에 실패했습니다. 자료 없이 계속할 수 있습니다.';}
});
