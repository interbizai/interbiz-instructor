/* 05-home-analysis.js — 홈(인터PICK) + 스트리밍 + 영상등록 분석(AI 평가)
   (index.html 9464~12601행에서 분리 · 로드 순서 유지 필수) */

/* ════════════════════════════════
   AI 코칭 실행 스위치 (비용 관리용)
   ────────────────────────────────
   평소에는 강사 누구나 AI 분석을 실행할 수 있다.
   관리자가 [관리자 → 금액 현황] 에서 '중지' 로 바꾸면 그때만 실행이 막힌다.
   · 조직별로 따로 켜고 끌 수 있음 (LG전자 강사 / 하이케어솔루션)
   · 관리자 본인은 중지 중에도 실행 가능 (점검·테스트용)
   · 이미 저장된 평가 결과 열람은 어떤 경우에도 막지 않는다 — 실행만 제한
════════════════════════════════ */
function aiCoachingSettingKey(){
  const org=(typeof curOrg==='function' && curOrg())||'';
  return org ? 'ai_coaching_blocked_'+org : 'ai_coaching_blocked';
}
// 서버 설정을 읽어 전역 캐시에 저장 (로그인 직후 · 토글 직후 호출)
async function loadAiCoachingFlag(){
  if(!window.sb) return;
  try{
    const {data,error}=await sb.from('app_settings').select('value').eq('key',aiCoachingSettingKey()).maybeSingle();
    if(error) return;                      // 조회 실패 시 기존 값 유지 (기본 허용)
    window._aiCoachingBlocked = String(data?.value||'0')==='1';
  }catch(_){}
}
function isAiCoachingBlocked(){ return window._aiCoachingBlocked===true; }
function canRunAnalysis(){
  if(!isAiCoachingBlocked()) return true;                  // 평소 — 전원 사용 가능
  return !!(typeof CU!=='undefined' && CU && CU.isAdmin);  // 중지 중 — 관리자만 예외
}
function showAiCoachingBlockedNotice(featureName){
  document.getElementById('admin-only-overlay')?.remove();
  const ov=document.createElement('div');
  ov.className='overlay show';
  ov.id='admin-only-overlay';
  const close=()=>ov.remove();
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.innerHTML=`<div style="background:#fff;border-radius:16px;padding:32px 28px 24px;max-width:400px;width:88vw;text-align:center;animation:scaleIn .25s cubic-bezier(.22,1,.36,1);box-shadow:0 20px 60px rgba(0,0,0,.18)">
    <div style="width:56px;height:56px;margin:0 auto 18px;border-radius:50%;background:rgba(245,158,11,.1);display:flex;align-items:center;justify-content:center">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    </div>
    <div style="font-size:17px;font-weight:900;color:var(--t1);margin-bottom:8px">AI 코칭이 일시 중지되었습니다</div>
    <div style="font-size:13px;color:var(--t2);line-height:1.65;margin-bottom:22px">
      ${featureName||'AI 평가 분석'}은 현재 관리자가 중지해 둔 상태입니다.<br>
      이용이 필요하시면 관리자에게 문의해주세요.
    </div>
    <div style="font-size:11px;color:var(--t3);margin-bottom:18px">이미 완료된 평가 결과는 그대로 확인하실 수 있습니다.</div>
    <button class="btn btn-blue" id="admin-only-ok" style="width:100%;padding:11px;font-size:13px;font-weight:800">확인</button>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelector('#admin-only-ok').onclick=close;
}
// 분석 실행 직전 호출 — 중지 상태면 안내 후 false 반환
function requireAnalysisPermission(featureName){
  if(canRunAnalysis()) return true;
  showAiCoachingBlockedNotice(featureName);
  return false;
}
/* ════════════════════════════════
   HOME PAGE
════════════════════════════════ */
/* ════════════════════════════════
   PARTICLE LOGO EFFECT
════════════════════════════════ */
let logoParticles=[], logoAnimId=null, logoInitialized=false;

function initLogoParticles(){
  const canvas=el('logo-canvas');
  if(!canvas||logoInitialized) return;

  const W=window.innerWidth, H=window.innerHeight-60;
  canvas.width=W; canvas.height=H;
  canvas.style.position='fixed';canvas.style.top='60px';canvas.style.left='0';canvas.style.zIndex='50';canvas.style.width='100vw';canvas.style.height='calc(100vh - 60px)';
  const ctx=canvas.getContext('2d');

  // Load logo image
  const img=new Image();
  img.crossOrigin='anonymous';
  img.onload=()=>{
    // Draw logo to offscreen canvas to read pixels
    const off=document.createElement('canvas');
    off.width=W; off.height=H;
    const offCtx=off.getContext('2d');
    const scale=130/img.height;
    const dw=img.width*scale, dh=img.height*scale;
    // 실제 로고 img 위치 읽기
    const logoImg=document.querySelector('.home-hero img');
    let logoY=60;
    if(logoImg){
      const rect=logoImg.getBoundingClientRect();
      logoY=rect.top-60; // 헤더(60px) 빼기
    }
    offCtx.drawImage(img,(W-dw)/2,logoY,dw,dh);

    const imageData=offCtx.getImageData(0,0,W,H);
    const pixels=imageData.data;

    logoParticles=[];
    const step=2;

    for(let y=0;y<H;y+=step){
      for(let x=0;x<W;x+=step){
        const i=(y*W+x)*4;
        const a=pixels[i+3];
        if(a>50){
          const r=pixels[i], g=pixels[i+1], b=pixels[i+2];
          const edge=Math.floor(Math.random()*4);
          let sx,sy;
          if(edge===0){sx=Math.random()*W;sy=-20-Math.random()*100;}
          else if(edge===1){sx=Math.random()*W;sy=H+20+Math.random()*100;}
          else if(edge===2){sx=-20-Math.random()*100;sy=Math.random()*H;}
          else{sx=W+20+Math.random()*100;sy=Math.random()*H;}
          logoParticles.push({
            x: sx,
            y: sy,
            tx: x, ty: y,
            vx: 0, vy: 0,
            r, g, b, a,
            size: step,
            speed: Math.random()*0.006+0.004,
            arrived: false
          });
        }
      }
    }
    logoInitialized=true;
    animateLogo();
  };
  img.src='assets/logo/인터비즈로고.png';
}

function animateLogo(){
  const canvas=el('logo-canvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;

  ctx.clearRect(0,0,W,H);

  let allArrived=true;

  for(const p of logoParticles){
    if(!p.arrived){
      // Ease towards target
      const dx=p.tx-p.x, dy=p.ty-p.y;
      const dist=Math.sqrt(dx*dx+dy*dy);

      if(dist<0.3){
        p.x=p.tx; p.y=p.ty;
        p.arrived=true;
      } else {
        p.x+=dx*p.speed;
        p.y+=dy*p.speed;
        p.speed=Math.min(p.speed+0.0002, 0.03);
        allArrived=false;
      }
    }

    // Draw
    ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},${p.a/255})`;
    if(p.arrived){
      ctx.fillRect(p.x,p.y,p.size,p.size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.size*0.7,0,Math.PI*2);
      ctx.fill();
    }
  }

  if(!allArrived){
    logoAnimId=requestAnimationFrame(animateLogo);
  } else {
    // Final: fade out canvas, show normal page
    setTimeout(()=>{
      canvas.style.transition='opacity 0.8s ease';
      canvas.style.opacity='0';
      setTimeout(()=>{
        canvas.style.display='none';
        canvas.style.position='';canvas.style.top='';canvas.style.left='';canvas.style.zIndex='';
        canvas.style.width='';canvas.style.height='';canvas.style.opacity='';canvas.style.transition='';
      },800);
    },500);
  }
}

function initHome(){
  // Carousel: DB 영상 + 기본 유튜브 5개
  const defaultVids=[
    {title:'에어컨 신제품 실전 교육',yt:'gp7U-Kobtt0',name:'김민준',team:'수도권1팀',channel:'현장코칭강사',score:94},
    {title:'백화점 VS 매장 비교 강의',yt:'rcRCF3gPSAo',name:'이수연',team:'수도권2팀',channel:'현장코칭강사',score:91},
    {title:'로보락 S 시리즈 출시 교육',yt:'OxALSj3q-QE',name:'박도윤',team:'중부팀',channel:'하이케어솔루션',score:88},
    {title:'현장 트러블 대응 시나리오',yt:'ZOw_yYqgULk',name:'최지아',team:'수도권1팀',channel:'현장코칭강사',score:85},
    {title:'고객 클레임 실전 롤플레잉',yt:'Z0Sw-G-S14g',name:'정현서',team:'남부팀',channel:'하이케어솔루션',score:82},
  ];
  const dbVids=D.videos.filter(v=>v.status==='분석완료').map(vid=>{
    const u=D.users.find(x=>x.id===vid.userId);
    const m=vid.youtube?vid.youtube.match(/[?&]v=([^&]+)/):null;
    return {title:vid.title, yt:m?m[1]:'', meta:u?.name||'', id:vid.id};
  });
  const carouselItems=dbVids.length>0?dbVids:defaultVids;
  const items=[...carouselItems,...carouselItems];
  const trackEl=el('home-track');
  if(!trackEl){startHomeIconAnimations();return;}
  trackEl.innerHTML=items.map((v,i)=>{
    const thumb=v.yt?`background-image:url('https://img.youtube.com/vi/${v.yt}/hqdefault.jpg')`:'background:#1a1a2e';
    const onclick=v.id?`onclick="openVideo(${v.id})"`:`onclick="window.open('https://www.youtube.com/watch?v=${v.yt}','_blank')"`;
    return `<div class="carousel-card" ${onclick}>
      <div class="carousel-card-bg" style="${thumb}"></div>
      <div class="carousel-top">
        <span class="ct-chip">${v.channel||''}</span>
        <span>${v.name||v.meta||''}</span>
        <span>${v.team||''}</span>
        ${v.score?`<span class="ct-score">${v.score}점</span>`:''}
      </div>
      <div class="carousel-overlay">
        <div class="carousel-title">${v.title}</div>
      </div>
    </div>`;
  }).join('');
  // home icon animations
  startHomeIconAnimations();
}
function startHomeIconAnimations(){
  setInterval(()=>{const e=el('hi1');if(e)e.classList.toggle('done');},2200);
  setInterval(()=>{const e=el('hi2');if(e)e.classList.toggle('playing');},2400);
  setInterval(()=>{const e=el('hi6');if(e)e.classList.toggle('downloaded');},2600);
  setInterval(()=>{const e=el('hi8');if(e)e.classList.toggle('notified');},2800);
}

/* ════════════════════════════════
   STREAMING PAGE
════════════════════════════════ */
let streamStream=null, streamRecorder=null, streamChunks=[], streamTimerID=null, streamSec=0, streamBlob=null;

/* ════════════════════════════════
   ANALYSIS PAGE (영상등록 분석)
════════════════════════════════ */
// ── Vertex AI 서버 프록시 헬퍼 ──────────────────────────
// 영상 GCS 직접 업로드 (무제한 크기, Vertex에 gs:// URI로 전달 가능)
// 반환: { public_url, gcs_uri }
async function uploadAnalysisVideo(file){
  // 1) 서버에서 V4 Signed URL 발급
  const sigResp=await fetch('/api/gcs-upload-url',{
    method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+(localStorage.getItem('ib_token')||'')},
    body:JSON.stringify({filename:file.name||'video.mp4', content_type:file.type||'video/mp4', folder:'videos/analysis'})
  });
  const sigRaw=await sigResp.text();
  let sig=null;
  try{sig=JSON.parse(sigRaw);}catch(e){throw new Error(`업로드 URL 발급 실패(HTTP ${sigResp.status}): ${sigRaw.slice(0,200)}`);}
  if(!sigResp.ok||!sig.ok) throw new Error(sig.error||'업로드 URL 발급 실패');
  // 2) 클라이언트가 PUT으로 GCS에 직접 업로드
  const putResp=await fetch(sig.upload_url,{
    method:'PUT', headers:{'Content-Type':file.type||'video/mp4'}, body:file
  });
  if(!putResp.ok){
    const err=await putResp.text().catch(()=>'');
    throw new Error(`GCS 업로드 실패(HTTP ${putResp.status}): ${err.slice(0,200)}`);
  }
  return {public_url:sig.public_url, gcs_uri:sig.gcs_uri, mime:file.type||'video/mp4'};
}
// ── 대용량 파일 업로드 (크기 제한 없음) ───────────────────
// Supabase Storage 는 버킷 용량 한도가 있어 대형 교안(수백 MB)에서 실패한다.
// 영상과 동일하게 GCS Signed URL 로 직접 올려 한도를 없앤다.
async function uploadFileToGCS(file, folder){
  const sigResp=await fetch('/api/gcs-upload-url',{
    method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+(localStorage.getItem('ib_token')||'')},
    body:JSON.stringify({filename:file.name||'file.bin', content_type:file.type||'application/octet-stream', folder:folder||'edu-materials'})
  });
  const sigRaw=await sigResp.text();
  let sig=null;
  try{sig=JSON.parse(sigRaw);}catch(e){throw new Error(`업로드 URL 발급 실패(HTTP ${sigResp.status}): ${sigRaw.slice(0,200)}`);}
  if(!sigResp.ok||!sig.ok) throw new Error(sig.error||'업로드 URL 발급 실패');
  const putResp=await fetch(sig.upload_url,{
    method:'PUT', headers:{'Content-Type':file.type||'application/octet-stream'}, body:file
  });
  if(!putResp.ok){
    const err=await putResp.text().catch(()=>'');
    throw new Error(`업로드 실패(HTTP ${putResp.status}): ${err.slice(0,200)}`);
  }
  return {public_url:sig.public_url, gcs_uri:sig.gcs_uri, mime:file.type||'application/octet-stream'};
}
// ── 교안 텍스트를 브라우저에서 추출 ────────────────────
// 서버가 수백 MB 파일을 내려받아 풀면 메모리·시간 한도에 걸린다.
// PPT/Word/Excel 은 전부 zip 구조라 브라우저에서 바로 텍스트만 뽑아 보낼 수 있다 (보통 수 KB).
async function extractEduTextInBrowser(file){
  const name=(file.name||'').toLowerCase();
  const readBuf=()=>new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=e=>res(e.target.result);
    r.onerror=()=>rej(new Error('파일 읽기 실패'));
    r.readAsArrayBuffer(file);
  });
  try{
    // Excel — 이미 로드된 XLSX 사용
    if(/\.(xlsx|xls)$/.test(name) && typeof XLSX!=='undefined'){
      const wb=XLSX.read(await readBuf(),{type:'array'});
      return wb.SheetNames.map(n=>`# 시트: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n');
    }
    // 텍스트 계열은 그대로
    if(/\.(txt|csv|md)$/.test(name)) return await file.text();
    // PowerPoint / Word — zip 해제 후 XML 에서 텍스트만
    if(/\.(pptx|docx)$/.test(name)){
      if(typeof JSZip==='undefined'){ console.warn('[edu] JSZip 미로드 — 서버 추출로 폴백'); return ''; }
      const zip=await JSZip.loadAsync(await readBuf());
      const unesc=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
      const pull=async(path)=>{
        const xml=await zip.file(path).async('string');
        const out=[];
        const re=/<a:t[^>]*>([\s\S]*?)<\/a:t>|<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
        let m;
        while((m=re.exec(xml))!==null){
          const t=unesc((m[1]??m[2]??'')).trim();
          if(t) out.push(t);
        }
        return out;
      };
      if(/\.pptx$/.test(name)){
        const slides=Object.keys(zip.files)
          .filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f))
          .sort((a,b)=>parseInt(a.match(/slide(\d+)/)[1])-parseInt(b.match(/slide(\d+)/)[1]));
        const parts=[];
        for(let i=0;i<slides.length;i++){
          const texts=await pull(slides[i]);
          if(texts.length) parts.push(`# 슬라이드 ${i+1}\n${texts.join('\n')}`);
        }
        return parts.join('\n\n');
      }
      const texts=await pull('word/document.xml');
      return texts.join('\n');
    }
  }catch(e){
    console.warn('[edu] 브라우저 텍스트 추출 실패 — 서버 추출로 폴백:',e);
  }
  return ''; // PDF/이미지 등은 Gemini 가 직접 읽으므로 추출 불필요
}
// 체크리스트 세부 항목 로드
async function loadChecklistItemsForEval(checklistId){
  if(!checklistId) return [];
  const{data,error}=await sb.from('checklist_items').select('*').eq('checklist_id',checklistId).order('sort_order');
  if(error) throw new Error('체크리스트 항목 로드 실패: '+error.message);
  return data||[];
}
// Vertex 결과 후처리 — sub_scores 기반으로 categories/overall_score 재계산
// (AI가 가끔 합계를 다르게 반환해도 화면 숫자 불일치 방지)
// 5단계 앵커 채점 환산표 (표준형) — 3점(보통) = 배점의 60%
const LEVEL_RATIO={5:1,4:0.8,3:0.6,2:0.4,1:0.2};
const LEVEL_NAME={5:'매우 우수',4:'우수',3:'보통',2:'미흡',1:'매우 미흡'};
const LEVEL_TAG_COLOR={5:'#10b981',4:'#22c55e',3:'#f59e0b',2:'#f97316',1:'#ef4444'};
// ── 점수 비율 → 5단계 · 색상 (모든 화면이 이 기준 하나만 쓴다) ──────
// 환산표가 5:100% / 4:80% / 3:60% / 2:40% / 1:20% 이므로 경계는 각 중간값
//   0.9 이상 → 5점 · 0.7 이상 → 4점 · 0.5 이상 → 3점 · 0.3 이상 → 2점 · 그 미만 → 1점
function levelScoreFromRatio(ratio){
  return ratio>=0.9?5:ratio>=0.7?4:ratio>=0.5?3:ratio>=0.3?2:1;
}
// 4~5점 초록 · 3점 주황 · 1~2점 빨강 (수기 수정 점수도 동일 기준으로 색이 바뀐다)
function scoreColorFromRatio(ratio){
  return ratio>=0.7?'#10b981':ratio>=0.5?'#f59e0b':'#ef4444';
}
function levelFromLevelScore(ls){
  return ls>=4?'good':ls===3?'normal':'bad';
}
// 점수 칸 아래에 5단계 원점수 태그 (예: 4점 · 우수)
function renderLevelScoreTag(s){
  if(s?.manual) return `<div style="margin-top:2px;font-size:9px;font-weight:800;color:var(--blue);white-space:nowrap">수기 조정</div>`;
  const ls=Number(s?.level_score||0);
  if(!(ls>=1&&ls<=5)) return '';
  const capped=s.score_capped?' <span title="근거가 약해 분포 상한 규칙으로 조정된 항목">▾</span>':'';
  return `<div style="margin-top:2px;font-size:9px;font-weight:800;color:${LEVEL_TAG_COLOR[ls]};white-space:nowrap">${ls}점 · ${LEVEL_NAME[ls]}${capped}</div>`;
}
function normalizeVertexResult(raw){
  if(!raw||!Array.isArray(raw.sub_scores)||!raw.sub_scores.length) return raw;
  // level_score(1~5) 기준으로 점수를 확정한다.
  // ⚠ 예전처럼 '잘함=만점' 으로 올리지 않는다. 4점(우수)은 배점의 80%가 정상이다.
  raw.sub_scores=raw.sub_scores.map(s=>{
    const max=Number(s.max||5);
    // ── na 판정 ── '평가 자체가 성립 불가'한 경우만. 강사가 안 한 것은 na 가 아니라 1점
    const ts=String(s.timestamp||'').trim();
    const ana=String(s.analysis||'');
    const noTs=!ts||ts==='-'||ts==='—'||/^\s*$/.test(ts);
    const naKeywords=/(평가하기 어렵|평가가 어렵|판단하기 어렵|판단이 어렵|판단 불가|평가 불가|확인 불가|녹화된 강의이므로|평가 대상이 아님|해당 항목을 평가할 수 없)/;
    // ── 관리자가 수기로 고친 항목 ── 점수를 절대 재계산하지 않는다.
    //    (재계산하면 손으로 넣은 값이 AI 원점수로 되돌아가 '수정이 안 되는' 것처럼 보인다)
    if(s.manual){
      const mScore=Number(s.score||0);
      const mLevel=s.level==='na'?'na':levelFromLevelScore(levelScoreFromRatio(max>0?mScore/max:0));
      return {...s, level:mLevel, score:mScore, max};
    }
    const isNa = s.level==='na' || (noTs && naKeywords.test(ana) && s.level!=='good' && s.level!=='normal');
    // ⚠ max 도 반환 — 원본 s.max=0 인 경우 보정된 5 가 유지되도록 (이전 버그: max 안 넘김 → 0 그대로 저장)
    if(isNa) return {...s, level:'na', level_score:0, level_name:'해당없음', score:0, max};
    const ls=Math.round(Number(s.level_score));
    // ── 구버전 저장 데이터(level_score 없음) ── 점수를 건드리지 않고 그대로 표시.
    //    (예전 평가 기록을 다시 열었을 때 점수가 달라지면 안 되므로 재계산 금지)
    if(!(ls>=1&&ls<=5)){
      const legacyLevel=['good','normal','bad'].includes(s.level)?s.level:'normal';
      return {...s, level:legacyLevel, score:Number(s.score||0), max};
    }
    const score=Math.round(max*(LEVEL_RATIO[ls]||0));
    const level=ls>=4?'good':ls===3?'normal':'bad';
    return {...s, level, level_score:ls, level_name:LEVEL_NAME[ls]||'', score, max};
  });
  // habits: occurrences 정규화 — 문자열 배열/객체 배열 혼재 대응 → timestamps[](MM:SS) + contexts[](문구)
  if(Array.isArray(raw.habits)){
    raw.habits=raw.habits.map(h=>{
      const occ=Array.isArray(h.occurrences)?h.occurrences:null;
      const timestamps=[], contexts=[];
      if(occ){
        occ.forEach(o=>{
          if(typeof o==='string'){timestamps.push(o);contexts.push('');}
          else if(o&&typeof o==='object'){timestamps.push(o.time||o.timestamp||''); contexts.push(o.context||'');}
        });
      } else if(Array.isArray(h.timestamps)){
        h.timestamps.forEach(t=>{timestamps.push(typeof t==='string'?t:(t?.time||'')); contexts.push(typeof t==='object'?(t?.context||''):'');});
      }
      return {...h, timestamps, contexts, count: timestamps.length||Number(h.count||0), solution:h.solution||h.replacement||''};
    });
  }
  // na 제외 후 집계
  const effective=raw.sub_scores.filter(s=>s.level!=='na');
  // 카테고리별 집계
  const catMap=new Map();
  effective.forEach(s=>{
    const k=s.category||'기타';
    if(!catMap.has(k)) catMap.set(k,{name:k,score:0,max:0});
    const c=catMap.get(k);
    c.score+=Number(s.score||0);
    c.max+=Number(s.max||0);
  });
  // 순서 유지 위해 원본 카테고리 순서대로
  const order=[];
  raw.sub_scores.forEach(s=>{const k=s.category||'기타';if(!order.includes(k)) order.push(k);});
  const categories=order.filter(k=>catMap.has(k)).map(k=>{
    const c=catMap.get(k);
    return {name:k, score:c.score, max:c.max, achievement:c.max>0?Math.round(c.score/c.max*100):0};
  });
  const totalScore=categories.reduce((a,c)=>a+c.score,0);
  const totalMax=categories.reduce((a,c)=>a+c.max,0);
  const overall=totalMax>0?Math.round(totalScore/totalMax*100):0;
  return {...raw, categories, overall_score:overall};
}
// /api/vertex-analyze 호출
// ⚠ 타임아웃(504/FUNCTION_INVOCATION_TIMEOUT)에 같은 설정으로 재시도하면
//   서버 한도(300초)를 매번 꽉 채우고 죽어 20분을 통째로 버린다.
//   → 재시도할 때마다 '더 빠른 설정'으로 낮춰간다 (모델 → 프레임 수).
//   Flash 는 Pro 보다 2~3배 빠르고 비용도 훨씬 낮아 타임아웃 탈출에 가장 효과적.
async function callVertexAnalyze(payload){
  const baseFps = typeof payload.fps==='number' ? payload.fps : 0.2;
  const chain = [
    { cfg:{...payload},                                                          label:'정밀 분석' },
    { cfg:{...payload, model:'gemini-2.5-flash'},                                label:'빠른 모델로 재시도' },
    { cfg:{...payload, model:'gemini-2.5-flash', fps:Math.max(0.05, baseFps/2)}, label:'프레임 절반으로 재시도' },
  ];
  const delays=[0,3000,8000];
  let lastErr=null;
  const normalizeErr=e=>{
    if(e==null) return '';
    if(typeof e==='string') return e;
    if(e.message) return String(e.message);
    if(e.error) return String(e.error);
    if(e.details) return String(e.details);
    try{ return JSON.stringify(e).slice(0,300); }catch(_){ return String(e); }
  };
  const isTransient=(status, msg)=>{
    if([429,500,502,503,504].includes(status)) return true;
    return /429|RESOURCE_EXHAUSTED|503|504|Too Many Requests|overloaded|FUNCTION_INVOCATION_TIMEOUT|timeout|deployment|gateway/i.test(msg||'');
  };
  // 413 / Content Too Large 는 영구 오류로 처리 — 재시도해도 똑같이 거부됨
  // (callVertexAnalyze 호출자는 다른 경로로 복구해야 함 — GCS 직접 업로드 등)
  for(let i=0;i<chain.length;i++){
    if(delays[i]>0) await new Promise(r=>setTimeout(r,delays[i]));
    if(i>0 && typeof setAiLoadingStep==='function') setAiLoadingStep(`AI 분석 ${chain[i].label}...`);
    let resp;
    try{
      resp=await fetch('/api/vertex-analyze',{
        method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(localStorage.getItem('ib_token')||'')},
        body:JSON.stringify(chain[i].cfg)
      });
    }catch(netErr){
      // 네트워크 자체 실패 (오프라인·DNS) — 일시 장애로 간주
      lastErr=new Error('네트워크 오류: '+(netErr?.message||netErr));
      if(i<chain.length-1) continue;
      break;
    }
    const raw=await resp.text();
    let data=null;
    try{data=JSON.parse(raw);}catch(e){
      // JSON 파싱 실패 (Vercel 504 HTML 페이지 등) — status 코드로 재시도 판단
      lastErr=new Error(`서버 응답 비정상(HTTP ${resp.status}): ${raw.slice(0,200)}`);
      if(isTransient(resp.status, raw) && i<chain.length-1) continue;
      break;
    }
    if(resp.ok&&data.ok) return data.result;
    const errMsg=normalizeErr(data.error)||('HTTP '+resp.status);
    lastErr=new Error(errMsg);
    // 일시 장애만 재시도, 그 외 (인증·검증 실패 등) 즉시 break
    if(!isTransient(resp.status, errMsg)) break;
  }
  throw lastErr||new Error('분석 호출 실패');
}

