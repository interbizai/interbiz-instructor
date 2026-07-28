/* 02-state.js — 샘플데이터 + 앱 상태(D/CU/curOrg) + 렌더캐시 + 네트워크/토큰/Realtime + 프로그레스바
   (index.html 4997~5406행에서 분리 · 로드 순서 유지 필수) */
/* ════════════════════════════════
   SAMPLE DATA (fallback)
════════════════════════════════ */
const SEED = {
  users:[
    {id:1,name:'김민준',email:'kim@interbiz.com',pw:'1234',channel:'가전',team:'교육1팀',position:'선임강사',birthYear:1988,hireDate:'2018-03-01',specialty:'에어컨, 냉장고',type:'판경상인',score:94,grade:'S',photo:null,memo:'',
     scores:{발성:19,전문성:24,판서:14,상호작용:19,시간관리:9,마무리:9},maxes:{발성:20,전문성:25,판서:15,상호작용:20,시간관리:10,마무리:10},
     habits:['음~','그래서','맞죠?'],habitCounts:[12,8,15],engagementGaps:[8,12,7,10],decibel:72,tempo:145,studentCount:20,registered:'2026-01-10'},
    {id:2,name:'이수연',email:'lee@interbiz.com',pw:'1234',channel:'IT',team:'교육1팀',position:'선임강사',birthYear:1990,hireDate:'2019-06-15',specialty:'노트북, 태블릿',type:'거점',score:91,grade:'S',photo:null,memo:'',
     scores:{발성:18,전문성:24,판서:14,상호작용:18,시간관리:9,마무리:8},maxes:{발성:20,전문성:25,판서:15,상호작용:20,시간관리:10,마무리:10},
     habits:['어~','뭐랄까'],habitCounts:[6,9],engagementGaps:[10,15,8],decibel:68,tempo:138,studentCount:15,registered:'2026-01-12'},
    {id:3,name:'박도윤',email:'park@interbiz.com',pw:'1234',channel:'서비스',team:'현장지원팀',position:'선임강사',birthYear:1985,hireDate:'2016-01-10',specialty:'고객응대, CS',type:'판경상인',score:90,grade:'S',photo:null,memo:'',
     scores:{발성:18,전문성:23,판서:13,상호작용:18,시간관리:9,마무리:9},maxes:{발성:20,전문성:25,판서:15,상호작용:20,시간관리:10,마무리:10},
     habits:['그니까','사실은'],habitCounts:[7,5],engagementGaps:[9,11,6,8],decibel:75,tempo:142,studentCount:25,registered:'2026-01-15'},
    {id:4,name:'최지아',email:'choi@interbiz.com',pw:'1234',channel:'가전',team:'교육2팀',position:'주임',birthYear:1993,hireDate:'2021-04-01',specialty:'TV, 세탁기',type:'거점',score:85,grade:'A',photo:null,memo:'',
     scores:{발성:17,전문성:21,판서:13,상호작용:16,시간관리:9,마무리:9},maxes:{발성:20,전문성:25,판서:15,상호작용:20,시간관리:10,마무리:10},
     habits:['이제','그리고','음~'],habitCounts:[18,11,8],engagementGaps:[15,20,18],decibel:65,tempo:130,studentCount:18,registered:'2026-02-01'},
    {id:5,name:'정현서',email:'jung@interbiz.com',pw:'1234',channel:'IT',team:'교육2팀',position:'강사',birthYear:1995,hireDate:'2022-09-01',specialty:'스마트폰',type:'판경상인',score:78,grade:'B',photo:null,memo:'',
     scores:{발성:15,전문성:20,판서:11,상호작용:15,시간관리:8,마무리:9},maxes:{발성:20,전문성:25,판서:15,상호작용:20,시간관리:10,마무리:10},
     habits:['어','그냥','뭐'],habitCounts:[22,14,9],engagementGaps:[20,25],decibel:60,tempo:125,studentCount:12,registered:'2026-02-10'},
    {id:6,name:'한예진',email:'han@interbiz.com',pw:'1234',channel:'서비스',team:'현장지원팀',position:'강사',birthYear:1996,hireDate:'2023-03-15',specialty:'매장서비스',type:'거점',score:74,grade:'B',photo:null,memo:'',
     scores:{발성:14,전문성:19,판서:11,상호작용:14,시간관리:8,마무리:8},maxes:{발성:20,전문성:25,판서:15,상호작용:20,시간관리:10,마무리:10},
     habits:['저기'],habitCounts:[4],engagementGaps:[22,30,19],decibel:62,tempo:128,studentCount:10,registered:'2026-03-01'}
  ],
  videos:[
    {id:1,userId:1,title:'에어컨 신제품 강의 1회차',youtube:'',filePath:'',date:'2026-03-05',duration:'45:32',studentCount:20,status:'분석완료',checklist:null,
     timestamps:[
       {id:1,t:'02:15',type:'good',text:'제품 스펙 비교 설명 시 명확한 예시 활용 — 수강생 이해도 매우 높음',tags:['발성','전문성']},
       {id:2,t:'08:44',type:'tip',text:'판서 흐름이 강의 논리와 완벽 연결 — 멘토 강사로 추천',tags:['판서']},
       {id:3,t:'15:30',type:'bad',text:'질문 유도 후 답변 대기 시간이 너무 짧음 (2초 미만)',tags:['상호작용']},
       {id:4,t:'22:10',type:'good',text:'제품 시연 순서가 체계적이고 명확함',tags:['전문성']},
       {id:5,t:'35:20',type:'tip',text:'마무리 요약 후 다음 강의 연결이 자연스러움',tags:['마무리']}
     ],
     solution:'다음 강의에서 질문 후 5-7초 대기 시간을 확보하고 수강생 2-3명의 답변을 유도하세요. 상호작용 점수 3-5점 향상이 예상됩니다.'
    },
    {id:2,userId:1,title:'에어컨 신제품 강의 2회차',youtube:'',filePath:'',date:'2026-03-12',duration:'42:18',studentCount:20,status:'분석완료',checklist:null,
     timestamps:[
       {id:1,t:'05:00',type:'good',text:'오프닝 루틴이 이전보다 자신감 있게 개선됨',tags:['발성']},
       {id:2,t:'18:30',type:'bad',text:'중간 복습 구간에서 속도가 너무 빠름',tags:['시간관리']},
       {id:3,t:'30:00',type:'tip',text:'실제 사용 사례 언급이 수강생 집중도 높임',tags:['전문성']}
     ],
     solution:'강의 중반부 속도 조절이 필요합니다. 핵심 개념 설명 시 의도적으로 2-3초 멈추는 연습을 권장합니다.'
    },
    {id:3,userId:2,title:'노트북 활용 교육',youtube:'',filePath:'',date:'2026-03-08',duration:'50:15',studentCount:15,status:'분석완료',checklist:null,
     timestamps:[
       {id:1,t:'03:20',type:'good',text:'실습 안내가 단계별로 매우 명확함',tags:['실습지도']},
       {id:2,t:'11:05',type:'bad',text:'후반부 목소리 볼륨이 다소 낮아짐',tags:['발성']},
       {id:3,t:'25:00',type:'tip',text:'오류 대응 시나리오 사전 준비 권장',tags:['전문성']}
     ],
     solution:'강의 후반 45-50분 구간 에너지 저하 감지. 25분경 짧은 환기 활동(질문/실습)을 삽입하면 집중도 유지에 효과적입니다.'
    },
    {id:4,userId:3,title:'고객 응대 실습 교육',youtube:'',filePath:'',date:'2026-03-15',duration:'55:00',studentCount:25,status:'분석완료',checklist:null,
     timestamps:[
       {id:1,t:'04:10',type:'good',text:'롤플레잉 시나리오를 생동감 있게 운영',tags:['롤플레잉']},
       {id:2,t:'09:30',type:'tip',text:'실제 현장 사례 3가지 연결로 신뢰도 향상',tags:['전문성']}
     ],
     solution:'현재 수준 유지하면서 어려운 상황(컴플레인 고객) 시나리오를 추가로 다루면 완성도가 높아집니다.'
    }
  ],
  criteria:[
    {name:'발성 및 전달력',max:20,desc:'목소리 크기, 속도, 발음의 명확성'},
    {name:'내용 전문성',max:25,desc:'제품 지식의 정확성, 최신성, 깊이'},
    {name:'판서 및 자료 활용',max:15,desc:'칠판/PPT 활용의 적절성'},
    {name:'수강생 상호작용',max:20,desc:'질문 유도, 반응 확인, 참여 독려'},
    {name:'시간 관리',max:10,desc:'강의 목표 시간 준수, 흐름 균형'},
    {name:'마무리 및 요약',max:10,desc:'핵심 내용 재정리, 다음 강의 연결'}
  ],
  refVideos:{가전:'',IT:'',서비스:''}
};

