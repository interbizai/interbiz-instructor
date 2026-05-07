/* 인터픽 — 앱 설치 QR/포스터 모듈 (지연 로드)
 * index.html 의 stub 함수들이 이 파일을 lazy-load 한 뒤 호출함.
 * - 글로벌 함수로 노출 (renderAppQR / openQRPoster / printQRPoster / downloadQRImage / copyQRLink / copyQRShareText)
 * - 내부 헬퍼는 _qrInternal 네임스페이스로 묶음
 */
(function(){
  function _qrApiUrl(text, size){
    const s=size||400;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&data=${encodeURIComponent(text)}&margin=8`;
  }

  function _qrShareTextDefault(url){
    return `📱 인터 PICK 앱 설치 안내

강사 역량 평가 시스템을 휴대폰 앱처럼 사용할 수 있어요.

🔗 설치 주소
${url}

📲 설치 방법
① 위 주소를 휴대폰 브라우저에서 열기
   - 갤럭시(Android): Chrome 권장
   - 아이폰(iOS): 반드시 Safari 로 열기 ⚠️
② 화면 하단의 "앱으로 설치하기" 배너 → [설치]
③ 홈 화면에 인터픽 아이콘 생성

문의 : miyeon1.kwon@interbiz.co.kr`;
  }

  function renderAppQR(){
    const inp=document.getElementById('qr-url-input');
    const url=(inp?.value||'').trim()||'https://interpick.vercel.app';
    if(inp) inp.value=url;
    const previewImg=document.getElementById('qr-preview-img');
    const posterImg=document.getElementById('qr-poster-img');
    const posterUrl=document.getElementById('qr-poster-url');
    const shareTxt=document.getElementById('qr-share-text');
    if(previewImg) previewImg.src=_qrApiUrl(url,400);
    if(posterImg) posterImg.src=_qrApiUrl(url,560);
    if(posterUrl) posterUrl.textContent=url;
    if(shareTxt) shareTxt.value=_qrShareTextDefault(url);
  }

  function openQRPoster(){
    renderAppQR();
    document.getElementById('qr-poster-overlay')?.classList.add('show');
  }

  function printQRPoster(){
    document.body.classList.add('qr-print-mode');
    setTimeout(()=>{
      window.print();
      setTimeout(()=>document.body.classList.remove('qr-print-mode'),300);
    },80);
  }

  async function downloadQRImage(){
    const url=(document.getElementById('qr-url-input')?.value||'').trim()||'https://interpick.vercel.app';
    try{
      const res=await fetch(_qrApiUrl(url,800));
      const blob=await res.blob();
      const dl=document.createElement('a');
      dl.href=URL.createObjectURL(blob);
      dl.download=`interpick-qr-${Date.now()}.png`;
      dl.click();
      setTimeout(()=>URL.revokeObjectURL(dl.href),1000);
    }catch(e){
      alert('QR 이미지 다운로드 실패. 인터넷 연결을 확인해주세요.');
    }
  }

  function copyQRLink(){
    const url=(document.getElementById('qr-url-input')?.value||'').trim()||'https://interpick.vercel.app';
    navigator.clipboard?.writeText(url).then(()=>{
      const t=document.getElementById('qr-toast');
      if(t){t.style.display='block';t.textContent='✓ 링크 복사 완료';setTimeout(()=>t.style.display='none',1800);}
    }).catch(()=>alert('복사 실패. 직접 복사해주세요: '+url));
  }

  function copyQRShareText(){
    const t=document.getElementById('qr-share-text');
    if(!t) return;
    t.select();
    navigator.clipboard?.writeText(t.value).then(()=>{
      const toast=document.getElementById('qr-toast');
      if(toast){toast.style.display='block';toast.textContent='✓ 안내문 복사 완료';setTimeout(()=>toast.style.display='none',1800);}
    }).catch(()=>document.execCommand('copy'));
  }

  // 글로벌 노출 — index.html 의 inline onclick 호환
  // (stub 가 아닌 실제 구현으로 덮어씀)
  window.renderAppQR     = renderAppQR;
  window.openQRPoster    = openQRPoster;
  window.printQRPoster   = printQRPoster;
  window.downloadQRImage = downloadQRImage;
  window.copyQRLink      = copyQRLink;
  window.copyQRShareText = copyQRShareText;

  // 모듈 로드 완료 신호
  window._qrModuleLoaded = true;

  // 첫 로드 시 자동 렌더 (stub 호출이 큐잉돼 있으면 처리)
  if(window._qrPendingRender){
    try{ renderAppQR(); }catch(_){}
    window._qrPendingRender=false;
  }
})();
