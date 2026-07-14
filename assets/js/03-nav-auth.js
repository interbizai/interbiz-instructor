/* 03-nav-auth.js — 라우팅(showPage) + 로그인/로그아웃 + 알림 + PWA
   (index.html 5407~6226행에서 분리 · 로드 순서 유지 필수) */
/* ════════════════════════════════
   ROUTING
════════════════════════════════ */
function showPage(id){
  // 페이지 전환 시각 신호 — 짧게 progress 띄움
  startProgress();
  setTimeout(endProgress, 220);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  window.scrollTo(0,0);
  // 페이지 기억 (F5 복원용)
  if(id!=='page-login'&&id!=='page-register') localStorage.setItem('ib_last_page',id);
  // 컨텍스트가 필요없는 페이지로 이동 시 → 이전 컨텍스트 클리어
  // (page-analysis/page-video/page-voice/page-lecturer 는 open*() 함수가 별도로 ctx 저장)
  const ctxPages=['page-analysis','page-video','page-voice','page-lecturer'];
  if(!ctxPages.includes(id)){
    try{localStorage.removeItem('ib_last_ctx');}catch(_){}
  }
  // 상단 네비 표시/숨김
  const noNav=['page-login','page-register'];
  const tn=document.getElementById('topnav');
  const mn=document.getElementById('mobile-nav');
  if(noNav.includes(id)){
    if(tn) tn.classList.remove('show');
    if(mn) mn.style.display='none';
    hideRightPanel();
  } else if(CU){
    if(tn) tn.classList.add('show');
    if(mn) mn.style.display='';
    updateTopNav(id);
    // (page-home 삭제됨 — 항상 right panel 표시)
    showRightPanel();
  }
  try{ _ensureDemoToggle(); }catch(_){}
  // 헤더 숨기기 (topnav가 대체)
  const page=document.getElementById(id);
  if(page && !noNav.includes(id)){
    page.querySelectorAll('.hdr').forEach(h=>h.style.display='none');
  }
  if(CU) try{updateHeaderUI();}catch(e){}
  if(id==='page-edu') try{renderEduPage();}catch(e){}
  if(id==='page-pick') try{renderPick();}catch(e){console.error('renderPick:',e);}
}
/* ── Sidebar Toggle ── */
let sidebarVisible=true;
const pageLabels={'page-pick':'인터PICK','page-streaming':'영상 스트리밍','page-analysis':'영상등록 분석','page-lecturer':'내페이지','page-voice':'음성분석','page-edu':'교육콘텐츠','page-admin':'관리자','page-video':'영상 분석','page-myprofile':'프로필','page-scenario':'시나리오 코치','page-calendar':'달력'};

function toggleSidebar(){
  sidebarVisible=!sidebarVisible;
  document.querySelectorAll('.dash-layout').forEach(dl=>{
    dl.classList.toggle('sidebar-hidden',!sidebarVisible);
  });
  // 페이지 라벨 표시/숨기기
  document.querySelectorAll('.hdr-page-label').forEach(lbl=>{
    lbl.style.display=sidebarVisible?'none':'';
  });
}

function addBurgerToHeaders(){
  document.querySelectorAll('.hdr-logo').forEach(logo=>{
    if(logo.querySelector('.sidebar-toggle')) return;
    // 홈, 로그인, 회원가입 페이지에는 안 넣기
    const pageId=logo.closest('.page')?.id||'';
    if(['page-login','page-register'].includes(pageId)) return;
    const btn=document.createElement('button');
    btn.className='sidebar-toggle';
    btn.onclick=toggleSidebar;
    btn.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    logo.insertBefore(btn,logo.firstChild);
    // 페이지 라벨 (사이드바 숨겼을 때 표시)
    const activePage=logo.closest('.page')?.id||'';
    const label=document.createElement('span');
    label.className='hdr-page-label';
    label.style.cssText='font-size:15px;font-weight:700;color:var(--t1);display:none';
    label.textContent=pageLabels[activePage]||'';
    logo.appendChild(label);
  });
}