/* ════════════════════════════════
   APP STATE
════════════════════════════════ */
let D = { users:[], videos:[], criteria:[], refVideos:{} };
let CU = JSON.parse(localStorage.getItem('ib_user')||'null');
// 현재 조직 — 모든 저장(insert)에 조직 필수 첨부용. 조직 분리 이후 null 저장 금지 원칙.
function curOrg(){ return D.activeOrg || CU?.orgName || CU?.org_name || CU?.channel || null; }
// 조직별 수정요청 연락 이메일 — 하단 footer·앱설치 안내·QR 포스터에서 사용
const ORG_CONTACT_EMAILS={ 'LG전자 강사':'miyeon1.kwon@interbiz.co.kr', '하이케어솔루션':'jieun0320@interbiz.co.kr' };
function orgContactEmail(){
  let org=curOrg();
  if(!org){ try{ org=localStorage.getItem('ib_active_org')||''; }catch(_){} }
  return ORG_CONTACT_EMAILS[org] || 'miyeon1.kwon@interbiz.co.kr';
}
function refreshOrgFooter(){
  try{ document.querySelectorAll('.org-contact-email').forEach(e=>{ e.textContent=orgContactEmail(); }); }catch(_){}
}
try{ if(document.readyState!=='loading') refreshOrgFooter(); else document.addEventListener('DOMContentLoaded',refreshOrgFooter); }catch(_){}
// ⚡ localStorage 안전 저장 — photo(base64 1~3MB) 제외 + quota 초과 방지
function saveStoredUser(u){
  if(!u) return;
  try{
    // photo·scores 같은 큰 필드는 localStorage 에 굳이 저장 안 함 (DB 가 원본)
    const{photo, scores, maxes, habits, habit_counts, engagement_gaps, ...lite} = u;
    localStorage.setItem('ib_user', JSON.stringify(lite));
  }catch(e){
    // quota 초과 시 더 강한 절감 — 핵심 필드만 (id·name·email·role)
    console.warn('saveStoredUser: 1차 저장 실패 — 핵심 필드만 저장 시도', e?.message);
    try{
      const minimal={id:u.id, name:u.name, email:u.email, channel:u.channel,
        team:u.team, position:u.position, orgName:u.orgName,
        isAdmin:!!u.isAdmin, isSubAdmin:!!u.isSubAdmin};
      localStorage.setItem('ib_user', JSON.stringify(minimal));
    }catch(e2){
      console.error('saveStoredUser: 핵심 필드도 저장 실패 — localStorage 정리 필요', e2);
      // 최후 — 다른 큰 데이터 비우고 재시도
      try{localStorage.removeItem('sc_coach_state_v1');}catch(_){}
      try{localStorage.removeItem('interbiz_eduTypes');}catch(_){}
      try{localStorage.setItem('ib_user', JSON.stringify({id:u.id, name:u.name, email:u.email, isAdmin:!!u.isAdmin}));}catch(_){}
    }
  }
}
// 부관리자는 관리자 메뉴 접근 가능 — 페이지 reload 시에도 보장
if(CU?.isSubAdmin && !CU.isAdmin) CU.isAdmin=true;
let curLectId = null;
let curVidId = null;
function save(){ /* DB 저장은 각 함수에서 직접 처리 */ }

