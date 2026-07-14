/* 01-core-db.js — Supabase 연결 + DB 헬퍼 + loadFromDB(tier 로딩)
   (index.html 4517~4996행에서 분리 · 로드 순서 유지 필수) */
console.log('=== JS LOADED ===');
/* ════════════════════════════════
   SUPABASE CONNECTION
════════════════════════════════ */
const SUPA_URL = 'https://teaeqymeiurcawbuqmqx.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlYWVxeW1laXVyY2F3YnVxbXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMjc1NjgsImV4cCI6MjA5MDYwMzU2OH0.PytJ96HfQTWUID1Sv439u9Lt0LO9zNSKJtQ8HR9OZ5M';
const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);

/* ════════════════════════════════
   SUPABASE HELPER FUNCTIONS
════════════════════════════════ */
// DB에서 모든 유저 가져오기
function mapUsersFromRows(rows){
  return (rows||[]).map(r=>({
    id:r.id, name:r.name, email:r.email, channel:r.channel, team:r.team,
    position:r.position||'현장강사', birthYear:r.birth_year, hireDate:r.hire_date, phone:r.phone,
    photo:r.photo, memo:r.memo||'', score:r.score||0, grade:r.grade||'—',
    lgCareerStart:r.lg_career_start||'', teachCareerStart:r.teach_career_start||'',
    scores:r.scores||{}, maxes:r.maxes||{발성:20,전문성:25,판서:15,상호작용:20,시간관리:10,마무리:10},
    habits:r.habits||[], habitCounts:r.habit_counts||[], engagementGaps:r.engagement_gaps||[],
    decibel:r.decibel||0, tempo:r.tempo||0, studentCount:r.student_count||0,
    registered:r.created_at?r.created_at.split('T')[0]:'',
    isSubAdmin:r.is_sub_admin||false,
    satisfaction:r.satisfaction||null,
    grade_override:r.grade_override||null,
    deleted:!!r.deleted_at,
    deletedAt:r.deleted_at||null,
    orgName:r.org_name||'',
    office:r.office||'',
    birthDate:r.birth_date||'',
    status:r.status||'근무'
  }));
}
function mapVideosFromRows(rows, allTimestamps){
  const ts=allTimestamps||[];
  return (rows||[]).map(r=>({
    id:r.id, userId:r.user_id, title:r.title, youtube:r.youtube||'', filePath:r.file_path||'',
    date:r.video_date, duration:r.duration||'', studentCount:r.student_count||0,
    status:r.status||'등록완료', videoType:r.video_type||'', channel:r.channel||'',
    eduType:r.edu_type||'',
    checklist:r.checklist, solution:r.solution||'', eduFileUrl:r.edu_file_url||'', productName:r.product_name||'',
    timestamps: ts.filter(t=>t.video_id===r.id).map(t=>({
      id:t.id, t:t.time_mark, type:t.type, text:t.text, tags:t.tags||[]
    }))
  }));
}
async function dbGetUsers(){
  const {data,error}=await sb.from('users_safe').select('*').order('id');
  if(error){ console.error('dbGetUsers:',error); return []; }
  return mapUsersFromRows(data);
}
// DB에서 모든 영상 가져오기
async function dbGetVideos(){
  const {data,error}=await sb.from('videos').select('*').order('id');
  if(error){ console.error('dbGetVideos:',error); return []; }
  const tsRes=await sb.from('timestamps').select('*').order('id');
  const allTs=tsRes.data||[];
  return data.map(r=>({
    id:r.id, userId:r.user_id, title:r.title, youtube:r.youtube||'', filePath:r.file_path||'',
    date:r.video_date, duration:r.duration||'', studentCount:r.student_count||0,
    status:r.status||'등록완료', videoType:r.video_type||'', channel:r.channel||'',
    eduType:r.edu_type||'',
    checklist:r.checklist, solution:r.solution||'', eduFileUrl:r.edu_file_url||'', productName:r.product_name||'',
    timestamps: allTs.filter(t=>t.video_id===r.id).map(t=>({
      id:t.id, t:t.time_mark, type:t.type, text:t.text, tags:t.tags||[]
    }))
  }));
}
// 유저 생성
async function dbCreateUser(u){
  try{
    const token=localStorage.getItem('ib_token')||'';
    const r=await fetch('/api/auth/create-user',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(u)});
    const j=await r.json().catch(()=>({}));
    if(!j.ok) return {_error:j.error||'강사 추가 실패'};
    return j.user;
  }catch(e){
    console.error('dbCreateUser error:',e);
    return {_error:'네트워크 오류'};
  }
}
// 유저 업데이트
async function dbUpdateUser(id,fields){
  const map={};
  if('name' in fields) map.name=fields.name;
  if('email' in fields) map.email=fields.email;
  if('channel' in fields) map.channel=fields.channel;
  if('team' in fields) map.team=fields.team;
  if('birthYear' in fields) map.birth_year=fields.birthYear;
  if('hireDate' in fields) map.hire_date=fields.hireDate;
  if('phone' in fields) map.phone=fields.phone;
  if('pw' in fields) console.warn('dbUpdateUser: pw 변경 차단됨. /api/auth/change-password 또는 /api/auth/reset-password 사용');
  if('photo' in fields) map.photo=fields.photo;
  if('memo' in fields) map.memo=fields.memo;
  if('score' in fields) map.score=fields.score;
  if('grade' in fields) map.grade=fields.grade;
  if('scores' in fields) map.scores=fields.scores;
  if('isSubAdmin' in fields) map.is_sub_admin=fields.isSubAdmin;
  if('satisfaction' in fields) map.satisfaction=fields.satisfaction;
  if('grade_override' in fields) map.grade_override=fields.grade_override;
  if('orgName' in fields) map.org_name=fields.orgName;
  if('office' in fields) map.office=fields.office;
  if('birthDate' in fields) map.birth_date=fields.birthDate;
  if('status' in fields) map.status=fields.status;
  if('position' in fields) map.position=fields.position;
  const {error}=await sb.from('users').update(map).eq('id',id);
  if(error){ console.error('dbUpdateUser:',error); return {ok:false, error:error.message||String(error)}; }
  return {ok:true};
}
// 교육종류 목록 (조직별 분리 · Supabase)
// org_name = NULL 인 행은 레거시(공통) 으로 취급되어 모든 조직에서 노출
async function dbGetEduTypes(org){
  let q=sb.from('edu_types').select('*').order('id');
  if(org) q=q.eq('org_name', org);
  const {data,error}=await q;
  if(error){ console.warn('dbGetEduTypes:',error.message); return null; }
  return (data||[]).map(r=>({id:r.id,name:r.name,org_name:r.org_name||null}));
}
async function dbAddEduType(name, org){
  const {data,error}=await sb.from('edu_types').insert({name, org_name: org||null}).select().single();
  if(error){ console.error('dbAddEduType:',error); return {_error:error.message}; }
  return data;
}
async function dbRemoveEduType(id){
  const {data,error}=await sb.from('edu_types').delete().eq('id',id).select();
  if(error){ console.error('dbRemoveEduType:',error); return {_error:error.message}; }
  return {ok:true,deleted:data?.length||0};
}
async function dbRemoveEduTypeByName(name, org){
  let q=sb.from('edu_types').delete().eq('name',name);
  if(org!==undefined){
    if(org===null) q=q.is('org_name', null);
    else q=q.eq('org_name', org);
  }
  const {data,error}=await q.select();
  if(error){ console.error('dbRemoveEduTypeByName:',error); return {_error:error.message}; }
  return {ok:true,deleted:data?.length||0};
}
// 영상 생성
async function dbCreateVideo(v){
  // 영상이 속할 조직: 영상 소유자(user)의 org → 활성 조직 → 현재 사용자 조직 순
  const owner=(D.users||[]).find(x=>x.id===v.userId);
  const orgName=v.orgName||owner?.orgName||curOrg();
  const full={
    user_id:v.userId, title:v.title, youtube:v.youtube||'', file_path:v.filePath||'',
    video_date:v.date||null, duration:v.duration||'', student_count:v.studentCount||0,
    status:v.status||'등록완료', video_type:v.videoType||'', channel:v.channel||'',
    solution:v.solution||'', edu_file_url:v.eduFileUrl||'', product_name:v.productName||'',
    edu_type:v.eduType||null,
    org_name:orgName,
    // GCS URI 영구 보관 — Vertex 의 inline 18MB 한계 회피, 재분석 시 동일 영상 사용
    video_gcs_uri: v.gcsUri || v.video_gcs_uri || ''
  };
  let {data,error}=await sb.from('videos').insert(full).select().single();
  if(!error) return data;
  const msg=(error.message||'').toLowerCase();
  // edu_type 컬럼이 DB에 없으면 제외 후 재시도
  if(msg.includes('column') && msg.includes('edu_type')){
    console.warn('edu_type 컬럼 없음 — 제외 후 재시도');
    const {edu_type,...noEdu}=full;
    ({data,error}=await sb.from('videos').insert(noEdu).select().single());
    if(!error) return data;
  }
  // org_name 컬럼이 없으면 제외 후 재시도
  if((error?.message||'').toLowerCase().includes('org_name')){
    console.warn('org_name 컬럼 없음 — 제외 후 재시도');
    const {org_name,...noOrg}=full;
    ({data,error}=await sb.from('videos').insert(noOrg).select().single());
    if(!error) return data;
  }
  // video_gcs_uri 컬럼 없으면 제외 후 재시도 (옛 스키마 호환)
  if((error?.message||'').toLowerCase().includes('video_gcs_uri')){
    console.warn('video_gcs_uri 컬럼 없음 — 제외 후 재시도. schema_completeness.sql 실행 권장');
    const {video_gcs_uri,...noGcs}=full;
    ({data,error}=await sb.from('videos').insert(noGcs).select().single());
    if(!error) return data;
  }
  console.error('dbCreateVideo:',error);
  return {_error: error?.message || '영상 등록 실패 (DB)'};
}
// 영상 업데이트
async function dbUpdateVideo(id,fields){
  const map={};
  if('youtube' in fields) map.youtube=fields.youtube;
  if('filePath' in fields) map.file_path=fields.filePath;
  if('solution' in fields) map.solution=fields.solution;
  if('status' in fields) map.status=fields.status;
  const {error}=await sb.from('videos').update(map).eq('id',id);
  if(error){ console.error('dbUpdateVideo:',error); return {ok:false, error:error.message||String(error)}; }
  return {ok:true};
}
// 타임스탬프 추가
async function dbAddTimestamp(videoId,ts){
  const {data,error}=await sb.from('timestamps').insert({
    video_id:videoId, time_mark:ts.t, type:ts.type, text:ts.text, tags:ts.tags||[]
  }).select().single();
  if(error){ console.error('dbAddTs:',error); return null; }
  return data;
}
// 타임스탬프 수정
async function dbUpdateTimestamp(id,text){
  const {error}=await sb.from('timestamps').update({text}).eq('id',id);
  if(error) console.error('dbUpdateTs:',error);
}
// 타임스탬프 삭제
async function dbDeleteTimestamp(id){
  const {error}=await sb.from('timestamps').delete().eq('id',id);
  if(error) console.error('dbDeleteTs:',error);
}
// 유저 삭제
async function dbDeleteUser(id){
  // 소프트 삭제: deleted_at만 기록, 영상/평가 데이터는 보존
  const {error}=await sb.from('users').update({deleted_at:new Date().toISOString()}).eq('id',id);
  if(error) console.error('dbDeleteUser:',error);
}
async function dbRestoreUser(id){
  const {error}=await sb.from('users').update({deleted_at:null}).eq('id',id);
  if(error) console.error('dbRestoreUser:',error);
}
// DB에서 전체 데이터 로드 → D에 저장
function refreshOrgSwitch(){
  const sel=document.getElementById('org-switch');
  if(!sel) return;
  // 진짜 관리자만 헤더에 노출. 부관리자/일반 강사는 숨김.
  if(!D.isRealAdmin){ sel.style.display='none'; return; }
  sel.style.display='inline-block';
  // 조직 분리 — 관리자도 로그인한 조직에 잠금. 조직 변경은 로그아웃 → 해당 조직 로그인 페이지.
  if(D.activeOrg){
    sel.innerHTML=`<option value="${D.activeOrg}" selected>🔒 ${D.activeOrg}</option>`;
    sel.disabled=true;
    sel.title='조직 전환은 로그아웃 후 해당 조직 로그인 페이지에서 해주세요';
    return;
  }
  // (구버전 토큰 호환) 조직 정보가 없는 관리자 세션 — 기존 드롭다운 유지
  const orgs=Array.isArray(D.orgList)?D.orgList:[];
  const opts=['<option value="">📂 전체 조직</option>'];
  orgs.forEach(o=>{
    opts.push(`<option value="${o}"${D.activeOrg===o?' selected':''}>${o}</option>`);
  });
  sel.innerHTML=opts.join('');
  sel.disabled=false;
}
async function switchOrg(value){
  D.activeOrg=value||null;
  try{ localStorage.setItem('ib_active_org', D.activeOrg||''); }catch(e){}
  // 로딩 오버레이 — 새로고침 후에도 유지하기 위해 sessionStorage 플래그 사용
  try{ sessionStorage.setItem('ib_org_switching', value||'전체 조직'); }catch(e){}
  showLoginLoading('조직 변경 중');
  location.reload();
}
// /api/db/load 자동 재시도 — Cold start / 일시적 네트워크 끊김 / race condition 대응
// 1초 → 3초 → 7초 지수 백오프, 최대 3회. 401/403은 즉시 중단(재시도 의미 없음).
async function fetchDBLoadWithRetry(token, org, tier){
  const delays=[0, 1000, 3000];
  let lastErr='네트워크 오류';
  let lastStatus=0;
  for(let i=0;i<delays.length;i++){
    if(delays[i]>0) await new Promise(r=>setTimeout(r,delays[i]));
    try {
      const r=await fetch('/api/db/load',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({org:org||null, tier: tier || 'full'})
      });
      lastStatus=r.status;
      const j=await r.json().catch(()=>null);
      if(j && j.ok) return j;
      lastErr=(j&&j.error)||('HTTP '+r.status);
      if(r.status===401||r.status===403) break;  // 인증 만료는 재시도 무의미
    } catch(e){
      lastErr=e.message||String(e);
    }
  }
  return {ok:false,error:lastErr,status:lastStatus};
}

