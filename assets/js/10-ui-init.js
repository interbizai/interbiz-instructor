/* 10-ui-init.js — UI 컴포넌트(아코디언/아이콘/TOP5/웹캠) + 마이프로필 + 부팅/복원
   (index.html 19010~19614행에서 분리 · 로드 순서 유지 필수) */
/* ════════════════════════════════
   ACCORDION / COLLAPSIBLE
════════════════════════════════ */
function toggleAcc(btn){
  const body=btn.nextElementSibling;
  const isOpen=body.classList.contains('open');
  // close all in same wrapper
  const wrap=btn.closest('.acc-wrap');
  wrap.querySelectorAll('.acc-body.open').forEach(b=>b.classList.remove('open'));
  wrap.querySelectorAll('.acc-trigger.open').forEach(b=>b.classList.remove('open'));
  if(!isOpen){ body.classList.add('open'); btn.classList.add('open'); }
}
function toggleColl(btn){
  btn.nextElementSibling.classList.toggle('open');
  btn.classList.toggle('open');
}

/* ════════════════════════════════
   MORPHING ICON ANIMATIONS
════════════════════════════════ */
function startIconAnimations(){
  // Stat card icons
  setInterval(()=>el('ic1').classList.toggle('done'),2200);
  setInterval(()=>el('ic2').classList.toggle('playing'),2400);
  setInterval(()=>el('ic3').classList.toggle('downloaded'),2600);
  setInterval(()=>el('ic4').classList.toggle('notified'),2800);
  // 12-icon grid (all 12 icons on loop)
  const grids=[
    ['ig1','done',2200],['ig2','menu-open',2000],['ig3','playing',2400],['ig4','unlocked',2600],
    ['ig5','copied',2200],['ig6','notified',2800],['ig7','hearted',2000],['ig8','downloaded',2400],
    ['ig9','sent',2600],['ig10','toggled',1800],['ig11','eye-hidden',2200],['ig12','muted',2400]
  ];
  grids.forEach(([id,cls,ms])=>setInterval(()=>{
    const e=el(id); if(e) e.classList.toggle(cls);
    // Toggle knob position for toggle icon
    if(id==='ig10'){ const k=e?.querySelector('.si-toggle-knob'); if(k) k.setAttribute('cx',e.classList.contains(cls)?'28':'12'); }
  },ms));
}

/* ════════════════════════════════
   TOP 5 HIGHLIGHTS
════════════════════════════════ */
function renderTop5(filtered){
  const fVids=getFilteredVideos(filtered||D.users);
  const allVids=fVids.filter(v=>v.status==='분석완료').map(vid=>{
    const u=D.users.find(x=>x.id===vid.userId);
    const score=vid.timestamps.filter(t=>t.type==='good').length*10+vid.timestamps.length*3;
    return {...vid,user:u,score};
  }).sort((a,b)=>b.score-a.score);

  const rankCls=['t5r-1','t5r-2','t5r-3','t5r-4','t5r-5'];
  el('top5-scroll').innerHTML=allVids.map((v,i)=>{
    const bg=['var(--red)','var(--blue)','var(--green)','var(--orange)','var(--purple)'][i%5];
    return `<div class="top5-card neu" style="animation-delay:${i*.08}s" onclick="openVideo(${v.id})">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="top5-rank ${rankCls[i]||'t5r-5'}">${i+1}</span>
        <div><div style="font-size:12px;font-weight:800">${v.title}</div><div style="font-size:10px;color:var(--t3)">${v.user?.name||'—'} · ${v.date}</div></div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <span class="ts-badge ts-good">Good ${v.timestamps.filter(t=>t.type==='good').length}</span>
        <span class="ts-badge ts-bad">Bad ${v.timestamps.filter(t=>t.type==='bad').length}</span>
        <span class="ts-badge ts-tip">Tip ${v.timestamps.filter(t=>t.type==='tip').length}</span>
      </div>
      <div class="bar-track"><div class="bar-fill bf-blue" style="width:${Math.min(100,v.score)}%"></div></div>
    </div>`;
  }).join('')||'<div style="font-size:12px;color:var(--t3);padding:12px">분석 완료된 영상이 없습니다.</div>';
}

/* ════════════════════════════════
   WEBCAM RECORDING
════════════════════════════════ */
let webcamStream=null, mediaRecorder=null, recordedChunks=[], recTimerID=null, recSeconds=0;

// ── 모바일 카메라 전면/후면 전환 ──
let currentFacingMode='user'; // 'user'(전면) | 'environment'(후면)
async function getCameraStream(){
  try{
    return await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:currentFacingMode}},
      audio:true
    });
  }catch(e){
    return await navigator.mediaDevices.getUserMedia({video:true,audio:true});
  }
}
async function flipCamera(target){
  // 녹화 중에는 전환 차단
  if(target==='stream' && typeof streamRecorder!=='undefined' && streamRecorder && streamRecorder.state==='recording'){
    alert('녹화 중에는 카메라를 전환할 수 없습니다.\n녹화를 완료한 뒤 다시 시도해주세요.'); return;
  }
  if(target==='rec' && mediaRecorder && mediaRecorder.state==='recording'){
    alert('녹화 중에는 카메라를 전환할 수 없습니다.\n녹화를 완료한 뒤 다시 시도해주세요.'); return;
  }
  currentFacingMode = currentFacingMode==='user' ? 'environment' : 'user';
  try{
    if(target==='stream'){
      if(streamStream){ streamStream.getTracks().forEach(t=>t.stop()); }
      streamStream = await getCameraStream();
      const v = el('stream-webcam'); if(v) v.srcObject = streamStream;
    } else if(target==='rec'){
      if(webcamStream){ webcamStream.getTracks().forEach(t=>t.stop()); }
      webcamStream = await getCameraStream();
      const v = el('webcam-preview'); if(v) v.srcObject = webcamStream;
    }
  }catch(e){ alert('카메라 전환 실패: '+e.message); }
}