/* ── Top Navigation Logic ── */
function updateTopNav(activePage){
  // active 상태 업데이트
  const pageMap={'page-pick':'page-pick','page-analysis':'page-aicoach','page-streaming':'page-aicoach','page-voice':'page-aicoach','page-scenario':'page-aicoach','page-edu':'page-edu','page-lecturer':'page-lecturer','page-myprofile':'page-lecturer','page-admin':'page-admin'};
  const activeMenu=pageMap[activePage]||'';
  document.querySelectorAll('.tn-item').forEach(it=>{
    it.classList.toggle('active',it.dataset.page===activeMenu||it.dataset.page===activePage);
  });
  // 관리자 헤더 뱃지(삭제 요청 카운트는 그대로 — 강사한테는 미사용)
  const cnt=(D.deleteRequests||[]).filter(r=>r.status==='pending').length;
  const notifDot=document.getElementById('tn-notif-dot');
  if(notifDot) notifDot.style.display=(CU?.isAdmin&&cnt)?'block':'none';
  // 알림 메뉴 — 로그인된 모든 사용자에게 노출 (강사+관리자 통합 알림 패널 진입)
  // 진짜 관리자(env 로그인)는 CU.id가 없을 수 있어 CU 자체로 검사
  const ddNotif=document.getElementById('tn-dd-notif');
  if(ddNotif) ddNotif.style.display=CU?'flex':'none';
  // 미읽음 카운트는 refreshNotifBadge가 .hdr-notif-badge 자동 갱신
  // 프로필 업데이트
  const u=D.users?.find(x=>x.id===CU?.id);
  const isRA2=CU?.isAdmin&&!CU?.isSubAdmin;
  const photo=isRA2?'assets/logo/3.png':(u?.photo||CU?.photo||'');
  const pEl=document.getElementById('tn-profile-photo');
  if(pEl){pEl.innerHTML=photo?`<img src="${photo}">`:(CU?.name?CU.name[0]:'?');}
  const nEl=document.getElementById('tn-profile-name');
  const isRealAdmin=CU?.isAdmin&&!CU?.isSubAdmin;
  if(nEl) nEl.textContent=isRealAdmin?'관리자':(CU?.name||'—');
  const sEl=document.getElementById('tn-profile-sub');
  if(sEl) sEl.textContent=isRealAdmin?'interbiz':(u?[u.office,u.team,u.position].filter(Boolean).join(' · '):'—');
}
// 검색
function toggleTopSearch(){
  const ov=document.getElementById('tn-search-overlay');
  ov.classList.toggle('show');
  if(ov.classList.contains('show')){
    document.getElementById('tn-search-input')?.focus();
  } else {
    document.getElementById('tn-search-input').value='';
    document.getElementById('tn-search-results').innerHTML='';
  }
}
// 바깥 클릭 시 검색 닫기
document.addEventListener('click',function(e){
  const ov=document.getElementById('tn-search-overlay');
  const btn=document.querySelector('.tn-search-btn');
  if(ov&&ov.classList.contains('show')&&!ov.contains(e.target)&&!btn?.contains(e.target)){
    ov.classList.remove('show');
    document.getElementById('tn-search-input').value='';
    document.getElementById('tn-search-results').innerHTML='';
  }
});
function topSearchHandler(q){
  const res=document.getElementById('tn-search-results');
  if(!res) return;
  if(!q){res.innerHTML='';return;}
  const ql=q.toLowerCase();
  const colors=['#E21E26','#0078C8','#10b981','#f59e0b','#8b5cf6','#ec4899'];
  let html='';

  // 1. 강사 검색 (이름, 팀, 소속)
  const users=(D.users||[]).filter(u=>u.name?.includes(q)||u.team?.includes(q)||u.channel?.includes(q));
  if(users.length){
    html+=`<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">강사 (${users.length})</div>`;
    html+=users.slice(0,5).map((u,i)=>`<div class="tn-dd-item" onclick="openLecturer(${u.id},'page-pick');toggleTopSearch()">
      <div style="width:28px;height:28px;border-radius:50%;background:${colors[i%6]};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;overflow:hidden;flex-shrink:0">${u.photo?'<img src="'+u.photo+'" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">':u.name[0]}</div>
      <div><div style="font-weight:700">${u.name}</div><div style="font-size:10px;color:var(--t3)">${[u.office,u.team,u.position].filter(Boolean).join(' · ')}</div></div>
    </div>`).join('');
  }

  // 2. 영상 검색 (가전, 제목)
  const vids=(D.videos||[]).filter(v=>{
    const vt=(v.videoType||v.video_type||'').toLowerCase();
    const title=(v.title||'').toLowerCase();
    return vt.includes(ql)||title.includes(ql);
  });
  if(vids.length){
    html+=`<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-top:6px;border-top:1px solid rgba(0,0,0,.06)">영상 평가 (${vids.length})</div>`;
    html+=vids.slice(0,5).map(v=>{
      const u=D.users?.find(x=>x.id===v.userId);
      return `<div class="tn-dd-item" onclick="openVideo(${v.id});toggleTopSearch()">
        <div style="width:28px;height:28px;border-radius:8px;background:var(--blue);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
        <div><div style="font-weight:700">${v.title||'—'} <span style="font-size:10px;color:var(--t3);font-weight:400">${v.videoType||v.video_type||''}</span></div><div style="font-size:10px;color:var(--t3)">${u?.name||'—'} · ${v.date||''}</div></div>
      </div>`;
    }).join('');
  }

  // 3. 음성 평가 검색 (분위기, 가전)
  const voices=(D.voiceEvals||[]).filter(ve=>{
    const tone=(ve.tone||'').toLowerCase();
    const prod=((ve.result_data?.product)||'').toLowerCase();
    const title=(ve.title||'').toLowerCase();
    return tone.includes(ql)||prod.includes(ql)||title.includes(ql);
  });
  if(voices.length){
    html+=`<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-top:6px;border-top:1px solid rgba(0,0,0,.06)">음성 평가 (${voices.length})</div>`;
    html+=voices.slice(0,5).map(v=>`<div class="tn-dd-item" onclick="openVoiceResult(${v.id});toggleTopSearch()">
      <div style="width:28px;height:28px;border-radius:8px;background:var(--purple);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg></div>
      <div><div style="font-weight:700">${v.title||'—'} <span style="font-size:10px;color:var(--t3);font-weight:400">${v.tone||''}</span></div><div style="font-size:10px;color:var(--t3)">${v.user_name||'—'} · ${v.eval_date||''}</div></div>
    </div>`).join('');
  }

  // 4. 팀 검색 (팀 이름으로 해당 팀 전체 목록)
  if(!users.length && !vids.length && !voices.length){
    html='<div style="padding:16px;text-align:center;font-size:12px;color:var(--t3)">검색 결과가 없습니다</div>';
  }
  res.innerHTML=html;
}
// Mobile AI dropdown
function toggleMobileAI(e){
  e.stopPropagation();
  const dd=document.getElementById('mob-ai-dropdown');
  dd.classList.toggle('show');
}
function closeMobAI(){document.getElementById('mob-ai-dropdown')?.classList.remove('show');}
document.addEventListener('click',function(){closeMobAI();});
// 호환용 빈 함수
function showGlobalSidebar(){}
function hideGlobalSidebar(){}
function renderGlobalSidebar(){}
function toggleGlobalSidebar(){}
function openMobileSidebar(){}
function closeMobileSidebar(){}
/* ── Right Panel (추천영상) ── */
let rPanelOpen=false;
function toggleRightPanel(){
  const panel=document.getElementById('r-panel');
  const toggle=document.getElementById('r-panel-toggle');
  const gm=document.getElementById('g-main');
  const icon=document.getElementById('r-toggle-icon');
  rPanelOpen=!rPanelOpen;
  panel.classList.toggle('hidden',!rPanelOpen);
  toggle.classList.toggle('shifted',rPanelOpen);
  gm.classList.toggle('has-panel',rPanelOpen);
  if(icon) icon.innerHTML=rPanelOpen?'<polyline points="9 18 15 12 9 6"/>':'<polyline points="15 18 9 12 15 6"/>';
}
function showRightPanel(){
  const panel=document.getElementById('r-panel');
  const toggle=document.getElementById('r-panel-toggle');
  if(panel) panel.style.display='flex';
  if(toggle) toggle.style.display='flex';
  renderRecommendedVideos();
}
function hideRightPanel(){
  const panel=document.getElementById('r-panel');
  const toggle=document.getElementById('r-panel-toggle');
  const gm=document.getElementById('g-main');
  if(panel){panel.style.display='none';panel.classList.add('hidden');}
  if(toggle){toggle.style.display='none';toggle.classList.remove('shifted');}
  if(gm) gm.classList.remove('has-panel');
  rPanelOpen=false;
}
function renderRecommendedVideos(){
  const body=document.getElementById('r-panel-body');
  if(!body) return;
  const isAdmin=CU?.isAdmin;
  let html='';
  // 관리자: 영상 추가 버튼
  if(isAdmin){
    html+=`<div style="margin-bottom:12px">
      <button class="btn btn-blue" style="width:100%;padding:10px;font-size:12px" onclick="openRecVideoModal()">+ 영상 추가</button>
    </div>`;
  }
  // 추천영상 목록 (DB)
  const recVids=D.recVideos||[];
  if(recVids.length){
    html+=recVids.map(v=>{
      const ytId=v.url?.match(/[?&]v=([^&]+)/)?.[1]||v.url?.match(/youtu\.be\/([^?]+)/)?.[1]||'';
      const thumb=ytId?`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`:(v.thumbnail||'');
      const onclick=v.url?`window.open('${v.url}','_blank')`:(v.file_url?`window.open('${v.file_url}','_blank')`:'');
      return `<div class="r-vid-card" style="position:relative" onclick="${onclick}">
        ${isAdmin?`<button style="position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;z-index:2" onclick="event.stopPropagation();deleteRecVideo(${v.id})">×</button>`:''}
        <div class="r-vid-thumb">${thumb?`<img src="${thumb}" loading="lazy" decoding="async">`:'<span style="font-size:11px">미리보기 없음</span>'}<div class="r-vid-play"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21"/></svg></div></div>
        <div class="r-vid-info"><div class="r-vid-title">${v.title||'—'}</div><div class="r-vid-meta">${v.created_by||'관리자'} · ${v.created_at?.slice(0,10)||''}</div></div>
      </div>`;
    }).join('');
  } else {
    html+='<div style="padding:30px;text-align:center;font-size:12px;color:var(--t3)">등록된 추천 영상이 없습니다</div>';
  }
  body.innerHTML=html;
}
// 추천영상 추가 모달
function openRecVideoModal(){
  const html=`<div style="padding:20px">
    <div style="font-size:16px;font-weight:800;margin-bottom:16px">추천 영상 추가</div>
    <div style="margin-bottom:10px"><label style="font-size:12px;font-weight:700;color:var(--t3);display:block;margin-bottom:4px">제목</label><input type="text" id="rec-title" class="form-input" placeholder="영상 제목"></div>
    <div style="margin-bottom:10px"><label style="font-size:12px;font-weight:700;color:var(--t3);display:block;margin-bottom:4px">YouTube/영상 링크</label><input type="text" id="rec-url" class="form-input" placeholder="https://youtube.com/..."></div>
    <div style="margin-bottom:10px"><label style="font-size:12px;font-weight:700;color:var(--t3);display:block;margin-bottom:4px">또는 파일 업로드</label>
      <input type="file" id="rec-file" accept="video/*" style="font-size:12px">
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-blue" style="flex:1" onclick="saveRecVideo()">등록</button>
      <button class="btn btn-ghost" style="flex:1" onclick="closeOverlay('rec-video-overlay')">취소</button>
    </div>
  </div>`;
  let ov=document.getElementById('rec-video-overlay');
  if(!ov){ov=document.createElement('div');ov.id='rec-video-overlay';ov.className='overlay';document.body.appendChild(ov);}
  ov.innerHTML=`<div class="modal modal-sm" style="width:400px">${html}</div>`;
  ov.classList.add('show');
}
async function saveRecVideo(){
  const title=document.getElementById('rec-title')?.value?.trim();
  const url=document.getElementById('rec-url')?.value?.trim();
  const file=document.getElementById('rec-file')?.files?.[0];
  if(!title){alert('제목을 입력하세요');return;}
  let fileUrl='';
  if(file){
    const ext2=file.name.split('.').pop()||'mp4';
    const path=`rec_videos/${Date.now()}.${ext2}`;
    const{error:ue}=await sb.storage.from('files').upload(path,file);
    if(ue){alert('파일 업로드 실패');return;}
    const{data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
    fileUrl=publicUrl;
  }
  await sb.from('recommended_videos').insert({title,url:url||null,file_url:fileUrl||null,created_by:CU?.name||'관리자',org_name:curOrg()});
  await loadFromDB();
  closeOverlay('rec-video-overlay');
  renderRecommendedVideos();
}
async function deleteRecVideo(id){
  if(!confirm('이 추천 영상을 삭제하시겠습니까?'))return;
  await sb.from('recommended_videos').delete().eq('id',id);
  await loadFromDB();
  renderRecommendedVideos();
}
// 기존 호환용 (빈 함수)
function injectSidebar(){}
const sidebarPages=[];

function updateHeaderUI(){
  const now=new Date();
  const monthTxt=`${now.getFullYear()}년 ${now.getMonth()+1}월`;
  document.querySelectorAll('.hdr-month').forEach(e=>{e.textContent=monthTxt;e.style.cursor='pointer';e.onclick=()=>openCalendar();});
  // image.png 가 실제 파일 없어 404 발생 → 관리자도 일반 photo 또는 initial 사용
  const photo=(()=>{const u=D.users.find(x=>x.id===CU?.id);return u?.photo||CU?.photo||'';})();
  const initial=CU?.name?CU.name[0]:'?';
  document.querySelectorAll('.hdr-av').forEach(av=>{
    if(photo){av.innerHTML=`<img src="${photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;av.style.overflow='hidden';}
    else av.textContent=initial;
  });
  // 드롭다운 이름/소속
  const u=D.users.find(x=>x.id===CU?.id);
  const isRA=CU?.isAdmin&&!CU?.isSubAdmin;
  const userName=isRA?'관리자':(CU?.name||'—');
  const userSub=isRA?'interbiz':(u?[u.office,u.team,u.position].filter(Boolean).join(' · '):(CU?.email||'—'));
  document.querySelectorAll('.hdr-user-name').forEach(e=>e.textContent=userName);
  document.querySelectorAll('.hdr-user-sub').forEach(e=>e.textContent=userSub);
  // 관리자 버튼: 관리자 로그인일 때만 표시
  document.querySelectorAll('.hdr-admin-btn').forEach(btn=>{
    btn.style.display=CU?.isAdmin?'':'none';
  });
  // 모든 헤더 로고 클릭 → 홈
  document.querySelectorAll('.hdr-logo img').forEach(img=>{
    img.style.cursor='pointer';
    img.onclick=()=>showPage('page-pick');
  });
  // 관리자 알림 뱃지 (비관리자는 숨김)
  document.querySelectorAll('.notif-btn').forEach(b=>b.style.display=CU?.isAdmin?'flex':'none');
  if(CU?.isAdmin){
    const pendingCount=(D.deleteRequests||[]).filter(r=>r.status==='pending').length;
    document.querySelectorAll('.hdr-right').forEach(hr=>{
      if(hr.querySelector('.notif-btn')) return;
      const btn=document.createElement('button');
      btn.className='notif-btn';
      btn.style.display='flex';
      btn.onclick=()=>openNotifications();
      btn.innerHTML=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>${pendingCount?`<span class="notif-badge">${pendingCount}</span>`:''}`;
      const firstBtn=hr.querySelector('.btn');
      if(firstBtn) hr.insertBefore(btn,firstBtn);
      else hr.appendChild(btn);
    });
    // 기존 뱃지 업데이트
    document.querySelectorAll('.notif-badge').forEach(b=>b.textContent=pendingCount||'');
    document.querySelectorAll('.notif-badge').forEach(b=>b.style.display=pendingCount?'flex':'none');
  }
  // 모바일 네비 active
  const mNavMap={'page-pick':0,'page-analysis':1,'page-streaming':1,'page-voice':1,'page-edu':2,'page-lecturer':3,'page-myprofile':3,'page-admin':4};
  document.querySelectorAll('.mobile-nav-item').forEach((item,i)=>{
    const activePageEl=document.querySelector('.page.active');
    item.classList.toggle('active',i===(mNavMap[activePageEl?.id]??-1));
  });
}

/* ════════════════════════════════
   AUTH
════════════════════════════════ */
// ── 로그인 캐릭터 애니메이션 ──
let _loginMouseX=0,_loginMouseY=0,_loginFocusState='none';
document.addEventListener('mousemove',e=>{_loginMouseX=e.clientX;_loginMouseY=e.clientY;updateLoginPupils();});

function updateLoginPupils(){
  if(_loginFocusState==='pw') return;
  // 눈동자 — 더 민감하게
  document.querySelectorAll('.login-pupil').forEach(p=>{
    const rect=p.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    const dx=_loginMouseX-cx, dy=_loginMouseY-cy;
    const dist=Math.min(Math.sqrt(dx*dx+dy*dy),6);
    const angle=Math.atan2(dy,dx);
    p.style.transform=`translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px)`;
  });
  // 몸통 기울기 — 더 민감하게
  const chars=[
    {id:'char-purple',baseLeft:0.15},
    {id:'char-black',baseLeft:0.42},
    {id:'char-orange',baseLeft:0.05},
    {id:'char-yellow',baseLeft:0.7}
  ];
  chars.forEach(c=>{
    const el2=document.getElementById(c.id);
    if(!el2) return;
    const rect=el2.getBoundingClientRect();
    const cx=rect.left+rect.width/2;
    const dx=_loginMouseX-cx;
    const skew=Math.max(-8,Math.min(8,-dx/80));
    el2.style.transform=`skewX(${skew}deg)`;
  });
}

function loginCharsFocus(field){
  _loginFocusState=field;
  if(field==='pw'){
    // 비밀번호: 캐릭터들이 위를 보거나 딴 곳 봄
    document.querySelectorAll('.login-pupil').forEach(p=>{p.style.transform='translate(-3px,-3px)';});
    const purple=document.getElementById('char-purple');
    if(purple) purple.style.transform='skewX(-8deg) translateX(20px)';
  } else if(field==='email'){
    // 이메일: 오른쪽(로그인 폼) 쪽을 봄
    document.querySelectorAll('.login-pupil').forEach(p=>{p.style.transform='translate(3px,2px)';});
  }
}

function loginCharsBlur(){
  _loginFocusState='none';
  const purple=document.getElementById('char-purple');
  if(purple) purple.style.transform='skewX(0deg)';
  updateLoginPupils();
}

// 깜빡임
(function loginBlink(){
  function blink(eyesId){
    const container=document.getElementById(eyesId);
    if(!container) return;
    const eyes=container.querySelectorAll('div[style*="border-radius:50%"][style*="background:#fff"]');
    eyes.forEach(e=>{e.style.height='2px';e.style.overflow='hidden';});
    setTimeout(()=>{eyes.forEach(e=>{e.style.height='';e.style.overflow='';});},150);
  }
  setInterval(()=>blink('eyes-purple'),3000+Math.random()*4000);
  setInterval(()=>blink('eyes-black'),3500+Math.random()*3500);
})();

// 모바일: 캐릭터 영역 숨김
const loginCharsEl=document.getElementById('login-chars');
if(loginCharsEl&&window.innerWidth<900) loginCharsEl.style.display='none';
window.addEventListener('resize',()=>{
  const lc=document.getElementById('login-chars');
  if(lc) lc.style.display=window.innerWidth<900?'none':'flex';
  const loginGrid=lc?.parentElement;
  if(loginGrid) loginGrid.style.gridTemplateColumns=window.innerWidth<900?'1fr':'1fr 1fr';
});

function showLoginLoading(textOverride){
  const text=textOverride||'로그인 중';
  let lo=document.getElementById('login-loading');
  if(!lo){
    lo=document.createElement('div');
    lo.id='login-loading';
    lo.className='login-loading';
    document.body.appendChild(lo);
  }
  lo.innerHTML=`<div class="login-loading-card"><div class="login-loading-logo"><img src="assets/logo/파비콘/1-Photoroom.ico" alt="interbiz" onerror="this.parentElement.innerHTML='<div style=&quot;font-weight:900;font-size:28px;color:var(--blue)&quot;>ii</div>'"></div><div class="login-loading-text">${text}<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div></div>`;
  lo.classList.add('show');
}
function hideLoginLoading(){
  const lo=document.getElementById('login-loading');
  if(lo) lo.classList.remove('show');
}
async function doLogin(){
  const em=v('li-email').trim(), pw=v('li-pw').trim();
  if(!em||!pw){ el('li-err').textContent='이메일과 비밀번호를 입력해주세요.'; return; }
  showLoginLoading();
  let r;
  try{
    r=await fetchWithRetry('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password:pw})});
  }catch(e){ hideLoginLoading(); el('li-err').textContent='네트워크 오류'; return; }
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok){ hideLoginLoading(); el('li-err').textContent=j.error||'로그인 실패'; return; }
  el('li-err').textContent='';
  localStorage.setItem('ib_token',j.token);
  localStorage.removeItem('ib_active_org');
  D.activeOrg=null;
  // ① 토큰만 받으면 즉시 CU 설정 + 메인 표시 (DB 로드는 백그라운드)
  CU=j.user;
  if(CU?.isSubAdmin) CU.isAdmin=true;
  saveStoredUser(CU);
  hideLoginLoading();
  initHome(); showPage('page-pick');
  startNotifPolling();
  setupRealtime();  // W4: 다른 사용자 변경 즉시 인지
  // ② Staged 로딩: core(즉시 필요) → content(백그라운드)
  loadFromDB('core').then(()=>{
    if(j.user?.id !== 0){
      const fresh=D.users.find(x=>x.id===j.user.id);
      if(fresh){
        CU=fresh;
        if(CU?.isSubAdmin) CU.isAdmin=true;
        saveStoredUser(CU);
      }
    }
    if(typeof refreshOrgSwitch==='function') refreshOrgSwitch();
    if(typeof refreshAdminVisibility==='function') refreshAdminVisibility();
    if(typeof renderPick==='function') try{renderPick();}catch(_){}
    // content 는 백그라운드 (인터PICK 의 추천 콘텐츠·학습링크·체크리스트 등)
    loadFromDB('content').then(()=>{
      if(typeof renderPick==='function') try{renderPick();}catch(_){}
    }).catch(e=>console.warn('백그라운드 content 로드 실패:',e));
    // photo lazy 로드 (504 방지 — base64 사진은 메인 페이로드에 안 넣음)
    loadUserPhotosLazy(true).catch(e=>console.warn('photo lazy:',e));
  }).catch(e=>{console.warn('core 로드 실패:',e);});
}
function doLogout(){ CU=null; localStorage.removeItem('ib_user'); localStorage.removeItem('ib_token'); localStorage.removeItem('ib_last_page'); localStorage.removeItem('ib_active_org'); hideGlobalSidebar(); if(window._notifBadgeTimer){ clearInterval(window._notifBadgeTimer); window._notifBadgeTimer=null; } try{ teardownRealtime(); }catch(_){} location.replace('login.html'); }

/* ════════════════════════════════
   통합 알림 시스템 (notifications)
════════════════════════════════ */
async function dbCreateNotification({userId, type, title, body, link, orgName}){
  if(!userId) return null;
  try{
    const {data,error}=await sb.from('notifications').insert({
      user_id:userId, type:type||'info', title:title||'',
      body:body||null, link:link||null, org_name:orgName||null
    }).select().single();
    if(error){ console.warn('createNotification:',error.message); return null; }
    return data;
  }catch(e){ console.warn('createNotification:',e); return null; }
}
async function dbCreateNotificationsForOrg({orgName, type, title, body, link, excludeUserId}){
  // 같은 조직 모든 강사에게 알림 생성 (excludeUserId는 발신자 본인 제외)
  if(!orgName) return 0;
  const targets=(D.users||[]).filter(u=>!u.deleted && u.orgName===orgName && u.id!==excludeUserId && !u.isAdmin);
  if(!targets.length) return 0;
  const rows=targets.map(u=>({
    user_id:u.id, type:type||'notice', title:title||'', body:body||null, link:link||null, org_name:orgName
  }));
  try{
    const {error}=await sb.from('notifications').insert(rows);
    if(error){ console.warn('createOrgNotifications:',error.message); return 0; }
    return rows.length;
  }catch(e){ console.warn('createOrgNotifications:',e); return 0; }
}
// 업로드 알림 — 같은 조직 관리자·부관리자에게만 (강사 본인 제외)
// kind: 'video' | 'voice' | 'scenario'
async function notifyAdminsOfUpload({kind, title, uploaderId, orgName, link}){
  try{
    const uploader=(D.users||[]).find(u=>u.id===uploaderId);
    const upName=uploader?.name || '강사';
    const upPos=uploader?.position || '현장강사';
    const org=orgName || uploader?.orgName || null;
    if(!org) return 0;
    // 대상: 같은 조직의 부관리자 (관리자 마스터 계정은 알림 X — 모든 조직 보임)
    const targets=(D.users||[]).filter(u=>!u.deleted && u.orgName===org && u.isSubAdmin && u.id!==uploaderId);
    if(!targets.length) return 0;
    const kindLabel = kind==='video'?'영상' : kind==='voice'?'스피치' : kind==='scenario'?'시나리오' : '자료';
    const notifTitle = `${upPos} ${upName}님이 ${kindLabel}을 업로드했습니다`;
    const notifBody  = title ? `"${title.length>40?title.slice(0,40)+'…':title}"` : null;
    const rows=targets.map(u=>({
      user_id:u.id, type:'upload_'+kind, title:notifTitle, body:notifBody,
      link:link||'page-admin', org_name:org
    }));
    const {error}=await sb.from('notifications').insert(rows);
    if(error){ console.warn('notifyAdminsOfUpload:',error.message); return 0; }
    return rows.length;
  }catch(e){ console.warn('notifyAdminsOfUpload:',e); return 0; }
}
async function loadNotifications(){
  if(!CU?.id) return [];
  try{
    const {data}=await sb.from('notifications').select('*').eq('user_id',CU.id).order('created_at',{ascending:false}).limit(50);
    return data||[];
  }catch(e){ return []; }
}
async function refreshNotifBadge(){
  if(!CU?.id || CU.email==='admin'){
    document.querySelector('.avatar-wrap')?.classList.remove('has-notif');
    document.querySelectorAll('.hdr-notif-badge').forEach(b=>{b.style.display='none';b.classList.remove('show');});
    return;
  }
  try{
    const {count}=await sb.from('notifications').select('*',{count:'exact',head:true}).eq('user_id',CU.id).is('read_at',null);
    const n=count||0;
    document.querySelectorAll('.avatar-wrap').forEach(w=>w.classList.toggle('has-notif',n>0));
    document.querySelectorAll('.hdr-notif-badge').forEach(b=>{
      if(n>0){ b.textContent=n>99?'99+':String(n); b.style.display='inline-flex'; b.classList.add('show'); }
      else { b.style.display='none'; b.classList.remove('show'); }
    });
  }catch(e){}
}
function _notifIcon(type){
  const m={
    eval_complete:{bg:'#dbeafe',color:'#0078C8',icon:'✓'},
    new_notice:{bg:'#fef3c7',color:'#d97706',icon:'📢'},
    delete_request:{bg:'#fee2e2',color:'#dc2626',icon:'🗑'},
    permission:{bg:'#d1fae5',color:'#10b981',icon:'🔑'},
  };
  return m[type]||{bg:'#f1f5f9',color:'#475569',icon:'🔔'};
}
function _notifTimeAgo(ts){
  const d=new Date(ts), now=new Date();
  const diff=Math.floor((now-d)/1000);
  if(diff<60) return '방금';
  if(diff<3600) return Math.floor(diff/60)+'분 전';
  if(diff<86400) return Math.floor(diff/3600)+'시간 전';
  if(diff<604800) return Math.floor(diff/86400)+'일 전';
  return d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
}
async function openNotifPanel(){
  document.getElementById('notif-panel-overlay').classList.add('show');
  const list=document.getElementById('notif-panel-list');
  list.innerHTML='<div class="notif-empty">불러오는 중...</div>';
  const items=await loadNotifications();
  const unreadCount=items.filter(x=>!x.read_at).length;
  const unreadEl=document.getElementById('notif-panel-unread');
  const markBtn=document.getElementById('notif-mark-all-btn');
  if(unreadCount>0){ unreadEl.style.display='inline-block'; unreadEl.textContent=unreadCount; markBtn.style.display=''; }
  else { unreadEl.style.display='none'; markBtn.style.display='none'; }
  if(!items.length){
    list.innerHTML='<div class="notif-empty"><div style="font-size:32px;margin-bottom:8px">🔕</div><div>받은 알림이 없습니다.</div></div>';
    return;
  }
  list.innerHTML=items.map(n=>{
    const ico=_notifIcon(n.type);
    const desc=(n.body||'').replace(/</g,'&lt;');
    const onclick=n.link?`onclick="handleNotifClick(${n.id},'${(n.link||'').replace(/'/g,"\\\\'")}')"`:`onclick="markNotifRead(${n.id});this.classList.remove('unread')"`;
    return `<div class="notif-item ${n.read_at?'':'unread'}" ${onclick}>
      <div class="notif-icon" style="background:${ico.bg};color:${ico.color}">${ico.icon}</div>
      <div class="notif-body">
        <div class="notif-title">${(n.title||'').replace(/</g,'&lt;')}</div>
        ${desc?`<div class="notif-desc">${desc}</div>`:''}
        <div class="notif-time">${_notifTimeAgo(n.created_at)}</div>
      </div>
    </div>`;
  }).join('');
}
async function markNotifRead(id){
  try{ await sb.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id); }catch(e){}
  refreshNotifBadge();
}
async function markAllNotifRead(){
  if(!CU?.id) return;
  try{ await sb.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',CU.id).is('read_at',null); }catch(e){}
  document.querySelectorAll('#notif-panel-list .notif-item.unread').forEach(el=>el.classList.remove('unread'));
  document.getElementById('notif-panel-unread').style.display='none';
  document.getElementById('notif-mark-all-btn').style.display='none';
  refreshNotifBadge();
}
async function handleNotifClick(id,link){
  await markNotifRead(id);
  document.getElementById('notif-panel-overlay').classList.remove('show');
  if(link && link.startsWith('page-')) showPage(link);
  else if(link) window.location.href=link;
}
// 30초마다 배지 갱신
if(typeof window._notifBadgeTimer==='undefined') window._notifBadgeTimer=null;
function startNotifPolling(){
  if(window._notifBadgeTimer) clearInterval(window._notifBadgeTimer);
  refreshNotifBadge();
  window._notifBadgeTimer=setInterval(refreshNotifBadge,30000);
}

/* ════════════════════════════════
   PWA 설치 / Service Worker
════════════════════════════════ */
let _pwaDeferredPrompt=null;

// Service Worker 등록 (HTTPS / localhost 만)
if('serviceWorker' in navigator){
  // 이미 SW 제어 중인 페이지에서 새 SW가 제어를 넘겨받으면 = 업데이트 → 자동 1회 새로고침
  // (최초 방문은 controller 가 없어 제외 → 불필요한 새로고침 방지)
  let _swRefreshing=false;
  if(navigator.serviceWorker.controller){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(_swRefreshing) return;
      _swRefreshing=true;
      console.log('[PWA] 새 버전 적용 — 자동 새로고침');
      window.location.reload();
    });
  }
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js').then(reg=>{
      console.log('[PWA] SW 등록 완료', reg.scope);
      // 새 버전 감지 시 자동 활성화
      reg.addEventListener('updatefound',()=>{
        const nw=reg.installing;
        if(!nw) return;
        nw.addEventListener('statechange',()=>{
          if(nw.state==='installed' && navigator.serviceWorker.controller){
            console.log('[PWA] 새 버전 활성화');
            nw.postMessage('SKIP_WAITING');
          }
        });
      });
    }).catch(e=>console.warn('[PWA] SW 등록 실패:',e));
  });
}

