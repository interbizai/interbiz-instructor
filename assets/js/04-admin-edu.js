/* 04-admin-edu.js — 관리자 시드 + 교육 카테고리/콘텐츠 + 링크카드 + 뱃지
   (index.html 6227~9463행에서 분리 · 로드 순서 유지 필수) */
/* ════════════════════════════════
   ADMIN
════════════════════════════════ */
// 첫 로그인 시 1회만 시드되는 기본 카테고리 (이후 관리자가 자유롭게 삭제/추가)
const EDU_CAT_SEED={
  edu:['거점집합교안','판경상 시나리오','판경상 교안','B2B교안','현장코칭교안','RP체크리스트','AI진단평가안']
};
function getEduCategories(type){
  // DB만 신뢰 (기본값은 시드 단계에서 DB에 들어감)
  const scope=type==='edu'||type==='cl'?[type]:['edu','cl'];
  let names=[];
  scope.forEach(t=>{
    names.push(...(D.eduCategories||[]).filter(c=>(c.type||'edu')===t).map(c=>c.name));
  });
  return [...new Set(names)];
}
// 기본 카테고리 최초 1회 DB 시드 (중복 방지)
async function seedEduCategoriesIfEmpty(){
  try{
    const eduRows=(D.eduCategories||[]).filter(c=>(c.type||'edu')==='edu');
    if(eduRows.length) return; // 이미 항목 있으면 스킵
    // 시드는 진짜 관리자가 특정 조직을 선택했을 때만 실행 (전체 조직 모드/부관리자 시드 차단)
    if(!D.activeOrg || !D.isRealAdmin) return;
    const seedKey='edu_categories_seeded_v1_'+D.activeOrg;
    if(localStorage.getItem(seedKey)==='1') return;
    const existingNames=new Set((D.eduCategories||[]).map(c=>c.name));
    for(let i=0;i<EDU_CAT_SEED.edu.length;i++){
      const name=EDU_CAT_SEED.edu[i];
      if(existingNames.has(name)) continue;
      let {error}=await sb.from('edu_categories').insert({name,sort_order:i+1,type:'edu',org_name:D.activeOrg});
      if(error && (error.message||'').toLowerCase().includes('column') && (error.message||'').toLowerCase().includes('type')){
        ({error}=await sb.from('edu_categories').insert({name,sort_order:i+1,org_name:D.activeOrg}));
      }
      if(error && (error.message||'').toLowerCase().includes('org_name')){
        // org_name 컬럼 미존재 → 마이그레이션 미실행 환경 폴백
        await sb.from('edu_categories').insert({name,sort_order:i+1});
      }
    }
    localStorage.setItem(seedKey,'1');
    const {data:ec2}=await sb.from('edu_categories').select('*').order('sort_order');
    D.eduCategories=ec2||[];
    localStorage.setItem('edu_categories_seeded_v1','1');
  }catch(e){ console.warn('seed edu categories failed:',e); }
}
// 교육종류 (Supabase가 유일 기준 · localStorage는 오프라인 캐시로만 사용)
// 주의: D 는 let 선언이라 window.D 는 undefined → typeof 체크로 우회
function getEduTypeRecords(){
  const dbRecs=(typeof D!=='undefined' && Array.isArray(D.eduTypes))?D.eduTypes:[];
  if(dbRecs.length) return dbRecs;
  // DB가 비어있고 앱 초기화 전이면 localStorage 캐시 사용 (org_name 정보는 없음)
  let localNames=[];
  try{ localNames=JSON.parse(localStorage.getItem('interbiz_eduTypes')||'[]'); }catch(e){}
  return localNames.filter(Boolean).map((n,i)=>({id:'local-'+i,name:n,org_name:null}));
}
function getEduTypes(){
  return getEduTypeRecords().map(r=>r?.name||r).filter(Boolean);
}
function setEduTypes(list){
  try{ localStorage.setItem('interbiz_eduTypes', JSON.stringify(list||[])); }catch(e){}
}
function buildCategorySelect(id,style){
  const cats=getEduCategories();
  return `<select id="${id}" style="${style||'padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px'}"><option value="">전체</option>${cats.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>`;
}
function renderEduPage(){
  const clArea=el('edu-checklist-area');
  const lkArea=el('edu-links-area');
  if(!clArea||!lkArea) return;
  // 교육자료 (체크리스트)
  const isAdmin=CU?.isAdmin;
  const catsEdu=getEduCategories('edu');
  const catsCl=getEduCategories('cl');
  // 체크리스트는 항상 마지막 그룹으로 노출 (파일이 있을 때만 실제 표시됨)
  const catsAll=[...new Set([...catsEdu,...catsCl,'체크리스트'])];
  let clHtml=isAdmin?`<div style="margin-bottom:16px;padding:14px;border:1px solid var(--bdr);border-radius:12px;background:#fafafa">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <input type="text" id="edu-cl-name" placeholder="자료명" style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px">
      <input type="date" id="edu-cl-date" style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px">
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <select id="edu-cl-cat" style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px;width:auto">
        ${catsEdu.map(c=>`<option value="${c}">${c}</option>`).join('')}
      </select>
      <select id="edu-cl-type" onchange="refreshEduCatDropdown()" style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px;width:auto">
        <option value="">체크리스트 타입 (해당 시)</option>
        <option value="standard">표준 (AI 독자용)</option>
        <option value="speech">스피치 (스피치용)</option>
        ${(getEduTypes()||[]).map(t=>`<option value="edutype:${t.replace(/"/g,'&quot;')}">${t.replace(/</g,'&lt;')} 체크리스트 (교육맞춤평가용)</option>`).join('')}
      </select>
      <input type="file" id="edu-cl-file" accept=".xlsx,.xls,.pdf,.pptx,.ppt,.docx,.doc" style="display:none" onchange="onChecklistFileSelected(this)">
      <button class="btn btn-ghost" style="padding:6px 12px;font-size:11px" onclick="document.getElementById('edu-cl-file').click()">파일 선택</button>
      <span id="edu-cl-fname" style="font-size:10px;color:var(--t3)"></span>
    </div>
    <div id="edu-cl-preview" style="display:none;margin-bottom:10px;padding:10px;background:#fff;border:1px solid var(--bdr);border-radius:8px"></div>
    <button class="btn btn-blue" style="padding:6px 14px;font-size:12px" onclick="uploadEduChecklist()">등록</button>
  </div>`:'';
  // 카테고리별 그룹 + 최신순
  let cats=catsAll;
  let sorted=[...(D.checklists||[])].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  // 데모 모드: 다른 교육명·5·6월 자료로 채움 (실데이터와 함께 표시)
  if(IB_DEMO()){
    const demoCl=demoEduMaterials();
    sorted=[...demoCl,...sorted].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
    cats=[...new Set([...demoCl.map(d=>d.category),...catsAll])];
  }
  cats.forEach(cat=>{
    const items=sorted.filter(c=>(c.category||'체크리스트')===cat);
    if(!items.length) return;
    const colorPool=['#0078C8','#10b981','#f59e0b','#8b5cf6','#E21E26','#ec4899','#06b6d4'];
    const catColors={};cats.forEach((c,i)=>catColors[c]=colorPool[i%colorPool.length]);
    clHtml+=`<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:12px;font-weight:800;color:${catColors[cat]||'var(--t1)'}">${cat}</span>
        <span style="font-size:10px;color:var(--t3)">(${items.length})</span>
      </div>`;
    clHtml+=items.map(c=>{
      const isCl=(c.category||'')==='체크리스트';
      const typeLbl=c.type==='standard'?'표준':c.type==='speech'?'스피치':(c.type||'');
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--bdr);border-radius:10px;margin-bottom:6px">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">${c.name}${typeLbl?` <span style="font-size:10px;padding:2px 6px;border-radius:10px;background:rgba(0,0,0,.06);color:var(--t2);font-weight:600;margin-left:4px">${typeLbl}</span>`:''}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">${c.file_name||''} · ${c.created_at?.slice(0,10)||''}</div>
      </div>
      <a href="${c.file_url}" download class="btn btn-blue" style="padding:5px 12px;font-size:11px" onclick="showToast('다운로드: ${c.name.replace(/'/g,"\\'")}','#0078C8')">다운로드</a>
      ${isAdmin&&isCl&&!c._demo?`<button class="btn btn-ghost" style="padding:5px 10px;font-size:10px;color:var(--blue)" onclick="openChecklistReupload(${c.id})">파일 교체</button>`:''}
      ${isAdmin&&!c._demo?`<button class="btn btn-ghost" style="padding:5px 8px;font-size:10px;color:var(--red)" onclick="deleteChecklist(${c.id})">삭제</button>`:''}
    </div>`;}).join('');
    clHtml+='</div>';
  });
  if(!sorted.length) clHtml+='<div style="padding:16px;text-align:center;font-size:12px;color:var(--t3)">등록된 교육자료가 없습니다</div>';
  // 카테고리 관리 — 교육자료 / 체크리스트 2개 섹션으로 분리 (관리자/부관리자만)
  if(isAdmin){
    const renderCatBox=(title,subtitle,type,catList,inputId,btnFn)=>{
      const chips=catList.map(c=>{
        const escN=String(c||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:16px;font-size:11px;font-weight:600;background:rgba(0,0,0,.05);color:var(--t1)">${c.replace(/</g,'&lt;')}<button style="border:none;background:none;cursor:pointer;color:var(--red);font-size:12px;padding:0 2px" onclick="deleteEduCategory('${escN}','${type}')">×</button></span>`;
      }).join('');
      return `<div style="margin-top:12px;padding:12px;border:1px solid var(--bdr);border-radius:10px;background:#fafafa">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
          <div style="font-size:12px;font-weight:800;color:var(--t1)">${title}</div>
          <div style="font-size:10px;color:var(--t3)">${subtitle}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${chips||'<span style="font-size:11px;color:var(--t3)">기본 카테고리만 있음</span>'}</div>
        <div style="display:flex;gap:6px">
          <input type="text" id="${inputId}" placeholder="새 카테고리명" style="flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
          <button class="btn btn-ghost" style="padding:5px 12px;font-size:11px" onclick="${btnFn}">추가</button>
        </div>
      </div>`;
    };
    clHtml+=`<div style="margin-top:16px">
      <div style="font-size:13px;font-weight:800;color:var(--t1);margin-bottom:4px">교육자료 카테고리 관리</div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:10px">교안·시나리오 카테고리(교육맞춤평가 평가에 사용). 체크리스트는 "체크리스트 타입" 드롭다운에서 교육종류별로 자동 생성됩니다.</div>
      ${renderCatBox('교육자료 카테고리','교안·시나리오용','edu',catsEdu,'new-edu-cat-edu',"addEduCategory('edu')")}
    </div>`;
  }
  clArea.innerHTML=clHtml;
  // 교육링크 (카드형 3개 가로)
  let lkHtml=isAdmin?`<div style="margin-bottom:16px;padding:14px;border:1px solid var(--bdr);border-radius:12px;background:#fafafa">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input type="text" id="edu-lk-name" placeholder="링크명" style="flex:1;min-width:160px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px">
      <input type="text" id="edu-lk-url" placeholder="URL" style="flex:2;min-width:240px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px">
      <input type="file" id="edu-lk-image" accept="image/*" style="display:none" onchange="document.getElementById('edu-lk-image-name').textContent=this.files[0]?.name||''">
      <button class="btn btn-ghost" style="padding:8px 12px;font-size:12px;display:inline-flex;align-items:center;gap:4px" onclick="document.getElementById('edu-lk-image').click()" title="대표 이미지 (선택) — 미선택 시 YouTube 썸네일·도메인 favicon 자동">🖼 이미지</button>
      <span id="edu-lk-image-name" style="font-size:10px;color:var(--t3);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
      <button class="btn btn-blue" style="padding:8px 18px;font-size:12px" onclick="addEduLink()">등록</button>
    </div>
    <div style="font-size:10px;color:var(--t3);margin-top:6px">💡 이미지를 등록하면 카드 대표 사진으로 표시. 미등록 시 YouTube 영상은 썸네일, 그 외는 도메인 favicon 자동 표시.</div>
  </div>`:'';
  lkHtml+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">';
  // sort_order 기준 정렬 — sort_order 없으면 created_at 폴백
  const sortedLinks = [...(D.learningLinks||[])].sort((a,b)=>{
    const ao=(a.sort_order==null)?9999:Number(a.sort_order);
    const bo=(b.sort_order==null)?9999:Number(b.sort_order);
    if(ao!==bo) return ao-bo;
    return (a.created_at||'').localeCompare(b.created_at||'');
  });
  const totalLinks=sortedLinks.length;
  lkHtml+=sortedLinks.map((lk,i)=>{
    const brand=getLinkBrand(lk.url);
    const ytId=brand.youtubeId;
    const customImg = lk.image_url || lk.thumbnail_url || '';
    // 우선순위: 관리자 등록 이미지 > YouTube 썸네일 > 도메인 favicon
    let previewHtml;
    if(customImg){
      previewHtml = `<div style="background:#fff;position:relative;overflow:hidden;line-height:0">
        <img src="${customImg}" loading="lazy" decoding="async" style="display:block;width:100%;height:auto" onerror="this.style.display='none'">
      </div>`;
    } else if(ytId){
      previewHtml = `<div style="height:140px;background:#000;position:relative;overflow:hidden">
        <img src="https://i.ytimg.com/vi/${ytId}/mqdefault.jpg" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;opacity:.95" onerror="this.style.display='none'">
      </div>`;
    } else {
      previewHtml = `<div style="height:120px;background:linear-gradient(135deg, ${brand.color} 0%, ${shadeColor(brand.color,-12)} 100%);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">
        <div style="position:absolute;inset:0;background:radial-gradient(circle at 25% 25%, rgba(255,255,255,.18) 0%, transparent 55%);pointer-events:none"></div>
        <div style="width:62px;height:62px;border-radius:14px;background:rgba(255,255,255,.95);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.18);z-index:1">
          <img src="${brand.favicon}" loading="lazy" decoding="async" style="width:38px;height:38px;object-fit:contain;border-radius:6px" onerror="this.outerHTML='<span style=&quot;font-size:22px;font-weight:900;color:${brand.color}&quot;>${(lk.name||'?')[0]}</span>'">
        </div>
      </div>`;
    }
    // 순서 변경 — 4개 버튼: ⇈ 맨위 / ↑ 앞 / ↓ 뒤 / ⇊ 맨아래
    const isFirst = (i===0);
    const isLast = (i===totalLinks-1);
    const mkBtn = (left, icon, action, disabled, title) => {
      const css = `position:absolute;top:8px;left:${left}px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;cursor:${disabled?'not-allowed':'pointer'};font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;z-index:3;opacity:${disabled?'.3':'1'};transition:background .15s`;
      const hover = disabled?'':`onmouseover="this.style.background='rgba(0,120,200,.9)'" onmouseout="this.style.background='rgba(0,0,0,.55)'"`;
      const onclick = disabled?'':`onclick="event.stopPropagation();event.preventDefault();${action};return false;"`;
      return `<button style="${css}" ${hover} ${onclick} title="${title}">${icon}</button>`;
    };
    const orderControls = isAdmin ? (
      mkBtn(8,  '⇈', `moveEduLinkOrder(${lk.id},'top')`,    isFirst, '맨 위로') +
      mkBtn(36, '↑', `moveEduLinkOrder(${lk.id},-1)`,        isFirst, '앞으로') +
      mkBtn(64, '↓', `moveEduLinkOrder(${lk.id},1)`,         isLast,  '뒤로') +
      mkBtn(92, '⇊', `moveEduLinkOrder(${lk.id},'bottom')`,  isLast,  '맨 아래로')
    ) : '';
    const adminControls=isAdmin?orderControls+`
      <button style="position:absolute;top:8px;right:42px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;z-index:3;transition:background .15s" onmouseover="this.style.background='rgba(0,120,200,.9)'" onmouseout="this.style.background='rgba(0,0,0,.55)'" onclick="event.stopPropagation();event.preventDefault();openEduLinkImagePicker(${lk.id});return false;" title="대표 이미지 변경">🖼</button>
      <button style="position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;z-index:3;transition:background .15s" onmouseover="this.style.background='rgba(220,38,38,.9)'" onmouseout="this.style.background='rgba(0,0,0,.55)'" onclick="event.stopPropagation();event.preventDefault();deleteLink(${lk.id});return false;" title="삭제">×</button>`:'';
    return `<div style="border-radius:14px;overflow:hidden;border:1px solid rgba(0,0,0,.06);cursor:pointer;transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s;position:relative;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.04)" onclick="window.open('${lk.url}','_blank')" onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 12px 28px rgba(0,0,0,.12)'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
      ${adminControls}
      ${previewHtml}
      <div style="padding:12px 14px 14px 14px">
        <div style="font-size:14px;font-weight:800;color:var(--t1);line-height:1.3;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${lk.name||'(이름 없음)'}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--t3)">
          <img src="${brand.favicon}" loading="lazy" decoding="async" style="width:13px;height:13px;border-radius:3px;object-fit:contain;flex-shrink:0" onerror="this.style.display='none'">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${brand.domain || lk.url}</span>
        </div>
      </div>
    </div>`;
  }).join('')||'<div style="grid-column:1/-1;padding:16px;text-align:center;font-size:12px;color:var(--t3)">등록된 교육링크가 없습니다</div>';
  lkHtml+='</div>';
  lkArea.innerHTML=lkHtml;
}