// ────────────────────────────────────────────────────────────────────────────
// 손상된 평가 자동 복구 — 다양한 폴백 시도해 둘 다 실패 막음
// ① 영상 URL 다중 소스 ② 모델 Flash→Pro ③ fps 다중 시도
// ④ sub_scores 비면 categories 로 자동 추정 ⑤ 부분 성공도 저장
// ────────────────────────────────────────────────────────────────────────────
async function reanalyzeCurrentVideo(){
  if(!requireAnalysisPermission('AI 재분석')) return;
  const videoId=window._anVideoId;
  if(!videoId){ alert('영상 정보를 찾을 수 없습니다.'); return; }
  if(!confirm('같은 영상으로 AI 재분석을 실행할까요?\n\n약 30~90초 소요됩니다.\n이전 평가는 새 결과로 덮어쓰여집니다.')) return;

  // ── 영상 정보 다중 소스 복구 ──
  const vid=(D.videos||[]).find(v=>String(v.id)===String(videoId));
  if(!vid){ alert('영상 행을 찾지 못했습니다.'); return; }
  let videoUrl = window._anUploadedVideoUrl || vid.filePath || vid.file_path || vid.video_url || '';
  let videoGcsUri = window._anUploadedGcsUri || vid.gcs_uri || vid.video_gcs_uri || '';
  // YouTube 링크면 그대로 전달
  if(!videoUrl && vid.youtube) videoUrl = vid.youtube;
  if(!videoUrl && !videoGcsUri){
    alert('❌ 영상 파일 URL 정보를 어디서도 찾지 못했습니다.\n\n해결:\n1. 영상 페이지로 돌아가 [원본 영상]을 다시 업로드\n2. 또는 영상을 새로 등록 후 분석\n\n원인: 옛 영상의 임시 URL 이 만료됐을 수 있습니다.');
    return;
  }
  // mime 추정
  const guessMime=(url)=>{
    if(!url) return 'video/mp4';
    if(/youtu/i.test(url)) return 'video/mp4';
    if(/\.mp4($|\?)/i.test(url)) return 'video/mp4';
    if(/\.webm($|\?)/i.test(url)) return 'video/webm';
    if(/\.mov($|\?)/i.test(url)) return 'video/quicktime';
    if(/\.mkv($|\?)/i.test(url)) return 'video/x-matroska';
    return 'video/mp4';
  };
  const videoMime = vid.mime || vid.video_mime || guessMime(videoUrl);

  // 체크리스트 정보
  const eduFileUrl = window._anEduFileUrl || vid.eduFileUrl || vid.edu_file_url || '';
  let critItems=[], aiItems=[];
  const existingEvals=(D.evaluations||[]).filter(e=>String(e.video_id)===String(videoId));
  const critEv=existingEvals.find(e=>e.eval_type==='평가안기준');
  const aiEv=existingEvals.find(e=>e.eval_type==='AI독자');
  const critClId=critEv?.checklist_id;
  const aiClId=aiEv?.checklist_id;
  try{ if(critClId) critItems=await loadChecklistItemsForEval(critClId); }catch(e){ console.warn('crit checklist 로드 실패:', e); }
  try{ if(aiClId)   aiItems  =await loadChecklistItemsForEval(aiClId); }catch(e){ console.warn('ai checklist 로드 실패:', e); }
  // 기본 평가 항목 (체크리스트 못 찾을 때 폴백)
  const defaultItems=[
    {category:'발성',sub_item:'발성 안정성',criterion:'고른 발성과 호흡 안정성',max_score:100,sort_order:0},
    {category:'발성',sub_item:'음성 품질',criterion:'발성 크기·맑기·울림',max_score:100,sort_order:1},
    {category:'전달력',sub_item:'발음 명확도',criterion:'자음·모음 정확한 전달',max_score:100,sort_order:2},
    {category:'전달력',sub_item:'속도 적절성',criterion:'경청 가능한 속도',max_score:100,sort_order:3},
    {category:'표현력',sub_item:'강조·변화',criterion:'중요 부분 강조와 변화',max_score:100,sort_order:4},
    {category:'표현력',sub_item:'신뢰·몰입',criterion:'신뢰감과 몰입 유도',max_score:100,sort_order:5},
  ];

  showAiLoading(true, 120);
  setAiLoadingStep('재분석 — 영상 정보 준비 중...');
  setAiLoadingStage('upload','done');
  setAiLoadingStage('checklist','done');
  setAiLoadingStage('ai','active');

  // sub_scores 비면 categories 로 자동 추정해 채워주는 helper
  const ensureSubScores = (r) => {
    if(!r) return r;
    if(Array.isArray(r.sub_scores) && r.sub_scores.length) return r;
    // categories 만 있으면 sub_scores 자동 생성
    if(Array.isArray(r.categories) && r.categories.length){
      r.sub_scores = r.categories.map((c,i)=>({
        n: i+1, category: c.name||'기타', sub_item: c.name||'항목', criterion:'',
        level: (c.score/c.max)>=0.85?'good':(c.score/c.max)>=0.5?'normal':'bad',
        score: Number(c.score||0), max: Number(c.max||0),
        timestamp:'', analysis:'AI 분석 결과를 카테고리로 복원함', solution:''
      }));
      console.log('[재분석] sub_scores 비어 categories 로 자동 생성:', r.sub_scores.length+'개');
    }
    return r;
  };

  // 평가 1건 시도 — Flash 우선, fps 다중, Pro 폴백
  async function tryAnalyze(label, items, evalType, evalEduUrl){
    const attempts=[
      {model:'gemini-2.5-flash', fps:0.5},
      {model:'gemini-2.5-flash', fps:0.2},
      {model:'gemini-2.5-pro',   fps:0.5},
      {model:'gemini-2.5-pro',   fps:0.2},
    ];
    let last=null;
    for(const a of attempts){
      setAiLoadingStep(`AI 분석 재호출 중 (${label})...`);
      try{
        const raw=await callVertexAnalyze({
          video_url:videoUrl, video_gcs_uri:videoGcsUri, video_mime:videoMime, fps:a.fps,
          checklist_items: items.length?items:defaultItems,
          eval_type:evalType,
          edu_file_url: evalEduUrl||undefined,
          model:a.model
        });
        const normalized=normalizeVertexResult(raw);
        const fixed=ensureSubScores(normalized);
        if(fixed && Array.isArray(fixed.sub_scores) && fixed.sub_scores.length) return fixed;
        last=fixed;
      }catch(e){
        last=e;
        console.warn(`[재분석] ${label} 시도 실패 (${a.model} fps ${a.fps}):`, e?.message||e);
      }
    }
    if(last && typeof last==='object' && Array.isArray(last.sub_scores)) return last;
    throw last instanceof Error ? last : new Error(`${label} 모든 시도 실패`);
  }

  try{
    let critResult=null, aiResult=null;
    let critErr=null, aiErr=null;

    // 1) 교육맞춤평가 — 교육자료가 있어야 가능, 없으면 skip
    if(eduFileUrl && (critItems.length||critClId)){
      try{ critResult=await tryAnalyze('교육맞춤평가', critItems, '평가안기준', eduFileUrl); }
      catch(e){ critErr=e; console.error('[재분석] 교육맞춤평가 최종 실패:', e); }
    } else {
      console.log('[재분석] 교육자료 또는 체크리스트 없음 — 교육맞춤평가 skip');
    }
    // 2) AI독자 — 항상 시도
    try{ aiResult=await tryAnalyze('AI독자', aiItems, 'AI독자', null); }
    catch(e){ aiErr=e; console.error('[재분석] AI독자 최종 실패:', e); }

    setAiLoadingStage('ai','done');
    setAiLoadingStage('save','active');

    if(!critResult && !aiResult){
      const reason = (aiErr?.message || critErr?.message || '알 수 없음').slice(0,200);
      showAiLoading(false);
      // 영상 URL 만료 가능성이 가장 흔함 → 원본 다시 업로드 옵션 제공
      const useFreshUpload = confirm('❌ 두 평가 모두 실패\n\n원인: ' + reason + '\n\n가장 흔한 원인: 영상 GCS 임시 URL 만료\n\n[확인] 클릭 시 → 원본 영상 파일 다시 업로드하여 재분석\n[취소] 클릭 시 → 종료');
      if(useFreshUpload){
        reanalyzeWithFreshUpload(videoId).catch(err=>alert('원본 업로드 재분석 실패: '+(err?.message||err)));
      }
      return;
    }

    // 부분 성공이라도 저장
    const saveTasks=[];
    if(critResult) saveTasks.push(saveEvaluation({videoId, checklistId:critClId||null, eduFileUrl, evalType:'평가안기준', result:critResult}));
    if(aiResult)   saveTasks.push(saveEvaluation({videoId, checklistId:aiClId||null,   eduFileUrl:null, evalType:'AI독자',     result:aiResult}));
    const saveResults=await Promise.all(saveTasks);
    const failedSaves=saveResults.filter(r=>!r).length;

    // 메모리·화면 갱신
    window._lastVertexResult={crit:critResult, ai:aiResult};
    await loadFromDB();
    const mapped=mapVertexToLegacy(critResult, aiResult);
    const count=parseInt(v('an-count'))||0;
    renderAnalysisResult(mapped, true, count);
    setAiLoadingStage('save','done');
    setTimeout(()=>showAiLoading(false),400);

    // 결과 안내
    if(critResult && aiResult){
      if(typeof showToast==='function') showToast('✓ 교육맞춤 + AI독자 모두 복구 완료','#10b981');
    } else if(critResult){
      alert('✓ 교육맞춤평가는 복구 성공.\nAI독자는 실패했습니다.\n\n원인: '+(aiErr?.message?.slice(0,150)||'알 수 없음'));
    } else if(aiResult){
      const reason = eduFileUrl ? ('실패 원인: '+(critErr?.message?.slice(0,150)||'알 수 없음')) : '(교육자료 없어 교육맞춤평가 skip)';
      alert('✓ AI독자 평가는 복구 성공.\n교육맞춤평가는 진행 안 됨.\n\n'+reason);
    }
    if(failedSaves) alert('⚠ '+failedSaves+'개 평가는 저장 실패. F12 콘솔의 [saveEvaluation] 경고 확인.');
  }catch(e){
    showAiLoading(false);
    alert('❌ 재분석 실패\n\n'+(e?.message||e));
    console.error('reanalyzeCurrentVideo:',e);
  }
}