// Android Chrome — 자동 설치 프롬프트 캐시
window.addEventListener('beforeinstallprompt',(e)=>{
  e.preventDefault();
  _pwaDeferredPrompt=e;
  // 모바일 + 미설치 + 미차단 일 때 배너 노출
  if(_isMobile() && !_isStandalone() && !localStorage.getItem('pwa_install_dismissed')){
    setTimeout(()=>{
      const b=document.getElementById('pwa-install-banner');
      if(b) b.classList.add('show');
    },2000);
  }
});

// iOS — Safari 만 설치 가능, 자동 프롬프트 없음 → 안내 모달 노출
window.addEventListener('load',()=>{
  if(!_isIOS() || _isStandalone()) return;
  if(localStorage.getItem('pwa_install_dismissed')) return;
  setTimeout(()=>{
    const b=document.getElementById('pwa-install-banner');
    if(b) b.classList.add('show');
  },3000);
});

function _isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function _isAndroid(){
  return /Android/i.test(navigator.userAgent);
}
function _isMobile(){
  return _isIOS() || _isAndroid();
}
function _isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// 설치 버튼 클릭
async function pwaInstall(){
  // Android — 네이티브 프롬프트
  if(_pwaDeferredPrompt){
    _pwaDeferredPrompt.prompt();
    const {outcome}=await _pwaDeferredPrompt.userChoice;
    console.log('[PWA] 설치 결과:',outcome);
    _pwaDeferredPrompt=null;
    pwaDismiss();
    return;
  }
  // iOS — Safari 안내 모달
  if(_isIOS()){
    document.getElementById('pwa-install-banner').classList.remove('show');
    document.getElementById('pwa-ios-modal').classList.add('show');
    return;
  }
  // 그 외 — 안내 토스트
  alert('이 브라우저에서는 자동 설치가 지원되지 않습니다. Safari(iOS) 또는 Chrome(Android) 에서 다시 시도해주세요.');
}