// ════════════════════════════════════════════════════════════
// 렌더 캐시 (A1) — 데이터 변경 없으면 동일 페이지 재렌더 skip
//   key: 함수명 + dataVersion + 필터 hash
//   dataVersion: D.users/videos 등 변경 시 ++ → 자동 무효화
// ════════════════════════════════════════════════════════════
window._renderCache = {};
window._dataVersion = 0;
function bumpDataVersion(){ window._dataVersion++; window._renderCache = {}; }
function renderCached(key, computeFn){
  const cacheKey = key + ':' + window._dataVersion;
  const cached = window._renderCache[cacheKey];
  if(cached !== undefined){ return cached; }
  const result = computeFn();
  window._renderCache[cacheKey] = result;
  return result;
}
// loadFromDB 가 D 갱신 시 자동 호출되도록 후처리
(function setupCacheInvalidation(){
  const _origLoadFromDB = window.loadFromDB;
  // loadFromDB 가 아직 정의 안 됐을 수도 → window.load 시점에 hook
  window.addEventListener('load', ()=>{
    if(typeof loadFromDB === 'function'){
      const orig = loadFromDB;
      window.loadFromDB = async function(...args){
        const result = await orig.apply(this, args);
        bumpDataVersion();
        return result;
      };
    }
  });
})();