// 평가안기준 추가 평가 — AI 독자만 있는 영상에 평가안기준 평가를 추가로 진행
async function addCriteriaEvaluation(){
  if(!requireAnalysisPermission('교육맞춤평가 추가 분석')) return;
  if(!CU?.isAdmin && !CU?.isSubAdmin){ alert('관리자/부관리자만 가능합니다.'); return; }
  const videoId=window._anVideoId;
  if(!videoId){ alert('영상 정보를 찾을 수 없습니다.'); return; }
  const vid=(D.videos||[]).find(v=>String(v.id)===String(videoId));
  if(!vid){ alert('영상 행을 찾지 못했습니다.'); return; }

  // 평가안 후보 — category='체크리스트' 인 것 중 AI독자(standard)·스피치(speech) 제외
  const eduType=vid.eduType||vid.edu_type||'';
  let candidates=(D.checklists||[]).filter(c=>{
    if(c.deleted) return false;
    if((c.category||'')!=='체크리스트') return false;  // '체크리스트' 카테고리만
    const t=(c.type||'').toLowerCase();
    return !t.includes('standard') && !t.includes('speech');
  });
  if(!candidates.length){
    alert('등록된 평가안 체크리스트가 없습니다.\n\n교육 콘텐츠 → 체크리스트 등록 시 카테고리를 "체크리스트" 로 + 타입을 교육맞춤평가용 (edutype:XXX) 로 등록 후 다시 시도해주세요.');
    return;
  }
  // 교육종류 매칭 우선 정렬 (type 의 'edutype:판매경쟁력상황실' 등을 영상 eduType 과 비교)
  candidates.sort((a,b)=>{
    const aType=(a.type||'').replace(/^edutype:/,'');
    const bType=(b.type||'').replace(/^edutype:/,'');
    const am = aType===eduType || (a.name||'').includes(eduType) ? 0 : 1;
    const bm = bType===eduType || (b.name||'').includes(eduType) ? 0 : 1;
    return am-bm;
  });
  const defaultEduUrl = vid.eduFileUrl || vid.edu_file_url || '';

  // 등록된 교육자료 후보 — category 가 '체크리스트' 가 아닌 모든 파일 (교안·시나리오 등)
  const eduFileCandidates=(D.checklists||[]).filter(c=>!c.deleted && (c.category||'')!=='체크리스트' && c.file_url);
  // 교육종류 매칭 우선 정렬
  eduFileCandidates.sort((a,b)=>{
    const am=(a.category||'')===eduType?0:1;
    const bm=(b.category||'')===eduType?0:1;
    return am-bm;
  });

  // 모달로 평가안·교육자료 입력 받기 (영상 등록 UI 와 동일 스타일)
  const result = await new Promise((resolve)=>{
    document.getElementById('crit-add-overlay')?.remove();
    const ov=document.createElement('div');
    ov.id='crit-add-overlay';
    ov.className='overlay show';
    ov.style.zIndex='10100';
    ov.onclick=e=>{ if(e.target===ov){ ov.remove(); resolve(null); } };
    const optsHtml = candidates.map(c=>{
      const cat = c.category?`[${c.category}] `:'';
      const safeName=(c.name||'(이름 없음)').replace(/</g,'&lt;');
      return `<option value="${c.id}">${cat}${safeName}</option>`;
    }).join('');
    const eduOptsHtml = eduFileCandidates.length
      ? '<option value="">— 선택 안 함 (교육자료 없이 평가) —</option>'
        + eduFileCandidates.map(f=>{
            const cat=f.category?`[${f.category}] `:'';
            const safeName=(f.name||'(이름 없음)').replace(/</g,'&lt;');
            const selected = (defaultEduUrl && f.file_url===defaultEduUrl) ? ' selected' : '';
            return `<option value="${f.file_url.replace(/"/g,'&quot;')}"${selected}>${cat}${safeName}</option>`;
          }).join('')
      : '<option value="">등록된 교육자료가 없습니다</option>';
    ov.innerHTML=`<div style="background:#fff;border-radius:16px;width:min(600px,92vw);padding:24px 26px;animation:scaleIn .25s cubic-bezier(.22,1,.36,1);max-height:88vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:18px">
        <div>
          <div style="font-size:17px;font-weight:900;color:var(--t1)">평가안기준 평가 추가</div>
          <div style="font-size:11px;color:var(--t3);margin-top:4px">평가안과 교육자료 기반으로 AI 가 추가 평가를 진행합니다 · 30~60초 소요</div>
        </div>
        <button style="border:none;background:rgba(0,0,0,.06);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:15px" onclick="document.getElementById('crit-add-overlay').remove()">✕</button>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:11.5px;font-weight:700;color:var(--t2);margin-bottom:6px">평가안(체크리스트) <span style="color:#dc2626">*</span></div>
        <select id="crit-add-cl" style="width:100%;padding:10px 12px;border:1px solid var(--bdr);border-radius:10px;font-size:13px;font-weight:600;color:var(--t1);background:#fff;cursor:pointer">
          ${optsHtml}
        </select>
        <div style="font-size:10.5px;color:var(--t3);margin-top:4px">영상의 교육종류${eduType?' "'+eduType+'"':''}와 매칭되는 체크리스트가 위에 정렬됨</div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:11.5px;font-weight:700;color:var(--t2);margin-bottom:6px">교육자료 <span style="color:var(--t3);font-weight:500">(등록된 자료에서 선택)</span></div>
        <select id="crit-add-edu-pick" style="width:100%;padding:10px 12px;border:1px solid var(--bdr);border-radius:10px;font-size:13px;font-weight:600;color:var(--t1);background:#fff;cursor:pointer" onchange="document.getElementById('crit-add-edu-url').value=this.value">
          ${eduOptsHtml}
        </select>
      </div>
      <div style="margin-bottom:18px">
        <div style="font-size:11.5px;font-weight:700;color:var(--t2);margin-bottom:6px">또는 교육자료 URL 직접 입력 <span style="color:var(--t3);font-weight:500">(선택)</span></div>
        <input id="crit-add-edu-url" type="text" value="${defaultEduUrl.replace(/"/g,'&quot;')}" placeholder="https:// 또는 비워두면 교육자료 없이 평가" style="width:100%;padding:10px 12px;border:1px solid var(--bdr);border-radius:10px;font-size:12px;font-family:'Noto Sans KR',monospace;box-sizing:border-box">
        <div style="font-size:10.5px;color:var(--t3);margin-top:4px">${defaultEduUrl?'영상 등록 시 사용한 교육자료가 자동 입력됨 — 위 드롭다운에서 다른 자료로 변경 가능':'위 드롭다운에서 교육자료를 선택하면 자동 채워짐'}</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" style="padding:10px 22px;font-size:12px;font-weight:700" onclick="document.getElementById('crit-add-overlay').remove()">취소</button>
        <button class="btn btn-blue" style="padding:10px 22px;font-size:12px;font-weight:800" id="crit-add-go">평가 시작 →</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    document.getElementById('crit-add-go').onclick=()=>{
      const cid = parseInt(document.getElementById('crit-add-cl').value)||0;
      const eduUrl = (document.getElementById('crit-add-edu-url').value||'').trim();
      ov.remove();
      resolve({checklistId: cid, eduFileUrl: eduUrl});
    };
  });
  if(!result) return;  // 취소
  const checklistId = result.checklistId;
  const eduFileUrl = result.eduFileUrl;
  const checklist = candidates.find(c=>c.id===checklistId);
  if(!checklist){ alert('체크리스트를 찾을 수 없습니다.'); return; }
  if(!eduFileUrl){
    if(!confirm('교육자료 URL 이 비어있습니다.\n교육자료 없이도 평가안기준 분석을 진행할까요?')) return;
  }

  // 체크리스트 항목 로드
  let critItems=[];
  try{ critItems=await loadChecklistItemsForEval(checklistId); }catch(e){ console.warn('체크리스트 항목 로드 실패:', e); }
  if(!critItems.length){
    alert('선택한 체크리스트에 평가 항목이 없습니다.\n다른 체크리스트를 선택하거나 항목을 먼저 등록해주세요.');
    return;
  }

  // 영상 URL 복구 — blob:/data: / 비정상 큰 URL 은 거부 (Vercel 413 회피)
  let videoUrl = window._anUploadedVideoUrl || vid.filePath || vid.file_path || vid.video_url || vid.youtube || '';
  let videoGcsUri = window._anUploadedGcsUri || vid.gcs_uri || vid.video_gcs_uri || '';
  // blob:// 또는 data:* 는 클라이언트 로컬 메모리 데이터 → 서버 전송 불가
  if(videoUrl && (videoUrl.startsWith('blob:')||videoUrl.startsWith('data:'))){
    console.warn('[addCrit] videoUrl 이 blob/data — 무효 처리 (서버 전송 불가)');
    videoUrl='';
  }
  // URL 길이가 비정상적이면 (10KB 이상 = base64 가능성) 무효
  if(videoUrl && videoUrl.length>10000){
    console.warn('[addCrit] videoUrl 길이 비정상('+videoUrl.length+'자) — 무효 처리');
    videoUrl='';
  }
  // GCS URI 없거나 videoUrl 도 무효 → 자동으로 원본 재업로드 모드 진입
  // (confirm 안 띄우고 안내 토스트만 + 파일 선택 다이얼로그 자동 오픈)
  if(!videoGcsUri || !videoUrl){
    if(typeof showToast==='function'){
      showToast('📁 영상 파일을 다시 선택해주세요 (GCS 저장 필요)','#0078C8');
    }
    try{
      await reanalyzeWithFreshUpload(videoId, {critOnly:true, checklistId, eduFileUrl});
    }catch(_){}
    return;
  }
  const videoMime = vid.mime || 'video/mp4';

  showAiLoading(true, 120);
  setAiLoadingStep('교육맞춤평가 분석 준비 중...');
  setAiLoadingStage('upload','done');
  setAiLoadingStage('checklist','done');
  // 평가안기준 = 교육맞춤평가(crit) 단계 활성화
  setAiLoadingStage('crit','active');

  try{
    const attempts=[
      {model:'gemini-2.5-flash', fps:0.5},
      {model:'gemini-2.5-flash', fps:0.2},
      {model:'gemini-2.5-pro',   fps:0.5},
    ];
    let result=null, lastErr=null;
    for(const a of attempts){
      setAiLoadingStep('교육맞춤평가 분석 중 (영상 + 교육자료 + 체크리스트)...');
      try{
        const raw=await callVertexAnalyze({
          video_url:videoUrl, video_gcs_uri:videoGcsUri, video_mime:videoMime, fps:a.fps,
          checklist_items:critItems, eval_type:'평가안기준',
          edu_file_url:eduFileUrl||undefined, model:a.model
        });
        const normalized=normalizeVertexResult(raw);
        if(normalized && Array.isArray(normalized.sub_scores) && normalized.sub_scores.length){
          result=normalized; break;
        }
        lastErr=new Error('AI 응답에 sub_scores 없음');
      }catch(e){ lastErr=e; console.warn('평가안기준 시도 실패:', e); }
    }
    if(!result) throw lastErr || new Error('모든 시도 실패');

    setAiLoadingStage('crit','done');
    setAiLoadingStage('save','active');

    const ok=await saveEvaluation({videoId, checklistId, eduFileUrl, evalType:'평가안기준', result});
    if(!ok) throw new Error('DB 저장 실패');

    // 메모리·화면 갱신
    window._lastVertexResult=window._lastVertexResult||{};
    window._lastVertexResult.crit=result;
    await loadFromDB();
    const mapped=mapVertexToLegacy(result, window._lastVertexResult.ai);
    const count=parseInt(v('an-count'))||0;
    renderAnalysisResult(mapped, true, count);
    setAiLoadingStage('save','done');
    setTimeout(()=>showAiLoading(false),400);
    if(typeof showToast==='function') showToast('✓ 평가안기준 평가 추가 완료','#10b981');
  }catch(e){
    showAiLoading(false);
    const msg=(e?.message||String(e)||'');
    console.error('addCriteriaEvaluation:',e);
    // 영상 URL/크기/413 / GCS 이슈 → 자동 재업로드 (confirm 없이 매끄럽게)
    const isSizeOrUrlIssue = /413|Content Too Large|size|18MB|MB 초과|gs:\/\/|gcs|expired|404|not found|access denied|FUNCTION_INVOCATION_TIMEOUT/i.test(msg);
    if(isSizeOrUrlIssue){
      if(typeof showToast==='function'){
        showToast('📁 영상 파일을 다시 선택해주세요 (큰 영상 GCS 저장)','#0078C8');
      }
      try{ await reanalyzeWithFreshUpload(videoId, {critOnly:true, checklistId, eduFileUrl}); }
      catch(_){}
    } else {
      alert('❌ 평가안기준 평가 추가 실패\n\n원인: '+msg+'\n\n해결:\n· 영상이 너무 짧지 않은지 (1분 이상)\n· 잠시 후 다시 시도 (Vertex 일시 부하)');
    }
  }
}

// 원본 영상 파일 다시 업로드 후 재분석 — URL 만료/크기 초과 시 안전 복구 경로
// options:
//   critOnly=true → 평가안기준만 평가 (AI독자 skip)
//   checklistId, eduFileUrl → 강제 사용 (모달에서 선택한 값)
async function reanalyzeWithFreshUpload(videoId, options={}){
  if(!requireAnalysisPermission('AI 재분석')) return;
  // 동적 file input 생성 (카드/모달 외부에 두어 click 이벤트 격리)
  const inp=document.createElement('input');
  inp.type='file';
  inp.accept='video/*,audio/*';
  inp.style.display='none';
  document.body.appendChild(inp);
  const file = await new Promise((resolve)=>{
    inp.onchange=()=>{ resolve(inp.files?.[0]||null); };
    inp.click();
    // 사용자가 취소하면 5분 후 자동 해제
    setTimeout(()=>resolve(null), 5*60*1000);
  });
  setTimeout(()=>inp.remove(), 1000);
  if(!file){ console.log('파일 선택 취소'); return; }

  showAiLoading(true, 180);
  setAiLoadingStep('원본 영상 업로드 중...');
  setAiLoadingStage('upload','active');

  try{
    // GCS 업로드 (기존 헬퍼)
    const up=await uploadAnalysisVideo(file);
    setAiLoadingStage('upload','done');
    const videoUrl=up.public_url;
    const videoGcsUri=up.gcs_uri;
    const videoMime=up.mime || file.type || 'video/mp4';
    window._anUploadedVideoUrl=videoUrl;
    window._anUploadedGcsUri=videoGcsUri;

    // 영상 행에 새 URL + GCS URI 영구 저장 (옛 만료 URL 교체, 18MB 한계 회피)
    try{
      const upd={file_path:videoUrl};
      if(videoGcsUri) upd.video_gcs_uri=videoGcsUri;
      await sb.from('videos').update(upd).eq('id',videoId);
    }catch(e){
      // video_gcs_uri 컬럼 없으면 file_path 만 갱신
      try{ await sb.from('videos').update({file_path:videoUrl}).eq('id',videoId); }catch(_){}
    }

    // 체크리스트·교육자료 정보 복구 (options 우선)
    const vid=(D.videos||[]).find(v=>String(v.id)===String(videoId));
    const eduFileUrl = (options.eduFileUrl!=null) ? options.eduFileUrl
                       : (window._anEduFileUrl||vid?.eduFileUrl||vid?.edu_file_url||'');
    const existingEvals=(D.evaluations||[]).filter(e=>String(e.video_id)===String(videoId));
    const critClId = options.checklistId || existingEvals.find(e=>e.eval_type==='평가안기준')?.checklist_id;
    const aiClId  = existingEvals.find(e=>e.eval_type==='AI독자')?.checklist_id;
    let critItems=[], aiItems=[];
    try{ if(critClId) critItems=await loadChecklistItemsForEval(critClId); }catch(_){}
    try{ if(aiClId)   aiItems  =await loadChecklistItemsForEval(aiClId); }catch(_){}
    const defaultItems=[
      {category:'발성',sub_item:'발성 안정성',criterion:'고른 발성과 호흡 안정성',max_score:100,sort_order:0},
      {category:'발성',sub_item:'음성 품질',criterion:'발성 크기·맑기·울림',max_score:100,sort_order:1},
      {category:'전달력',sub_item:'발음 명확도',criterion:'자음·모음 정확한 전달',max_score:100,sort_order:2},
      {category:'전달력',sub_item:'속도 적절성',criterion:'경청 가능한 속도',max_score:100,sort_order:3},
      {category:'표현력',sub_item:'강조·변화',criterion:'중요 부분 강조와 변화',max_score:100,sort_order:4},
      {category:'표현력',sub_item:'신뢰·몰입',criterion:'신뢰감과 몰입 유도',max_score:100,sort_order:5},
    ];

    setAiLoadingStage('checklist','done');
    // 평가안기준만 진행이면 crit 단계, 둘 다면 ai
    setAiLoadingStage(options.critOnly?'crit':'ai', 'active');

    const ensureSubScores=(r)=>{
      if(!r) return r;
      if(Array.isArray(r.sub_scores)&&r.sub_scores.length) return r;
      if(Array.isArray(r.categories)&&r.categories.length){
        r.sub_scores=r.categories.map((c,i)=>({
          n:i+1, category:c.name||'기타', sub_item:c.name||'항목', criterion:'',
          level:(c.score/c.max)>=0.85?'good':(c.score/c.max)>=0.5?'normal':'bad',
          score:Number(c.score||0), max:Number(c.max||0),
          timestamp:'', analysis:'카테고리에서 복원됨', solution:''
        }));
      }
      return r;
    };

    async function tryAnalyze(label, items, evalType, evalEduUrl){
      const attempts=[
        {model:'gemini-2.5-flash', fps:0.5},
        {model:'gemini-2.5-flash', fps:0.2},
        {model:'gemini-2.5-pro',   fps:0.5},
      ];
      let last=null;
      for(const a of attempts){
        setAiLoadingStep(`${label} 분석 중...`);
        try{
          const raw=await callVertexAnalyze({
            video_url:videoUrl, video_gcs_uri:videoGcsUri, video_mime:videoMime, fps:a.fps,
            checklist_items: items.length?items:defaultItems,
            eval_type:evalType,
            edu_file_url: evalEduUrl||undefined,
            model:a.model
          });
          const fixed=ensureSubScores(normalizeVertexResult(raw));
          if(fixed && Array.isArray(fixed.sub_scores) && fixed.sub_scores.length) return fixed;
          last=fixed;
        }catch(e){ last=e; console.warn(`[freshUpload] ${label} 시도 실패:`, e?.message||e); }
      }
      if(last && typeof last==='object' && Array.isArray(last.sub_scores)) return last;
      throw last instanceof Error?last:new Error(`${label} 모든 시도 실패`);
    }

    let critResult=null, aiResult=null;
    // 평가안기준 — critOnly 면 항상 시도, 아니면 eduFileUrl 있을 때만
    if(options.critOnly || eduFileUrl){
      try{ critResult=await tryAnalyze('교육맞춤평가', critItems, '평가안기준', eduFileUrl); }
      catch(e){ console.error('[freshUpload] crit 실패:', e); }
    }
    // AI독자 — critOnly 가 아닐 때만
    if(!options.critOnly){
      try{ aiResult=await tryAnalyze('AI독자', aiItems, 'AI독자', null); }
      catch(e){ console.error('[freshUpload] ai 실패:', e); }
    } else {
      // critOnly 면 기존 AI독자 결과 유지
      aiResult = window._lastVertexResult?.ai || null;
    }

    setAiLoadingStage(options.critOnly?'crit':'ai','done');
    setAiLoadingStage('save','active');

    if(!critResult && !aiResult){
      throw new Error('원본 영상 업로드 후에도 분석 실패. Vertex 일시 부하 의심 — 잠시 후 다시 시도.');
    }
    if(options.critOnly && !critResult){
      throw new Error('평가안기준 평가 실패. 영상이 너무 짧거나 음질이 부족할 수 있습니다.');
    }

    const saveTasks=[];
    if(critResult) saveTasks.push(saveEvaluation({videoId, checklistId:critClId||null, eduFileUrl, evalType:'평가안기준', result:critResult}));
    // critOnly 면 AI독자 재저장 skip (이미 DB 에 있음)
    if(!options.critOnly && aiResult) saveTasks.push(saveEvaluation({videoId, checklistId:aiClId||null, eduFileUrl:null, evalType:'AI독자', result:aiResult}));
    await Promise.all(saveTasks);

    window._lastVertexResult={crit:critResult||window._lastVertexResult?.crit, ai:aiResult};
    await loadFromDB();
    const mapped=mapVertexToLegacy(window._lastVertexResult.crit, window._lastVertexResult.ai);
    const count=parseInt(v('an-count'))||0;
    renderAnalysisResult(mapped, true, count);
    setAiLoadingStage('save','done');
    setTimeout(()=>showAiLoading(false),400);
    if(typeof showToast==='function'){
      showToast(options.critOnly?'✓ 평가안기준 평가 추가 완료':'✓ 원본 업로드 + 재분석 완료','#10b981');
    }
  }catch(e){
    showAiLoading(false);
    alert('❌ 원본 업로드 재분석 실패\n\n'+(e?.message||e));
    console.error('reanalyzeWithFreshUpload:',e);
    throw e;
  }
}

// evaluations 테이블 저장
async function saveEvaluation({videoId,voiceEvalId,checklistId,eduFileUrl,evalType,result}){
  if(!result) return false;
  // ⚠ 저장 누락 방지 — sub_scores 가 비어있으면 저장하지 않고 명확히 실패 처리
  //    (옛 손상 데이터처럼 sub_scores=[]·categories=[] 인 평가가 DB 에 또 들어가지 않게)
  if(!Array.isArray(result.sub_scores) || !result.sub_scores.length){
    console.warn('[saveEvaluation] sub_scores 비어있음 — 저장 거부:', evalType);
    alert(`⚠️ ${evalType} 평가 저장 거부\n\n이유: AI 응답에 세부항목(sub_scores)이 비어있습니다.\n다음 분석에서 같은 결과가 나오면 영상이 너무 짧거나 음질이 불충분한 경우입니다.\n\n[잠시 후 다시 분석] 또는 [영상 다시 등록] 시도해주세요.`);
    return false;
  }
  if(!Array.isArray(result.categories) || !result.categories.length){
    // categories 비면 sub_scores 로 자동 재계산 (normalizeVertexResult 이미 해야 하지만 안전망)
    try{ normalizeVertexResult(result); }catch(_){}
  }
  // AI 응답에서 간혹 정수 컬럼에 이상치(예: 수십억)가 들어와 PostgreSQL integer 한계(2,147,483,647) 초과로 저장 실패하는 현상 방지
  const clampInt=(v,min,max)=>{
    if(v==null||v==='') return null;
    const n=Math.round(Number(v));
    if(!Number.isFinite(n)) return null;
    return Math.max(min,Math.min(max,n));
  };
  // habits 배열 내부 count 도 안전 범위로
  const safeHabits=(result.habits||[]).map(h=>({...h,count:Math.max(0,Math.min(100000,Math.round(Number(h.count)||0)))}));
  const safeGaps=(result.engagement_gaps_minutes||[]).map(g=>Math.max(0,Math.min(1440,Math.round(Number(g)||0))));
  // 평가가 속할 조직: 영상이 있으면 영상의 org, 없으면 현재 활성 조직 또는 평가자 본인 조직
  const vidOrg = videoId ? (D.videos||[]).find(x=>String(x.id)===String(videoId))?.org_name : null;
  const evalOrg = vidOrg || curOrg();
  const payload={
    video_id:videoId||null, voice_eval_id:voiceEvalId||null, checklist_id:checklistId||null,
    edu_file_url:eduFileUrl||null, eval_type:evalType,
    overall_score:clampInt(result.overall_score,0,1000)||0,
    categories:result.categories||[], sub_scores:result.sub_scores||[],
    good:result.good||[], bad:result.bad||[], upgrade:result.upgrade||[],
    scenarios:result.scenarios||[], level_tips:result.level_tips||[],
    teaching_patterns:result.teaching_patterns||[],
    speech_report:{
      rubric_alignment_score:result.rubric_alignment_score,
      rubric_alignment_reason:result.rubric_alignment_reason,
      // 5단계 앵커 채점 메타 — 점수 분포 / 상한 강등 이력 / AI 자체 설계 평가안
      score_distribution:result.score_distribution||null,
      scoring_meta:result.scoring_meta||null,
      generated_checklist:Array.isArray(result.generated_checklist)?result.generated_checklist:null,
      summary_opinion:result.summary_opinion||'',
      pitch_overall:result.pitch_overall||'',
      pitch_recommendation:result.pitch_recommendation||'',
      pitch_reason:result.pitch_reason||'',
      pitch_segments:Array.isArray(result.pitch_segments)?result.pitch_segments:[]
    },
    mood:result.mood||null,
    decibel:clampInt(result.decibel,0,200),
    tempo:clampInt(result.tempo_wpm,0,1000),
    habits:safeHabits, engagement_gaps:safeGaps,
    org_name: evalOrg
  };
  // 저장 실패 시 최대 3회 재시도 (2초 간격)
  let lastErrMsg='';
  let triedDropOrg=false;
  for(let i=0;i<3;i++){
    const{error}=await sb.from('evaluations').insert(payload);
    if(!error){
      // 평가 완료 알림 — 영상 소유자(강사 본인) 에게
      try{
        if(videoId){
          const vid=(D.videos||[]).find(x=>String(x.id)===String(videoId));
          if(vid?.userId){
            dbCreateNotification({
              userId:vid.userId,
              type:'eval_complete',
              title:`✓ ${evalType} 평가 완료`,
              body:`"${vid.title||'영상'}" 평가 결과가 도착했습니다. 점수: ${payload.overall_score}점`,
              link:'page-lecturer',
              orgName:vid.org_name||evalOrg
            });
          }
        } else if(voiceEvalId && CU?.id){
          dbCreateNotification({
            userId:CU.id,
            type:'eval_complete',
            title:`✓ 스피치 평가 완료`,
            body:`스피치 분석이 완료되었습니다. 점수: ${payload.overall_score}점`,
            link:'page-lecturer',
            orgName:evalOrg
          });
        }
      }catch(e){ console.warn('eval notif failed:',e); }
      return true;
    }
    lastErrMsg=error.message||String(error);
    console.warn(`evaluations 저장 실패(${evalType}, 시도 ${i+1}/3):`,lastErrMsg,error);
    // org_name 컬럼이 없을 경우 한 번만 제거하고 재시도
    if(!triedDropOrg && /org_name/i.test(lastErrMsg) && /column|schema/i.test(lastErrMsg)){
      delete payload.org_name;
      triedDropOrg=true;
      continue;
    }
    // 스키마/FK/RLS 오류는 재시도해도 안되므로 즉시 중단
    if(/column|schema|foreign key|violates|permission|policy|rls/i.test(lastErrMsg)) break;
    if(i<2) await new Promise(r=>setTimeout(r,2000));
  }
  // 실제 원인 포함해 안내
  const hint=/permission|policy|rls/i.test(lastErrMsg)
    ? '\n\n※ Supabase RLS 정책 확인 필요 — evaluations 테이블에 insert 권한이 없습니다.'
    : /column|schema/i.test(lastErrMsg)
    ? '\n\n※ evaluations 테이블 스키마 확인 필요 — 누락 컬럼이 있을 수 있습니다.'
    : /foreign key|violates/i.test(lastErrMsg)
    ? '\n\n※ FK 제약 위반 — video_id/voice_eval_id/checklist_id 중 참조 대상이 없습니다.'
    : '';
  alert(`⚠️ ${evalType} 평가 저장 실패\n\n원인: ${lastErrMsg||'알 수 없음'}${hint}`);
  return false;
}
// 새 응답 포맷 → 기존 렌더러 포맷 매핑 (호환 레이어)
function mapVertexToLegacy(critRes,aiRes){
  const pick=r=>r||{};
  const c=pick(critRes), a=pick(aiRes);
  const main=c.sub_scores?.length?c:a; // 평가안 있으면 그걸 메인, 아니면 AI독자
  const criteriaScores=(main.categories||[]).map(x=>({name:x.name,score:x.score||0,max:x.max||0}));
  const timestamps=(main.sub_scores||[]).map(s=>({
    category:s.category, item:s.sub_item, criteria:s.criterion||'',
    score:s.score||0, maxScore:s.max||0,
    level:s.level||'',
    t:s.timestamp||'', type: s.level==='good'?'good':s.level==='bad'?'bad':s.level==='na'?'na':'tip',
    text:s.analysis||'', solution:s.solution||'', tags:[]
  }));
  return {
    criteriaScores, timestamps,
    criteriaSummary:c?.summary_opinion||(c?.good?.[0]?.title)||'',
    overallScore:c.overall_score||a.overall_score||0,
    focusScore:a.overall_score||c.overall_score||0,
    overallComment:a?.summary_opinion||c?.summary_opinion||(c?.upgrade?.[0]?.detail)||'',
    focusComment:(a.upgrade?.[0]?.detail)||'',
    habits:(a.habits||c.habits||[]).map(h=>({word:h.word,count:h.count||0,timestamps:h.timestamps||[],contexts:h.contexts||[],solution:h.solution||''})),
    decibel:a.decibel||c.decibel||0, decibelStatus:'적정',
    tempo:a.tempo_wpm||c.tempo_wpm||0, tempoStatus:'적정',
    engagementGaps:a.engagement_gaps_minutes||c.engagement_gaps_minutes||[],
    engagementWarning:'',
    pitchOverall:a.pitch_overall||c.pitch_overall||'',
    pitchRecommendation:a.pitch_recommendation||c.pitch_recommendation||'',
    pitchReason:a.pitch_reason||c.pitch_reason||'',
    pitchSegments:(a.pitch_segments||c.pitch_segments||[]),
    scenarios:(c.scenarios||[]).map(s=>`${s.situation}: "${s.original_line}" → "${s.suggested_line}"`),
    levelUpTips:(c.level_tips||[]).map(t=>({title:t.title,text:t.detail})),
    speechTips:(c.teaching_patterns||[]).map(t=>({title:t.type,text:t.original+' → '+t.alternative})),
    good:main.good||[], bad:main.bad||[], upgrade:main.upgrade||[],
    solution:(main.bad||[]).map((b,i)=>`${i+1}. ${b.title}: ${b.solution}`).join('<br>'),
    scenario:(c.scenarios||[]).map(s=>`${s.situation}: ${s.suggested_line}`).join('<br>'),
    // 시나리오/교안 뱃지 판정에 필요한 필드 (mapVertexToLegacy 기본 누락 방지)
    eduFileUrl:c.edu_file_url||a.edu_file_url||'',
    rubric_alignment_score:c.rubric_alignment_score||a.rubric_alignment_score||0,
    _critRaw:c, _aiRaw:a
  };
}

/* ════════════════════════════════
   EXCEL SAMPLE DOWNLOAD
════════════════════════════════ */
function downloadChecklistSample(){
  const rows=[
    ['#','평가 항목','배점','평가 기준 설명','점수 (직접 입력)'],
    [1,'발성 및 전달력',20,'목소리 크기, 속도, 발음의 명확성. 교육생 인원수 대비 적절한 볼륨 유지',''],
    [2,'내용 전문성',25,'제품/서비스 지식의 정확성, 최신성, 깊이. 실제 사례 활용 여부',''],
    [3,'판서 및 자료 활용',15,'칠판/화이트보드/PPT 활용의 적절성. 핵심 키워드 정리 여부',''],
    [4,'수강생 상호작용',20,'질문 유도, 반응 확인, 참여 독려. 쌍방향 소통 여부',''],
    [5,'시간 관리',10,'강의 목표 시간 준수. 도입-전개-정리 비율의 균형',''],
    [6,'마무리 및 요약',10,'핵심 내용 재정리. 다음 강의 연결의 자연스러움',''],
    [],
    ['구분','체크 항목','체크 (O/X)','비고'],
    ['오프닝','인사 및 자기소개가 자연스러운가?','',''],
    ['오프닝','오늘 학습 목표를 명확히 제시했는가?','',''],
    ['오프닝','수강생 주의를 끄는 기법을 사용했는가?','',''],
    ['본론','핵심 내용을 논리적 순서로 전달했는가?','',''],
    ['본론','실물 시연 또는 시각 자료를 활용했는가?','',''],
    ['본론','10분 이내 간격으로 참여 유도가 있었는가?','',''],
    ['본론','어려운 용어를 쉬운 말로 풀어 설명했는가?','',''],
    ['마무리','핵심 내용 3가지를 요약 정리했는가?','',''],
    ['마무리','Q&A 시간을 충분히 확보했는가?','',''],
    ['마무리','다음 강의 예고 및 과제를 안내했는가?','',''],
    [],
    ['등급','점수 범위','의미'],
    ['S','90점 이상','최우수 — 멘토 강사로 활용 가능'],
    ['A','80~89점','우수 — 소규모 보완 후 독립 진행 가능'],
    ['B','70~79점','양호 — 지속 코칭 권장'],
    ['C','60~69점','보통 — 집중 개발 프로그램 필요'],
    ['D','59점 이하','미흡 — 재교육 후 재평가 필요'],
  ];
  downloadExcel(rows,'interbiz_평가안_체크리스트_샘플.xlsx');
}

function downloadVoiceChecklistSample(){
  const rows=[
    ['#','음성 평가 항목','배점','평가 기준 설명','점수 (직접 입력)'],
    [1,'발성 크기 (데시벨)',20,'교육생 인원수 대비 적절한 볼륨 유지. 앞줄/뒷줄 모두 들리는지',''],
    [2,'발음 명확도',20,'전문 용어 발음이 명확한지. 지역 사투리나 뭉개짐 여부',''],
    [3,'말하기 속도 (템포)',15,'너무 빠르지 않고 너무 느리지 않은 적절한 속도. 강조 구간 감속',''],
    [4,'톤 적절성',15,'강의 분위기에 맞는 음색. 단조롭지 않은 톤 변화',''],
    [5,'강약 조절',15,'중요 내용에서 볼륨 UP. 전환 시 의도적 변화',''],
    [6,'침묵 활용',15,'핵심 포인트 전후 적절한 멈춤. 반복어 대신 침묵 사용',''],
    [],
    ['구분','체크 항목','체크 (O/X)','비고'],
    ['발성','강의 시작부터 끝까지 볼륨이 일정한가?','',''],
    ['발성','후반부에도 에너지가 유지되는가?','',''],
    ['발음','전문 용어를 천천히 명확하게 발음하는가?','',''],
    ['발음','숫자/스펙을 정확하게 전달하는가?','',''],
    ['속도','핵심 포인트에서 의도적으로 느리게 말하는가?','',''],
    ['속도','1분당 130~160단어 수준인가?','',''],
    ['톤','질문할 때 톤이 올라가는가?','',''],
    ['톤','강조할 때 톤이 변하는가?','',''],
    ['습관','불필요한 반복어(음~, 그래서)가 적은가?','',''],
    ['습관','적절한 곳에서 멈추는가?','',''],
    [],
    ['강의 분위기','목표 톤','설명'],
    ['진지하고 엄중한','낮고 안정적인 톤','신뢰감, 무게감 전달'],
    ['밝고 경쾌한','밝고 높은 톤','에너지, 친근감 전달'],
    ['재미있는','변화 많은 톤','유머, 흥미 유발'],
    ['차분하고 신뢰감 있는','중간 톤, 일정 속도','안정감, 전문성 전달'],
    ['열정적이고 에너지 넘치는','높고 강한 톤','동기부여, 열정 전달'],
  ];
  downloadExcel(rows,'interbiz_음성평가_체크리스트_샘플.xlsx');
}

function downloadExcel(rows,filename){
  // CSV → Excel 변환 (한글 지원을 위해 BOM 추가)
  let csv='\uFEFF';
  rows.forEach(row=>{
    if(!row||!row.length){csv+='\n';return;}
    csv+=row.map(cell=>{
      const s=String(cell??'');
      return s.includes(',')||s.includes('"')||s.includes('\n')?'"'+s.replace(/"/g,'""')+'"':s;
    }).join(',')+'\n';
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename.replace('.xlsx','.csv');
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openAnalysis(){
  el('an-step1').style.display='';
  el('an-step2').style.display='none';
  const pdfBtn=el('an-pdf-btn');if(pdfBtn)pdfBtn.style.display='none';
  el('an-youtube').value='';el('an-title').value='';el('an-count').value='';
  // 교육자료 카테고리 select 채우기
  const anProd=el('an-product');
  if(anProd){const cats=getEduCategories();anProd.innerHTML='<option value="">선택</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join('');}
  // 교육종류 select 채우기
  const anEduType=el('an-edu-type');
  if(anEduType){const types=getEduTypes();anEduType.innerHTML='<option value="">선택</option>'+types.map(t=>`<option value="${t}">${t}</option>`).join('');}
  el('an-file-name').textContent='클릭하여 파일 선택 (mp4, mov, webm)';
  el('an-checklist-name').textContent='선택된 파일 없음';
  initAnProdSelect();
  // 체크리스트 드롭다운 즉시 채움 (2개: 교육맞춤평가 + AI 독자)
  if(typeof populateChecklistSelects==='function') populateChecklistSelects();
  // 드롭다운 값 초기화 (같은 옵션 재클릭 시 onchange 미발화 문제 방지)
  ['an-cl-select','an-cl-ai-select'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  // 적용 배지 초기화
  ['an-cl-applied','an-cl-ai-applied','an-edu-applied'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  ['an-cl-applied-name','an-cl-ai-applied-name','an-edu-applied-name'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='';});
  // 숨겨진 URL/Name input 초기화
  ['an-cl-url','an-cl-url-name','an-cl-ai-url','an-cl-ai-url-name','an-checklist-url'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const eduWrap=document.getElementById('an-edu-files');if(eduWrap)eduWrap.style.display='none';
  showPage('page-analysis');
}

function switchAnalysisTab(paneId,btn){
  btn.parentElement.querySelectorAll('.dual-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  ['an-tab-criteria','an-tab-ai'].forEach(id=>{
    el(id).classList.toggle('active',id===paneId);
    el(id).style.display=id===paneId?'block':'none';
  });
}

// 교육자료 선택 시 등록된 파일 로드
function loadEduFilesForCategory(){
  try{
    const cat=document.getElementById('an-product')?.value||'';
    const wrap=document.getElementById('an-edu-files');
    const list=document.getElementById('an-edu-file-list');
    if(!wrap||!list) return;
    const eduFiles=cat?(D.checklists||[]).filter(c=>(c.category||'')===cat):[];
    const curEduType=document.getElementById('an-edu-type')?.value||'';
    const allCl=(D.checklists||[]).filter(c=>(c.category||'')==='체크리스트');
    const critCl=curEduType?allCl.filter(c=>c.type===curEduType):allCl.filter(c=>c.type&&c.type!=='standard'&&c.type!=='speech');
    if(!eduFiles.length&&!critCl.length){wrap.style.display='none';return;}
    wrap.style.display='block';
    const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const mkCard=(f,kind,tagColor)=>{
      const tagHtml=kind?`<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:${tagColor};color:#fff;font-weight:700;margin-right:4px">${esc(kind==='ai'?'AI 독자':kind==='crit'?'교육맞춤평가':'')}</span>`:'';
      return `<div class="edu-card-item" data-kind="${esc(kind||'')}" data-id="${esc(f.id)}" data-name="${esc(f.name)}" data-url="${esc(f.file_url)}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer;background:#fff;border-radius:6px;margin-bottom:4px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600">${tagHtml}${esc(f.name)}</div>
          <div style="font-size:10px;color:var(--t3)">${esc(f.file_name||'')} · ${esc((f.created_at||'').slice(0,10))}</div>
        </div>
        <span style="font-size:10px;color:var(--blue);font-weight:600">적용</span>
      </div>`;
    };
    let html='';
    if(eduFiles.length){
      html+=`<div style="font-size:11px;font-weight:700;color:var(--t2);margin:4px 0 6px">📘 교육자료 (${eduFiles.length})</div>`;
      html+=eduFiles.map(f=>mkCard(f,'edu',null)).join('');
    }
    if(critCl.length){
      html+=`<div style="font-size:11px;font-weight:700;color:var(--green);margin:10px 0 6px">✓ 교육맞춤평가 체크리스트 (${critCl.length})</div>`;
      html+=critCl.map(f=>mkCard(f,'crit','#10b981')).join('');
    }
    // AI 독자 평가는 등록 체크리스트를 쓰지 않고 AI가 평가안을 직접 설계하므로 목록에서 제외
    list.innerHTML=html;
    // 이벤트 위임 (한 번만 바인딩)
    if(!list.dataset.bound){
      list.dataset.bound='1';
      list.addEventListener('click',e=>{
        const card=e.target.closest('.edu-card-item');
        if(!card) return;
        const kind=card.dataset.kind;
        const id=card.dataset.id;
        const name=card.dataset.name;
        const url=card.dataset.url;
        if(kind==='edu'){
          applyEduFile(url,name);
          showToast(`교육자료 적용: ${name}`,'#0078C8');
        } else if(kind==='crit'){
          applyChecklistByFile('an',id,name,url);
        } else if(kind==='ai'){
          applyChecklistByFile('an',id,name,url,'ai');
        }
      });
    }
  }catch(e){ console.error('loadEduFilesForCategory error:',e); }
}
// 파일 리스트에서 체크리스트 클릭 → 해당 dropdown/hidden에 적용 + 배지 표시
function applyChecklistByFile(prefix,id,name,url,kind){
  const selId=kind==='ai'?prefix+'-cl-ai-select':prefix+'-cl-select';
  const sel=document.getElementById(selId);
  if(sel){
    // dropdown에 해당 option이 이미 있으면 선택, 없으면 추가
    let has=false;
    for(const o of sel.options){ if(o.value===String(id)){ has=true; break; } }
    if(!has){
      const o=document.createElement('option');
      o.value=String(id); o.textContent=name; o.dataset.url=url; o.dataset.name=name;
      sel.appendChild(o);
    }
    sel.value=String(id);
  }
  applyChecklistFromSelect(prefix,kind);
  showToast(`${kind==='ai'?'AI 독자':'교육맞춤평가'}: ${name}`,'#0078C8');
}
// 교육콘텐츠 > 체크리스트 필터 — 교육맞춤평가(교육종류별)/AI 독자(표준)/스피치 각각
function populateChecklistSelects(){
  const base=(D.checklists||[]).filter(c=>(c.category||'')==='체크리스트');
  const build=(arr,placeholder)=>{
    arr=[...arr].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    let html=`<option value="">${placeholder||'선택'}</option>`;
    arr.forEach(c=>{
      const esc=(c.name||'').replace(/"/g,'&quot;');
      const typeLbl=c.type==='standard'?'[표준]':c.type==='speech'?'[스피치]':c.type?`[${c.type}]`:'';
      html+=`<option value="${c.id}" data-url="${c.file_url||''}" data-name="${esc}">${typeLbl?typeLbl+' ':''}${esc}</option>`;
    });
    return html;
  };
  const standardList=base.filter(c=>(c.type||'')==='standard'||!c.type);
  const speechList=base.filter(c=>(c.type||'')==='speech');
  // 교육맞춤평가용 = 교육종류별 체크리스트 (type이 standard/speech가 아닌 것, 주로 edutype)
  const critList=base.filter(c=>c.type&&c.type!=='standard'&&c.type!=='speech');
  // 현재 선택된 교육종류에 맞춰 필터 (선택된 경우)
  const anEduType=document.getElementById('an-edu-type')?.value||'';
  const stEduType=document.getElementById('st-edu-type')?.value||'';
  const critForAn=anEduType?critList.filter(c=>c.type===anEduType):critList;
  const critForSt=stEduType?critList.filter(c=>c.type===stEduType):critList;
  const speechHtml=build(speechList,'선택');
  // 교육맞춤평가 드롭다운
  [['an-cl-select',build(critForAn,'교육맞춤평가')],
   ['st-cl-select',build(critForSt,'교육맞춤평가')]].forEach(([id,html])=>{
    const sel=document.getElementById(id);
    if(sel){const prev=sel.value;sel.innerHTML=html;sel.value=prev||'';}
  });
  // AI 독자 드롭다운
  [['an-cl-ai-select',build(standardList,'AI 독자')],
   ['st-cl-ai-select',build(standardList,'AI 독자')]].forEach(([id,html])=>{
    const sel=document.getElementById(id);
    if(sel){const prev=sel.value;sel.innerHTML=html;sel.value=prev||'';}
  });
  // 스피치 (단일) — 등록된 [스피치] 체크리스트가 있으면 자동 선택
  const vaSel=document.getElementById('va-cl-select');
  if(vaSel){
    const prev=vaSel.value;
    vaSel.innerHTML=speechHtml;
    if(prev && Array.from(vaSel.options).some(o=>o.value===prev)){
      vaSel.value=prev;
    } else if(speechList.length){
      const first=[...speechList].sort((a,b)=>(a.name||'').localeCompare(b.name||''))[0];
      if(first){
        vaSel.value=String(first.id);
        try{ if(typeof applyChecklistFromSelect==='function') applyChecklistFromSelect('va'); }catch(_){ }
        const info=document.getElementById('va-cl-applied-info');
        const nm=document.getElementById('va-cl-applied-info-name');
        if(info&&nm){ nm.textContent='[스피치] '+(first.name||''); info.style.display='block'; }
      }
    }
  }
}
// 반복어 배지 클릭 → 해당 반복어 발화 시점 리스트 + 영상 재생 팝업
function openHabitTimestamps(idx){
  const h=(window._anHabits||[])[idx];
  if(!h){alert('반복어 데이터가 없습니다.');return;}
  const tsList=Array.isArray(h.timestamps)?h.timestamps:[];
  const url=window._anUploadedVideoUrl||'';
  const vidEl=document.getElementById('an-video-el');
  const fallback=vidEl?.querySelector('source')?.src||vidEl?.src||'';
  const src=url||fallback;
  const firstSec=tsList.length?parseTimestampToSeconds(tsList[0]):0;
  document.getElementById('habit-ts-overlay')?.remove();
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='habit-ts-overlay';
  overlay.style.zIndex='10050';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;max-width:960px;width:94vw;max-height:90vh;overflow:hidden;display:grid;grid-template-columns:1.4fr 1fr;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;flex-direction:column;border-right:1px solid var(--bdr);max-height:90vh">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);background:#fafafa;display:flex;align-items:center;gap:10px">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:#fee2e2;color:#b91c1c">반복어</span>
        <span style="font-size:15px;font-weight:900">"${h.word}"</span>
        <span style="font-size:12px;color:var(--t3);font-weight:600">· ${h.count}회 감지</span>
      </div>
      <div style="background:#000;aspect-ratio:16/9">
        ${src?`<video id="hts-video" controls autoplay playsinline style="width:100%;height:100%;background:#000"><source src="${src}#t=${firstSec}"></video>`:'<div style="color:#fff;display:flex;align-items:center;justify-content:center;height:100%;font-size:12px">영상이 없습니다</div>'}
      </div>
      ${h.solution?`<div style="padding:12px 18px;font-size:12px;color:var(--t2);line-height:1.6;border-top:1px solid var(--bdr);background:rgba(239,68,68,.04)"><strong style="color:#ef4444">솔루션:</strong> ${h.solution}</div>`:''}
    </div>
    <div style="max-height:90vh;overflow-y:auto">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);position:sticky;top:0;background:#fff;z-index:2;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:14px;font-weight:900">발화 시점 (${tsList.length})</div>
        <button style="border:none;background:none;cursor:pointer;font-size:20px;color:var(--t3)" onclick="this.closest('.overlay').remove()">✕</button>
      </div>
      <div style="padding:10px 14px">
        ${tsList.length?tsList.map((t,i)=>{const ctx=(h.contexts||[])[i]||''; const sec=parseTimestampToSeconds(t); return `<div style="padding:10px 12px;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onmouseover="this.style.background='rgba(0,120,200,.04)'" onmouseout="this.style.background=''" onclick="(function(s){const v=document.getElementById('hts-video');if(v){try{v.currentTime=s;v.play();}catch(e){}}})(${sec})">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${ctx?'4px':'0'}">
            <div style="display:flex;align-items:center;gap:10px"><span style="font-size:11px;color:var(--t3);font-weight:700">#${i+1}</span><span style="font-size:13px;font-weight:800;color:var(--blue)">${t}</span></div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2"><polygon points="5 3 19 12 5 21"/></svg>
          </div>
          ${ctx?`<div style="font-size:11px;color:var(--t2);line-height:1.5;padding:4px 8px;background:#f8f9fa;border-radius:4px">"${ctx}"</div>`:''}
        </div>`;}).join(''):'<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">시점 정보가 없습니다</div>'}
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

// 타임스탬프 항목 수정 저장 — 항목값 반영 + 카테고리·전체점수 자동 재계산 + DB 업데이트 + 화면 반영
async function saveSubItemEdit(i){
  const ov=document.getElementById('sub-item-video-overlay');
  if(!ov) return;
  const subItem=document.getElementById('sivm-edit-subitem')?.value?.trim()||'';
  const analysis=document.getElementById('sivm-edit-analysis')?.value||'';
  const solution=document.getElementById('sivm-edit-solution')?.value||'';
  const timestamp=document.getElementById('sivm-edit-timestamp')?.value?.trim()||'';
  const score=parseInt(document.getElementById('sivm-edit-score')?.value)||0;
  const max=parseInt(document.getElementById('sivm-edit-max')?.value)||0;
  const level=document.getElementById('sivm-edit-level')?.value||'normal';
  const ctx=ov._editCtx; if(!ctx){ alert('저장 컨텍스트 없음 — 모달을 다시 열어주세요.'); return; }
  const {which,raw,itemsInCat,evalId}=ctx;
  const target=itemsInCat[i];
  if(!target){ alert('항목을 찾지 못했습니다.'); return; }
  // ① 항목 값 반영 (raw.sub_scores 참조 갱신)
  target.sub_item=subItem;
  target.analysis=analysis;
  target.solution=solution;
  target.timestamp=timestamp;
  target.score=score;
  target.max=max;
  target.level=level;
  // ② 정규화 — sub_scores 기반으로 categories/overall_score 자동 재계산
  try{ normalizeVertexResult(raw); }catch(e){ console.warn('normalize 실패:', e); }
  // ③ window._lastVertexResult 갱신
  if(which==='ai') window._lastVertexResult.ai=raw;
  else             window._lastVertexResult.crit=raw;
  // ④ DB 업데이트 — evaluations 행 (sub_scores·categories·overall_score 동시)
  if(evalId){
    try{
      const payload={
        sub_scores: raw.sub_scores||[],
        categories: raw.categories||[],
        overall_score: raw.overall_score||0
      };
      const {error}=await sb.from('evaluations').update(payload).eq('id', evalId);
      if(error){
        alert('❌ DB 저장 실패\n\n원인: '+error.message+'\n\n메모리 갱신은 되어 있어 화면은 정상이나, 새로고침 시 사라질 수 있습니다.');
        console.error('saveSubItemEdit DB:',error);
      }
    }catch(e){
      alert('❌ DB 저장 실패: '+(e?.message||e));
      console.error('saveSubItemEdit:',e);
    }
  } else {
    console.warn('evalId 없음 — DB 업데이트 skip (메모리만)');
  }
  // ⑤ 분석 결과 화면 전체 재렌더 (총 점수·카테고리 점수도 같이 반영)
  try{
    if(typeof mapVertexToLegacy==='function' && typeof renderAnalysisResult==='function'){
      const mapped=mapVertexToLegacy(window._lastVertexResult.crit, window._lastVertexResult.ai);
      const studentCount=parseInt(v('an-count'))||0;
      renderAnalysisResult(mapped, true, studentCount);
    }
  }catch(e){ console.warn('render 재호출 실패:', e); }
  // ⑥ 모달 카드 보기 모드로 전환
  if(ov._pick) ov._pick(i, false);
  // 토스트
  if(typeof showToast==='function') showToast('✓ 저장 완료 — 총 점수까지 자동 반영','#10b981');
}

// 세부항목 행 클릭 → 영상 + 타임라인 리치 모달
function openSubItemVideoModal(which,categoryName,subIndex){
  const raw=which==='ai'?window._lastVertexResult?.ai:window._lastVertexResult?.crit;
  if(!raw||!raw.sub_scores?.length){alert('평가 데이터가 없습니다.');return;}
  const itemsInCat=raw.sub_scores.filter(s=>(s.category||'').trim()===categoryName.trim());
  if(!itemsInCat.length){alert('세부항목이 없습니다.');return;}
  const active=itemsInCat[subIndex]||itemsInCat[0];
  const url=window._anUploadedVideoUrl||'';
  const vidEl=document.getElementById('an-video-el');
  const fallback=vidEl?.querySelector('source')?.src||vidEl?.src||'';
  const src=url||fallback;
  const firstSec=parseTimestampToSeconds(active.timestamp);
  const levelColor={good:'#10b981',normal:'#f59e0b',bad:'#ef4444',na:'#9ca3af'};
  const levelLabel={good:'잘함',normal:'보통',bad:'미흡',na:'해당없음'};
  // 수정 권한: 관리자/부관리자만
  const canEdit = !!(CU?.isAdmin || CU?.isSubAdmin);
  const evalId = which==='ai' ? window._anAiEvalId : window._anCritEvalId;
  // 기존 모달이 있으면 제거
  document.getElementById('sub-item-video-overlay')?.remove();
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='sub-item-video-overlay';
  overlay.style.zIndex='10050';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;width:min(1280px,96vw);height:min(88vh,820px);overflow:hidden;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);grid-template-rows:1fr;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <!-- 좌측: 영상 + 현재 세부항목 카드 -->
    <div style="display:flex;flex-direction:column;border-right:1px solid var(--bdr);min-width:0;min-height:0">
      <div style="padding:12px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--bdr);background:#fafafa;flex-shrink:0">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:rgba(0,0,0,.06);color:var(--t2)">${categoryName}</span>
        <span id="sivm-active-title" style="font-size:13px;font-weight:800">${active.sub_item||''}</span>
      </div>
      <div style="background:#000;width:100%;aspect-ratio:16/9;flex-shrink:0;position:relative">
        ${src?`<video id="sivm-video" controls autoplay playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000"><source src="${src}#t=${firstSec}"></video>`:'<div style="color:#fff;display:flex;align-items:center;justify-content:center;height:100%;font-size:12px">영상이 없습니다</div>'}
      </div>
      <div id="sivm-active-card" style="flex:1;min-height:0;overflow-y:auto;padding:14px 16px"></div>
    </div>
    <!-- 우측: 타임라인 리스트 -->
    <div style="display:flex;flex-direction:column;min-height:0;min-width:0">
      <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--bdr);background:#fff;flex-shrink:0">
        <div style="font-size:14px;font-weight:900">타임라인</div>
        <button style="border:none;background:none;cursor:pointer;font-size:20px;color:var(--t3)" onclick="this.closest('.overlay').remove()">✕</button>
      </div>
      <div id="sivm-timeline" style="flex:1;min-height:0;overflow-y:auto;padding:8px 12px"></div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  function pickItem(i, editMode){
    const it=itemsInCat[i]; if(!it) return;
    overlay._currentIdx=i;
    overlay._editMode=!!editMode;
    const sec=parseTimestampToSeconds(it.timestamp);
    const v=document.getElementById('sivm-video');
    if(v && !editMode){try{v.currentTime=sec;v.play();}catch(e){}}
    document.getElementById('sivm-active-title').textContent=it.sub_item||'';
    const scoreTxt=`${it.score||0}/${it.max||0}`;
    const card=document.getElementById('sivm-active-card');
    if(!card) return;
    if(editMode){
      // 편집 모드 — 모든 필드 입력 가능
      const lvOpts=['good','normal','bad','na'];
      card.innerHTML=`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:rgba(0,0,0,.06);color:var(--t2)">${it.category||''}</span>
          <input id="sivm-edit-subitem" type="text" value="${(it.sub_item||'').replace(/"/g,'&quot;')}" style="flex:1;min-width:160px;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:700;color:var(--t1)">
          <input id="sivm-edit-score" type="number" min="0" max="100" step="1" value="${it.score||0}" style="width:62px;padding:5px 6px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;font-weight:800;text-align:center">
          <span style="font-size:11px;color:var(--t3);font-weight:700">/</span>
          <input id="sivm-edit-max" type="number" min="0" max="100" step="1" value="${it.max||0}" style="width:62px;padding:5px 6px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;font-weight:800;text-align:center">
          <select id="sivm-edit-level" style="padding:5px 8px;border:1px solid #d1d5db;border-radius:8px;font-size:11px;font-weight:700">
            ${lvOpts.map(l=>`<option value="${l}" ${it.level===l?'selected':''}>${levelLabel[l]}</option>`).join('')}
          </select>
        </div>
        <label style="display:block;font-size:10px;color:var(--t3);font-weight:700;margin-bottom:4px">분석 (파란 박스)</label>
        <textarea id="sivm-edit-analysis" rows="4" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;line-height:1.6;color:var(--t2);background:rgba(59,130,246,.04);font-family:inherit;resize:vertical;margin-bottom:10px">${(it.analysis||'').replace(/</g,'&lt;')}</textarea>
        <label style="display:block;font-size:10px;color:var(--t3);font-weight:700;margin-bottom:4px">솔루션 (분홍 박스)</label>
        <textarea id="sivm-edit-solution" rows="3" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;line-height:1.6;color:var(--t2);background:rgba(239,68,68,.04);font-family:inherit;resize:vertical;margin-bottom:10px">${(it.solution||'').replace(/</g,'&lt;')}</textarea>
        <label style="display:block;font-size:10px;color:var(--t3);font-weight:700;margin-bottom:4px">영상 시점 (MM:SS 또는 MM:SS-MM:SS)</label>
        <input id="sivm-edit-timestamp" type="text" value="${(it.timestamp||'').replace(/"/g,'&quot;')}" placeholder="예: 02:17-02:33" style="width:200px;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:11px;color:var(--t2);margin-bottom:14px">
        <div style="display:flex;gap:8px;padding-top:12px;border-top:1px solid #e5e7eb">
          <button class="btn" style="padding:7px 16px;font-size:12px;font-weight:800;background:#10b981;color:#fff" onclick="saveSubItemEdit(${i})">✓ 저장</button>
          <button class="btn btn-ghost" style="padding:7px 16px;font-size:12px;font-weight:800" onclick="(function(){const ov=document.getElementById('sub-item-video-overlay');ov&&ov._pick&&ov._pick(${i},false);})()">취소</button>
        </div>
      `;
    } else {
      // 보기 모드
      const editBtn = canEdit && evalId
        ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:10px;font-weight:700;margin-left:4px" onclick="(function(){const ov=document.getElementById('sub-item-video-overlay');ov&&ov._pick&&ov._pick(${i},true);})()" title="관리자만 수정 가능">✏ 수정</button>`
        : '';
      card.innerHTML=`
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:rgba(0,0,0,.06);color:var(--t2)">${it.category||''}</span>
          <span style="font-size:14px;font-weight:800;color:var(--t1)">${it.sub_item||''}</span>
          <span style="margin-left:auto;font-size:13px;font-weight:900;color:${levelColor[it.level]||'var(--t3)'}">${scoreTxt}</span>
          <span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${levelColor[it.level]||'#eee'};color:#fff">${levelLabel[it.level]||'-'}</span>
          ${editBtn}
        </div>
        <div style="font-size:12px;color:var(--t2);line-height:1.6;padding:10px 12px;border-left:3px solid #3b82f6;background:rgba(59,130,246,.06);border-radius:4px;margin-bottom:8px">${(it.analysis||'-').replace(/</g,'&lt;')}</div>
        ${it.solution?`<div style="font-size:12px;color:var(--t2);line-height:1.6;padding:10px 12px;border-left:3px solid #ef4444;background:rgba(239,68,68,.06);border-radius:4px">${(it.solution||'').replace(/</g,'&lt;')}</div>`:''}
        ${it.timestamp?`<div style="margin-top:10px;font-size:10px;color:var(--t3)">영상 시점 · <strong>${it.timestamp}</strong></div>`:''}
      `;
    }
    // 타임라인 활성 하이라이트 + 텍스트 업데이트
    document.querySelectorAll('#sivm-timeline [data-idx]').forEach(n=>{n.style.background=n.dataset.idx==String(i)?'rgba(59,130,246,.08)':'';n.style.borderLeftColor=n.dataset.idx==String(i)?'#3b82f6':'transparent';});
  }
  const tl=document.getElementById('sivm-timeline');
  if(tl){
    tl.innerHTML=itemsInCat.map((it,i)=>`<div data-idx="${i}" style="padding:12px 12px 12px 14px;border-left:3px solid transparent;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.04)" onclick="(function(){const ov=document.getElementById('sub-item-video-overlay');if(!ov)return;ov._pick&&ov._pick(${i});})()">
      <div style="font-size:11px;color:var(--blue);font-weight:700;margin-bottom:3px">${it.timestamp||'-'}</div>
      <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:3px">${it.sub_item||'-'}</div>
      <div style="font-size:11px;color:var(--t2);line-height:1.5">${it.analysis||''}</div>
    </div>`).join('');
  }
  overlay._pick=pickItem;
  overlay._editCtx={which, raw, itemsInCat, evalId};
  pickItem(subIndex, false);
}