function startWebcam(vidId){
  el('webcam-area').style.display='block';
  getCameraStream().then(stream=>{
    webcamStream=stream;
    el('webcam-preview').srcObject=stream;
  }).catch(err=>{ alert('카메라 접근 권한이 필요합니다: '+err.message); stopWebcam(); });
}
function stopWebcam(){
  if(webcamStream){ webcamStream.getTracks().forEach(t=>t.stop()); webcamStream=null; }
  if(mediaRecorder && mediaRecorder.state!=='inactive') mediaRecorder.stop();
  el('webcam-area').style.display='none';
  el('rec-bar').style.display='none';
  clearInterval(recTimerID); recSeconds=0;
}
function toggleRecord(vidId){
  const btn=el('rec-start-btn');
  if(!mediaRecorder||mediaRecorder.state==='inactive'){
    recordedChunks=[];
    mediaRecorder=new MediaRecorder(webcamStream,{mimeType:'video/webm'});
    mediaRecorder.ondataavailable=e=>{ if(e.data.size>0) recordedChunks.push(e.data); };
    mediaRecorder.onstop=()=>{
      const blob=new Blob(recordedChunks,{type:'video/webm'});
      const url=URL.createObjectURL(blob);
      const vid=D.videos.find(x=>x.id===vidId);
      if(vid){ vid.filePath=url; save(); }
      stopWebcam(); openVideo(vidId);
    };
    mediaRecorder.start();
    btn.textContent='녹화 중지'; btn.style.background='var(--t1)';
    el('rec-bar').style.display='flex';
    recSeconds=0;
    recTimerID=setInterval(()=>{
      recSeconds++;
      const m=String(Math.floor(recSeconds/60)).padStart(2,'0');
      const s=String(recSeconds%60).padStart(2,'0');
      el('rec-timer').textContent=m+':'+s;
    },1000);
  } else {
    mediaRecorder.stop();
    btn.textContent='녹화 시작'; btn.style.background='';
    clearInterval(recTimerID);
  }
}

/* ════════════════════════════════
   DUAL TAB SWITCH
════════════════════════════════ */
function switchDualTab(paneId,btn){
  btn.parentElement.querySelectorAll('.dual-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.dual-pane').forEach(p=>p.classList.remove('active'));
  el(paneId).classList.add('active');
}