// ════════════════════════════════════════════════════════════
// Tier 로딩 — 체감 속도 개선
//   tier='core'    : 핵심(users/videos/evals/voice_evals/timestamps) — 첫 진입 즉시 필요
//   tier='content' : 콘텐츠(checklists/learning_links/calendar/pick_*/recommended) — 인터PICK·교육콘텐츠용
//   tier='full'    : 전부 (호환용 기본값)
// ════════════════════════════════════════════════════════════
async function loadFromDB(tier){
  tier = tier || 'full';
  startProgress();
  D.loadingDB = true;
  try{
    if(!D.activeOrg){
      try{ const s=localStorage.getItem('ib_active_org'); if(s) D.activeOrg=s; }catch(e){}
    }
    const token=localStorage.getItem('ib_token')||'';
    let serverData=null;
    const j=await fetchDBLoadWithRetry(token, D.activeOrg, tier);
    if(j.ok){
      serverData=j;
    } else {
      console.error('loadFromDB('+tier+'):',j.error,'status=',j.status);
      // 504/502/522/503 — 인프라 장애 (Vercel 함수 타임아웃 또는 Supabase 응답 없음)
      if([502,503,504,522].includes(j.status)){
        if(typeof showToast==='function') showToast('데이터 로드가 매우 느립니다. Supabase 또는 서버 응답 지연. 1~2분 후 다시 시도해주세요.','#f59e0b');
        D.loadingDB=false;
        endProgress();
        return;
      }
      if(j.status===401||j.status===403){
        try{ localStorage.removeItem('ib_token'); localStorage.removeItem('ib_user'); }catch(e){}
        try{ CU=null; if(typeof hideGlobalSidebar==='function') hideGlobalSidebar(); }catch(_){}
        // 403(조직 미지정 등)은 사유를 알리고, 조직별 로그인 페이지로 이동
        if(j.status===403 && j.error) alert(j.error);
        D.loadingDB=false;
        endProgress();
        location.replace('login.html');
        return;
      } else {
        if(typeof showToast==='function') showToast('데이터 로드 실패('+j.error+'). 잠시 후 자동 재시도합니다.','#ef4444');
        setTimeout(()=>{ if(!D.users || !D.users.length) loadFromDB(tier).catch(()=>{}); }, 5000);
      }
    }
    if(serverData){
      // core 데이터 (tier core/full 에 포함)
      if(tier==='core' || tier==='full'){
        D.users=mapUsersFromRows(serverData.users);
        D.videos=mapVideosFromRows(serverData.videos, serverData.timestamps);
        D.evaluations=serverData.evaluations||[];
        D.voiceEvals=serverData.voice_evals||[];
        D.activeOrg=serverData.meta?.active_org||D.activeOrg;
        D.isRealAdmin=!!serverData.meta?.is_real_admin;
        D.orgList=serverData.meta?.org_list||D.orgList||[];
      }
      // content 데이터 (tier content/full 에 포함)
      if(tier==='content' || tier==='full'){
        D.calendarEvents=(serverData.calendar_events||[]).map(e=>({...e,start_date:e.start_time?.slice(0,10)||''}));
        D.learningLinks=serverData.learning_links||[];
        D.recVideos=serverData.recommended_videos||[];
        D.pickContents=serverData.pick_contents||[];
        D.pickNotices=serverData.pick_notices||[];
        D.pickFeaturedVideos=serverData.pick_featured_videos||[];
        D.checklists=serverData.checklist_files||[];
        // 인터픽 Top3 수동 지정 override 도 함께 로드 (조직별)
        try{ await preloadPickTop3Overrides(); }catch(_){}
      }
    } else if(tier==='full' || tier==='core'){
      D.users=D.users||[]; D.videos=D.videos||[];
      D.evaluations=D.evaluations||[]; D.voiceEvals=D.voiceEvals||[];
    }
    if(typeof refreshOrgSwitch==='function') refreshOrgSwitch();
    if(typeof refreshOrgFooter==='function') refreshOrgFooter();
    if(typeof refreshAdminVisibility==='function') refreshAdminVisibility();

    // 보조 쿼리 — 'full' 에서만 모두, core/content 는 최소만
    if(tier==='full' || tier==='content'){
      // criteria
      {
        let q=sb.from('criteria').select('*').order('sort_order');
        if(D.activeOrg) q=q.eq('org_name', D.activeOrg);
        const {data:cri}=await q;
        if(cri) D.criteria=cri.map(c=>({name:c.name,max:c.max_score,desc:c.description,org_name:c.org_name||null}));
      }
      // ref_videos
      {
        let q=sb.from('ref_videos').select('*');
        if(D.activeOrg) q=q.eq('org_name', D.activeOrg);
        const {data:ref}=await q;
        if(ref){ D.refVideos={}; ref.forEach(r=>D.refVideos[r.channel]=r.youtube_url||''); }
      }
      // delete_requests
      {
        let q=sb.from('delete_requests').select('*').order('created_at',{ascending:false});
        if(D.activeOrg) q=q.eq('org_name', D.activeOrg);
        const {data:dr}=await q;
        D.deleteRequests=dr||[];
      }
      // edu_categories
      {
        let q=sb.from('edu_categories').select('*').order('sort_order');
        if(D.activeOrg) q=q.eq('org_name', D.activeOrg);
        const {data:ec}=await q;
        D.eduCategories=ec||[];
      }
      await seedEduCategoriesIfEmpty();
      // edu_types
      const et=await dbGetEduTypes(D.activeOrg);
      if(et!==null){
        D.eduTypes=et.map(r=>({id:String(r.id),name:r.name,org_name:r.org_name||null}));
        try{localStorage.setItem('interbiz_eduTypes',JSON.stringify(D.eduTypes.map(x=>x.name)));}catch(e){}
      } else { D.eduTypes=D.eduTypes||[]; }
      // career/portfolio
      const {data:ch}=await sb.from('career_history').select('*').order('sort_order',{ascending:false});
      D.careerHistory=ch||[];
      const {data:pf2}=await sb.from('portfolio').select('*').order('created_at',{ascending:false});
      D.portfolio=pf2||[];
      // badge_criteria
      {
        let q=sb.from('badge_criteria').select('*').order('sort_order',{ascending:true});
        if(D.activeOrg) q=q.eq('org_name', D.activeOrg);
        const {data:bc}=await q;
        D.badgeCriteria=bc||[];
      }
      if(!D.badgeCriteria || !D.badgeCriteria.length) await seedBadgeCriteria();
      if(typeof populateChecklistSelects==='function') populateChecklistSelects();
    }

    // 세션 가드 (어떤 tier 든)
    if(CU && !CU.isAdmin && CU.id){
      const me=(D.users||[]).find(x=>x.id===CU.id);
      if(!me || me.deleted){
        alert('계정이 삭제되었습니다. 관리자에게 문의하세요.');
        doLogout();
      }
    }
    try{
      if(sessionStorage.getItem('ib_org_switching')){
        sessionStorage.removeItem('ib_org_switching');
        hideLoginLoading();
      }
    }catch(e){}
  } finally { D.loadingDB = false; endProgress(); }
}

