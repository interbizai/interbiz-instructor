/* video-protect.js — 모든 video 태그 다운로드 방지 (index.html 에서 분리) */
(function(){
  const applyVideoProtect=v=>{
    try{
      v.setAttribute('controlslist','nodownload noremoteplayback');
      v.setAttribute('disablepictureinpicture','true');
      v.disablePictureInPicture=true;
      v.oncontextmenu=()=>false;
    }catch(e){}
  };
  const applyAll=root=>{
    if(!root) return;
    if(root.tagName==='VIDEO') applyVideoProtect(root);
    else if(root.querySelectorAll) root.querySelectorAll('video').forEach(applyVideoProtect);
  };
  const init=()=>{
    applyAll(document);
    new MutationObserver(muts=>{
      muts.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1) applyAll(n);}));
    }).observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