// 타임스탬프(MM:SS 또는 MM:SS-MM:SS) → 시작 초
function parseTimestampToSeconds(ts){
  if(!ts) return 0;
  const m=String(ts).match(/(\d+):(\d+)/);
  if(!m) return 0;
  return parseInt(m[1])*60+parseInt(m[2]);
}
// 특정 시점부터 영상 재생 팝업
function openVideoAtTime(seconds,label){
  const url=window._anUploadedVideoUrl||'';
  const vidEl=document.getElementById('an-video-el');
  const fallback=vidEl?.querySelector('source')?.src||vidEl?.src||'';
  const src=url||fallback;
  if(!src){alert('재생할 영상이 없습니다.');return;}
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.style.zIndex='10000';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  const sec=Math.max(0,parseInt(seconds)||0);
  overlay.innerHTML=`<div style="background:#000;border-radius:14px;max-width:900px;width:94vw;position:relative;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <button style="position:absolute;top:10px;right:10px;z-index:5;border:none;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;width:32px;height:32px;border-radius:50%;font-size:16px" onclick="this.closest('.overlay').remove()">✕</button>
    ${label?`<div style="position:absolute;top:14px;left:16px;z-index:5;color:#fff;font-size:12px;font-weight:700;background:rgba(0,0,0,.5);padding:4px 10px;border-radius:8px">${label}</div>`:''}
    <video controls autoplay playsinline style="width:100%;aspect-ratio:16/9;border-radius:14px;background:#000" id="ts-jump-video">
      <source src="${src}#t=${sec}">
    </video>
  </div>`;
  document.body.appendChild(overlay);
  setTimeout(()=>{const v=document.getElementById('ts-jump-video');if(v){try{v.currentTime=sec;}catch(e){}}},200);
}