/* ════════════════════════════════
   F2: 네트워크 재시도 헬퍼 (50명 동시 사용 안정성)
   - 5xx 또는 network 오류만 재시도, 4xx 는 즉시 반환
   - 지수 백오프 600ms → 1.5s → 4s, 총 3회
════════════════════════════════ */
async function fetchWithRetry(url, options={}, maxAttempts=3){
  let lastErr;
  for(let attempt=0; attempt<maxAttempts; attempt++){
    try{
      const r=await fetch(url, options);
      // 4xx 는 영구 오류 — 재시도해도 의미 없음 (인증·검증 실패 등)
      if(r.status>=400 && r.status<500) return r;
      // 5xx 또는 success 면 그대로 반환 (success 면 성공, 5xx 면 마지막 시도 결과)
      if(r.ok) return r;
      // 5xx 만 재시도
      lastErr=new Error('HTTP '+r.status);
      if(attempt<maxAttempts-1){
        await new Promise(res=>setTimeout(res, [600,1500,4000][attempt]||4000));
        continue;
      }
      return r; // 마지막 시도 결과 반환
    }catch(e){
      // 네트워크 오류 (TypeError: Failed to fetch 등)
      lastErr=e;
      if(attempt<maxAttempts-1){
        await new Promise(res=>setTimeout(res, [600,1500,4000][attempt]||4000));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/* ════════════════════════════════
   F4: 토큰 사전 갱신 (50명 동시 만료 폭주 방지)
   - 토큰 exp 가 24h 이내면 /api/auth/refresh 호출
   - 페이지 활성 상태에서 1시간마다 체크
════════════════════════════════ */
function decodeJwtExp(token){
  try{
    const part=token.split('.')[1];
    if(!part) return 0;
    const pad='='.repeat((4-part.length%4)%4);
    const b64=part.replace(/-/g,'+').replace(/_/g,'/')+pad;
    const json=atob(b64);
    return (JSON.parse(json).exp||0)*1000;  // ms
  }catch(_){return 0;}
}
async function refreshTokenIfNeeded(){
  const token=localStorage.getItem('ib_token')||'';
  if(!token) return;
  const expMs=decodeJwtExp(token);
  if(!expMs) return;
  const remainMs=expMs - Date.now();
  // 만료 24시간 이내 — 갱신 (이미 만료 시는 그냥 두면 다음 API 콜에서 401 → 재로그인)
  if(remainMs < 24*60*60*1000 && remainMs > 0){
    try{
      const r=await fetchWithRetry('/api/auth/refresh',{
        method:'POST',
        headers:{'Authorization':'Bearer '+token}
      });
      const j=await r.json().catch(()=>({}));
      if(r.ok && j.ok && j.token){
        localStorage.setItem('ib_token', j.token);
        console.log('[F4] 토큰 사전 갱신 완료');
      }
    }catch(e){
      console.warn('[F4] 토큰 갱신 실패 (무시):', e.message);
    }
  }
}
// 페이지 로드 시 1회 + 매시간 체크
window.addEventListener('load', ()=>{
  setTimeout(refreshTokenIfNeeded, 5000);  // 페이지 안정화 후 5초 뒤
  setInterval(refreshTokenIfNeeded, 60*60*1000);  // 1시간마다
});
// 탭 활성화 시 한번 더 체크 (다른 탭에서 만료된 토큰일 가능성)
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible') refreshTokenIfNeeded();
});

/* ════════════════════════════════
   W4: Supabase Realtime 구독 — 다른 사용자 변경을 즉시 인지
   - users·videos·evaluations·notifications INSERT/UPDATE/DELETE 구독
   - D 배열 in-place 갱신 + bumpDataVersion + 활성 페이지 재렌더
   - 단일 채널·단일 websocket 으로 50명 동시 안전 (Supabase 무료 한도: 200)
════════════════════════════════ */
let _realtimeChannel = null;
let _realtimeRerenderTimer = null;

function _scheduleRerender(){
  // 짧은 시간에 여러 이벤트 합치기 (debounce 200ms)
  clearTimeout(_realtimeRerenderTimer);
  _realtimeRerenderTimer = setTimeout(()=>{
    try{ if(typeof bumpDataVersion==='function') bumpDataVersion(); }catch(_){}
    const active = document.querySelector('.page.active')?.id || '';
    try{
      if(active==='page-admin' && typeof renderAdmin==='function') renderAdmin();
      else if(active==='page-pick' && typeof renderPick==='function') renderPick();
      else if(active==='page-edu' && typeof renderEduPage==='function') renderEduPage();
      else if(active==='page-mypage' && typeof renderMyProfile==='function') renderMyProfile();
    }catch(e){ console.warn('[realtime] re-render failed:', e); }
  }, 200);
}

function _applyUsersChange(payload){
  if(!D.users) return;
  const ev = payload.eventType;
  const row = payload.new || payload.old || {};
  const id = row.id;
  if(!id) return;
  // server 컬럼명(snake_case) → 클라 모델로 정규화 (D.users 와 동일 형태로)
  const norm = (r)=>({
    ...r,
    orgName: r.org_name ?? r.orgName,
    hireDate: r.hire_date ?? r.hireDate,
    birthDate: r.birth_date ?? r.birthDate,
    birthYear: r.birth_year ?? r.birthYear,
    isSubAdmin: r.is_sub_admin ?? r.isSubAdmin,
    deleted: r.deleted_at ? true : !!r.deleted,
  });
  if(ev==='DELETE'){
    D.users = D.users.filter(u=>u.id!==id);
  } else if(ev==='INSERT'){
    if(!D.users.find(u=>u.id===id)) D.users.push(norm(payload.new));
  } else if(ev==='UPDATE'){
    const idx = D.users.findIndex(u=>u.id===id);
    if(idx>=0) D.users[idx] = {...D.users[idx], ...norm(payload.new)};
    // 본인 정보가 바뀌면 CU 도 즉시 갱신
    if(CU && CU.id===id){
      const nu = norm(payload.new);
      Object.assign(CU, nu);
      try{ saveStoredUser(CU); }catch(_){}
    }
  }
  _scheduleRerender();
}

function _applyVideosChange(payload){
  if(!D.videos) return;
  const ev = payload.eventType;
  const row = payload.new || payload.old || {};
  const id = row.id;
  if(!id) return;
  if(ev==='DELETE'){
    D.videos = D.videos.filter(v=>v.id!==id);
  } else if(ev==='INSERT'){
    if(!D.videos.find(v=>v.id===id)) D.videos.push({...payload.new, userId: payload.new.user_id});
  } else if(ev==='UPDATE'){
    const idx = D.videos.findIndex(v=>v.id===id);
    if(idx>=0) D.videos[idx] = {...D.videos[idx], ...payload.new, userId: payload.new.user_id};
  }
  _scheduleRerender();
}

function _applyEvaluationsChange(payload){
  if(!D.evaluations) D.evaluations = [];
  const ev = payload.eventType;
  const row = payload.new || payload.old || {};
  const id = row.id;
  if(!id) return;
  if(ev==='DELETE') D.evaluations = D.evaluations.filter(e=>e.id!==id);
  else if(ev==='INSERT'){ if(!D.evaluations.find(e=>e.id===id)) D.evaluations.push(payload.new); }
  else if(ev==='UPDATE'){
    const idx = D.evaluations.findIndex(e=>e.id===id);
    if(idx>=0) D.evaluations[idx] = {...D.evaluations[idx], ...payload.new};
  }
  _scheduleRerender();
}

function _applyNotificationsChange(payload){
  // INSERT 만 의미 있음 — 본인 알림이면 뱃지 즉시 갱신
  if(payload.eventType !== 'INSERT') return;
  const n = payload.new || {};
  if(CU && (n.user_id===CU.id || n.target_user_id===CU.id)){
    try{ if(typeof refreshNotifBadge==='function') refreshNotifBadge(); }catch(_){}
  }
}

function setupRealtime(){
  if(!sb || !CU) return;
  // 중복 구독 방지
  try{ if(_realtimeChannel) sb.removeChannel(_realtimeChannel); }catch(_){}
  _realtimeChannel = sb.channel('interpick_main')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' },         _applyUsersChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'videos' },        _applyVideosChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluations' },   _applyEvaluationsChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, _applyNotificationsChange)
    .subscribe((status)=>{
      if(status==='SUBSCRIBED') console.log('[W4] Realtime 구독 활성 (users/videos/evaluations/notifications)');
      else if(status==='CHANNEL_ERROR') console.warn('[W4] Realtime 채널 오류 — publication 미설정 의심');
      else if(status==='TIMED_OUT') console.warn('[W4] Realtime 연결 시간 초과 — 재시도 권장');
    });
}