/* ════════════════════════════════
   링크 카드 헬퍼 — 도메인별 브랜드 컬러·favicon·YouTube 썸네일
════════════════════════════════ */
function shadeColor(hex, percent){
  // hex 컬러를 percent(-100~100) 만큼 밝게/어둡게
  const m=/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex||'');
  if(!m) return hex;
  const adj=(c)=>{ const n=Math.round(parseInt(c,16)*(100+percent)/100); return Math.max(0,Math.min(255,n)).toString(16).padStart(2,'0'); };
  return '#'+adj(m[1])+adj(m[2])+adj(m[3]);
}
function getLinkBrand(url){
  let domain='', host='';
  try{ const u=new URL(url); host=u.hostname.replace(/^www\./,''); domain=host; }catch(_){ domain=(url||'').slice(0,40); }
  // YouTube ID 추출 (videos·playlists 모두)
  let youtubeId=null;
  const ytMatch=/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?(?:.*&)?v=|embed\/|v\/|playlist\?list=|shorts\/)?([A-Za-z0-9_-]{6,})/i.exec(url||'');
  if(ytMatch && /youtu/i.test(url)){
    // playlist 면 첫 영상 썸네일 못 받으니 video id 형태일 때만 썸네일 표시
    if(/[?&]v=([A-Za-z0-9_-]{6,})/.test(url)){ youtubeId=RegExp.$1; }
    else if(/youtu\.be\/([A-Za-z0-9_-]{6,})/.test(url)){ youtubeId=RegExp.$1; }
  }
  // 도메인별 컬러·라벨 매핑 — 미정의 도메인은 도메인 해시 기반 컬러
  const brands={
    'youtube.com':   { color:'#FF0000', label:'YouTube' },
    'youtu.be':      { color:'#FF0000', label:'YouTube' },
    'naver.com':     { color:'#03C75A', label:'Naver' },
    'gmail.com':     { color:'#EA4335', label:'Gmail' },
    'mail.google.com':{ color:'#EA4335', label:'Gmail' },
    'worksmobile.com':{ color:'#00C300', label:'웍스모바일' },
    'works.do':      { color:'#00C300', label:'웍스모바일' },
    'kakao.com':     { color:'#FEE500', label:'카카오' },
    'singlex.com':   { color:'#0066FF', label:'싱글렉스' },
    'edumadang.singlex.com':{ color:'#0066FF', label:'배움마당' },
    'notion.so':     { color:'#000000', label:'Notion' },
    'github.com':    { color:'#181717', label:'GitHub' },
    'slack.com':     { color:'#4A154B', label:'Slack' },
    'figma.com':     { color:'#A259FF', label:'Figma' },
    'zoom.us':       { color:'#2D8CFF', label:'Zoom' },
    'meet.google.com':{ color:'#00897B', label:'Google Meet' },
    'docs.google.com':{ color:'#4285F4', label:'Google Docs' },
    'drive.google.com':{ color:'#1FA463', label:'Google Drive' },
  };
  let brand=brands[host];
  if(!brand){
    // 미정의 도메인 — 해시 기반 컬러 풀 (일관성 있음)
    const pool=['#0078C8','#E21E26','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4','#64748b'];
    let h=0; for(const ch of host) h=((h<<5)-h+ch.charCodeAt(0))|0;
    brand={ color: pool[Math.abs(h)%pool.length], label: host.split('.').slice(-2,-1)[0]?.toUpperCase() || '링크' };
  }
  brand.domain=domain;
  brand.favicon=host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : '';
  brand.youtubeId=youtubeId;
  return brand;
}
// 공용 YouTube ID 추출
function getYouTubeId(url){
  if(!url) return '';
  const m=String(url).match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return m?m[1]:'';
}
// (제거됨) 썸네일 업로드 기능 — 모든 카드를 외부링크 아이콘으로 통일하므로 불필요
// 호환 stub (다른 곳에서 참조해도 안 깨지게)
let _eduLinkThumbFile=null;
function onEduLinkThumbChange(){}
function clearEduLinkThumb(){}
async function uploadEduLinkThumb(){return '';}
async function editLinkThumb(){}
// ── 체크리스트 엑셀 파서 ─────────────────────────────
// 컬럼 매핑: 대항목 / 세부항목 / 평가기준(체크리스트) / 배점 / 평가기준 상세
window._parsedChecklistItems=null;
function onChecklistFileSelected(input){
  const file=input.files?.[0];
  const nameEl=document.getElementById('edu-cl-fname');
  if(nameEl) nameEl.textContent=file?.name||'';
  const prevEl=document.getElementById('edu-cl-preview');
  window._parsedChecklistItems=null;
  if(!file){if(prevEl){prevEl.style.display='none';prevEl.innerHTML='';}return;}
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext!=='xlsx'&&ext!=='xls'){
    if(prevEl){prevEl.style.display='block';prevEl.innerHTML='<div style="font-size:11px;color:var(--t3)">엑셀 외 파일은 파싱 없이 원본만 저장됩니다.</div>';}
    return;
  }
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      const items=parseChecklistRows(rows);
      window._parsedChecklistItems=items;
      renderChecklistPreview(items);
    }catch(err){
      if(prevEl){prevEl.style.display='block';prevEl.innerHTML=`<div style="font-size:11px;color:var(--red)">엑셀 파싱 실패: ${err.message}</div>`;}
    }
  };
  reader.readAsArrayBuffer(file);
}
function parseChecklistRows(rows){
  // 헤더 행 찾기
  let headerIdx=-1, colMap={};
  for(let i=0;i<Math.min(rows.length,10);i++){
    const r=rows[i].map(c=>String(c||'').trim());
    const find=(kws)=>r.findIndex(c=>kws.some(k=>c.includes(k)));
    const ci={
      category: find(['대항목','대분류']),
      sub_item: find(['세부항목','세부']),
      criterion: find(['평가기준','체크리스트','질문']),
      max_score: find(['배점','점수']),
      detail: find(['평가기준 상세','상세','기준 상세']),
    };
    if(ci.category>=0 && ci.sub_item>=0 && ci.criterion>=0 && ci.max_score>=0){
      headerIdx=i; colMap=ci; break;
    }
  }
  if(headerIdx<0) throw new Error('헤더(대항목/세부항목/평가기준/배점) 컬럼을 찾지 못했습니다.');
  const items=[];
  let sort=0;
  for(let i=headerIdx+1;i<rows.length;i++){
    const r=rows[i]; if(!r) continue;
    const cat=String(r[colMap.category]||'').trim();
    const sub=String(r[colMap.sub_item]||'').trim();
    const cri=String(r[colMap.criterion]||'').trim();
    const scoreRaw=r[colMap.max_score];
    const detail=colMap.detail>=0?String(r[colMap.detail]||'').trim():'';
    if(!cat&&!sub&&!cri) continue;
    const score=parseInt(scoreRaw)||0;
    if(!cat||!sub||!cri||score<=0) continue;
    items.push({category:cat,sub_item:sub,criterion:cri,max_score:score,detail,sort_order:sort++});
  }
  return items;
}
function renderChecklistPreview(items){
  const el=document.getElementById('edu-cl-preview');
  if(!el) return;
  const sum=items.reduce((a,x)=>a+x.max_score,0);
  const ok=sum===100;
  el.style.display='block';
  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:12px;font-weight:700">파싱 미리보기 — ${items.length}개 항목</div>
      <div style="font-size:12px;font-weight:800;color:${ok?'var(--green)':'var(--red)'}">배점 합계: ${sum}점 ${ok?'✓':'(100점 필요)'}</div>
    </div>
    <div style="max-height:220px;overflow-y:auto;border:1px solid var(--bdr);border-radius:6px">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead style="background:#f8f9fa;position:sticky;top:0">
          <tr>
            <th style="padding:6px;text-align:left;border-bottom:1px solid var(--bdr)">대항목</th>
            <th style="padding:6px;text-align:left;border-bottom:1px solid var(--bdr)">세부항목</th>
            <th style="padding:6px;text-align:left;border-bottom:1px solid var(--bdr)">평가기준</th>
            <th style="padding:6px;text-align:center;border-bottom:1px solid var(--bdr);width:50px">배점</th>
            <th style="padding:6px;text-align:left;border-bottom:1px solid var(--bdr)">평가기준 상세</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(x=>`<tr>
            <td style="padding:5px 6px;border-bottom:1px solid rgba(0,0,0,.04);font-weight:600">${x.category}</td>
            <td style="padding:5px 6px;border-bottom:1px solid rgba(0,0,0,.04)">${x.sub_item}</td>
            <td style="padding:5px 6px;border-bottom:1px solid rgba(0,0,0,.04);color:var(--t2)">${x.criterion}</td>
            <td style="padding:5px 6px;border-bottom:1px solid rgba(0,0,0,.04);text-align:center;font-weight:700">${x.max_score}</td>
            <td style="padding:5px 6px;border-bottom:1px solid rgba(0,0,0,.04);color:var(--t3);font-size:10px">${x.detail||''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── 체크리스트 파일 교체 (항목 재파싱) ─────────
window._reuploadCLId=null;
window._reuploadParsedItems=null;
function openChecklistReupload(id){
  window._reuploadCLId=id;
  window._reuploadParsedItems=null;
  const existing=(D.checklists||[]).find(c=>c.id===id);
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='cl-reupload-overlay';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;padding:24px;max-width:720px;width:92vw;max-height:85vh;overflow-y:auto;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:16px;font-weight:900">체크리스트 파일 교체 — ${existing?.name||''}</div>
      <button style="border:none;background:none;cursor:pointer;font-size:20px;color:var(--t3)" onclick="document.getElementById('cl-reupload-overlay').remove()">✕</button>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-bottom:12px">기존 항목이 삭제되고 새 엑셀로 교체됩니다. 배점 합계 100점 필수.</div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <label style="font-size:11px;font-weight:700;color:var(--t2)">타입</label>
      <select id="cl-reupload-type" style="padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:12px">
        <option value="standard" ${existing?.type==='standard'?'selected':''}>표준 (영상/스트리밍용)</option>
        <option value="speech" ${existing?.type==='speech'?'selected':''}>스피치 (스피치용)</option>
      </select>
      <input type="file" id="cl-reupload-file" accept=".xlsx,.xls" style="display:none" onchange="onChecklistReuploadFileSelected(this)">
      <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" onclick="document.getElementById('cl-reupload-file').click()">엑셀 파일 선택</button>
      <span id="cl-reupload-fname" style="font-size:11px;color:var(--t3)"></span>
    </div>
    <div id="cl-reupload-preview" style="margin-bottom:14px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="document.getElementById('cl-reupload-overlay').remove()">취소</button>
      <button class="btn btn-blue" id="cl-reupload-save-btn" onclick="confirmChecklistReupload()" disabled style="opacity:.5">교체 저장</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}
function onChecklistReuploadFileSelected(input){
  const file=input.files?.[0];
  const nameEl=document.getElementById('cl-reupload-fname');
  const prev=document.getElementById('cl-reupload-preview');
  const saveBtn=document.getElementById('cl-reupload-save-btn');
  if(nameEl) nameEl.textContent=file?.name||'';
  window._reuploadParsedItems=null;
  if(saveBtn){saveBtn.disabled=true;saveBtn.style.opacity='.5';}
  if(!file||!prev) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      const items=parseChecklistRows(rows);
      const sum=items.reduce((a,x)=>a+x.max_score,0);
      window._reuploadParsedItems=items;
      prev.innerHTML=`
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:12px;font-weight:700">파싱 미리보기 — ${items.length}개 항목</div>
          <div style="font-size:12px;font-weight:800;color:${sum===100?'var(--green)':'var(--red)'}">배점 합계: ${sum}점 ${sum===100?'✓':'(100점 필요)'}</div>
        </div>
        <div style="max-height:300px;overflow-y:auto;border:1px solid var(--bdr);border-radius:6px">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead style="background:#f8f9fa;position:sticky;top:0">
              <tr>
                <th style="padding:6px;text-align:left">대항목</th>
                <th style="padding:6px;text-align:left">세부항목</th>
                <th style="padding:6px;text-align:left">평가기준</th>
                <th style="padding:6px;text-align:center;width:40px">배점</th>
                <th style="padding:6px;text-align:left">상세</th>
              </tr>
            </thead>
            <tbody>${items.map(x=>`<tr>
              <td style="padding:5px 6px;font-weight:600">${x.category}</td>
              <td style="padding:5px 6px">${x.sub_item}</td>
              <td style="padding:5px 6px;color:var(--t2)">${x.criterion}</td>
              <td style="padding:5px 6px;text-align:center;font-weight:700">${x.max_score}</td>
              <td style="padding:5px 6px;color:var(--t3);font-size:10px">${x.detail||''}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
      if(saveBtn&&sum===100&&items.length){saveBtn.disabled=false;saveBtn.style.opacity='1';}
    }catch(err){
      prev.innerHTML=`<div style="font-size:11px;color:var(--red)">엑셀 파싱 실패: ${err.message}</div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}
async function confirmChecklistReupload(){
  const id=window._reuploadCLId;
  const items=window._reuploadParsedItems;
  const file=document.getElementById('cl-reupload-file')?.files?.[0];
  if(!id||!items?.length||!file){alert('파일을 선택하고 파싱을 완료하세요.');return;}
  const sum=items.reduce((a,x)=>a+x.max_score,0);
  if(sum!==100){alert('배점 합계가 100점이어야 합니다.');return;}
  // 파일 Storage 업로드
  const ext=file.name.split('.').pop()||'xlsx';
  const path=`checklists/${Date.now()}.${ext}`;
  const{error:ue}=await sb.storage.from('files').upload(path,file);
  if(ue){alert('파일 업로드 실패: '+ue.message);return;}
  const{data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
  const type=document.getElementById('cl-reupload-type')?.value||'standard';
  // checklist_files 갱신 (file_url + file_name + type)
  const{error:upErr}=await sb.from('checklist_files').update({file_url:publicUrl,file_name:file.name,type}).eq('id',id);
  if(upErr){alert('파일 URL 갱신 실패: '+upErr.message);return;}
  // 기존 항목 전체 삭제
  const{error:delErr}=await sb.from('checklist_items').delete().eq('checklist_id',id);
  if(delErr){alert('기존 항목 삭제 실패: '+delErr.message);return;}
  // 신규 항목 일괄 INSERT
  const payload=items.map(x=>({
    checklist_id:id, category:x.category, sub_item:x.sub_item,
    criterion:x.criterion, max_score:x.max_score, detail:x.detail||null, sort_order:x.sort_order
  }));
  const{error:insErr}=await sb.from('checklist_items').insert(payload);
  if(insErr){alert('항목 저장 실패: '+insErr.message);return;}
  document.getElementById('cl-reupload-overlay')?.remove();
  window._reuploadCLId=null;window._reuploadParsedItems=null;
  await loadFromDB();renderEduPage();
  alert('교체 완료');
}

async function uploadEduChecklist(){
  const name=document.getElementById('edu-cl-name')?.value?.trim();
  const file=document.getElementById('edu-cl-file')?.files?.[0];
  if(!name||!file){alert('자료명과 파일을 입력하세요');return;}
  let cat=document.getElementById('edu-cl-cat')?.value||'체크리스트';
  const rawType=document.getElementById('edu-cl-type')?.value||null;
  // 체크리스트 타입이 선택됐으면 카테고리를 '체크리스트'로 강제 (분류 일관성)
  // edutype:XXX 형식이면 실제 type 값은 XXX (교육종류명)
  let type=rawType;
  if(rawType){
    cat='체크리스트';
    if(rawType.startsWith('edutype:')) type=rawType.slice(8);
  }
  const items=window._parsedChecklistItems;
  // 체크리스트면 파싱 결과 + 배점 100 검증 필수
  if(cat==='체크리스트'){
    if(!items||!items.length){alert('체크리스트 엑셀을 업로드하고 파싱 결과를 확인하세요.');return;}
    const sum=items.reduce((a,x)=>a+x.max_score,0);
    if(sum!==100){alert(`배점 합계가 ${sum}점입니다. 100점이어야 합니다.`);return;}
    if(!rawType){alert('체크리스트 타입을 선택하세요.');return;}
  }
  const ext=file.name.split('.').pop()||'file';
  const path=`checklists/${Date.now()}.${ext}`;
  const{error:ue}=await sb.storage.from('files').upload(path,file);
  if(ue){alert('업로드 실패: '+ue.message);return;}
  const{data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
  const insertPayload={name,file_name:file.name,file_url:publicUrl,category:cat,month:new Date().getMonth()+1,uploader:CU?.name||'관리자'};
  if(type) insertPayload.type=type;
  const{data:inserted,error:dbErr}=await sb.from('checklist_files').insert({...insertPayload,org_name:curOrg()}).select().single();
  if(dbErr){alert('DB 저장 실패: '+dbErr.message);return;}
  // 체크리스트 세부 항목 저장
  if(cat==='체크리스트' && items?.length && inserted?.id){
    const itemsPayload=items.map(x=>({
      checklist_id:inserted.id,
      category:x.category, sub_item:x.sub_item, criterion:x.criterion,
      max_score:x.max_score, detail:x.detail||null, sort_order:x.sort_order
    }));
    const{error:itErr}=await sb.from('checklist_items').insert(itemsPayload);
    if(itErr){alert('항목 저장 실패: '+itErr.message+'\n파일은 등록됐습니다. 항목만 재시도해주세요.');}
  }
  window._parsedChecklistItems=null;
  const prevEl=document.getElementById('edu-cl-preview');if(prevEl){prevEl.style.display='none';prevEl.innerHTML='';}
  // 폼 초기화
  const nameEl=document.getElementById('edu-cl-name');if(nameEl) nameEl.value='';
  const dateEl=document.getElementById('edu-cl-date');if(dateEl) dateEl.value='';
  const typeEl=document.getElementById('edu-cl-type');if(typeEl) typeEl.value='';
  const fileEl=document.getElementById('edu-cl-file');if(fileEl) fileEl.value='';
  const fnameEl=document.getElementById('edu-cl-fname');if(fnameEl) fnameEl.textContent='';
  await loadFromDB();renderEduPage();
  showToast(`"${name}" 등록되었습니다`);
}
async function addEduLink(){
  const name=document.getElementById('edu-lk-name')?.value?.trim();
  const url=document.getElementById('edu-lk-url')?.value?.trim();
  if(!name||!url){showToast('링크명과 URL을 입력하세요','#f59e0b');return;}
  // 이미지 (선택)
  let imageUrl='';
  const imgFile=document.getElementById('edu-lk-image')?.files?.[0];
  if(imgFile){
    try{
      let upload=imgFile;
      if(upload.size>1.5*1024*1024 && typeof compressImage==='function'){
        try{ upload=await compressImage(upload, 2*1024*1024, 1600); }catch(_){}
      }
      const ext=(upload.name||imgFile.name||'cover.jpg').split('.').pop()||'jpg';
      const path=`edu_links/${Date.now()}.${ext}`;
      const {error:ue}=await sb.storage.from('files').upload(path, upload, {contentType:upload.type||'image/jpeg', upsert:false});
      if(ue) throw new Error(ue.message);
      const {data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
      imageUrl=publicUrl;
    }catch(e){
      showToast('이미지 업로드 실패: '+(e?.message||e),'#ef4444');
      return;
    }
  }
  const payload={name,url,category:'학습',org_name:curOrg()};
  if(imageUrl) payload.image_url=imageUrl;
  let {error:lkErr}=await sb.from('learning_links').insert(payload);
  // image_url 컬럼이 없으면 폴백 (한 번 더 시도)
  if(lkErr && /image_url|column/i.test(lkErr.message||'')){
    console.warn('image_url 컬럼 미존재 → 마이그레이션 SQL 실행 필요. 일단 이미지 없이 등록.');
    delete payload.image_url;
    ({error:lkErr}=await sb.from('learning_links').insert(payload));
  }
  if(lkErr){showToast('등록 실패: '+lkErr.message,'#ef4444');return;}
  // 폼 초기화
  document.getElementById('edu-lk-name').value='';
  document.getElementById('edu-lk-url').value='';
  const imgInput=document.getElementById('edu-lk-image'); if(imgInput) imgInput.value='';
  const imgName=document.getElementById('edu-lk-image-name'); if(imgName) imgName.textContent='';
  await loadFromDB();renderEduPage();showToast(`"${name}" 등록되었습니다`);
}

// 교육링크 순서 변경 — 매번 모든 카드 1..N 로 깔끔 재정렬 (일관성 보장)
// dir: -1 (앞으로) | 1 (뒤로) | 'top' (맨위) | 'bottom' (맨아래)
async function moveEduLinkOrder(linkId, dir){
  if(!CU?.isAdmin && !CU?.isSubAdmin){ alert('관리자/부관리자만 가능합니다.'); return; }
  // 현재 정렬 상태
  const list = [...(D.learningLinks||[])].sort((a,b)=>{
    const ao=(a.sort_order==null)?9999:Number(a.sort_order);
    const bo=(b.sort_order==null)?9999:Number(b.sort_order);
    if(ao!==bo) return ao-bo;
    return (a.created_at||'').localeCompare(b.created_at||'');
  });
  const idx = list.findIndex(x=>x.id===linkId);
  if(idx<0) return;
  // 새 위치 계산
  let newIdx;
  if(dir==='top') newIdx=0;
  else if(dir==='bottom') newIdx=list.length-1;
  else newIdx = idx + Number(dir);
  if(newIdx<0 || newIdx>=list.length || newIdx===idx) return;
  // 배열에서 이동
  const [moved] = list.splice(idx, 1);
  list.splice(newIdx, 0, moved);
  // 모든 카드의 sort_order 를 1..N 로 재할당 (값이 다른 것만 업데이트)
  const updates = [];
  const rollback = [];
  list.forEach((lk, i)=>{
    const newOrder = i + 1;
    const oldOrder = (lk.sort_order==null)?null:Number(lk.sort_order);
    if(oldOrder !== newOrder){
      rollback.push({id: lk.id, old: oldOrder});
      lk.sort_order = newOrder;
      updates.push({id: lk.id, order: newOrder});
    }
  });
  // 즉시 화면 반영 (optimistic)
  renderEduPage();
  // DB 일괄 업데이트
  try{
    const results = await Promise.all(
      updates.map(u => sb.from('learning_links').update({sort_order: u.order}).eq('id', u.id))
    );
    const firstErr = results.find(r=>r.error);
    if(firstErr){
      const msg=(firstErr.error.message||'').toLowerCase();
      if(msg.includes('sort_order')||msg.includes('column')){
        rollback.forEach(rb=>{
          const lk=(D.learningLinks||[]).find(x=>x.id===rb.id);
          if(lk) lk.sort_order=rb.old;
        });
        renderEduPage();
        alert("순서 컬럼이 DB 에 없습니다.\n\nSupabase SQL Editor 에서 다음 실행:\nALTER TABLE learning_links ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;\nNOTIFY pgrst, 'reload schema';");
        return;
      }
      throw new Error(firstErr.error.message);
    }
  }catch(e){
    // 다른 오류 → 롤백
    rollback.forEach(rb=>{
      const lk=(D.learningLinks||[]).find(x=>x.id===rb.id);
      if(lk) lk.sort_order=rb.old;
    });
    renderEduPage();
    alert('순서 변경 실패: '+(e?.message||e));
  }
}

// 대표 이미지 변경 버튼 → 카드 외부에 file input 생성해서 사진첩/파일 선택
// (카드 내부에 input 두면 .click() 이벤트가 카드 onclick 으로 전파되어 URL 이동 발생)
function openEduLinkImagePicker(linkId){
  const inp=document.createElement('input');
  inp.type='file';
  inp.accept='image/*';
  inp.style.display='none';
  inp.onchange=()=>{ changeEduLinkImage(linkId, inp); setTimeout(()=>inp.remove(),100); };
  document.body.appendChild(inp);
  inp.click();
}

// 기존 링크 대표 이미지 변경 (관리자 전용)
async function changeEduLinkImage(linkId, input){
  const file=input?.files?.[0];
  if(!file) return;
  if(!/^image\//i.test(file.type)){ alert('이미지 파일만 가능합니다.'); input.value=''; return; }
  try{
    let upload=file;
    if(upload.size>1.5*1024*1024 && typeof compressImage==='function'){
      try{ upload=await compressImage(upload, 2*1024*1024, 1600); }catch(_){}
    }
    const ext=(upload.name||file.name||'cover.jpg').split('.').pop()||'jpg';
    const path=`edu_links/${linkId}_${Date.now()}.${ext}`;
    const {error:ue}=await sb.storage.from('files').upload(path, upload, {contentType:upload.type||'image/jpeg', upsert:false});
    if(ue) throw new Error(ue.message);
    const {data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
    const {error:dbErr}=await sb.from('learning_links').update({image_url:publicUrl}).eq('id', linkId);
    if(dbErr){
      if(/image_url|column/i.test(dbErr.message||'')){
        alert('image_url 컬럼이 없습니다.\n\n다음 SQL 을 Supabase SQL Editor 에서 실행해주세요:\nALTER TABLE learning_links ADD COLUMN IF NOT EXISTS image_url TEXT;');
        return;
      }
      throw new Error(dbErr.message);
    }
    await loadFromDB();
    renderEduPage();
    if(typeof showToast==='function') showToast('✓ 대표 이미지 변경 완료','#10b981');
  }catch(e){
    alert('이미지 변경 실패: '+(e?.message||e));
  }
  input.value='';
}
async function addEduCategory(type){
  type=(type==='cl'?'cl':'edu');
  const inputId=type==='cl'?'new-edu-cat-cl':'new-edu-cat-edu';
  const legacyInput=document.getElementById('new-edu-cat');
  const input=document.getElementById(inputId)||legacyInput;
  const name=input?.value?.trim();
  if(!name){alert('카테고리명을 입력하세요');return;}
  // 진짜 관리자가 '전체 조직' 모드면 어느 조직에 추가할지 모호 → 차단
  if(D.isRealAdmin && !D.activeOrg){
    alert('상단 드롭다운에서 조직을 먼저 선택하세요. (전체 조직 모드에서는 추가 불가)');
    return;
  }
  // 기존 항목과 중복 체크
  if(getEduCategories(type).includes(name)){alert('이미 존재하는 카테고리입니다.');return;}
  const order=(D.eduCategories||[]).length+1;
  const orgName=curOrg();
  // 1차: type + org_name 포함 insert
  let {error}=await sb.from('edu_categories').insert({name,sort_order:order,type,org_name:orgName});
  if(error){
    const msg=(error.message||'').toLowerCase();
    // org_name 컬럼 없으면 제외 후 재시도
    if(msg.includes('column') && msg.includes('org_name')){
      console.warn('edu_categories.org_name 컬럼 없음 — 제외 후 재시도');
      ({error}=await sb.from('edu_categories').insert({name,sort_order:order,type}));
    }
  }
  if(error){
    const msg=(error.message||'').toLowerCase();
    // type 컬럼 없으면 제외 후 재시도 (ALTER 실행 전에도 동작)
    if(msg.includes('column') && msg.includes('type')){
      console.warn('edu_categories.type 컬럼 없음 — 제외 후 재시도');
      ({error}=await sb.from('edu_categories').insert({name,sort_order:order,org_name:orgName}));
      if(error && (error.message||'').toLowerCase().includes('org_name')){
        ({error}=await sb.from('edu_categories').insert({name,sort_order:order}));
      }
    }
  }
  if(error){alert('추가 실패: '+error.message);return;}
  if(input) input.value='';
  await loadFromDB();renderEduPage();
}
async function deleteEduCategory(name,type){
  if(!confirm(`"${name}" 카테고리를 삭제하시겠습니까?`))return;
  // 1) 같은 이름의 모든 관련 행 조회 (현재 조직 + NULL 레거시)
  let relatedRows=[];
  try{
    let q=sb.from('edu_categories').select('*').eq('name',name);
    if(D.activeOrg) q=q.or(`org_name.eq.${D.activeOrg},org_name.is.null`);
    const r=await q;
    relatedRows=r?.data||[];
  }catch(e){ console.warn('select related edu_categories failed:',e); }
  // 2) 각 행을 id 단위로 삭제 (현재 조직 행 + NULL 레거시 행만)
  let dbDeleted=0;
  for(const row of relatedRows){
    try{
      const r=await sb.from('edu_categories').delete().eq('id',row.id).select();
      const cnt=r?.data?.length||0;
      dbDeleted+=cnt;
    }catch(e){ console.warn('  delete failed for id=',row.id,e); }
  }
  if(relatedRows.length>0 && dbDeleted===0){
    alert('삭제되지 않았습니다. Supabase RLS / GRANT 확인 필요.\n\nALTER TABLE edu_categories DISABLE ROW LEVEL SECURITY;\nGRANT ALL ON edu_categories TO anon, authenticated;');
    return;
  }
  // 3) NULL 레거시 행이 삭제됐으면 다른 조직에 fork (현재 조직만 사라지고 다른 조직 보존)
  const hadNullRow=relatedRows.some(r=>!r.org_name);
  if(hadNullRow && D.activeOrg && Array.isArray(D.orgList) && D.orgList.length){
    const otherOrgs=D.orgList.filter(o=>o && o!==D.activeOrg);
    for(const otherOrg of otherOrgs){
      try{
        const dup=await sb.from('edu_categories').select('id').eq('name',name).eq('org_name',otherOrg).limit(1);
        if(!dup?.data?.length){
          // fork 시 type 도 첫 NULL 행과 동일하게 유지
          const t=(relatedRows.find(r=>!r.org_name)||{}).type||type||'edu';
          await sb.from('edu_categories').insert({name, type:t, sort_order:0, org_name:otherOrg});
        }
      }catch(e){ console.warn('fork edu_category to',otherOrg,'failed:',e); }
    }
  }
  await loadFromDB();renderEduPage();
}
// 등록 폼의 카테고리 드롭다운: 체크리스트 타입 선택 시 숨김 (체크리스트로 자동 분류됨)
function refreshEduCatDropdown(){
  const typeSel=document.getElementById('edu-cl-type');
  const catSel=document.getElementById('edu-cl-cat');
  if(!typeSel||!catSel) return;
  const isCl=!!typeSel.value;
  if(isCl){
    // 체크리스트로 자동 분류 — 카테고리 드롭다운 숨김
    catSel.style.display='none';
  } else {
    // 교육자료 카테고리 사용
    catSel.style.display='';
    const cats=getEduCategories('edu');
    const prev=catSel.value;
    catSel.innerHTML=cats.map(c=>`<option value="${c}">${c}</option>`).join('');
    if(cats.includes(prev)) catSel.value=prev;
  }
}
async function deleteChecklist(id){
  if(!confirm('삭제하시겠습니까?'))return;
  const target=(D.checklists||[]).find(c=>c.id===id);
  const title=target?.name||'항목';
  // 1) FK 제약 회피: 이 체크리스트를 참조하는 evaluations.checklist_id 를 null 처리
  try{
    const {error:upErr,count}=await sb.from('evaluations').update({checklist_id:null}).eq('checklist_id',id);
    if(upErr) console.warn('evaluations null 업데이트 경고:',upErr.message);
  }catch(e){ console.warn('evaluations null 업데이트 예외:',e); }
  // 2) checklist_items (세부 항목) 먼저 삭제
  try{
    const {error:itErr}=await sb.from('checklist_items').delete().eq('checklist_id',id);
    if(itErr) console.warn('checklist_items 삭제 경고:',itErr.message);
  }catch(e){ console.warn('checklist_items 삭제 예외:',e); }
  // 3) checklist_files 본 레코드 삭제
  const {data,error}=await sb.from('checklist_files').delete().eq('id',id).select();
  if(error){
    showToast('삭제 실패: '+error.message,'#ef4444');
    const msg=error.message||'';
    // FK 에러면 수동 조치 안내 제공
    if(msg.toLowerCase().includes('foreign key')){
      alert(`삭제 실패 (외래키 제약):\n${msg}\n\n영구 해결을 원하시면 Supabase SQL Editor에서 아래 한 번 실행:\n\nALTER TABLE evaluations DROP CONSTRAINT IF EXISTS evaluations_checklist_id_fkey;\nALTER TABLE evaluations ADD CONSTRAINT evaluations_checklist_id_fkey\n  FOREIGN KEY (checklist_id) REFERENCES checklist_files(id) ON DELETE SET NULL;`);
    } else {
      alert(`삭제 실패: ${msg}\n\nSupabase RLS 확인 필요:\nCREATE POLICY "checklist_files_all" ON checklist_files FOR ALL TO anon,authenticated USING (true) WITH CHECK (true);\nGRANT SELECT,INSERT,UPDATE,DELETE ON checklist_files TO anon,authenticated;`);
    }
    return;
  }
  if(!data||!data.length){
    showToast('삭제되지 않았습니다 (RLS 차단)','#ef4444');
    alert('삭제가 DB에서 반영되지 않았습니다. Supabase RLS 정책을 확인하세요:\n\nCREATE POLICY "checklist_files_all" ON checklist_files FOR ALL TO anon,authenticated USING (true) WITH CHECK (true);');
    return;
  }
  await loadFromDB();
  if(typeof renderEduPage==='function') renderEduPage();
  if(typeof renderChecklists==='function') renderChecklists();
  showToast(`"${title}" 삭제되었습니다`,'#6b7280');
}
async function deleteLink(id){
  if(!confirm('삭제하시겠습니까?'))return;
  const target=(D.learningLinks||[]).find(l=>l.id===id);
  const title=target?.name||'링크';
  const{data,error}=await sb.from('learning_links').delete().eq('id',id).select();
  if(error){showToast('삭제 실패: '+error.message,'#ef4444');return;}
  if(!data||!data.length){showToast('삭제되지 않았습니다 (RLS 차단)','#ef4444');return;}
  await loadFromDB();renderEduPage();
  showToast(`"${title}" 삭제되었습니다`,'#6b7280');
}

/* ── 인터PICK 대시보드 ── */
// 히어로 타이틀/부제 — DB 로드 + 스타일 복원
// 값 포맷: JSON 문자열 {text,color,font,weight,italic} — 레거시는 평문도 허용
const HERO_DEFAULTS={
  hero_title:{text:'강사가 성장하면, 현장이 달라집니다',color:'#0a0a0a',font:'inherit',weight:900,italic:false,align:'center'},
  hero_sub:{text:'수백 명의 판매 현장을 움직이는 건, 결국 당신의 역량입니다.',color:'#475569',font:'inherit',weight:700,italic:false,align:'center'}
};
function parseHeroValue(raw,fallback){
  if(!raw) return {...fallback};
  try{
    const o=JSON.parse(raw);
    if(o&&typeof o==='object'&&typeof o.text==='string') return {...fallback,...o};
  }catch(e){}
  return {...fallback,text:String(raw)};
}
function applyHeroStyle(elx,cfg){
  if(!elx) return;
  elx.textContent=cfg.text;
  // scoped CSS 의 !important 규칙을 이기려면 setProperty + 'important' 사용
  if(cfg.color) elx.style.setProperty('color',cfg.color,'important');
  else elx.style.removeProperty('color');
  if(cfg.font && cfg.font!=='inherit') elx.style.setProperty('font-family',cfg.font,'important');
  else elx.style.removeProperty('font-family');
  if(cfg.weight) elx.style.setProperty('font-weight',String(cfg.weight),'important');
  else elx.style.removeProperty('font-weight');
  elx.style.setProperty('font-style',cfg.italic?'italic':'normal','important');
  // 정렬 — 클래스로 지정 (모바일 CSS 가 항상 center 로 override 가능하게)
  const align=cfg.align||'center';
  elx.classList.remove('hero-align-left','hero-align-center','hero-align-right');
  elx.classList.add(`hero-align-${align}`);
  // 헤로 컨테이너 (제목+수정 버튼 row) 도 같은 클래스
  const inner=elx.closest('.pick-hero-inner');
  if(inner){
    inner.classList.remove('hero-align-left','hero-align-center','hero-align-right');
    inner.classList.add(`hero-align-${align}`);
  }
}
async function loadHeroText(){
  const t=el('pick-hero-title'), s=el('pick-hero-sub');
  let tCfg={...HERO_DEFAULTS.hero_title}, sCfg={...HERO_DEFAULTS.hero_sub};
  // 1) localStorage 먼저 기본값으로 깔기 (DB 가 비어 있어도 커스텀 값 유지)
  const lt=localStorage.getItem('hero_title'), ls=localStorage.getItem('hero_sub');
  if(lt) tCfg=parseHeroValue(lt,HERO_DEFAULTS.hero_title);
  if(ls) sCfg=parseHeroValue(ls,HERO_DEFAULTS.hero_sub);
  // 2) Supabase 가 값이 있으면 덮어쓰기 (없으면 localStorage 유지)
  let usedLocal=!!(lt||ls);
  try{
    const{data,error}=await sb.from('app_settings').select('key,value').in('key',['hero_title','hero_sub']);
    if(error) throw error;
    const map=Object.fromEntries((data||[]).map(r=>[r.key,r.value]));
    if(map.hero_title){tCfg=parseHeroValue(map.hero_title,HERO_DEFAULTS.hero_title);usedLocal=false}
    if(map.hero_sub){sCfg=parseHeroValue(map.hero_sub,HERO_DEFAULTS.hero_sub);usedLocal=false}
  }catch(e){}
  window._heroLocalMode=usedLocal;
  applyHeroStyle(t,tCfg); applyHeroStyle(s,sCfg);
  window._heroCfg={hero_title:tCfg,hero_sub:sCfg};
  // 관리자/부관리자만 수정 버튼
  const canEdit=!!(CU?.isAdmin||CU?.isSubAdmin);
  const tb=el('pick-edit-title-btn'), sb2=el('pick-edit-sub-btn');
  const addImgBtn=el('pick-add-hero-image-btn');
  if(tb) tb.style.display=canEdit?'':'none';
  if(sb2) sb2.style.display=canEdit?'':'none';
  if(addImgBtn) addImgBtn.style.display=canEdit?'':'none';
  // 히어로 이미지 로드
  await loadHeroImage();
}

// 히어로 이미지/영상 로드 — app_settings.hero_image 에서 URL 가져옴
async function loadHeroImage(){
  const wrap=document.getElementById('pick-hero-image-wrap');
  const textWrap=document.getElementById('pick-hero-text-wrap');
  const tools=document.getElementById('pick-hero-image-tools');
  if(!wrap) return;
  let url='';
  try{
    const {data}=await sb.from('app_settings').select('value').eq('key','hero_image').maybeSingle();
    url=(data?.value||'').trim();
  }catch(_){}
  if(!url){ try{ url=localStorage.getItem('hero_image')||''; }catch(_){} }
  const canEdit=!!(CU?.isAdmin||CU?.isSubAdmin);
  if(url){
    // 영상이면 <video> autoplay loop muted, 아니면 <img> (GIF 자동 재생)
    const isVideo=/\.(mp4|webm|mov)(\?|$)/i.test(url);
    const inner = isVideo
      ? `<video src="${url}" autoplay loop muted playsinline style="display:block;width:100%;height:auto;border-radius:14px"></video>`
      : `<img id="pick-hero-image" src="${url}" alt="" style="display:block;width:100%;height:auto;border-radius:14px">`;
    // tools 보존 (위치 유지)
    wrap.innerHTML = inner + (tools ? tools.outerHTML : '');
    wrap.style.display='';
    if(textWrap) textWrap.style.display='none';
    // tools 다시 참조 (innerHTML 교체했으니)
    const newTools = wrap.querySelector('#pick-hero-image-tools');
    if(newTools) newTools.style.display = canEdit ? 'flex' : 'none';
  } else {
    wrap.style.display='none';
    if(textWrap) textWrap.style.display='';
    if(tools) tools.style.display='none';
  }
}

// 히어로 이미지 추가/변경 — 카드 외부 file input 으로 click 격리
//   GIF / animated WebP / 영상(MP4) 도 허용 — 압축 없이 원본 그대로 업로드
function changeHeroImage(){
  if(!CU?.isAdmin && !CU?.isSubAdmin){ alert('관리자만 가능합니다.'); return; }
  const inp=document.createElement('input');
  inp.type='file';
  inp.accept='image/*,video/mp4,video/webm';  // 정적 이미지 + GIF + 영상
  inp.style.display='none';
  inp.onchange=async ()=>{
    const file=inp.files?.[0];
    setTimeout(()=>inp.remove(),100);
    if(!file) return;
    try{
      const mime=file.type||'';
      // GIF / animated WebP / 영상은 압축 skip (애니메이션·프레임 보존)
      const skipCompress = /^(image\/(gif|webp|svg|avif)|video\/)/i.test(mime);
      let upload=file;
      if(!skipCompress && upload.size>1.5*1024*1024 && typeof compressImage==='function'){
        try{ upload=await compressImage(upload, 2*1024*1024, 1600); }catch(_){}
      }
      // 크기 한도 안내 (Storage 무료 한도 50MB 권장)
      if(upload.size>50*1024*1024){
        if(!confirm('파일이 '+(upload.size/1024/1024).toFixed(1)+'MB 입니다.\n50MB 이상은 로딩이 느려질 수 있습니다. 계속할까요?')) return;
      }
      const ext=(upload.name||file.name||'hero.jpg').split('.').pop()||'jpg';
      const path=`hero/${Date.now()}.${ext}`;
      const {error:ue}=await sb.storage.from('files').upload(path, upload, {contentType:mime||'image/jpeg', upsert:false});
      if(ue) throw new Error(ue.message);
      const {data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
      const {error:upErr}=await sb.from('app_settings').upsert({key:'hero_image', value:publicUrl});
      if(upErr) throw new Error(upErr.message);
      try{ localStorage.setItem('hero_image', publicUrl); }catch(_){}
      await loadHeroImage();
      if(typeof showToast==='function') showToast('✓ 히어로 '+(mime.startsWith('video')?'영상':'이미지')+' 등록 완료','#10b981');
    }catch(e){
      alert('등록 실패: '+(e?.message||e));
    }
  };
  document.body.appendChild(inp);
  inp.click();
}

// 히어로 이미지 삭제 — 글씨로 복귀
async function removeHeroImage(){
  if(!CU?.isAdmin && !CU?.isSubAdmin){ alert('관리자만 가능합니다.'); return; }
  if(!confirm('히어로 이미지를 삭제하고 글씨로 돌아갈까요?')) return;
  try{
    await sb.from('app_settings').delete().eq('key','hero_image');
    try{ localStorage.removeItem('hero_image'); }catch(_){}
    await loadHeroImage();
    if(typeof showToast==='function') showToast('히어로 이미지 삭제 완료','#0078C8');
  }catch(e){
    alert('삭제 실패: '+(e?.message||e));
  }
}

// 히어로 수정 모달 — 텍스트/색상/글꼴/두께/이탤릭
function editHeroText(key){
  const cur=window._heroCfg?.[key]||HERO_DEFAULTS[key];
  const isTitle=key==='hero_title';
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='hero-edit-overlay';
  overlay.style.zIndex='10080';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  const presetColors=['#0a0a0a','#1f2937','#475569','#E21E26','#0078C8','#10b981','#f59e0b','#8b5cf6','#ec4899'];
  const fonts=[
    {val:'inherit',label:'기본'},
    {val:"'LG Smart',sans-serif",label:'LG 글씨'},
    {val:"'Pretendard',sans-serif",label:'Pretendard'},
    {val:"'Noto Sans KR',sans-serif",label:'Noto Sans KR'},
    {val:"'Nanum Gothic',sans-serif",label:'나눔고딕'},
    {val:"'Nanum Myeongjo',serif",label:'나눔명조'},
    {val:"'Black Han Sans',sans-serif",label:'Black Han Sans'},
    {val:"'Gowun Dodum',sans-serif",label:'고운돋움'},
    {val:"'Gaegu',cursive",label:'개구'},
    {val:"'Malgun Gothic',sans-serif",label:'맑은 고딕'},
    {val:'serif',label:'명조체'},
    {val:'monospace',label:'고정폭'}
  ];
  const weights=[400,500,600,700,800,900];
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;width:min(560px,94vw);max-height:90vh;overflow-y:auto;padding:24px;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="font-size:16px;font-weight:800;margin-bottom:18px">${isTitle?'메인 제목':'부제'} 수정</div>
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:11px;font-weight:700;color:var(--t3);margin-bottom:6px">텍스트</label>
      <textarea id="hero-edit-text" rows="3" placeholder="Enter 로 줄바꿈, 앞뒤 공백·띄어쓰기 그대로 반영됩니다" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;font-weight:600;font-family:inherit;resize:vertical;white-space:pre-wrap;line-height:1.5">${(cur.text||'').replace(/</g,'&lt;')}</textarea>
    </div>
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:11px;font-weight:700;color:var(--t3);margin-bottom:6px">색상</label>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input id="hero-edit-color" type="color" value="${cur.color||'#0a0a0a'}" style="width:44px;height:34px;border:1px solid #ddd;border-radius:8px;cursor:pointer;padding:2px">
        ${presetColors.map(c=>`<button type="button" onclick="document.getElementById('hero-edit-color').value='${c}';_heroPreview()" style="width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.12);background:${c};cursor:pointer"></button>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:var(--t3);margin-bottom:6px">글꼴</label>
        <select id="hero-edit-font" style="width:100%;padding:9px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;background:#fff">
          ${fonts.map(f=>`<option value="${f.val}"${cur.font===f.val?' selected':''}>${f.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:var(--t3);margin-bottom:6px">굵기</label>
        <select id="hero-edit-weight" style="width:100%;padding:9px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;background:#fff">
          ${weights.map(w=>`<option value="${w}"${Number(cur.weight)===w?' selected':''}>${w}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;cursor:pointer">
        <input id="hero-edit-italic" type="checkbox"${cur.italic?' checked':''}> 이탤릭
      </label>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;font-weight:700;color:var(--t3)">정렬</span>
        <div id="hero-edit-align" style="display:inline-flex;border:1px solid #ddd;border-radius:8px;overflow:hidden">
          ${['left','center','right'].map(a=>`<button type="button" data-align="${a}" onclick="_heroSetAlign('${a}')" style="padding:7px 12px;border:none;background:${(cur.align||'center')===a?'var(--blue)':'#fff'};color:${(cur.align||'center')===a?'#fff':'var(--t2)'};font-size:11px;font-weight:700;cursor:pointer">${a==='left'?'왼쪽':a==='center'?'가운데':'오른쪽'}</button>`).join('')}
        </div>
      </div>
    </div>
    <div style="margin-bottom:18px;padding:16px;border:1px dashed var(--bdr);border-radius:10px;background:#fafafa">
      <div style="font-size:10px;color:var(--t3);margin-bottom:6px">미리보기</div>
      <div id="hero-edit-preview" style="font-size:${isTitle?'32px':'16px'};font-weight:${cur.weight||(isTitle?900:700)};color:${cur.color||'#0a0a0a'};font-family:${cur.font==='inherit'?'inherit':cur.font};font-style:${cur.italic?'italic':'normal'};text-align:${cur.align||'center'};line-height:1.3;word-break:keep-all;white-space:pre-wrap">${(cur.text||'').replace(/</g,'&lt;')}</div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" style="padding:8px 18px" onclick="document.getElementById('hero-edit-overlay').remove()">취소</button>
      <button class="btn btn-blue" style="padding:8px 18px" onclick="saveHeroEdit('${key}')">저장</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  // 현재 선택된 정렬 추적
  window._heroEditAlign=cur.align||'center';
  window._heroSetAlign=function(a){
    window._heroEditAlign=a;
    document.querySelectorAll('#hero-edit-align button').forEach(b=>{
      const sel=b.getAttribute('data-align')===a;
      b.style.background=sel?'var(--blue)':'#fff';
      b.style.color=sel?'#fff':'var(--t2)';
    });
    const p=document.getElementById('hero-edit-preview');
    if(p) p.style.textAlign=a;
  };
  // 입력 변경 시 미리보기 갱신
  window._heroPreview=function(){
    const p=document.getElementById('hero-edit-preview'); if(!p) return;
    p.textContent=document.getElementById('hero-edit-text').value;
    p.style.color=document.getElementById('hero-edit-color').value;
    const fv=document.getElementById('hero-edit-font').value;
    p.style.fontFamily=fv==='inherit'?'inherit':fv;
    p.style.fontWeight=document.getElementById('hero-edit-weight').value;
    p.style.fontStyle=document.getElementById('hero-edit-italic').checked?'italic':'normal';
    p.style.textAlign=window._heroEditAlign||'center';
  };
  ['hero-edit-text','hero-edit-color','hero-edit-font','hero-edit-weight','hero-edit-italic'].forEach(id=>{
    const e=document.getElementById(id); if(e) e.addEventListener('input',window._heroPreview);
  });
}

async function saveHeroEdit(key){
  const cfg={
    text:document.getElementById('hero-edit-text').value,
    color:document.getElementById('hero-edit-color').value,
    font:document.getElementById('hero-edit-font').value,
    weight:Number(document.getElementById('hero-edit-weight').value),
    italic:document.getElementById('hero-edit-italic').checked,
    align:window._heroEditAlign||'center'
  };
  if(!cfg.text.trim()){alert('텍스트를 입력하세요.');return;}
  const json=JSON.stringify(cfg);
  // 항상 localStorage 에 백업 저장 (DB 가 비어 있거나 RLS 로 막혀도 새로고침 후 유지)
  try{localStorage.setItem(key,json);}catch(e){}
  // DB 저장 시도 (선택적)
  let dbOk=true;
  try{
    const{error}=await sb.from('app_settings').upsert({key,value:json});
    if(error) throw error;
  }catch(e){
    dbOk=false;
    console.warn('app_settings DB 저장 실패 — localStorage 에만 저장됨:',e?.message||e);
  }
  applyHeroStyle(el(key==='hero_title'?'pick-hero-title':'pick-hero-sub'),cfg);
  window._heroCfg=window._heroCfg||{}; window._heroCfg[key]=cfg;
  document.getElementById('hero-edit-overlay')?.remove();
}

// 히어로 우측 — 2컬럼 독립 스크롤 사진 패널 (컬럼별 랜덤 순서 + animation-delay 로 무한 루프)
// 인터PICK 사진 흐름
//   요구사항:
//     - 새로고침할 때마다 등록된 모든 강사 사진이 1번씩 지나간 뒤 다시 1번씩(2번째)…를 무한 반복
//     - 좌·우 컬럼에 같은 사진이 동시에 보이지 않게(겹침 방지) 사용자를 두 컬럼에 분리 배치
//     - 순서는 셔플 — 새로고침 시마다 새 랜덤
function renderPickPhotoCollage(){
  const track=document.getElementById('pick-photo-track');
  if(!track) return;
  // 같은 소속만 노출 — 진짜 관리자(전체 조직 모드)는 모든 사진, 그 외는 활성 조직 또는 본인 소속
  const myOrg = (D.isRealAdmin && !D.activeOrg) ? '' : (D.activeOrg||CU?.orgName||'');
  const users=(D.users||[]).filter(u=>
    !u.deleted && !u.isAdmin && u.email!=='admin' && u.photo
    && (!myOrg || (u.orgName||'')===myOrg)
  );
  const placeholderHtml=`<div class="pick-photo-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>추가 예정</div>`;
  const shuffle=(arr)=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const cardHtml=(u)=>u?.photo
    ? `<div class="pick-photo-card"><img class="pick-portrait" src="${u.photo}" alt="" loading="lazy" decoding="async" onerror="this.remove()"/></div>`
    : `<div class="pick-photo-card">${placeholderHtml}</div>`;

  if(users.length===0){
    const empty=Array(6).fill(null).map(cardHtml).join('');
    track.innerHTML=`<div class="pick-photo-col">${empty+empty}</div><div class="pick-photo-col offset">${empty+empty}</div>`;
    return;
  }

  // 1) 모든 강사 사진 셔플 (새로고침 시마다 새 랜덤)
  const shuffled=shuffle(users);
  // 2) 좌·우 컬럼에 분리 배치 → 같은 사진이 동시에 좌·우에 보이지 않음 (겹침 방지)
  //    홀수 인덱스 = 좌, 짝수 인덱스 = 우 (지그재그) → 좌·우가 균형 있게 채워짐
  const leftList=[], rightList=[];
  shuffled.forEach((u,i)=>{ (i%2===0?leftList:rightList).push(u); });
  // 3) 최소 길이 보장 — 한쪽이 너무 짧으면 다른 쪽 사진으로 채움 (이때만 사진 중복 발생)
  const minLen=Math.max(6, Math.ceil(shuffled.length/2));
  const fill=(arr,fallbackPool)=>{
    if(arr.length>=minLen) return arr;
    const out=[...arr];
    let i=0;
    while(out.length<minLen){
      out.push(fallbackPool[i%fallbackPool.length]); i++;
    }
    return out;
  };
  const leftFinal=fill(leftList, shuffled);
  const rightFinal=fill(rightList, shuffled);
  const leftUnit=leftFinal.map(cardHtml).join('');
  const rightUnit=rightFinal.map(cardHtml).join('');
  // 4) 동일 unit 2회 반복 → CSS animation translateY -50% 로 seamless 무한 루프
  //    한 사이클 = 모든 사진 1번씩 지나감 → 다시 1번씩(2번째) → 3번째 …
  track.innerHTML=`<div class="pick-photo-col">${leftUnit+leftUnit}</div><div class="pick-photo-col offset">${rightUnit+rightUnit}</div>`;
  // 5) 속도는 CSS 기본값(55s) 유지 — 동적 조정 제거
  track.querySelectorAll('.pick-photo-col').forEach(col=>{ col.style.animationDuration=''; });
}

// 스크롤 일시정지/재생
function togglePhotoScroll(){
  const track=document.getElementById('pick-photo-track');
  const pauseIco=document.getElementById('pick-pause-icon');
  const playIco=document.getElementById('pick-play-icon');
  if(!track) return;
  const paused=track.classList.toggle('paused');
  if(pauseIco) pauseIco.style.display=paused?'none':'';
  if(playIco) playIco.style.display=paused?'':'none';
}

function pickActiveFilter(){
  const cats=window._pickCatSel||new Set();
  const prodEl=document.getElementById('pick-prod-filter');
  const prod=prodEl?prodEl.value:'';
  return {cats,prod,active:cats.size>0||!!prod};
}
function applyPickFilter(vids,f){
  if(!f||!f.active) return vids;
  return vids.filter(vd=>{
    if(f.cats.size){const vc=vd.eduType||vd.edu_type||'';if(!f.cats.has(vc)) return false;}
    if(f.prod){const vp=vd.productName||vd.product_name||vd.videoType||vd.video_type||'';if(!vp.includes(f.prod)) return false;}
    return true;
  });
}

function renderPick(){
  const now=new Date();
  const monthLabel=`${now.getFullYear()}년 ${now.getMonth()+1}월`;
  const ymEl=el('pick-title-ym');if(ymEl)ymEl.textContent=monthLabel;
  renderPickPhotoCollage();
  loadHeroText();

  // 현재 필터 (교육종류 다중 + 제품)
  const f=pickActiveFilter();

  // 당월 + 이전 달 누적 (2개월) — 영상 평가만 (+ 필터 적용)
  // 글자는 "이번 달" 그대로 유지, 데이터 범위만 누적 (2026-06-04 사장님 요청)
  const thisMonth=now.getMonth(),thisYear=now.getFullYear();
  const monthEnd=new Date(thisYear,thisMonth+1,0,23,59,59);
  const cumPrevMonth=thisMonth===0?11:thisMonth-1;
  const cumPrevYear=thisMonth===0?thisYear-1:thisYear;
  const cumStart=new Date(cumPrevYear,cumPrevMonth,1,0,0,0);
  const monthVidsRaw=(D.videos||[]).filter(v=>{const d=new Date(v.date);return d>=cumStart && d<=monthEnd;});
  const monthVids=applyPickFilter(monthVidsRaw,f);
  const totalEvals=monthVids.length;

  // 당월 영상 평가 받은 고유 강사 수 (+ 필터 적용)
  const monthVidIds=new Set(monthVids.map(v=>v.id));
  const monthEvaledVidIds=new Set((D.evaluations||[]).filter(e=>e.video_id&&e.overall_score>0&&monthVidIds.has(e.video_id)).map(e=>e.video_id));
  const evaledUserIdsThisMonth=new Set(monthVids.filter(v=>monthEvaledVidIds.has(v.id)).map(v=>v.userId));
  const cumUsers=evaledUserIdsThisMonth.size;

  // 전체 평균 AI 점수 — 당월 영상 평가만 (인터픽 강사 카드와 동일 범위/우선순위)
  // 우선순위: 교육맞춤평가(평가안기준) > AI독자 > 타임스탬프 폴백
  const videoEvalMap={};
  (D.evaluations||[]).forEach(e=>{if(e.video_id&&e.overall_score>0){const k=e.video_id+'_'+e.eval_type;videoEvalMap[k]=e.overall_score;}});
  const allVidScores=monthVids.map(v=>{
    const critSc=videoEvalMap[v.id+'_평가안기준'];
    if(critSc) return critSc;
    const aiSc=videoEvalMap[v.id+'_AI독자'];
    if(aiSc) return aiSc;
    const g=(v.timestamps||[]).filter(t=>t.type==='good').length;
    return Math.min(100,g*10+(v.timestamps||[]).length*3);
  });
  const allScoresAll=allVidScores.filter(s=>s>0);
  const avgAll=allScoresAll.length?(allScoresAll.reduce((a,b)=>a+b,0)/allScoresAll.length).toFixed(1):'0.0';

  // 이번 주 신규 콘텐츠 — DB 등록일(created_at) 기준
  const todayDow=now.getDay();
  const daysSinceMon=todayDow===0?6:todayDow-1;
  const weekStart=new Date(thisYear,thisMonth,now.getDate()-daysSinceMon,0,0,0);
  const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);weekEnd.setHours(23,59,59);
  const weekNew=applyPickFilter((D.videos||[]).filter(v=>{const d=new Date(v.created_at||v.date||0);return d>=weekStart&&d<=weekEnd;}),f).length;

  // 통계 카드
  const statsEl=el('pick-stats');
  if(statsEl) statsEl.innerHTML=[
    {val:cumUsers,unit:'명',lbl:'이번 달 평가 강사 수'},
    {val:totalEvals,unit:'건',lbl:'이번 달 AI 평가 완료'},
    {val:avgAll,unit:'점',lbl:'이번 달 AI 평가 평균 점수'},
    {val:weekNew,unit:'건',lbl:'이번 주 신규 콘텐츠'}
  ].map(s=>`<div style="border:1px solid var(--bdr);border-radius:12px;padding:16px;text-align:center">
    <div style="font-size:24px;font-weight:900;color:var(--t1)">${s.val}<span style="font-size:12px;font-weight:700">${s.unit}</span></div>
    <div style="font-size:11px;color:var(--t3);margin-top:4px">${s.lbl}</div>
  </div>`).join('');

  // TOP 3 강사 (당월 영상평가만)
  const prevMonth=now.getMonth()===0?11:now.getMonth()-1;
  const prevYear=now.getMonth()===0?now.getFullYear()-1:now.getFullYear();
  const prevVids=applyPickFilter((D.videos||[]).filter(v=>{const d=new Date(v.date);return d.getMonth()===prevMonth&&d.getFullYear()===prevYear;}),f);

  const vidScore=(v)=>{
    // 교육맞춤평가 점수 우선, 없으면 AI독자, 없으면 타임스탬프 폴백
    const critSc=videoEvalMap[v.id+'_평가안기준'];
    if(critSc) return critSc;
    const aiSc=videoEvalMap[v.id+'_AI독자'];
    if(aiSc) return aiSc;
    const g=(v.timestamps||[]).filter(t=>t.type==='good').length;
    return Math.min(100,g*10+(v.timestamps||[]).length*3);
  };
  const userScoresAll=(D.users||[]).filter(u=>!u.deleted).map(u=>{
    const uVids=monthVids.filter(v=>v.userId===u.id);
    const scores=uVids.map(vidScore);
    const avg2=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length):0;
    const pVids=prevVids.filter(v=>v.userId===u.id);
    const pScores=pVids.map(vidScore);
    const pAvg=pScores.length?(pScores.reduce((a,b)=>a+b,0)/pScores.length):0;
    const growth=pAvg>0?Math.round((avg2-pAvg)/pAvg*100):0;
    return {...u,pickScore:Math.round(avg2*10)/10,evalCount:scores.length,growth};
  }).filter(u=>u.evalCount>0).sort((a,b)=>b.pickScore-a.pickScore);
  // 관리자 수동 지정 Top3 override 적용 (조직별)
  const _orgKey=(D.activeOrg||CU?.orgName||'__GLOBAL__');
  const _override=(D.pickTop3Override&&D.pickTop3Override[_orgKey])||[];
  let userScores;
  if(_override.length){
    const ovUsers=_override.map(id=>{
      const fromScored=userScoresAll.find(u=>u.id===id);
      if(fromScored) return fromScored;
      const u=(D.users||[]).find(x=>x.id===id && !x.deleted);
      return u ? {...u, pickScore:0, evalCount:0, growth:0, _manual:true} : null;
    }).filter(Boolean);
    const rest=userScoresAll.filter(u=>!_override.includes(u.id));
    userScores=[...ovUsers,...rest].slice(0,3);
  } else {
    userScores=userScoresAll.slice(0,3);
  }
  // 영상 그리드(과정 제품별 영상)가 강사 랭킹과 같은 순서로 나오도록 순위 공유
  window._pickTop3Order=userScores.map(u=>u.id);

  const medals2=['🥇','🥈','🥉'];
  const top3El=el('pick-top3');
  if(top3El) top3El.innerHTML=userScores.length?userScores.map((u,i)=>{
    const bg=['#E21E26','#0078C8','#10b981','#f59e0b','#8b5cf6'][i%5];
    const pct=Math.min(100,Math.round(u.pickScore));
    const barColor=u.pickScore>70?'#10b981':'#E21E26';
    const growthTxt=u.growth>0?`+${u.growth}%`:u.growth<0?`${u.growth}%`:'—';
    const growthColor=u.growth>0?'#10b981':u.growth<0?'#E21E26':'var(--t3)';
    const keywords=u.habits?.slice(0,3).map(h=>h.word)||[];
    const medalBgs=['rgba(255,215,0,.08)','rgba(192,192,192,.08)','rgba(205,127,50,.08)'];
    const medalBorder=['rgba(255,215,0,.25)','rgba(192,192,192,.25)','rgba(205,127,50,.25)'];
    // 이달 평가받은 교육종류 — 가장 많이 등장한 값 (빈도순, 동률이면 최근)
    const uMonthVids=monthVids.filter(v=>v.userId===u.id);
    const eduTypeCount={};
    uMonthVids.forEach(v=>{ const t=v.eduType||v.edu_type; if(t&&t.trim()) eduTypeCount[t]=(eduTypeCount[t]||0)+1; });
    const topEduType=Object.entries(eduTypeCount).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    const eduTypeChip=topEduType?`<span style="position:absolute;top:0;right:0;color:#000;font-size:11px;font-weight:800;white-space:nowrap;max-width:70%;overflow:hidden;text-overflow:ellipsis">${topEduType.replace(/</g,'&lt;')}</span>`:'';
    return `<div class="pick-top-card" onclick="openLecturer(${u.id},'page-pick')"><div class="pick-top-card-inner" style="background:${medalBgs[i]||'#fff'};border:1px solid ${medalBorder[i]||'var(--bdr)'};position:relative">
      ${eduTypeChip}
      <!-- 상단: 사진 + 이름 -->
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;min-width:0">
        <div style="position:relative;flex-shrink:0;width:76px;height:76px;display:flex;align-items:center;justify-content:center">${u.photo?`<img src="${u.photo}" loading="lazy" decoding="async" style="max-width:100%;max-height:100%;object-fit:contain;display:block">`:`<div style="width:76px;height:76px;border-radius:14px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff">${u.name[0]}</div>`}</div>
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="display:flex;align-items:center;gap:6px;overflow:hidden"><span style="font-size:16px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</span><span style="font-size:14px;flex-shrink:0">${medals2[i]}</span></div>
          <div style="font-size:12px;color:var(--t3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${[u.office,u.team,u.position].filter(Boolean).join(' · ')||'—'}</div>
        </div>
      </div>
      <!-- 점수 + 달성 바 (교육맞춤평가 우선, 폴백 AI독자) -->
      <div style="margin-bottom:12px">
        <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:6px">
          <span style="font-size:28px;font-weight:900;color:var(--t1)">${u.pickScore}</span>
          <span style="font-size:12px;color:var(--t3)">/ 100 교육맞춤평가</span>
        </div>
        <div style="height:6px;background:#f0f0f0;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width .8s ease"></div>
        </div>
      </div>
      <!-- 건수 / LV / 경력 -->
      ${(()=>{
        const uAllVids=(D.videos||[]).filter(v=>v.userId===u.id);
        // 평가받은 영상만 (eval 또는 timestamp 분석) — vidScore 사용해 평가안기준 → AI독자 → timestamp 폴백
        const uAnalyzed=uAllVids.filter(v=>{
          const c=videoEvalMap[v.id+'_평가안기준'];
          const a=videoEvalMap[v.id+'_AI독자'];
          return c||a||(v.status==='분석완료'&&(v.timestamps||[]).length>0);
        });
        const uAvg=uAnalyzed.length?(uAnalyzed.map(vidScore).reduce((a,b)=>a+b,0)/uAnalyzed.length):0;
        const uLv=getLevelInfo(uAvg,uAnalyzed.length,uAllVids.length);
        return `<div style="display:flex;gap:14px;margin-bottom:12px;align-items:baseline">
          <div style="text-align:center"><div style="font-size:16px;font-weight:800;color:var(--t1)">${uAllVids.length}</div><div style="font-size:9px;color:var(--t3)">건수</div></div>
          <div style="text-align:center"><div style="font-size:16px;font-weight:800;color:${uLv.color}">Lv.${uLv.level}</div><div style="font-size:9px;color:var(--t3)">${uLv.name}</div></div>
          <div style="text-align:center"><div style="font-size:11px;font-weight:700;color:var(--t2)">${u.lgCareerStart?calcCareer(u.lgCareerStart):'—'}</div><div style="font-size:9px;color:var(--t3)">LG경력</div></div>
          <div style="text-align:center"><div style="font-size:11px;font-weight:700;color:var(--t2)">${u.teachCareerStart?calcCareer(u.teachCareerStart):'—'}</div><div style="font-size:9px;color:var(--t3)">강의경력</div></div>
        </div>`;
      })()}
      <!-- 뱃지 (상위 등급 우선 + 더보기) -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        ${(()=>{
          // 교육맞춤평가 카테고리만 (AI독자·누적 제외)
          const allBadges=getAccumulatedBadges(u.id).filter(id=>{const c=getBadgeInfo(id).cat;return c==='교육맞춤'||c==='평가안';});
          if(!allBadges.length) return '<span style="padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600;background:rgba(0,0,0,.05);color:var(--t3)">AI 분석 후 뱃지 생성</span>';
          const tierRank={legend:0,platinum:1,gold:2,silver:3,bronze:4};
          const sorted=[...allBadges].sort((a,b)=>(tierRank[getBadgeInfo(a).tier||'silver'])-(tierRank[getBadgeInfo(b).tier||'silver']));
          const shown=sorted.slice(0,3);
          const pills=shown.map(id=>{const b=getBadgeInfo(id);const ts=TIER_STYLE[b.tier]||TIER_STYLE.silver;return `<span style="padding:2px 8px;border-radius:10px;font-size:9.5px;font-weight:700;background:${ts.bg};color:#1a202c;border:1px solid ${ts.border}">${b.name}</span>`;}).join('');
          const rest=allBadges.length-shown.length;
          const moreBtnHtml=rest>0?`<span style="padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;background:rgba(0,0,0,.06);color:var(--t2);cursor:pointer" onclick="event.stopPropagation();showAllBadges(${u.id},${u.pickScore})">+${rest}</span>`:'';
          return pills+moreBtnHtml;
        })()}
      </div>
    </div></div>`;
  }).join(''):'<div style="grid-column:1/-1;padding:30px;text-align:center;font-size:13px;color:var(--t3)">당월 평가 데이터가 없습니다</div>';

  // 교안 카테고리 필터: 다중 선택 버튼으로 변경됨 → 별도 초기화 불필요 (togglePickCatMulti에서 동적 생성)
  // 제품 필터 (optgroup 트리)
  const prodFilter=el('pick-prod-filter');
  if(prodFilter&&prodFilter.options.length<=1){
    Object.entries(PRODUCT_TREE).forEach(([group,items])=>{
      const og=document.createElement('optgroup');og.label=group;
      items.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;og.appendChild(o);});
      prodFilter.appendChild(og);
    });
  }
  // 관리자 영상 추가 폼 표시
  const adminAddEl=el('pick-admin-add');
  if(adminAddEl){
    adminAddEl.style.display=CU?.isAdmin?'block':'none';
    if(CU?.isAdmin){
      const addSel=document.getElementById('pick-add-vid-select');
      if(addSel){
        const now2=new Date();const m2=now2.getMonth(),y2=now2.getFullYear();
        const available=(D.videos||[]).filter(vd=>vd.status==='분석완료'&&new Date(vd.date).getMonth()===m2&&new Date(vd.date).getFullYear()===y2);
        addSel.innerHTML='<option value="">영상 선택...</option>'+available.map(vd=>{
          const u=D.users?.find(x=>x.id===vd.userId);
          return `<option value="${vd.id}">${vd.title||'—'} (${u?.name||'—'})</option>`;
        }).join('');
      }
    }
  }
  renderPickVideos();

  // ── 추천 학습 콘텐츠 (Supabase pick_contents) ──
  const linksEl=el('pick-links');
  if(linksEl){
    const isAdmin=CU?.isAdmin;
    let lkHtml=isAdmin?`<div style="margin-bottom:12px;padding:10px;border:1px solid var(--bdr);border-radius:10px;background:#fafafa">
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input type="text" id="pick-ct-title" placeholder="제목" style="flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <input type="text" id="pick-ct-url" placeholder="URL (선택)" style="flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
        <input type="file" id="pick-ct-file" accept=".pdf,.xlsx,.xls,.pptx,.ppt,.docx,.doc" style="display:none" onchange="document.getElementById('pick-ct-fname').textContent=this.files[0]?.name||''">
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:10px;white-space:nowrap" onclick="document.getElementById('pick-ct-file').click()">파일</button>
        <span id="pick-ct-fname" style="font-size:9px;color:var(--t3);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
        <button class="btn btn-blue" style="padding:4px 10px;font-size:10px;white-space:nowrap" onclick="addPickContent()">등록</button>
      </div>
    </div>`:'';
    const items=(D.pickContents||[]);
    lkHtml+=items.length?items.map(ct=>{
      const isFile=!!ct.file_url&&!ct.url;
      const isLink=!!ct.url;
      const typeIcon=isFile?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
      const clickAction=isFile?`window.open('${ct.file_url}','_blank')`:isLink?`window.open('${ct.url}','_blank')`:'';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.04)">
        <div style="flex-shrink:0">${typeIcon}</div>
        <div style="flex:1;min-width:0;cursor:${clickAction?'pointer':'default'}" ${clickAction?`onclick="${clickAction}"`:''}><div style="font-size:12px;font-weight:600;color:var(--t1)">${ct.title}</div><div style="font-size:9px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ct.url||ct.file_name||''}</div></div>
        ${isAdmin?`<button style="border:none;background:none;cursor:pointer;color:var(--red);font-size:14px;padding:2px" onclick="event.stopPropagation();deletePickContent(${ct.id})">×</button>`:''}
      </div>`;
    }).join(''):'<div style="padding:8px 0;font-size:12px;color:var(--t3);text-align:left">등록된 학습 콘텐츠가 없습니다</div>';
    linksEl.innerHTML=lkHtml;
  }

  // ── 이번 주 일정 (달력 연동 월~일) ──
  const eventsEl=el('pick-events');
  if(eventsEl){
    const today=new Date();
    const weekStart=new Date(today.getFullYear(),today.getMonth(),today.getDate(),0,0,0);
    const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);weekEnd.setHours(23,59,59);
    const dayNames=['일','월','화','수','목','금','토'];
    const events=(D.calendarEvents||[]).filter(e=>{if(!e.pick_visible) return false;const d=new Date(e.start_date);return d>=weekStart&&d<=weekEnd;}).sort((a,b)=>a.start_date.localeCompare(b.start_date));
    eventsEl.innerHTML=events.length?events.map(e=>{
      const d=new Date(e.start_date);
      const dayName=dayNames[d.getDay()];
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onclick="openCalendar()">
        <div style="flex:1"><div style="font-size:12px;font-weight:700;color:var(--t1)">${e.title}</div><div style="font-size:10px;color:var(--t3)">${e.start_date} (${dayName})</div></div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2" style="flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
    }).join(''):'<div style="padding:8px 0;color:var(--t3);font-size:12px;text-align:left">이번 주 일정이 없습니다</div>';
  }

  // ── 공지 및 알림 (Supabase pick_notices) ──
  const noticesEl=el('pick-notices');
  if(noticesEl){
    const isAdmin=CU?.isAdmin;
    let notices='';
    if(isAdmin) notices+=`<div style="margin-bottom:12px;padding:10px;border:1px solid var(--bdr);border-radius:10px;background:#fafafa">
      <input type="text" id="pick-add-notice-title" placeholder="제목" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px;margin-bottom:6px">
      <textarea id="pick-add-notice-content" placeholder="내용 (선택)" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px;min-height:50px;resize:vertical;margin-bottom:6px;font-family:inherit"></textarea>
      <div style="display:flex;gap:6px;align-items:center">
        <input type="text" id="pick-add-notice-url" placeholder="링크 URL (선택)" style="flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
        <button class="btn btn-blue" style="padding:4px 12px;font-size:10px;white-space:nowrap" onclick="addPickNotice()">등록</button>
      </div>
    </div>`;
    // Supabase 공지
    (D.pickNotices||[]).forEach(n=>{
      const hasContent=n.content&&n.content.trim();
      const hasUrl=n.url&&n.url.trim();
      notices+=`<div style="border-bottom:1px solid rgba(0,0,0,.04);padding:8px 0">
        <div style="display:flex;align-items:center;gap:6px;cursor:pointer" onclick="toggleNoticeDetail(${n.id})">
          <div style="flex:1">
            <div style="font-size:12px;font-weight:700;color:var(--t1);display:flex;align-items:center;gap:4px">${n.title}${hasUrl?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" style="flex-shrink:0"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>':''}</div>
            <div style="font-size:10px;color:var(--t3)">${n.created_at?.slice(0,10)||''}</div>
          </div>
          ${hasContent?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2" style="flex-shrink:0;transition:transform .2s" id="notice-arrow-'+n.id+'"><polyline points="6 9 12 15 18 9"/></svg>':''}
          ${isAdmin?`<button style="border:none;background:none;cursor:pointer;color:var(--red);font-size:14px;padding:2px" onclick="event.stopPropagation();deletePickNotice(${n.id})">×</button>`:''}
        </div>
        ${hasContent?`<div id="notice-detail-${n.id}" style="display:none;margin-top:8px;padding:10px;background:#f8f9fa;border-radius:8px;font-size:11px;color:var(--t2);line-height:1.6;white-space:pre-wrap">${n.content}${hasUrl?`<div style="margin-top:8px"><a href="${n.url}" target="_blank" style="color:var(--blue);font-weight:600;text-decoration:none">링크 이동 →</a></div>`:''}</div>`:''}
        ${!hasContent&&hasUrl?`<div style="margin-top:4px"><a href="${n.url}" target="_blank" style="font-size:11px;color:var(--blue);font-weight:600;text-decoration:none" onclick="event.stopPropagation()">링크 이동 →</a></div>`:''}
      </div>`;
    });
    if(!(D.pickNotices||[]).length&&!isAdmin) notices+='<div style="padding:8px 0;color:var(--t3);font-size:12px;text-align:left">등록된 공지가 없습니다</div>';
    noticesEl.innerHTML=notices;
  }

  // 전체보기 버튼 (관리자/부관리자만)
  const viewAllBtn=el('pick-viewall-btn');
  if(viewAllBtn) viewAllBtn.style.display=(CU?.isAdmin)?'inline-flex':'none';
}

// 전체 순위 모달
function openPickRankingModal(){
  const now=new Date();
  const thisMonth=now.getMonth(),thisYear=now.getFullYear();
  const prevMonth=thisMonth===0?11:thisMonth-1;
  const prevYear=thisMonth===0?thisYear-1:thisYear;
  // ▼ Top 3 (이달의 인터PICK 강사) 와 동일 로직 — 영상 평가만 + 동일 필터 적용 ▼
  // 누적 2개월 (이전 달 + 이번 달) — 메인과 동일 범위
  const f=pickActiveFilter();
  const monthEnd=new Date(thisYear,thisMonth+1,0,23,59,59);
  const cumStart=new Date(prevYear,prevMonth,1,0,0,0);
  const monthVidsRaw=(D.videos||[]).filter(v=>{const d=new Date(v.date);return d>=cumStart && d<=monthEnd;});
  const monthVids=applyPickFilter(monthVidsRaw,f);
  // 비교용 이전 2개월 (그 앞 2개월 평균) — 성장률 계산
  const prev2Month=prevMonth===0?11:prevMonth-1;
  const prev2Year=prevMonth===0?prevYear-1:prevYear;
  const prevStart=new Date(prev2Year,prev2Month,1,0,0,0);
  const prevEnd=new Date(prevYear,prevMonth,0,23,59,59);
  const prevVidsRaw=(D.videos||[]).filter(v=>{const d=new Date(v.date);return d>=prevStart && d<=prevEnd;});
  const prevVids=applyPickFilter(prevVidsRaw,f);
  // 영상 평가 점수 — 평가안기준(교육맞춤평가) 우선, AI독자 차순, 폴백 timestamp
  const videoEvalMap={};
  (D.evaluations||[]).forEach(e=>{ if(e.video_id && e.overall_score>0){ videoEvalMap[e.video_id+'_'+e.eval_type]=e.overall_score; } });
  const vidScore=(v)=>{
    const c=videoEvalMap[v.id+'_평가안기준']; if(c) return c;
    const a=videoEvalMap[v.id+'_AI독자']; if(a) return a;
    const g=(v.timestamps||[]).filter(t=>t.type==='good').length;
    return Math.min(100, g*10+(v.timestamps||[]).length*3);
  };
  const allScored=(D.users||[]).filter(u=>!u.deleted).map(u=>{
    const uV=monthVids.filter(v=>v.userId===u.id);
    const sc=uV.map(vidScore);
    const avg=sc.length?(sc.reduce((a,b)=>a+b,0)/sc.length):0;
    const pV=prevVids.filter(v=>v.userId===u.id);
    const pSc=pV.map(vidScore);
    const pAvg=pSc.length?(pSc.reduce((a,b)=>a+b,0)/pSc.length):0;
    const growth=pAvg>0?Math.round((avg-pAvg)/pAvg*100):0;
    const vidList=uV.map(v=>({title:v.title||'—',date:v.date,score:vidScore(v)}));
    return {...u,pickScore:Math.round(avg*10)/10,evalCount:sc.length,growth,vidList};
  }).filter(u=>u.evalCount>0).sort((a,b)=>b.pickScore-a.pickScore);

  const medals=['🥇','🥈','🥉'];
  const listEl=el('pick-ranking-list');
  // 관리자/부관리자 편집 모드 토글 헤더
  const canEditTop3 = !!(CU?.isAdmin || CU?.isSubAdmin);
  const orgKey = D.activeOrg || CU?.orgName || '__GLOBAL__';
  window._pickTop3Edit = window._pickTop3Edit || { active:false, picks:[] };
  const editing = window._pickTop3Edit.active;
  const currentOverride = (D.pickTop3Override && D.pickTop3Override[orgKey]) || [];
  const editHeader = canEditTop3
    ? `<div id="pick-top3-edit-bar" style="margin-bottom:12px;padding:10px 14px;border-radius:10px;background:${editing?'rgba(0,120,200,.08)':'#fafafa'};border:1px solid ${editing?'rgba(0,120,200,.3)':'var(--bdr)'};display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <strong style="font-size:12px;color:var(--t1)">${editing?'✏ Top3 편집 중':'관리자 권한'}</strong>
        ${editing
          ? `<span id="pick-top3-edit-status" style="font-size:11px;color:var(--blue);font-weight:700">${(window._pickTop3Edit.picks||[]).length} / 3 선택</span>
             <div style="margin-left:auto;display:flex;gap:6px">
               <button class="btn btn-blue" style="padding:5px 14px;font-size:11px;font-weight:800" onclick="savePickTop3FromModal('${orgKey.replace(/'/g,"\\'")}')">✓ 저장</button>
               <button class="btn btn-ghost" style="padding:5px 12px;font-size:11px" onclick="cancelPickTop3Edit()">취소</button>
             </div>`
          : `<span style="font-size:11px;color:var(--t3)">${currentOverride.length?`현재 수동 지정: ${currentOverride.length}명`:'자동 순위로 표시 중'}</span>
             <div style="margin-left:auto;display:flex;gap:6px">
               <button class="btn btn-ghost" style="padding:5px 14px;font-size:11px;font-weight:800;color:var(--blue)" onclick="startPickTop3Edit()">✏ Top3 수정</button>
               ${currentOverride.length?`<button class="btn btn-ghost" style="padding:5px 12px;font-size:11px;color:var(--red)" onclick="resetPickTop3('${orgKey.replace(/'/g,"\\'")}')">자동으로 되돌리기</button>`:''}
             </div>`}
      </div>`
    : '';
  if(listEl) listEl.innerHTML=editHeader + (allScored.length?allScored.map((u,i)=>{
    const bg=['#E21E26','#0078C8','#10b981','#f59e0b','#8b5cf6'][i%5];
    const growthTxt=u.growth>0?`+${u.growth}%`:u.growth<0?`${u.growth}%`:'—';
    const growthColor=u.growth>0?'#10b981':u.growth<0?'#E21E26':'var(--t3)';
    // 편집 모드: 각 카드에 슬롯 (1·2·3) — 클릭 시 picks 배열에 추가/제거
    const pickIdx = editing ? (window._pickTop3Edit.picks||[]).indexOf(u.id) : -1;
    const slotHtml = editing
      ? `<div onclick="event.stopPropagation();togglePickTop3Pick(${u.id})" style="flex-shrink:0;width:36px;height:36px;border-radius:50%;border:2px solid ${pickIdx>=0?'#0078C8':'#d1d5db'};background:${pickIdx>=0?'#0078C8':'#fff'};color:${pickIdx>=0?'#fff':'#9ca3af'};font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s">${pickIdx>=0?pickIdx+1:''}</div>`
      : '';
    const cardClick = editing ? `onclick="event.stopPropagation();togglePickTop3Pick(${u.id})"` : `onclick="document.getElementById('pick-ranking-overlay').classList.remove('show');openLecturer(${u.id},'page-pick')"`;
    return `<div style="border:1px solid var(--bdr);border-radius:12px;padding:16px;margin-bottom:12px;cursor:pointer;${editing && pickIdx>=0?'background:rgba(0,120,200,.04);border-color:#0078C8':''}" ${cardClick}>
      <div style="display:flex;align-items:center;gap:14px">
        ${slotHtml}
        ${editing?'':`<div style="font-size:18px;font-weight:900;color:var(--t3);width:30px;text-align:center">${i<3?medals[i]:(i+1)}</div>`}
        <div style="width:44px;height:44px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;overflow:hidden;flex-shrink:0">${u.photo?`<img src="${u.photo}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">`:u.name[0]}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800">${u.name} <span style="font-size:11px;color:var(--t3);font-weight:500">${[u.office,u.team,u.position].filter(Boolean).join(' · ')}</span></div>
          <div style="font-size:12px;color:var(--t3);margin-top:2px">평가 ${u.evalCount}건 · AI ${u.pickScore}점 · 성장 <span style="color:${growthColor}">${growthTxt}</span></div>
        </div>
      </div>
      ${u.vidList.length?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,.04)">
        ${u.vidList.slice(0,3).map(v=>`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:var(--t2)"><span>${v.title}</span><span>${v.date?.slice(0,10)||''} · ${v.score}점</span></div>`).join('')}
        ${u.vidList.length>3?`<div style="font-size:10px;color:var(--t3);margin-top:4px">외 ${u.vidList.length-3}건</div>`:''}
      </div>`:''}
    </div>`;
  }).join(''):'<div style="padding:30px;text-align:center;color:var(--t3)">당월 평가 데이터가 없습니다</div>');
  document.getElementById('pick-ranking-overlay').classList.add('show');
}

// ── Top3 편집 동작 핸들러 ──
function startPickTop3Edit(){
  const orgKey = D.activeOrg || CU?.orgName || '__GLOBAL__';
  const existing = (D.pickTop3Override && D.pickTop3Override[orgKey]) || [];
  window._pickTop3Edit = { active:true, picks: existing.slice(0,3) };
  openPickRankingModal();  // 재렌더
}
function cancelPickTop3Edit(){
  window._pickTop3Edit = { active:false, picks:[] };
  openPickRankingModal();
}
function togglePickTop3Pick(userId){
  const ed = window._pickTop3Edit;
  if(!ed || !ed.active) return;
  const idx = ed.picks.indexOf(userId);
  if(idx>=0){
    ed.picks.splice(idx,1);   // 해제 (순번 자동 재정렬)
  } else {
    if(ed.picks.length>=3){ ed.picks.shift(); }  // 4번째 클릭 → 첫 번째 해제
    ed.picks.push(userId);
  }
  openPickRankingModal();
}
async function savePickTop3FromModal(orgKey){
  const ed = window._pickTop3Edit;
  if(!ed || !ed.active) return;
  if(!ed.picks.length){ alert('1명 이상 선택해주세요. (취소하려면 "자동으로 되돌리기")'); return; }
  const ok = await savePickTop3Override(orgKey, ed.picks);
  if(!ok) return;
  window._pickTop3Edit = { active:false, picks:[] };
  document.getElementById('pick-ranking-overlay')?.classList.remove('show');
  if(typeof renderPick==='function') renderPick();
  if(typeof showToast==='function') showToast('✓ 인터PICK Top3 저장 완료','#10b981');
}
async function resetPickTop3(orgKey){
  if(!confirm('수동 지정을 해제하고 자동 순위로 되돌릴까요?')) return;
  await clearPickTop3Override(orgKey);
  document.getElementById('pick-ranking-overlay')?.classList.remove('show');
  if(typeof renderPick==='function') renderPick();
  if(typeof showToast==='function') showToast('자동 순위로 복귀','#0078C8');
}

// ── 추천 학습 콘텐츠 CRUD (Supabase pick_contents) ──
async function addPickContent(){
  const title=document.getElementById('pick-ct-title')?.value?.trim();
  const url=document.getElementById('pick-ct-url')?.value?.trim();
  const file=document.getElementById('pick-ct-file')?.files?.[0];
  if(!title){alert('제목을 입력하세요');return;}
  if(!url&&!file){alert('URL 또는 파일을 입력하세요');return;}
  let fileUrl='',fileName='';
  if(file){
    const ext=file.name.split('.').pop()||'file';
    const path=`pick_contents/${Date.now()}.${ext}`;
    const{error:ue}=await sb.storage.from('files').upload(path,file);
    if(ue){alert('파일 업로드 실패: '+ue.message);return;}
    const{data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
    fileUrl=publicUrl;fileName=file.name;
  }
  const row={title,url:url||null,file_url:fileUrl||null,file_name:fileName||null,created_by:CU?.name||'관리자'};
  const{error}=await sb.from('pick_contents').insert({...row,org_name:curOrg()});
  if(error){alert('등록 실패: '+error.message);return;}
  await loadFromDB();renderPick();
}
async function deletePickContent(id){
  if(!confirm('삭제하시겠습니까?'))return;
  await sb.from('pick_contents').delete().eq('id',id);
  await loadFromDB();renderPick();
}
// ── 공지 및 알림 CRUD (Supabase pick_notices) ──
async function addPickNotice(){
  const title=document.getElementById('pick-add-notice-title')?.value?.trim();
  if(!title){alert('제목을 입력하세요');return;}
  const content=document.getElementById('pick-add-notice-content')?.value?.trim()||null;
  const url=document.getElementById('pick-add-notice-url')?.value?.trim()||null;
  const orgName=D.activeOrg||CU?.orgName||null;
  const{error}=await sb.from('pick_notices').insert({title,content,url,created_by:CU?.name||'관리자',org_name:orgName});
  if(error){alert('등록 실패: '+error.message);return;}
  // 같은 조직 강사 전체에게 알림 생성
  if(orgName){
    dbCreateNotificationsForOrg({
      orgName, type:'new_notice',
      title:'📢 새 공지: '+title,
      body:content||'관리자가 새 공지를 등록했습니다.',
      link:'page-pick',
      excludeUserId:CU?.id
    });
  }
  await loadFromDB();renderPick();
}
async function deletePickNotice(id){
  if(!confirm('삭제하시겠습니까?'))return;
  await sb.from('pick_notices').delete().eq('id',id);
  await loadFromDB();renderPick();
}
function toggleNoticeDetail(id){
  const detail=document.getElementById('notice-detail-'+id);
  const arrow=document.getElementById('notice-arrow-'+id);
  if(!detail) return;
  const isOpen=detail.style.display!=='none';
  detail.style.display=isOpen?'none':'block';
  if(arrow) arrow.style.transform=isOpen?'':'rotate(180deg)';
}

// 관리자 영상 추가 (인터PICK 우선 노출)
// ── Top3 수동 지정 (조직별 app_settings 저장) ──
async function preloadPickTop3Overrides(){
  D.pickTop3Override = D.pickTop3Override || {};
  try{
    const {data,error}=await sb.from('app_settings').select('key,value').like('key','pick_top3_%');
    if(error){ console.warn('preloadPickTop3Overrides:',error.message); return; }
    D.pickTop3Override={};
    (data||[]).forEach(row=>{
      const orgName=row.key.replace(/^pick_top3_/,'');
      try{
        const v=row.value;
        const arr=typeof v==='string'?JSON.parse(v):(Array.isArray(v)?v:[]);
        D.pickTop3Override[orgName]=arr.filter(x=>Number.isInteger(x));
      }catch(_){}
    });
  }catch(e){ console.warn('preloadPickTop3Overrides:',e); }
}
async function savePickTop3Override(orgKey, userIds){
  const key='pick_top3_'+orgKey;
  const value=JSON.stringify((userIds||[]).filter(x=>Number.isInteger(x)).slice(0,3));
  try{
    const {error}=await sb.from('app_settings').upsert({key, value});
    if(error){ alert('저장 실패: '+error.message); return false; }
    D.pickTop3Override=D.pickTop3Override||{};
    D.pickTop3Override[orgKey]=JSON.parse(value);
    return true;
  }catch(e){ alert('저장 실패: '+(e?.message||e)); return false; }
}
async function clearPickTop3Override(orgKey){
  const key='pick_top3_'+orgKey;
  try{
    await sb.from('app_settings').delete().eq('key',key);
    if(D.pickTop3Override) delete D.pickTop3Override[orgKey];
    return true;
  }catch(e){ return false; }
}

async function addPickFeaturedVideo(){
  const sel=document.getElementById('pick-add-vid-select');
  const vidId=parseInt(sel?.value);
  if(!vidId){alert('영상을 선택하세요');return;}
  if((D.pickFeaturedVideos||[]).find(f=>f.video_id===vidId)){alert('이미 추가된 영상입니다');return;}
  const order=(D.pickFeaturedVideos||[]).length;
  const{error}=await sb.from('pick_featured_videos').insert({video_id:vidId,order_index:order,org_name:curOrg()});
  if(error){alert('추가 실패: '+error.message);return;}
  await loadFromDB();renderPick();
}
async function removePickFeaturedVideo(vidId){
  if(!confirm('우선 노출에서 제거하시겠습니까?'))return;
  await sb.from('pick_featured_videos').delete().eq('video_id',vidId);
  await loadFromDB();renderPick();
}

const PRODUCT_TREE={
  '키친':['냉장고','김치냉장고','전기레인지','식기세척기','정수기'],
  '리빙':['워시타워','워시콤보','스타일러','청소기'],
  'MS':['TV'],
  '에어솔루션':['에어컨','공기청정기','하이드로타워','환기/바스에어']
};

function pickVidScore(vid){
  // evaluations 테이블 overall_score 우선 (평가안기준 → AI독자) → 없으면 타임스탬프 폴백
  const evals=(D.evaluations||[]).filter(e=>e.video_id===vid.id);
  const crit=evals.find(e=>e.eval_type==='평가안기준')?.overall_score;
  const ai=evals.find(e=>e.eval_type==='AI독자')?.overall_score;
  if(crit) return crit;
  if(ai) return ai;
  const good=(vid.timestamps||[]).filter(t=>t.type==='good').length;
  return Math.min(100,good*10+(vid.timestamps||[]).length*3);
}

let PICK_SELECTED_VID=null;
let PICK_CURRENT_VIDS=[];
let PICK_USER_CLEARED=false;   // X 닫기 버튼으로 명시적 해제 시 true

function clearPickSelection(){
  PICK_USER_CLEARED=true;
  PICK_SELECTED_VID=null;
  renderPickVideos();
}

// 카테고리 다중 선택 상태
window._pickCatSel=window._pickCatSel||new Set();
function togglePickCatMulti(){
  const p=document.getElementById('pick-cat-multi-panel');
  if(!p) return;
  if(p.style.display==='none'){
    const cats=getEduTypes();
    const sel=window._pickCatSel;
    p.innerHTML=`<div style="padding:8px 10px;border-bottom:1px solid var(--bdr);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;font-weight:700;color:var(--t1)">교육종류 필터</span>
      <button style="font-size:11px;color:var(--blue);border:none;background:none;cursor:pointer;font-weight:600" onclick="clearPickCatFilter()">전체 해제</button>
    </div>`+(cats.length?cats.map(c=>`<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;font-size:12.5px;border-radius:6px;color:var(--t1);white-space:nowrap" onmouseover="this.style.background='rgba(0,120,200,.06)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${c.replace(/"/g,'&quot;')}" ${sel.has(c)?'checked':''} onchange="togglePickCat('${c.replace(/'/g,"\\'")}',this.checked)" style="width:15px;height:15px;cursor:pointer;flex-shrink:0">
      <span style="flex:1;color:var(--t1);font-weight:500">${c}</span>
    </label>`).join(''):'<div style="padding:12px 10px;font-size:12px;color:var(--t3)">등록된 교육종류가 없습니다.<br>관리자 → 교육종류 탭에서 추가하세요.</div>');
    p.style.display='block';
    setTimeout(()=>{document.addEventListener('click',pickCatOutsideClose,{once:true});},10);
  }else{
    p.style.display='none';
  }
}
function pickCatOutsideClose(e){
  const wrap=document.getElementById('pick-cat-multi-wrap');
  if(wrap&&!wrap.contains(e.target)){
    const p=document.getElementById('pick-cat-multi-panel');
    if(p) p.style.display='none';
  }
}
function refreshPickAll(){ renderPick(); renderPickVideos(); }
function togglePickCat(cat,checked){
  if(checked) window._pickCatSel.add(cat); else window._pickCatSel.delete(cat);
  updatePickCatBtn();
  refreshPickAll();
}
function clearPickCatFilter(){
  window._pickCatSel=new Set();
  const p=document.getElementById('pick-cat-multi-panel');
  if(p) p.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=false);
  updatePickCatBtn();
  refreshPickAll();
}
function updatePickCatBtn(){
  const btn=document.getElementById('pick-cat-multi-btn');
  if(!btn) return;
  const sz=window._pickCatSel.size;
  btn.textContent=sz===0?'전체 교육종류':sz===1?`${[...window._pickCatSel][0]}`:`${[...window._pickCatSel][0]} 외 ${sz-1}개`;
}

function renderPickVideos(){
  const vidsEl=el('pick-videos');
  if(!vidsEl) return;
  const catSel=window._pickCatSel||new Set();
  const prodVal=v('pick-prod-filter');
  const now=new Date();
  const thisMonth=now.getMonth(),thisYear=now.getFullYear();
  // 누적 2개월 (이전 달 + 이번 달) — 메인 통계·Top3 와 동일 범위
  const cumPrevMonth=thisMonth===0?11:thisMonth-1;
  const cumPrevYear=thisMonth===0?thisYear-1:thisYear;
  const cumStart=new Date(cumPrevYear,cumPrevMonth,1,0,0,0);
  const monthEnd=new Date(thisYear,thisMonth+1,0,23,59,59);

  // 평가 받은 영상 ID 집합 (영상 평가만)
  const evaledIds=new Set((D.evaluations||[]).filter(e=>e.video_id).map(e=>e.video_id));

  // 기본 풀: 분석완료 + 누적 2개월 범위
  let pool=(D.videos||[]).filter(vd=>{
    if(vd.status!=='분석완료') return false;
    const d=new Date(vd.date||vd.created_at||0);
    if(d<cumStart || d>monthEnd) return false;
    return true;
  });
  // 다중 교육종류 필터
  if(catSel.size){
    pool=pool.filter(vd=>{
      const vc=vd.eduType||vd.edu_type||'';
      return catSel.has(vc);
    });
  }
  if(prodVal) pool=pool.filter(vd=>(vd.productName||vd.product_name||vd.videoType||vd.video_type||'').includes(prodVal));

  // 영상별 평가안/AI독자 점수 맵
  const scoreMap={};
  (D.evaluations||[]).forEach(e=>{
    if(!e.video_id) return;
    if(!scoreMap[e.video_id]) scoreMap[e.video_id]={crit:0,ai:0};
    if(e.eval_type==='평가안기준') scoreMap[e.video_id].crit=e.overall_score||0;
    else if(e.eval_type==='AI독자') scoreMap[e.video_id].ai=e.overall_score||0;
  });
  const vidSortKey=(vd)=>{
    const s=scoreMap[vd.id]||{crit:0,ai:0};
    return [s.crit||pickVidScore(vd),s.ai||pickVidScore(vd)];
  };
  // 관리자 등록 우선 (pickFeaturedVideos 순서)
  const featuredList=(D.pickFeaturedVideos||[]).slice().sort((a,b)=>(a.order_index||0)-(b.order_index||0));
  const featuredIds=featuredList.map(f=>f.video_id);
  const featured=featuredIds.map(id=>pool.find(vd=>vd.id===id)).filter(Boolean);
  // 강사 랭킹 순서(상단 Top3 카드)와 동일하게 → 같은 강사면 점수순
  const rankOrder=window._pickTop3Order||[];
  const ownerRank=(vd)=>{const idx=rankOrder.indexOf(vd.userId);return idx<0?9999:idx;};
  const others=pool.filter(vd=>!featuredIds.includes(vd.id)).sort((a,b)=>{
    const ra=ownerRank(a), rb=ownerRank(b);
    if(ra!==rb) return ra-rb;
    const ka=vidSortKey(a), kb=vidSortKey(b);
    return (kb[0]-ka[0])||(kb[1]-ka[1]);
  });
  const vids=[...featured,...others].slice(0,3);

  // 기본 선택 영상: 현재 선택된 게 풀에 없으면 첫 번째 (X 닫기로 해제한 경우는 유지)
  if(!PICK_USER_CLEARED && !vids.find(x=>x.id===PICK_SELECTED_VID)){
    PICK_SELECTED_VID=vids[0]?.id||null;
  }

  // 선택 카드 인덱스 저장 (상세 포인터 위치용)
  PICK_CURRENT_VIDS=vids;

  vidsEl.innerHTML=vids.length?vids.map(vid=>{
    const u=D.users?.find(x=>x.id===vid.userId);
    const ytId=vid.youtube?.match(/[?&]v=([^&]+)/)?.[1]||'';
    const thumb=ytId?`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`:'';
    const videoSrc=!ytId&&vid.filePath?vid.filePath:'';
    const score=pickVidScore(vid);
    const isAdmin=featuredIds.includes(vid.id);
    const isSel=vid.id===PICK_SELECTED_VID;
    // 선택: 두꺼운 빨강 테두리만 + 연빨강 배경 + 그림자 / 비선택: 흰 배경 + 회색 테두리
    const selBorder=isSel?'3px solid #ef4444':'2px solid var(--bdr)';
    const selBg=isSel?'rgba(239,68,68,.06)':'#fff';
    const selShadow=isSel?'0 8px 22px rgba(239,68,68,.22)':'none';
    return `<div style="position:relative;border:${selBorder};border-radius:12px;overflow:hidden;cursor:pointer;transition:all .25s;background:${selBg};box-shadow:${selShadow}" onclick="selectPickVideo(${vid.id})" onmouseover="if(${vid.id}!==PICK_SELECTED_VID){this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,.08)'}" onmouseout="if(${vid.id}!==PICK_SELECTED_VID){this.style.transform='';this.style.boxShadow='none'}">
      <div style="aspect-ratio:16/9;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative">
        ${thumb?`<img src="${thumb}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">`:videoSrc?`<video muted preload="metadata" style="width:100%;height:100%;object-fit:cover;background:#000"><source src="${videoSrc}#t=1"></video>`:'<span style="font-size:12px;color:var(--t3)">미리보기 없음</span>'}
        ${isAdmin?'<span style="position:absolute;top:8px;left:8px;padding:4px 11px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(245,158,11,.95);color:#fff">★ 관리자</span>':''}
        ${isAdmin && (CU?.isAdmin||CU?.isSubAdmin)?`<button style="position:absolute;top:8px;left:${isAdmin?'82px':'8px'};width:26px;height:26px;border-radius:50%;border:none;background:rgba(220,38,38,.92);color:#fff;cursor:pointer;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.25);z-index:3" onclick="event.stopPropagation();removePickFeaturedVideo(${vid.id})" title="우선 노출 해제">×</button>`:''}
        <span style="position:absolute;top:8px;right:8px;padding:4px 11px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(16,185,129,.92);color:#fff">총점 ${score}점</span>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21"/></svg></div>
      </div>
      <div style="padding:14px 16px">
        <div style="font-size:14px;font-weight:700;color:var(--t1);line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:39px">${vid.title||'—'}</div>
        <div style="font-size:12px;color:var(--t3);margin-top:7px"><strong style="color:var(--t1);font-weight:700">${u?.name||'—'} 강사</strong>${u?.office?` · ${u.office}`:''}${u?.team?` · ${u.team}`:''}${u?.position?` · ${u.position}`:''}</div>
      </div>
    </div>`;
  }).join(''):'<div style="grid-column:1/-1;padding:30px;text-align:center;font-size:13px;color:var(--t3)">당월 영상이 없습니다</div>';

  // 상세 영역 항상 렌더
  renderPickDetail();
}

function selectPickVideo(vidId){
  PICK_USER_CLEARED=false;
  PICK_SELECTED_VID=vidId;
  renderPickVideos();
  // 모바일: 상세 영역으로 자동 스크롤
  if(window.innerWidth<=600){
    const detailEl=el('pick-video-detail');
    if(detailEl) setTimeout(()=>detailEl.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }
}

function pickAIComment(score){
  // AI 평가 완료 시 영상별 자동 생성될 전체 인상 코멘트 (현재는 점수대별 플레이스홀더)
  if(score>=90) return '"제품의 기술을 고객의 언어로 바꾸는 통역사, 현장의 온도를 읽어내는 강사입니다."';
  if(score>=80) return '"안정된 전달력 위에 현장감을 더해가는, 청자의 눈높이를 아는 강사입니다."';
  if(score>=70) return '"탄탄한 기본기에 디테일을 더하면 한 단계 더 성장할 수 있는 강사입니다."';
  return '"핵심 메시지를 단단히 다지는 연습으로 더 큰 성장이 기대되는 강사입니다."';
}

// ───────────────────────────────────────────────
// 데모 모드 (비딩/시연용) — 주소에 ?demo=1 접속 시 ON, ?demo=0 으로 OFF
//   실제 데이터가 비어있을 때만 "실제 느낌"의 샘플 콘텐츠를 채워 화면을 완성 (실데이터 있으면 그대로)
// ───────────────────────────────────────────────
// 데모 모드 영구 비활성 (2026-07-14 지시) — 시연용 가짜 자료가 실제 자료처럼 보이는 혼동 방지.
// 과거에 켜둔 기기에서도 플래그를 지워 즉시 꺼지게 한다.
(function(){try{localStorage.removeItem('ib_demo');}catch(_){}})();
function IB_DEMO(){return false;}
function _demoProd(vid){return (vid&&(vid.videoType||vid.video_type||vid.productName||vid.product_name))||'제품';}
function _demoHash(s){s=String(s||'');let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
// 제품별 특징 포인트 (시나리오·팁이 제품마다 다르게 보이도록)
const _DEMO_PROD_FEAT={
  '냉장고':'신선 보관 기술','김치냉장고':'정온 숙성 모드','전기레인지':'화력·안전 설계','식기세척기':'고온 살균 세척','정수기':'직수 위생 관리',
  '워시타워':'세탁·건조 일체형','워시콤보':'올인원 세탁 동선','스타일러':'의류 케어·살균','청소기':'흡입력·먼지 배출','TV':'화질·사운드 몰입감',
  '에어컨':'냉방 효율·공기질','공기청정기':'미세먼지 제거','하이드로타워':'가습·공기관리','환기/바스에어':'실내 환기·제습'
};
function _demoFeat(vid){const p=_demoProd(vid);return _DEMO_PROD_FEAT[p]||'핵심 기능';}
function _pick3(arr,seed){const out=[],n=arr.length;for(let i=0;i<3&&i<n;i++)out.push(arr[(seed+i)%n]);return out;}
function _pick(arr,cnt,seed){const out=[],n=arr.length;for(let i=0;i<cnt&&i<n;i++)out.push(arr[(seed+i)%n]);return out;}
function demoScenarios(vid){const p=_demoProd(vid),f=_demoFeat(vid),seed=_demoHash(p);
  const pool=[
    {situation:'가격에 부담을 느끼는 고객',suggested_line:`"${p}의 ${f}을(를) 월 단위 절감으로 환산하면 오히려 더 경제적입니다. 함께 계산해 드릴까요?"`},
    {situation:'타사 제품과 비교하는 고객',suggested_line:`"경쟁사 대비 ${p}의 결정적 차이는 ${f}입니다. 지금 직접 보여드리겠습니다."`},
    {situation:'구매를 망설이는 고객',suggested_line:`"오늘 보신 ${p} 기능 중 가장 마음에 드신 부분을 기준으로 정리해 드릴게요."`},
    {situation:'기능이 어렵다고 느끼는 고객',suggested_line:`"${p}는 버튼 하나로 끝납니다. 제가 옆에서 한 번만 같이 해보면 바로 익숙해지세요."`},
    {situation:'필요성을 못 느끼는 고객',suggested_line:`"${f} 덕분에 매일 드는 손이 확 줄어듭니다. 하루 일과로 비교해 볼까요?"`},
    {situation:'설치·관리가 걱정인 고객',suggested_line:`"${p}는 설치부터 관리까지 전담 케어가 따라갑니다. 신경 쓰실 게 거의 없어요."`},
  ];
  return _pick3(pool,seed);
}
function demoTips(vid){const p=_demoProd(vid),f=_demoFeat(vid),seed=_demoHash(p)+1;
  const pool=[
    {title:'도입 30초에 핵심 가치를 먼저 선언하세요',detail:`${p} 시연 전, 고객이 얻을 이득(${f})을 한 문장으로 제시하면 집중도가 크게 올라갑니다.`},
    {title:'숫자는 반드시 비교 기준과 함께',detail:'"OOW" 보다 "기존 대비 OO% 절감"처럼 비교 대상을 붙이면 설득력이 높아집니다.'},
    {title:'2분마다 확인 질문으로 호흡을 만드세요',detail:'일방적 설명을 양방향 교육으로 전환해 교육생 참여를 끌어올립니다.'},
    {title:'직접 만지게 하는 체험 동선을 넣으세요',detail:`${p}의 ${f}은(는) 말보다 손으로 체험할 때 각인됩니다. 1분 실습 구간을 설계하세요.`},
    {title:'경쟁사 비교는 사실 위주로 짧게',detail:'감정적 비교 대신 스펙·결과 중심으로 30초 안에 끝내야 신뢰가 쌓입니다.'},
    {title:'마무리에 핵심 3가지를 다시 묶어주세요',detail:'교육 종료 전 요약 슬라이드 한 장으로 기억 잔존율이 크게 높아집니다.'},
  ];
  return _pick(pool,3,seed);
}
function demoPatterns(vid){const p=_demoProd(vid),seed=_demoHash(p)+2;
  const pool=[
    {type:'공감',alternative:'고객님 입장에서는 그 부분이 가장 궁금하시죠. 충분히 그러실 수 있습니다.'},
    {type:'확신',alternative:`이 기능만큼은 자신 있게 추천드립니다. ${p} 중에서도 반응이 가장 좋았던 포인트입니다.`},
    {type:'비교',alternative:'기존 모델과 나란히 두고 보시면 차이가 한눈에 들어옵니다.'},
    {type:'마무리',alternative:'오늘은 핵심 세 가지만 기억하시면 됩니다. 첫째, 둘째, 셋째로 정리해 드릴게요.'},
    {type:'질문',alternative:'혹시 지금 가장 불편하신 점이 무엇인가요? 거기서부터 풀어보겠습니다.'},
    {type:'스토리',alternative:`실제로 한 고객님은 ${p} 바꾸고 나서 가사 시간이 절반으로 줄었다고 하셨어요.`},
  ];
  return _pick(pool,4,seed);
}
// 데모용 시나리오 기록 (관리자 AI코칭 목록 · 마이페이지에서 누르면 데이터 채워져 있게)
const _DEMO_SC_PRODS=['식기세척기','스타일러','에어컨','냉장고','공기청정기'];
const _DEMO_SC_EDU=['판매경쟁력상황실','현장코칭','RP','구독'];
const _DEMO_SC_DATES=['2026-06-13','2026-06-11','2026-06-09','2026-06-05','2026-06-02'];
function demoScenarioRecord(userId,userName,i){
  const prod=_DEMO_SC_PRODS[i%_DEMO_SC_PRODS.length];
  const edu=_DEMO_SC_EDU[i%_DEMO_SC_EDU.length];
  const sc=demoScenarios({videoType:prod});
  const body=sc.map(s=>`[${s.situation}]\n${s.suggested_line}`).join('\n\n');
  return {key:'demo_sc_'+userId+'_'+i,user_id:userId,user_name:userName||'',eduType:edu,product:prod,
    phase:'고객 응대',customer:'구매 검토 고객',store:'매장',
    draft:body,revised:body,grade:['S','A','A','B'][i%4],score:[95,90,88,82][i%4],
    finalized:true,finalized_at:_DEMO_SC_DATES[i%_DEMO_SC_DATES.length],updated_at:_DEMO_SC_DATES[i%_DEMO_SC_DATES.length],_demo:true};
}
function demoScenariosForUsers(users,maxN){
  const out=[];(users||[]).slice(0,maxN||4).forEach((u,i)=>out.push(demoScenarioRecord(u.id,u.name,i)));
  // 상세 모달(openScenarioDetailFromAdmin)이 캐시를 보므로 동기화
  if(!Array.isArray(D.scenarioDrafts)) D.scenarioDrafts=[];
  out.forEach(r=>{ if(!D.scenarioDrafts.find(s=>s.key===r.key)) D.scenarioDrafts.push(r); });
  return out;
}
// 데모용 교육자료 (교육콘텐츠 페이지 — 다른 교육명 + 5·6월)
function demoEduMaterials(){
  const mk=(id,cat,name,file,date,type)=>({id:'demo_cl_'+id,category:cat,name,file_name:file,created_at:date,type:type||'',file_url:'javascript:void(0)',_demo:true});
  return [
    mk(1,'판경상 시나리오','판경상 시나리오 6월 식기세척기','식기세척기.docx','2026-06-12'),
    mk(2,'판경상 시나리오','판경상 시나리오 5월 정수기','정수기.docx','2026-05-14'),
    mk(3,'거점집합 시나리오','거점집합 시나리오 6월 냉장고','냉장고.pptx','2026-06-10'),
    mk(4,'거점집합 시나리오','거점집합 시나리오 5월 워시타워','워시타워.docx','2026-05-20'),
    mk(5,'현장코칭 교안','현장코칭 교안 6월 스타일러','스타일러.pdf','2026-06-08'),
    mk(6,'현장코칭 교안','현장코칭 교안 5월 청소기','청소기.docx','2026-05-22'),
    mk(7,'구독 시나리오','구독 시나리오 6월 공기청정기','공기청정기.docx','2026-06-05'),
    mk(8,'RP 평가안','RP 평가안 5월 에어컨','에어컨.xlsx','2026-05-30'),
  ];
}
// 데모용 평가안기준(교육맞춤) 결과 — 검증된 AI 결과 구조를 복제하되,
//   카테고리명을 '교육목표(체크리스트) 대항목'으로 리라벨해 AI독자 탭과 구분되게 함
function makeDemoCritFromAi(ai){
  if(!ai) return null;
  let c; try{c=JSON.parse(JSON.stringify(ai));}catch(_){c={...ai};}
  // 카테고리(축) 리라벨 — 교육맞춤(교안 기준) 대항목 이름으로
  const newCats=['제품 지식 정확도','교안 목표 부합도','시연·실습 구성','고객 응대 시나리오','핵심 메시지 전달','마무리·정리','현장 퍼포먼스 연계','변화 대응력'];
  const map={}; let n=0;
  (c.sub_scores||[]).forEach(s=>{const k=s.category||'기타';if(!(k in map)){map[k]=newCats[n]||k;n++;}});
  if(Array.isArray(c.sub_scores)) c.sub_scores=c.sub_scores.map(s=>({...s,category:map[s.category||'기타']||s.category}));
  // ⭐ 교안 기준 = 원본 점수 유지(높은 쪽). AI독자는 makeDemoAiLower 로 낮춰 차등.
  delete c.categories; // 리라벨된 sub_scores 기준으로 재집계되도록
  try{ c=normalizeVertexResult(c); }catch(_){}
  c.rubric_alignment_score=93;
  c.rubric_alignment_reason='교안의 핵심 학습목표·시나리오 흐름과 실제 강의가 높은 수준으로 일치합니다. (데모)';
  c.summary_opinion='교안·시나리오 기준으로 목표 부합도와 시연 구성이 매우 우수합니다. 추가 데이터와 대조해 계획대로 충실히 전달했습니다. (데모)';
  c.good=[{title:'교안 목표를 정확히 짚은 전개',reason:'교안의 핵심 학습목표를 빠짐없이 다뤘습니다.'},{title:'시연·실습 구성의 완성도',reason:'교안 시나리오대로 시연 흐름이 자연스럽게 이어졌습니다.'},{title:'추가 자료 활용 우수',reason:'교안·체크리스트 항목을 강의에 충실히 반영했습니다.'}];
  c.bad=[{title:'마무리 요약 보강 여지',reason:'교안상 정리 단계를 조금 더 길게 가져가면 좋습니다.'}];
  c.upgrade=[{title:'현장 사례로 교안 연계 강화',reason:'교안 내용을 실제 매장 사례와 연결하면 체감도가 올라갑니다.'}];
  c.scenarios=demoScenarios(null);
  c.level_tips=demoTips(null);
  c.teaching_patterns=demoPatterns(null);
  c._demo=true;
  return c;
}
// 데모용 AI 독자 분석 — 자료 없이 영상만 청취 → 더 보수적(낮게). 교육맞춤과 점수 차등용
function makeDemoAiLower(ai){
  if(!ai) return ai;
  let c; try{c=JSON.parse(JSON.stringify(ai));}catch(_){return ai;}
  // good 일부를 normal 로 낮춰 총점 하향 (~87) + 모양 차이
  if(Array.isArray(c.sub_scores)){let dn=0;c.sub_scores=c.sub_scores.map((s,i)=>(s.level==='good'&&(i%2===0)&&dn++<5)?{...s,level:'normal'}:s);}
  delete c.categories;
  try{ c=normalizeVertexResult(c); }catch(_){}
  c._demo=true;
  return c;
}
// 데모용 스피치(음성) 분석 결과 — 비어있을 때 채움
function makeDemoVoice(){
  const cats=[
    {name:'발성·성량',score:36,max:40},{name:'속도·리듬',score:33,max:40},
    {name:'강조·억양',score:35,max:40},{name:'청중 교감',score:31,max:40},{name:'군더더기 절제',score:30,max:40},
  ];
  const subs=[
    {category:'발성·성량',sub_item:'매장 환경 대비 적정 성량',criterion:'성량',level:'good',score:5,max:5,timestamp:'01:12',analysis:'매장 소음 위에서도 명료하게 전달되는 안정적 성량을 유지했습니다.'},
    {category:'속도·리듬',sub_item:'핵심 구간 속도 조절',criterion:'속도',level:'good',score:5,max:5,timestamp:'03:40',analysis:'중요 포인트에서 의도적으로 속도를 늦춰 강조했습니다.'},
    {category:'강조·억양',sub_item:'단조로움 회피',criterion:'억양',level:'normal',score:3,max:5,timestamp:'05:20',analysis:'전반적으로 양호하나 후반부 억양 변화가 다소 줄었습니다.'},
    {category:'청중 교감',sub_item:'질문·호응 유도',criterion:'교감',level:'normal',score:3,max:5,timestamp:'07:05',analysis:'질문은 있었으나 답을 기다리는 여백이 짧았습니다.'},
    {category:'군더더기 절제',sub_item:'습관어 빈도',criterion:'습관어',level:'normal',score:3,max:5,timestamp:'—',analysis:'"어/음" 등 습관어가 간헐적으로 관찰됩니다.'},
  ];
  const ai={
    overall_score:90, categories:cats, sub_scores:subs,
    summary_opinion:'안정적인 성량과 또렷한 발음으로 신뢰감을 주는 스피치입니다. 후반부 억양 변화와 습관어만 보완하면 한 단계 더 올라갑니다. (데모)',
    good:[{title:'안정적 성량과 또렷한 발음',reason:'매장 소음 환경에서도 핵심 메시지가 명료하게 전달되었습니다.'},
          {title:'핵심 구간 속도 완급 조절',reason:'중요 포인트에서 속도를 늦춰 교육생 이해를 도왔습니다.'}],
    bad:[{title:'후반부 억양 단조로움',reason:'집중도가 떨어지기 쉬운 후반부에 억양 변화가 줄었습니다.'}],
    upgrade:[{title:'질문 후 3초 여백 두기',reason:'호응을 유도한 뒤 답을 기다리는 침묵을 의도적으로 두면 참여가 올라갑니다.'}],
    engagement_gaps_minutes:[12,26,39], _demo:true
  };
  const r={
    decibel:{current:74,status:'적정'}, tempo:{wpm:148,status:'적정'},
    habits:[{word:'어',count:8,context:'문장 전환 구간',replacement:'(0.5초 멈춤)'},{word:'음',count:5,context:'생각 정리 시',replacement:'(짧은 침묵)'},{word:'자',count:3,context:'화제 전환 시'}],
    speech_report:{
      improvements:[{title:'억양 변화 루틴',detail:'문단마다 핵심어 1개를 정해 톤을 한 단계 올려보세요.'},{title:'습관어 치환',detail:'"어/음" 대신 0.5초 침묵으로 대체하면 전문성이 올라갑니다.'}],
      training:[{title:'복식호흡 발성 5분',detail:'녹음 후 성량 그래프 확인'},{title:'섀도잉 낭독',detail:'우수 강의 1분 구간 따라 말하기'}]
    }
  };
  return {ai,r};
}
// 데모 모드 ON/OFF 토글 버튼 (관리자·부관리자만 노출) — 클릭 시 전환 후 새로고침
function ibToggleDemo(){
  try{
    if(IB_DEMO()) localStorage.removeItem('ib_demo');
    else localStorage.setItem('ib_demo','1');
  }catch(_){}
  location.reload();
}
function _demoBtnHidden(){try{return localStorage.getItem('ib_demo_btnhide')==='1';}catch(_){return false;}}
function ibHideDemoBtn(){try{localStorage.setItem('ib_demo_btnhide','1');}catch(_){}_ensureDemoToggle();}
function ibToggleDemoBtnVisible(){try{if(_demoBtnHidden())localStorage.removeItem('ib_demo_btnhide');else localStorage.setItem('ib_demo_btnhide','1');}catch(_){}_ensureDemoToggle();}
function _ensureDemoToggle(){
  // 데모 모드 영구 비활성 — 토글 버튼도 렌더하지 않고 기존 버튼은 제거
  try{ const w=document.getElementById('ib-demo-toggle'); if(w) w.remove(); }catch(_){}
  return;
  /* eslint-disable no-unreachable */
  try{
    const isAdmin=!!(CU&&(CU.isAdmin||CU.isSubAdmin));
    let wrap=document.getElementById('ib-demo-toggle');
    if(!isAdmin){ if(wrap) wrap.remove(); return; }
    if(_demoBtnHidden()){ if(wrap) wrap.remove(); return; } // 녹화용 숨김 (Ctrl+Shift+D 로 복귀)
    const on=IB_DEMO();
    if(!wrap){
      wrap=document.createElement('div');wrap.id='ib-demo-toggle';
      wrap.style.cssText='position:fixed;left:12px;bottom:12px;z-index:99999;display:flex;gap:6px;align-items:center';
      const main=document.createElement('button');main.id='ib-demo-main';main.onclick=ibToggleDemo;
      main.style.cssText='border:none;font-size:11px;font-weight:800;padding:7px 13px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.22);cursor:pointer;letter-spacing:.3px';
      const hide=document.createElement('button');hide.id='ib-demo-hide';hide.onclick=ibHideDemoBtn;hide.textContent='✕';
      hide.title='버튼 숨기기 (녹화용) · 다시 보려면 Ctrl+Shift+D';
      hide.style.cssText='border:none;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;font-size:11px;font-weight:900;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)';
      wrap.appendChild(main);wrap.appendChild(hide);document.body.appendChild(wrap);
    }
    const main=document.getElementById('ib-demo-main');
    if(main){
      main.textContent=on?'● 데모 ON (클릭=끄기)':'○ 데모 OFF (클릭=켜기)';
      main.title=on?'시연/비딩용 데모 표시 중 — 모든 영상에 교육맞춤평가·시나리오·팁·화법이 채워집니다':'데모 모드 꺼짐 — 실제 데이터만 표시';
      main.style.background=on?'#dc2626':'#e5e7eb';
      main.style.color=on?'#fff':'#374151';
    }
  }catch(_){}
}
// Ctrl+Shift+D — 데모 버튼 숨김/표시 토글 (녹화 중 복귀용)
try{document.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==='D'||e.key==='d'||e.key==='ㅇ')){e.preventDefault();ibToggleDemoBtnVisible();} });}catch(_){}
try{ if(document.readyState!=='loading') _ensureDemoToggle(); else document.addEventListener('DOMContentLoaded',_ensureDemoToggle); }catch(_){}

function renderPickDetail(){
  const detailEl=el('pick-video-detail');
  if(!detailEl) return;
  const vid=PICK_SELECTED_VID?(D.videos||[]).find(x=>x.id===PICK_SELECTED_VID):null;
  if(!vid){
    detailEl.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">영상 카드를 선택하면 상세 내용이 표시됩니다</div>';
    return;
  }
  const u=D.users?.find(x=>x.id===vid.userId);
  const ytId=vid.youtube?.match(/[?&]v=([^&]+)/)?.[1]||'';
  const thumb=ytId?`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`:'';
  const title=vid.title||'—';
  const product=vid.videoType||vid.video_type||'—';

  // 해당 영상의 평가 결과 로드 (평가안기준 우선, 없으면 AI독자)
  const evalsForVid=(D.evaluations||[]).filter(e=>e.video_id===vid.id);
  const critEval=evalsForVid.find(e=>e.eval_type==='평가안기준');
  const aiEval=evalsForVid.find(e=>e.eval_type==='AI독자');
  const mainEval=critEval||aiEval;
  const score=mainEval?.overall_score||pickVidScore(vid);
  const rubric=critEval?.speech_report?.rubric_alignment_score;
  const summary=mainEval?.speech_report?.summary_opinion||'';
  const comment=summary?(summary.split('.').slice(0,2).join('.')+'.'):pickAIComment(score);
  let scenarios=(critEval?.scenarios||aiEval?.scenarios||[]);
  let levelTips=(critEval?.level_tips||aiEval?.level_tips||[]);
  let teachingPatterns=(critEval?.teaching_patterns||aiEval?.teaching_patterns||[]);
  // 데모 모드: 비어있으면 실제 느낌의 샘플로 채움 (실데이터 있으면 그대로)
  if(IB_DEMO()){
    if(!scenarios.length) scenarios=demoScenarios(vid);
    if(!levelTips.length) levelTips=demoTips(vid);
    if(!teachingPatterns.length) teachingPatterns=demoPatterns(vid);
  }

  // 공통 카드 스타일 (3컬럼 완전 통일) - 글자 크기 업
  const cardStyle='padding:16px 18px;border-radius:10px;background:#fff;border:1px solid rgba(0,0,0,.08);min-height:82px;display:flex;flex-direction:column;justify-content:center';
  const titleStyle='font-size:13.5px;font-weight:700;color:var(--t1);line-height:1.4';
  const subStyle='font-size:11.5px;color:var(--t3);margin-top:5px';

  // 블록 헤더 아이콘
  const icoScenario='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>';
  const icoTip='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17h8v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/></svg>';
  const icoSpeech='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  // 선택 카드 인덱스 → 포인터 left 위치 계산
  const selIdx=PICK_CURRENT_VIDS.findIndex(x=>x.id===PICK_SELECTED_VID);
  const pointerLeft=selIdx>=0?`${(selIdx*33.333+16.667).toFixed(2)}%`:'50%';

  // 섹션 헤더 공통 렌더 (글자 크기 업)
  const sectionHead=(ico,label)=>`<div style="display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800;color:var(--t1);margin-bottom:14px"><span style="width:30px;height:30px;border-radius:8px;background:rgba(248,113,113,.12);display:inline-flex;align-items:center;justify-content:center">${ico}</span>${label}</div>`;

  detailEl.innerHTML=`
    <!-- 베이지 영역 컨테이너 + 선택 카드와 연결되는 포인터 tail (크게 강화) -->
    <div style="position:relative;margin-top:22px;padding:22px;border-radius:14px;background:rgba(239,68,68,.08);border:2.5px solid rgba(239,68,68,.55);box-shadow:0 6px 20px rgba(239,68,68,.12)">
      <!-- Pointer tail (선택된 영상 카드 방향) - 대폭 확대 -->
      <div style="position:absolute;top:-16px;left:${pointerLeft};transform:translateX(-50%) rotate(45deg);width:28px;height:28px;background:rgba(239,68,68,.08);border-top:2.5px solid rgba(239,68,68,.55);border-left:2.5px solid rgba(239,68,68,.55);border-top-left-radius:4px"></div>

      <!-- 히어로 헤더: 큰 썸네일 + 재생 오버레이 + X 닫기 -->
      <div style="position:relative;display:flex;align-items:stretch;gap:18px;padding:16px;border-radius:12px;background:#fff;border:1px solid rgba(248,113,113,.22);margin-bottom:18px;box-shadow:0 2px 8px rgba(248,113,113,.06)">
        <!-- 큰 썸네일 -->
        <div class="pick-hero-thumb" style="width:150px;height:94px;border-radius:10px;background:#000;flex-shrink:0;overflow:hidden;position:relative;cursor:pointer" onclick="openVideo(${vid.id})">
          ${thumb?`<img src="${thumb}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">`:vid.filePath?`<video muted preload="metadata" style="width:100%;height:100%;object-fit:cover;background:#000"><source src="${vid.filePath}#t=1"></video>`:'<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#adb5bd;font-size:11px">미리보기 없음</div>'}
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.2);transition:background .2s"><div style="width:46px;height:46px;border-radius:50%;background:rgba(220,38,38,.92);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.3)"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21"/></svg></div></div>
        </div>
        <!-- 텍스트 영역 (축약 배너 스타일) -->
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px">
          <div style="display:flex;align-items:center;flex-wrap:wrap;font-size:16.5px;font-weight:800;color:var(--t1)!important;line-height:1.35;border-bottom:none!important;padding-bottom:0!important;margin-bottom:0!important;text-transform:none!important;letter-spacing:0!important">
            <span>선택 영상</span>
            <span style="margin:0 10px">·</span>
            <span>총점 ${score}점</span>
            ${rubric!=null?`<span style="margin:0 10px">·</span><span>교안/시나리오 이해도 ${rubric}%</span>`:''}
          </div>
          <div class="pick-hero-title" style="font-size:16.5px;font-weight:800;color:var(--t1)!important;line-height:1.35;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;border-bottom:none!important;padding-bottom:0!important;margin-bottom:0!important;text-transform:none!important;letter-spacing:0!important">${title}</div>
          ${(()=>{
            const eduType=vid.eduType||vid.edu_type||'';
            return `<div style="font-size:12.5px;color:var(--t3)"><strong style="color:var(--t1);font-weight:700">${u?.name||'—'}</strong>${u?.office?` · ${u.office}`:''}${u?.team?` · ${u.team}`:''}${u?.position?` · ${u.position}`:''}${eduType?` · ${eduType}`:''}${vid.date?` · ${vid.date}`:''}</div>`;
          })()}
          <div style="font-size:12.5px;color:var(--t2);line-height:1.5;margin-top:6px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${comment}</div>
          <div style="margin-top:8px">
            <button onclick="event.stopPropagation();openVideo(${vid.id})" style="padding:7px 18px;font-size:12px;font-weight:700;background:#dc2626;color:#fff;border:none;border-radius:999px;cursor:pointer;box-shadow:0 2px 6px rgba(220,38,38,.25)" onmouseover="this.style.background='#b91c1c'" onmouseout="this.style.background='#dc2626'">평가 상세보기 →</button>
          </div>
        </div>
        <!-- X 닫기 -->
        <button onclick="clearPickSelection()" title="선택 해제" style="position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,.06);color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-size:16px;font-weight:900" onmouseover="this.style.background='rgba(220,38,38,.12)';this.style.color='#dc2626'" onmouseout="this.style.background='rgba(0,0,0,.06)';this.style.color='#6b7280'">✕</button>
      </div>

      <!-- 3컬럼 상세 — 실제 AI 평가 데이터 -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start" id="pick-detail-cols">
        <div>
          ${sectionHead(icoScenario,'추천 시나리오')}
          <div style="display:flex;flex-direction:column;gap:10px">
            ${scenarios.length?scenarios.slice(0,3).map(s=>`<div class="pick-shell-card" style="${cardStyle}">
              <div style="${titleStyle}">${s.situation||s.title||'시나리오'}</div>
              ${s.suggested_line?`<div style="${subStyle};color:var(--blue)">"${s.suggested_line}"</div>`:`<div style="${subStyle}">${s.detail||''}</div>`}
            </div>`).join(''):`<div class="pick-shell-card" style="${cardStyle}"><div style="${titleStyle}">AI 평가 후 자동 생성</div><div style="${subStyle}">교육자료 첨부해 평가받으면 생성됩니다</div></div>`}
          </div>
        </div>
        <div>
          ${sectionHead(icoTip,'강의 레벨 UP TIP')}
          <div style="display:flex;flex-direction:column;gap:10px">
            ${levelTips.length?levelTips.slice(0,3).map(t=>`<div class="pick-shell-card" style="${cardStyle}">
              <div style="${titleStyle}">${t.title||'TIP'}</div>
              <div style="${subStyle}">${t.detail||t.text||''}</div>
            </div>`).join(''):`<div class="pick-shell-card" style="${cardStyle}"><div style="${titleStyle}">AI 평가 후 자동 생성</div><div style="${subStyle}">분석 결과에서 추출됩니다</div></div>`}
          </div>
        </div>
        <div>
          ${sectionHead(icoSpeech,'강사 교육 화법')}
          <div style="display:flex;flex-direction:column;gap:10px">
            ${teachingPatterns.length?teachingPatterns.slice(0,8).map(p=>{
              const typeLbl=p.type?(String(p.type).endsWith('화법')?p.type:p.type+' 화법'):'화법';
              const body=p.alternative||p.original||'';
              return `<div class="pick-shell-card" style="${cardStyle}">
                <div style="${titleStyle}">${typeLbl}</div>
                ${body?`<div style="${subStyle}">"${body}"</div>`:''}
              </div>`;
            }).join(''):`<div class="pick-shell-card" style="${cardStyle}"><div style="${titleStyle}">AI 평가 후 자동 생성</div><div style="${subStyle}">분석 결과에서 추출됩니다</div></div>`}
          </div>
        </div>
      </div>
    </div>`;
}

/* ── 인터PICK 관리자 영상 관리 ── */
// ── 뱃지 기준 91개 (F+: 가전 판매 강사 특화 6트랙 × 4등급 + 레전드) ──
const BADGE_CRITERIA=[
  // 📦 트랙1. 제품 장악력 (1~16)
  {id:1,name:'제품 기본 설명',cat:'교육맞춤',tier:'bronze',desc:'제품 관련 세부항목 1회 통과'},
  {id:2,name:'스펙 암기',cat:'교육맞춤',tier:'bronze',desc:'스펙·숫자·단위 언급 타임스탬프 1개 이상'},
  {id:3,name:'신제품 경험',cat:'교육맞춤',tier:'bronze',desc:'최근 6개월 내 제품 평가 1회'},
  {id:4,name:'카테고리 입문',cat:'교육맞춤',tier:'bronze',desc:'1개 교육종류 완료'},
  {id:5,name:'구조 설명',cat:'교육맞춤',tier:'silver',desc:'구조·부품 설명 good 2개 이상'},
  {id:6,name:'기술 용어 번역',cat:'교육맞춤',tier:'silver',desc:'기술용어→일상언어 전환 good 2개 이상'},
  {id:7,name:'비교 설명',cat:'교육맞춤',tier:'silver',desc:'타사/경쟁 비교 good 1개 이상'},
  {id:8,name:'시연 기본',cat:'교육맞춤',tier:'silver',desc:'시연·실물 세부항목 70% 이상'},
  {id:9,name:'FAB 구조 완성',cat:'교육맞춤',tier:'gold',desc:'제품 대항목 85% 이상'},
  {id:10,name:'경쟁사 비교왕',cat:'교육맞춤',tier:'gold',desc:'비교 관련 세부항목 85% 이상'},
  {id:11,name:'다제품 전문가',cat:'교육맞춤',tier:'gold',desc:'3개 이상 제품 평균 80% 이상'},
  {id:12,name:'신기술 설명 마스터',cat:'교육맞춤',tier:'gold',desc:'인버터/AI/에너지효율 등 기술 good 3개 이상'},
  {id:13,name:'라인업 장악',cat:'교육맞춤',tier:'platinum',desc:'5개 이상 제품 평균 90% 이상'},
  {id:14,name:'제품 전문가',cat:'교육맞춤',tier:'platinum',desc:'한 제품 10회 이상 평균 90%+'},
  {id:15,name:'신제품 스페셜리스트',cat:'교육맞춤',tier:'platinum',desc:'최근 1년 내 신제품 5회 이상'},
  {id:16,name:'기술 심화 마스터',cat:'교육맞춤',tier:'platinum',desc:'심화 기술 관련 good 10개 이상'},

  // 💼 트랙2. 세일즈 스킬 (17~30)
  {id:17,name:'오프닝 훅',cat:'교육맞춤',tier:'bronze',desc:'오프닝·도입 세부항목 70% 이상'},
  {id:18,name:'관심 유도',cat:'교육맞춤',tier:'bronze',desc:'관심·호기심 유도 good 1개 이상'},
  {id:19,name:'FAB 기본',cat:'교육맞춤',tier:'bronze',desc:'특징·장점·이익 구조 언급 1회'},
  {id:20,name:'페인 포인트 파악',cat:'교육맞춤',tier:'silver',desc:'필요/고민/니즈 관련 good 2개 이상'},
  {id:21,name:'체험 제안',cat:'교육맞춤',tier:'silver',desc:'직접·체험·경험 유도 good 1개 이상'},
  {id:22,name:'가격 언급 자연',cat:'교육맞춤',tier:'silver',desc:'가격 관련 bad 0건 & 가격 sub 존재'},
  {id:23,name:'반론 처리 능숙',cat:'교육맞춤',tier:'gold',desc:'반론·거절·의문 대응 세부항목 85% 이상'},
  {id:24,name:'클로징 기본',cat:'교육맞춤',tier:'gold',desc:'마무리·클로징 세부항목 80% 이상'},
  {id:25,name:'가격 논리',cat:'교육맞춤',tier:'gold',desc:'가치·가성비·혜택 good 2개 이상'},
  {id:26,name:'부가 제안',cat:'교육맞춤',tier:'gold',desc:'설치·할부·보증·A/S 언급 good 2개 이상'},
  {id:27,name:'클로징 달인',cat:'교육맞춤',tier:'platinum',desc:'마무리 세부항목 95% 이상'},
  {id:28,name:'가격 협상 마스터',cat:'교육맞춤',tier:'platinum',desc:'가격 관련 + 부가 제안 동시 90%+'},
  {id:29,name:'판매 완결성',cat:'교육맞춤',tier:'platinum',desc:'오프닝·클로징·가격·부가 모두 80%+'},
  {id:30,name:'VIP 케어',cat:'교육맞춤',tier:'platinum',desc:'맞춤·VIP·단골 대응 세부항목 90% 이상'},

  // 🤝 트랙3. 고객 상호작용 (31~44)
  {id:31,name:'첫 질문 유도',cat:'교육맞춤',tier:'bronze',desc:'질문 관련 good 1개 이상'},
  {id:32,name:'반응 이끌어냄',cat:'교육맞춤',tier:'bronze',desc:'참여·상호작용 세부항목 70% 이상'},
  {id:33,name:'기본 공감',cat:'교육맞춤',tier:'bronze',desc:'공감·이해 good 1개 이상'},
  {id:34,name:'공감 형성',cat:'교육맞춤',tier:'silver',desc:'공감 세부항목 80% 이상'},
  {id:35,name:'페인 체감',cat:'교육맞춤',tier:'silver',desc:'페인·고민 재현 good 2개 이상'},
  {id:36,name:'개방형 질문',cat:'교육맞춤',tier:'silver',desc:'왜/어떻게/무엇 개방형 질문 good 2개 이상'},
  {id:37,name:'체감 언어 달인',cat:'교육맞춤',tier:'gold',desc:'일상·체감·느낌 세부항목 90% 이상'},
  {id:38,name:'고객 유형 파악',cat:'교육맞춤',tier:'gold',desc:'유형별 대응 good 3개 이상'},
  {id:39,name:'반응 유도 지속',cat:'교육맞춤',tier:'gold',desc:'참여 세부항목 90% 이상'},
  {id:40,name:'참여 극대화',cat:'교육맞춤',tier:'gold',desc:'good 타임스탬프 8개+ & 참여 sub 90%+'},
  {id:41,name:'몰입감 장인',cat:'교육맞춤',tier:'platinum',desc:'good 타임스탬프 15개 이상'},
  {id:42,name:'감정 고조',cat:'교육맞춤',tier:'platinum',desc:'필요·설렘·확신 유도 good 5개 이상'},
  {id:43,name:'신뢰감 조성',cat:'교육맞춤',tier:'platinum',desc:'신뢰 관련 세부항목 95% 이상'},
  {id:44,name:'다인 응대 달인',cat:'교육맞춤',tier:'platinum',desc:'복수 고객 대응 good 3개 이상'},

  // 🎤 트랙4. 전달 기술 (45~61, AI독자 음성)
  {id:45,name:'명확한 발성',cat:'AI독자',tier:'bronze',desc:'데시벨 측정됨 (>0dB)'},
  {id:46,name:'이해 가능한 템포',cat:'AI독자',tier:'bronze',desc:'WPM 측정됨 (>0)'},
  {id:47,name:'기본 전달력',cat:'AI독자',tier:'bronze',desc:'전달·스피치 세부항목 70% 이상'},
  {id:48,name:'매장 발성',cat:'AI독자',tier:'silver',desc:'데시벨 62~72dB'},
  {id:49,name:'안정 템포',cat:'AI독자',tier:'silver',desc:'125~150 WPM'},
  {id:50,name:'반복어 절제',cat:'AI독자',tier:'silver',desc:'반복어 총 7회 이하'},
  {id:51,name:'억양 변화',cat:'AI독자',tier:'silver',desc:'억양·톤 세부항목 70%+ or 단조 bad 없음'},
  {id:52,name:'기본 환기',cat:'AI독자',tier:'silver',desc:'환기 간격 모두 12분 이내'},
  {id:53,name:'깔끔 화법',cat:'AI독자',tier:'gold',desc:'반복어 5회 이하'},
  {id:54,name:'또렷한 강조',cat:'AI독자',tier:'gold',desc:'강조·악센트 세부항목 85% 이상'},
  {id:55,name:'환기 꾸준',cat:'AI독자',tier:'gold',desc:'환기 간격 모두 10분 이내'},
  {id:56,name:'쉬기 활용',cat:'AI독자',tier:'gold',desc:'쉬기·멈춤·침묵 good 2개 이상'},
  {id:57,name:'극청결 화법',cat:'AI독자',tier:'platinum',desc:'반복어 2회 이하'},
  {id:58,name:'환기 장인',cat:'AI독자',tier:'platinum',desc:'환기 간격 모두 8분 이내'},
  {id:59,name:'집중 끌기',cat:'AI독자',tier:'platinum',desc:'집중도/구성력 95 이상'},
  {id:60,name:'에너지 마스터',cat:'AI독자',tier:'platinum',desc:'매장 발성+안정 템포+억양 모두 달성'},
  {id:61,name:'목소리 다양성',cat:'AI독자',tier:'platinum',desc:'톤·속도 변화 good 5개 이상'},

  // 🎬 트랙5. 상황·시나리오 (62~71)
  {id:62,name:'시나리오 준수',cat:'교육맞춤',tier:'bronze',desc:'교안 첨부 평가 1회'},
  {id:63,name:'교안 기본 반영',cat:'교육맞춤',tier:'bronze',desc:'rubric 50% 이상'},
  {id:64,name:'교안 흐름',cat:'교육맞춤',tier:'silver',desc:'rubric 70% 이상'},
  {id:65,name:'즉흥 대응',cat:'교육맞춤',tier:'silver',desc:'교안 외 good 2개 이상'},
  {id:66,name:'시나리오 응용',cat:'교육맞춤',tier:'gold',desc:'rubric 80%+ & 즉흥 good 3개 이상'},
  {id:67,name:'돌발 대응 우수',cat:'교육맞춤',tier:'gold',desc:'돌발·예외·즉흥 세부항목 85% 이상'},
  {id:68,name:'상황별 대응력',cat:'교육맞춤',tier:'gold',desc:'2개 이상 카테고리 평균 75% 이상'},
  {id:69,name:'완벽한 교안 이해도',cat:'교육맞춤',tier:'platinum',desc:'rubric 95% 이상'},
  {id:70,name:'유연한 전환',cat:'교육맞춤',tier:'platinum',desc:'교안+즉흥 균형 good 10개 이상'},
  {id:71,name:'상황 장악력',cat:'교육맞춤',tier:'platinum',desc:'돌발 세부항목 95% 이상'},

  // 📈 트랙6. 성장·종합·누적 (72~85)
  {id:72,name:'첫 평가',cat:'교육맞춤',tier:'bronze',desc:'첫 번째 영상 분석 완료'},
  {id:73,name:'교안 업로드',cat:'교육맞춤',tier:'bronze',desc:'교안과 함께 평가 1회'},
  {id:74,name:'2회 완주',cat:'누적',tier:'bronze',desc:'누적 영상 2개 이상'},
  {id:75,name:'C등급',cat:'교육맞춤',tier:'silver',desc:'총점 60% 이상'},
  {id:76,name:'B등급',cat:'교육맞춤',tier:'silver',desc:'총점 75% 이상'},
  {id:77,name:'꾸준 참여',cat:'누적',tier:'silver',desc:'누적 5회 이상 평가'},
  {id:78,name:'성장 출발',cat:'누적',tier:'silver',desc:'이전 대비 5점 이상 상승'},
  {id:79,name:'A등급',cat:'교육맞춤',tier:'gold',desc:'총점 85% 이상'},
  {id:80,name:'3연속 우수',cat:'누적',tier:'gold',desc:'3회 연속 80점 이상'},
  {id:81,name:'성장세',cat:'누적',tier:'gold',desc:'최근 3회 평균 상승 추세'},
  {id:82,name:'열정 강사',cat:'누적',tier:'gold',desc:'누적 15회 이상 평가'},
  {id:83,name:'S등급',cat:'교육맞춤',tier:'platinum',desc:'총점 95% 이상'},
  {id:84,name:'전항목 90+',cat:'교육맞춤',tier:'platinum',desc:'모든 대항목 90% 이상'},
  {id:85,name:'베테랑',cat:'누적',tier:'platinum',desc:'누적 30회 이상 평가'},

  // 🌟 레전드 (86~91) — 매우 받기 힘듦
  {id:86,name:'퍼펙트 강사',cat:'교육맞춤',tier:'legend',desc:'총점 100% 달성'},
  {id:87,name:'올킬',cat:'교육맞춤',tier:'legend',desc:'한 영상 전 대항목 100% 달성'},
  {id:88,name:'그랜드마스터',cat:'누적',tier:'legend',desc:'10회 연속 90점 이상'},
  {id:89,name:'분기 MVP',cat:'누적',tier:'legend',desc:'분기 최다 평가 1위 (최소 3명 경쟁)'},
  {id:90,name:'연간 MVP',cat:'누적',tier:'legend',desc:'연간 최다 평가 1위 & 평균 80 이상'},
  {id:91,name:'시니어 마스터',cat:'누적',tier:'legend',desc:'누적 50회 이상 & 평균 85 이상'}
];

// 뱃지 키워드 맵
const BADGE_KW={
  product:['제품','상품','스펙','기술','기능','특장점','성능','부품'],
  structure:['구조','분해','조립','부품','설계'],
  sales:['세일즈','판매','권유','추천','제안','구매'],
  price:['가격','가치','가성비','혜택','비용','할인','할부'],
  customer:['고객','수강생','소통','상호','참여','관심','반응'],
  pain:['필요','고민','문제','니즈','페인','어려움','불편'],
  empathy:['공감','이해','체감','느낌','일상'],
  question:['질문','왜','어떻게','무엇','어떤','여쭤'],
  demo:['시연','실물','데모','체험','직접','경험'],
  opening:['오프닝','도입','시작','처음'],
  closing:['클로징','마무리','마감','끝','정리','요약'],
  comparison:['비교','타사','경쟁','대비','대조'],
  tech:['인버터','AI','인공지능','에너지','IoT','스마트','효율'],
  addons:['설치','할부','보증','A/S','AS','서비스'],
  scenario:['시나리오','교안','흐름','순서','구성','진행','전개'],
  delivery:['발성','스피치','보이스','전달','목소리','발음','톤','억양','말하기'],
  accent:['강조','악센트','포인트','중점'],
  pause:['쉬기','멈춤','침묵','포즈'],
  variation:['변화','다양','리듬','템포'],
  trust:['신뢰','믿음','권위','확신'],
  emotion:['설렘','필요','확신','기대','욕구'],
  unexpected:['돌발','예외','즉흥','돌출','변수'],
  vip:['맞춤','VIP','단골','프리미엄']
};
const BADGE_KW_LEGACY={
  voice:['발성','스피치','보이스','전달','목소리'],
  expertise:['전문','내용','제품기본원리','제품심화','지식'],
  interaction:['상호','소통','CS','참여'],
  time:['시간','진행','흐름'],
  material:['판서','자료','프리젠테이션','자료활용','교구'],
  wrapup:['마무리','정리','요약','종료']
};

// 뱃지 등급 스타일
const TIER_STYLE={
  bronze:{label:'브론즈',color:'#92400e',bg:'#fef3c7',border:'#fcd34d'},
  silver:{label:'실버',color:'#475569',bg:'#e2e8f0',border:'#cbd5e1'},
  gold:{label:'골드',color:'#b45309',bg:'#fde68a',border:'#f59e0b'},
  platinum:{label:'플래티넘',color:'#0e7490',bg:'#cffafe',border:'#22d3ee'},
  legend:{label:'레전드',color:'#6b21a8',bg:'#f3e8ff',border:'#a855f7'}
};

// 초기 시드 (조직별 — 활성 조직 1회만)
async function seedBadgeCriteria(){
  if(!D.activeOrg) return; // 전체 조직 모드/조직 없음 시 시드 차단
  const seedKey='badge_criteria_seeded_v1_'+D.activeOrg;
  if(localStorage.getItem(seedKey)==='1') return;
  for(const b of BADGE_CRITERIA){
    await sb.from('badge_criteria').insert({name:b.name,category:b.cat,description:b.desc,sort_order:b.id,org_name:D.activeOrg});
  }
  localStorage.setItem(seedKey,'1');
  await refreshBadgeCriteriaFromDB();
}
async function refreshBadgeCriteriaFromDB(){
  let q=sb.from('badge_criteria').select('*').order('sort_order');
  if(D.activeOrg) q=q.eq('org_name', D.activeOrg);
  const {data}=await q;
  D.badgeCriteria=data||[];
}

// 뱃지 CRUD
async function addBadgeCriteria(){
  const name=document.getElementById('badge-add-name')?.value?.trim();
  const cat=document.getElementById('badge-add-cat')?.value||'교육맞춤';
  const tier=document.getElementById('badge-add-tier')?.value||'silver';
  const desc=document.getElementById('badge-add-desc')?.value?.trim();
  if(!name||!desc){alert('뱃지명과 달성 기준을 입력하세요');return;}
  if(D.isRealAdmin && !D.activeOrg){
    alert('상단 드롭다운에서 조직을 먼저 선택하세요. (전체 조직 모드에서는 추가 불가)');
    return;
  }
  // 커스텀 뱃지는 기본 뱃지 개수+1번부터 (기본 BADGE_CRITERIA.length 개 보존)
  const _base=BADGE_CRITERIA.length;
  const order=Math.max(_base+1,(D.badgeCriteria||[]).reduce((m,x)=>Math.max(m,x.sort_order||0),_base)+1);
  const orgName=curOrg();
  const payload={name,category:cat,description:desc,sort_order:order,org_name:orgName};
  // tier 컬럼이 DB에 없을 수 있으므로 시도 후 실패 시 재시도
  let error=null;
  const r1=await sb.from('badge_criteria').insert({...payload,tier});
  if(r1.error){
    const msg=(r1.error.message||'').toLowerCase();
    if(msg.includes('org_name')){
      // org_name 미존재 폴백
      const r1b=await sb.from('badge_criteria').insert({name,category:cat,description:desc,sort_order:order,tier});
      error=r1b.error;
    } else {
      const r2=await sb.from('badge_criteria').insert(payload);
      error=r2.error;
    }
  }
  if(error){alert('등록 실패: '+error.message);return;}
  await refreshBadgeCriteriaFromDB();
  renderBadgeCriteria();
  document.getElementById('badge-add-name').value='';
  document.getElementById('badge-add-desc').value='';
}
async function deleteBadgeCriteria(id){
  if(!confirm('삭제하시겠습니까?'))return;
  // 대상 행 — 현재 조직 행이거나 NULL 레거시
  const target=(D.badgeCriteria||[]).find(x=>x.id===id);
  await sb.from('badge_criteria').delete().eq('id',id);
  // NULL 레거시 행 삭제 시 다른 조직에 fork
  if(target && !target.org_name && D.activeOrg && Array.isArray(D.orgList) && D.orgList.length){
    const otherOrgs=D.orgList.filter(o=>o && o!==D.activeOrg);
    for(const otherOrg of otherOrgs){
      try{
        const dup=await sb.from('badge_criteria').select('id').eq('name',target.name).eq('org_name',otherOrg).limit(1);
        if(!dup?.data?.length){
          await sb.from('badge_criteria').insert({
            name:target.name, category:target.category, description:target.description,
            sort_order:target.sort_order, tier:target.tier, org_name:otherOrg
          });
        }
      }catch(e){ console.warn('fork badge_criteria to',otherOrg,'failed:',e); }
    }
  }
  await refreshBadgeCriteriaFromDB();
  renderBadgeCriteria();
}
async function editBadgeCriteria(id){
  const b=(D.badgeCriteria||[]).find(x=>x.id===id);
  if(!b) return;
  const name=prompt('뱃지명:',b.name);if(!name) return;
  const desc=prompt('달성 기준:',b.description);if(!desc) return;
  const cat=prompt('분류 (평가안/AI독자/누적):',b.category)||b.category;
  await sb.from('badge_criteria').update({name,description:desc,category:cat}).eq('id',id);
  const {data}=await sb.from('badge_criteria').select('*').order('sort_order');
  D.badgeCriteria=data||[];
  renderBadgeCriteria();
}

// 뱃지 ID → 트랙 정보
function getBadgeTrack(id){
  if(id>=1&&id<=16) return {name:'제품 장악력',icon:'📦',color:'#3b82f6',range:'1~16'};
  if(id>=17&&id<=30) return {name:'세일즈 스킬',icon:'💼',color:'#ef4444',range:'17~30'};
  if(id>=31&&id<=44) return {name:'고객 상호작용',icon:'🤝',color:'#10b981',range:'31~44'};
  if(id>=45&&id<=61) return {name:'전달 기술',icon:'🎤',color:'#8b5cf6',range:'45~61'};
  if(id>=62&&id<=71) return {name:'상황·시나리오',icon:'🎬',color:'#f59e0b',range:'62~71'};
  if(id>=72&&id<=85) return {name:'성장·누적',icon:'📈',color:'#06b6d4',range:'72~85'};
  if(id>=86&&id<=91) return {name:'레전드',icon:'🌟',color:'#d946ef',range:'86~91'};
  return {name:'커스텀',icon:'✨',color:'#6b7280',range:'92+'};
}

// 뱃지 기준 테이블 렌더 (기본 BADGE_CRITERIA + DB 커스텀)
function renderBadgeCriteria(){
  const tbody=el('badge-criteria-tbody');
  if(!tbody) return;
  const catColors={'교육맞춤':'var(--blue)','평가안':'var(--blue)','AI독자':'var(--green)','누적':'var(--purple)'};
  const _base=BADGE_CRITERIA.length;
  const defaults=BADGE_CRITERIA.map(b=>({id:b.id,name:b.name,category:b.cat,description:b.desc,tier:b.tier,_default:true}));
  const customs=(D.badgeCriteria||[]).filter(db=>(db.sort_order||0)>_base||(db.id||0)>_base).map(c=>({id:c.id,name:c.name,category:c.category,description:c.description,tier:c.tier||null,_default:false}));
  const list=[...defaults,...customs];
  const countLabel=el('badge-count-label');if(countLabel) countLabel.textContent=`(${list.length}개 · 기본 ${_base} + 커스텀 ${customs.length})`;

  // 트랙 요약 카드
  const sumEl=el('badge-track-summary');
  if(sumEl){
    const tracks=['제품 장악력','세일즈 스킬','고객 상호작용','전달 기술','상황·시나리오','성장·누적','레전드'];
    const trackStats={};
    tracks.forEach(t=>{trackStats[t]={count:0,ids:[]};});
    let customCount=0;
    list.forEach(b=>{
      const tk=getBadgeTrack(b.id);
      if(trackStats[tk.name]){trackStats[tk.name].count++;trackStats[tk.name].ids.push(b.id);}
      else customCount++;
    });
    sumEl.innerHTML=tracks.map(name=>{
      const s=trackStats[name];
      if(!s.count) return '';
      const tk=getBadgeTrack(s.ids[0]);
      return `<div style="padding:10px 14px;border:1px solid ${tk.color}30;border-radius:10px;background:${tk.color}0d;display:flex;align-items:center;gap:8px;min-width:150px">
        <span style="font-size:18px">${tk.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:800;color:${tk.color};white-space:nowrap">${tk.name}</div>
          <div style="font-size:10.5px;color:var(--t3);font-weight:600;margin-top:1px">${s.count}개 · ${tk.range}</div>
        </div>
      </div>`;
    }).join('')+(customCount?`<div style="padding:10px 14px;border:1px solid rgba(107,114,128,.3);border-radius:10px;background:rgba(107,114,128,.06);display:flex;align-items:center;gap:8px;min-width:150px">
      <span style="font-size:18px">✨</span>
      <div style="flex:1"><div style="font-size:12px;font-weight:800;color:#6b7280">커스텀</div><div style="font-size:10.5px;color:var(--t3);font-weight:600;margin-top:1px">${customCount}개 · 92+</div></div>
    </div>`:'');
  }

  tbody.innerHTML=list.map((b,i)=>{
    const ts=TIER_STYLE[b.tier]||null;
    const tk=getBadgeTrack(b.id);
    const tierChip=ts?`<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:800;background:${ts.bg};color:${ts.color};border:1px solid ${ts.border}">${ts.label}</span>`:`<span style="font-size:10px;color:var(--t3)">—</span>`;
    const catC=catColors[b.category]||'var(--t3)';
    const catChip=`<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${catC}15;color:${catC}">${b.category}</span>`;
    const trackChip=`<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${tk.color}15;color:${tk.color};border:1px solid ${tk.color}30;white-space:nowrap"><span>${tk.icon}</span><span>${tk.name}</span></span>`;
    const manageBtns=b._default
      ?`<span style="font-size:10px;color:var(--t3)">기본</span>`
      :`<button class="btn btn-ghost" style="padding:3px 8px;font-size:10px" onclick="editBadgeCriteria(${b.id})">수정</button>
        <button class="btn btn-ghost" style="padding:3px 8px;font-size:10px;color:var(--red)" onclick="deleteBadgeCriteria(${b.id})">삭제</button>`;
    return `<tr>
      <td style="text-align:center;font-weight:700;color:var(--t3)">${i+1}</td>
      <td>${trackChip}</td>
      <td style="font-weight:700">${b.name}</td>
      <td>${tierChip}</td>
      <td>${catChip}</td>
      <td style="font-size:12px;color:var(--t2)">${b.description}</td>
      <td style="white-space:nowrap">${manageBtns}</td>
    </tr>`;
  }).join('');
}

// 엑셀 다운로드
function downloadBadgeCriteria(){
  const list=D.badgeCriteria?.length?D.badgeCriteria:BADGE_CRITERIA.map(b=>({id:b.id,name:b.name,category:b.cat,description:b.desc}));
  let csv='\uFEFF번호,뱃지명,분류,달성 기준\n';
  list.forEach((b,i)=>{csv+=`${i+1},"${b.name}","${b.category}","${b.description}"\n`;});
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='뱃지_기준안_50개.csv';a.click();
  URL.revokeObjectURL(url);
}

// 탭 전환 시 뱃지 테이블 렌더
const _origSwitchTab=window.switchTab;
if(_origSwitchTab){
  const _wrapped=_origSwitchTab;
  // switchTab 호출 후 뱃지 렌더 체크는 아래에서 처리
}
// 뱃지기준 탭이 active될 때 자동 렌더
document.addEventListener('click',e=>{
  if(e.target.textContent?.includes('뱃지 기준')) setTimeout(renderBadgeCriteria,100);
});

// ── 뱃지 판별 로직 (91개 · 6트랙 × 4등급 + 레전드 · 가전 판매 강사 특화) ──
function evaluateBadges(r, userId){
  const badges=[];
  const cs=r.criteriaScores||[];
  if(userId){
    const uVids=(D.videos||[]).filter(v=>v.userId===userId);
    const vidIdSet=new Set(uVids.map(v=>v.id));
    const hasEval=(D.evaluations||[]).some(e=>e.video_id&&vidIdSet.has(e.video_id));
    const hasVoice=(D.voiceEvals||[]).some(v=>v.user_id===userId);
    const hasCurR=cs.length||r.overallScore>0||(r.categories&&r.categories.length);
    if(!hasEval&&!hasVoice&&!hasCurR) return [];
  }else if(!cs.length&&!r.overallScore&&!(r.categories&&r.categories.length)) return [];

  const ts=r.timestamps||[];
  const good=r.good||[], bad=r.bad||[], upgrade=r.upgrade||[];
  const total=cs.reduce((a,b)=>a+(b.score||0),0);
  const maxTotal=cs.reduce((a,b)=>a+(b.max||0),0)||100;
  const pct=maxTotal?Math.round(total/maxTotal*100):0;
  const goodTs=ts.filter(t=>t.type==='good').length;
  const badTs=ts.filter(t=>t.type==='bad').length;
  const db=r.decibel||0, tp=r.tempo||0;
  const habitTotal=(r.habits||[]).reduce((a,h)=>a+(h.count||0),0);
  const gaps=r.engagementGaps||[];
  const focus=r.focusScore||0, overall=r.overallScore||0;
  const rubric=r.rubric_alignment_score||(r.speech_report&&r.speech_report.rubric_alignment_score)||0;
  const hasEdu=!!(r.eduFileUrl||r.edu_file_url);

  const catPct=kws=>{const m=cs.filter(c=>{const n=c.name||'';return kws.some(k=>n.includes(k));});if(!m.length) return null;return m.reduce((a,c)=>a+(c.max>0?c.score/c.max*100:0),0)/m.length;};
  const tsCount=(kws,lvl)=>ts.filter(t=>{const n=(t.category||'')+(t.item||'')+(t.criteria||'')+(t.text||'');return (lvl?t.type===lvl:true)&&kws.some(k=>n.includes(k));}).length;
  const tsAvg=kws=>{const m=ts.filter(t=>{const n=(t.category||'')+(t.item||'')+(t.criteria||'');return kws.some(k=>n.includes(k));});if(!m.length) return null;return m.reduce((a,t)=>a+(t.maxScore>0?(t.score/t.maxScore)*100:0),0)/m.length;};
  const opnCount=(arr,kws)=>(arr||[]).filter(o=>{const n=(o.title||'')+(o.detail||'');return kws.some(k=>n.includes(k));}).length;

  // 📦 트랙1 (1~16)
  const productAvg=catPct([...BADGE_KW.product,...BADGE_KW_LEGACY.expertise]);
  if(productAvg!=null) badges.push(1);
  if(opnCount(good,['단위','cm','kg','리터','ℓ','dB','CMH','와트','%','원','㎡','인치','L'])>=1) badges.push(2);
  if(opnCount(good,BADGE_KW.structure)>=2) badges.push(5);
  if(opnCount(good,['쉽게','비유','일상','풀어','예로','예를','예시'])>=2) badges.push(6);
  if(opnCount(good,BADGE_KW.comparison)>=1||tsCount(BADGE_KW.comparison,'good')>=1) badges.push(7);
  const demoAvg=tsAvg(BADGE_KW.demo);
  if((demoAvg!=null&&demoAvg>=70)||opnCount(good,BADGE_KW.demo)>=2) badges.push(8);
  if(productAvg!=null&&productAvg>=85) badges.push(9);
  const compAvg=tsAvg(BADGE_KW.comparison);
  if(compAvg!=null&&compAvg>=85) badges.push(10);
  if(opnCount(good,BADGE_KW.tech)>=3) badges.push(12);
  if(opnCount(good,BADGE_KW.tech)>=10) badges.push(16);

  // 💼 트랙2 (17~30)
  const openAvg=tsAvg(BADGE_KW.opening);
  if(openAvg!=null&&openAvg>=70) badges.push(17);
  if(opnCount(good,['관심','호기심','흥미','매력','끌'])>=1) badges.push(18);
  if(opnCount(good,['특징','장점','이익','혜택'])>=1||tsCount(['FAB'],'good')>=1) badges.push(19);
  if(opnCount(good,BADGE_KW.pain)>=2) badges.push(20);
  if(opnCount(good,BADGE_KW.demo)>=1) badges.push(21);
  const priceAvg=tsAvg(BADGE_KW.price);
  const priceBad=tsCount(BADGE_KW.price,'bad');
  if(priceAvg!=null&&priceBad===0) badges.push(22);
  const objAvg=tsAvg(['반론','거절','의문','질문대응','대응']);
  if(objAvg!=null&&objAvg>=85) badges.push(23);
  const closeAvg=tsAvg(BADGE_KW.closing);
  if(closeAvg!=null&&closeAvg>=80) badges.push(24);
  if((priceAvg!=null&&priceAvg>=85)||opnCount(good,['가치','가성비','혜택','투자'])>=2) badges.push(25);
  const addonAvg=tsAvg(BADGE_KW.addons);
  if(opnCount(good,BADGE_KW.addons)>=2) badges.push(26);
  if(closeAvg!=null&&closeAvg>=95) badges.push(27);
  if(priceAvg!=null&&priceAvg>=90&&opnCount(good,BADGE_KW.addons)>=2) badges.push(28);
  const salesParts=[openAvg,closeAvg,priceAvg,addonAvg].filter(x=>x!=null);
  if(salesParts.length>=3&&salesParts.every(x=>x>=80)) badges.push(29);
  const vipAvg=tsAvg(BADGE_KW.vip);
  if(vipAvg!=null&&vipAvg>=90) badges.push(30);

  // 🤝 트랙3 (31~44)
  if(opnCount(good,BADGE_KW.question)>=1) badges.push(31);
  const custAvg=catPct([...BADGE_KW.customer,...BADGE_KW_LEGACY.interaction]);
  if(custAvg!=null&&custAvg>=70) badges.push(32);
  if(opnCount(good,BADGE_KW.empathy)>=1) badges.push(33);
  const empAvg=tsAvg(BADGE_KW.empathy);
  if(empAvg!=null&&empAvg>=80) badges.push(34);
  if(opnCount(good,[...BADGE_KW.pain,...BADGE_KW.empathy])>=2) badges.push(35);
  if(opnCount(good,BADGE_KW.question)>=2) badges.push(36);
  const feelAvg=tsAvg(['일상','체감','느낌']);
  if(feelAvg!=null&&feelAvg>=90) badges.push(37);
  if(opnCount(good,['유형','타입','연령','세대','신혼','가족','1인'])>=3) badges.push(38);
  if(custAvg!=null&&custAvg>=90) badges.push(39);
  if(goodTs>=8&&custAvg!=null&&custAvg>=90) badges.push(40);
  if(goodTs>=15) badges.push(41);
  if(opnCount(good,BADGE_KW.emotion)>=5) badges.push(42);
  const trustAvg=tsAvg(BADGE_KW.trust);
  if(trustAvg!=null&&trustAvg>=95) badges.push(43);
  if(opnCount(good,['다수','복수','동시','여러','가족'])>=3) badges.push(44);

  // 🎤 트랙4 (45~61)
  if(db>0) badges.push(45);
  if(tp>0) badges.push(46);
  const deliveryAvg=catPct([...BADGE_KW.delivery,...BADGE_KW_LEGACY.voice]);
  if(deliveryAvg!=null&&deliveryAvg>=70) badges.push(47);
  if(db>=62&&db<=72) badges.push(48);
  if(tp>=125&&tp<=150) badges.push(49);
  if(habitTotal<=7) badges.push(50);
  const accentAvg=tsAvg(BADGE_KW.accent);
  const monoBad=tsCount(['단조','밋밋','무미','평이','지루'],'bad');
  if((accentAvg!=null&&accentAvg>=70)||(monoBad===0&&deliveryAvg!=null)) badges.push(51);
  if(gaps.length&&gaps.every(g=>g<=12)) badges.push(52);
  if(habitTotal<=5) badges.push(53);
  if(accentAvg!=null&&accentAvg>=85) badges.push(54);
  if(gaps.length&&gaps.every(g=>g<=10)) badges.push(55);
  if(opnCount(good,BADGE_KW.pause)>=2) badges.push(56);
  if(habitTotal<=2) badges.push(57);
  if(gaps.length&&gaps.every(g=>g<=8)) badges.push(58);
  if(focus>=95||overall>=95) badges.push(59);
  if(db>=62&&db<=72&&tp>=125&&tp<=150&&(accentAvg==null||accentAvg>=85)) badges.push(60);
  if(opnCount(good,BADGE_KW.variation)>=5) badges.push(61);

  // 🎬 트랙5 (62~71)
  if(hasEdu) badges.push(62);
  if(rubric>=50) badges.push(63);
  if(rubric>=70) badges.push(64);
  const adlib=opnCount(good,['즉흥','응용','변형','창의','기지','임기응변']);
  if(adlib>=2) badges.push(65);
  if(rubric>=80&&adlib>=3) badges.push(66);
  const unexpAvg=tsAvg(BADGE_KW.unexpected);
  if(unexpAvg!=null&&unexpAvg>=85) badges.push(67);
  if(cs.length>=2&&cs.filter(c=>c.max>0&&c.score/c.max*100>=75).length>=2) badges.push(68);
  if(rubric>=95) badges.push(69);
  if(rubric>=80&&adlib>=3&&goodTs>=10) badges.push(70);
  if(unexpAvg!=null&&unexpAvg>=95) badges.push(71);

  // 📈 트랙6 (72~85)
  if(cs.length||overall) badges.push(72);
  if(hasEdu) badges.push(73);
  if(pct>=60) badges.push(75);
  if(pct>=75) badges.push(76);
  if(pct>=85) badges.push(79);
  if(pct>=95) badges.push(83);
  if(cs.length&&cs.every(c=>c.max>0&&c.score/c.max>=.9)) badges.push(84);

  // 🌟 레전드 (86~91)
  if(pct>=100) badges.push(86);
  if(cs.length&&cs.every(c=>c.max>0&&c.score>=c.max)) badges.push(87);

  // ── 누적 ──
  if(userId){
    const uVids=(D.videos||[]).filter(v=>v.userId===userId);
    const analyzed=uVids.filter(v=>v.status==='분석완료'&&(v.timestamps||[]).length>0);
    const vidScores=analyzed.map(v=>{const g=(v.timestamps||[]).filter(t=>t.type==='good').length;return Math.min(100,g*10+(v.timestamps||[]).length*3);}).filter(x=>x>0);
    const totalVids=uVids.length;

    const sixAgo=new Date();sixAgo.setMonth(sixAgo.getMonth()-6);
    if(uVids.some(v=>new Date(v.date||v.created_at||0)>=sixAgo)) badges.push(3);
    const eduTypes=[...new Set(uVids.map(v=>v.eduType||v.edu_type||v.videoType||v.video_type||'').filter(Boolean))];
    if(eduTypes.length>=1) badges.push(4);
    const prods=[...new Set(uVids.map(v=>v.productName||v.product_name||'').filter(Boolean))];
    const prodCount={};uVids.forEach(v=>{const p=v.productName||v.product_name||'';if(p)prodCount[p]=(prodCount[p]||0)+1;});
    if(prods.length>=3) badges.push(11);
    if(prods.length>=5) badges.push(13);
    if(Object.values(prodCount).some(c=>c>=10)) badges.push(14);
    const yearAgo=new Date();yearAgo.setFullYear(yearAgo.getFullYear()-1);
    if(uVids.filter(v=>new Date(v.date||v.created_at||0)>=yearAgo).length>=5) badges.push(15);

    if(totalVids>=2) badges.push(74);
    if(totalVids>=5) badges.push(77);
    if(totalVids>=15) badges.push(82);
    if(totalVids>=30) badges.push(85);

    if(vidScores.length>=2){
      const last=vidScores[vidScores.length-1],prev=vidScores[vidScores.length-2];
      if(last-prev>=5) badges.push(78);
    }
    if(vidScores.length>=4){
      const recent3=vidScores.slice(-3);
      const prior=vidScores.slice(0,-3);
      if(recent3.reduce((a,b)=>a+b,0)/3 - prior.reduce((a,b)=>a+b,0)/prior.length >= 3) badges.push(81);
    }
    let s80=0,mx80=0;
    vidScores.forEach(s=>{if(s>=80){s80++;mx80=Math.max(mx80,s80);}else s80=0;});
    if(mx80>=3) badges.push(80);
    let s90=0,mx90=0;
    vidScores.forEach(s=>{if(s>=90){s90++;mx90=Math.max(mx90,s90);}else s90=0;});
    if(mx90>=10) badges.push(88);

    const now=new Date(),thisY=now.getFullYear(),thisQ=Math.floor(now.getMonth()/3);
    const inThisQ=d=>{const dt=new Date(d);return dt.getFullYear()===thisY&&Math.floor(dt.getMonth()/3)===thisQ;};
    const qCounts=(D.users||[]).map(u=>({id:u.id,count:(D.videos||[]).filter(v=>v.userId===u.id&&inThisQ(v.date||v.created_at)).length})).filter(x=>x.count>0);
    const maxQ=Math.max(0,...qCounts.map(x=>x.count));
    const myQ=qCounts.find(x=>x.id===userId)?.count||0;
    if(qCounts.length>=3&&myQ>0&&myQ>=maxQ) badges.push(89);

    const inThisY=d=>new Date(d).getFullYear()===thisY;
    const yCounts=(D.users||[]).map(u=>{
      const yVids=(D.videos||[]).filter(v=>v.userId===u.id&&inThisY(v.date||v.created_at));
      const sc=yVids.map(v=>{const g=(v.timestamps||[]).filter(t=>t.type==='good').length;return Math.min(100,g*10+(v.timestamps||[]).length*3);}).filter(x=>x>0);
      return {id:u.id,count:yVids.length,avg:sc.length?sc.reduce((a,b)=>a+b,0)/sc.length:0};
    }).filter(x=>x.count>0);
    const maxY=Math.max(0,...yCounts.map(x=>x.count));
    const me=yCounts.find(x=>x.id===userId);
    if(yCounts.length>=3&&me&&me.count>=maxY&&me.avg>=80) badges.push(90);

    const allAvg=vidScores.length?vidScores.reduce((a,b)=>a+b,0)/vidScores.length:0;
    if(totalVids>=50&&allAvg>=85) badges.push(91);
  }

  return [...new Set(badges)].sort((a,b)=>a-b);
}

// 뱃지 ID → 이름/분류/등급 조회
function getBadgeInfo(id){return BADGE_CRITERIA.find(b=>b.id===id)||{name:'?',cat:'?',tier:'silver',desc:''};}

// 유저의 모든 평가에서 획득한 뱃지 합집합 — MY 프로필·인터PICK·전체 모달 공통 사용
// 영상 1개당 1회 평가 실행 (교육맞춤+AI독자 두 eval row 를 mapVertexToLegacy 방식으로 통합)
function getAccumulatedBadges(userId){
  if(!userId) return [];
  const uVids=(D.videos||[]).filter(v=>v.userId===userId);
  const vidIds=new Set(uVids.map(v=>v.id));
  const evals=(D.evaluations||[]).filter(e=>e.video_id&&vidIds.has(e.video_id));
  if(!evals.length){
    const u=(D.users||[]).find(x=>x.id===userId);
    const mock={criteriaScores:[],timestamps:[],overallScore:u?.pickScore||0,focusScore:(u?.pickScore||0)*0.9,decibel:0,tempo:0,habits:[],engagementGaps:[],good:[],bad:[],upgrade:[]};
    return evaluateBadges(mock,userId);
  }
  const byVid={};
  evals.forEach(e=>{
    if(!byVid[e.video_id]) byVid[e.video_id]={crit:null,ai:null};
    if(e.eval_type==='평가안기준') byVid[e.video_id].crit=e;
    else if(e.eval_type==='AI독자') byVid[e.video_id].ai=e;
    else byVid[e.video_id].crit=byVid[e.video_id].crit||e;
  });
  const all=new Set();
  const mapR=(row)=>({
    categories:row.categories||[], sub_scores:row.sub_scores||[],
    good:row.good||[], bad:row.bad||[], upgrade:row.upgrade||[],
    overall_score:row.overall_score||0,
    decibel:row.decibel||0, tempo:row.tempo||0,
    habits:row.habits||[], engagement_gaps:row.engagement_gaps||[],
    speech_report:row.speech_report||{}, edu_file_url:row.edu_file_url||''
  });
  Object.values(byVid).forEach(({crit,ai})=>{
    const c=crit?mapR(crit):{categories:[],sub_scores:[],good:[],bad:[],upgrade:[],overall_score:0,decibel:0,tempo:0,habits:[],engagement_gaps:[],speech_report:{},edu_file_url:''};
    const a=ai?mapR(ai):{categories:[],sub_scores:[],good:[],bad:[],upgrade:[],overall_score:0,decibel:0,tempo:0,habits:[],engagement_gaps:[],speech_report:{},edu_file_url:''};
    const main=c.sub_scores.length?c:a;
    const r={
      criteriaScores:(main.categories||[]).map(x=>({name:x.name,score:x.score||0,max:x.max||0})),
      timestamps:(main.sub_scores||[]).map(s=>({
        category:s.category||'',item:s.sub_item||'',criteria:s.criterion||'',
        type:s.level==='good'?'good':s.level==='bad'?'bad':s.level==='na'?'na':'tip',
        score:s.score||0,maxScore:s.max||0,text:s.analysis||''
      })),
      good:main.good, bad:main.bad, upgrade:main.upgrade,
      overallScore:c.overall_score||a.overall_score||0,
      focusScore:a.overall_score||c.overall_score||0,
      decibel:a.decibel||c.decibel||0,
      tempo:a.tempo||c.tempo||0,
      habits:a.habits?.length?a.habits:c.habits,
      engagementGaps:a.engagement_gaps?.length?a.engagement_gaps:c.engagement_gaps,
      rubric_alignment_score:c.speech_report?.rubric_alignment_score||a.speech_report?.rubric_alignment_score||0,
      eduFileUrl:c.edu_file_url||a.edu_file_url||''
    };
    evaluateBadges(r,userId).forEach(id=>all.add(id));
  });
  return [...all].sort((a,b)=>a-b);
}

// 뱃지 HTML 렌더 (pill 형태) — 등급별 컬러 적용
function renderBadgePills(badgeIds){
  return badgeIds.map(id=>{
    const b=getBadgeInfo(id);
    const ts=TIER_STYLE[b.tier]||TIER_STYLE.silver;
    const tipPrefix=ts?`[${ts.label}] `:'';
    // 글씨는 검정 고정, 배경·테두리만 등급 컬러
    return `<span class="eval-kw-wrap" style="position:relative;display:inline-block" onmouseenter="this.querySelector('.badge-tip').style.display='block'" onmouseleave="this.querySelector('.badge-tip').style.display='none'" onclick="var t=this.querySelector('.badge-tip');t.style.display=t.style.display==='block'?'none':'block'">
      <span class="eval-kw-pill" style="background:${ts.bg};color:#1a202c;border-color:${ts.border}">${b.name}</span>
      <span class="badge-tip">${tipPrefix}${b.desc||''}<span class="badge-tip-arrow"></span></span>
    </span>`;
  }).join('');
}

// 등급 우선 정렬 + 상위 3개만 노출, 나머지는 '+N' 버튼 토글 (AI 평가 배너 용)
function renderBadgesCollapsed(badgeIds, key){
  if(!badgeIds||!badgeIds.length) return '';
  const tierRank={legend:0,platinum:1,gold:2,silver:3,bronze:4};
  const sorted=[...badgeIds].sort((a,b)=>(tierRank[getBadgeInfo(a).tier||'silver'])-(tierRank[getBadgeInfo(b).tier||'silver']));
  const MAX=3;
  if(sorted.length<=MAX) return renderBadgePills(sorted);
  const top=sorted.slice(0,MAX);
  const rest=sorted.slice(MAX);
  const restId='kw-rest-'+(key||'x')+'-'+Date.now().toString(36)+Math.floor(Math.random()*1000);
  return renderBadgePills(top)
    + `<span id="${restId}" style="display:none">${renderBadgePills(rest)}</span>`
    + `<span onclick="(function(b){var r=document.getElementById('${restId}');var hidden=r.style.display==='none';r.style.display=hidden?'contents':'none';b.textContent=hidden?'− 접기':'+${rest.length}';})(this)" style="padding:3px 10px;border-radius:14px;font-size:10px;font-weight:800;background:rgba(255,255,255,.22);color:#fff;border:1px solid rgba(255,255,255,.35);cursor:pointer;user-select:none">+${rest.length}</span>`;
}

function resetAdminCoachFilters(){
  ['admin-coach-period','admin-coach-channel','admin-coach-team','admin-coach-cat','admin-coach-prod'].forEach(id=>{const s=document.getElementById(id);if(s)s.value='';});
  const nameEl=document.getElementById('admin-coach-name');if(nameEl)nameEl.value='';
  renderAdminCoaching();
}

function renderAdminCoaching(){
  // 필터 옵션 채우기
  const chSel=document.getElementById('admin-coach-channel');
  const tmSel=document.getElementById('admin-coach-team');
  const catSel=document.getElementById('admin-coach-cat');
  const prodSel=document.getElementById('admin-coach-prod');
  if(chSel&&chSel.options.length<=1){
    [...new Set((D.users||[]).map(u=>u.orgName).filter(Boolean))].forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;chSel.appendChild(o);});
  }
  if(tmSel&&tmSel.options.length<=1){
    [...new Set((D.users||[]).map(u=>u.team).filter(Boolean))].forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;tmSel.appendChild(o);});
  }
  if(catSel){
    const want=getEduTypes();
    const prev=catSel.value;
    catSel.innerHTML='<option value="">전체</option>'+want.map(c=>`<option value="${c}">${c}</option>`).join('');
    catSel.value=prev;
  }
  if(prodSel&&prodSel.options.length<=1){
    Object.entries(PRODUCT_TREE).forEach(([g,items])=>{
      const og=document.createElement('optgroup');og.label=g;
      items.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;og.appendChild(o);});
      prodSel.appendChild(og);
    });
  }
  // 필터값
  const period=document.getElementById('admin-coach-period')?.value||'';
  const channel=chSel?.value||'';
  const team=tmSel?.value||'';
  const nameQ=(document.getElementById('admin-coach-name')?.value||'').trim().toLowerCase();
  const catV=catSel?.value||'';
  const prodV=prodSel?.value||'';

  // 유저 필터
  let users=(D.users||[]);
  if(channel) users=users.filter(u=>u.orgName===channel);
  if(team) users=users.filter(u=>u.team===team);
  if(nameQ) users=users.filter(u=>(u.name||'').toLowerCase().includes(nameQ));
  const uids=new Set(users.map(u=>u.id));

  // 영상 필터
  let vids=(D.videos||[]).filter(v=>uids.has(v.userId));
  if(catV) vids=vids.filter(v=>(v.eduType||v.edu_type||'')===catV);
  if(prodV) vids=vids.filter(v=>(v.productName||v.product_name||v.videoType||v.video_type||'').includes(prodV));
  if(period){const cutoff=new Date();cutoff.setDate(cutoff.getDate()-parseInt(period));vids=vids.filter(v=>new Date(v.date||v.created_at)>=cutoff);}
  vids.sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  // 음성 필터
  let voices=(D.voiceEvals||[]).filter(v=>uids.has(v.user_id));
  if(period){const cutoff=new Date();cutoff.setDate(cutoff.getDate()-parseInt(period));voices=voices.filter(v=>new Date(v.eval_date||v.created_at)>=cutoff);}
  voices.sort((a,b)=>(b.eval_date||b.created_at||'').localeCompare(a.eval_date||a.created_at||''));

  // 영상 목록 렌더
  const vidListEl=document.getElementById('admin-coach-vid-list');
  const vidCntEl=document.getElementById('admin-coach-vid-cnt');
  if(vidCntEl) vidCntEl.textContent=vids.length+'건';
  if(vidListEl) vidListEl.innerHTML=vids.length?vids.map(vid=>{
    const u=D.users?.find(x=>x.id===vid.userId);
    const vCat=vid.eduType||vid.edu_type||vid.videoType||vid.video_type||'';
    const vProd=vid.productName||vid.product_name||'';
    const title=(vid.title||'—').replace(/'/g,"\\'");
    return `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.04)">
      <div style="flex:1;min-width:0;cursor:pointer" onclick="openVideo(${vid.id})">
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${vid.title||'—'}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">${u?.name||'(삭제된 강사)'} · ${vid.date}${vCat?' · '+vCat:''}${vProd?' · '+vProd:''}</div>
      </div>
      <button class="btn" style="padding:4px 10px;font-size:10px;font-weight:700;color:var(--red);border:1px solid var(--red);border-radius:999px;background:#fff;cursor:pointer" onclick="event.stopPropagation();adminDeleteVideoFromList(${vid.id},'${title}')">삭제</button>
    </div>`;
  }).join(''):'<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">해당 조건의 영상이 없습니다</div>';

  // 음성 목록 렌더
  const voiceListEl=document.getElementById('admin-coach-voice-list');
  const voiceCntEl=document.getElementById('admin-coach-voice-cnt');
  if(voiceCntEl) voiceCntEl.textContent=voices.length+'건';
  if(voiceListEl) voiceListEl.innerHTML=voices.length?voices.map(vo=>{
    const u=D.users?.find(x=>x.id===vo.user_id);
    const title=(vo.title||'—').replace(/'/g,"\\'");
    return `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.04)">
      <div style="flex:1;min-width:0;cursor:pointer" onclick="openVoiceResult(${vo.id})">
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${vo.title||'—'}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">${u?.name||vo.user_name||'(삭제된 강사)'} · ${vo.eval_date||vo.created_at?.slice(0,10)||'—'}</div>
      </div>
      <button class="btn" style="padding:4px 10px;font-size:10px;font-weight:700;color:var(--red);border:1px solid var(--red);border-radius:999px;background:#fff;cursor:pointer" onclick="event.stopPropagation();adminDeleteVoiceFromList(${vo.id},'${title}')">삭제</button>
    </div>`;
  }).join(''):'<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">해당 조건의 스피치 평가가 없습니다</div>';

  // 시나리오 목록 렌더 (누적 보관: app_settings.key='sc_final_user_{id}_{ts}')
  renderAdminCoachingScenarios({channel, team, nameQ, period, catV, prodV, uids});
}

// 시나리오 데이터 별도 로드 (debounce + 캐싱)
// 시나리오 1건 → 표준 레코드 변환 (key = sc_final_user_{userId}_{ts})
function scParseFinalRow(row){
  const rest=(row.key||'').replace(/^sc_final_user_/,'');
  const userId=parseInt(rest.split('_')[0])||0;
  let parsed={};
  try{ parsed=typeof row.value==='string'?JSON.parse(row.value):(row.value||{}); }catch(_){ parsed={}; }
  return {
    key:row.key,
    user_id:userId,
    draft:parsed.draft||'',
    revised:parsed.revised||'',
    eduType:parsed.eduType||'',
    product:parsed.product||'',
    phase:parsed.phase||'',
    customer:parsed.customer||'',
    store:parsed.store||'',
    grade:parsed.grade||'',
    score:parsed.score||0,
    finalized:parsed.finalized!==false,
    finalized_at:parsed.finalized_at||'',
    org_name:parsed.org_name||'',
    user_name:parsed.user_name||'',
    updated_at:parsed.finalized_at||parsed.updated_at||row.updated_at||row.created_at||''
  };
}
async function loadAllScenarioDrafts(){
  if(!sb) return;
  try{
    // 누적 보관: 강사별 다건 (sc_final_user_{id}_{ts})
    const {data,error}=await sb.from('app_settings').select('key,value,updated_at,created_at').like('key','sc_final_user_%');
    if(error){ console.warn('loadAllScenarioDrafts:',error.message); D.scenarioDrafts=[]; return; }
    D.scenarioDrafts=(data||[]).map(scParseFinalRow)
      .filter(s=>s.user_id>0 && (s.draft||s.revised||s.eduType||s.product));
  }catch(e){ console.warn('loadAllScenarioDrafts:',e); D.scenarioDrafts=[]; }
}

function renderAdminCoachingScenarios({channel, team, nameQ, period, catV, prodV, uids}){
  const listEl=document.getElementById('admin-coach-sc-list');
  const cntEl=document.getElementById('admin-coach-sc-cnt');
  if(!listEl) return;
  // 시나리오 데이터 미로드 시 자동 fetch (1회)
  if(!D.scenarioDrafts){
    listEl.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">시나리오 불러오는 중...</div>';
    loadAllScenarioDrafts().then(()=>renderAdminCoachingScenarios({channel, team, nameQ, period, catV, prodV, uids}));
    return;
  }
  // 필터 적용
  let scs=(D.scenarioDrafts||[]).filter(s=>uids.has(s.user_id));
  if(catV) scs=scs.filter(s=>s.eduType===catV);
  if(prodV) scs=scs.filter(s=>(s.product||'').includes(prodV));
  if(period){
    const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-parseInt(period));
    scs=scs.filter(s=>s.updated_at && new Date(s.updated_at)>=cutoff);
  }
  // 데모 모드: 실제 시나리오 없으면 샘플로 채움
  if(IB_DEMO() && !scs.length){
    scs=demoScenariosForUsers((D.users||[]).filter(u=>uids.has(u.id)),4);
    if(catV) scs=scs.map(s=>({...s,eduType:catV}));
    if(prodV) scs=scs.map(s=>({...s,product:prodV}));
  }
  scs.sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''));
  if(cntEl) cntEl.textContent=scs.length+'건';
  listEl.innerHTML = scs.length ? scs.map(sc=>{
    const u=D.users?.find(x=>x.id===sc.user_id);
    const finalText=(sc.revised||sc.draft||'');
    const preview=finalText.slice(0,60).replace(/</g,'&lt;').replace(/\n/g,' ');
    const titleBits=[sc.eduType, sc.product].filter(Boolean).join(' · ') || '시나리오 초안';
    const isFinal=sc.finalized||!!sc.revised;
    const badge=isFinal
      ? `<span style="display:inline-block;font-size:9px;font-weight:800;color:#fff;background:#10b981;border-radius:999px;padding:1px 7px;margin-left:6px">완성${sc.grade?' · '+sc.grade:''}</span>`
      : `<span style="display:inline-block;font-size:9px;font-weight:700;color:#92400e;background:#fef3c7;border-radius:999px;padding:1px 7px;margin-left:6px">작성 중</span>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.04)">
      <div style="flex:1;min-width:0;cursor:pointer" onclick="openScenarioDetailFromAdmin('${sc.key}')">
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${titleBits.replace(/</g,'&lt;')}${badge}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">${u?.name||sc.user_name||'(삭제된 강사)'} · ${(sc.updated_at||'').slice(0,10)||'—'}${finalText?' · '+finalText.length+'자':''}</div>
        ${preview?`<div style="font-size:10px;color:var(--t2);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">"${preview}${finalText.length>60?'…':''}"</div>`:''}
      </div>
      <button class="btn" style="padding:4px 10px;font-size:10px;font-weight:700;color:var(--red);border:1px solid var(--red);border-radius:999px;background:#fff;cursor:pointer" onclick="event.stopPropagation();adminDeleteScenarioFromList('${sc.key}','${(titleBits).replace(/'/g,"\\'")}')">삭제</button>
    </div>`;
  }).join('') : '<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">해당 조건의 시나리오가 없습니다</div>';
}

// 시나리오 상세 — 모달로 표시 (수정은 강사 본인이 AI 코칭 페이지에서)
function openScenarioDetailFromAdmin(key){
  const sc=(D.scenarioDrafts||[]).find(s=>s.key===key);
  if(!sc){ alert('시나리오를 찾지 못했습니다.'); return; }
  const u=D.users?.find(x=>x.id===sc.user_id);
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.style.zIndex='10100';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  const finalText = (sc.revised||sc.draft||'');
  const safeText = finalText.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;padding:24px;max-width:760px;width:92vw;max-height:88vh;overflow-y:auto;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
      <div>
        <div style="font-size:11px;color:var(--t3);font-weight:600">${(sc.finalized||sc.revised)?'최종 완성 시나리오':'시나리오 초안'} · ${(sc.updated_at||'').slice(0,16).replace('T',' ')||'—'}${(sc.finalized||sc.revised)&&sc.grade?' · '+sc.grade+'등급':''}</div>
        <div style="font-size:17px;font-weight:900;margin-top:4px">${u?.name||sc.user_name||'(삭제된 강사)'} <span style="font-size:11px;color:var(--t3);font-weight:500">${u?.team||''}${u?.position?' · '+u.position:''}</span></div>
      </div>
      <button style="border:none;background:none;cursor:pointer;font-size:22px;color:var(--t3)" onclick="this.closest('.overlay').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:14px;font-size:11px">
      ${['eduType','product','phase','customer','store'].map((k,i)=>{
        const labels=['교육종류','제품','단계','고객','매장'];
        return `<div style="padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;background:#fafafa"><div style="font-size:9px;color:var(--t3);margin-bottom:2px">${labels[i]}</div><div style="font-size:11px;font-weight:700">${(sc[k]||'—').replace(/</g,'&lt;')}</div></div>`;
      }).join('')}
    </div>
    <div style="font-size:12px;color:var(--t3);font-weight:700;margin-bottom:6px">${sc.revised?'최종 완성 시나리오':'시나리오 본문'} ${finalText?'('+finalText.length+'자)':''}${(sc.finalized||sc.revised)&&sc.grade?' · '+sc.grade+'등급':''}</div>
    <div style="border:1px solid var(--bdr);border-radius:10px;padding:16px;background:#fafafa;font-size:13px;line-height:1.7;color:var(--t1);white-space:pre-wrap;word-break:break-word;max-height:50vh;overflow-y:auto">${safeText||'<span style="color:var(--t3)">초안이 비어있습니다</span>'}</div>
    <div style="margin-top:14px;font-size:10px;color:var(--t3)">💡 수정은 강사 본인이 AI 코칭 페이지의 시나리오 코치에서 진행합니다.</div>
  </div>`;
  document.body.appendChild(overlay);
}

async function adminDeleteScenarioFromList(key, title){
  if(!confirm(`시나리오 "${title}" 을(를) 삭제하시겠습니까?\n해당 완성본 1건이 사라집니다.`)) return;
  try{
    const {error}=await sb.from('app_settings').delete().eq('key', key);
    if(error){ alert('삭제 실패: '+error.message); return; }
    // 캐시 갱신 (해당 1건만 제거)
    if(Array.isArray(D.scenarioDrafts)){
      D.scenarioDrafts=D.scenarioDrafts.filter(s=>s.key!==key);
    }
    renderAdminCoaching();
    if(typeof showToast==='function') showToast('시나리오 삭제 완료','#10b981');
  }catch(e){ alert('삭제 오류: '+(e?.message||e)); }
}

// 관리자 — AI 코칭 목록에서 바로 삭제
async function adminDeleteVideoFromList(id,title){
  if(!confirm(`영상 "${title}" 을(를) 삭제하시겠습니까?\n관련 평가 데이터도 함께 삭제됩니다.`)) return;
  try{
    await sb.from('evaluations').delete().eq('video_id',id);
    await sb.from('video_timestamps').delete().eq('video_id',id).then(()=>{}).catch(()=>{});
    const{error}=await sb.from('videos').delete().eq('id',id);
    if(error){alert('삭제 실패: '+error.message);return;}
    await loadFromDB();
    renderAdminCoaching();
  }catch(e){alert('삭제 오류: '+(e.message||e));}
}
async function adminDeleteVoiceFromList(id,title){
  if(!confirm(`스피치 평가 "${title}" 을(를) 삭제하시겠습니까?`)) return;
  try{
    const{error}=await sb.from('voice_evals').delete().eq('id',id);
    if(error){alert('삭제 실패: '+error.message);return;}
    await loadFromDB();
    renderAdminCoaching();
  }catch(e){alert('삭제 오류: '+(e.message||e));}
}

function renderPickAdmin(){
  const sel=el('pick-admin-select');
  const listEl=el('pick-admin-list');
  if(!sel||!listEl) return;
  // 셀렉트: 분석완료 영상 전체
  const featuredIds=(D.pickFeaturedVideos||[]).map(f=>f.video_id);
  const availVids=(D.videos||[]).filter(vd=>vd.status==='분석완료'&&!featuredIds.includes(vd.id));
  sel.innerHTML='<option value="">영상 선택 —</option>'+availVids.map(vd=>{
    const u=D.users?.find(x=>x.id===vd.userId);
    return `<option value="${vd.id}">${vd.title||'—'} · ${u?.name||'—'} · ${vd.date||''}</option>`;
  }).join('');
  // 목록
  const featured=(D.pickFeaturedVideos||[]).slice().sort((a,b)=>(a.order_index||0)-(b.order_index||0));
  if(!featured.length){listEl.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3);border:1px dashed rgba(0,0,0,.15);border-radius:10px">등록된 인터PICK 영상이 없습니다</div>';return;}
  listEl.innerHTML=featured.map((f,i)=>{
    const vd=(D.videos||[]).find(x=>x.id===f.video_id);
    const u=D.users?.find(x=>x.id===vd?.userId);
    if(!vd) return `<div style="padding:12px;margin-bottom:8px;border-radius:10px;border:1px solid rgba(226,30,38,.25);background:rgba(226,30,38,.04);display:flex;align-items:center;gap:10px"><span style="flex:1;font-size:12px;color:var(--red)">삭제된 영상 (ID: ${f.video_id})</span><button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--red)" onclick="removePickFeatured(${f.id})">삭제</button></div>`;
    return `<div style="padding:12px 14px;margin-bottom:8px;border-radius:10px;border:1px solid var(--bdr);display:flex;align-items:center;gap:12px;background:#fff">
      <div style="width:28px;height:28px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">${i+1}</div>
      <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${vd.title||'—'}</div><div style="font-size:10px;color:var(--t3);margin-top:2px">${u?.name||'—'} 강사 · ${vd.date||''} · ${vd.videoType||vd.video_type||'—'}</div></div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 8px" onclick="movePickFeatured(${f.id},-1)" ${i===0?'disabled':''}>▲</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 8px" onclick="movePickFeatured(${f.id},1)" ${i===featured.length-1?'disabled':''}>▼</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;color:var(--red)" onclick="removePickFeatured(${f.id})">삭제</button>
      </div>
    </div>`;
  }).join('');
}
async function addPickFeatured(){
  const sel=el('pick-admin-select');if(!sel) return;
  const vidId=parseInt(sel.value);if(!vidId){alert('영상을 선택하세요');return;}
  const order=(D.pickFeaturedVideos||[]).length;
  const {error}=await sb.from('pick_featured_videos').insert({video_id:vidId,order_index:order,org_name:curOrg()});
  if(error){alert('등록 실패: '+error.message);return;}
  await loadFromDB();renderPickAdmin();
}
async function removePickFeatured(rowId){
  if(!confirm('등록 영상을 삭제하시겠습니까?'))return;
  const {error}=await sb.from('pick_featured_videos').delete().eq('id',rowId);
  if(error){alert('삭제 실패: '+error.message);return;}
  await loadFromDB();renderPickAdmin();
}
async function movePickFeatured(rowId,dir){
  const list=(D.pickFeaturedVideos||[]).slice().sort((a,b)=>(a.order_index||0)-(b.order_index||0));
  const idx=list.findIndex(f=>f.id===rowId);
  if(idx<0) return;
  const swapIdx=idx+dir;
  if(swapIdx<0||swapIdx>=list.length) return;
  const a=list[idx],b=list[swapIdx];
  const {error:e1}=await sb.from('pick_featured_videos').update({order_index:b.order_index}).eq('id',a.id);
  const {error:e2}=await sb.from('pick_featured_videos').update({order_index:a.order_index}).eq('id',b.id);
  if(e1||e2){alert('순서 변경 실패');return;}
  await loadFromDB();renderPickAdmin();
}

function openAdminWithAuth(){
  if(!CU?.isAdmin){ alert('관리자 또는 부관리자만 접근 가능합니다.'); return; }
  renderAdmin(); showPage('page-admin');
}
function openAdmin(){
  if(!CU?.isAdmin){ alert('관리자 또는 부관리자만 접근 가능합니다.'); return; }
  renderAdmin(); showPage('page-admin');
}
function checkAdmin(){
  if(!CU?.isAdmin){ el('admin-err').textContent='관리자 또는 부관리자만 접근 가능합니다.'; return; }
  closeOverlay('admin-overlay'); renderAdmin(); showPage('page-admin');
}
function refreshAdminVisibility(){
  const isAdm = !!CU?.isAdmin;
  document.body.classList.toggle('role-admin', isAdm);
  document.querySelectorAll('[data-page="page-admin"]').forEach(el=>{ el.style.display = isAdm ? '' : 'none'; });
  document.querySelectorAll('.mobile-nav-item[onclick*="openAdminWithAuth"]').forEach(el=>{ el.style.display = isAdm ? '' : 'none'; });
}
function closeOverlay(id){ el(id).classList.remove('show'); }
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o) o.classList.remove('show'); }));