// 단계 로딩 헬퍼 — 핵심부터 즉시, 콘텐츠는 백그라운드
async function loadFromDBStaged(){
  // 1단계: 핵심 (users/videos/evaluations/voice_evals) — 즉시 표시 가능
  await loadFromDB('core');
  // 2단계: 콘텐츠(인터PICK·교육콘텐츠 등) + 보조 — 백그라운드
  loadFromDB('content').catch(e=>console.warn('백그라운드 content 로드 실패:',e));
  // 3단계: 사용자 사진 (base64 1~3MB/명, 메인 페이로드에 포함하면 504 발생) — 백그라운드 lazy
  loadUserPhotosLazy(true).catch(e=>console.warn('사용자 사진 lazy 로드 실패:',e));
}

// 사용자 사진 lazy 로드 — /api/db/load 에서 제외된 photo 를 별도 호출로 받아 D.users 에 머지
window._photosLoaded=false;
async function loadUserPhotosLazy(force){
  if(window._photosLoaded && !force) return;
  if(!CU?.id) return;
  // D.users 가 아직 안 채워졌으면 최대 5초 폴링
  for(let i=0; i<25 && (!D.users || !D.users.length); i++){
    await new Promise(r=>setTimeout(r,200));
  }
  if(!D.users || !D.users.length){
    setTimeout(()=>loadUserPhotosLazy(true), 1500);
    return;
  }
  try{
    const token=localStorage.getItem('ib_token')||'';
    // ⚡ 자동 호출은 항상 빈 body 로 — 모든 photo 받아 D.users 와 ID 매칭으로 머지
    //    (서버 측 org 필터는 D.users 와 어긋날 수 있어 클라이언트 측 ID 매칭이 안전)
    const r=await fetchWithRetry('/api/users/photos',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({})
    });
    const j=await r.json().catch(()=>({}));
    if(!j.ok){
      setTimeout(()=>loadUserPhotosLazy(true), 1500);
      return;
    }
    // D.users 에 photo 머지 — ID 매칭이라 자동으로 본인 조직 사진만 머지됨
    const photoMap={};
    (j.photos||[]).forEach(p=>{photoMap[p.id]=p.photo;});
    let merged=0;
    (D.users||[]).forEach(u=>{
      if(photoMap[u.id]){ u.photo=photoMap[u.id]; merged++; }
    });
    // CU.photo 도 갱신
    if(CU?.id && photoMap[CU.id]){
      CU.photo=photoMap[CU.id];
      try{saveStoredUser(CU);}catch(_){}
    }
    window._photosLoaded=true;
    // 현재 페이지 재렌더
    const cur=document.querySelector('.page.active')?.id||'';
    if(cur==='page-pick' && typeof renderPick==='function') try{renderPick();}catch(_){}
    if(cur==='page-lecturer' && typeof renderLecturer==='function') try{renderLecturer();}catch(_){}
    if(cur==='page-myprofile' && typeof renderMyProfile==='function') try{renderMyProfile();}catch(_){}
    if(typeof updateHeaderUI==='function') try{updateHeaderUI();}catch(_){}
    console.log('📸 loadUserPhotosLazy:', merged+'/'+(D.users?.length||0)+'명 머지');
  }catch(e){
    console.warn('loadUserPhotosLazy:',e);
    setTimeout(()=>loadUserPhotosLazy(true), 2000);
  }
}