function teardownRealtime(){
  if(_realtimeChannel){
    try{ sb.removeChannel(_realtimeChannel); }catch(_){}
    _realtimeChannel = null;
  }
  clearTimeout(_realtimeRerenderTimer);
}

/* ════════════════════════════════
   TOP PROGRESS BAR (페이지 전환·네트워크 로딩 시각 신호)
════════════════════════════════ */
let _progressTimer=null, _progressActive=0;
function startProgress(){
  _progressActive++;
  const b=document.getElementById('top-progress');
  if(!b) return;
  b.classList.add('go');
  let v=parseFloat(b.style.width)||0;
  if(v>=80) v=10;
  clearInterval(_progressTimer);
  _progressTimer=setInterval(()=>{
    v=Math.min(85, v + Math.max(0.4, (85-v)*0.06));
    b.style.width=v+'%';
  },80);
}
function endProgress(){
  _progressActive=Math.max(0,_progressActive-1);
  if(_progressActive>0) return;
  const b=document.getElementById('top-progress');
  if(!b) return;
  clearInterval(_progressTimer);
  b.style.width='100%';
  setTimeout(()=>{ b.classList.remove('go'); b.style.width='0'; },280);
}
async function withProgress(fn){
  startProgress();
  try{ return await fn(); } finally { endProgress(); }
}
// 모든 /api/* 호출과 GCS 업로드에 자동 progress
(function(){
  const _origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const track = /\/api\//.test(url) || /storage\.googleapis\.com\/|supabase\.co\/storage\//.test(url);
    if(track) startProgress();
    try { return await _origFetch(input, init); }
    finally { if(track) endProgress(); }
  };
})();

// 이미지 자동 lazy load — 화면 밖 이미지는 지연 로드 (첫 진입 단축)
(function(){
  const apply=(img)=>{
    if(img.tagName!=='IMG') return;
    if(!img.hasAttribute('loading')) img.loading='lazy';
    if(!img.hasAttribute('decoding')) img.decoding='async';
  };
  // 이미 있는 이미지
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('img').forEach(apply);
  });
  // 동적으로 추가되는 이미지
  const obs=new MutationObserver(muts=>{
    muts.forEach(m=>{
      m.addedNodes.forEach(n=>{
        if(n.nodeType!==1) return;
        if(n.tagName==='IMG') apply(n);
        else if(n.querySelectorAll) n.querySelectorAll('img').forEach(apply);
      });
    });
  });
  if(document.body) obs.observe(document.body,{childList:true,subtree:true});
  else document.addEventListener('DOMContentLoaded',()=>obs.observe(document.body,{childList:true,subtree:true}));
})();