/* ════════════════════════════════
   MY PROFILE PAGE
════════════════════════════════ */
function renderMyProfile(){
  if(!CU||!CU.id){ location.replace('login.html'); return; }
  const u=D.users.find(x=>x.id===CU.id);
  if(!u){ return; }  // 데이터 미로드/관리자(id 0) — 로그인 페이지로 내쫓지 않음
  const st=u.status||'근무';
  const stColor=st==='근무'?'#10b981':(st==='육아휴직'||st==='휴직')?'#f59e0b':(st==='퇴사')?'#9ca3af':'#6b7280';
  el('myprofile-main').innerHTML=`
    <div class="content-card" style="max-width:640px;margin:0 auto">
      <!-- 프로필 헤더: 성명 크게 + 보조정보 -->
      <div style="padding:24px;margin-bottom:18px;border:1px solid var(--bdr);border-radius:14px;background:#fff">
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
          <div style="position:relative;flex-shrink:0">
            <div id="mp-photo-circle" style="width:72px;height:72px;border-radius:50%;overflow:hidden;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:var(--t2);cursor:pointer;border:2px solid var(--bdr)" onclick="document.getElementById('mp-photo-input').click()" title="클릭하여 사진 변경">
              ${u.photo?`<img src="${u.photo}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">`:u.name?.[0]||'?'}
            </div>
            <button onclick="document.getElementById('mp-photo-input').click()" style="position:absolute;bottom:-2px;right:-2px;width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:var(--blue);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.18)" title="사진 등록/변경">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
            <input type="file" id="mp-photo-input" accept="image/*" style="display:none" onchange="uploadMyPhoto(this)">
            ${u.photo?`<button onclick="removeMyPhoto()" style="position:absolute;top:-4px;right:-4px;width:22px;height:22px;border-radius:50%;border:1px solid #fff;background:#ef4444;color:#fff;cursor:pointer;font-size:12px;line-height:1;font-weight:900;box-shadow:0 1px 4px rgba(0,0,0,.2)" title="사진 제거">×</button>`:''}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
              <div style="font-size:26px;font-weight:900;color:var(--t1)">${u.name||'—'}</div>
              <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:${stColor}22;color:${stColor};font-weight:800">${st}</span>
            </div>
            <div style="font-size:13px;color:var(--t2);line-height:1.6">
              ${[u.orgName,u.team,u.position,u.office].filter(Boolean).join(' · ')||'—'}
            </div>
            <div style="font-size:11px;color:var(--t3);margin-top:3px">${u.email||''}</div>
            <div style="font-size:10.5px;color:var(--t3);margin-top:6px">📷 동그란 사진을 클릭하면 사진을 등록·변경할 수 있어요</div>
          </div>
        </div>
      </div>
      <!-- 비밀번호 변경 -->
      <div style="padding:20px;margin-bottom:18px;border:1px solid var(--bdr);border-radius:14px;background:#fff">
        <div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:12px">🔒 비밀번호 변경</div>
        <div style="display:grid;grid-template-columns:1fr;gap:10px">
          <div><label style="font-size:11px;font-weight:700;color:var(--t2);display:block;margin-bottom:4px">현재 비밀번호</label><input type="password" id="mp-pw-old" placeholder="현재 비밀번호" style="width:100%;padding:9px 12px;border:1px solid var(--bdr);border-radius:8px;font-size:13px"></div>
          <div><label style="font-size:11px;font-weight:700;color:var(--t2);display:block;margin-bottom:4px">새 비밀번호</label><input type="password" id="mp-pw-new" placeholder="4자 이상" style="width:100%;padding:9px 12px;border:1px solid var(--bdr);border-radius:8px;font-size:13px"></div>
          <div><label style="font-size:11px;font-weight:700;color:var(--t2);display:block;margin-bottom:4px">새 비밀번호 확인</label><input type="password" id="mp-pw-new2" placeholder="다시 입력" style="width:100%;padding:9px 12px;border:1px solid var(--bdr);border-radius:8px;font-size:13px"></div>
          <button class="btn" style="background:var(--blue);color:#fff;padding:9px 16px;font-weight:700;font-size:13px" onclick="changeMyPassword()">비밀번호 변경</button>
        </div>
      </div>
      <!-- 본인 수정 가능한 필드 (이름/연락처 등) -->
      <div style="padding:20px;border:1px solid var(--bdr);border-radius:14px;background:#fff">
        <div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:12px">✏️ 내 정보 수정</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:11px;font-weight:700;color:var(--t2);display:block;margin-bottom:4px">성명</label><input type="text" id="mp-name" value="${u.name||''}" style="width:100%;padding:9px 12px;border:1px solid var(--bdr);border-radius:8px;font-size:13px"></div>
          <div><label style="font-size:11px;font-weight:700;color:var(--t2);display:block;margin-bottom:4px">연락처</label><input type="text" id="mp-phone" value="${u.phone||''}" style="width:100%;padding:9px 12px;border:1px solid var(--bdr);border-radius:8px;font-size:13px"></div>
          <div style="grid-column:1/-1;padding:10px 12px;background:rgba(0,120,200,.04);border-radius:8px;font-size:11px;color:var(--t3)">조직명, 팀명, 직군 등은 관리자에게 수정 요청해주세요.</div>
          <button class="btn" style="grid-column:1/-1;background:var(--blue);color:#fff;padding:9px 16px;font-weight:700;font-size:13px" onclick="saveProfile()">저장</button>
        </div>
      </div>
    </div>`;
  showPage('page-myprofile');
}
async function changeMyPassword(){
  if(!CU||!CU.id){alert('로그인 정보가 없습니다.');return;}
  const oldPw=v('mp-pw-old'), newPw=v('mp-pw-new'), newPw2=v('mp-pw-new2');
  if(!oldPw){alert('현재 비밀번호를 입력하세요.');return;}
  if(!newPw||newPw.length<4){alert('새 비밀번호는 4자 이상이어야 합니다.');return;}
  if(newPw!==newPw2){alert('새 비밀번호 확인이 일치하지 않습니다.');return;}
  if(newPw===oldPw){alert('새 비밀번호가 기존과 동일합니다.');return;}
  const token=localStorage.getItem('ib_token')||'';
  try{
    const r=await fetch('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({oldPassword:oldPw,newPassword:newPw})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok || !j.ok){
      alert('❌ 비밀번호 변경 실패\n\n원인: '+(j.error||'알 수 없음')+'\nstatus: '+r.status);
      return;
    }
    el('mp-pw-old').value='';el('mp-pw-new').value='';el('mp-pw-new2').value='';
    alert('✅ 비밀번호가 변경되었습니다.\n\n다음 로그인 시 새 비밀번호를 사용하세요.\n\n(보안을 위해 자동 로그아웃됩니다)');
    // 비밀번호 변경 후 강제 로그아웃 — 다른 기기 세션도 자연스럽게 만료
    setTimeout(()=>doLogout(), 800);
  }catch(e){
    alert('네트워크 오류: '+(e?.message||e));
  }
}
async function saveProfile(){
  if(!CU||!CU.id) return;
  const u=D.users.find(x=>x.id===CU.id);
  if(!u) return;
  const name=v('mp-name').trim(), phone=v('mp-phone').trim();
  if(!name){alert('성명을 입력하세요.');return;}
  const upRes=await dbUpdateUser(u.id,{name,phone});
  if(upRes && upRes.ok===false){ alert('❌ 저장 실패\n\n원인: '+(upRes.error||'알 수 없음')); return; }
  u.name=name;u.phone=phone;CU=u;saveStoredUser(CU);
  alert('✅ 프로필이 저장되었습니다.');
}
// 마이페이지 사진 업로드 — 항상 서비스 키 API 우회 (RLS silent-block 회피)
// 이미지 자동 압축 — 큰 사진을 1.5MB 이하로 줄이며 프로필 화질은 유지 (maxDim 1200)
async function compressImage(file, maxBytes=1536*1024, maxDim=1200){
  // 작은 파일은 그대로
  if(file.size <= maxBytes && file.size <= 3*1024*1024) return file;
  return new Promise((resolve)=>{
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{
      URL.revokeObjectURL(url);
      let {width:w, height:h}=img;
      // 긴 변이 maxDim 넘으면 비율 유지하며 축소
      if(w>maxDim || h>maxDim){
        if(w>h){h=Math.round(h*maxDim/w); w=maxDim;}
        else{w=Math.round(w*maxDim/h); h=maxDim;}
      }
      const canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d');
      // 고품질 보간 (다운스케일 시 부드러움)
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      ctx.drawImage(img,0,0,w,h);
      // 압축 품질 자동 조정 — maxBytes 이하 될 때까지 (높은 품질부터)
      const tryQuality=(q)=>new Promise(r=>canvas.toBlob(b=>r(b), 'image/jpeg', q));
      (async()=>{
        for(const q of [0.92, 0.85, 0.7, 0.55, 0.4, 0.3]){
          const blob=await tryQuality(q);
          if(blob && blob.size<=maxBytes){
            resolve(new File([blob], (file.name||'photo').replace(/\.\w+$/,'')+'.jpg', {type:'image/jpeg'}));
            return;
          }
        }
        // 최저 품질로도 안 되면 마지막 결과 반환
        const last=await tryQuality(0.3);
        resolve(new File([last], (file.name||'photo').replace(/\.\w+$/,'')+'.jpg', {type:'image/jpeg'}));
      })();
    };
    img.onerror=()=>{URL.revokeObjectURL(url); resolve(file);};
    img.src=url;
  });
}
async function uploadMyPhoto(input){
  if(!CU||!CU.id){alert('로그인 정보가 없습니다.');return;}
  let file=input?.files?.[0];
  if(!file) return;
  if(!/^image\//.test(file.type)){alert('이미지 파일만 업로드 가능합니다.');input.value='';return;}
  // 자동 압축 — 1MB 초과 시 자동으로 작게
  if(file.size > 1024*1024){
    const origSize=(file.size/1024/1024).toFixed(1);
    file = await compressImage(file);
    const newSize=(file.size/1024/1024).toFixed(2);
    console.log(`📸 자동 압축: ${origSize}MB → ${newSize}MB`);
  }
  if(file.size>3*1024*1024){alert('압축 후에도 3MB 초과. 다른 사진을 선택해주세요.');input.value='';return;}
  const reader=new FileReader();
  reader.onload=async e=>{
    const dataUrl=e.target.result;
    // 미리보기 즉시 (dataUrl)
    const circle=document.getElementById('mp-photo-circle');
    if(circle) circle.innerHTML=`<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover">`;
    try{
      const token=localStorage.getItem('ib_token')||'';
      if(!token){throw new Error('로그인 토큰 없음 — 다시 로그인하세요');}
      const r=await fetchWithRetry('/api/auth/update-photo',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({photo:dataUrl})  // 서버가 dataUrl → Storage 업로드 → URL 저장
      });
      const j=await r.json().catch(()=>({}));
      if(!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));
      if(!j.saved || !j.photoUrl) throw new Error('Storage 업로드 후 URL 발급 실패');
      // photoUrl 은 Storage 의 public URL (CDN)
      const photoUrl=j.photoUrl;
      // 검증 — users_safe 뷰에서도 그 URL 이 그대로 읽히는지
      const{data:verify}=await sb.from('users_safe').select('photo').eq('id',CU.id).maybeSingle();
      if(!verify || !verify.photo){
        alert('⚠ DB 검증 실패 — 새로고침 시 사라질 수 있음. 관리자에게 문의');
        return;
      }
      // 로컬 갱신 — D.users·CU 모두 URL 로 (base64 아님 → localStorage quota 안전)
      const u=D.users.find(x=>x.id===CU.id);
      if(u) u.photo=photoUrl;
      CU.photo=photoUrl;
      saveStoredUser(CU);
      // 아바타 즉시 갱신 (URL 사용)
      try{document.querySelectorAll('.hdr-av,.tn-profile-photo').forEach(av=>{av.innerHTML=`<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;});}catch(_){}
      if(typeof showToast==='function') showToast(`✓ 사진 저장 완료 (${(j.bytes/1024)|0}KB → Storage)`,'#10b981');
      renderMyProfile();
    }catch(err){
      alert('❌ 저장 실패\n\n원인: '+(err.message||err));
    }
  };
  reader.readAsDataURL(file);
  input.value='';
}
async function removeMyPhoto(){
  if(!CU||!CU.id) return;
  if(!confirm('프로필 사진을 제거할까요?')) return;
  try{
    const token=localStorage.getItem('ib_token')||'';
    const r=await fetchWithRetry('/api/auth/update-photo',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({photo:null})
    });
    const j=await r.json().catch(()=>({}));
    if(!j.ok) throw new Error(j.error||'제거 실패');
    const u=D.users.find(x=>x.id===CU.id);
    if(u) u.photo=null;
    CU.photo=null;
    saveStoredUser(CU);
    try{document.querySelectorAll('.hdr-av,.tn-profile-photo').forEach(av=>{av.innerHTML=CU.name?.[0]||'?';});}catch(_){}
    if(typeof showToast==='function') showToast('프로필 사진 제거됨','#6b7280');
    renderMyProfile();
  }catch(err){alert('제거 실패: '+(err.message||err));}
}

/* ════════════════════════════════
   UTILS
════════════════════════════════ */
function el(id){ return document.getElementById(id)||null; }
function v(id){ const e=el(id); return e?(e.value||''):''; }
// ── 수기 점수 수정 즉시 반영용 헬퍼 ────────────────────
// 재렌더가 어떤 이유로든 실패해도 '숫자만 바뀌고 색은 옛날 그대로' 인 상태가 남지 않도록
// 점수 pill 색과 상단 요약(총점·링·%)을 직접 갱신한다.
// 타이핑 중 즉시 색 변경 — 저장/재렌더를 기다리지 않는다
function recolorScorePill(elm){
  if(!elm) return;
  const max=Number(elm.dataset?.max)||5;
  const txt=String(elm.textContent||'').replace(/[^0-9-]/g,'');
  if(!txt){ elm.style.background='transparent'; return; }
  let n=parseInt(txt,10);
  if(isNaN(n)) return;
  if(n>max) n=max;
  if(n<0) n=0;
  const color=(typeof scoreColorFromRatio==='function')
    ? scoreColorFromRatio(max?n/max:0)
    : ((max?n/max:0)>=0.7?'#10b981':(max?n/max:0)>=0.5?'#f59e0b':'#ef4444');
  elm.style.background=color+'18';
  elm.style.color=color;
  elm.style.fontWeight='800';
}
function repaintScorePill(which,subIdx,score,max){
  const ratio=max?score/max:0;
  const color=(typeof scoreColorFromRatio==='function')
    ? scoreColorFromRatio(ratio)
    : (ratio>=0.7?'#10b981':ratio>=0.5?'#f59e0b':'#ef4444');
  document.querySelectorAll(`tr[data-ts-which="${which}"][data-ts-globalidx="${subIdx}"] .ts-score-edit`)
    .forEach(pill=>{
      pill.style.background=color+'18';
      pill.style.color=color;
      if(String(pill.textContent||'').trim()!==String(score)) pill.textContent=String(score);
    });
}
// 상단 총점 배너 — 교육맞춤평가(crit) / AI 독자(ai) 각각의 점수·링·퍼센트
function repaintScoreSummary(which,overall){
  const pct=Math.max(0,Math.min(100,Math.round(Number(overall)||0)));
  const isAi=which==='ai';
  const scoreEl=document.getElementById(isAi?'an-ai-score':'an-total-score');
  const pctEl=document.getElementById(isAi?'an-score-pct-ai':'an-score-pct');
  const ringEl=document.getElementById(isAi?'an-score-ring-ai':'an-score-ring');
  if(scoreEl) scoreEl.textContent=String(pct);
  if(pctEl) pctEl.textContent=pct+'%';
  if(ringEl) ringEl.setAttribute('stroke-dashoffset',String(264-(264*pct/100)));
}
// 레이더/대항목 막대는 전체 재렌더가 있어야 갱신된다.
// 다만 재렌더는 표 DOM 을 통째로 교체하므로, 수정이 끝나고 잠잠해진 뒤에 한 번만 실행한다.
// (수정 중에 실행하면 입력하던 칸이 사라져 다음 칸이 저장되지 않는다)
let _graphRefreshTimer=null;
function scheduleGraphRefresh(delay){
  if(_graphRefreshTimer) clearTimeout(_graphRefreshTimer);
  _graphRefreshTimer=setTimeout(()=>{
    _graphRefreshTimer=null;
    // 아직 어딘가를 편집 중이면 더 미룬다
    const ae=document.activeElement;
    if(ae&&ae.getAttribute&&ae.getAttribute('contenteditable')==='true'){ scheduleGraphRefresh(1500); return; }
    // 표 스크롤 위치 보존 — 재렌더 후 같은 자리로 되돌린다
    const feed=document.getElementById('an-ts-feed');
    const findScroller=(rootEl)=>rootEl?Array.from(rootEl.querySelectorAll('*')).find(n=>n.scrollHeight>n.clientHeight+4):null;
    const savedTop=findScroller(feed)?.scrollTop||0;
    try{
      const crit=window._lastVertexResult?.crit;
      const ai=window._lastVertexResult?.ai;
      if((crit||ai)&&typeof mapVertexToLegacy==='function'&&typeof renderAnalysisResult==='function'){
        const mapped=mapVertexToLegacy(crit,ai);
        const ctx=window._anRenderCtx||{hasChecklist:true,studentCount:20};
        renderAnalysisResult(mapped,ctx.hasChecklist,ctx.studentCount);
        if(savedTop>0) requestAnimationFrame(()=>{
          const sc=findScroller(document.getElementById('an-ts-feed'));
          if(sc) sc.scrollTop=savedTop;
        });
      }
    }catch(e){ console.warn('그래프 갱신 경고:',e); }
  }, typeof delay==='number'?delay:1500);
}
// 관리자/부관리자용: 평가 항목별 피드백 인라인 수정 저장
// (score / analysis / solution 필드를 해당 evaluations row의 sub_scores[subIdx]에 반영)
async function saveSubScoreEdit(which,subIdx,field,newValue){
  try{
    if(!(CU?.isAdmin||CU?.isSubAdmin)){ return; }
    const evalId=which==='ai'?window._anAiEvalId:window._anCritEvalId;
    if(!evalId){ if(typeof showToast==='function')showToast('평가 ID 없음 — 새로고침 후 다시 시도','#ef4444'); return; }
    const row=(D.evaluations||[]).find(e=>e.id===evalId);
    if(!row){ if(typeof showToast==='function')showToast('평가 row 로드 실패','#ef4444'); return; }
    const subs=Array.isArray(row.sub_scores)?JSON.parse(JSON.stringify(row.sub_scores)):[];
    if(!subs[subIdx]){ if(typeof showToast==='function')showToast('항목 인덱스 오류','#ef4444'); return; }
    const prev={...subs[subIdx]};
    if(field==='score'){
      const rawInput=String(newValue||'').trim();
      let n=parseInt(rawInput.replace(/[^0-9-]/g,''),10);
      if(isNaN(n)) n=0;
      const max=prev.max||5;
      // 배점을 넘겨 입력하면 배점으로 맞춘다 (예전엔 저장을 취소하고 표 전체를 다시 그렸는데,
      // 그 재렌더가 이어서 수정하던 칸을 날려버려 '첫 칸만 저장되는' 원인이었다)
      if(n>max){
        if(typeof showToast==='function') showToast(`배점 ${max}점을 넘을 수 없어 ${max}점으로 맞췄습니다`,'#f59e0b');
        n=max;
      }
      if(n<0) n=0;
      if(n===prev.score){
        // 값은 그대로여도 화면 색이 어긋나 있을 수 있으니 색만 다시 칠한다
        try{ repaintScorePill(which,subIdx,n,max); }catch(_){}
        return;
      }
      subs[subIdx].score=n;
      // ⚠ 수기 수정 표시 — 이 표시가 있어야 재렌더 시 AI 원점수로 되돌아가지 않는다
      subs[subIdx].manual=true;
      subs[subIdx].score_capped=false;
      // level / 5단계 원점수 재지정 — 화면 색상과 동일한 하나의 기준 사용
      //   70% 이상 초록(4~5점) · 50% 이상 주황(3점) · 그 미만 빨강(1~2점)
      const ratio=max?n/max:0;
      const ls=(typeof levelScoreFromRatio==='function')
        ? levelScoreFromRatio(ratio)
        : (ratio>=0.9?5:ratio>=0.7?4:ratio>=0.5?3:ratio>=0.3?2:1);
      subs[subIdx].level_score=ls;
      subs[subIdx].level_name=({5:'매우 우수',4:'우수',3:'보통',2:'미흡',1:'매우 미흡'})[ls]||'';
      subs[subIdx].level=ls>=4?'good':ls===3?'normal':'bad';   // 해당없음 칸에 숫자를 넣으면 na 자동 해제
    } else if(field==='analysis'){
      const val=String(newValue||'').trim();
      if(val===String(prev.analysis||'').trim()) return;
      subs[subIdx].analysis=val;
    } else if(field==='solution'){
      const val=String(newValue||'').trim();
      if(val===String(prev.solution||'').trim()) return;
      subs[subIdx].solution=val;
    } else { return; }
    // Supabase 업데이트
    const {error}=await sb.from('evaluations').update({sub_scores:subs}).eq('id',evalId);
    if(error){
      if(typeof showToast==='function')showToast('저장 실패: '+error.message,'#ef4444');
      console.error('saveSubScoreEdit:',error);
      return;
    }
    // 로컬 상태 동기화
    row.sub_scores=subs;
    const rawKey=which==='ai'?'ai':'crit';
    if(window._lastVertexResult?.[rawKey]?.sub_scores&&window._lastVertexResult[rawKey].sub_scores[subIdx]){
      Object.assign(window._lastVertexResult[rawKey].sub_scores[subIdx],subs[subIdx]);
    }
    // overall_score + 대항목(categories) 재계산 (na 제외)
    // ※ categories 를 같이 갱신해야 레이더/막대 그래프와 대항목 달성률이 총점과 어긋나지 않는다
    const valid=subs.filter(s=>s.level!=='na');
    const sumS=valid.reduce((a,s)=>a+(s.score||0),0);
    const sumM=valid.reduce((a,s)=>a+(s.max||0),0);
    if(sumM>0){
      const newOverall=Math.round(sumS/sumM*100);
      // 대항목 집계 — 원본 등장 순서 유지
      const order=[], cmap=new Map();
      subs.forEach(s=>{
        const k=s.category||'기타';
        if(!order.includes(k)) order.push(k);
        if(s.level==='na') return;
        if(!cmap.has(k)) cmap.set(k,{name:k,score:0,max:0});
        const c=cmap.get(k);
        c.score+=Number(s.score||0);
        c.max+=Number(s.max||0);
      });
      const newCats=order.filter(k=>cmap.has(k)).map(k=>{
        const c=cmap.get(k);
        return {name:k,score:c.score,max:c.max,achievement:c.max>0?Math.round(c.score/c.max*100):0};
      });
      await sb.from('evaluations').update({overall_score:newOverall,categories:newCats}).eq('id',evalId);
      row.overall_score=newOverall;
      row.categories=newCats;
      if(window._lastVertexResult?.[rawKey]){
        window._lastVertexResult[rawKey].overall_score=newOverall;
        window._lastVertexResult[rawKey].categories=newCats;
      }
    }
    if(typeof showToast==='function') showToast(`저장됨 (${field==='score'?'점수':field==='analysis'?'분석':'솔루션'})`,'#10b981');
    // ── 화면 반영 ──────────────────────────────────
    // ⚠ 여기서 전체 재렌더(renderAnalysisResult)를 부르면 표 DOM 이 통째로 교체된다.
    //    그러면 사장님이 다음 칸을 이어서 수정하는 중에 입력이 날아가고 blur 도 안 걸려
    //    '첫 칸만 저장되는' 현상이 생긴다. → 바뀐 부분만 제자리에서 갱신한다.
    if(field==='score'){
      try{ repaintScorePill(which,subIdx,subs[subIdx].score,subs[subIdx].max||5); }catch(_){}
      try{ repaintScoreSummary(which,row.overall_score); }catch(_){}
      try{ scheduleGraphRefresh(); }catch(_){}
    }
  }catch(e){
    console.error('saveSubScoreEdit exception:',e);
    if(typeof showToast==='function') showToast('저장 중 오류','#ef4444');
  }
}
// 분석 결과 상단 헤더 세팅
// · 위쪽 별도 행 (an-result-meta-top): 강사 / 팀 / 직군 — 검정 테두리 chip
// · 헤더 바 내부 (an-result-meta): 교육종류 — 테두리 없음 (분위기·영상보기도 헤더 안 테두리 없는 스타일)
function setAnResultMeta(opts){
  const titleEl=el('an-result-title');
  if(titleEl) titleEl.textContent=(opts?.title||'—');
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // 헤더 바 안쪽 (테두리 없음, 라벨 없음) — 위쪽 이름·팀·직군 chip과 동일한 글꼴/크기/굵기/색
  const chipInline=(label,val)=>{
    if(!val||String(val).trim()==='') return '';
    return `<span style="display:inline-flex;align-items:center;padding:0 4px;background:transparent;font-size:15px;font-weight:800;color:var(--t1);white-space:nowrap;line-height:1.2">${esc(val)}</span>`;
  };
  // 헤더 바 위쪽 (검정 테두리 chip)
  const chipBordered=(label,val)=>{
    if(!val||String(val).trim()==='') return '';
    return `<span style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:999px;background:transparent;border:1.5px solid #000;font-size:12.5px;font-weight:700;color:#000;white-space:nowrap;line-height:1.2"><span style="font-weight:800">${label}</span><span style="font-weight:700">${esc(val)}</span></span>`;
  };
  const metaEl=el('an-result-meta');
  if(metaEl){
    metaEl.innerHTML=chipInline('교육종류',opts?.eduType);
  }
  const topEl=el('an-result-meta-top');
  if(topEl){
    // 이름 · 팀 · 직군 — 테두리 없이 제목(바스에어 테스트)과 동일한 글씨체/크기/색
    // (15px · 800 · var(--t1))
    const parts=[opts?.userName,opts?.team,opts?.position].filter(v=>v&&String(v).trim()!=='').map(esc);
    if(parts.length){
      topEl.innerHTML=`<span style="display:inline-flex;align-items:center;gap:10px;font-size:15px;font-weight:800;color:var(--t1);white-space:nowrap;line-height:1.2">${parts.join('<span style="color:var(--t1);font-weight:800">·</span>')}</span>`;
    } else {
      topEl.innerHTML='';
    }
  }
}

/* ════════════════════════════════
   INIT
════════════════════════════════ */
// Cold Start 워밍업 제거됨 — /api/auth/login warmup ping 이 400 Bad Request 콘솔 에러 발생시킴
// 첫 실제 로그인 시 cold start 부담은 미미하므로 워밍업 불필요
// (필요 시 별도 /api/health 엔드포인트 만들어 OK 응답으로 변경 가능)

// (제거) 사진 lazy 로드 ensurePhotoMerge — /api/db/load 가 photo 다시 포함하므로 불필요

// Override showPage for profile (재귀 방지: _renderingMyProfile 가드)
// + 브라우저 history 통합 — 일반 브라우저 ←/→ 버튼과 모바일 스와이프·마우스 4번 버튼·Alt+← 모두 지원
const _showPage=showPage;
let _renderingMyProfile=false;
window._navigatingFromHistory=false;
const _historyIgnored=new Set(['page-login','page-register']);
window.showPage=function(id){
  if(id==='page-myprofile' && !_renderingMyProfile){
    _renderingMyProfile=true;
    try{ renderMyProfile(); }finally{ _renderingMyProfile=false; }
    return;
  }
  // 브라우저 history 푸시 — popstate 로 인한 호출이거나, 같은 페이지면 skip
  if(!window._navigatingFromHistory && !_historyIgnored.has(id)){
    const currentState = history.state || {};
    if(currentState.pageId !== id){
      try{ history.pushState({pageId:id}, '', '#'+id); }catch(_){}
    }
  }
  _showPage(id);
};
// 브라우저 ← / → 또는 모바일 스와이프 → popstate
window.addEventListener('popstate', (e)=>{
  const pageId = e.state?.pageId;
  if(!pageId) return;
  window._navigatingFromHistory=true;
  try{ window.showPage(pageId); }finally{ window._navigatingFromHistory=false; }
});

window.addEventListener('load',async ()=>{
  // 초기 history state — 첫 페이지에 pageId 부여 (없으면 popstate 첫 클릭 시 무시됨)
  try{
    const active = document.querySelector('.page.active')?.id || 'page-pick';
    if(!history.state || !history.state.pageId){
      history.replaceState({pageId:active}, '', '#'+active);
    }
  }catch(_){}
  if(CU){
    setupRealtime();  // W4: 자동 복원 시점에도 Realtime 연결
    // ① 즉시 마지막 페이지 표시 (껍데기만 — 데이터는 비어있음)
    const lastPage=localStorage.getItem('ib_last_page');
    let ctx=null;
    try{const s=localStorage.getItem('ib_last_ctx'); if(s) ctx=JSON.parse(s);}catch(_){}
    const initialPage=(lastPage && lastPage!=='page-login' && lastPage!=='page-register')?lastPage:'page-pick';
    // 단순 페이지(데이터 의존 없는 것)는 즉시 표시
    if(['page-pick','page-edu','page-myprofile','page-aicoach','page-streaming'].includes(initialPage)){
      try{ showPage(initialPage); }catch(_){ showPage('page-pick'); }
    } else {
      // 데이터 필요한 페이지(영상·강사·관리자) 는 일단 page-pick 표시 후 데이터 로드 끝나면 전환
      showPage('page-pick');
    }
    // ② Staged 로딩: core(즉시 필요) → content(백그라운드)
    loadFromDB('core').then(()=>{
      if(CU?.id && !CU?.isAdmin){ const fresh=D.users.find(x=>x.id===CU.id); if(fresh){CU=fresh; if(CU.isSubAdmin) CU.isAdmin=true;} }
      initHome();
      // 데이터가 있어야 하는 페이지를 마지막에 보고 있었다면 지금 정밀 복원
      if(lastPage && lastPage!=='page-login' && lastPage!=='page-register' && lastPage!==initialPage){
        try{
          if(lastPage==='page-analysis' || lastPage==='page-video'){
            if(ctx && ctx.type==='video' && ctx.id && typeof openVideo==='function') openVideo(ctx.id);
          } else if(lastPage==='page-voice'){
            if(ctx && ctx.type==='voice' && ctx.id && typeof openVoiceResult==='function'){
              openVoiceResult(ctx.id); showPage('page-voice');
            } else { showPage('page-voice'); }
          } else if(lastPage==='page-lecturer'){
            if(ctx && ctx.type==='lecturer' && ctx.id && typeof openLecturer==='function'){
              openLecturer(ctx.id, ctx.fromPage||'page-pick');
            } else if(CU?.id){ openLecturer(CU.id,'page-pick'); }
          } else if(lastPage==='page-dashboard'){
            showPage('page-pick');
          } else if(lastPage==='page-admin'){
            renderAdmin(); showPage('page-admin');
          } else { showPage(lastPage); }
        }catch(e){console.error('F5 복원 실패:',e);}
      } else if(initialPage==='page-pick' && typeof renderPick==='function'){
        try{renderPick();}catch(_){}
      }
      // content 는 백그라운드 (인터PICK·교육콘텐츠·체크리스트 등)
      loadFromDB('content').then(()=>{
        const cur=document.querySelector('.page.active')?.id||'';
        if(cur==='page-pick' && typeof renderPick==='function') try{renderPick();}catch(_){}
        if(cur==='page-edu' && typeof renderEduPage==='function') try{renderEduPage();}catch(_){}
      }).catch(e=>console.warn('백그라운드 content 로드 실패:',e));
      // photo lazy 로드
      loadUserPhotosLazy(true).catch(e=>console.warn('photo lazy:',e));
    }).catch(e=>{console.warn('F5 core 로드 실패:',e);});
  } else {
    // 조직 분리 — 로그인은 조직별 전용 페이지에서만 (login.html 에서 조직 선택)
    hideGlobalSidebar();
    location.replace('login.html');
  }
});