function pwaDismiss(){
  const b=document.getElementById('pwa-install-banner');
  if(b) b.classList.remove('show');
  try{ localStorage.setItem('pwa_install_dismissed','1'); }catch(e){}
}

/* ── Home Search ── */
(function(){
  const inp=()=>document.getElementById('home-search-input');
  const box=()=>document.getElementById('home-search-box');
  const res=()=>document.getElementById('home-search-results');
  const wrap=()=>document.getElementById('home-search-wrap');
  const colors=['#E21E26','#0078C8','#10b981','#f59e0b','#8b5cf6','#ec4899'];
  function renderResults(q){
    const r=res(); if(!r) return;
    if(!q){r.classList.remove('show');r.innerHTML='';return;}
    const users=(D.users||[]).filter(u=>!u.deleted&&(u.name.includes(q)||u.team.includes(q)||u.channel.includes(q)));
    if(!users.length){r.innerHTML='<div class="home-search-empty">검색 결과가 없습니다</div>';r.classList.add('show');return;}
    r.innerHTML=users.map((u,i)=>{
      const bg=colors[(u.id-1)%6];
      return `<div class="home-search-item" onclick="event.stopPropagation();openLecturer(${u.id},'page-pick');document.getElementById('home-search-results').classList.remove('show');document.getElementById('home-search-input').value='';">
        <div class="hs-photo" style="background:${bg};overflow:hidden">${u.photo?'<img src="'+u.photo+'" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:50%">':u.name[0]}</div>
        <div class="hs-info"><div class="hs-name">${u.name} <span style="font-size:10px;font-weight:500;color:var(--t3);margin-left:4px">${u.office||''}</span></div><div class="hs-meta">${[u.team,u.position].filter(Boolean).join(' · ')}</div></div>
        <svg class="hs-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18"/></svg>
      </div>`;
    }).join('');
    r.classList.add('show');
  }
  document.addEventListener('input',function(e){if(e.target.id==='home-search-input'){const b=box();if(b)b.classList.add('active');renderResults(e.target.value.trim());}});
  document.addEventListener('focus',function(e){if(e.target.id==='home-search-input'){const b=box();if(b)b.classList.add('active');renderResults(e.target.value.trim());}},true);
  document.addEventListener('click',function(e){const w=wrap();if(w&&!w.contains(e.target)){const b=box(),r2=res();if(b)b.classList.remove('active');if(r2)r2.classList.remove('show');}});
})();