// ── 점수 수기 수정 직후 그래프 제자리 갱신 ────────────────
// 표(an-ts-feed) DOM 은 건드리지 않고 레이더/달성도/총점 배너만 새로 그린다.
// (표를 다시 그리면 연달아 수정 중인 입력이 날아가므로 절대 여기서 표를 만지지 말 것)
function updateAnalysisGraphs(){
  const mkBars=(cats)=>`<div style="flex:1;display:flex;flex-direction:column;justify-content:center">`+
    cats.map(c=>{const p=c.max>0?Math.round(c.score/c.max*100):0;const cc=scoreColorFromRatio(p/100);return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;max-width:560px;margin-left:auto;margin-right:auto;width:100%">
      <span style="font-size:12.5px;font-weight:700;color:var(--t1);width:140px;flex-shrink:0">${c.name}</span>
      <div style="flex:1;height:10px;background:#f0f0f0;border-radius:5px;overflow:hidden;min-width:0"><div style="height:100%;width:${p}%;background:${cc};border-radius:5px;transition:width .8s"></div></div>
      <span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:11.5px;font-weight:800;background:${cc};color:#fff;min-width:50px;text-align:center;flex-shrink:0">${p}%</span>
    </div>`;}).join('')+`</div>`;
  const crit=window._lastVertexResult?.crit;
  const ai=window._lastVertexResult?.ai;
  if(crit?.categories?.length){
    const eduRadar=el('an-edu-radar');
    if(eduRadar&&typeof drawRadarSVG==='function') eduRadar.innerHTML=drawRadarSVG(crit.categories,{clickable:true,which:'crit'});
    const eduBars=el('an-edu-bars');
    if(eduBars) eduBars.innerHTML=mkBars(crit.categories);
    if(typeof repaintScoreSummary==='function') repaintScoreSummary('crit',crit.overall_score);
  }
  if(ai?.categories?.length){
    const aiBars=el('an-ai-bars');
    if(aiBars) aiBars.innerHTML=mkBars(ai.categories);
    if(typeof repaintScoreSummary==='function') repaintScoreSummary('ai',ai.overall_score);
  }
}
// 전체보기 모달이 열려 있으면 최신 점수로 다시 그린다 (스크롤 위치 보존)
function refreshChecklistDetailIfOpen(){
  const ov=document.getElementById('cl-detail-overlay');
  if(!ov) return;
  const which=ov.dataset.which||'crit';
  const scroller=ov.firstElementChild;
  const top=scroller?scroller.scrollTop:0;
  ov.remove();
  try{ openChecklistDetail(which); }catch(e){ console.warn('모달 갱신 경고:',e); return; }
  const nov=document.getElementById('cl-detail-overlay');
  const ns=nov?.firstElementChild;
  if(ns&&top>0) ns.scrollTop=top;
}
// 체크리스트 전체보기 모달 — 대항목별 세부 다각 그래프 + 달성도 + 상세 테이블
function openChecklistDetail(which){
  // My역량 전체보기: evaluations 집계 데이터 사용
  if(which==='lect'){
    const evals=window._lectEvals||[];
    if(!evals.length){alert('평가 데이터가 없습니다.');return;}
    const byVid=new Map();
    evals.forEach(e=>{if(!e.video_id)return;const ex=byVid.get(e.video_id);if(!ex||e.eval_type==='AI독자')byVid.set(e.video_id,e);});
    const latest=[...byVid.values()];
    // sub_scores 전체 집계
    const allSubs=[];
    latest.forEach(e=>(e.sub_scores||[]).forEach(s=>allSubs.push(s)));
    if(!allSubs.length){alert('세부 평가 데이터가 없습니다.');return;}
    const fakeRaw={sub_scores:allSubs,categories:[]};
    const byCat2=new Map();
    allSubs.forEach(s=>{const k=s.category||'기타';if(!byCat2.has(k))byCat2.set(k,[]);byCat2.get(k).push(s);});
    // 카테고리별 평균 계산 후 openChecklistDetail 로직 재사용
    window._lastVertexResult=window._lastVertexResult||{};
    window._lastVertexResult._lect=fakeRaw;
    which='_lect';
  }
  const raw=which==='ai'?window._lastVertexResult?.ai:which==='_lect'?window._lastVertexResult?._lect:window._lastVertexResult?.crit;
  if(!raw||!raw.sub_scores?.length){alert('평가 데이터가 없습니다.');return;}
  const items=raw.sub_scores;
  // 대항목별 그룹 (체크리스트 기준 순서 유지)
  const byCat=new Map();
  items.forEach(s=>{const k=s.category||'기타';if(!byCat.has(k))byCat.set(k,[]);byCat.get(k).push(s);});
  const levelColor={good:'#10b981',normal:'#f59e0b',bad:'#ef4444',na:'#9ca3af'};
  const levelLabel={good:'잘함',normal:'보통',bad:'미흡',na:'해당없음'};

  const catBlocks=Array.from(byCat.entries()).map(([cat,arr])=>{
    const sum=arr.reduce((a,x)=>a+(x.score||0),0);
    const max=arr.reduce((a,x)=>a+(x.max||0),0);
    const pct=max>0?Math.round(sum/max*100):0;
    // 레이더: NA는 빈 축으로 표기하기 어려워 표시 유지 (점수는 원점 근처)
    const radarItems=arr.map(s=>({name:s.sub_item||'', score:s.score||0, max:s.max||1, level:s.level}));
    const radarSvg=drawRadarSVG(radarItems);
    // 바 그래프: NA 항목은 '해당없음' 회색 칩으로 (0% 빨강 아님)
    const bars=`<div style="flex:1;display:flex;flex-direction:column;justify-content:center">`+
      arr.map(s=>{
        const name=s.sub_item||'';
        const isNaItem=s.level==='na'||(!s.max&&!s.score);
        if(isNaItem){
          return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;max-width:540px;margin-left:auto;margin-right:auto;width:100%">
            <span style="font-size:11.5px;font-weight:600;width:140px;flex-shrink:0">${name}</span>
            <div style="flex:1;height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden;min-width:0"></div>
            <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:10.5px;font-weight:700;background:#e5e7eb;color:#6b7280;min-width:72px;text-align:center;flex-shrink:0">해당없음</span>
          </div>`;
        }
        const max=s.max||0;
        const score=s.score||0;
        const p=max>0?Math.round(score/max*100):0;
        // 5단계 앵커 채점과 동일 기준 — 70% 이상 초록(4~5점) · 50% 이상 주황(3점) · 그 미만 빨강
        const cc=scoreColorFromRatio(max>0?score/max:0);
        return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;max-width:540px;margin-left:auto;margin-right:auto;width:100%">
          <span style="font-size:11.5px;font-weight:600;width:140px;flex-shrink:0">${name}</span>
          <div style="flex:1;height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden;min-width:0"><div style="height:100%;width:${p}%;background:${cc};border-radius:4px"></div></div>
          <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:10.5px;font-weight:800;background:${cc};color:#fff;min-width:46px;text-align:center;flex-shrink:0">${p}%</span>
        </div>`;
      }).join('')+`</div>`;
    return `<div style="margin-bottom:22px;border:1px solid var(--bdr);border-radius:14px;overflow:hidden;background:#fff">
      <div style="padding:12px 16px;background:#f8f9fa;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--bdr)">
        <div style="font-size:14px;font-weight:900;color:var(--t1)">${cat}</div>
        <div style="font-size:12px;font-weight:800;color:#10b981">${sum}/${max}점 · ${pct}%</div>
      </div>
      <div style="display:grid;grid-template-columns:440px 1fr;gap:18px;padding:16px">
        <div style="border:1px solid var(--bdr);border-radius:10px;padding:10px;display:flex;align-items:center;justify-content:center;background:#fafafa">
          <svg viewBox="0 0 500 440" style="width:100%;max-width:420px;height:auto">${radarSvg}</svg>
        </div>
        <div style="border:1px solid var(--bdr);border-radius:10px;padding:20px;display:flex;flex-direction:column;background:#fff;min-height:300px">${bars}</div>
      </div>
      <div style="border-top:1px solid var(--bdr);overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:700px">
          <thead style="background:#fafafa">
            <tr>
              <th style="padding:8px;text-align:left;width:120px">세부항목</th>
              <th style="padding:8px;text-align:left">평가기준</th>
              <th style="padding:8px;text-align:center;width:65px">점수</th>
              <th style="padding:8px;text-align:center;width:80px">판정</th>
              <th style="padding:8px;text-align:center;width:95px">시점</th>
              <th style="padding:8px;text-align:left">분석 / 솔루션</th>
            </tr>
          </thead>
          <tbody>
            ${arr.map((s,si)=>{const safeCat=cat.replace(/'/g,"\\'");return `<tr style="border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''" onclick="openSubItemVideoModal('${which}','${safeCat}',${si})">
              <td style="padding:8px;font-weight:600;color:var(--blue)">${s.sub_item||'-'}</td>
              <td style="padding:8px;color:var(--t2)">${s.criterion||'-'}</td>
              <td style="padding:8px;text-align:center;font-weight:700">${s.score||0}/${s.max||0}${typeof renderLevelScoreTag==='function'?renderLevelScoreTag(s):''}</td>
              <td style="padding:8px;text-align:center"><span style="display:inline-block;padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;background:${levelColor[s.level]||'#eee'};color:#fff;white-space:nowrap">${levelLabel[s.level]||s.level||'-'}</span></td>
              <td style="padding:8px;text-align:center;font-size:10px;color:var(--t3)">${s.timestamp||'-'}</td>
              <td style="padding:8px;color:var(--t2);line-height:1.5">
                ${s.analysis?`<div style="margin-bottom:4px">${s.analysis}</div>`:''}
                ${s.level!=='good'&&s.solution?`<div style="padding:5px 8px;background:rgba(239,68,68,.06);border-left:2px solid #ef4444;border-radius:3px;font-size:10px"><strong style="color:#ef4444">솔루션:</strong> ${s.solution}</div>`:''}
              </td>
            </tr>`;}).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='cl-detail-overlay';
  overlay.dataset.which=which;  // 점수 수기 수정 시 최신 데이터로 다시 그리기 위한 식별자
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;max-width:1200px;width:96vw;max-height:92vh;overflow-y:auto;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="position:sticky;top:0;z-index:10;background:#fff;padding:20px 24px 12px;border-bottom:1px solid var(--bdr)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;color:var(--t3);font-weight:600">${which==='ai'?'AI 독자 분석':'교육맞춤평가'}</div>
          <div style="font-size:18px;font-weight:900;margin-top:2px">체크리스트 대항목 상세 · 총 ${items.length}개 세부항목</div>
        </div>
        <button style="border:none;background:none;cursor:pointer;font-size:22px;color:var(--t3)" onclick="this.closest('.overlay').remove()">✕</button>
      </div>
      <div style="font-size:12px;color:var(--t2);margin-top:6px">총점 <strong style="color:#10b981;font-size:14px">${raw.overall_score||0}점</strong> · 대항목별로 세부 다각 그래프와 달성도를 함께 표시합니다</div>
    </div>
    <div style="padding:16px 24px 24px">${catBlocks}</div>
  </div>`;
  document.body.appendChild(overlay);
}

// 체크리스트 드롭다운 전용 URL (교육자료 선택과 독립 저장 — 두 파일 공존 가능)
function applyChecklistFromSelect(prefix,kind){
  // kind: undefined (교육맞춤평가) | 'ai' (AI 독자 표준)
  const selId=kind==='ai'?prefix+'-cl-ai-select':prefix+'-cl-select';
  const hidSuffix=kind==='ai'?'-cl-ai-url':'-cl-url';
  const sel=document.getElementById(selId);
  if(!sel) return;
  const opt=sel.options[sel.selectedIndex];
  const url=opt?.dataset?.url||'';
  const name=opt?.dataset?.name||'';
  const hidId=prefix+hidSuffix;
  let h=document.getElementById(hidId);
  if(!h){h=document.createElement('input');h.type='hidden';h.id=hidId;document.body.appendChild(h);}
  h.value=url;
  let nh=document.getElementById(hidId+'-name');
  if(!nh){nh=document.createElement('input');nh.type='hidden';nh.id=hidId+'-name';document.body.appendChild(nh);}
  nh.value=name;
  // 적용 배지 표시 — 교육맞춤평가 / AI 독자 각각
  const badgeId=kind==='ai'?prefix+'-cl-ai-applied':prefix+'-cl-applied';
  const badgeNameId=badgeId+'-name';
  const appEl=document.getElementById(badgeId);
  const appName=document.getElementById(badgeNameId);
  if(appEl){
    if(url){
      appEl.style.display='block';
      if(appName) appName.textContent=name;
      else appEl.textContent=(kind==='ai'?'✓ AI 독자(표준): ':'✓ 교육맞춤평가: ')+name;
    } else {
      appEl.style.display='none';
      if(appName) appName.textContent='';
    }
  }
}
function applyEduFile(url,name){
  document.getElementById('an-checklist-name').textContent=name+' (교육자료 적용)';
  // 등록된 파일을 고른 경우 — 로컬 원본이 없어 브라우저 추출 불가 → 서버가 내려받아 처리
  window._anEduText='';
  // 파일 URL을 hidden에 저장
  if(!document.getElementById('an-checklist-url')){
    const h=document.createElement('input');h.type='hidden';h.id='an-checklist-url';document.body.appendChild(h);
  }
  document.getElementById('an-checklist-url').value=url;
  document.getElementById('an-edu-files').style.display='none';
  // 드롭다운 바로 아래 배지 표시
  const badge=document.getElementById('an-edu-applied');
  const badgeName=document.getElementById('an-edu-applied-name');
  if(badge){
    badge.style.display='block';
    if(badgeName) badgeName.textContent=name;
  }
}
// AI 코칭 — 파일 직접 선택 시 Supabase Storage 업로드 → URL 을 an-checklist-url 에 세팅
async function uploadAnChecklistFile(input){
  const file=input?.files?.[0];
  const nameEl=document.getElementById('an-checklist-name');
  if(!file){ if(nameEl) nameEl.textContent='선택된 파일 없음'; return; }
  const sizeMB=file.size/1024/1024;
  if(nameEl) nameEl.textContent=`${file.name} (${sizeMB.toFixed(1)}MB · 업로드 중…)`;
  window._anEduText='';
  try{
    // ① 교안 텍스트를 브라우저에서 먼저 추출 (PPT/Word/Excel)
    //    → 서버가 수백 MB 파일을 내려받아 풀 필요가 없어져 크기 제한이 사라진다
    if(nameEl) nameEl.textContent=`${file.name} (${sizeMB.toFixed(1)}MB · 교안 읽는 중…)`;
    const eduText=await extractEduTextInBrowser(file);
    window._anEduText=eduText||'';
    // ② 원본 파일 저장
    //    작은 파일은 기존대로 Supabase, 큰 파일은 GCS(무제한)로 — 한도 오류 회피
    if(nameEl) nameEl.textContent=`${file.name} (${sizeMB.toFixed(1)}MB · 업로드 중…)`;
    let publicUrl='';
    const ext=(file.name.split('.').pop()||'bin').toLowerCase();
    const path=`eval-checklists/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    const useGCS = file.size > 8*1024*1024;   // 8MB 초과 → GCS 직행
    let ue=null;
    if(!useGCS){
      ({error:ue}=await sb.storage.from('files').upload(path,file));
      if(!ue) publicUrl=sb.storage.from('files').getPublicUrl(path).data.publicUrl;
    }
    // Supabase 가 실패했거나 처음부터 큰 파일이면 GCS 로 (크기 제한 없음)
    if(useGCS||ue){
      if(ue) console.warn('[edu] Supabase 업로드 실패 → GCS 폴백:',ue.message);
      try{
        const up=await uploadFileToGCS(file,'edu-materials');
        publicUrl=up.public_url;
      }catch(ge){
        // 원본 저장에 실패해도 텍스트를 뽑았으면 분석은 진행 가능
        if(window._anEduText){
          console.warn('[edu] 원본 저장 실패 — 추출 텍스트로 분석 진행:',ge);
          if(nameEl) nameEl.textContent=`${file.name} (원본 저장 실패 · 내용은 분석에 반영됨)`;
          publicUrl='';
        }else{
          throw ge;
        }
      }
    }
    if(!publicUrl && !window._anEduText){
      if(nameEl) nameEl.textContent=file.name+' (업로드 실패)';
      alert('파일 업로드 실패: '+(ue?.message||'알 수 없는 오류'));
      input.value='';
      return;
    }
    if(!document.getElementById('an-checklist-url')){
      const h=document.createElement('input');h.type='hidden';h.id='an-checklist-url';document.body.appendChild(h);
    }
    document.getElementById('an-checklist-url').value=publicUrl;
    const txtInfo=window._anEduText?` · 교안 글자 ${window._anEduText.length.toLocaleString()}자 인식`:'';
    if(nameEl) nameEl.textContent=`${file.name} (적용됨${txtInfo})`;
    // 드롭다운 바로 아래 배지 표시 (교육자료 클릭과 동일)
    const badge=document.getElementById('an-edu-applied');
    const badgeName=document.getElementById('an-edu-applied-name');
    if(badge){
      badge.style.display='block';
      if(badgeName) badgeName.textContent=file.name;
    }
    // 적용 표시 박스
    const applied=document.getElementById('an-cl-applied');
    const appliedName=document.getElementById('an-cl-applied-name');
    if(applied){ applied.style.display='block'; if(appliedName) appliedName.textContent=file.name; }
  }catch(e){
    console.error('uploadAnChecklistFile:',e);
    if(nameEl) nameEl.textContent=file.name+' (업로드 실패)';
    alert('파일 업로드 중 오류: '+(e.message||''));
    input.value='';
  }
}
// 스피치 평가 — 파일 직접 선택 시 Supabase Storage 업로드 → URL 을 va-checklist-url 에 세팅
async function uploadVaChecklistFile(input){
  const file=input?.files?.[0];
  const nameEl=document.getElementById('va-cl-name');
  if(!file){ if(nameEl) nameEl.textContent='없음'; return; }
  if(nameEl) nameEl.textContent=file.name+' (업로드 중…)';
  try{
    const ext=(file.name.split('.').pop()||'bin').toLowerCase();
    const path=`eval-checklists/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    const {error:ue}=await sb.storage.from('files').upload(path,file);
    if(ue){
      console.error('upload failed:',ue);
      if(nameEl) nameEl.textContent=file.name+' (업로드 실패)';
      alert('파일 업로드 실패: '+(ue.message||''));
      input.value='';
      return;
    }
    const {data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
    if(!document.getElementById('va-checklist-url')){
      const h=document.createElement('input');h.type='hidden';h.id='va-checklist-url';document.body.appendChild(h);
    }
    document.getElementById('va-checklist-url').value=publicUrl;
    if(nameEl) nameEl.textContent=file.name+' (직접 업로드 적용)';
    const applied=document.getElementById('va-cl-applied');
    const appliedName=document.getElementById('va-cl-applied-name');
    if(applied){ applied.style.display='block'; if(appliedName) appliedName.textContent=file.name; }
  }catch(e){
    console.error('uploadVaChecklistFile:',e);
    if(nameEl) nameEl.textContent=file.name+' (업로드 실패)';
    alert('파일 업로드 중 오류: '+(e.message||''));
    input.value='';
  }
}
// 가전 제품 셀렉트 초기화
function initAnProdSelect(){
  const sel=document.getElementById('an-prod-select');
  if(!sel||sel.options.length>1) return;
  Object.entries(PRODUCT_TREE).forEach(([g,items])=>{
    const og=document.createElement('optgroup');og.label=g;
    items.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;og.appendChild(o);});
    sel.appendChild(og);
  });
}

function runAnalysis(){
  if(!requireAnalysisPermission('AI 영상 평가 분석')) return;
  const yt=v('an-youtube').trim();
  const file=el('an-file').files?.[0];
  const title=v('an-title').trim();
  if(!title){ alert('영상 제목을 입력하세요.'); return; }
  if(!file){ alert('영상 파일을 등록하세요.'); return; }

  // 영상 플레이어 세팅
  window._anYtId=null;
  if(yt){
    const m=yt.match(/[?&]v=([^&]+)/);
    if(m){
      window._anYtId=m[1];
      el('an-player').innerHTML=`<iframe id="an-yt-iframe" src="https://www.youtube.com/embed/${m[1]}?enablejsapi=1" allowfullscreen allow="autoplay" style="width:100%;height:100%;border:none;border-radius:var(--r2)"></iframe>`;
    }
  } else if(file){
    el('an-player').innerHTML=`<video id="an-video-el" controls style="width:100%;height:100%;border-radius:var(--r2)"><source src="${URL.createObjectURL(file)}"></video>`;
  }

  const hasChecklist=el('an-checklist').files?.length>0||document.getElementById('an-checklist-url')?.value||document.getElementById('an-cl-url')?.value;
  const count=parseInt(v('an-count'))||20;
  window._anEduCategory=v('an-product')||'';
  window._anEduFileUrl=document.getElementById('an-checklist-url')?.value||'';
  window._anChecklistUrl=document.getElementById('an-cl-url')?.value||'';
  window._anProduct=document.getElementById('an-prod-select')?.value||'';

  // 영상 미니 썸네일
  const miniEl=el('an-player-mini');
  if(miniEl&&window._anYtId) miniEl.innerHTML=`<img src="https://img.youtube.com/vi/${window._anYtId}/mqdefault.jpg" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">`;
  // 영상 플레이어 풀 (숨김)
  const playerFull=el('an-player-full');
  if(playerFull) playerFull.style.display='none';

  el('an-step1').style.display='none';
  el('an-step2').style.display='';
  var apb=el('an-pdf-btn');if(apb)apb.style.display='';
  // 결과 헤더: 제목 + 교육종류/강사/팀/직군
  setAnResultMeta({title:title, eduType:v('an-edu-type'), userName:CU?.name, team:CU?.team, position:CU?.position});

  // 로딩 표시
  el('an-ai-summary').textContent='AI 분석 중... 잠시만 기다려주세요';
  el('an-criteria-result').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">분석 중...</div>';
  el('an-criteria-opinion').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">분석 중...</div>';
  el('an-ai-result').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">AI 분석 중...</div>';
  el('an-ts-feed').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">평가 항목별 피드백 생성 중...</div>';
  el('an-edu-bars').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">분석 중...</div>';
  el('an-ai-bars').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">분석 중...</div>';

  generateAIAnalysis(title,count,hasChecklist);
}

// 영상/오디오 duration(초) 읽기 — 오디오는 <audio>로 폴백
function readVideoDuration(file){
  return new Promise((resolve)=>{
    const url=URL.createObjectURL(file);
    const isAudio=(file.type||'').startsWith('audio')||/\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(file.name||'');
    const tag=document.createElement(isAudio?'audio':'video');
    tag.preload='metadata';
    const done=(d)=>{URL.revokeObjectURL(url);resolve(isFinite(d)&&d>0?d:0);};
    tag.onloadedmetadata=()=>done(tag.duration);
    tag.onerror=()=>{
      // 실패 시 반대 태그로 재시도
      const tag2=document.createElement(isAudio?'video':'audio');
      tag2.preload='metadata';
      tag2.onloadedmetadata=()=>done(tag2.duration);
      tag2.onerror=()=>done(0);
      tag2.src=url;
    };
    tag.src=url;
  });
}
// 영상 길이별 적정 fps 자동 계산 — Pro 기준
// Pro 입력 2M 토큰, 안전 마진 600K (체크리스트 10K + 교육자료 20K + 출력 32K + 버퍼)
function pickAdaptiveFps(durationSec){
  if(!durationSec||durationSec<=0) return 1.0;
  const maxVideoTokens=600000;
  const ideal=maxVideoTokens/(durationSec*263);
  if(ideal>=1) return 1.0;
  if(ideal>=0.5) return 0.5;
  if(ideal>=0.33) return 0.33;
  if(ideal>=0.25) return 0.25;
  if(ideal>=0.15) return 0.15;
  if(ideal>=0.1) return 0.1;
  return 0.06;
}
function setAiLoadingStep(msg){
  const el=document.getElementById('ai-loading-step');
  if(el) el.textContent=msg;
}
// 단계 체크: 'upload'|'checklist'|'crit'|'ai'|'save' → 'done'|'active'|'pending'
function setAiLoadingStage(step,state){
  const node=document.querySelector(`.alstep[data-step="${step}"]`);
  if(!node) return;
  const icon=node.querySelector('.alstep-icon');
  if(state==='done'){
    node.style.color='#10b981';
    if(icon){icon.style.background='#10b981';icon.style.borderColor='#10b981';icon.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4"><polyline points="5 12 10 17 19 6"/></svg>';}
  } else if(state==='active'){
    node.style.color='var(--blue)';
    node.style.fontWeight='700';
    if(icon){icon.style.background='var(--blue)';icon.style.borderColor='var(--blue)';icon.innerHTML='<span style="width:8px;height:8px;border-radius:50%;background:#fff;animation:ringPulse 1s infinite"></span>';}
  } else { // pending
    node.style.color='var(--t3)';
    node.style.fontWeight='';
    if(icon){icon.style.background='';icon.style.borderColor='#e5e7eb';icon.innerHTML='';}
  }
}
let _aiLoadingTimer=null, _aiLoadingStart=0, _aiLoadingExpected=60;
const AI_LOADING_TIPS=[
  'AI가 영상을 프레임 단위로 살펴보고 있습니다.',
  '체크리스트의 20개 항목 하나하나를 영상과 매칭 중입니다.',
  '강사의 목소리·발음·템포를 분석하고 있습니다.',
  '반복어 습관과 발화 시점을 찾는 중입니다.',
  '교육자료와 영상 내용의 일치도를 검사하고 있습니다.',
  '시나리오/레벨UP TIP/교육 화법을 생성 중입니다.',
  '타임스탬프를 정밀하게 기록하고 있습니다.',
  '종합 의견과 개선 솔루션을 작성 중입니다.',
];
function _updateAiLoadingTimer(){
  const elapsed=Math.floor((Date.now()-_aiLoadingStart)/1000);
  const mm=String(Math.floor(elapsed/60)).padStart(2,'0');
  const ss=String(elapsed%60).padStart(2,'0');
  const elEl=document.getElementById('ai-loading-elapsed');
  if(elEl) elEl.textContent=mm+':'+ss;
  const tipEl=document.getElementById('ai-loading-tip');
  if(tipEl){const idx=Math.floor(elapsed/8)%AI_LOADING_TIPS.length;tipEl.textContent=AI_LOADING_TIPS[idx];}
}
function showAiLoading(show,expectedSec){
  const ov=document.getElementById('ai-loading-overlay');
  if(!ov) return;
  if(show){
    ov.classList.add('show');
    _aiLoadingStart=Date.now();
    _aiLoadingExpected=expectedSec||90;
    // 모든 단계 초기화
    ['upload','checklist','crit','ai','save'].forEach(s=>setAiLoadingStage(s,'pending'));
    _updateAiLoadingTimer();
    if(_aiLoadingTimer) clearInterval(_aiLoadingTimer);
    _aiLoadingTimer=setInterval(_updateAiLoadingTimer,1000);
  } else {
    ov.classList.remove('show');
    if(_aiLoadingTimer){clearInterval(_aiLoadingTimer);_aiLoadingTimer=null;}
  }
}

async function generateAIAnalysis(title,studentCount,hasChecklist,srcPrefix){
  // 방어선 — 버튼 외 경로로 들어와도 권한 없으면 실행하지 않는다
  if(!requireAnalysisPermission('AI 영상 평가 분석')){ try{ showAiLoading(false); }catch(_){} return; }
  // srcPrefix: 'an' (영상 분석, 기본) | 'st' (스트리밍) — 체크리스트/교육자료 입력 소스 선택
  const pfx=srcPrefix==='st'?'st':'an';
  const file=el('an-file').files?.[0];
  const critClId=parseInt(document.getElementById(pfx+'-cl-select')?.value||'0')||null;   // 교육맞춤평가용
  // AI 독자는 등록된 체크리스트를 쓰지 않는다 — AI가 영상을 보고 평가안을 직접 설계해 채점 (자동 평가안)
  // (구버전 드롭다운이 남아있는 화면에서만 값을 읽어 하위호환 유지)
  const aiClId=parseInt(document.getElementById(pfx+'-cl-ai-select')?.value||'0')||null;
  const eduFileUrl=document.getElementById(pfx+'-checklist-url')?.value||'';
  if(!file){
    alert('영상 파일이 없습니다.');
    return;
  }
  // 영상 길이 기반 Pro 분석 예상 시간 (평가안+AI독자 2회 호출 + 업로드/저장)
  const tmpFile=el('an-file').files?.[0];
  const tmpDur=tmpFile?await readVideoDuration(tmpFile).catch(()=>0):0;
  // 경험값: 업로드 15s + Pro 각 호출당 (30s + 영상길이*10%) × 2 + 저장 10s
  // 짧은 영상(5분): 15+2*(30+30)+10 = 145s
  // 20분: 15+2*(30+120)+10 = 325s (5.4분)
  // 1시간: 15+2*(30+360)+10 = 805s (13.4분)
  const expectedSec=Math.max(120,Math.round(25+(tmpDur*0.1+30)*2));
  showAiLoading(true,expectedSec);
  try{
    // 0) 영상 길이로 fps 자동 계산
    setAiLoadingStep('영상 길이 분석 중...');
    const durationSec=tmpDur||await readVideoDuration(file);
    const fps=pickAdaptiveFps(durationSec);
    window._anFps=fps;
    // 1) 체크리스트 항목 로드 — 교육맞춤평가 + AI 독자 각각 별도 로드
    setAiLoadingStep('체크리스트 로드 중...');
    setAiLoadingStage('checklist','active');
    el('an-ai-summary').textContent='체크리스트 로드 중...';
    const critItems=critClId?await loadChecklistItemsForEval(critClId):[];
    const aiItems=aiClId?await loadChecklistItemsForEval(aiClId):[];
    // AI 독자 = 등록 평가안을 쓰지 않는 독립 평가.
    // 빈 배열로 보내면 서버가 자동 평가안 모드(AI가 대항목/세부항목/기준/배점을 직접 설계)로 동작한다.
    const aiItemsEff=aiItems;
    const aiAutoRubric=!aiItems.length;
    // 기존 체크리스트 변수명 호환용 (없어진 참조 안전 처리)
    const checklistItems=critItems.length?critItems:aiItems;
    const checklistId=critClId||aiClId;
    setAiLoadingStage('checklist','done');
    // 2) 영상 GCS 업로드 (무제한 크기, gs:// URI 반환)
    const durMin=Math.round(durationSec/60);
    setAiLoadingStep(`영상 업로드 중 (약 ${durMin}분 영상, fps=${fps})...`);
    setAiLoadingStage('upload','active');
    el('an-ai-summary').textContent='영상 업로드 중... (파일 크기에 따라 30초~5분)';
    const up=await uploadAnalysisVideo(file);
    setAiLoadingStage('upload','done');
    const videoUrl=up.public_url;
    const videoGcsUri=up.gcs_uri;
    const videoMime=up.mime;
    window._anUploadedVideoUrl=videoUrl;
    window._anUploadedGcsUri=videoGcsUri;
    const anPlayer=el('an-player');
    if(anPlayer){
      anPlayer.innerHTML=`<video id="an-video-el" controls style="width:100%;height:100%;border-radius:var(--r2)"><source src="${videoUrl}" type="${videoMime}"></video>`;
    }
    // 3) Vertex AI 호출 — 개별 실패해도 한 쪽은 보여주기
    el('an-ai-summary').textContent='AI 영상 분석 중... (1~3분)';
    // 교안이 있는지 판단 — 원본 URL 이 없어도 브라우저에서 뽑은 텍스트가 있으면 교육맞춤평가 가능
    const eduText=String(window._anEduText||'');
    const hasEdu=!!eduFileUrl||!!eduText;
    let critResult=null, aiResult=null;
    const errors=[];
    // 교육맞춤평가: 교육맞춤 체크리스트 + 교육자료(edu_file_url) 동시 전달
    // critItems가 있어야 교육맞춤평가 시도 (없으면 skip)
    if(hasEdu && critItems.length){
      setAiLoadingStep('AI 영상 분석 1/2 (교육맞춤평가)...');
      setAiLoadingStage('crit','active');
      try{
        critResult=normalizeVertexResult(await callVertexAnalyze({
          video_url:videoUrl, video_gcs_uri:videoGcsUri, video_mime:videoMime, fps,
          checklist_items:critItems, eval_type:'평가안기준',
          edu_file_url:eduFileUrl,
          // 브라우저에서 뽑은 교안 텍스트 — 있으면 서버가 원본을 내려받지 않는다 (대용량 교안 대응)
          edu_text:eduText,
          edu_file_mime:eduFileUrl.match(/\.pdf$/i)?'application/pdf':eduFileUrl.match(/\.(xlsx|xls)$/i)?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':eduFileUrl.match(/\.(docx|doc)$/i)?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':eduFileUrl.match(/\.(pptx?|ppt)$/i)?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/pdf'
        }));
        setAiLoadingStage('crit','done');
      }catch(e){errors.push('교육맞춤평가: '+e.message); console.error(e);}
      setAiLoadingStep('AI 영상 분석 2/2 (AI 독자)...');
    } else {
      setAiLoadingStage('crit','done'); // skip
      setAiLoadingStep('AI 영상 분석 (AI 독자)...');
    }
    // AI 독자: 등록 평가안 없이 AI가 스스로 평가안을 설계해 채점 (교육자료도 전달 안 함)
    setAiLoadingStage('ai','active');
    if(aiAutoRubric) setAiLoadingStep('AI 독자 분석 (AI가 평가안 직접 설계 중)...');
    try{
      aiResult=normalizeVertexResult(await callVertexAnalyze({
        video_url:videoUrl, video_gcs_uri:videoGcsUri, video_mime:videoMime, fps,
        checklist_items:aiItemsEff, eval_type:'AI독자'
      }));
      setAiLoadingStage('ai','done');
    }catch(e){errors.push('AI 독자: '+e.message); console.error(e);}
    if(!critResult&&!aiResult){
      throw new Error(errors.join(' / ')||'분석 실패');
    }
    if(errors.length){
      console.warn('부분 실패:',errors);
      setTimeout(()=>alert('일부 분석 실패:\n'+errors.join('\n')+'\n\n성공한 결과만 표시됩니다.'),100);
    }
    // 4) videos 레코드 먼저 생성(파일 URL 포함) → 그 ID로 evaluations에 원본 결과 연결
    // 하드코딩 관리자(email='admin')만 null; 실계정(부관리자 포함)은 본인 id 사용
    if(CU?.email==='admin'){alert('평가 업로드는 강사 본인 계정으로 진행해주세요.');return;}
    const userId=CU?.id||null;
    if(!userId){alert('로그인 계정을 확인할 수 없습니다.');return;}
    const vidRow=await dbCreateVideo({
      userId, title, youtube:'', filePath:videoUrl,
      gcsUri: videoGcsUri,  // GCS URI 영구 저장 — 재분석 시 18MB 한계 회피
      date:new Date().toISOString().split('T')[0], duration:'—',
      studentCount, status:'분석완료',
      channel:v('an-channel'), videoType:v('an-product')||'', eduType:v('an-edu-type')||'', solution:'AI 분석 완료',
      eduFileUrl:eduFileUrl||'', productName:window._anProduct||''
    });
    if(!vidRow || !vidRow.id){
      showAiLoading(false);
      alert('❌ 영상 등록 실패\n\n영상 파일은 분석 완료됐으나 DB 등록 단계에서 실패했습니다.\n\n가능한 원인:\n- 인증 만료 (재로그인)\n- DB 권한 누락\n- 네트워크 오류\n\n로그 콘솔(F12) 의 dbCreateVideo: ... 에러 메시지를 관리자에게 전달해주세요.');
      console.error('runAnalysis: dbCreateVideo returned null/undefined', vidRow);
      return;
    }
    const videoId=vidRow.id;
    // 관리자·부관리자에게 업로드 알림 (강사 본인 제외)
    notifyAdminsOfUpload({kind:'video', title, uploaderId:userId, orgName:vidRow.org_name, link:'page-admin'}).catch(()=>{});
    // 5) 원본 Vertex 결과 그대로 evaluations 테이블에 저장 — 각 평가별 실제 사용 체크리스트 id 기록
    // AI 독자는 자동 평가안(AI 자체 설계)이면 연결할 체크리스트가 없음 → null
    const aiSaveCid=aiClId||null;
    const saveTasks=[saveEvaluation({videoId,checklistId:aiSaveCid,eduFileUrl:null,evalType:'AI독자',result:aiResult})];
    if(critResult) saveTasks.push(saveEvaluation({videoId,checklistId:critClId,eduFileUrl,evalType:'평가안기준',result:critResult}));
    const saveResults=await Promise.all(saveTasks);
    // 저장 성공/실패 명시적 검증 — 하나라도 실패면 사용자에게 알림
    const failed=saveResults.filter(r=>!r).length;
    if(failed>0){
      console.error('evaluations 저장 실패:',saveResults);
      // saveEvaluation 내부에서도 alert 가 있지만 한번 더 확정 통보
      setTimeout(()=>alert(`⚠️ ${failed}건의 평가 저장이 실패했습니다.\n\n가능한 원인:\n- 인증 만료 (다시 로그인)\n- DB 권한 (관리자에게 문의)\n- 네트워크 오류\n\n페이지를 새로고침해도 결과가 안 보이면 다시 분석해주세요.`),200);
    }
    await loadFromDB();
    // 실제로 저장된 row 가 DB 에 있는지 1회 검증 (로컬 캐시가 아닌 직접 query)
    try{
      const{data:verifyRows}=await sb.from('evaluations').select('id,eval_type').eq('video_id',videoId).limit(5);
      const savedTypes=new Set((verifyRows||[]).map(r=>r.eval_type));
      const expected=['AI독자']; if(critResult) expected.push('평가안기준');
      const missing=expected.filter(t=>!savedTypes.has(t));
      if(missing.length){
        console.error('evaluations DB 검증 실패 — 누락:',missing,'video_id:',videoId);
        setTimeout(()=>alert(`⚠️ DB 검증 실패\n\n${missing.join(', ')} 평가가 저장되지 않았습니다.\n다시 분석을 시도하거나 관리자에게 문의해주세요.\n\n(영상 ID: ${videoId})`),300);
      }
    }catch(verr){console.warn('evaluations 검증 read 실패:',verr);}
    // 6) 전역에 보관 + 렌더
    window._lastVertexResult={crit:critResult,ai:aiResult};
    window._anVideoId=videoId;
    // 방금 저장한 evaluations row ID 확보 (관리자 인라인 수정 기능에서 사용)
    const freshEvals=(D.evaluations||[]).filter(e=>e.video_id===videoId);
    window._anCritEvalId=freshEvals.find(e=>e.eval_type==='평가안기준')?.id||null;
    window._anAiEvalId=freshEvals.find(e=>e.eval_type==='AI독자')?.id||null;
    setAiLoadingStage('save','active');
    setAiLoadingStep('결과 렌더 중...');
    const mapped=mapVertexToLegacy(critResult,aiResult);
    renderAnalysisResult(mapped,true,studentCount);
    setAiLoadingStage('save','done');
    setTimeout(()=>showAiLoading(false),400);
  }catch(e){
    console.error('Vertex AI 분석 실패:',e);
    showAiLoading(false);
    alert('AI 분석 실패: '+e.message+'\n\n임시로 목업 데이터를 표시합니다.');
    const mock=generateMockResult(studentCount);
    renderAnalysisResult(mock,hasChecklist,studentCount);
    autoSaveAnalysis(mock);
  }
}

function generateMockResult(studentCount){
  return {
    criteriaScores:[{name:'발성 및 전달력',score:17+Math.floor(Math.random()*3),max:20},{name:'내용 전문성',score:20+Math.floor(Math.random()*5),max:25},{name:'판서 및 자료',score:10+Math.floor(Math.random()*5),max:15},{name:'수강생 상호작용',score:15+Math.floor(Math.random()*5),max:20},{name:'시간 관리',score:7+Math.floor(Math.random()*3),max:10},{name:'마무리 및 요약',score:7+Math.floor(Math.random()*3),max:10}],
    criteriaSummary:'발성과 전문성이 우수하며, 판서 활용도 향상 시 A등급 달성 가능합니다.',
    overallScore:78+Math.floor(Math.random()*15),
    focusScore:72+Math.floor(Math.random()*15),
    overallComment:'도입→전개→정리 흐름이 전반적으로 자연스러우며, 중반부 속도 조절 필요',
    focusComment:'환기 활동 간격이 일부 구간에서 10분을 초과하여 집중도 저하 우려',
    habits:[{word:'음~',count:8+Math.floor(Math.random()*10)},{word:'그래서',count:4+Math.floor(Math.random()*6)},{word:'맞죠?',count:3+Math.floor(Math.random()*5)},{word:'이제',count:1+Math.floor(Math.random()*3)}],
    decibel:65+Math.floor(Math.random()*15),decibelStatus:'적정',
    tempo:130+Math.floor(Math.random()*20),tempoStatus:'적정',
    engagementGaps:[7+Math.floor(Math.random()*5),10+Math.floor(Math.random()*8),6+Math.floor(Math.random()*4),9+Math.floor(Math.random()*6)],
    engagementWarning:'일부 구간에서 12분 이상 연속 강의 — 중간에 질문이나 퀴즈 삽입 권장',
    timestamps:[
      {category:'니즈파악',item:'제품 관심 유도',score:5,maxScore:5,t:'00:04 ~ 00:08',type:'good',text:'365일 끄지 않고 사용할 수 있는 제품임을 명확히 언급하며 상담 시작',solution:'',tags:['니즈파악']},
      {category:'니즈파악',item:'구독 스몰토크',score:5,maxScore:5,t:'00:14 ~ 00:18',type:'good',text:'일반 구매와 구독의 차이를 예고하며 자연스럽게 구독 화두를 던짐',solution:'',tags:['니즈파악','구독']},
      {category:'제품상담',item:'핵심 기능 설명',score:5,maxScore:5,t:'00:32 ~ 00:45',type:'good',text:'MOF 소재, 노벨 화학상, 유증기 및 암모니아 제거 성능을 전문적으로 설명',solution:'',tags:['전문성']},
      {category:'제품상담',item:'시연 유도',score:4,maxScore:5,t:'00:46 ~ 00:48',type:'bad',text:'필터 위치를 직접 가리키며 고객 시선을 유도하나 속도가 다소 빠름',solution:'시연 시 3초 이상 멈추고 고객이 직접 만져보게 유도하세요',tags:['시연']},
      {category:'맞춤케어',item:'라이프스타일별 맞춤 설명',score:9,maxScore:10,t:'00:49 ~ 01:13',type:'good',text:'요리/반려동물/암모니아 등 생활 패턴에 맞춰 M7 필터의 필요성을 강조',solution:'',tags:['맞춤케어']},
      {category:'AI공기청정',item:'AI 센서 설명',score:5,maxScore:5,t:'01:14 ~ 01:25',type:'good',text:'AI 공기질 센서가 오염도와 필터 수명을 정밀하게 측정함을 설명',solution:'',tags:['AI','센서']},
      {category:'AI공기청정',item:'센서 위치 시연',score:4,maxScore:5,t:'01:35 ~ 01:37',type:'bad',text:'센서 위치를 가리키나 설명이 너무 짧음',solution:'센서 위치를 가리키며 "여기를 보시면" 5초 이상 설명하세요',tags:['시연']},
      {category:'편리성',item:'관리 편의 기능',score:5,maxScore:5,t:'01:26 ~ 01:34',type:'good',text:'기존 필터와 달리 센서 기반으로 오염도 측정하여 관리 효율성 높였음을 설명',solution:'',tags:['편리성']},
      {category:'편리성',item:'디스플레이 안내',score:3,maxScore:5,t:'01:38 ~ 01:40',type:'bad',text:'디스플레이와 센서 연결을 언급하나 시각적 확인이 부족',solution:'디스플레이 화면을 직접 보여주며 숫자 변화를 실시간 시연하세요',tags:['시연','디스플레이']},
      {category:'사용경험비교',item:'케어서비스 언급',score:5,maxScore:5,t:'01:41 ~ 01:50',type:'good',text:'공기청정기는 관리가 핵심임을 강조하며 케어서비스의 필요성을 역설',solution:'',tags:['사용경험','케어']},
    ],
    solution:'1. 반복어를 줄이기 위해 <strong>2초 멈추기 연습</strong> 권장<br>2. 12분 이상 연속 강의 시 <strong>참여 유도 활동</strong> 삽입<br>3. PPT 전환 시 <strong>판서 병행</strong>으로 핵심 키워드 정리<br>4. 후반부 에너지 유지를 위해 <strong>25분경 환기 활동</strong> 계획',
    scenario:'<strong>오프닝 (3분):</strong> 지난 강의 핵심 복습 → 오늘 목표 제시<br><strong>본론 (20분):</strong> 제품 시연 + 수강생 직접 체험 + 10분마다 질문<br><strong>환기 (2분):</strong> 미니 퀴즈 또는 짝 토론<br><strong>마무리 (5분):</strong> 핵심 3가지 판서 정리 + 다음 강의 예고',
    scenarios:['영상에서 "이 제품은 좋습니다"라고 했는데, "이 제품이 고객님 생활을 어떻게 바꿔줄 수 있는지 말씀드리겠습니다"로 시작하면 더 몰입감을 줄 수 있습니다','시연 전 "직접 만져보시겠어요?"라는 참여 유도 멘트를 추가하면 집중도가 높아집니다','마무리에서 "오늘 배운 3가지를 정리하면..."으로 구조화하면 기억 정착률이 올라갑니다'],
    levelUpTips:[{title:'도입 3분이 강의 전체를 결정합니다',text:'오프닝 질문 기법: 실제 사례 적용법'},{title:'실습 피드백은 즉각적·구체적으로',text:'행동 변화를 유도하는 코칭 언어 패턴'},{title:'AI 평가 후 자동 생성 예정',text:'AI 분석 결과 연동'}],
    speechTips:[{title:'도입 화법',text:'"오늘 이 내용 배우면 고객 질문에 답이 달라집니다."'},{title:'피드백 화법',text:'"한 가지만 바꿔 보면 더 잘 될 것 같아서요."'},{title:'마무리 화법',text:'"오늘 배운 것 중 하나만 내일 꼭 써보세요."'}]
  };
}

/* ── 듀얼 레이더 차트 SVG (2개 겹침 지원) ── */
function drawRadarChart(items, color, size, items2, color2, label1, label2){
  size=size||220; const cx=size/2, cy=size/2, R=size/2-55;
  const n=items.length; const as=2*Math.PI/n;
  // 격자
  let g='';
  [.2,.4,.6,.8,1].forEach(lv=>{
    const p=[];for(let i=0;i<n;i++){const a=as*i-Math.PI/2;p.push(`${cx+R*lv*Math.cos(a)},${cy+R*lv*Math.sin(a)}`);}
    g+=`<polygon points="${p.join(' ')}" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="1"/>`;
  });
  // 축
  for(let i=0;i<n;i++){const a=as*i-Math.PI/2;g+=`<line x1="${cx}" y1="${cy}" x2="${cx+R*Math.cos(a)}" y2="${cy+R*Math.sin(a)}" stroke="rgba(0,0,0,.08)" stroke-width="1"/>`;}
  // 데이터 폴리곤 함수
  function poly(data,c){
    const pts=data.map((d,i)=>{const pct=d.max?d.score/d.max:d.score/100;const a=as*i-Math.PI/2;return `${cx+R*pct*Math.cos(a)},${cy+R*pct*Math.sin(a)}`;});
    let dots='';data.forEach((d,i)=>{const pct=d.max?d.score/d.max:d.score/100;const a=as*i-Math.PI/2;dots+=`<circle cx="${cx+R*pct*Math.cos(a)}" cy="${cy+R*pct*Math.sin(a)}" r="3" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;});
    return `<polygon points="${pts.join(' ')}" fill="${c}" fill-opacity=".12" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
  }
  // items2 (평균/비교) 먼저 그리기 (뒤에)
  let p2='';
  if(items2?.length) p2=poly(items2,color2||'#f59e0b');
  const p1=poly(items,color);
  // 라벨
  let lb='';
  items.forEach((d,i)=>{
    const a=as*i-Math.PI/2;const lx=cx+(R+30)*Math.cos(a);const ly=cy+(R+30)*Math.sin(a);
    const anchor=Math.abs(Math.cos(a))<.1?'middle':Math.cos(a)>0?'start':'end';
    lb+=`<text x="${lx}" y="${ly-2}" text-anchor="${anchor}" dominant-baseline="middle" font-size="12" font-weight="600" fill="#4a5568">${d.name}</text>`;
    let scoreText=`${d.score}${d.max?'/'+d.max:''}`;
    if(items2?.[i]) scoreText+=` <tspan fill="${color2||'#f59e0b'}" font-size="10">vs ${items2[i].score}</tspan>`;
    lb+=`<text x="${lx}" y="${ly+14}" text-anchor="${anchor}" dominant-baseline="middle" font-size="12" font-weight="800" fill="${color}">${scoreText}</text>`;
  });
  // 범례
  let legend='';
  if(items2?.length && label1 && label2){
    legend=`<g transform="translate(${size/2-60},${size-8})">
      <rect x="0" y="0" width="8" height="8" rx="2" fill="${color}"/><text x="12" y="8" font-size="8" font-weight="600" fill="${color}">${label1}</text>
      <rect x="65" y="0" width="8" height="8" rx="2" fill="${color2||'#f59e0b'}"/><text x="77" y="8" font-size="8" font-weight="600" fill="${color2||'#f59e0b'}">${label2}</text>
    </g>`;
  }
  const h=items2?.length?size+14:size;
  return `<svg width="${size}" height="${h}" viewBox="0 0 ${size} ${h}" style="display:block;margin:0 auto">${g}${p2}${p1}${lb}${legend}</svg>`;
}

function renderAnalysisResult(r,hasChecklist,studentCount){
  // 인라인 수정 후 재렌더 대비 컨텍스트 저장
  window._anRenderCtx={hasChecklist:!!hasChecklist,studentCount:studentCount||20};
  // ① 총점 배너 — overall_score(100점 만점) 우선, 없으면 criteriaScores 합산
  let critRaw=window._lastVertexResult?.crit;
  let aiRaw=window._lastVertexResult?.ai;
  // 다단계 감지: sub_scores 또는 categories 또는 overall_score 중 하나라도 살아있으면 표시
  const _critHas=(c)=>!!c && (
    (Array.isArray(c.sub_scores) && c.sub_scores.length>0) ||
    (Array.isArray(c.categories) && c.categories.length>0) ||
    Number(c.overall_score||0) > 0
  );
  // 데모 모드: 평가안기준 결과가 없으면 AI 결과 구조로 [교육맞춤평가] 탭 채움
  //   교육맞춤(교안 기준)=더 높게, AI독자(자료 없이 청취)=더 보수적(낮게) — 두 점수 차등
  if(IB_DEMO() && !_critHas(critRaw) && _critHas(aiRaw)){
    const _origAi=aiRaw;
    critRaw=makeDemoCritFromAi(_origAi);     // 교안 기준 — 높게 (~95)
    aiRaw=makeDemoAiLower(_origAi);           // 자료 없이 청취 — 낮게 (~87)
    if(window._lastVertexResult){ window._lastVertexResult.crit=critRaw; window._lastVertexResult.ai=aiRaw; }
    hasChecklist=true; // 교육맞춤 레이더/달성도 바 렌더 활성화
    if(r){ r.criteriaScores=[]; if(critRaw&&critRaw.overall_score) r.overallScore=critRaw.overall_score; }
  }
  // 교육자료 없으면 교육맞춤평가 전체(배너+탭+레이더+피드백) 숨김
  const hasCrit=_critHas(critRaw);
  console.log('[renderAnalysis] hasCrit='+hasCrit, {
    crit_subs: critRaw?.sub_scores?.length||0,
    crit_cats: critRaw?.categories?.length||0,
    crit_score: critRaw?.overall_score||0,
    ai_subs: aiRaw?.sub_scores?.length||0
  });
  const critBannerWrap=document.querySelector('#an-step2 div[style*="linear-gradient(135deg,#9f1239"]')?.parentElement;
  if(critBannerWrap) critBannerWrap.style.display=hasCrit?'':'none';
  const critTabBtn=document.querySelector('button[onclick*="switchAnTab(\'criteria\'"]');
  const aiTabBtn=document.querySelector('button[onclick*="switchAnTab(\'ai\'"]');
  const critPane=el('an-tab-criteria');
  const aiPane=el('an-tab-ai');
  if(critTabBtn) critTabBtn.style.display=hasCrit?'':'none';
  const cmpTabBtn=el('an-tab-btn-compare'); if(cmpTabBtn) cmpTabBtn.style.display=hasCrit?'':'none';
  const cmpPane=el('an-tab-compare'); if(cmpPane) cmpPane.style.display='none';
  // 모든 패널 숨기고 기본 활성 탭만 표시 (재진입 시 이전 상태 잔존 방지)
  if(critPane) critPane.style.display='none';
  if(aiPane) aiPane.style.display='none';
  if(critTabBtn) critTabBtn.classList.remove('active');
  if(aiTabBtn) aiTabBtn.classList.remove('active');
  if(hasCrit){
    // 교육맞춤평가 기본 활성화
    if(critPane) critPane.style.display='block';
    if(critTabBtn) critTabBtn.classList.add('active');
  } else {
    // 교육자료 없으면 AI독자 탭으로
    if(aiPane) aiPane.style.display='block';
    if(aiTabBtn) aiTabBtn.classList.add('active');
  }
  // 평가안기준 없을 때 — 관리자·부관리자에게 [평가안기준 추가 평가] 안내 박스 노출
  const addCritBox=el('an-add-crit-box');
  if(addCritBox){
    const canEdit = !!(CU?.isAdmin || CU?.isSubAdmin);
    if(!hasCrit && canEdit && window._anVideoId){
      addCritBox.innerHTML=`<div style="margin-bottom:16px;padding:14px 18px;border:1px solid rgba(245,158,11,.3);background:rgba(245,158,11,.06);border-radius:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="font-size:22px">🎯</div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:2px">평가안기준 평가가 없습니다</div>
          <div style="font-size:11px;color:var(--t2);line-height:1.5">교육자료와 체크리스트 기반으로 추가 평가를 진행하면 [교육맞춤평가] 탭이 활성화됩니다.</div>
        </div>
        <button class="btn btn-blue" style="padding:8px 18px;font-size:12px;font-weight:800" onclick="addCriteriaEvaluation()">+ 평가안기준 평가 추가</button>
      </div>`;
      addCritBox.style.display='';
    } else {
      addCritBox.style.display='none';
    }
  }
  let pctScore = (typeof r.overallScore==='number' && r.overallScore>0) ? r.overallScore : 0;
  if(!pctScore){
    const sSum=(r.criteriaScores||[]).reduce((a,b)=>a+(b.score||0),0);
    const sMax=(r.criteriaScores||[]).reduce((a,b)=>a+(b.max||0),0);
    pctScore=sMax>0?Math.round(sSum/sMax*100):0;
  }
  const total=pctScore; // 총점 표기는 100점 만점 환산 점수로 통일
  // 대항목/세부항목 개수 (체크리스트 기준)
  const catCount=(critRaw?.categories?.length)||(r.criteriaScores?.length)||0;
  const subCount=(critRaw?.sub_scores?.length)||0;
  const rubricQ=(typeof critRaw?.rubric_alignment_score==='number')?critRaw.rubric_alignment_score:null;
  const ring=document.getElementById('an-score-ring');
  if(ring) ring.setAttribute('stroke-dashoffset',264-264*pctScore/100);
  const pctEl=el('an-score-pct');if(pctEl) pctEl.textContent=pctScore+'%';
  const tsEl=el('an-total-score');if(tsEl) tsEl.textContent=total;
  const ecEl=el('an-eval-cats');if(ecEl) ecEl.textContent=catCount;
  const eiEl=el('an-eval-items');if(eiEl) eiEl.textContent=subCount;
  const ecrEl=el('an-eval-criteria');if(ecrEl) ecrEl.textContent=subCount;
  const rqEl=el('an-rubric-quality');if(rqEl){rqEl.textContent=(rubricQ==null)?'—':(rubricQ+'%');rqEl.title=critRaw?.rubric_alignment_reason||'';}
  const rubricReason=critRaw?.rubric_alignment_reason||'';
  const gradeLabel=pctScore>=90?'우수':pctScore>=70?'양호':'개선 필요';
  const gradeColor=pctScore>=90?'#10b981':pctScore>=70?'#f59e0b':'#fecaca';
  const rubricRsnShort=rubricReason?` (${rubricReason})`:'';
  const critSummaryShort=critRaw?.summary_opinion?critRaw.summary_opinion.split('.').slice(0,2).join('.')+'.':'';
  const sumEl=el('an-ai-summary');if(sumEl) sumEl.innerHTML=`총점 <strong>${total}/100점(${pctScore}%)</strong>으로 <span style="color:${gradeColor}">${gradeLabel}</span> 성과입니다.${rubricQ!=null?` 교안/시나리오 이해도 <strong>${rubricQ}%</strong>${rubricRsnShort}`:''} ${critSummaryShort}`;
  // 뱃지 판별
  const userId=CU?.id||null;
  const earnedBadges=evaluateBadges(r,userId);
  window._lastBadges=earnedBadges;
  // 교육맞춤 배너 뱃지 — cat='교육맞춤' (구버전 '평가안' 하위호환), 상위 3개 + 접기 토글
  const kw1El=el('an-banner-keywords1');
  if(kw1El){
    const criteriaBadges=earnedBadges.filter(id=>{const c=getBadgeInfo(id).cat;return c==='교육맞춤'||c==='평가안';});
    kw1El.innerHTML=renderBadgesCollapsed(criteriaBadges,'crit');
  }

  // ② 교육분석 레이더 (엑셀 기반 체크리스트 대항목)
  // 손상 감지: categories는 있으나 max 합계가 0 → 재분석 안내
  let critValid=(r.criteriaScores||[]).some(c=>Number(c.max||0)>0);
  // ⚠ 다중 폴백: criteriaScores 무효 시 표(평가 항목별 피드백) 와 동일 데이터로 차트 자동 재구성
  //   소스 우선순위: ① critRaw.sub_scores ② aiRaw.sub_scores ③ r.timestamps (표 데이터)
  //   → 표가 보이는 한 차트도 항상 보임
  if(!critValid){
    const buildFromSubs = (arr, getCat, getScore, getMax, getLevel) => {
      const map=new Map();
      const order=[];
      (arr||[]).forEach(s=>{
        const lvl=getLevel(s);
        if(lvl==='na') return;
        const k=getCat(s)||'기타';
        if(!map.has(k)){ map.set(k,{name:k,score:0,max:0}); order.push(k); }
        const a=map.get(k);
        a.score+=Number(getScore(s)||0);
        a.max+=Number(getMax(s)||0);
      });
      return order.map(k=>map.get(k)).filter(c=>c.max>0);
    };
    // 소스 1: critRaw.sub_scores
    let rebuilt = buildFromSubs(critRaw?.sub_scores, s=>s.category, s=>s.score, s=>s.max, s=>s.level);
    let source='critRaw.sub_scores';
    // 소스 2: aiRaw.sub_scores
    if(!rebuilt.length){
      rebuilt = buildFromSubs(aiRaw?.sub_scores, s=>s.category, s=>s.score, s=>s.max, s=>s.level);
      source='aiRaw.sub_scores';
    }
    // 소스 3: r.timestamps (mapVertexToLegacy 결과, 표가 사용하는 데이터)
    if(!rebuilt.length){
      rebuilt = buildFromSubs(r.timestamps, t=>t.category, t=>t.score, t=>t.maxScore, t=>t.level);
      source='r.timestamps (표 데이터)';
    }
    if(rebuilt.length){
      r.criteriaScores = rebuilt;
      critValid = true;
      console.log('[차트 자동 복구] '+source+' 에서 '+rebuilt.length+'개 카테고리 재구성:', rebuilt);
    }
  }
  if(hasChecklist&&r.criteriaScores?.length&&critValid){
    const eduRadar=el('an-edu-radar');
    if(eduRadar) eduRadar.innerHTML=drawRadarSVG(r.criteriaScores,{clickable:true,which:'crit'});
    const eduBars=el('an-edu-bars');
    if(eduBars){
      eduBars.innerHTML=`<div style="flex:1;display:flex;flex-direction:column;justify-content:center">`+
        r.criteriaScores.map(c=>{const p=c.max>0?Math.round(c.score/c.max*100):0;const cc=scoreColorFromRatio(p/100);return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;max-width:560px;margin-left:auto;margin-right:auto;width:100%">
          <span style="font-size:12.5px;font-weight:700;color:var(--t1);width:140px;flex-shrink:0">${c.name}</span>
          <div style="flex:1;height:10px;background:#f0f0f0;border-radius:5px;overflow:hidden;min-width:0"><div style="height:100%;width:${p}%;background:${cc};border-radius:5px;transition:width .8s"></div></div>
          <span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:11.5px;font-weight:800;background:${cc};color:#fff;min-width:50px;text-align:center;flex-shrink:0">${p}%</span>
        </div>`;}).join('')+`</div>`;
    }
  } else if(hasChecklist){
    // 손상된 평가 — 자동 재분석 버튼 + 명확한 안내
    const reanalyzeBtnHtml = (window._anVideoId)
      ? `<button class="btn btn-blue" style="margin-top:14px;padding:8px 20px;font-size:12px;font-weight:800" onclick="reanalyzeCurrentVideo()">🔄 자동 재분석으로 복구</button>
         <div style="font-size:10px;color:var(--t3);margin-top:8px">⏱ 약 30~60초 소요 · AI 가 같은 영상을 다시 분석해 sub_scores 를 복구합니다</div>`
      : '<div style="font-size:11px;color:var(--t3);margin-top:8px">영상 정보가 없어 자동 재분석 불가 — 영상 페이지에서 [AI 분석 시작]을 다시 눌러주세요</div>';
    const eduBars=el('an-edu-bars');
    if(eduBars){
      eduBars.innerHTML=`<div style="padding:30px 20px;text-align:center;color:var(--t2);font-size:13px;line-height:1.6">
        <div style="font-size:32px;margin-bottom:10px">📊</div>
        <div style="font-weight:800;margin-bottom:6px">교육맞춤평가 세부 점수 누락</div>
        <div style="font-size:11px;color:var(--t3);margin-bottom:4px">평가 결과의 sub_scores 가 비어있어 달성도 바를 그릴 수 없습니다.</div>
        ${reanalyzeBtnHtml}
      </div>`;
    }
    const eduRadarParent=el('an-edu-radar');
    if(eduRadarParent&&eduRadarParent.parentElement){
      eduRadarParent.parentElement.innerHTML=`<div style="padding:30px 20px;text-align:center;color:var(--t2);font-size:13px;line-height:1.6">
        <div style="font-size:32px;margin-bottom:8px">📈</div>
        <div style="font-weight:800;margin-bottom:6px">평가안 레이더 생성 불가</div>
        <div style="font-size:11px;color:var(--t3);line-height:1.5">데이터가 일부 손상된 옛 평가입니다.<br>우측 [🔄 자동 재분석] 버튼을 한 번 누르세요.</div>
      </div>`;
    }
  }

  // ③ 타임스탬프 피드 — 평가안은 critRaw, AI독자는 aiRaw 별도 렌더
  const critTimestamps=(critRaw?.sub_scores||[]).map((s,idx)=>({
    _subIdx:idx,  // 관리자 수정 시 sub_scores 내 위치 식별
    category:s.category, item:s.sub_item, criteria:s.criterion||'',
    score:s.score||0, maxScore:s.max||0,
    level:s.level||'',
    t:s.timestamp||'', type:s.level==='good'?'good':s.level==='bad'?'bad':s.level==='na'?'na':'tip',
    text:s.analysis||'', solution:s.solution||'', tags:[]
  }));
  const aiTimestamps=(aiRaw?.sub_scores||[]).map((s,idx)=>({
    _subIdx:idx,
    category:s.category, item:s.sub_item, criteria:s.criterion||'',
    score:s.score||0, maxScore:s.max||0,
    level:s.level||'',
    t:s.timestamp||'', type:s.level==='good'?'good':s.level==='bad'?'bad':s.level==='na'?'na':'tip',
    text:s.analysis||'', solution:s.solution||'', tags:[]
  }));
  window._anTimestamps=critTimestamps.length?critTimestamps:aiTimestamps;
  el('an-criteria-result').innerHTML=critTimestamps.length?renderTsTable(critTimestamps,'crit'):'<div style="padding:20px;text-align:center;color:var(--t3)">교육자료 첨부 시 교육맞춤평가 피드백이 생성됩니다</div>';
  // 교육맞춤평가 Good/Bad/Upgrade — Vertex raw 데이터 사용
  // AI가 관찰한 만큼 유연하게 노출 (상한 12개 — 극단적 응답 대비 안전장치만)
  const criGood=(critRaw?.good||r.good||[]).slice(0,12);
  const criBad=(critRaw?.bad||r.bad||[]).slice(0,12);
  const criUpgrade=(critRaw?.upgrade||r.upgrade||[]).slice(0,12);
  el('an-criteria-opinion').innerHTML=renderOpinionTabs('an-criteria-opinion',criGood,criBad,criUpgrade,'cop',r.criteriaSummary||'교육맞춤평가 종합 분석 결과입니다.');

  // ④ 추천 시나리오 / 레벨UP / 교육화법 — Vertex raw 데이터
  const scenariosRaw=critRaw?.scenarios||[];
  const tipsRaw=critRaw?.level_tips||[];
  const patternsRaw=critRaw?.teaching_patterns||[];
  // 카드 렌더러 — 신규 필드(script_comparison, reason, observation, expected_effect) 지원 + 기존 호환
  const scenarioCard=(s,i)=>`<div style="padding:14px;border:1px solid rgba(159,18,57,.08);border-radius:10px;background:rgba(159,18,57,.03);margin-bottom:8px">
    <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:6px">시나리오 ${i+1}</div>
    ${s.situation?`<div style="font-size:11px;color:var(--t3);margin-bottom:4px">${s.situation}</div>`:''}
    ${s.original_line?`<div style="font-size:11px;color:var(--red);text-decoration:line-through;margin-bottom:2px">현장 발화: "${s.original_line}"</div>`:''}
    ${s.script_comparison&&s.script_comparison!=='교육자료 미제시'?`<div style="font-size:11px;color:var(--t2);margin-bottom:2px;padding:4px 8px;background:rgba(0,0,0,.04);border-radius:4px">교육자료 대본: "${s.script_comparison}"</div>`:''}
    ${s.suggested_line?`<div style="font-size:12px;color:var(--blue);font-weight:600">추천 시나리오: "${s.suggested_line}"</div>`:''}
    ${s.reason?`<div style="font-size:10.5px;color:var(--t2);margin-top:4px;line-height:1.5">💡 ${s.reason}</div>`:''}
    ${typeof s==='string'?`<div style="font-size:11px;color:var(--t2);line-height:1.6">${s}</div>`:''}
  </div>`;
  const tipCard2=(t)=>`<div style="padding:14px;border:1px solid rgba(139,92,246,.08);border-radius:10px;background:rgba(139,92,246,.03);margin-bottom:8px">
    <div style="font-size:12px;font-weight:700;color:var(--purple);margin-bottom:4px">${t.title||'TIP'}</div>
    ${t.observation?`<div style="font-size:10.5px;color:var(--t3);margin-bottom:4px">📍 현재: ${t.observation}</div>`:''}
    <div style="font-size:11px;color:var(--t2);line-height:1.6">${t.detail||t.text||t}</div>
    ${t.expected_effect?`<div style="font-size:10.5px;color:var(--green);margin-top:4px;line-height:1.5;font-weight:600">📈 ${t.expected_effect}</div>`:''}
  </div>`;
  const patternCard=(p)=>`<div style="padding:14px;border:1px solid rgba(16,185,129,.08);border-radius:10px;background:rgba(16,185,129,.03);margin-bottom:8px">
    <div style="font-size:12px;font-weight:700;color:var(--green);margin-bottom:4px">${p.type||'화법'} 화법</div>
    ${p.original?`<div style="font-size:11px;color:var(--t3);margin-bottom:2px">현재: "${p.original}"</div>`:''}
    ${p.alternative?`<div style="font-size:12px;color:var(--t1);font-weight:600">추천: "${p.alternative}"</div>`:''}
    ${p.reason?`<div style="font-size:10.5px;color:var(--t2);margin-top:4px;line-height:1.5">💡 ${p.reason}</div>`:''}
    ${typeof p==='string'?`<div style="font-size:11px;color:var(--t2)">${p}</div>`:''}
  </div>`;
  el('an-tip-scenario').innerHTML=scenariosRaw.length?scenariosRaw.map(scenarioCard).join(''):'<div style="padding:14px;text-align:center;font-size:12px;color:var(--t3)">교육자료 첨부 시 시나리오가 생성됩니다</div>';
  el('an-tip-levelup').innerHTML=tipsRaw.length?tipsRaw.map(tipCard2).join(''):'<div style="padding:14px;text-align:center;font-size:12px;color:var(--t3)">분석 후 자동 생성됩니다</div>';
  el('an-tip-speech').innerHTML=patternsRaw.length?patternsRaw.map(patternCard).join(''):'<div style="padding:14px;text-align:center;font-size:12px;color:var(--t3)">분석 후 자동 생성됩니다</div>';

  // ⑤ AI 독자 분석 배너 + 레이더 — ai.overall_score 기준 통일
  const aiScore=(typeof aiRaw?.overall_score==='number')?aiRaw.overall_score:Math.round(((r.overallScore||0)+(r.focusScore||0))/2);
  const aiRing=document.getElementById('an-score-ring-ai');
  if(aiRing) aiRing.setAttribute('stroke-dashoffset',264-264*aiScore/100);
  const aiPctEl=el('an-score-pct-ai');if(aiPctEl) aiPctEl.textContent=aiScore+'%';
  const aiScEl=el('an-ai-score');if(aiScEl) aiScEl.textContent=aiScore;
  // AI 독자 대항목/세부항목/평가기준 수 = 체크리스트 기준 (criterion = 세부항목당 1개라 세부항목 수와 동일)
  const aiCatsEl=el('an-ai-cats');if(aiCatsEl) aiCatsEl.textContent=(aiRaw?.categories?.length)||catCount||0;
  const aiSubsEl=el('an-ai-subs');if(aiSubsEl) aiSubsEl.textContent=(aiRaw?.sub_scores?.length)||subCount||0;
  const aiCriEl=el('an-ai-criteria');if(aiCriEl) aiCriEl.textContent=(aiRaw?.sub_scores?.length)||subCount||0;
  const aiGradeLabel=aiScore>=90?'우수':aiScore>=70?'양호':'개선 필요';
  const aiGradeColor=aiScore>=90?'#10b981':aiScore>=70?'#f59e0b':'#fecaca';
  const aiSummaryShort=aiRaw?.summary_opinion?aiRaw.summary_opinion.split('.').slice(0,2).join('.')+'.':'';
  const aiSum2=el('an-ai-summary2');if(aiSum2) aiSum2.innerHTML=`총점 <strong>${aiScore}/100점(${aiScore}%)</strong>으로 <span style="color:${aiGradeColor}">${aiGradeLabel}</span> 성과입니다. ${aiSummaryShort}`;
  // AI 독자 배너 뱃지 — cat='AI독자' + '누적', 상위 3개 + 접기 토글
  const kw2El=el('an-banner-keywords2');
  if(kw2El){
    const aiBadges=earnedBadges.filter(id=>{const c=getBadgeInfo(id).cat;return c==='AI독자'||c==='누적';});
    kw2El.innerHTML=renderBadgesCollapsed(aiBadges,'ai');
  }

  // AI 독자 레이더: Vertex 결과의 categories를 직접 사용 (체크리스트 대항목과 동일)
  const aiRawCats=window._lastVertexResult?.ai?.categories||[];
  const aiItems=aiRawCats.length
    ? aiRawCats.map(c=>({name:c.name,score:c.score||0,max:c.max||1}))
    : (r.criteriaScores||[]).map(c=>({name:c.name,score:c.score||0,max:c.max||1}));
  const aiRadar=el('an-ai-radar');
  if(aiRadar) aiRadar.innerHTML=drawRadarSVG(aiItems,{clickable:true,which:'ai'});
  // 비교 보기 — 교육맞춤 vs AI독자 레이더 좌우 동시
  const cmpBody=el('an-compare-body');
  if(cmpBody){
    const critItems=(r.criteriaScores||[]).map(c=>({name:c.name,score:c.score||0,max:c.max||1}));
    const diff=Math.abs((pctScore||0)-(aiScore||0));
    cmpBody.innerHTML=`
      <div class="an-compare-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:stretch">
        <div style="border:2px solid rgba(159,18,57,.35);border-radius:16px;padding:18px 18px 8px;background:rgba(159,18,57,.03)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
            <div style="font-size:14px;font-weight:800;color:#9f1239">교육맞춤평가</div>
            <div style="font-size:22px;font-weight:900;color:#9f1239">${pctScore}<span style="font-size:11px;color:var(--t3)">%</span></div>
          </div>
          <div style="font-size:10.5px;color:var(--t3);margin-bottom:8px">📋 교안·시나리오·체크리스트(추가 데이터)를 기준으로 <b style="color:#9f1239">"계획대로 전달됐는지"</b> 평가</div>
          ${critItems.length?`<svg viewBox="0 0 500 440" style="width:100%;height:auto">${drawRadarSVG(critItems,{which:'crit'})}</svg>`:'<div style="padding:50px 0;text-align:center;color:var(--t3);font-size:12px">데이터 없음</div>'}
        </div>
        <div style="border:2px solid rgba(232,89,12,.35);border-radius:16px;padding:18px 18px 8px;background:rgba(232,89,12,.03)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
            <div style="font-size:14px;font-weight:800;color:#e8590c">AI 독자 분석</div>
            <div style="font-size:22px;font-weight:900;color:#e8590c">${aiScore}<span style="font-size:11px;color:var(--t3)">%</span></div>
          </div>
          <div style="font-size:10.5px;color:var(--t3);margin-bottom:8px">🎧 교육자료 <b>없이</b> 영상만 듣고 <b style="color:#e8590c">"AI가 받은 전달력·인상"</b>을 독자 평가</div>
          ${aiItems.length?`<svg viewBox="0 0 500 440" style="width:100%;height:auto">${drawRadarSVG(aiItems,{which:'ai'})}</svg>`:'<div style="padding:50px 0;text-align:center;color:var(--t3);font-size:12px">데이터 없음</div>'}
        </div>
      </div>
      <div style="margin-top:16px;padding:16px 18px;border:1px solid var(--bdr);border-radius:12px;background:#fff;font-size:12.5px;color:var(--t2);line-height:1.8">
        <div style="font-weight:800;color:var(--t1);margin-bottom:6px">두 평가가 왜 다를까요?</div>
        <div>• <b style="color:#9f1239">교육맞춤평가</b>는 <b>교안·시나리오 같은 추가 데이터를 대조</b>합니다. 그래서 "교안 목표 부합도·시연 구성"처럼 <b>계획 대비 충실도</b>가 드러나고, 자료에 명시된 항목이 덜 전달되면 점수가 내려갑니다.</div>
        <div>• <b style="color:#e8590c">AI 독자 분석</b>은 <b>그 자료 없이 영상만 듣고</b> 판단합니다. 그래서 "스피치·전달력·소통"처럼 <b>실제 청취 인상</b> 위주로 평가됩니다.</div>
        <div style="margin-top:6px">→ 같은 강의도 <b style="color:#9f1239">${pctScore}%</b>(교안 기준) vs <b style="color:#e8590c">${aiScore}%</b>(독자 기준), <b>격차 ${diff}p</b>. 두 관점을 함께 보면 <b>'계획'과 '실제 전달'</b>을 모두 잡을 수 있습니다.</div>
      </div>`;
  }
  const aiBars=el('an-ai-bars');
  if(aiBars){
    aiBars.innerHTML=`<div style="flex:1;display:flex;flex-direction:column;justify-content:center">`+
      aiItems.map(c=>{const p=c.max>0?Math.round(c.score/c.max*100):0;const cc=scoreColorFromRatio(p/100);return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;max-width:560px;margin-left:auto;margin-right:auto;width:100%">
        <span style="font-size:12.5px;font-weight:700;color:var(--t1);width:140px;flex-shrink:0">${c.name}</span>
        <div style="flex:1;height:10px;background:#f0f0f0;border-radius:5px;overflow:hidden;min-width:0"><div style="height:100%;width:${p}%;background:${cc};border-radius:5px;transition:width .8s"></div></div>
        <span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:11.5px;font-weight:800;background:${cc};color:#fff;min-width:50px;text-align:center;flex-shrink:0">${p}%</span>
      </div>`;}).join('')+`</div>`;
  }

  // 강의 분위기 AI 판정 — computeAiMood 공통 함수 사용 (AI독자 voice data 기준, 프로필 칩·모달과 동일 로직)
  const aiMood=computeAiMood(r.decibel, r.tempo, r.habits);
  const moodColors={'열정적이고 에너지 넘치는':'#E21E26','밝고 경쾌한':'#f59e0b','친근하고 편안한':'#10b981','전문적이고 진지한':'#0078C8','차분하고 신뢰감 있는':'#8b5cf6','재미있고 유머러스한':'#ec4899'};
  const moodBadge=el('an-mood-badge');
  if(moodBadge){moodBadge.style.display='block';moodBadge.textContent=aiMood;moodBadge.style.background=moodColors[aiMood]||'#fff';moodBadge.style.color='#fff';}

  // ⑥ 음성 & 습관 분석
  const totalHabitCount=(r.habits||[]).reduce((a,h)=>a+h.count,0);
  let habitSolution='';
  if(totalHabitCount>30) habitSolution='반복어가 매우 많습니다. 강의 중 2초 멈추기 연습과 핵심 문장 사전 준비를 권장합니다.';
  else if(totalHabitCount>15) habitSolution='반복어 줄이기 위해 핵심 키워드를 메모하고, 의식적으로 끊어 말하기를 연습하세요.';
  else if(totalHabitCount>5) habitSolution='소량의 반복어가 감지되었습니다. 자연스러운 수준이나 의식하면 더 좋아집니다.';
  window._anHabits=r.habits||[];
  el('an-habits').innerHTML=(r.habits?.length?r.habits.map((h,hi)=>{
    const cls=h.count>10?'hb-high':h.count>5?'hb-mid':'hb-low';
    const hasTs=(h.timestamps&&h.timestamps.length);
    const clickable=hasTs?'cursor:pointer;text-decoration:underline dotted':'';
    return `<span class="habit-badge ${cls}" style="${clickable}" ${hasTs?`onclick="openHabitTimestamps(${hi})"`:''}>${h.word} <span class="habit-cnt">${h.count}회</span></span>`;
  }).join(''):'<span style="font-size:11px;color:var(--t3)">감지된 반복어 없음</span>')
  +(habitSolution?`<div style="margin-top:10px;font-size:11px;color:var(--t2);line-height:1.5;padding:8px 10px;background:#f8f9fa;border-radius:8px">${habitSolution}</div>`:'');
  // 데시벨 → 적정 인원 계산
  const db=r.decibel||0;
  const fitPersons=db>=80?'20명+':db>=75?'15~20명':db>=70?'10~15명':db>=65?'5~10명':db>=60?'3~5명':'1~3명';
  el('an-voice-stats').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div style="padding:10px;background:#f8f9fa;border-radius:8px"><div style="font-size:10px;color:var(--t3)">데시벨</div><div style="font-size:18px;font-weight:900">${db} dB</div><div style="font-size:10px;color:${r.decibelStatus==='적정'?'var(--green)':'var(--orange)'}">${r.decibelStatus||''}</div></div>
      <div style="padding:10px;background:#f8f9fa;border-radius:8px"><div style="font-size:10px;color:var(--t3)">템포</div><div style="font-size:18px;font-weight:900">${r.tempo||0} WPM</div><div style="font-size:10px;color:${r.tempoStatus==='적정'?'var(--green)':'var(--orange)'}">${r.tempoStatus||''}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div style="padding:10px;background:#f8f9fa;border-radius:8px"><div style="font-size:10px;color:var(--t3)">적정 인원</div><div style="font-size:14px;font-weight:800;color:var(--t1)">${fitPersons}</div><div style="font-size:10px;color:var(--t3)">${db}dB 기준</div></div>
      <div style="padding:10px;background:${moodColors[aiMood]||'#f8f9fa'};border-radius:8px;color:#fff"><div style="font-size:10px;color:rgba(255,255,255,.7)">강의 분위기</div><div style="font-size:13px;font-weight:800">${aiMood}</div><div style="font-size:10px;color:rgba(255,255,255,.6)">AI 판정</div></div>
    </div>`;
  // 환기 타이밍 — 신(객체) 포맷: {timestamp,gap_minutes,observation,suggestion}, 구(숫자) 포맷: [7,12,9]
  const rawGaps=Array.isArray(r.engagementGaps)?r.engagementGaps:(r.engagementGaps?[r.engagementGaps]:[]);
  const richGaps=rawGaps.filter(g=>g&&typeof g==='object'&&!Array.isArray(g));
  const numGaps=rawGaps.filter(g=>typeof g==='number'||(typeof g==='string'&&!isNaN(parseFloat(g)))).map(g=>Number(g));
  let engageHtml='';
  if(richGaps.length){
    engageHtml=richGaps.map(g=>{
      const ts=String(g.timestamp||'').trim();
      const gm=Number(g.gap_minutes||0);
      const obs=g.observation||'';
      const sug=g.suggestion||'';
      const safeTs=ts.replace(/'/g,'');
      const tsTag=ts?`<span style="padding:2px 8px;background:rgba(0,120,200,.12);color:var(--blue);border-radius:10px;font-size:11px;font-weight:800;cursor:pointer" onclick="openAnVideoAt('${safeTs}')">▶ ${ts}</span>`:'';
      const gmTag=gm>0?`<span style="padding:2px 7px;background:${gm>=12?'#fee2e2':gm>=8?'#fef3c7':'#dcfce7'};color:${gm>=12?'#dc2626':gm>=8?'#d97706':'#16a34a'};border-radius:10px;font-size:10px;font-weight:800">${gm}분 공백</span>`:'';
      return `<div style="padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;margin-bottom:6px;background:#fff">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">${tsTag}${gmTag}</div>
        ${obs?`<div style="font-size:11px;color:var(--t2);line-height:1.5;margin-bottom:3px">${obs}</div>`:''}
        ${sug?`<div style="font-size:11px;color:var(--blue);line-height:1.5">💡 ${sug}</div>`:''}
      </div>`;
    }).join('');
  } else if(numGaps.length){
    engageHtml=`<div style="font-size:12px;color:var(--t2);line-height:1.7">간격: <strong>${numGaps.join('분 → ')}분</strong></div>`;
  } else {
    engageHtml='<div style="font-size:11px;color:var(--t3)">환기 데이터 없음</div>';
  }
  el('an-engagement').innerHTML=engageHtml+(r.engagementWarning?`<div style="font-size:11px;color:var(--t2);margin-top:6px">${r.engagementWarning}</div>`:'');

  // 음높이 정성 평가 렌더 (AI 독자 분석 기반)
  renderPitchAnalysis(r);

  // ⑦ AI 독자 타임스탬프 (aiRaw 기반 — 평가안과 별도)
  el('an-ts-feed').innerHTML=aiTimestamps.length?renderTsTable(aiTimestamps,'ai'):'<div style="padding:20px;text-align:center;color:var(--t3)">분석 데이터 없음</div>';
  // AI 독자 Good/Bad/Upgrade — Vertex raw 데이터 사용
  // AI가 관찰한 만큼 유연하게 노출 (상한 12개)
  const aiGoodItems=(aiRaw?.good||r.good||[]).slice(0,12);
  const aiBadItems=(aiRaw?.bad||r.bad||[]).slice(0,12);
  const aiUpgradeItems=(aiRaw?.upgrade||r.upgrade||[]).slice(0,12);
  el('an-ai-result').innerHTML=renderOpinionTabs('an-ai-result',aiGoodItems,aiBadItems,aiUpgradeItems,'aop',r.overallComment||'AI가 분석한 종합 의견입니다.');
}

// ─── 음높이 정성 평가 렌더 ───
function renderPitchAnalysis(r){
  const sec=document.getElementById('an-pitch-section');
  const sum=document.getElementById('an-pitch-summary');
  const segBox=document.getElementById('an-pitch-segments');
  const btn=document.getElementById('an-pitch-excel-btn');
  if(!sec||!sum||!segBox) return;
  const segs=Array.isArray(r?.pitchSegments)?r.pitchSegments:[];
  const overall=r?.pitchOverall||'';
  const reco=r?.pitchRecommendation||'';
  const reason=r?.pitchReason||'';
  if(!overall && !reco && !segs.length){
    sec.style.display='none';
    if(btn) btn.style.display='none';
    window._anPitchSegs=null;
    return;
  }
  sec.style.display='block';
  if(btn) btn.style.display=segs.length?'inline-block':'none';
  window._anPitchSegs=segs;
  const recoArrow=/높/.test(reco)?'△':/낮/.test(reco)?'▽':'=';
  const recoColor=recoArrow==='△'?'#10b981':recoArrow==='▽'?'#dc2626':'#475569';
  const overallColor=/높/.test(overall)?'#0078C8':/낮/.test(overall)?'#f59e0b':'#10b981';
  sum.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="padding:12px;background:#f8f9fa;border-radius:10px">
        <div style="font-size:10.5px;color:var(--t3);margin-bottom:4px">전체 음높이 인상</div>
        <div style="font-size:18px;font-weight:900;color:${overallColor}">${overall||'—'}</div>
      </div>
      <div style="padding:12px;background:#f8f9fa;border-radius:10px">
        <div style="font-size:10.5px;color:var(--t3);margin-bottom:4px">권장 방향</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:22px;font-weight:900;color:${recoColor};line-height:1">${recoArrow}</span>
          <span style="font-size:13px;font-weight:800;color:var(--t1)">${reco||'—'}</span>
        </div>
      </div>
    </div>
    ${reason?`<div style="margin-top:10px;padding:10px 12px;background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;font-size:11.5px;color:#92400e;line-height:1.6">💡 ${reason}</div>`:''}
  `;
  if(!segs.length){segBox.innerHTML='';return;}
  const arrowFor=adv=>{const a=String(adv||'').trim();
    if(a==='↑'||/높/.test(a)) return {ic:'△',col:'#10b981'};
    if(a==='↓'||/낮/.test(a)) return {ic:'▽',col:'#dc2626'};
    return {ic:'=',col:'#475569'};
  };
  segBox.innerHTML=`
    <div style="font-size:11.5px;font-weight:700;color:var(--t2);margin-bottom:6px">발화별 음높이 힌트 <span style="font-weight:500;color:var(--t3)">· 클릭하면 해당 시점 영상 재생</span></div>
    <div style="display:flex;flex-direction:column;gap:5px;max-height:300px;overflow-y:auto;padding-right:4px">
      ${segs.map((s,si)=>{
        const a=arrowFor(s.advice);
        const ts=String(s.timestamp||'').trim();
        const safeTs=ts.replace(/'/g,'');
        const tsTag=ts?`<span style="padding:2px 8px;background:rgba(0,120,200,.12);color:var(--blue);border-radius:10px;font-size:10.5px;font-weight:800;cursor:pointer;flex-shrink:0" onclick="openAnVideoAt('${safeTs}')">▶ ${ts}</span>`:'';
        const lvCol=/높/.test(s.level)?'#0078C8':/낮/.test(s.level)?'#f59e0b':'#10b981';
        return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;background:#fff">
          <span style="font-size:18px;font-weight:900;color:${a.col};line-height:1;flex-shrink:0;min-width:18px;text-align:center">${a.ic}</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">
              ${tsTag}
              <span style="font-size:10px;font-weight:800;color:${lvCol};padding:1px 6px;border:1px solid ${lvCol}33;border-radius:8px">${s.level||''}</span>
            </div>
            ${s.quote?`<div style="font-size:11.5px;color:var(--t1);line-height:1.5;font-style:italic">"${(s.quote||'').replace(/</g,'&lt;')}"</div>`:''}
            ${s.reason?`<div style="font-size:11px;color:var(--t3);margin-top:2px;line-height:1.5">${(s.reason||'').replace(/</g,'&lt;')}</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}
function downloadPitchExcel(){
  const segs=window._anPitchSegs||[];
  if(!segs.length){alert('음높이 분석 데이터가 없습니다.');return;}
  const title=(document.getElementById('an-title')?.value||'영상분석').trim();
  const date=new Date().toISOString().split('T')[0];
  const arrowFor=adv=>{const a=String(adv||'').trim();
    if(a==='↑'||/높/.test(a)) return '△ 높이세요';
    if(a==='↓'||/낮/.test(a)) return '▽ 낮추세요';
    return '= 유지';
  };
  if(typeof XLSX!=='undefined'){
    const aoa=[
      ['음높이 분석 — '+title,'','','',''],
      ['분석일',date,'강사',CU?.name||'—',''],
      [],
      ['시점','발화 인용','음높이','권장 방향','이유']
    ];
    segs.forEach(s=>{aoa.push([s.timestamp||'',s.quote||'',s.level||'',arrowFor(s.advice),s.reason||'']);});
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:10},{wch:36},{wch:8},{wch:14},{wch:50}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'음높이');
    XLSX.writeFile(wb,`음높이_${title}_${date}.xlsx`);
    return;
  }
  let csv='﻿음높이 분석 — '+title+'\n';
  csv+=`분석일,${date},강사,${CU?.name||'—'}\n\n`;
  csv+='시점,발화 인용,음높이,권장 방향,이유\n';
  segs.forEach(s=>{
    const q=String(s.quote||'').replace(/"/g,'""');
    const r=String(s.reason||'').replace(/"/g,'""');
    csv+=`${s.timestamp||''},"${q}",${s.level||''},${arrowFor(s.advice)},"${r}"\n`;
  });
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`음높이_${title}_${date}.csv`; a.click();
  URL.revokeObjectURL(url);
}
// 타임스탬프 테이블 공통 렌더
function renderTsTable(timestamps,which){
  const srcWhich=which||'crit';
  const canEdit=!!(CU?.isAdmin||CU?.isSubAdmin);  // 관리자/부관리자만 인라인 수정 허용
  // 공통 스타일 — 점수 외 모든 셀: 종합 의견과 동일 (회색 · 12px · LG글씨 · 기본 굵기)
  const FONT="'LG글씨','LG Smart',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  const CELL_SIZE='12px';
  const CELL_COLOR='#555555';       // var(--t2) — 종합의견 본문 색
  const CELL_LINE='1.7';
  const thStyle=(align)=>`padding:11px 10px;text-align:${align||'left'};font-family:${FONT};font-size:${CELL_SIZE};font-weight:700;color:${CELL_COLOR};background:#f1f5f9;border-bottom:2px solid #cbd5e1;white-space:nowrap;line-height:${CELL_LINE}`;
  // 한 줄 강제 컬럼용 스타일 (대항목/세부항목/배점/점수/시점)
  const tdNowrap=`padding:11px 10px;font-family:${FONT};font-size:${CELL_SIZE};font-weight:400;color:${CELL_COLOR};line-height:${CELL_LINE};vertical-align:top;border-bottom:1px solid #e5e7eb;white-space:nowrap;overflow:visible`;
  // 여러 줄 허용 컬럼용 (평가 기준/분석/솔루션)
  const tdWrap=`padding:11px 10px;font-family:${FONT};font-size:${CELL_SIZE};font-weight:400;color:${CELL_COLOR};line-height:${CELL_LINE};vertical-align:top;border-bottom:1px solid #e5e7eb;word-break:break-word;white-space:normal`;
  // colgroup — 한 줄 컬럼은 충분한 폭 확보 ('교수설계 및 교수법' 같은 긴 대항목도 한 줄)
  const colgroupHtml=`<colgroup>
    <col style="width:150px"><col style="width:130px"><col style="width:260px">
    <col style="width:60px"><col style="width:76px"><col style="width:116px">
    <col style="width:30%"><col style="width:22%">
  </colgroup>`;
  const tableStyle=`width:100%;border-collapse:separate;border-spacing:0;min-width:1280px;table-layout:fixed;background:#fff;font-family:${FONT}`;
  const bodyRows=timestamps.map((ts,idx)=>{
      const noTs=!ts.t||ts.t==='—'||ts.t==='-'||/^\s*$/.test(ts.t);
      const naText=/(해당 ?없|평가하기 어렵|평가가 어렵|판단하기 어렵|평가 불가|판단 불가|확인 불가|녹화된 강의이므로|해당 항목을 평가할 수 없|평가 대상이 아님)/.test((ts.text||'')+(ts.solution||''));
      const isNA=ts.level==='na'||ts.type==='na'||(noTs&&naText);
      const scoreRatio=ts.maxScore?ts.score/ts.maxScore:0;
      // 색상 기준 — 5단계 앵커 채점과 동일 (배점 크기와 무관하게 하나의 기준)
      //  · 70% 이상 → 초록 (4~5점: 우수·매우 우수)   예) 8/10, 4/5
      //  · 50% 이상 → 주황 (3점: 보통)               예) 6/10, 3/5
      //  · 그 미만  → 빨강 (1~2점: 미흡·매우 미흡)   예) 2/10, 2/5
      // 수기로 점수를 고쳐도 이 기준으로 색이 함께 바뀐다.
      const scoreColor=isNA?'#94a3b8':scoreColorFromRatio(scoreRatio);
      const rowBg=idx%2===0?'#ffffff':'#fafbfc';
      // 점수 pill (가점 있는 항목) — stopPropagation 제거, tbody 위임 핸들러가 contenteditable 감지 처리
      // oninput — 숫자를 치는 즉시 색이 바뀐다 (저장·재렌더를 기다리지 않음)
      const scorePill=`<span class="ts-score-edit" data-sub-idx="${ts._subIdx}" data-max="${ts.maxScore||5}" ${canEdit?'contenteditable="true" oninput="recolorScorePill(this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}" onfocus="this.style.outline=\'2px dashed #0078C8\';this.style.outlineOffset=\'1px\'" onblur="this.style.outline=\'none\';saveSubScoreEdit(\''+srcWhich+'\','+ts._subIdx+',\'score\',this.textContent)"':''} style="display:inline-block;min-width:28px;padding:3px 10px;border-radius:999px;background:${scoreColor}18;color:${scoreColor};font-weight:800;font-size:${CELL_SIZE};font-family:${FONT};${canEdit?'cursor:text;':''}">${ts.score}</span>`;
      // 해당없음 표기 — 모든 사용자에게 회색 '해당없음'. 관리자는 클릭 시 숫자 입력으로 전환 가능
      const naEditable=`<span class="ts-score-edit" data-sub-idx="${ts._subIdx}" data-max="${ts.maxScore||5}" contenteditable="true" oninput="recolorScorePill(this)" onfocus="if(this.textContent.trim()==='해당없음'){this.innerHTML='';}this.style.color='#000';this.style.outline='2px dashed #0078C8';this.style.outlineOffset='1px'" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}" onblur="this.style.outline='none';saveSubScoreEdit('${srcWhich}',${ts._subIdx},'score',this.textContent);if(!this.textContent.trim()){this.textContent='해당없음';this.style.background='transparent';this.style.color='#94a3b8';}" style="display:inline-block;padding:3px 10px;border-radius:999px;color:#94a3b8;font-family:${FONT};font-size:${CELL_SIZE};font-weight:700;cursor:text">해당없음</span>`;
      const naStatic=`<span style="color:#94a3b8;font-family:${FONT};font-size:${CELL_SIZE};font-weight:700">해당없음</span>`;
      const scoreDisplay=isNA?(canEdit?naEditable:naStatic):scorePill;
      // 분석 / 솔루션 셀 — 관리자 인라인 수정 (빈 값은 완전 공백)
      const escCell=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const mkEditable=(value,field)=>{
        const raw=escCell(value);
        if(!canEdit) return raw;
        // contenteditable 자체는 stopPropagation 하지 않음.
        // → tbody의 이벤트 위임(handleTsRowClick)에서 contenteditable 타겟일 때 modal open 건너뛰도록 처리
        return `<span contenteditable="true" onfocus="this.style.background='#fffbeb';this.style.outline='1px dashed #f59e0b';this.style.outlineOffset='1px'" onblur="this.style.background='transparent';this.style.outline='none';saveSubScoreEdit('${srcWhich}',${ts._subIdx},'${field}',this.textContent)" style="display:block;width:100%;min-height:1.4em;cursor:text;border-radius:4px;padding:2px 4px">${raw}</span>`;
      };
      // data-ts-globalidx = sub_scores 전역 인덱스 (카테고리 문자열 매칭 실패 문제 회피)
      return `<tr data-ts-which="${srcWhich}" data-ts-globalidx="${ts._subIdx}" data-ts-idx="${idx}" style="background:${rowBg};cursor:pointer;transition:background .15s ease" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='${rowBg}'">
        <td style="${tdNowrap}">${ts.category||''}</td>
        <td style="${tdNowrap}">${ts.item||''}</td>
        <td style="${tdWrap}">${ts.criteria||''}</td>
        <td style="${tdNowrap};text-align:center">${isNA?'':(ts.maxScore||5)}</td>
        <td style="${tdNowrap};text-align:center">${scoreDisplay}</td>
        <td style="${tdNowrap};text-align:center">${ts.t||''}</td>
        <td style="${tdWrap}">${mkEditable(ts.text,'analysis')}</td>
        <td style="${tdWrap}">${mkEditable(ts.solution,'solution')}</td>
      </tr>`;}).join('');
  // 헤더 테이블(스크롤 밖) + 본문 래퍼(스크롤 안) 분리
  // → 스크롤바가 헤더 아래부터만 표시됨
  return `<div style="display:flex;flex-direction:column;max-height:520px">
    <table style="${tableStyle};flex-shrink:0">
      ${colgroupHtml}
      <thead>
        <tr>
          <th style="${thStyle('left')}">대항목</th>
          <th style="${thStyle('left')}">세부항목</th>
          <th style="${thStyle('left')}">평가 기준</th>
          <th style="${thStyle('center')}">배점</th>
          <th style="${thStyle('center')}">점수</th>
          <th style="${thStyle('center')}">시점</th>
          <th style="${thStyle('left')}">분석</th>
          <th style="${thStyle('left')}">솔루션</th>
        </tr>
      </thead>
    </table>
    <div style="overflow:auto;flex:1;min-height:0">
      <table style="${tableStyle}">
        ${colgroupHtml}
        <tbody onclick="handleTsRowClick(event)">${bodyRows}</tbody>
      </table>
    </div>
  </div>`;
}
// 평가 항목별 피드백 — 행 클릭 위임 핸들러
// (개별 행에 onclick 문자열 바인딩 대신 tbody에 하나만 걸어서 escaping 이슈 제거 + contenteditable 감지)
function handleTsRowClick(event){
  // 편집 가능 요소 클릭은 무시 (관리자 편집 중일 때 modal 열리지 않도록)
  if(event.target.closest('[contenteditable="true"]')) return;
  const tr=event.target.closest('tr[data-ts-which]');
  if(!tr) return;
  const which=tr.dataset.tsWhich;
  const globalIdx=parseInt(tr.dataset.tsGlobalidx,10);
  const idx=parseInt(tr.dataset.tsIdx,10);
  // 전역 인덱스로 sub_score 직접 조회 → 카테고리/세부항목 재계산 → modal 호출
  const raw=which==='ai'?window._lastVertexResult?.ai:window._lastVertexResult?.crit;
  if(!isNaN(globalIdx)&&raw?.sub_scores?.[globalIdx]){
    const active=raw.sub_scores[globalIdx];
    const cat=active.category||'';
    const itemsInCat=raw.sub_scores.filter(s=>(s.category||'')===cat);
    const relIdx=itemsInCat.indexOf(active);
    if(relIdx>=0 && typeof openSubItemVideoModal==='function'){
      openSubItemVideoModal(which,cat,relIdx);
      return;
    }
  }
  // 폴백: 타임스탬프 모달
  if(!isNaN(idx) && typeof openTimestampModal2==='function'){
    openTimestampModal2(idx);
  }
}

// 레이더 차트 SVG 공통
function drawRadarSVG(items,opts){
  const clickable=opts?.clickable||false;
  const which=opts?.which||'crit';
  const n=items.length,cx=250,cy=210,maxR=140;
  const angles=Array.from({length:n},(_,i)=>-Math.PI/2+(2*Math.PI*i/n));
  const toXY=(a,r)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
  let svg='';
  [20,40,60,80,100].forEach(pct=>{const r=maxR*pct/100;const pts=angles.map(a=>toXY(a,r).join(',')).join(' ');svg+=`<polygon points="${pts}" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="1"/>`;if(pct%40===0) svg+=`<text x="${cx+4}" y="${cy-r+4}" fill="var(--t3)" font-size="10">${pct}</text>`;});
  angles.forEach(a=>{const [x,y]=toXY(a,maxR);svg+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(0,0,0,.06)" stroke-width="1"/>`;});
  const pts=items.map((d,i)=>{const p=d.max?d.score/d.max:d.score/100;return toXY(angles[i],maxR*p).join(',');}).join(' ');
  svg+=`<polygon points="${pts}" fill="rgba(220,38,38,.12)" stroke="#dc2626" stroke-width="2.5"/>`;
  items.forEach((d,i)=>{const p=d.max?d.score/d.max:d.score/100;const [x,y]=toXY(angles[i],maxR*p);svg+=`<circle cx="${x}" cy="${y}" r="5" fill="#dc2626" stroke="#fff" stroke-width="2"/>`;});
  items.forEach((d,i)=>{
    const [x,y]=toXY(angles[i],maxR+28);
    const lines=(d.name||'').split('\n');
    const safeCat=(d.name||'').replace(/'/g,'&#39;').replace(/\n/g,' ');
    const clickAttr=clickable?` style="cursor:pointer" onclick="openCategoryRadar('${which}','${safeCat}')"`:'';
    const underline=clickable?` text-decoration="underline"`:'';
    lines.forEach((l,li)=>{
      svg+=`<text x="${x}" y="${y+li*14-((lines.length-1)*7)}" text-anchor="middle" fill="var(--t1)" font-size="11" font-weight="700"${underline}${clickAttr}>${l}</text>`;
    });
  });
  return svg;
}

// 대항목 클릭 → 세부항목 달성도 미니 레이더 팝업
function openCategoryRadar(which,categoryName){
  const raw=which==='ai'?window._lastVertexResult?.ai:window._lastVertexResult?.crit;
  if(!raw||!raw.sub_scores?.length){alert('평가 데이터가 없습니다.');return;}
  const items=raw.sub_scores.filter(s=>(s.category||'').trim()===categoryName.trim());
  if(!items.length){alert('"'+categoryName+'" 세부항목이 없습니다.');return;}
  const radarItems=items.map(s=>({name:s.sub_item||'', score:s.score||0, max:s.max||1}));
  const totalScore=items.reduce((a,s)=>a+(s.score||0),0);
  const totalMax=items.reduce((a,s)=>a+(s.max||0),0);
  const pct=totalMax>0?Math.round(totalScore/totalMax*100):0;
  const levelColor={good:'#10b981',normal:'#f59e0b',bad:'#ef4444',na:'#9ca3af'};
  const levelLabel={good:'잘함',normal:'보통',bad:'미흡',na:'해당없음'};
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='cat-radar-overlay';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;padding:22px;max-width:860px;width:92vw;max-height:88vh;overflow-y:auto;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div>
        <div style="font-size:11px;color:var(--t3);font-weight:600">${which==='ai'?'AI 독자 분석':'교육맞춤평가'} · 대항목 세부 보기</div>
        <div style="font-size:17px;font-weight:900;margin-top:2px">${categoryName}</div>
      </div>
      <button style="border:none;background:none;cursor:pointer;font-size:22px;color:var(--t3)" onclick="this.closest('.overlay').remove()">✕</button>
    </div>
    <div style="font-size:12px;color:var(--t2);margin-bottom:14px">총점: <strong style="color:#10b981">${totalScore}/${totalMax}점 (${pct}%)</strong> · 세부항목 ${items.length}개</div>
    <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px;align-items:stretch;margin-bottom:14px">
      <div style="border:1px solid var(--bdr);border-radius:12px;padding:14px;display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 500 440" style="width:100%;max-width:460px;height:auto">${drawRadarSVG(radarItems)}</svg>
      </div>
      <div style="border:1px solid var(--bdr);border-radius:12px;padding:20px;display:flex;flex-direction:column">
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
        ${radarItems.map(c=>{const p=c.max>0?Math.round(c.score/c.max*100):0;const cc=scoreColorFromRatio(p/100);return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;max-width:540px;margin-left:auto;margin-right:auto;width:100%">
          <span style="font-size:12px;font-weight:700;width:140px;flex-shrink:0">${c.name}</span>
          <div style="flex:1;height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden;min-width:0"><div style="height:100%;width:${p}%;background:${cc};border-radius:4px"></div></div>
          <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:10.5px;font-weight:800;background:${cc};color:#fff;min-width:46px;text-align:center;flex-shrink:0">${p}%</span>
        </div>`;}).join('')}
        </div>
      </div>
    </div>
    <div style="border:1px solid var(--bdr);border-radius:12px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead style="background:#f8f9fa">
          <tr>
            <th style="padding:8px;text-align:left;width:140px">세부항목</th>
            <th style="padding:8px;text-align:left">평가기준</th>
            <th style="padding:8px;text-align:center;width:70px">점수</th>
            <th style="padding:8px;text-align:center;width:80px">판정</th>
            <th style="padding:8px;text-align:center;width:100px">시점</th>
            <th style="padding:8px;text-align:left">분석/솔루션</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((s,si)=>{const safeCat=categoryName.replace(/'/g,"\\'");return `<tr style="border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''" onclick="openSubItemVideoModal('${which}','${safeCat}',${si})">
            <td style="padding:8px;font-weight:600;color:var(--blue)">${s.sub_item||'-'}</td>
            <td style="padding:8px;color:var(--t2)">${s.criterion||'-'}</td>
            <td style="padding:8px;text-align:center;font-weight:700">${s.score||0}/${s.max||0}${typeof renderLevelScoreTag==='function'?renderLevelScoreTag(s):''}</td>
            <td style="padding:8px;text-align:center"><span style="display:inline-block;padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;background:${levelColor[s.level]||'#eee'};color:#fff;white-space:nowrap">${levelLabel[s.level]||s.level||'-'}</span></td>
            <td style="padding:8px;text-align:center;font-size:10px;color:var(--t3)">${s.timestamp||'-'}</td>
            <td style="padding:8px;color:var(--t2);line-height:1.5">
              ${s.analysis?`<div style="margin-bottom:4px">${s.analysis}</div>`:''}
              ${s.level!=='good'&&s.solution?`<div style="padding:5px 8px;background:rgba(239,68,68,.06);border-left:2px solid #ef4444;border-radius:3px;font-size:10px"><strong style="color:#ef4444">솔루션:</strong> ${s.solution}</div>`:''}
            </td>
          </tr>`;}).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

// 타임스탬프 클릭 → 영상 해당 시간으로 이동
async function generateFullAnalysis(title, studentCount, savedTimestamps, youtubeUrl){
  const videoInfo=youtubeUrl?`YouTube URL: ${youtubeUrl}`:'업로드된 영상';
  const tsInfo=savedTimestamps.length
    ?`기존 타임스탬프:\n${savedTimestamps.map(ts=>`${ts.t} [${ts.type}] ${ts.text}`).join('\n')}`
    :'타임스탬프 없음';

  const prompt=`당신은 interbiz 현장강사 역량 평가 AI입니다. 아래 강의 영상 정보를 기반으로 정밀 분석해주세요.

영상 제목: ${title}
교육생 인원: ${studentCount}명
영상 정보: ${videoInfo}
${tsInfo}

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "criteriaScores": [{"name":"발성 및 전달력","score":0,"max":20},{"name":"내용 전문성","score":0,"max":25},{"name":"판서 및 자료","score":0,"max":15},{"name":"수강생 상호작용","score":0,"max":20},{"name":"시간 관리","score":0,"max":10},{"name":"마무리 및 요약","score":0,"max":10}],
  "criteriaSummary": "교육맞춤평가 종합 평가 한줄",
  "overallScore": 0,
  "focusScore": 0,
  "overallComment": "강의 구성력 코멘트",
  "focusComment": "수강생 집중도 코멘트",
  "habits": [{"word":"반복어","count":0}],
  "decibel": 0,
  "decibelStatus": "적정 또는 조정 필요",
  "tempo": 0,
  "tempoStatus": "적정 또는 조정 필요",
  "engagementGaps": [0,0,0,0],
  "engagementWarning": "환기 관련 메시지",
  "timestamps": [
    {"t":"mm:ss","type":"good","text":"설명","tags":["태그"]}
  ],
  "solution": "개선 솔루션 4가지 (<br>로 줄바꿈)",
  "scenario": "다음 강의 추천 시나리오 (<br>로 줄바꿈)"
}

타임스탬프는 8~12개, good/bad/tip 골고루.
점수는 현실적으로.
${savedTimestamps.length?'기존 타임스탬프를 참고하여 더 정밀하게 분석하세요.':''}`;

  try {
    // 레거시 영상: 목업 데이터로 대체 (Vertex 분석 미지원)
    throw new Error('legacy-mock');
  } catch(e){
    const mock=generateMockResult(studentCount);
    if(savedTimestamps.length) mock.timestamps=savedTimestamps;
    renderAnalysisResult(mock,true,studentCount);
  }
}

// AI 레이더 기간별 업데이트
window._lastAiRadar=null;
function updateAiRadar(months){
  if(!window._lastAiRadar) return;
  const items=window._lastAiRadar;
  // 기간에 따라 평균 변동 시뮬레이션
  const variance=months==='all'?0:months==='1'?3:months==='3'?5:months==='6'?7:10;
  const avgItems=items.map(d=>({name:d.name,score:Math.max(30,Math.min(100,d.score-variance+Math.floor(Math.random()*variance*2))),max:d.max}));
  const periodLabel=months==='all'?'전체 평균':`${months}개월 평균`;
  el('ai-radar-container').innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
    <div style="text-align:center"><div style="font-size:10px;font-weight:700;color:var(--purple);margin-bottom:4px">내 점수</div>${drawRadarChart(items,'#8b5cf6',340)}</div>
    <div style="text-align:center"><div style="font-size:10px;font-weight:700;color:#E21E26;margin-bottom:4px">${periodLabel}</div>${drawRadarChart(avgItems,'#E21E26',340)}</div>
    <div style="text-align:center"><div style="font-size:10px;font-weight:700;color:var(--t2);margin-bottom:4px">비교</div>${drawRadarChart(items,'#8b5cf6',180,avgItems,'#E21E26','나','평균')}</div>
  </div>`;
}

/* ── Timestamp Modal ── */
let _tsModalVidId=null, _tsModalTsId=null;

function openTimestampModal(timeStr, type, text, tags, tsId, videoUserId){
  const parts=timeStr.split(':');
  const sec=parseInt(parts[0])*60+parseInt(parts[1]||0);

  // 배지
  const badge=el('ts-modal-badge');
  badge.className='ts-badge ts-'+type;
  badge.textContent=type==='good'?'✅ Good':type==='bad'?'⚠️ Bad':'💡 Tip';

  el('ts-modal-title').textContent=timeStr;
  el('ts-modal-time').textContent=timeStr;
  el('ts-modal-content').textContent=text;
  el('ts-modal-tags').innerHTML=(tags||[]).map(t=>`<span class="ts-tag">${t}</span>`).join('');

  // 영상 로드
  if(window._anYtId){
    el('ts-modal-video').innerHTML=`<iframe src="https://www.youtube.com/embed/${window._anYtId}?autoplay=1&start=${sec}" allowfullscreen allow="autoplay"></iframe>`;
  } else {
    const vid=document.getElementById('an-video-el');
    if(vid){
      el('ts-modal-video').innerHTML=`<video controls autoplay style="width:100%;height:100%"><source src="${vid.querySelector('source')?.src||vid.src}"></video>`;
      setTimeout(()=>{const v=el('ts-modal-video').querySelector('video');if(v){v.currentTime=sec;v.play();}},100);
    } else {
      el('ts-modal-video').innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.4)">영상 없음</div>`;
    }
  }

  // 수정 권한 (본인 또는 관리자)
  _tsModalTsId=tsId;
  const canEdit=CU&&(CU.isAdmin||(videoUserId&&CU.id===videoUserId));
  el('ts-modal-edit-btn').style.display=canEdit?'':'none';
  el('ts-modal-edit').style.display='none';

  el('ts-modal-overlay').classList.add('show');
}

function openTimestampEdit(){
  el('ts-modal-edit-text').value=el('ts-modal-content').textContent;
  el('ts-modal-edit').style.display='';
}

async function saveTimestampEdit(){
  const newText=el('ts-modal-edit-text').value.trim();
  if(!newText) return;
  if(_tsModalTsId){
    await dbUpdateTimestamp(_tsModalTsId,newText);
    el('ts-modal-content').textContent=newText;
  }
  el('ts-modal-edit').style.display='none';
  alert('수정되었습니다.');
}

function openTimestampModal2(idx){
  const stamps=window._anTimestamps||[];
  if(!stamps[idx]) return;
  const ts=stamps[idx];
  const _vidUserId=curVidId?D.videos.find(v=>v.id===curVidId)?.userId:null;

  // 시간 파싱 (mm:ss ~ mm:ss 또는 mm:ss)
  const timeStr=(ts.t||'').split('~')[0].trim();
  const parts=timeStr.split(':');
  const sec=parseInt(parts[0]||0)*60+parseInt(parts[1]||0);

  // 헤더
  el('ts-modal-cat').textContent=ts.category||'—';
  el('ts-modal-title').textContent=ts.item||ts.text?.substring(0,20)||'항목';
  el('ts-modal-cat2').textContent=ts.category||'—';
  el('ts-modal-item').textContent=ts.item||'—';

  // 점수
  const scoreEl=el('ts-modal-score');
  const s=ts.score||5, ms=ts.maxScore||5;
  const sc=ts.type==='good'?'#10b981':ts.type==='bad'?'#E21E26':'#f59e0b';
  const sb=ts.type==='good'?'rgba(16,185,129,.12)':ts.type==='bad'?'rgba(226,30,38,.12)':'rgba(245,158,11,.12)';
  scoreEl.textContent=s+' / '+ms;
  scoreEl.style.background=sb;scoreEl.style.color=sc;

  // 내용
  el('ts-modal-content').textContent=ts.text||'';

  // 솔루션
  const solEl=el('ts-modal-solution');
  if(ts.solution){solEl.textContent=ts.solution;solEl.style.display='';}
  else solEl.style.display='none';

  // 영상
  if(window._anYtId){
    el('ts-modal-video').innerHTML=`<iframe src="https://www.youtube.com/embed/${window._anYtId}?autoplay=1&start=${sec}" allowfullscreen allow="autoplay" style="width:100%;height:100%;border:none"></iframe>`;
  } else {
    const vid=document.getElementById('an-video-el');
    if(vid){
      el('ts-modal-video').innerHTML=`<video controls autoplay style="width:100%;height:100%"><source src="${vid.querySelector('source')?.src||vid.src}"></video>`;
      setTimeout(()=>{const v=el('ts-modal-video').querySelector('video');if(v){v.currentTime=sec;v.play();}},100);
    } else {
      el('ts-modal-video').innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.4)">영상 없음</div>`;
    }
  }

  // 우측 타임라인 (전체 목록, 현재 하이라이트)
  el('ts-modal-timeline').innerHTML=stamps.map((s,i)=>{
    const isActive=i===idx;
    const bg=isActive?'rgba(0,120,200,.06)':'';
    const border=isActive?'border-left:3px solid var(--blue)':'border-left:3px solid transparent';
    const fw=isActive?'font-weight:700':'';
    return `<div style="padding:10px 14px;cursor:pointer;transition:background .15s;${border};background:${bg}" onclick="openTimestampModal2(${i})" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='${bg}'">
      <div style="font-size:11px;color:var(--blue);font-weight:700;margin-bottom:2px">${s.t||''}</div>
      <div style="font-size:12px;color:var(--t1);${fw};line-height:1.5">${s.text||''}</div>
    </div>`;
  }).join('');

  // 현재 항목으로 스크롤
  setTimeout(()=>{
    const tl=el('ts-modal-timeline');
    const items=tl?.children;
    if(items&&items[idx]) items[idx].scrollIntoView({block:'center',behavior:'smooth'});
  },100);

  // 수정 권한
  _tsModalTsId=ts.id||null;
  const canEdit=CU&&(CU.isAdmin||(_vidUserId&&CU.id===_vidUserId));
  el('ts-modal-edit-btn').style.display=canEdit?'':'none';
  el('ts-modal-edit').style.display='none';

  el('ts-modal-overlay').classList.add('show');
}

function seekToTime(timeStr){
  const parts=String(timeStr||'').split(':');
  const sec=(parseInt(parts[0])||0)*60+(parseInt(parts[1])||0);
  // 로컬 video 태그
  const vid=document.getElementById('an-video-el');
  if(vid){ vid.currentTime=sec; vid.play(); return; }
  // YouTube iframe
  const iframe=document.getElementById('an-yt-iframe');
  if(iframe && window._anYtId){
    iframe.src=`https://www.youtube.com/embed/${window._anYtId}?enablejsapi=1&autoplay=1&start=${sec}`;
    return;
  }
  // 본문에 플레이어가 없으면 영상 모달을 해당 시점으로 연다
  openAnVideoAt(timeStr);
}

// 환기 타이밍/반복어 등 범용 — 영상 모달을 특정 시점에 연다
function openAnVideoAt(timeStr){
  const parts=String(timeStr||'').split(':');
  const sec=(parseInt(parts[0])||0)*60+(parseInt(parts[1])||0);
  const modal=document.getElementById('an-video-modal-player');
  const overlay=document.getElementById('an-video-overlay');
  if(!modal||!overlay){alert('영상 플레이어를 찾을 수 없습니다.');return;}
  if(window._anYtId){
    modal.innerHTML=`<iframe src="https://www.youtube.com/embed/${window._anYtId}?autoplay=1&start=${sec}" allowfullscreen allow="autoplay" style="width:100%;height:100%;border:none"></iframe>`;
  } else {
    const uploaded=window._anUploadedVideoUrl;
    const vid=document.getElementById('an-video-el');
    const src=uploaded||vid?.querySelector('source')?.src||vid?.src||'';
    if(!src){alert('영상이 등록되지 않았습니다.');return;}
    modal.innerHTML=`<video controls autoplay playsinline style="width:100%;height:100%"><source src="${src}#t=${sec}"></video>`;
  }
  overlay.classList.add('show');
}

async function autoSaveAnalysis(resultJson){
  if(!CU||CU.email==='admin') return; // 하드코딩 관리자는 자동저장 건너뜀
  try{
    const userId=CU?.id||null;
    if(!userId) return;
    const yt=v('an-youtube').trim();
    const result=await dbCreateVideo({
      userId:userId, title:v('an-title'), youtube:yt,
      date:new Date().toISOString().split('T')[0], duration:'—',
      studentCount:parseInt(v('an-count'))||0, status:'분석완료',
      channel:v('an-channel'), videoType:v('an-product')||'', eduType:v('an-edu-type')||'', solution:'AI 분석 완료',
      eduFileUrl:window._anEduFileUrl||'', productName:window._anProduct||''
    });
    if(result && !result._error && resultJson.timestamps?.length){
      for(const ts of resultJson.timestamps){ await dbAddTimestamp(result.id,ts); }
    }
    if(result?._error){ console.error('autoSaveAnalysis: dbCreateVideo 실패:', result._error); }
    await loadFromDB();
  }catch(e){console.error('auto save error:',e);}
}

async function saveAnalysisVideo(){
  if(!CU){ alert('로그인이 필요합니다.'); return; }
  if(CU.email==='admin'){alert('영상 저장은 강사 본인 계정으로 진행해주세요.');return;}
  const userId=CU?.id||null;
  if(!userId){alert('로그인 계정을 확인할 수 없습니다.');return;}
  const yt=v('an-youtube').trim();
  const result=await dbCreateVideo({
    userId:userId, title:v('an-title'), youtube:yt,
    date:new Date().toISOString().split('T')[0], duration:'—',
    studentCount:parseInt(v('an-count'))||0, status:'분석완료',
    channel:v('an-channel'), videoType:v('an-product')||'', eduType:v('an-edu-type')||'', solution:'AI 분석 완료',
    eduFileUrl:window._anEduFileUrl||'', productName:window._anProduct||''
  });
  if(result?._error){ alert('❌ 영상 저장 실패: '+result._error); return; }
  if(result && window._anTimestamps?.length){
    for(const ts of window._anTimestamps){ await dbAddTimestamp(result.id,ts); }
    await loadFromDB();
  }
  alert('영상과 분석 결과가 저장되었습니다!');
  showPage('page-pick');
}