function goMyPage(){
  if(CU&&CU.isAdmin&&!CU.isSubAdmin){ openAdmin(); }
  else if(CU&&CU.id){ openLecturer(CU.id,'page-pick'); }
  else { showPage('page-myprofile'); }
}
async function doRegister(){
  const name=v('rg-name').trim(),email=v('rg-email').trim(),pw=v('rg-pw').trim(),pw2=v('rg-pw2').trim(),ch=v('rg-channel');
  if(!name||!email||!pw){ el('rg-err').textContent='이름, 이메일, 비밀번호를 모두 입력하세요.'; return; }
  if(pw!==pw2){ el('rg-err').textContent='비밀번호가 일치하지 않습니다.'; return; }
  if(pw.length<4){ el('rg-err').textContent='비밀번호는 4자 이상 입력하세요.'; return; }
  if(!ch){ el('rg-err').textContent='소속을 선택해 주세요.'; return; }
  // DB에 저장
  const result=await dbCreateUser({name,email,pw,channel:ch,team:v('rg-team'),
    birthYear:parseInt(v('rg-year'))||1990,hireDate:v('rg-hire'),phone:v('rg-phone'),photo:pendingPhoto||null});
  if(!result){ el('rg-err').textContent='이미 사용 중인 이메일이거나 오류가 발생했습니다.'; return; }
  pendingPhoto=null;
  await loadFromDB();
  CU=D.users.find(x=>x.id===result.id);
  saveStoredUser(CU);
  initHome(); showPage('page-pick');
}
/* ── PW visibility toggle ── */
function togglePwVis(inputId,btn){
  const inp=el(inputId);
  if(inp.type==='password'){inp.type='text';btn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';}
  else{inp.type='password';btn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';}
}
/* ── Photo preview ── */
let pendingPhoto=null;
function previewPhoto(input){
  if(!input.files||!input.files[0]) return;
  const reader=new FileReader();
  reader.onload=e=>{
    pendingPhoto=e.target.result;
    el('photo-preview').innerHTML=`<img src="${e.target.result}">`;
  };
  reader.readAsDataURL(input.files[0]);
}
function showFindPw(){ el('findpw-msg').textContent=''; el('findpw-overlay').classList.add('show'); }
function doFindPw(){
  const em=v('findpw-email').trim();
  const u=D.users.find(x=>x.email===em);
  if(!u){ el('findpw-msg').textContent='등록된 이메일이 없습니다.'; return; }
  el('findpw-msg').style.color='var(--green)';
  el('findpw-msg').textContent=`임시 비밀번호: ${Math.random().toString(36).slice(-6).toUpperCase()} (실제 발송은 백엔드 연동 후 활성화)`;
}

