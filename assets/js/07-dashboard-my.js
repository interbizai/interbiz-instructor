/* 07-dashboard-my.js — 대시보드 필터 + MY 역량(Lv/레이더) + 시나리오 요소 관리
   (index.html 14324~16548행에서 분리 · 로드 순서 유지 필수) */
/* ════════════════════════════════
   DASHBOARD (page-dashboard 삭제됨 — getFiltered/getFilteredVideos 만 다른 곳에서 재사용)
════════════════════════════════ */
function getFiltered(){
  const getMulti=id=>[...document.getElementById(id)?.selectedOptions||[]].map(o=>o.value).filter(v=>v);
  const chs=getMulti('f-ch'),teams=getMulti('f-team'),names=getMulti('f-name'),products=getMulti('f-product');
  const tenure=v('f-tenure'),dateFilter=v('f-date');
  const now=new Date();

  // 기간 필터: 평가 일시(영상/음성 날짜) 기준
  let dateFrom=null;
  if(dateFilter){
    dateFrom=new Date();
    if(dateFilter==='1w') dateFrom.setDate(dateFrom.getDate()-7);
    else if(dateFilter==='1m') dateFrom.setMonth(dateFrom.getMonth()-1);
    else if(dateFilter==='3m') dateFrom.setMonth(dateFrom.getMonth()-3);
    else if(dateFilter==='6m') dateFrom.setMonth(dateFrom.getMonth()-6);
    else if(dateFilter==='1y') dateFrom.setFullYear(dateFrom.getFullYear()-1);
    else dateFrom=null;
    if(dateFrom) dateFrom.setHours(0,0,0,0);
  }

  // 가전 필터
  let productUserIds=null;
  if(products.length){
    productUserIds=new Set(D.videos.filter(vid=>products.includes((vid.videoType||vid.video_type||'').trim())).map(vid=>vid.userId));
  }

  // 기간 필터: 해당 기간에 영상/음성 평가 또는 등록이 있는 강사
  let dateUserIds=null;
  if(dateFrom){
    const toDate=s=>{if(!s)return new Date(0);const d=new Date(s);d.setHours(0,0,0,0);return d;};
    const vidIds=D.videos.filter(vid=>vid.date&&toDate(vid.date)>=dateFrom).map(vid=>vid.userId);
    const voiceIds=(D.voiceEvals||[]).filter(ve=>{const d=ve.eval_date||ve.created_at;return d&&toDate(d)>=dateFrom;}).map(ve=>ve.user_id);
    const regIds=D.users.filter(u=>u.registered&&toDate(u.registered)>=dateFrom).map(u=>u.id);
    dateUserIds=new Set([...vidIds,...voiceIds,...regIds]);
  }

  return D.users.filter(u=>{
    if(chs.length && !chs.includes((u.orgName||'').trim())) return false;
    if(teams.length && !teams.includes((u.team||'').trim())) return false;
    if(names.length && !names.includes((u.name||'').trim())) return false;
    if(products.length && (!productUserIds || !productUserIds.has(u.id))) return false;
    if(dateFrom && (!dateUserIds || !dateUserIds.has(u.id))) return false;
    if(tenure){
      if(!u.hireDate) return false;
      const hire=new Date(u.hireDate);
      const months=(now.getFullYear()-hire.getFullYear())*12+(now.getMonth()-hire.getMonth());
      if(tenure==='3m' && months>=3) return false;
      if(tenure==='1y' && months>=12) return false;
      if(tenure==='1y+' && months<12) return false;
      if(tenure==='5y+' && months<60) return false;
      if(tenure==='10y+' && months<120) return false;
    }
    return true;
  });
}

function getFilteredVideos(filtered){
  const fIds=new Set(filtered.map(u=>u.id));
  const product=v('f-product'), dateFilter=v('f-date');
  const now=new Date();
  let dateFrom=null;
  if(dateFilter==='this-month') dateFrom=new Date(now.getFullYear(),now.getMonth(),1);
  else if(dateFilter==='3month'){dateFrom=new Date();dateFrom.setMonth(dateFrom.getMonth()-3);}
  else if(dateFilter==='this-year') dateFrom=new Date(now.getFullYear(),0,1);

  return D.videos.filter(vid=>{
    if(!fIds.has(vid.userId)) return false;
    if(product && (vid.videoType||vid.video_type)!==product) return false;
    if(dateFrom && new Date(vid.date)<dateFrom) return false;
    return true;
  });
}

// (제거) renderDashboard — page-dashboard 와 함께 폐지

let evalHistoryRows=[];
let evalSortKey='date';
let evalSortAsc=false;

function renderEvalHistory(filtered){
  const tbody=el('eval-history-tbody');
  if(!tbody) return;
  const fVids=getFilteredVideos(filtered);

  // evaluations 테이블 기반 실제 평가받은 영상만 (평가안기준 또는 AI독자 overall_score > 0)
  const evalScoreMap={};
  (D.evaluations||[]).forEach(e=>{
    if(!e.video_id||!e.overall_score) return;
    if(!evalScoreMap[e.video_id]) evalScoreMap[e.video_id]={};
    evalScoreMap[e.video_id][e.eval_type]=e.overall_score;
  });

  evalHistoryRows=[];
  filtered.forEach(u=>{
    const userVids=fVids.filter(v=>v.userId===u.id);
    userVids.forEach(v=>{
      const sMap=evalScoreMap[v.id];
      if(!sMap) return; // 평가 없는 영상은 제외
      const score=sMap['평가안기준']||sMap['AI독자']||0;
      if(!score) return;
      evalHistoryRows.push({date:v.date||'—',channel:u.channel||'—',eduType:v.eduType||v.edu_type||'—',team:u.team||'—',product:v.videoType||v.video_type||'—',name:u.name,score,userId:u.id,videoId:v.id,hireDate:u.hireDate});
    });
  });
  evalSortKey='date'; evalSortAsc=false;
  renderEvalRows();
}

function sortEvalHistory(key){
  if(evalSortKey===key) evalSortAsc=!evalSortAsc;
  else { evalSortKey=key; evalSortAsc=true; }
  renderEvalRows();
}

function renderEvalRows(){
  const tbody=el('eval-history-tbody');
  if(!tbody) return;
  const now=new Date();
  const getCareerMonths=hd=>hd?Math.round((now-new Date(hd))/(1000*60*60*24*30)):0;
  const getCareer=hd=>{if(!hd)return'—';const m=getCareerMonths(hd);return m<12?m+'개월':Math.floor(m/12)+'년 '+m%12+'개월';};

  const sorted=[...evalHistoryRows].sort((a,b)=>{
    let va,vb;
    if(evalSortKey==='score'){va=a.score;vb=b.score;}
    else if(evalSortKey==='career'){va=getCareerMonths(a.hireDate);vb=getCareerMonths(b.hireDate);}
    else{va=(a[evalSortKey]||'').toString();vb=(b[evalSortKey]||'').toString();}
    if(typeof va==='string') return evalSortAsc?va.localeCompare(vb):vb.localeCompare(va);
    return evalSortAsc?va-vb:vb-va;
  });

  tbody.innerHTML=sorted.map((r,i)=>{
    const scoreColor=r.score>70?'#10b981':'#E21E26';
    const scoreBg=r.score>70?'rgba(16,185,129,.1)':'rgba(226,30,38,.1)';
    // 같은 사람의 이전 점수 찾기
    const sameUser=sorted.filter(x=>x.userId===r.userId&&x.date<r.date);
    const prevScore=sameUser.length?sameUser[0].score:null;
    const trendIcon=prevScore===null?'—':r.score>prevScore
      ?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>'
      :r.score<prevScore?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E21E26" stroke-width="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>'
      :'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>';

    return `<tr style="border-bottom:1px solid rgba(0,0,0,.18);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(0,0,0,.03)'" onmouseout="this.style.background=''" onclick="${r.videoId?'openVideo('+r.videoId+')':'openLecturer('+r.userId+',&quot;page-pick&quot;)'}">
      <td style="padding:10px 12px">${r.date}</td>
      <td style="padding:10px 12px">${r.eduType||'—'}</td>
      <td style="padding:10px 12px">${r.team}</td>
      <td style="padding:10px 12px">${r.product}</td>
      <td style="padding:10px 12px;font-size:12px;font-weight:600">${r.name}</td>
      <td style="padding:10px 12px;text-align:center"><span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:13px;font-weight:800;background:${scoreBg};color:${scoreColor}">${Number(r.score).toFixed(0)}</span></td>
      <td style="padding:10px 12px">${getCareer(r.hireDate)}</td>
      <td style="padding:10px 12px;text-align:center;cursor:pointer" onclick="event.stopPropagation();showTrendChart(${r.userId},'${r.name}')">${trendIcon}</td>
      <td style="padding:10px 12px;text-align:center;white-space:nowrap">
        <span style="font-size:11px;color:var(--blue);font-weight:700;cursor:pointer;margin-right:8px" onclick="event.stopPropagation();${r.videoId?'openVideo('+r.videoId+')':'openLecturer('+r.userId+',&quot;page-pick&quot;)'}">결과</span>
        ${CU?.isAdmin?`<span style="font-size:11px;color:var(--red);font-weight:700;cursor:pointer" onclick="event.stopPropagation();${r.videoId?'adminDeleteVideo('+r.videoId+')':'alert(&quot;영상이 없는 평가입니다&quot;)'}">삭제</span>`
:''}
      </td>
    </tr>`;
  }).join('')||'<tr><td colspan="9" style="padding:20px;text-align:center;color:var(--t3)">평가 내역이 없습니다</td></tr>';
}

/* ── 음성 평가 내역 ── */
let voiceHistoryRows=[];
let voiceSortKey='date';
let voiceSortAsc=false;
let voiceShowAll=false;

function renderVoiceHistory(filtered){
  const tbody=el('voice-history-tbody');
  if(!tbody) return;
  const fIds=new Set(filtered.map(u=>u.id));
  voiceHistoryRows=(D.voiceEvals||[]).filter(ve=>fIds.has(ve.user_id)).map(ve=>{
    const u=D.users.find(x=>x.id===ve.user_id);
    const product=(ve.result_data?.product)||'—';
    return {date:ve.eval_date||ve.created_at?.slice(0,10)||'—',channel:u?.channel||'—',eduType:ve.edu_type||ve.eduType||ve.result_data?.eduType||'—',team:u?.team||'—',product,tone:ve.tone||'—',name:ve.user_name||u?.name||'—',score:ve.score||0,userId:ve.user_id,voiceId:ve.id,hireDate:u?.hireDate};
  });
  voiceSortKey='date';voiceSortAsc=false;voiceShowAll=false;
  renderVoiceRows();
}

function sortVoiceHistory(key){
  if(voiceSortKey===key) voiceSortAsc=!voiceSortAsc;
  else {voiceSortKey=key;voiceSortAsc=true;}
  renderVoiceRows();
}

function showAllVoiceHistory(){voiceShowAll=true;renderVoiceRows();}

function renderVoiceRows(){
  const tbody=el('voice-history-tbody');
  if(!tbody) return;
  const now=new Date();
  const getCareerMonths=hd=>hd?Math.round((now-new Date(hd))/(1000*60*60*24*30)):0;
  const getCareer=hd=>{if(!hd)return'—';const m=getCareerMonths(hd);return m<12?m+'개월':Math.floor(m/12)+'년 '+m%12+'개월';};

  const sorted=[...voiceHistoryRows].sort((a,b)=>{
    let va,vb;
    if(voiceSortKey==='score'){va=a.score;vb=b.score;}
    else if(voiceSortKey==='career'){va=getCareerMonths(a.hireDate);vb=getCareerMonths(b.hireDate);}
    else{va=(a[voiceSortKey]||'').toString();vb=(b[voiceSortKey]||'').toString();}
    if(typeof va==='string') return voiceSortAsc?va.localeCompare(vb):vb.localeCompare(va);
    return voiceSortAsc?va-vb:vb-va;
  });

  const display=voiceShowAll?sorted:sorted.slice(0,5);
  const moreBtn=el('voice-history-more');
  if(moreBtn) moreBtn.style.display=sorted.length>5&&!voiceShowAll?'block':'none';

  const toneColors={'진지하고 엄중한':'var(--t1)','밝고 경쾌한':'var(--blue)','재미있는':'var(--orange)','차분하고 신뢰감 있는':'var(--green)','열정적이고 에너지 넘치는':'var(--red)'};

  tbody.innerHTML=display.map(r=>{
    const scoreColor=r.score>70?'#10b981':'#E21E26';
    const scoreBg=r.score>70?'rgba(16,185,129,.1)':'rgba(226,30,38,.1)';
    const tc=toneColors[r.tone]||'var(--t3)';
    // 추세 그래프 (같은 사람의 이전 점수)
    const sameUser=sorted.filter(x=>x.userId===r.userId&&x.date<r.date);
    const prevScore=sameUser.length?sameUser[0].score:null;
    const trendIcon=prevScore===null?'—':r.score>prevScore
      ?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>'
      :r.score<prevScore?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E21E26" stroke-width="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>'
      :'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>';

    return `<tr style="border-bottom:1px solid rgba(0,0,0,.18);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(0,0,0,.03)'" onmouseout="this.style.background=''" onclick="openVoiceResult(${r.voiceId})">
      <td style="padding:10px 12px">${r.date}</td>
      <td style="padding:10px 12px">${r.eduType||'—'}</td>
      <td style="padding:10px 12px">${r.team}</td>
      <td style="padding:10px 12px">${r.product}</td>
      <td style="padding:10px 12px;font-size:12px;font-weight:600">${r.name}</td>
      <td style="padding:10px 12px;text-align:center"><span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:13px;font-weight:800;background:${scoreBg};color:${scoreColor}">${Number(r.score).toFixed(0)}</span></td>
      <td style="padding:10px 12px">${getCareer(r.hireDate)}</td>
      <td style="padding:10px 12px">${r.tone}</td>
      <td style="padding:10px 12px;text-align:center" onclick="event.stopPropagation();showVoiceTrendChart(${r.userId},'${r.name}')">${trendIcon}</td>
      <td style="padding:10px 12px;text-align:center;white-space:nowrap">
        <span style="font-size:11px;color:var(--blue);font-weight:700;cursor:pointer;margin-right:8px" onclick="event.stopPropagation();openVoiceResult(${r.voiceId})">결과</span>
        ${CU?.isAdmin?`<span style="font-size:11px;color:var(--red);font-weight:700;cursor:pointer" onclick="event.stopPropagation();adminDeleteVoice(${r.voiceId})">삭제</span>`
:''}
      </td>
    </tr>`;
  }).join('')||'<tr><td colspan="10" style="padding:20px;text-align:center;color:var(--t3)">음성 평가 내역이 없습니다</td></tr>';
}

function showTrendChart(userId,name){
  el('trend-title').textContent=name+' 점수 추이';
  const userRows=evalHistoryRows.filter(r=>r.userId===userId).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  if(!userRows.length) return;

  const canvas=el('trend-chart');
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#f8f9fa';ctx.fillRect(0,0,W,H);

  const scores=userRows.map(r=>r.score);
  const maxS=Math.max(...scores,100);
  const minS=Math.min(...scores,0);
  const range=maxS-minS||1;
  const pad={t:20,b:30,l:40,r:20};
  const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;

  // 격자
  ctx.strokeStyle='rgba(0,0,0,.06)';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=pad.t+ch*(1-i/4);
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    ctx.fillStyle='var(--t3)';ctx.font='10px sans-serif';ctx.textAlign='right';
    ctx.fillText(Math.round(minS+(range*i/4)),pad.l-6,y+3);
  }

  // 선 그래프
  if(scores.length>1){
    ctx.beginPath();
    ctx.strokeStyle='#0078C8';ctx.lineWidth=2.5;ctx.lineJoin='round';
    scores.forEach((s,i)=>{
      const x=pad.l+(cw*i/(scores.length-1));
      const y=pad.t+ch*(1-(s-minS)/range);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // 면적
    ctx.lineTo(pad.l+cw,pad.t+ch);
    ctx.lineTo(pad.l,pad.t+ch);
    ctx.closePath();
    ctx.fillStyle='rgba(0,120,200,.08)';ctx.fill();

    // 점
    scores.forEach((s,i)=>{
      const x=pad.l+(cw*i/(scores.length-1));
      const y=pad.t+ch*(1-(s-minS)/range);
      ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#0078C8';ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
    });
  }

  // X축 날짜
  ctx.fillStyle='#718096';ctx.font='10px sans-serif';ctx.textAlign='center';
  userRows.forEach((r,i)=>{
    const x=pad.l+(scores.length>1?cw*i/(scores.length-1):cw/2);
    ctx.fillText(r.date?.slice(5)||'',x,H-8);
  });

  // 상세
  const latest=scores[scores.length-1];
  const first=scores[0];
  const diff=latest-first;
  el('trend-details').innerHTML=`
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div>최초: <strong>${first}점</strong></div>
      <div>최근: <strong>${latest}점</strong></div>
      <div>변화: <strong style="color:${diff>0?'#10b981':diff<0?'#E21E26':'var(--t3)'}">${diff>0?'+':''}${diff}점</strong></div>
      <div>평가 횟수: <strong>${scores.length}회</strong></div>
    </div>`;

  el('trend-overlay').classList.add('show');
}

function showVoiceTrendChart(userId,name){
  el('trend-title').textContent=name+' 음성 점수 추이';
  const userRows=voiceHistoryRows.filter(r=>r.userId===userId).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  if(!userRows.length) return;

  const canvas=el('trend-chart');
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#f8f9fa';ctx.fillRect(0,0,W,H);

  const scores=userRows.map(r=>r.score);
  const maxS=Math.max(...scores,100);
  const minS=Math.min(...scores,0);
  const range=maxS-minS||1;
  const pad={t:20,b:30,l:40,r:20};
  const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;

  ctx.strokeStyle='rgba(0,0,0,.06)';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=pad.t+ch*(1-i/4);
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    ctx.fillStyle='var(--t3)';ctx.font='10px sans-serif';ctx.textAlign='right';
    ctx.fillText(Math.round(minS+(range*i/4)),pad.l-6,y+3);
  }

  if(scores.length>1){
    ctx.beginPath();ctx.strokeStyle='#8b5cf6';ctx.lineWidth=2.5;ctx.lineJoin='round';
    scores.forEach((s,i)=>{
      const x=pad.l+(cw*i/(scores.length-1));
      const y=pad.t+ch*(1-(s-minS)/range);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.lineTo(pad.l+cw,pad.t+ch);ctx.lineTo(pad.l,pad.t+ch);ctx.closePath();
    ctx.fillStyle='rgba(139,92,246,.08)';ctx.fill();
    scores.forEach((s,i)=>{
      const x=pad.l+(cw*i/(scores.length-1));
      const y=pad.t+ch*(1-(s-minS)/range);
      ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#8b5cf6';ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
    });
  }

  ctx.fillStyle='#718096';ctx.font='10px sans-serif';ctx.textAlign='center';
  userRows.forEach((r,i)=>{
    const x=pad.l+(scores.length>1?cw*i/(scores.length-1):cw/2);
    ctx.fillText(r.date?.slice(5)||'',x,H-8);
  });

  const latest=scores[scores.length-1], first=scores[0], diff=latest-first;
  el('trend-details').innerHTML=`
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div>최초: <strong>${first}점</strong></div>
      <div>최근: <strong>${latest}점</strong></div>
      <div>변화: <strong style="color:${diff>0?'#10b981':diff<0?'#E21E26':'var(--t3)'}">${diff>0?'+':''}${diff}점</strong></div>
      <div>평가 횟수: <strong>${scores.length}회</strong></div>
    </div>`;
  el('trend-overlay').classList.add('show');
}

function renderRanking(filtered){
  const rankArea=el('ranking-area');
  if(!rankArea) return;

  // 1. 개인 종합 랭킹 (영상 평균 점수 기준)
  const fVids=getFilteredVideos(filtered);
  const fIds=new Set(filtered.map(u=>u.id));
  const personalWithAvg=filtered.map(u=>{
    const userVids=fVids.filter(v=>v.userId===u.id);
    if(!userVids.length) return {...u, avgScore:0, vidCount:0};
    const scores=userVids.map(v=>{
      const goodCount=(v.timestamps||[]).filter(t=>t.type==='good').length;
      return goodCount*10+(v.timestamps||[]).length*3;
    });
    return {...u, avgScore:scores.reduce((a,b)=>a+b,0)/scores.length, vidCount:userVids.length};
  });
  const personalRank=[...personalWithAvg].sort((a,b)=>b.avgScore-a.avgScore).slice(0,5);

  // 2. 영상 랭킹 (필터된 영상만)
  const videoRank=fVids.map(v=>{
    const u=filtered.find(x=>x.id===v.userId);
    const goodCount=(v.timestamps||[]).filter(t=>t.type==='good').length;
    return {name:u?.name||'—',title:v.title,score:goodCount*10+(v.timestamps||[]).length*3,videoId:v.id,office:u?.office||'',team:u?.team||'',product:v.videoType||v.video_type||''};
  }).sort((a,b)=>b.score-a.score).slice(0,5);

  // 3. 음성 랭킹
  const voiceRank=(D.voiceEvals||[]).filter(ve=>fIds.has(ve.user_id))
    .sort((a,b)=>b.score-a.score).slice(0,5);

  const medals=['🥇','🥈','🥉'];
  const rankColors=['#d4a017','#888','#b87333','var(--t1)','var(--t1)'];
  const medalBg=['rgba(255,215,0,.15)','rgba(192,192,192,.15)','rgba(205,127,50,.12)','rgba(0,0,0,.04)','rgba(0,0,0,.04)'];

  function buildRankCard(title,subtitle,items,topColor){
    const rows=items.map((item,i)=>`
      <div style="display:flex;align-items:center;gap:10px;padding:10px 4px;cursor:pointer;transition:background .15s;border-radius:6px;${i<items.length-1?'border-bottom:1px solid rgba(0,0,0,.18)':''}" onmouseover="this.style.background='rgba(0,120,200,.04)'" onmouseout="this.style.background=''" onclick="${item.videoId?'openVideo('+item.videoId+')':item.voiceId?'openVoiceResult('+item.voiceId+')':item.userId?'openLecturer('+item.userId+',&quot;page-pick&quot;)':''}">
        <div style="width:24px;height:24px;border-radius:50%;background:${medalBg[i]||'rgba(0,0,0,.04)'};display:flex;align-items:center;justify-content:center;font-size:${i<3?'14px':'11px'};font-weight:800;color:${rankColors[i]||'var(--t1)'};flex-shrink:0">${medals[i]||(i+1)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</div>
          ${item.sub?`<div style="font-size:10px;color:var(--t3)">${item.sub}</div>`:''}
        </div>
        <div style="text-align:right"><div style="font-size:14px;font-weight:800;color:${item.score>70?'#10b981':'#E21E26'}">${Number(item.score).toFixed(1)}<span style="font-size:10px;color:var(--t3)">점</span></div>${item.extra?`<div style="font-size:9px;color:var(--t3)">${item.extra}</div>`:''}</div>
      </div>`).join('');

    return `<div style="border:1px solid rgba(0,0,0,.18);border-radius:var(--r2);background:#fff;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:14px;font-weight:800">${title}</div>
        <div style="font-size:11px;color:var(--t3)">${subtitle}</div>
      </div>
      ${rows||'<div style="font-size:12px;color:var(--t3);padding:10px 0;text-align:center">데이터 없음</div>'}
    </div>`;
  }

  const personalItems=personalRank.map(u=>({name:u.name,sub:u.office+' · '+u.team,score:u.avgScore,userId:u.id,extra:u.vidCount?u.vidCount+'건':''}));
  const videoItems=videoRank.map(v=>({name:v.name,sub:`${v.office} · ${v.team}${v.product?' · '+v.product:''} · ${v.title}`,score:v.score,videoId:v.videoId}));
  const voiceItems=voiceRank.map(v=>{const u=D.users.find(x=>x.id===v.user_id);return{name:v.user_name||'—',sub:`${u?.office||''} · ${u?.team||''}${v.tone?' · '+v.tone:''}`,score:v.score,voiceId:v.id};});

  rankArea.innerHTML=
    buildRankCard('개인 종합 랭킹','영상 평균 점수',personalItems,'#0078C8')+
    buildRankCard('영상 랭킹 (TOP 5)','AI 점수',videoItems,'#E21E26')+
    buildRankCard('음성 랭킹 (TOP 5)','AI 점수',voiceItems,'#8b5cf6');
}

function renderAIStrip(filtered){
  try{
    const stripEl=el('ai-strip-text');
    if(!stripEl) return;
    stripEl.innerHTML='';
  }catch(e){}
}

function renderGrid(users){
  el('lect-grid').innerHTML=users.map((u,i)=>{
    const bg=['#E21E26','#0078C8','#10b981','#f59e0b','#8b5cf6','#ec4899'][i%6];
    return `<div class="lect-card neu" onclick="openLecturer(${u.id},'page-pick')" style="animation-delay:${i*.07}s">
      <div class="lect-card-top">
        <div class="lect-photo" style="background:${bg};overflow:hidden">${u.photo?`<img src="${u.photo}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:u.name[0]}</div>
        <div class="lect-info">
          <span class="lect-name">${u.name}</span>
          <div class="lect-meta">${u.office}<span style="margin-left:4px;color:var(--t3)">${u.team}</span></div>
        </div>
      </div>
    </div>`;
  }).join('');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    document.querySelectorAll('.bar-fill').forEach(el=>{ el.style.width=el.dataset.pct+'%'; });
  }));
}

/* ════════════════════════════════
   MY 역량 — Lv / 키워드 / 레이더
════════════════════════════════ */
function getLevelInfo(avgScore,evalCount,totalVids){
  // 점수 기준 레벨
  const scoreLevels=[
    {lv:6,name:'수석',grade:'S+',color:'#7c3aed',minScore:95,minVids:51},
    {lv:5,name:'마스터',grade:'S',color:'#2563eb',minScore:85,minVids:31},
    {lv:4,name:'고급',grade:'A',color:'#10b981',minScore:70,minVids:21},
    {lv:3,name:'중급',grade:'B',color:'#f59e0b',minScore:50,minVids:11},
    {lv:2,name:'초급',grade:'C',color:'#f97316',minScore:30,minVids:4},
    {lv:1,name:'입문',grade:'D',color:'#9ca3af',minScore:0,minVids:0}
  ];
  const vidCount=totalVids||evalCount||0;
  if(!evalCount) return {...scoreLevels[5],level:1};
  // 점수와 영상 수 둘 다 충족하는 최고 레벨
  for(const l of scoreLevels){
    if(avgScore>=l.minScore&&vidCount>=l.minVids) return {...l,level:l.lv};
  }
  return {...scoreLevels[5],level:1};
}

function getAIKeywords(u,vids){
  const kw=[];
  const goodTs=vids.flatMap(v=>(v.timestamps||[]).filter(t=>t.type==='good'));
  const badTs=vids.flatMap(v=>(v.timestamps||[]).filter(t=>t.type==='bad'));
  if(goodTs.length>badTs.length*2) kw.push('우수한 강의력');
  if(vids.length>=5) kw.push('꾸준한 참여');
  if(u.decibel&&u.decibel>=60&&u.decibel<=80) kw.push('안정적 발성');
  if(u.tempo&&u.tempo>=130&&u.tempo<=160) kw.push('적절한 템포');
  const cats=[...new Set(vids.map(v=>v.videoType||v.video_type||'').filter(Boolean))];
  if(cats.length>=3) kw.push('다양한 교육과정');
  if(goodTs.length>=10) kw.push('높은 전문성');
  if(!kw.length) kw.push('성장 중');
  return kw.slice(0,5);
}

// 한줄 시그니처 — 다축(등급·강점·성장·다양성·시그니처 패턴·페르소나) 조합 생성기
// 100명 강사 중복 최소화 위해 유저별 해시로 같은 사람은 항상 같은 문구
function getOneLineEval(u,keywords,avgScore){
  const userId=u?.id;
  if(!userId) return `${u?.name||'—'} 강사`;
  const userVids=(D.videos||[]).filter(v=>v.userId===userId);
  const vidIdSet=new Set(userVids.map(v=>v.id));
  const evalsRaw=(D.evaluations||[]).filter(e=>e.video_id&&vidIdSet.has(e.video_id));
  // 평가안기준 우선 dedupe (점수/역량)
  const byVid={};
  evalsRaw.forEach(e=>{const ex=byVid[e.video_id];const isCrit=e.eval_type==='평가안기준';if(!ex||(isCrit&&ex.eval_type!=='평가안기준')) byVid[e.video_id]=e;});
  const evals=Object.values(byVid).sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
  const scores=evals.map(e=>Number(e.overall_score||0)).filter(s=>s>0);
  if(!scores.length) return `${u.name} 강사의 첫 평가를 기다리고 있습니다`;
  const avg=scores.reduce((a,b)=>a+b,0)/scores.length;

  // 역량별 평균
  const catMap={};
  evals.forEach(e=>{(e.categories||[]).forEach(c=>{const k=c.name||'';if(!k) return;if(!catMap[k]) catMap[k]={s:0,m:0};catMap[k].s+=Number(c.score||0);catMap[k].m+=Number(c.max||0);});});
  const catAvgs=Object.entries(catMap).map(([n,v])=>({name:n,pct:v.m?v.s/v.m*100:0})).sort((a,b)=>b.pct-a.pct);
  const topCat=catAvgs[0];

  // 음성 (AI독자 우선)
  const voiceByVid={};
  evalsRaw.forEach(e=>{const ex=voiceByVid[e.video_id];const isAi=e.eval_type==='AI독자';if(!ex||(isAi&&ex.eval_type!=='AI독자')) voiceByVid[e.video_id]=e;});
  const voiceEvals=Object.values(voiceByVid);
  const dbs=voiceEvals.map(e=>Number(e.decibel||0)).filter(x=>x>0);
  const tps=voiceEvals.map(e=>Number(e.tempo||0)).filter(x=>x>0);
  const habitSum=voiceEvals.reduce((a,e)=>a+(e.habits||[]).reduce((s,h)=>s+(h.count||0),0),0);
  const avgDb=dbs.length?dbs.reduce((a,b)=>a+b,0)/dbs.length:0;
  const avgTp=tps.length?tps.reduce((a,b)=>a+b,0)/tps.length:0;
  const avgHabit=voiceEvals.length?habitSum/voiceEvals.length:0;

  // 다양성
  const cats=[...new Set(userVids.map(v=>v.eduType||v.edu_type||v.videoType||v.video_type||'').filter(Boolean))];

  // 연속 90+
  let streak90=0;for(let i=scores.length-1;i>=0;i--){if(scores[i]>=90) streak90++;else break;}
  // bad 0 연속 (영상 날짜순 최근부터)
  const sortedVids=[...userVids].sort((a,b)=>new Date(a.date||a.created_at||0)-new Date(b.date||b.created_at||0));
  let cleanStreak=0;for(let i=sortedVids.length-1;i>=0;i--){const bad=(sortedVids[i].timestamps||[]).filter(t=>t.type==='bad').length;if(bad===0)cleanStreak++;else break;}
  // 반복어 0회 영상 개수
  const silentCount=voiceEvals.filter(e=>(e.habits||[]).reduce((a,h)=>a+(h.count||0),0)===0).length;

  // ── 최우선 희귀 시그니처 (하나라도 맞으면 단독 반환) ──
  if(scores.some(s=>s>=100)) return `퍼펙트 스코어의 레전드, ${u.name} 강사`;
  if(streak90>=10) return `그랜드마스터 ${u.name} 강사`;
  if(streak90>=5) return `연속 우수의 핵심, ${u.name} 강사`;
  if(catAvgs.length>=5&&catAvgs.every(c=>c.pct>=90)) return `6역량 마스터, ${u.name} 강사`;
  if(cats.length>=5&&avg>=85) return `올라운더 정상권, ${u.name} 강사`;
  if(silentCount>=3) return `무소음 마스터, ${u.name} 강사`;
  if(cleanStreak>=5) return `무결점 장인, ${u.name} 강사`;
  if(catAvgs.length>=5&&catAvgs.every(c=>c.pct>=85)) return `만능형 강사, ${u.name}`;

  // ── 일반 조합 ──
  // 해시 (stable) — userId 문자·숫자 모두 대응
  const strHash=s=>{s=String(s||'');let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h);};
  const hash=strHash(userId)+scores.length*7+Math.round(avg*3);
  const pick=arr=>arr[hash%arr.length];

  // 축1: 등급 타이틀
  const tierKey=avg>=95?'S':avg>=85?'A':avg>=75?'B':avg>=65?'C':'D';
  const tierPools={
    S:['핵심 에이스','탑티어','리더급','정상권','슈퍼스타','전설급','최고의 실력자','선두주자'],
    A:['안정된 베테랑','검증된 실력자','신뢰받는 고수','고정밀','탄탄한 엔진','든든한 기둥','현장의 에이스','믿고 맡기는'],
    B:['믿음직한 실무자','검증된 숙련자','성장 완료된','안정권','실력 탄탄한','자리 잡은','경력 무르익은','꾸준히 해내는'],
    C:['발전 중인 실무자','기본기 탄탄한','성장 가능성 가진','학습 중인','무럭무럭 크는','잠재력 펼치는','한걸음씩 나아가는','기초가 단단한'],
    D:['잠재력 있는 신규','도전 중인 루키','성장 초입의','첫 발을 뗀','씨앗을 심은','출발선에 선','배움 한창인','새내기']
  };
  const tierTitle=pick(tierPools[tierKey]);

  // 축2: 강점 어드젝티브
  const catAdj={
    '발성':['목소리가 또렷한','보이스가 살아있는','전달력이 살아있는','귀에 쏙 박히는'],
    '전문':['지식이 탄탄한','내용 깊이가 있는','전문성이 돋보이는','근거가 명확한'],
    '내용':['지식이 탄탄한','내용 깊이가 있는','전문성이 돋보이는','근거가 명확한'],
    '상호':['소통이 자연스러운','참여를 잘 끌어내는','현장 감각이 있는','분위기를 잘 읽는'],
    '시간':['진행이 매끄러운','시간 운영이 정확한','흐름이 깔끔한','템포 조절이 능숙한'],
    '판서':['자료 활용이 돋보이는','시각 전달이 뛰어난','판서가 깔끔한','보조자료를 잘 쓰는'],
    '자료':['자료 활용이 돋보이는','시각 전달이 뛰어난','판서가 깔끔한','보조자료를 잘 쓰는'],
    '마무리':['마무리가 인상 깊은','정리가 깔끔한','끝맺음이 강력한','핵심 요약이 뚜렷한']
  };
  let strengthTag='';
  if(topCat&&topCat.pct>=70){
    const key=Object.keys(catAdj).find(k=>topCat.name.includes(k));
    if(key) strengthTag=pick(catAdj[key]);
  }
  if(!strengthTag){
    if(avgDb>=78&&avgTp>=150) strengthTag=pick(['에너지 넘치는','현장을 장악하는','몰입감이 폭발하는']);
    else if(avgHabit<=3&&voiceEvals.length>=2) strengthTag=pick(['깔끔한 화법의','단어 선택이 신중한','언어가 정제된']);
    else if(avgTp>=150) strengthTag=pick(['재치 있게 풀어가는','장난기 섞인','친근한 분위기로 이끄는']);
    else if(avgTp>0&&avgTp<=125) strengthTag=pick(['차분하고 또렷한','신뢰감 주는','조곤조곤 설득하는']);
    else if(avgTp>0) strengthTag=pick(['안정된 리듬으로 전달하는','균형 잡힌','편안하게 끌고 가는']);
  }

  // 축3: 성장 상태
  let growthTag='';
  if(scores.length>=3){
    const recent3=scores.slice(-3);
    const prior=scores.slice(0,-3);
    const recentAvg=recent3.reduce((a,b)=>a+b,0)/3;
    const priorAvg=prior.length?prior.reduce((a,b)=>a+b,0)/prior.length:avg;
    const delta=recentAvg-priorAvg;
    if(delta>=8) growthTag=pick(['급상승 중인','눈에 띄게 오르는','폭발적 성장세의']);
    else if(delta>=3) growthTag=pick(['꾸준히 성장하는','우상향 궤도의','계속 나아가는']);
    else if(delta<=-5) growthTag=pick(['기본기를 다지는','호흡을 가다듬는','다음 도약을 준비 중인']);
    else if(hash%3===0) growthTag=pick(['일관성 있는','안정적 궤도의']);
  }

  // 축4: 다양성 (평가 횟수 제외)
  let diversityTag='';
  if(cats.length>=5) diversityTag=pick(['올라운더','다분야 소화형','멀티 필드']);
  else if(cats.length>=3) diversityTag=pick(['여러 분야 소화형','폭넓은 커버리지']);
  else if(cats.length===2) diversityTag='복수 영역에서 활동하는';
  else if(cats.length===1) diversityTag=pick(['특정 분야 집중','스페셜리스트','분야 파고드는']);

  // 축5: 시그니처 패턴 (드물게 가산)
  let sigTag='';
  if(avgHabit<=2&&voiceEvals.length>=5) sigTag='무결점 화법의';
  else if(catAvgs.length>=6&&catAvgs.every(c=>c.pct>=75)) sigTag='균형 잡힌 육각형의';
  else if(scores.length>=3){
    const spread=Math.max(...scores)-Math.min(...scores);
    if(spread<=5) sigTag='일관성 탑의';
  }

  // 축6: 페르소나 (강점 + 스타일 조합)
  let personaTag='';
  const topName=topCat?.name||'';
  if(topCat&&topCat.pct>=80){
    if(topName.includes('상호')&&avgDb>=75) personaTag='현장 열정가';
    else if((topName.includes('전문')||topName.includes('내용'))&&avgTp>0&&avgTp<=135) personaTag='학구파';
    else if(topName.includes('발성')&&avgTp>=150) personaTag='열혈 강사';
    else if(topName.includes('마무리')) personaTag='정리의 달인';
  }

  // 최종 조합 — 길어지지 않게 최대 3개 태그
  const allTags=[strengthTag,growthTag,sigTag,personaTag,diversityTag].filter(Boolean);
  const finalTags=allTags.slice(0,3);
  const prefix=finalTags.join(' · ');
  return prefix?`${prefix} ${tierTitle} ${u.name} 강사`:`${tierTitle} ${u.name} 강사`;
}

// 6대 역량 레이더 차트 렌더링
function renderRadarChart(userId){
  const svgEl=document.getElementById('radar-chart-'+userId);
  if(!svgEl) return;
  const u=D.users.find(x=>x.id===userId);
  if(!u) return;
  const userVids=(D.videos||[]).filter(v=>v.userId===userId);

  // 6대 역량 카테고리 매핑
  const cats6=[
    {name:'교수설계\n및 교수법',keys:['교수법','스토리텔링','학습지파악','강의진행']},
    {name:'내용\n전문성',keys:['전문성','제품기본원리','제품심화']},
    {name:'소통',keys:['상호작용','소통','세일즈','CS']},
    {name:'코칭',keys:['코칭','코칭기본','유형별코칭']},
    {name:'프리젠\n테이션',keys:['판서','프리젠테이션','자료활용']},
    {name:'스피치',keys:['발성','발음','보이스']}
  ];

  // 각 역량별 점수 계산
  let scores6=cats6.map(cat=>{
    let total=0,cnt=0;
    // 기존 점수 체계에서 매칭 (scores가 있을 때만)
    if(u.scores) Object.entries(u.scores).forEach(([k,v])=>{
      if(cat.keys.some(key=>k.includes(key))){total+=v/((u.maxes||{})[k]||1)*100;cnt++;}
    });
    // 영상 평가에서 good/bad 비율로 보정
    const catVids=userVids.filter(v=>{const vt=v.videoType||v.video_type||'';return cat.keys.some(k=>vt.includes(k));});
    if(catVids.length){
      catVids.forEach(v=>{
        const g=(v.timestamps||[]).filter(t=>t.type==='good').length;
        const b=(v.timestamps||[]).filter(t=>t.type==='bad').length;
        total+=Math.min(100,g*15-b*5);cnt++;
      });
    }
    return cnt>0?Math.max(0,Math.min(100,Math.round(total/cnt))):0;
  });
  // 데모 모드: 역량 데이터 없으면 샘플 그래프로 채움 (강사별로 살짝 다르게)
  if(IB_DEMO() && scores6.every(s=>s===0)){
    const base=[88,93,85,82,86,90], off=(_demoHash(u.name||String(userId))%7)-3;
    scores6=base.map(v=>Math.max(60,Math.min(99,v+off)));
  }

  const n=6,cx=200,cy=190,maxR=140;
  const angles=Array.from({length:n},(_,i)=>-Math.PI/2+(2*Math.PI*i/n));
  const toXY=(angle,r)=>[cx+r*Math.cos(angle),cy+r*Math.sin(angle)];

  let svg='';
  // 배경 그리드
  [20,40,60,80,100].forEach(pct=>{
    const r=maxR*pct/100;
    const pts=angles.map(a=>toXY(a,r).join(',')).join(' ');
    svg+=`<polygon points="${pts}" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="1"/>`;
    if(pct%40===0) svg+=`<text x="${cx+4}" y="${cy-r+4}" fill="var(--t3)" font-size="10">${pct}</text>`;
  });
  // 축
  angles.forEach(a=>{
    const [x,y]=toXY(a,maxR);
    svg+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(0,0,0,.06)" stroke-width="1"/>`;
  });
  // 현재 역량 (빨강)
  const dataPts=scores6.map((s,i)=>toXY(angles[i],maxR*s/100).join(',')).join(' ');
  svg+=`<polygon points="${dataPts}" fill="rgba(220,38,38,.12)" stroke="#dc2626" stroke-width="2.5"/>`;
  scores6.forEach((s,i)=>{
    const [x,y]=toXY(angles[i],maxR*s/100);
    svg+=`<circle cx="${x}" cy="${y}" r="5" fill="#dc2626" stroke="#fff" stroke-width="2"/>`;
  });
  // 라벨
  cats6.forEach((cat,i)=>{
    const [x,y]=toXY(angles[i],maxR+30);
    const lines=cat.name.split('\n');
    lines.forEach((line,li)=>{
      svg+=`<text x="${x}" y="${y+li*14-((lines.length-1)*7)}" text-anchor="middle" fill="var(--t1)" font-size="12" font-weight="700">${line}</text>`;
    });
  });
  // 범례
  svgEl.innerHTML=svg;

  // 달성도 바
  const barsEl=document.getElementById('lect-skills-bars-'+userId);
  if(barsEl){
    barsEl.innerHTML='<div style="flex:1;display:flex;flex-direction:column;justify-content:center">'+
      cats6.map((cat,i)=>{const p=scores6[i];const cc=p>=90?'#10b981':p>=70?'#f59e0b':'#ef4444';return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;max-width:560px;margin-left:auto;margin-right:auto;width:100%">
        <span style="font-size:12.5px;font-weight:700;color:var(--t1);width:140px;flex-shrink:0">${cat.name.replace('\n',' ')}</span>
        <div style="flex:1;height:10px;background:#f0f0f0;border-radius:5px;overflow:hidden;min-width:0"><div style="height:100%;width:${p}%;background:${cc};border-radius:5px;transition:width .8s"></div></div>
        <span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:11.5px;font-weight:800;background:${cc};color:#fff;min-width:50px;text-align:center;flex-shrink:0">${p}%</span>
      </div>`;}).join('')+'</div>';
  }
}

function filterLectStats(userId){
  _refreshLectStats(userId);
  renderRadarChartFromEvals(userId);
}

function openLevelDetail(avgScore,evalCount,totalVids){
  const vids=totalVids||evalCount||0;
  const cur=getLevelInfo(avgScore,evalCount,vids);
  const levels=[
    {lv:1,name:'입문',min:0,max:29,minV:0,maxV:3,color:'#9ca3af'},
    {lv:2,name:'초급',min:30,max:49,minV:4,maxV:10,color:'#f97316'},
    {lv:3,name:'중급',min:50,max:69,minV:11,maxV:20,color:'#f59e0b'},
    {lv:4,name:'고급',min:70,max:84,minV:21,maxV:30,color:'#10b981'},
    {lv:5,name:'마스터',min:85,max:94,minV:31,maxV:50,color:'#2563eb'},
    {lv:6,name:'수석',min:95,max:100,minV:51,maxV:100,color:'#7c3aed'}
  ];
  const next=levels.find(l=>l.lv===cur.level+1);
  const scoreGap=next?Math.max(0,(next.min-avgScore).toFixed(1)):0;
  const vidGap=next?Math.max(0,next.minV-vids):0;

  let html=`
    <div style="text-align:center;margin-bottom:20px">
      <div style="display:inline-flex;align-items:center;gap:6px;padding:8px 20px;border-radius:24px;background:${cur.color};color:#fff;font-size:14px;font-weight:800">👑 Lv.${cur.level} ${cur.name}</div>
      <div style="font-size:13px;color:var(--t2);margin-top:10px">평균 점수: <strong style="color:var(--t1)">${avgScore.toFixed(1)}점</strong> · 등록 영상: <strong style="color:var(--t1)">${vids}건</strong></div>
    </div>`;

  if(next){
    const scoreProg=Math.min(100,Math.round(Math.max(0,(avgScore-levels[cur.level-1].min))/(next.min-levels[cur.level-1].min)*100));
    const vidProg=Math.min(100,Math.round(vids/next.minV*100));
    html+=`
    <div style="padding:16px;border-radius:12px;background:rgba(0,120,200,.05);margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--blue);margin-bottom:12px">다음 단계: Lv.${next.lv} ${next.name}</div>
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t2);margin-bottom:4px"><span>점수 (${next.min}점 이상)</span><span>${avgScore.toFixed(1)}/${next.min}</span></div>
        <div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${scoreProg}%;background:${next.color};border-radius:4px"></div>
        </div>
        ${scoreGap>0?`<div style="font-size:10px;color:var(--t3);margin-top:2px">${scoreGap}점 더 필요</div>`:'<div style="font-size:10px;color:var(--green);margin-top:2px">충족</div>'}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t2);margin-bottom:4px"><span>영상 수 (${next.minV}건 이상)</span><span>${vids}/${next.minV}</span></div>
        <div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${vidProg}%;background:${next.color};border-radius:4px"></div>
        </div>
        ${vidGap>0?`<div style="font-size:10px;color:var(--t3);margin-top:2px">${vidGap}건 더 필요</div>`:'<div style="font-size:10px;color:var(--green);margin-top:2px">충족</div>'}
      </div>
    </div>`;
  } else {
    html+=`<div style="padding:16px;border-radius:12px;background:rgba(124,58,237,.06);margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#7c3aed">최고 레벨에 도달하셨습니다!</div>
    </div>`;
  }

  html+=`<div style="font-size:13px;font-weight:800;color:var(--t1);margin-bottom:10px">전체 레벨 기준</div>`;
  html+=levels.map(l=>`
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;${l.lv===cur.level?'background:rgba(0,0,0,.03);border-radius:8px;padding:8px 10px':''}">
      <div style="width:10px;height:10px;border-radius:50%;background:${l.color};flex-shrink:0"></div>
      <div style="font-size:12px;font-weight:${l.lv===cur.level?'800':'500'};color:${l.lv===cur.level?'var(--t1)':'var(--t2)'};flex:1">Lv.${l.lv} ${l.name}</div>
      <div style="font-size:10px;color:var(--t3)">${l.min}~${l.max}점</div>
      <div style="font-size:10px;color:var(--t3)">${l.minV}건+</div>
      ${l.lv===cur.level?'<span style="font-size:10px;font-weight:700;color:var(--blue)">현재</span>':''}
    </div>`).join('');

  document.getElementById('lv-detail-content').innerHTML=html;
  document.getElementById('lv-detail-overlay').classList.add('show');
}

const _DEMO_VIDS=[
  {title:'26년 거점집합교육 냉장고',cat:'거점집합교육',prod:'냉장고',date:'2026-06-12'},
  {title:'26년 구독 연습 정수기',cat:'구독',prod:'정수기',date:'2026-06-10'},
  {title:'26년 현장코칭 스타일러',cat:'현장코칭',prod:'스타일러',date:'2026-06-08'},
  {title:'26년 RP 에어컨',cat:'RP',prod:'에어컨',date:'2026-06-05'},
  {title:'26년 화상 교육 공기청정기',cat:'화상 교육',prod:'공기청정기',date:'2026-06-03'},
  {title:'26년 판경상 식기세척기',cat:'판매경쟁력상황실',prod:'식기세척기',date:'2026-05-30'},
];
function filterCoachingList(userId){
  const catVal=document.getElementById('coaching-cat-filter')?.value||'';
  const prodVal=document.getElementById('coaching-prod-filter')?.value||'';
  let vids=(D.videos||[]).filter(v=>v.userId===userId);
  if(catVal) vids=vids.filter(v=>(v.eduType||v.edu_type||'')===catVal);
  if(prodVal) vids=vids.filter(v=>(v.productName||v.product_name||v.videoType||v.video_type||'').includes(prodVal));
  const listEl=document.getElementById('coaching-vid-list-'+userId);
  if(!listEl) return;
  const row=(title,date,vCat,vProd,onclk)=>`<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onclick="${onclk}">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title||'—'}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">${date||''}${vCat?' · '+vCat:''}${vProd?' · '+vProd:''}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  let html=vids.map(vid=>row(vid.title,vid.date,(vid.eduType||vid.edu_type||vid.videoType||vid.video_type||''),(vid.productName||vid.product_name||''),`openVideo(${vid.id})`)).join('');
  // 데모 모드: 적으면 종류별 샘플 영상으로 채움 (클릭 시 실제 영상 1건이 데모 데이터로 표시)
  if(IB_DEMO() && vids.length<3){
    const realId=(D.videos||[]).find(v=>v.userId===userId)?.id || (D.videos||[])[0]?.id || 0;
    let dv=_DEMO_VIDS.slice();
    if(catVal) dv=dv.map(d=>({...d,cat:catVal}));
    if(prodVal) dv=dv.filter(d=>d.prod.includes(prodVal));
    html+=dv.map(d=>row(d.title,d.date,d.cat,d.prod,realId?`openVideo(${realId})`:'void(0)')).join('');
  }
  listEl.innerHTML=html||'<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">해당 조건의 영상이 없습니다</div>';
  // 영상 건수 갱신 (데모 포함)
  const vcEl=document.getElementById('coaching-vid-count-'+userId);
  if(vcEl){const shown=html?listEl.querySelectorAll(':scope > div').length:0;vcEl.textContent=shown+'건';}
  // 시나리오 목록도 동일 필터 적용
  if(typeof renderUserScenarioList==='function') renderUserScenarioList(userId, catVal, prodVal);
}

// 영상 모달 열기
function _loadAnVideoModal(){
  const modal=document.getElementById('an-video-modal-player');
  if(!modal) return;
  if(window._anYtId){
    modal.innerHTML=`<iframe src="https://www.youtube.com/embed/${window._anYtId}?autoplay=1" allowfullscreen allow="autoplay" style="width:100%;height:100%;border:none"></iframe>`;
    return;
  }
  // 우선순위: 업로드한 Supabase URL → an-video-el 내부 source
  const uploaded=window._anUploadedVideoUrl;
  if(uploaded){
    modal.innerHTML=`<video controls autoplay style="width:100%;height:100%"><source src="${uploaded}"></video>`;
    return;
  }
  const vid=document.getElementById('an-video-el');
  const src=vid?.querySelector('source')?.src||vid?.src||'';
  if(src) modal.innerHTML=`<video controls autoplay style="width:100%;height:100%"><source src="${src}"></video>`;
  else modal.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.4)">영상이 등록되지 않았습니다</div>';
}
document.getElementById('an-video-overlay')?.addEventListener('transitionend',function(){
  if(this.classList.contains('show')) _loadAnVideoModal();
});
const _origOverlayShow=document.getElementById('an-video-overlay');
if(_origOverlayShow){
  const obs=new MutationObserver(()=>{ if(_origOverlayShow.classList.contains('show')) _loadAnVideoModal(); });
  obs.observe(_origOverlayShow,{attributes:true,attributeFilter:['class']});
}
function pauseAnVideo(){
  const modal=document.getElementById('an-video-modal-player');
  if(modal) modal.innerHTML='';
}

function renderMyBadges(userId,avgScore){
  const area=document.getElementById('my-badge-area-'+userId);
  if(!area) return;
  // 교육맞춤평가 카테고리만 (AI독자·누적 제외)
  const allBadges=getAccumulatedBadges(userId).filter(id=>{const c=getBadgeInfo(id).cat;return c==='교육맞춤'||c==='평가안';});
  if(!allBadges.length){area.innerHTML='<span style="font-size:11px;color:var(--t3)">AI 분석 후 뱃지 생성</span>';return;}
  const tierRank={legend:0,platinum:1,gold:2,silver:3,bronze:4};
  const sorted=[...allBadges].sort((a,b)=>(tierRank[getBadgeInfo(a).tier||'silver'])-(tierRank[getBadgeInfo(b).tier||'silver']));
  const shownMax=6;
  const shown=sorted.slice(0,shownMax);
  const rest=allBadges.length-shown.length;
  area.innerHTML=renderBadgePills(shown)
    +(rest>0?`<span style="padding:3px 10px;border-radius:14px;font-size:10px;font-weight:700;background:rgba(0,0,0,.06);color:var(--t2);cursor:pointer;margin-left:4px" onclick="event.stopPropagation();showAllBadges(${userId},${avgScore})">+${rest}</span>`:'');
}

function openScenario(){ showPage('page-scenario'); scInit(); }

// ============================================================
// AI 시나리오 코치 (세계적 가전 판매 강사 시점)
// ============================================================
const SC_DEFAULT_AXES=[
  {id:'numeric',name:'수치 근거',hint:'구체 수치·단위 (예: 0.5℃, 5%, 월 1만원)'},
  {id:'fab',name:'FAB 구조',hint:'특징·장점·이익 구분 설명'},
  {id:'competitor',name:'경쟁사 비교',hint:'타사 대비 우위 시연'},
  {id:'demo',name:'실물 시연',hint:'직접 체험·실물 확인 유도'},
  {id:'metaphor',name:'비유·일상화',hint:'기술용어 → 쉬운 비유'},
  {id:'objection',name:'반론 대응',hint:'고객 의문·거절 처리'},
  {id:'addon',name:'부가 제안',hint:'설치·할부·보증·A/S'}
];
const SC_KEYWORDS={
  numeric:['℃','도','%','원','kg','L','리터','dB','CMH','와트','W','배','시간','분','평','인치','단계','단위','절약','절감'],
  fab:['특징','장점','이익','FAB','기능','효과','혜택','덕분'],
  competitor:['타사','경쟁','비교','대비','A사','B사','vs','반면'],
  demo:['직접','실물','보세요','만져','확인','시연','체험','해보세요','눌러','들어보세요'],
  metaphor:['마치','같이','처럼','비유','이를테면','쉽게','일상','예를','상상'],
  objection:['그런데','하지만','걱정','괜찮','걱정마','믿으셔도','문제없','그래도'],
  addon:['설치','할부','보증','A/S','AS','무상','서비스','배송','무이자']
};

const SC_STATE_KEY='sc_coach_state_v1';
let scState=null;

function scDefaultState(){return{
  step:0,eduType:'',product:'',phase:'',customer:'',store:'',
  eduFiles:[],
  axes:JSON.parse(JSON.stringify(SC_DEFAULT_AXES)),
  draft:'',coaching:null,revised:'',history:[]
};}

function scInit(){
  try{const s=localStorage.getItem(SC_STATE_KEY);if(s)scState=JSON.parse(s);}catch(e){}
  if(!scState) scState=scDefaultState();
  scFillEduTypes();scFillProducts();
  ['eduType','product','phase','customer','store'].forEach(f=>{const el=document.getElementById('sc-'+({eduType:'edu-type',product:'product',phase:'phase',customer:'customer',store:'store'}[f]));if(el&&scState[f]!=null) el.value=scState[f];});
  if(!Array.isArray(scState.eduFiles)) scState.eduFiles=[];
  scRenderEduFiles();
  const ta=document.getElementById('sc-draft');if(ta) ta.value=scState.draft||'';
  // 초안 DB 로드 (다른 PC에서 이어 쓰기)
  scLoadDraftFromDB().then(rec=>{
    if(!rec || typeof rec!=='object') return;
    const dbDraft=String(rec.draft||'');
    const localDraft=String(scState.draft||'');
    if(dbDraft && (!localDraft || dbDraft.length > localDraft.length+10)){
      const ok=!localDraft || confirm('다른 PC에서 작성 중이던 초안이 있습니다 ('+dbDraft.length+'자). 불러올까요?');
      if(ok){
        scState.draft=dbDraft;
        ['eduType','product','phase','customer','store'].forEach(k=>{if(rec[k]!=null) scState[k]=rec[k];});
        scSaveState();
        const ta2=document.getElementById('sc-draft'); if(ta2) ta2.value=dbDraft;
        const cnt=document.getElementById('sc-draft-count'); if(cnt) cnt.textContent=dbDraft.length+'자';
        ['eduType','product','phase','customer','store'].forEach(f=>{const el=document.getElementById('sc-'+({eduType:'edu-type',product:'product',phase:'phase',customer:'customer',store:'store'}[f]));if(el&&scState[f]!=null) el.value=scState[f];});
        scLoadAxesFromDB().then(()=>{scRenderAxes();scUpdateDraftAxes&&scUpdateDraftAxes();});
      }
    }
  });
  // axes — DB에서 로드 (관리자 기본값 + 사용자 커스텀)
  scLoadAxesFromDB().then(()=>{ scRenderAxes(); scUpdateDraftAxes&&scUpdateDraftAxes(); });
  // 관리자/부관리자만 "기본값으로 저장" 버튼 노출
  const adminBtn=document.getElementById('sc-admin-default-btn');
  if(adminBtn) adminBtn.style.display=(CU?.isAdmin||CU?.isSubAdmin)?'inline-flex':'none';
  scRender();
}

function scSaveState(){try{localStorage.setItem(SC_STATE_KEY,JSON.stringify(scState));}catch(e){}}
function scSaveField(k,v){
  scState[k]=v;scSaveState();
  // 교육유형 변경 시 → 해당 유형 axes 재로딩 (관리자가 세팅한 기본값으로 자동 갱신)
  if(k==='eduType'){
    scLoadAxesFromDB().then(()=>{scRenderAxes();scUpdateDraftAxes&&scUpdateDraftAxes();});
  }
  // 작업 흐름 필드 변경 시 DB 백업 (다기기 동기화)
  if(['eduType','product','phase','customer','store'].includes(k)){
    if(_scDraftDebounceTimer) clearTimeout(_scDraftDebounceTimer);
    _scDraftDebounceTimer=setTimeout(()=>{
      scSaveDraftToDB(scState.draft||'').catch(()=>{});
    },1500);
  }
}

// ────────────────────────────────────────────
// DB 연동 (scenario_axes_config) — 다기기 동기화
// ────────────────────────────────────────────
async function scLoadAxesFromDB(){
  if(!window.sb){scState.axes=JSON.parse(JSON.stringify(SC_DEFAULT_AXES));return;}
  const eduType=scState.eduType||'';
  const userScope=CU?.id?('user_'+CU.id):'';
  const localAxesFromState=Array.isArray(scState.axes)?scState.axes:null;
  try{
    const{data,error}=await sb.from('scenario_axes_config').select('scope,edu_type,axes')
      .or(`scope.eq.default,scope.eq.${userScope||'__none__'}`);
    if(error){
      const msg=(error.message||'').toLowerCase();
      if(msg.includes('relation')||msg.includes('does not exist')||msg.includes('schema cache')){
        console.warn('scenario_axes_config 테이블 없음 — DB 마이그레이션 미실행');
        if(localAxesFromState && localAxesFromState.length){scState.axes=JSON.parse(JSON.stringify(localAxesFromState));}
        else scState.axes=JSON.parse(JSON.stringify(SC_DEFAULT_AXES));
        return;
      }
      throw error;
    }
    const rows=data||[];
    const pick=(scope,et)=>rows.find(r=>r.scope===scope&&(r.edu_type||'')===(et||''));
    let chosen=null;
    if(userScope){
      chosen=pick(userScope,eduType)||pick(userScope,'')||null;
    }
    if(!chosen) chosen=pick('default',eduType)||pick('default','')||null;
    if(chosen && Array.isArray(chosen.axes) && chosen.axes.length){
      scState.axes=JSON.parse(JSON.stringify(chosen.axes));
    } else {
      // DB 비어 있음 — localStorage 커스텀이 있으면 1회 자동 마이그레이션
      const isCustomized=localAxesFromState && localAxesFromState.length &&
        JSON.stringify(localAxesFromState)!==JSON.stringify(SC_DEFAULT_AXES);
      if(isCustomized && userScope){
        scState.axes=JSON.parse(JSON.stringify(localAxesFromState));
        scSaveUserAxesToDB().catch(()=>{});
      } else {
        scState.axes=JSON.parse(JSON.stringify(SC_DEFAULT_AXES));
      }
    }
  }catch(e){
    console.warn('scLoadAxesFromDB:',e?.message||e);
    if(localAxesFromState && localAxesFromState.length) scState.axes=JSON.parse(JSON.stringify(localAxesFromState));
    else scState.axes=JSON.parse(JSON.stringify(SC_DEFAULT_AXES));
  }
}

async function scSaveUserAxesToDB(){
  if(!window.sb||!CU?.id) return {ok:false,error:'로그인 필요'};
  const scope='user_'+CU.id;
  const edu_type=scState.eduType||'';
  const payload={scope,edu_type,org_name:D.activeOrg||'',axes:scState.axes||[],updated_by:CU?.name||'',updated_at:new Date().toISOString()};
  try{
    const q=await sb.from('scenario_axes_config').select('id').eq('scope',scope).eq('edu_type',edu_type).limit(1);
    if(q.error) throw q.error;
    const exist=(q.data||[])[0];
    let r;
    if(exist) r=await sb.from('scenario_axes_config').update(payload).eq('id',exist.id);
    else r=await sb.from('scenario_axes_config').insert(payload);
    if(r.error) throw r.error;
    return {ok:true};
  }catch(e){
    const msg=(e.message||'').toLowerCase();
    if(msg.includes('relation')||msg.includes('does not exist')||msg.includes('schema cache')){
      return {ok:false,error:'DB 마이그레이션 미실행 (scenario_axes_config 테이블 없음)'};
    }
    return {ok:false,error:e.message||String(e)};
  }
}

async function scSaveDefaultAxesToDB(eduType,axes){
  if(!window.sb) return {ok:false,error:'sb 없음'};
  const scope='default';
  const edu_type=eduType||'';
  const payload={scope,edu_type,org_name:D.activeOrg||'',axes:axes||[],updated_by:CU?.name||'admin',updated_at:new Date().toISOString()};
  try{
    const q=await sb.from('scenario_axes_config').select('id').eq('scope',scope).eq('edu_type',edu_type).limit(1);
    if(q.error) throw q.error;
    const exist=(q.data||[])[0];
    let r;
    if(exist) r=await sb.from('scenario_axes_config').update(payload).eq('id',exist.id);
    else r=await sb.from('scenario_axes_config').insert(payload);
    if(r.error) throw r.error;
    return {ok:true};
  }catch(e){
    const msg=(e.message||'').toLowerCase();
    if(msg.includes('relation')||msg.includes('does not exist')||msg.includes('schema cache')){
      return {ok:false,error:'DB 마이그레이션 미실행 (scenario_axes_config 테이블 없음)'};
    }
    return {ok:false,error:e.message||String(e)};
  }
}

function scFillEduTypes(){
  const sel=document.getElementById('sc-edu-type');if(!sel) return;
  let types=(window.getEduTypes?getEduTypes():[])||[];
  if(!types.length) types=['판매경쟁력상황실','신입교육','심화교육','현장실습','판매자세교육','현장직무교육'];
  const _extra=['기타','상관없음'];
  sel.innerHTML='<option value="">전체 기준</option>'+
    types.map(t=>`<option${t===scState.eduType?' selected':''}>${t}</option>`).join('')+
    '<optgroup label="기타">'+_extra.map(t=>`<option${t===scState.eduType?' selected':''}>${t}</option>`).join('')+'</optgroup>';
}
function scFillProducts(){
  const sel=document.getElementById('sc-product');if(!sel) return;
  const opts=[];
  if(typeof PRODUCT_TREE!=='undefined'){
    Object.entries(PRODUCT_TREE).forEach(([g,items])=>{
      opts.push(`<optgroup label="${g}">`+items.map(p=>`<option${p===scState.product?' selected':''}>${p}</option>`).join('')+'</optgroup>');
    });
  }
  const _extra=['기타','상관없음'];
  sel.innerHTML='<option value="">전체 기준</option>'+opts.join('')+
    '<optgroup label="기타">'+_extra.map(t=>`<option${t===scState.product?' selected':''}>${t}</option>`).join('')+'</optgroup>';
}

function scRenderAxesFromPreset(){}

function scRenderAxes(){
  const area=document.getElementById('sc-axes-list');if(!area) return;
  if(!scState.axes.length){area.innerHTML='<div style="padding:10px;text-align:center;font-size:11.5px;color:var(--t3)">포함 요소가 없습니다. 필요 시 "+ 항목 추가"로 넣어주세요.</div>';return;}
  area.innerHTML=scState.axes.map((a,i)=>`<div style="display:flex;align-items:baseline;gap:8px;padding:6px 10px;border-radius:6px;font-size:12.5px;line-height:1.6" onmouseover="this.style.background='rgba(0,0,0,.03)'" onmouseout="this.style.background='transparent'">
    <span style="color:var(--t3);font-weight:700;min-width:18px">${i+1}.</span>
    <span style="flex:1"><b style="color:var(--t1)">${a.name}</b>${a.hint?` <span style="color:var(--t3);font-size:11.5px">— ${a.hint}</span>`:''}</span>
    <span style="display:flex;gap:8px;font-size:10.5px;flex-shrink:0">
      <a style="color:var(--blue);cursor:pointer;font-weight:700" onclick="scEditAxis(${i})">편집</a>
      <a style="color:#dc2626;cursor:pointer;font-weight:700" onclick="scRemoveAxis(${i})">삭제</a>
    </span>
  </div>`).join('');
}
function scAxisModal(mode,i){
  const isEdit=mode==='edit';
  const a=isEdit?scState.axes[i]:{name:'',hint:''};
  const existing=document.getElementById('sc-axis-modal');if(existing) existing.remove();
  const dlg=document.createElement('div');
  dlg.id='sc-axis-modal';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  dlg.innerHTML=`<div style="background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.2);width:100%;max-width:440px;padding:22px;font-family:inherit">
    <div style="font-size:15px;font-weight:800;color:var(--t1);margin-bottom:4px">${isEdit?'요소 편집':'요소 추가'}</div>
    <div style="font-size:11.5px;color:var(--t3);margin-bottom:16px">시나리오에 포함할 요소의 이름과 힌트를 입력하세요.</div>
    <div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:4px">항목명 <span style="color:#dc2626">*</span></div>
      <input id="sc-ax-name" value="${(a.name||'').replace(/"/g,'&quot;')}" placeholder="예: 수치 근거" style="width:100%;padding:9px 11px;border:1px solid var(--bdr);border-radius:8px;font-size:13px;box-sizing:border-box">
    </div>
    <div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:4px">설명·힌트 <span style="color:var(--t3);font-weight:500">(선택)</span></div>
      <input id="sc-ax-hint" value="${(a.hint||'').replace(/"/g,'&quot;')}" placeholder="예: 구체 수치·단위 (예: 0.5℃, 5%)" style="width:100%;padding:9px 11px;border:1px solid var(--bdr);border-radius:8px;font-size:13px;box-sizing:border-box">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button type="button" onclick="scAxisModalClose()" style="padding:8px 16px;border:1px solid var(--bdr);background:#fff;border-radius:8px;font-size:12.5px;cursor:pointer;font-weight:600">취소</button>
      <button type="button" onclick="scAxisModalSave('${mode}',${isEdit?i:-1})" style="padding:8px 18px;border:none;background:var(--blue);color:#fff;border-radius:8px;font-size:12.5px;cursor:pointer;font-weight:700">${isEdit?'저장':'추가'}</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('click',e=>{if(e.target===dlg) scAxisModalClose();});
  setTimeout(()=>{const n=document.getElementById('sc-ax-name');if(n){n.focus();n.select();}},30);
  const onKey=(e)=>{if(e.key==='Escape')scAxisModalClose();else if(e.key==='Enter'&&(e.target.id==='sc-ax-name'||e.target.id==='sc-ax-hint')){e.preventDefault();scAxisModalSave(mode,isEdit?i:-1);}};
  dlg.addEventListener('keydown',onKey);
}
function scAxisModalClose(){const d=document.getElementById('sc-axis-modal');if(d) d.remove();}
// ════════════════════════════════════════════════════════════
// 관리자 페이지 — 시나리오 요소 관리 (교육유형별)
// ════════════════════════════════════════════════════════════
let _saAxes=[];
let _saCurrentEduType='';

function renderScenarioAxesAdmin(){
  if(!(CU?.isAdmin||CU?.isSubAdmin)){
    const sel=document.getElementById('sa-edu-type');
    if(sel) sel.innerHTML='<option value="">관리자/부관리자만 접근 가능</option>';
    const box=document.getElementById('sa-axes-list');
    if(box) box.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">권한이 없습니다.</div>';
    return;
  }
  const sel=document.getElementById('sa-edu-type');
  if(!sel) return;
  let types=(window.getEduTypes?getEduTypes():[])||[];
  if(!types.length) types=['판매경쟁력상황실','신입교육','심화교육','현장실습','판매자세교육','현장직무교육'];
  const extra=['기타','상관없음'];
  sel.innerHTML='<option value="">전체 기준 (모든 교육유형 공통)</option>'+
    types.map(t=>`<option value="${t.replace(/"/g,'&quot;')}">${t}</option>`).join('')+
    '<optgroup label="기타">'+extra.map(t=>`<option value="${t}">${t}</option>`).join('')+'</optgroup>';
  if(_saCurrentEduType && Array.from(sel.options).some(o=>o.value===_saCurrentEduType)){
    sel.value=_saCurrentEduType;
  }
  loadScenarioAxesForEduType();
}

async function loadScenarioAxesForEduType(){
  const sel=document.getElementById('sa-edu-type');
  const eduType=sel?.value||'';
  _saCurrentEduType=eduType;
  const status=document.getElementById('sa-status');
  if(status) status.textContent='로딩 중...';
  try{
    const{data,error}=await sb.from('scenario_axes_config')
      .select('axes,updated_by,updated_at')
      .eq('scope','default').eq('edu_type',eduType).limit(1);
    if(error) throw error;
    const row=(data||[])[0];
    if(row && Array.isArray(row.axes) && row.axes.length){
      _saAxes=JSON.parse(JSON.stringify(row.axes));
      if(status) status.innerHTML=`마지막 수정: <b>${row.updated_by||'—'}</b> · ${(row.updated_at||'').slice(0,16).replace('T',' ')}`;
    } else {
      _saAxes=JSON.parse(JSON.stringify(SC_DEFAULT_AXES));
      if(status) status.textContent='이 교육유형은 아직 관리자 기본값이 없습니다 — 편집 후 ★ 저장 시 기본값이 됩니다.';
    }
  }catch(e){
    const msg=(e.message||'').toLowerCase();
    if(msg.includes('relation')||msg.includes('does not exist')||msg.includes('schema cache')){
      if(status) status.innerHTML='<span style="color:#dc2626">⚠ DB 마이그레이션 미실행 (scenario_axes_config 테이블 없음)</span>';
    } else {
      if(status) status.innerHTML='<span style="color:#dc2626">로딩 실패: '+(e.message||e)+'</span>';
    }
    _saAxes=JSON.parse(JSON.stringify(SC_DEFAULT_AXES));
  }
  saRenderAxes();
}

function saRenderAxes(){
  const box=document.getElementById('sa-axes-list');
  if(!box) return;
  if(!_saAxes.length){box.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">요소가 없습니다 — "+ 항목 추가"로 넣어주세요.</div>';return;}
  box.innerHTML=_saAxes.map((a,i)=>`<div style="display:flex;align-items:baseline;gap:10px;padding:8px 12px;background:#fff;border:1px solid var(--bdr);border-radius:8px;font-size:12.5px;line-height:1.5">
    <span style="color:var(--t3);font-weight:700;min-width:18px">${i+1}.</span>
    <span style="flex:1">
      <b style="color:var(--t1)">${(a.name||'').replace(/</g,'&lt;')}</b>
      ${a.hint?`<span style="color:var(--t3);font-size:11.5px;margin-left:4px">— ${(a.hint||'').replace(/</g,'&lt;')}</span>`:''}
    </span>
    <span style="display:flex;gap:6px;flex-shrink:0">
      <a style="color:var(--blue);cursor:pointer;font-weight:700;font-size:11px" onclick="saEditAxis(${i})">편집</a>
      ${i>0?`<a style="color:var(--t3);cursor:pointer;font-weight:700;font-size:11px" onclick="saMoveAxis(${i},-1)" title="위로">↑</a>`:''}
      ${i<_saAxes.length-1?`<a style="color:var(--t3);cursor:pointer;font-weight:700;font-size:11px" onclick="saMoveAxis(${i},1)" title="아래로">↓</a>`:''}
      <a style="color:#dc2626;cursor:pointer;font-weight:700;font-size:11px" onclick="saRemoveAxis(${i})">삭제</a>
    </span>
  </div>`).join('');
}

function saAddAxis(){saAxisModal('add',-1);}
function saEditAxis(i){saAxisModal('edit',i);}
function saMoveAxis(i,dir){
  const ni=i+dir; if(ni<0||ni>=_saAxes.length) return;
  const tmp=_saAxes[i]; _saAxes[i]=_saAxes[ni]; _saAxes[ni]=tmp;
  saRenderAxes();
}
function saRemoveAxis(i){
  if(!confirm('삭제할까요? (저장 버튼을 눌러야 DB에 반영)')) return;
  _saAxes.splice(i,1); saRenderAxes();
}
function saAxisModal(mode,i){
  const isEdit=mode==='edit';
  const a=isEdit?_saAxes[i]:{name:'',hint:''};
  const existing=document.getElementById('sa-axis-modal'); if(existing) existing.remove();
  const dlg=document.createElement('div');
  dlg.id='sa-axis-modal';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  dlg.innerHTML=`<div style="background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.2);width:100%;max-width:440px;padding:22px;font-family:inherit">
    <div style="font-size:15px;font-weight:800;color:var(--t1);margin-bottom:4px">${isEdit?'요소 편집':'요소 추가'}</div>
    <div style="font-size:11.5px;color:var(--t3);margin-bottom:16px">교육유형 [${_saCurrentEduType||'전체 기준'}] 의 시나리오 요소</div>
    <div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:4px">항목명 <span style="color:#dc2626">*</span></div>
      <input id="sa-ax-name" value="${(a.name||'').replace(/"/g,'&quot;')}" placeholder="예: 수치 근거" style="width:100%;padding:9px 11px;border:1px solid var(--bdr);border-radius:8px;font-size:13px;box-sizing:border-box">
    </div>
    <div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:4px">설명·힌트</div>
      <input id="sa-ax-hint" value="${(a.hint||'').replace(/"/g,'&quot;')}" placeholder="예: 구체 수치·단위 (예: 0.5℃, 5%)" style="width:100%;padding:9px 11px;border:1px solid var(--bdr);border-radius:8px;font-size:13px;box-sizing:border-box">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button type="button" onclick="document.getElementById('sa-axis-modal').remove()" style="padding:8px 16px;border:1px solid var(--bdr);background:#fff;border-radius:8px;font-size:12.5px;cursor:pointer;font-weight:600">취소</button>
      <button type="button" onclick="saAxisModalSave('${mode}',${isEdit?i:-1})" style="padding:8px 18px;border:none;background:var(--blue);color:#fff;border-radius:8px;font-size:12.5px;cursor:pointer;font-weight:700">${isEdit?'저장':'추가'}</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('click',e=>{if(e.target===dlg) dlg.remove();});
  setTimeout(()=>{const n=document.getElementById('sa-ax-name'); if(n){n.focus();n.select();}},30);
}
function saAxisModalSave(mode,i){
  const nm=(document.getElementById('sa-ax-name')||{}).value||'';
  const ht=(document.getElementById('sa-ax-hint')||{}).value||'';
  const name=nm.trim();
  if(!name){const inp=document.getElementById('sa-ax-name'); if(inp){inp.style.borderColor='#dc2626';inp.focus();} return;}
  if(mode==='edit'){const a=_saAxes[i]; if(!a) return; a.name=name; a.hint=ht.trim();}
  else {_saAxes.push({id:'custom_'+Date.now(),name,hint:ht.trim()});}
  document.getElementById('sa-axis-modal')?.remove();
  saRenderAxes();
}
function saResetAxesToCodeDefault(){
  if(!confirm('이 교육유형의 요소를 코드 기본 7개(수치 근거·FAB·경쟁사 비교·실물 시연·비유·반론 대응·부가 제안)로 초기화할까요? 저장 버튼을 눌러야 DB에 반영됩니다.')) return;
  _saAxes=JSON.parse(JSON.stringify(SC_DEFAULT_AXES));
  saRenderAxes();
}
async function saSaveAxes(){
  if(!(CU?.isAdmin||CU?.isSubAdmin)){alert('관리자/부관리자만 가능합니다.');return;}
  const status=document.getElementById('sa-status');
  if(status) status.textContent='저장 중...';
  const r=await scSaveDefaultAxesToDB(_saCurrentEduType,_saAxes);
  if(!r.ok){
    if(status) status.innerHTML='<span style="color:#dc2626">저장 실패: '+r.error+'</span>';
    alert('저장 실패: '+r.error);
    return;
  }
  if(status) status.innerHTML=`<span style="color:#10b981">✓ 저장 완료 — [${_saCurrentEduType||'전체 기준'}] 교육유형의 모든 사용자에게 반영됩니다.</span>`;
  if(typeof showToast==='function') showToast(`[${_saCurrentEduType||'전체 기준'}] 기본값 저장 완료`,'#10b981');
}

function scAxisModalSave(mode,i){
  const nm=(document.getElementById('sc-ax-name')||{}).value||'';
  const ht=(document.getElementById('sc-ax-hint')||{}).value||'';
  const name=nm.trim();
  if(!name){const inp=document.getElementById('sc-ax-name');if(inp){inp.style.borderColor='#dc2626';inp.focus();}return;}
  if(mode==='edit'){const a=scState.axes[i];if(!a)return;a.name=name;a.hint=ht.trim();}
  else{scState.axes.push({id:'custom_'+Date.now(),name,hint:ht.trim()});}
  scSaveState();scRenderAxes();scUpdateDraftAxes();scAxisModalClose();
  // DB 동기화 (사용자 본인 커스텀)
  scSaveUserAxesToDB().then(r=>{
    if(!r.ok && typeof showToast==='function') showToast('DB 저장 실패: '+r.error,'#ef4444');
  });
}
function scEditAxis(i){scAxisModal('edit',i);}
function scAddAxis(){scAxisModal('add');}
function scRemoveAxis(i){
  if(!confirm('삭제할까요?')) return;
  scState.axes.splice(i,1);scSaveState();scRenderAxes();scUpdateDraftAxes();
  scSaveUserAxesToDB().then(r=>{
    if(!r.ok && typeof showToast==='function') showToast('DB 저장 실패: '+r.error,'#ef4444');
  });
}
async function scResetToDefault(){
  if(!confirm('포함 요소를 관리자 기본값으로 되돌릴까요? 본인의 커스텀은 삭제됩니다.')) return;
  const scope='user_'+(CU?.id||0);
  try{
    if(window.sb){
      const eduType=scState.eduType||'';
      await sb.from('scenario_axes_config').delete().eq('scope',scope).eq('edu_type',eduType);
    }
  }catch(e){console.warn('scResetToDefault:',e);}
  await scLoadAxesFromDB();
  scSaveState();scRenderAxes();scUpdateDraftAxes();
  if(typeof showToast==='function') showToast('관리자 기본값으로 복귀','#10b981');
}
async function scSetCurrentAsDefault(){
  if(!(CU?.isAdmin||CU?.isSubAdmin)){alert('관리자/부관리자만 가능합니다.');return;}
  const eduType=scState.eduType||'';
  const lbl=eduType||'전체 기준';
  if(!confirm(`현재 ${scState.axes?.length||0}개 요소를 [${lbl}] 교육유형의 관리자 기본값으로 저장합니다. 모든 사용자에게 적용됩니다. 진행할까요?`)) return;
  const r=await scSaveDefaultAxesToDB(eduType,scState.axes||[]);
  if(!r.ok){alert('저장 실패: '+r.error);return;}
  if(typeof showToast==='function') showToast(`[${lbl}] 기본값 저장 완료 — 모든 사용자에게 반영됩니다`,'#10b981');
}

// 초안 입력 → localStorage 즉시 + DB 디바운스 저장 (다기기 이어쓰기)
let _scDraftDebounceTimer=null;
function scOnDraftInput(v){
  scState.draft=v;scSaveState();
  const cnt=document.getElementById('sc-draft-count');if(cnt) cnt.textContent=v.length+'자';
  scUpdateDraftAxes();
  if(_scDraftDebounceTimer) clearTimeout(_scDraftDebounceTimer);
  _scDraftDebounceTimer=setTimeout(()=>{
    scSaveDraftToDB(v).catch(()=>{});
  },3000);
}
// 작업 중 초안 — 단일 키(덮어쓰기), 다기기 이어쓰기 전용 (목록에는 노출 안 함)
async function scSaveDraftToDB(text){
  if(!window.sb||!CU?.id) return;
  try{
    const c=scState.coaching||{};
    const payload={
      key:'sc_draft_user_'+CU.id,
      value:JSON.stringify({
        draft:text||'',
        revised:scState.revised||'',
        eduType:scState.eduType||'',product:scState.product||'',phase:scState.phase||'',customer:scState.customer||'',store:scState.store||'',
        grade:c.grade||'', score:c.overall_score||0,
        org_name:CU?.orgName||'',
        updated_at:new Date().toISOString()
      })
    };
    const {error}=await sb.from('app_settings').upsert(payload);
    if(error) console.warn('scSaveDraftToDB upsert:',error.message);
  }catch(e){console.warn('scSaveDraftToDB:',e?.message||e);}
}
// 최종 완성 시나리오 — 매번 새 기록으로 누적 보관 (sc_final_user_{id}_{ts})
async function scInsertFinalToDB(){
  if(!window.sb||!CU?.id) return {ok:false,error:'로그인 필요'};
  try{
    const c=scState.coaching||{};
    const u=(D.users||[]).find(x=>x.id===CU.id);
    const ts=Date.now()+'_'+Math.floor(Math.random()*1000);
    const key='sc_final_user_'+CU.id+'_'+ts;
    const payload={
      key,
      value:JSON.stringify({
        draft:scState.draft||'',
        revised:scState.revised||'',
        eduType:scState.eduType||'',product:scState.product||'',phase:scState.phase||'',customer:scState.customer||'',store:scState.store||'',
        grade:c.grade||'', score:c.overall_score||0,
        finalized:true,
        finalized_at:new Date().toISOString(),
        org_name:CU?.orgName||u?.orgName||'',
        user_name:CU?.name||u?.name||'',
        updated_at:new Date().toISOString()
      })
    };
    const {error}=await sb.from('app_settings').insert(payload);
    if(error){ console.warn('scInsertFinalToDB:',error.message); return {ok:false,error:error.message}; }
    return {ok:true,key};
  }catch(e){ console.warn('scInsertFinalToDB:',e?.message||e); return {ok:false,error:e?.message||String(e)}; }
}
async function scLoadDraftFromDB(){
  if(!window.sb||!CU?.id) return null;
  try{
    const{data,error}=await sb.from('app_settings').select('value').eq('key','sc_draft_user_'+CU.id).maybeSingle();
    if(error) return null;
    if(!data?.value) return null;
    return JSON.parse(data.value);
  }catch(e){return null;}
}
function scUpdateDraftAxes(){
  const box=document.getElementById('sc-draft-axes-status');if(!box) return;
  const text=scState.draft||'';
  const checked=scState.axes;
  box.innerHTML=checked.map(a=>{
    const kw=SC_KEYWORDS[a.id]||[];
    const hits=kw.filter(k=>text.includes(k)).length;
    const cls=hits>=2?'hit':hits===1?'partial':'miss';
    const ic=hits>=2?'●':hits===1?'◐':'○';
    return `<span class="sc-kw-chip ${cls}" title="${a.hint||''}">${ic} ${a.name}</span>`;
  }).join('');
}

function scOnEduFileChange(inp){
  const files=Array.from(inp.files||[]);if(!files.length) return;
  if(!Array.isArray(scState.eduFiles)) scState.eduFiles=[];
  files.forEach(f=>{scState.eduFiles.push({name:f.name,mime:f.type||'',size:f.size,_obj:f,url:''});});
  inp.value='';
  scSaveState();
  scRenderEduFiles();
}
function scRemoveEduFile(i){
  if(!Array.isArray(scState.eduFiles)) return;
  scState.eduFiles.splice(i,1);
  scSaveState();
  scRenderEduFiles();
}
function scFmtSize(n){if(!n&&n!==0) return '';if(n<1024) return n+'B';if(n<1024*1024) return (n/1024).toFixed(1)+'KB';return (n/1024/1024).toFixed(1)+'MB';}
function scRenderEduFiles(){
  const box=document.getElementById('sc-edu-file-list');if(!box) return;
  const list=Array.isArray(scState.eduFiles)?scState.eduFiles:[];
  if(!list.length){box.innerHTML='';return;}
  box.innerHTML=list.map((f,i)=>{
    const ext=(f.name||'').split('.').pop().toLowerCase();
    const ic=['jpg','jpeg','png','gif','webp','bmp'].includes(ext)?'🖼️':(ext==='pdf'?'📕':(['ppt','pptx'].includes(ext)?'📊':(['xls','xlsx'].includes(ext)?'📗':(['doc','docx'].includes(ext)?'📘':'📎'))));
    const sz=scFmtSize(f.size);
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:#fff;font-size:11.5px">
      <span style="font-size:12px">${ic}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
      ${sz?`<span style="color:var(--t3);font-size:10.5px">${sz}</span>`:''}
      <button type="button" onclick="scRemoveEduFile(${i})" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:11px;padding:0 4px;font-weight:700">×</button>
    </div>`;
  }).join('');
}

function scRender(){
  ['sc-step-0','sc-step-1','sc-step-2','sc-step-3'].forEach((id,i)=>{const el=document.getElementById(id);if(el) el.style.display=scState.step===i?'block':'none';});
  document.querySelectorAll('.sc-step-chip').forEach(el=>{
    const s=+el.dataset.step;el.classList.remove('active','done');
    if(s===scState.step) el.classList.add('active');
    else if(s<scState.step) el.classList.add('done');
  });
  if(scState.step===1) scUpdateDraftAxes();
  if(scState.step===2) scRenderCoaching();
  if(scState.step===3) scRenderFinal();
}

function scGoStep0(){scState.step=0;scSaveState();scRender();}
function scGoStep1(){scState.step=1;scSaveState();scRender();}

// 시나리오 코치 전용 로딩 UI 헬퍼
const SC_LOADING_TIPS=[
  '세계적 가전 전문 강사 시점으로 초안을 검토 중입니다.',
  '수치 근거·FAB·경쟁사 비교 포인트를 점검 중입니다.',
  '고객 유형·매장 환경에 맞춘 실전 대사를 구성 중입니다.',
  '첨부하신 교육자료와 초안을 대조 중입니다.',
  '반론 대응·부가 제안을 실전 수준으로 다듬는 중입니다.',
  '수정 시나리오를 완성 중입니다.',
];
let _scLoadingTimer=null, _scLoadingStart=0;
function setScLoadingStep(msg){const el=document.getElementById('sc-loading-step');if(el) el.textContent=msg;}
function setScLoadingStage(step,state){
  const node=document.querySelector(`.scstep[data-step="${step}"]`);if(!node) return;
  const icon=node.querySelector('.scstep-icon');
  if(state==='done'){node.style.color='#10b981';if(icon){icon.style.background='#10b981';icon.style.borderColor='#10b981';icon.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4"><polyline points="5 12 10 17 19 6"/></svg>';}}
  else if(state==='active'){node.style.color='var(--blue)';node.style.fontWeight='700';if(icon){icon.style.background='var(--blue)';icon.style.borderColor='var(--blue)';icon.innerHTML='<span style="width:8px;height:8px;border-radius:50%;background:#fff;animation:ringPulse 1s infinite"></span>';}}
  else {node.style.color='var(--t3)';node.style.fontWeight='';if(icon){icon.style.background='';icon.style.borderColor='#e5e7eb';icon.innerHTML='';}}
}
function _updateScLoadingTimer(){
  const elapsed=Math.floor((Date.now()-_scLoadingStart)/1000);
  const mm=String(Math.floor(elapsed/60)).padStart(2,'0');
  const ss=String(elapsed%60).padStart(2,'0');
  const el1=document.getElementById('sc-loading-elapsed');if(el1) el1.textContent=mm+':'+ss;
  const tip=document.getElementById('sc-loading-tip');if(tip){const idx=Math.floor(elapsed/7)%SC_LOADING_TIPS.length;tip.textContent=SC_LOADING_TIPS[idx];}
}
function showScLoading(show){
  const ov=document.getElementById('sc-loading-overlay');if(!ov) return;
  if(show){
    ov.style.display='flex';_scLoadingStart=Date.now();
    ['upload','context','coach','refine','render'].forEach(s=>setScLoadingStage(s,'pending'));
    _updateScLoadingTimer();
    if(_scLoadingTimer) clearInterval(_scLoadingTimer);
    _scLoadingTimer=setInterval(_updateScLoadingTimer,1000);
  } else {
    ov.style.display='none';
    if(_scLoadingTimer){clearInterval(_scLoadingTimer);_scLoadingTimer=null;}
  }
}

async function scRunAI(){
  if((scState.draft||'').trim().length<30){alert('초안을 30자 이상 작성해주세요');return;}
  const btn=document.getElementById('sc-run-btn');if(btn){btn.disabled=true;}
  showScLoading(true);
  try{
    const uploaded=[];
    const files=Array.isArray(scState.eduFiles)?scState.eduFiles:[];
    if(files.length){setScLoadingStage('upload','active');setScLoadingStep(`교육자료 업로드 중 (${files.length}개)...`);}
    else {setScLoadingStage('upload','done');}
    for(const item of files){
      const f=item._obj;
      if(!f){ if(item.url) uploaded.push({url:item.url,mime:item.mime||'',name:item.name||''}); continue; }
      try{
        setScLoadingStep(`교육자료 업로드 중: ${f.name}`);
        const sRes=await fetchWithRetry('/api/gcs-upload-url',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(localStorage.getItem('ib_token')||'')},body:JSON.stringify({filename:f.name,contentType:f.type||'application/octet-stream'})});
        const sData=await sRes.json();
        if(sData.signed_url){
          await fetchWithRetry(sData.signed_url,{method:'PUT',headers:{'Content-Type':f.type||'application/octet-stream'},body:f});
          item.url=sData.public_url||'';item.mime=f.type||'';
          uploaded.push({url:item.url,mime:item.mime,name:f.name});
        }
      }catch(e){console.warn('edu upload skip',f.name,e);}
    }
    if(files.length) setScLoadingStage('upload','done');
    setScLoadingStage('context','active');setScLoadingStep('시나리오 컨텍스트 준비 중...');
    await new Promise(r=>setTimeout(r,350));
    setScLoadingStage('context','done');
    setScLoadingStage('coach','active');setScLoadingStep('AI 코칭 분석 중 (세계적 가전 전문 강사 시점)...');
    const primary=uploaded[0]||{url:'',mime:''};
    const res=await fetchWithRetry('/api/vertex-analyze',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(localStorage.getItem('ib_token')||'')},
      body:JSON.stringify({
        mode:'scenario_coach',
        edu_type:scState.eduType,product:scState.product,phase:scState.phase,
        customer:scState.customer,store:scState.store,
        axes:scState.axes.map(a=>({name:a.name,hint:a.hint||''})),
        draft:scState.draft,
        edu_file_url:primary.url,edu_file_mime:primary.mime,
        edu_files:uploaded
      })
    });
    const data=await res.json();
    if(!data.ok){alert('AI 코칭 실패: '+(data.error||'알 수 없음'));return;}
    setScLoadingStage('coach','done');
    setScLoadingStage('refine','active');setScLoadingStep('수정 시나리오·포함 요소 점검 중...');
    scState.coaching=data.result;
    scState.revised=data.result.revised_scenario||scState.draft;
    scState.step=2;
    scState.history=scState.history||[];
    scState.history.push({at:new Date().toISOString(),score:data.result.overall_score,grade:data.result.grade});
    scSaveState();
    // 코칭 완료 → 작업중 초안(수정본 포함) DB 백업 (다기기 이어쓰기용). 목록 노출은 '최종 완성' 시점
    scSaveDraftToDB(scState.draft||'').catch(()=>{});
    // 관리자·부관리자에게 시나리오 업로드 알림
    if(CU?.id) notifyAdminsOfUpload({kind:'scenario', title:scState.eduType||scState.product||'시나리오', uploaderId:CU.id, orgName:D.activeOrg||CU.orgName, link:'page-aicoach'}).catch(()=>{});
    await new Promise(r=>setTimeout(r,250));
    setScLoadingStage('refine','done');
    setScLoadingStage('render','active');setScLoadingStep('결과 정리 중...');
    scRender();
    setScLoadingStage('render','done');
    setTimeout(()=>showScLoading(false),400);
  }catch(e){showScLoading(false);alert('AI 코칭 실패: '+e.message);}
  finally{if(btn){btn.disabled=false;}}
}

function scRenderCoaching(){
  const c=scState.coaching;if(!c) return;
  const body=document.getElementById('sc-coach-body');if(!body) return;
  const gradeColor={S:'#dc2626',A:'#2563eb',B:'#10b981',C:'#f59e0b',D:'#9ca3af'}[c.grade]||'var(--t3)';
  const axisKeys=Object.keys(c.axis_scores||{});
  const axisBars=axisKeys.map(k=>{
    const v=c.axis_scores[k]||0;
    const barC=v>=85?'#10b981':v>=70?'#f59e0b':'#ef4444';
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="width:110px;font-size:12px;font-weight:700;color:var(--t1);flex-shrink:0">${k}</span><div style="flex:1;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden"><div style="height:100%;width:${v}%;background:${barC};border-radius:4px;transition:width .6s"></div></div><span style="min-width:38px;text-align:right;font-size:11.5px;font-weight:800;color:${barC}">${v}</span></div>`;
  }).join('');
  const mk=(arr,color,icon,emptyMsg)=>{
    if(!arr||!arr.length) return `<div style="padding:12px;text-align:center;color:var(--t3);font-size:11px;background:#fafafa;border-radius:8px">${emptyMsg}</div>`;
    return arr.map(x=>typeof x==='string'?x:`<div style="padding:10px 12px;border-radius:8px;background:${color}0d;border:1px solid ${color}30;margin-bottom:6px"><div style="font-size:12.5px;font-weight:800;color:${color};margin-bottom:3px">${icon} ${x.title||''}</div><div style="font-size:11.5px;color:var(--t1);line-height:1.6">${x.detail||''}</div></div>`).join('');
  };
  const missList=(c.missing||[]).map(m=>`<div style="padding:8px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:12px;font-weight:700;margin-bottom:6px">⚠ ${m}</div>`).join('');
  const scripts=c.expert_scripts||{};
  const scriptHtml=Object.keys(scripts).length?`<div style="padding:14px;border-radius:10px;background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.2);margin-top:14px">
    <div style="font-size:12.5px;font-weight:800;color:#8b5cf6;margin-bottom:8px">💡 전문가 추천 대사 (매장에서 바로 말할 수 있는 수준)</div>
    ${Object.entries(scripts).map(([k,v])=>`<div style="padding:8px 12px;border-radius:8px;background:#fff;border:1px solid rgba(139,92,246,.15);margin-bottom:6px"><div style="font-size:10.5px;font-weight:800;color:#8b5cf6;margin-bottom:3px">[${k}]</div><div style="font-size:12px;color:var(--t1);line-height:1.7;white-space:pre-wrap">${v}</div></div>`).join('')}
  </div>`:'';
  body.innerHTML=`
    <div class="sc-grid-2" style="display:grid;grid-template-columns:160px 1fr;gap:16px;margin-bottom:14px">
      <div style="padding:16px;border:1px solid ${gradeColor}40;border-radius:14px;background:${gradeColor}0d;text-align:center">
        <div style="font-size:40px;font-weight:900;color:${gradeColor};line-height:1">${c.grade||'—'}</div>
        <div style="font-size:22px;font-weight:800;color:var(--t1);margin-top:4px">${c.overall_score||0}<span style="font-size:11px;color:var(--t3)">/100</span></div>
        <div style="font-size:10.5px;color:var(--t3);margin-top:3px">완성도</div>
      </div>
      <div style="padding:14px;border:1px solid var(--bdr);border-radius:12px;background:#fff">
        <div style="font-size:12.5px;font-weight:800;color:var(--t1);margin-bottom:4px">📋 총평</div>
        <div style="font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:10px">${c.summary||''}</div>
        ${c.improvement_tip?`<div style="padding:8px 10px;border-radius:8px;background:#f0f9ff;border:1px solid #bfdbfe;font-size:11.5px;color:#1e40af"><b>💎 최우선 개선:</b> ${c.improvement_tip}</div>`:''}
      </div>
    </div>
    ${axisKeys.length?`<div style="padding:14px;border:1px solid var(--bdr);border-radius:10px;margin-bottom:14px"><div style="font-size:12.5px;font-weight:800;color:var(--t1);margin-bottom:10px">📊 축별 점수</div>${axisBars}</div>`:''}
    ${missList?`<div style="margin-bottom:14px">${missList}</div>`:''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:14px">
      <div><div style="font-size:12px;font-weight:800;color:#059669;margin-bottom:6px">✅ 살릴 것</div>${mk(c.strengths,'#10b981','✅','칭찬할 점이 아직 없어요')}</div>
      <div><div style="font-size:12px;font-weight:800;color:#dc2626;margin-bottom:6px">❌ 뺄 것</div>${mk(c.weaknesses,'#ef4444','❌','제거할 부분 없음')}</div>
      <div><div style="font-size:12px;font-weight:800;color:#d97706;margin-bottom:6px">➕ 보완 제안</div>${mk(c.additions,'#f59e0b','➕','추가 제안 없음')}</div>
    </div>
    ${scriptHtml}
    <div class="sc-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <div>
        <div style="font-size:11.5px;font-weight:800;color:var(--t3);margin-bottom:4px">📝 내 초안</div>
        <textarea readonly style="width:100%;height:200px;padding:10px;border:1px solid var(--bdr);border-radius:8px;font-size:12px;background:#f9fafb;resize:vertical;font-family:inherit">${(scState.draft||'').replace(/</g,'&lt;')}</textarea>
      </div>
      <div>
        <div style="font-size:11.5px;font-weight:800;color:var(--blue);margin-bottom:4px">✨ 수정본 (AI 반영 · 직접 수정 가능)</div>
        <textarea id="sc-revised" oninput="scState.revised=this.value;scSaveState()" style="width:100%;height:200px;padding:10px;border:1px solid var(--blue);border-radius:8px;font-size:12px;resize:vertical;font-family:inherit;line-height:1.7">${(scState.revised||'').replace(/</g,'&lt;')}</textarea>
      </div>
    </div>
  `;
}

function scGoStep3(){
  if(!scState.coaching){alert('먼저 AI 코칭을 받으세요');return;}
  scState.step=3;
  scSaveState();scRender();
  // 최종 완성 → 누적 보관 (매번 새 기록 추가). 같은 내용 중복 저장만 방지
  const sig=(scState.revised||scState.draft||'').length+'|'+(scState.coaching?.grade||'')+'|'+(scState.coaching?.overall_score||0);
  if(scState._finalSavedSig===sig) return;
  scInsertFinalToDB().then(r=>{
    if(r.ok){
      scState._finalSavedSig=sig; scSaveState();
      D.scenarioDrafts=null; // 다음 목록 렌더 시 재로드
      if(typeof showToast==='function') showToast('시나리오가 완성 목록에 저장되었습니다 (누적 보관)','#10b981');
    } else {
      if(typeof showToast==='function') showToast('저장 실패: '+(r.error||'네트워크 오류'),'#dc2626');
    }
  }).catch(()=>{});
}

function scRenderFinal(){
  const c=scState.coaching;
  const body=document.getElementById('sc-final-body');if(!body) return;
  const scenario=scState.revised||scState.draft||'';
  const gradeColor={S:'#dc2626',A:'#2563eb',B:'#10b981',C:'#f59e0b',D:'#9ca3af'}[c?.grade]||'var(--t3)';
  body.innerHTML=`
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:15px;font-weight:800;color:var(--t1)">최종 시나리오 완성</div>
        <div style="font-size:11.5px;color:var(--t3);margin-top:3px">${scState.product||''} · ${scState.phase||''} · ${scState.customer||''}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" style="padding:7px 14px;font-size:12px" onclick="scCopy()">📋 복사</button>
        <button class="btn btn-ghost" style="padding:7px 14px;font-size:12px" onclick="scDownloadExcel()">📥 엑셀 다운로드</button>
        <button class="btn btn-blue" style="padding:7px 14px;font-size:12px" onclick="scReset()">🔄 새로 시작</button>
      </div>
    </div>
    <div class="sc-grid-2" style="display:grid;grid-template-columns:180px 1fr;gap:14px;margin-bottom:16px">
      <div style="padding:14px;border:1px solid ${gradeColor}40;border-radius:14px;background:${gradeColor}0d;text-align:center">
        <div style="font-size:36px;font-weight:900;color:${gradeColor};line-height:1">${c?.grade||'—'}</div>
        <div style="font-size:18px;font-weight:800;color:var(--t1);margin-top:4px">${c?.overall_score||0}점</div>
        <div style="font-size:10.5px;color:var(--t3);margin-top:2px">완성 등급</div>
      </div>
      <div style="padding:14px;border:1px solid var(--bdr);border-radius:12px">
        <div style="font-size:12.5px;font-weight:800;color:var(--t1);margin-bottom:6px">3단계 완성 여정</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:11.5px;color:var(--t2)">
          <div><b>① 초안</b><br><span style="color:var(--t3)">${(scState.draft||'').length}자</span></div>
          <div><b>② AI 코칭</b><br><span style="color:var(--t3)">${c?.overall_score||0}점 · 피드백 반영</span></div>
          <div><b>③ 최종</b><br><span style="color:var(--t3)">${scenario.length}자 · 완성</span></div>
        </div>
      </div>
    </div>
    <div style="padding:18px;border:1px solid var(--bdr);border-radius:12px;background:#fff">
      <div style="font-size:12.5px;font-weight:800;color:var(--t1);margin-bottom:10px">✨ 최종 완성 시나리오</div>
      <pre style="font-size:13px;line-height:1.9;color:var(--t1);white-space:pre-wrap;font-family:inherit;margin:0">${scenario.replace(/</g,'&lt;')}</pre>
    </div>
    <div style="padding:14px;border-radius:10px;background:#f0f9ff;border:1px solid #bfdbfe;margin-top:14px">
      <div style="font-size:12px;font-weight:800;color:#1e40af;margin-bottom:6px">💡 활용 팁</div>
      <ul style="margin:0;padding-left:18px;font-size:11.5px;color:var(--t2);line-height:1.8">
        <li>소리 내어 2~3회 반복 연습 (실제 매장 환경에서)</li>
        <li>동료·선배 강사와 롤플레이 후 추가 피드백</li>
        <li>실전 후 자체 녹음/녹화 → AI 평가로 연계 활용</li>
        <li>이 완성본은 서버에 저장되어 관리자와 공유되고 다른 PC에서도 열립니다 (필요 시 복사·엑셀로도 백업)</li>
      </ul>
    </div>
    <div style="margin-top:14px;display:flex;justify-content:flex-start">
      <button class="btn btn-ghost" style="padding:7px 14px;font-size:12px" onclick="scGoStep2Edit()">← 수정으로 돌아가기</button>
    </div>
  `;
}

function scGoStep2Edit(){scState.step=2;scSaveState();scRender();}

function scCopy(){
  const text=scState.revised||scState.draft||'';
  if(!text){alert('복사할 내용이 없습니다');return;}
  navigator.clipboard.writeText(text).then(()=>{const t=document.createElement('div');t.textContent='✓ 복사되었습니다';t.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:10px 20px;border-radius:999px;font-size:12.5px;font-weight:700;z-index:10001;box-shadow:0 4px 20px rgba(0,0,0,.2)';document.body.appendChild(t);setTimeout(()=>t.remove(),1800);}).catch(()=>{alert('복사 실패 — 수동으로 복사해주세요');});
}

function scDownloadExcel(){
  const c=scState.coaching||{};
  const sep='\t';
  let out='﻿';
  out+='AI 시나리오 코치 — 최종 완성 리포트\n\n';
  out+=`교육 유형${sep}${scState.eduType}\n`;
  out+=`교육 제품${sep}${scState.product}\n`;
  out+=`시나리오 단계${sep}${scState.phase}\n`;
  out+=`목표 고객${sep}${scState.customer}\n`;
  out+=`매장 환경${sep}${scState.store}\n`;
  out+=`완성 등급${sep}${c.grade||''}\n`;
  out+=`완성 점수${sep}${c.overall_score||0}\n`;
  out+=`총평${sep}${(c.summary||'').replace(/\n/g,' ')}\n\n`;
  out+='── 축별 점수 ──\n';
  Object.entries(c.axis_scores||{}).forEach(([k,v])=>{out+=`${k}${sep}${v}\n`;});
  out+='\n── 살릴 것 ──\n';(c.strengths||[]).forEach(x=>{const s=typeof x==='string'?x:`${x.title||''} — ${x.detail||''}`;out+=s.replace(/\n/g,' ')+'\n';});
  out+='\n── 뺄 것 ──\n';(c.weaknesses||[]).forEach(x=>{const s=typeof x==='string'?x:`${x.title||''} — ${x.detail||''}`;out+=s.replace(/\n/g,' ')+'\n';});
  out+='\n── 보완 제안 ──\n';(c.additions||[]).forEach(x=>{const s=typeof x==='string'?x:`${x.title||''} — ${x.detail||''}`;out+=s.replace(/\n/g,' ')+'\n';});
  out+='\n── 필수 누락 ──\n';(c.missing||[]).forEach(m=>{out+=m.replace(/\n/g,' ')+'\n';});
  out+='\n── 전문가 추천 대사 ──\n';
  Object.entries(c.expert_scripts||{}).forEach(([k,v])=>{out+=`[${k}]\n${v}\n\n`;});
  out+='\n── 최종 시나리오 전문 ──\n';
  out+=(scState.revised||scState.draft||'')+'\n';
  const blob=new Blob([out],{type:'text/tab-separated-values;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download=`시나리오_코치_${scState.product||'시나리오'}_${new Date().toISOString().slice(0,10)}.xls`;
  a.click();URL.revokeObjectURL(url);
}

function scReset(){
  if(!confirm('새로 시작하면 현재 작업 내용이 사라집니다. 계속할까요?')) return;
  try{localStorage.removeItem(SC_STATE_KEY);}catch(e){}
  scState=scDefaultState();
  ['sc-edu-type','sc-product','sc-phase','sc-customer','sc-store'].forEach(id=>{const el=document.getElementById(id);if(el) el.value='';});
  const ef=document.getElementById('sc-edu-file');if(ef) ef.value='';
  scRenderEduFiles();
  const ta=document.getElementById('sc-draft');if(ta) ta.value='';
  scRenderAxes();scRender();
}

// Good/Bad/Upgrade 최종 의견 — 아이콘 3개 (클릭 시 아래에 해당 내용 펼침)
function renderOpinionTabs(containerId,goodItems,badItems,upgradeItems,prefix,summary){
  const p=prefix||'op';
  const goodCard=(items)=>items.map((g,i)=>`<div style="padding:14px 16px;margin-bottom:8px;border-radius:10px;border:1px solid rgba(16,185,129,.15);background:rgba(16,185,129,.03)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-size:13px;font-weight:800;color:#10b981">${i+1}</span>
      <span style="font-size:13px;font-weight:700;color:var(--t1)">${g.title}</span>
    </div>
    <div style="font-size:12px;color:var(--t2);line-height:1.6;padding-left:22px">${g.reason||g.desc||''}</div>
  </div>`).join('')||'<div style="font-size:12px;color:var(--t3);padding:16px;text-align:center">아이콘을 클릭하면 의견이 표시됩니다</div>';
  const badCard=(items)=>items.map((g,i)=>`<div style="padding:14px 16px;margin-bottom:8px;border-radius:10px;border:1px solid rgba(226,30,38,.15);background:rgba(226,30,38,.03)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-size:13px;font-weight:800;color:#E21E26">${i+1}</span>
      <span style="font-size:13px;font-weight:700;color:var(--t1)">${g.title}</span>
    </div>
    <div style="font-size:12px;color:var(--t2);line-height:1.6;padding-left:22px;margin-bottom:6px">${g.reason||g.desc||''}</div>
    ${g.solution?`<div style="padding:8px 10px;margin-left:22px;background:rgba(226,30,38,.06);border-left:3px solid #E21E26;border-radius:4px;font-size:11px;color:var(--t2);line-height:1.5"><strong style="color:#E21E26">솔루션:</strong> ${g.solution}</div>`:''}
  </div>`).join('')||'<div style="font-size:12px;color:var(--t3);padding:16px;text-align:center">개선 포인트가 없습니다</div>';
  const upgradeCard=(items)=>items.map((g,i)=>`<div style="padding:14px 16px;margin-bottom:8px;border-radius:10px;border:1px solid rgba(245,158,11,.15);background:rgba(245,158,11,.03)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-size:13px;font-weight:800;color:#f59e0b">${i+1}</span>
      <span style="font-size:13px;font-weight:700;color:var(--t1)">${g.title}</span>
    </div>
    <div style="font-size:12px;color:var(--t2);line-height:1.6;padding-left:22px">${g.detail||g.desc||''}</div>
  </div>`).join('')||'<div style="font-size:12px;color:var(--t3);padding:16px;text-align:center">업그레이드 제안이 없습니다</div>';
  const iconBtn=(kind,color,bg,label,count,svg,active)=>`<button type="button" data-op-kind="${kind}" onclick="switchOpTab('${p}','${kind}',this)" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 6px;border:2px solid ${active?color+'40':'transparent'};border-radius:14px;background:${active?color+'08':'none'};cursor:pointer;transition:all .2s ease">
    <div class="op-icon-circle" style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${bg};border:3px solid ${color};color:${color};transition:transform .2s ease;transform:scale(${active?1.1:1})">${svg}</div>
    <div style="font-size:12px;font-weight:900;color:${color};letter-spacing:.5px">${label}</div>
    <div style="font-size:10px;color:var(--t3);font-weight:700;margin-top:-4px">${count}건</div>
  </button>`;
  const goodSvg=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l5-7a2 2 0 0 1 3 3z"/></svg>`;
  const badSvg=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-5 7a2 2 0 0 1-3-3z"/></svg>`;
  const upSvg=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
  return `<div style="padding:18px 16px">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:6px">
      ${iconBtn('good','#10b981','rgba(16,185,129,.10)','GOOD',goodItems.length,goodSvg,true)}
      ${iconBtn('bad','#E21E26','rgba(226,30,38,.10)','BAD',badItems.length,badSvg,false)}
      ${iconBtn('upgrade','#f59e0b','rgba(245,158,11,.10)','UPGRADE',upgradeItems.length,upSvg,false)}
    </div>
    <div style="border-top:1px solid var(--bdr);padding-top:14px;margin-top:10px">
      <div id="${p}-good" style="padding:4px 4px">${goodCard(goodItems)}</div>
      <div id="${p}-bad" style="padding:4px 4px;display:none">${badCard(badItems)}</div>
      <div id="${p}-upgrade" style="padding:4px 4px;display:none">${upgradeCard(upgradeItems)}</div>
    </div>
    ${summary?`<div style="margin-top:10px;padding:14px;border-top:1px solid var(--bdr)">
      <div style="font-size:12px;font-weight:800;color:var(--t1);margin-bottom:6px">종합 의견</div>
      <div style="font-size:12px;color:var(--t2);line-height:1.7">${summary}</div>
    </div>`:''}
  </div>`;
}
function switchOpTab(prefix,tab,btn){
  ['good','bad','upgrade'].forEach(t=>{
    const pane=document.getElementById(prefix+'-'+t);
    if(pane) pane.style.display=t===tab?'block':'none';
  });
  const colors={'good':'#10b981','bad':'#E21E26','upgrade':'#f59e0b'};
  const parent=btn.parentElement;
  parent.querySelectorAll('button').forEach(b=>{
    b.style.borderColor='transparent';
    b.style.background='none';
    const circle=b.querySelector('.op-icon-circle');
    if(circle) circle.style.transform='scale(1)';
  });
  btn.style.borderColor=colors[tab]+'40';
  btn.style.background=colors[tab]+'08';
  const circle=btn.querySelector('.op-icon-circle');
  if(circle) circle.style.transform='scale(1.1)';
}
function _switchOpTab_old(prefix,tab,btn){
  // 이전 버전 — 미사용
  const colors={'good':'#0078C8','bad':'#f59e0b','upgrade':'#8b5cf6'};
  btn.parentElement.querySelectorAll('button').forEach(b=>{b.style.borderBottomColor='transparent';b.style.color='var(--t1)';});
  btn.style.borderBottomColor=colors[tab];btn.style.color=colors[tab];
}

function showAllBadges(userId,pickScore){
  // 교육맞춤평가 카테고리만 (AI독자·누적 제외)
  const allBadges=getAccumulatedBadges(userId).filter(id=>{const c=getBadgeInfo(id).cat;return c==='교육맞춤'||c==='평가안';});
  const u=D.users?.find(x=>x.id===userId);
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};

  if(!allBadges.length){
    overlay.innerHTML=`<div style="background:#fff;border-radius:16px;padding:28px;max-width:500px;width:92vw;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:16px;font-weight:900">${u?.name||''} 뱃지</div>
        <button style="border:none;background:none;cursor:pointer;font-size:20px;color:var(--t3)" onclick="this.closest('.overlay').remove()">✕</button>
      </div>
      <div style="padding:30px;text-align:center;color:var(--t3);font-size:13px;line-height:1.8">아직 획득한 뱃지가 없어요.<br>첫 평가가 완료되면 뱃지가 쌓입니다.</div>
    </div>`;
    document.body.appendChild(overlay);
    return;
  }

  // 등급별 그룹 (희귀 → 흔함 순)
  const tierOrder=['legend','platinum','gold','silver','bronze'];
  const byTier={};
  allBadges.forEach(id=>{
    const b=getBadgeInfo(id);
    const t=b.tier||'silver';
    if(!byTier[t]) byTier[t]=[];
    byTier[t].push({id,...b});
  });
  // 등급별 카운트 요약
  const summary=tierOrder.filter(t=>byTier[t]?.length).map(t=>{
    const ts=TIER_STYLE[t];
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;background:${ts.bg};color:${ts.color};border:1px solid ${ts.border};font-size:10.5px;font-weight:800">${ts.label} ${byTier[t].length}</span>`;
  }).join('');

  let tierSections='';
  tierOrder.forEach(tier=>{
    const badges=byTier[tier];
    if(!badges||!badges.length) return;
    const ts=TIER_STYLE[tier];
    tierSections+=`<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid ${ts.border}40">
        <span style="font-size:13px;font-weight:800;color:${ts.color}">${ts.label}</span>
        <span style="font-size:11px;color:var(--t3);font-weight:700">${badges.length}개</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${badges.map(b=>`<span title="${(b.desc||'').replace(/"/g,'&quot;')}" style="padding:5px 12px;border-radius:999px;font-size:11.5px;font-weight:700;background:${ts.bg};color:#1a202c;border:1px solid ${ts.border};cursor:help">${b.name}<span style="font-size:9.5px;font-weight:600;color:var(--t3);margin-left:5px">·${b.cat||''}</span></span>`).join('')}
      </div>
    </div>`;
  });

  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;padding:24px;max-width:560px;width:92vw;max-height:85vh;overflow-y:auto;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:12px">
      <div style="min-width:0">
        <div style="font-size:16px;font-weight:900;color:var(--t1)">${u?.name||''} 뱃지 <span style="color:var(--t3);font-weight:700">· ${allBadges.length}개</span></div>
        <div style="font-size:11px;color:var(--t3);margin-top:3px">획득한 등급별 뱃지 모음 — 마우스 올리면 달성 기준이 나와요</div>
      </div>
      <button style="border:none;background:rgba(0,0,0,.06);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:15px;flex-shrink:0" onclick="this.closest('.overlay').remove()">✕</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(0,0,0,.08)">${summary}</div>
    ${tierSections}
  </div>`;
  document.body.appendChild(overlay);
}

// ── 경력 이력 CRUD ──
function renderCareerList(userId){
  const listEl=document.getElementById('career-list-'+userId);
  if(!listEl) return;
  const items=(D.careerHistory||[]).filter(c=>c.user_id===userId).sort((a,b)=>(b.sort_order||0)-(a.sort_order||0));
  const isOwner=CU&&(CU.id===userId||CU.isAdmin);
  if(!items.length){listEl.innerHTML='<div style="font-size:12px;color:var(--t3);padding:10px 0">등록된 경력이 없습니다</div>';return;}
  // 타임라인
  listEl.innerHTML=`<div style="position:absolute;left:6px;top:0;bottom:0;width:2px;background:linear-gradient(var(--red),rgba(0,0,0,.06))"></div>`+
    items.map((c,i)=>{
      const isCurrent=c.end_date==='현재';
      const dotColor=isCurrent?'var(--red)':'rgba(0,0,0,.15)';
      return `<div style="position:relative;padding-bottom:20px;padding-left:20px">
        <div style="position:absolute;left:0;top:4px;width:12px;height:12px;border-radius:50%;background:${dotColor};border:2px solid #fff;box-shadow:0 0 0 1px ${dotColor}"></div>
        <div style="font-size:12px;font-weight:700;color:${isCurrent?'var(--red)':'var(--t3)'}">${c.start_date} ~ ${c.end_date}</div>
        <div style="font-size:13px;font-weight:800;color:var(--t1);margin-top:2px">${c.title}</div>
        ${c.position?`<div style="font-size:11px;color:var(--t3);margin-top:1px">${c.position}</div>`:''}
        ${isOwner?`<button style="border:none;background:none;cursor:pointer;color:var(--red);font-size:10px;padding:2px 0;margin-top:2px" onclick="deleteCareerItem(${c.id},${userId})">삭제</button>`:''}
      </div>`;
    }).join('');
}

async function submitCareerItem(userId){
  const start=document.getElementById('cr-start-'+userId)?.value?.trim();
  const end=document.getElementById('cr-end-'+userId)?.value?.trim()||'현재';
  const title=document.getElementById('cr-title-'+userId)?.value?.trim();
  const position=document.getElementById('cr-pos-'+userId)?.value?.trim()||'';
  if(!start||!title){alert('시작 년월과 내용을 입력하세요');return;}
  const order=(D.careerHistory||[]).filter(c=>c.user_id===userId).length;
  const{error}=await sb.from('career_history').insert({user_id:userId,start_date:start,end_date:end,title,position,sort_order:order});
  if(error){alert('등록 실패');return;}
  const{data}=await sb.from('career_history').select('*').order('sort_order',{ascending:false});
  D.careerHistory=data||[];
  renderCareerList(userId);
  document.getElementById('cr-start-'+userId).value='';
  document.getElementById('cr-end-'+userId).value='현재';
  document.getElementById('cr-title-'+userId).value='';
  document.getElementById('cr-pos-'+userId).value='';
  document.getElementById('career-add-form-'+userId).style.display='none';
}

async function deleteCareerItem(id,userId){
  if(!confirm('삭제하시겠습니까?'))return;
  await sb.from('career_history').delete().eq('id',id);
  const{data}=await sb.from('career_history').select('*').order('sort_order',{ascending:false});
  D.careerHistory=data||[];
  renderCareerList(userId);
}

// ── 포트폴리오 CRUD — 이미지 그리드(3열) + 파일/링크 카드 통합 ──
const _isImageExt=(ext)=>['jpg','jpeg','png','gif','webp','bmp','svg','avif','heic'].includes((ext||'').toLowerCase());
const _isImageUrl=(url)=>typeof url==='string' && /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic)(\?|$)/i.test(url);

function renderPortfolioList(userId){
  const listEl=document.getElementById('portfolio-list-'+userId);
  if(!listEl) return;
  const items=(D.portfolio||[]).filter(p=>p.user_id===userId);
  const isOwner=CU&&(CU.id===userId||CU.isAdmin);
  if(!items.length){listEl.innerHTML='<div style="font-size:12px;color:var(--t3);padding:10px 0">등록된 포트폴리오가 없습니다</div>';return;}
  const typeIcons={
    'pdf':'<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E21E26" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    'xlsx':'<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    'docx':'<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0078C8" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    'pptx':'<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    'link':'<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
  };
  const cards=items.map(p=>{
    const ext=(p.file_name||'').split('.').pop()?.toLowerCase()||'';
    const url=p.file_url||'';
    const isImg = _isImageExt(ext) || _isImageUrl(url);
    const isNew=p.created_at&&(Date.now()-new Date(p.created_at).getTime()<7*24*60*60*1000);
    const titleHtml = `${(p.title||'').replace(/</g,'&lt;')}${p.subtitle?'<span style="font-weight:400;color:var(--t3);margin-left:4px">'+(p.subtitle.replace(/</g,'&lt;'))+'</span>':''}`;
    const newChip = isNew?'<span style="position:absolute;top:8px;left:8px;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:800;background:rgba(16,185,129,.95);color:#fff;z-index:2">NEW</span>':'';
    const delBtn = isOwner?`<button style="position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;z-index:3" onclick="event.stopPropagation();deletePortfolioItem(${p.id},${userId})" title="삭제">×</button>`:'';
    if(isImg){
      // 이미지: 큰 썸네일 카드
      return `<div style="position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--bdr);background:#000;cursor:pointer;transition:transform .22s,box-shadow .22s;aspect-ratio:4/3" ${url?`onclick="window.open('${url}','_blank')"`:''} onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 18px rgba(0,0,0,.12)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
        ${newChip}${delBtn}
        <img src="${url}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none'">
        <div style="position:absolute;left:0;right:0;bottom:0;padding:8px 10px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.7));color:#fff">
          <div style="font-size:11px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${titleHtml}</div>
          <div style="font-size:9px;opacity:.85;margin-top:1px">${p.upload_date||p.created_at?.slice(0,10)||''}</div>
        </div>
      </div>`;
    } else {
      // 파일/링크: 아이콘 카드
      const icon = typeIcons[ext] || typeIcons['link'];
      return `<div style="position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--bdr);background:#fafafa;cursor:${url?'pointer':'default'};transition:transform .22s,box-shadow .22s;aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px" ${url?`onclick="window.open('${url}','_blank')"`:''} onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 18px rgba(0,0,0,.08)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
        ${newChip}${delBtn}
        <div style="margin-bottom:8px">${icon}</div>
        <div style="font-size:11px;font-weight:800;color:var(--t1);text-align:center;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3">${titleHtml}</div>
        <div style="font-size:9px;color:var(--t3);margin-top:4px">${p.upload_date||p.created_at?.slice(0,10)||''}${p.file_name?' · '+p.file_name.replace(/</g,'&lt;'):''}</div>
      </div>`;
    }
  }).join('');
  listEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${cards}</div>`;
}

// 빠른 사진 등록 — 슬롯 클릭 → 사진 선택 → 자동 압축·업로드·DB·재렌더
async function quickAddPortfolioImage(userId, input){
  const file = input?.files?.[0];
  if(!file) return;
  if(!/^image\//i.test(file.type)){ alert('이미지 파일만 가능합니다.'); input.value=''; return; }
  // 로딩 표시 — 슬롯에 처리 중 표시
  const label = input.closest('label');
  let origHtml='';
  if(label){
    origHtml=label.innerHTML;
    label.innerHTML='<div style="font-size:11px;color:var(--blue);font-weight:800">📤 업로드 중...</div>';
    label.style.pointerEvents='none';
  }
  try{
    // 자동 압축
    let upload=file;
    if(file.size>1.5*1024*1024 && typeof compressImage==='function'){
      try{ upload = await compressImage(file, 2*1024*1024, 1600); }catch(_){ upload=file; }
    }
    const ext=(upload.name||file.name||'photo.jpg').split('.').pop()||'jpg';
    const path=`portfolio/${userId}/${Date.now()}.${ext}`;
    const {error:ue}=await sb.storage.from('files').upload(path, upload, {contentType: upload.type||'image/jpeg', upsert:false});
    if(ue){ throw new Error(ue.message); }
    const {data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
    // 제목: 사용자가 안 정한 경우 파일명에서 확장자 제거 후 사용
    const baseName=(file.name||'사진').replace(/\.\w+$/,'').slice(0,40) || '사진';
    const {error: dbErr}=await sb.from('portfolio').insert({
      user_id:userId, title:baseName, subtitle:null,
      file_url:publicUrl, file_name:file.name||null,
      upload_date:new Date().toISOString().slice(0,10)
    });
    if(dbErr) throw dbErr;
    const {data}=await sb.from('portfolio').select('*').order('created_at',{ascending:false});
    D.portfolio=data||[];
    renderPortfolioList(userId);
    if(typeof showToast==='function') showToast('✓ 사진 등록 완료','#10b981');
  }catch(e){
    alert('등록 실패: '+(e?.message||e));
    if(label){ label.innerHTML=origHtml; label.style.pointerEvents=''; }
  }
  input.value='';
}

async function addPortfolioItem(userId){
  const title=document.getElementById('pf-title-'+userId)?.value?.trim();
  if(!title){alert('제목을 입력하세요');return;}
  const subtitle=document.getElementById('pf-subtitle-'+userId)?.value?.trim()||'';
  const urlInput=document.getElementById('pf-url-'+userId)?.value?.trim()||'';
  let file=document.getElementById('pf-file-'+userId)?.files?.[0];
  let fileUrl='',fileName='';
  if(file){
    // 이미지 파일이면 자동 압축 (포트폴리오는 더 큰 maxDim 허용 — 화질 우선)
    if(/^image\//i.test(file.type) && typeof compressImage==='function'){
      try{
        const orig=(file.size/1024/1024).toFixed(1);
        if(file.size>1.5*1024*1024){
          file = await compressImage(file, 2*1024*1024, 1600);  // 포트폴리오: 2MB·1600px
          const next=(file.size/1024/1024).toFixed(2);
          console.log(`📸 포트폴리오 자동 압축: ${orig}MB → ${next}MB`);
        }
      }catch(e){ console.warn('compressImage 실패 (원본 업로드):',e); }
    }
    const ext=(file.name||'file').split('.').pop()||'file';
    const path=`portfolio/${userId}/${Date.now()}.${ext}`;
    const{error:ue}=await sb.storage.from('files').upload(path,file,{contentType:file.type||undefined,upsert:false});
    if(ue){alert('파일 업로드 실패\n\n원인: '+ue.message);return;}
    const{data:{publicUrl}}=sb.storage.from('files').getPublicUrl(path);
    fileUrl=publicUrl;fileName=file.name;
  } else if(urlInput){
    fileUrl=urlInput;
  } else {
    alert('파일 또는 URL 중 하나를 입력하세요'); return;
  }
  const{error}=await sb.from('portfolio').insert({user_id:userId,title,subtitle,file_url:fileUrl||null,file_name:fileName||null,upload_date:new Date().toISOString().slice(0,10)});
  if(error){alert('등록 실패');return;}
  const{data}=await sb.from('portfolio').select('*').order('created_at',{ascending:false});
  D.portfolio=data||[];
  renderPortfolioList(userId);
  document.getElementById('pf-title-'+userId).value='';
  document.getElementById('pf-subtitle-'+userId).value='';
  document.getElementById('pf-url-'+userId).value='';
}

async function deletePortfolioItem(id,userId){
  if(!confirm('삭제하시겠습니까?'))return;
  await sb.from('portfolio').delete().eq('id',id);
  const{data}=await sb.from('portfolio').select('*').order('created_at',{ascending:false});
  D.portfolio=data||[];
  renderPortfolioList(userId);
}

// 경력 계산 (년월 기준)
function calcCareer(startStr){
  if(!startStr) return '—';
  const start=new Date(startStr+'-01');
  const now=new Date();
  let years=now.getFullYear()-start.getFullYear();
  let months=now.getMonth()-start.getMonth();
  if(months<0){years--;months+=12;}
  if(years<=0&&months<=0) return '1개월 미만';
  if(years<=0) return months+'개월';
  if(months===0) return years+'년';
  return years+'년 '+months+'개월';
}

// 경력 설정
async function editCareer(uid){
  const u=D.users.find(x=>x.id===uid);
  if(!u) return;
  const lg=prompt('LG 입사 년월 (예: 2020-03)',u.lgCareerStart||'');
  if(lg===null) return;
  const teach=prompt('강의 시작 년월 (예: 2022-06)',u.teachCareerStart||'');
  if(teach===null) return;
  const updates={};
  if(lg) updates.lg_career_start=lg;
  if(teach) updates.teach_career_start=teach;
  if(Object.keys(updates).length){
    await sb.from('users').update(updates).eq('id',uid);
    if(lg) u.lgCareerStart=lg;
    if(teach) u.teachCareerStart=teach;
    openLecturer(uid,lectFromPage);
  }
}

function switchAnTab(name,btn){
  document.querySelectorAll('.an-tab-pane').forEach(p=>p.style.display='none');
  const pane=document.getElementById('an-tab-'+name);
  if(pane) pane.style.display='block';
  btn.parentElement.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

function switchLectTab(name,btn){
  document.querySelectorAll('.lect-tab-pane').forEach(p=>p.style.display='none');
  const pane=document.getElementById('lect-tab-'+name);
  if(pane) pane.style.display='block';
  btn.parentElement.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

/* ════════════════════════════════
   개선 포인트 — (롤백, 미사용)
════════════════════════════════ */
function _renderImprovePoints_disabled(userId){
  const container=document.getElementById('improve-points-content-'+userId);
  if(!container) return;
  const userVids=(D.videos||[]).filter(v=>v.userId===userId);
  const vidIds=new Set(userVids.map(v=>v.id));
  const evals=(D.evaluations||[]).filter(e=>e.video_id && vidIds.has(e.video_id) && e.overall_score>0);
  if(!evals.length){
    const isLoading = D.loadingDB;
    container.innerHTML=`<div style="padding:40px;text-align:center;color:var(--t3);background:#fafafa;border-radius:12px;border:1px dashed var(--bdr)">
      <div style="font-size:32px;margin-bottom:8px">${isLoading?'⏳':'🎯'}</div>
      <div style="font-size:14px;font-weight:700;color:var(--t1);margin-bottom:4px">${isLoading?'평가 데이터를 불러오는 중...':'아직 평가 데이터가 없습니다'}</div>
      <div style="font-size:12px;color:var(--t3)">${isLoading?'잠시만 기다려주세요':'AI 평가를 1회 이상 진행하면 개선 포인트가 자동으로 도출됩니다.'}</div>
    </div>`;
    return;
  }
  // 최근 3개월 평가만
  const threeMonthsAgo=new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth()-3);
  const recentEvals=evals.filter(e=>new Date(e.created_at||0)>=threeMonthsAgo);
  const targetEvals=recentEvals.length?recentEvals:evals;
  // 카테고리별 점수 집계 (sub_scores 기준)
  const catStats={};
  targetEvals.forEach(e=>{
    (e.sub_scores||[]).forEach(s=>{
      const cat=s.category||'기타';
      if(!catStats[cat]) catStats[cat]={sum:0,max:0,count:0,items:[]};
      catStats[cat].sum+=s.score||0;
      catStats[cat].max+=s.max||0;
      catStats[cat].count++;
      if(s.solution) catStats[cat].items.push(s);
    });
  });
  // 평균 점수% 계산 + 정렬 (낮은 순)
  const cats=Object.entries(catStats).map(([name,d])=>({
    name,
    pct:d.max>0?Math.round(d.sum/d.max*100):0,
    sum:d.sum, max:d.max, count:d.count,
    items:d.items
  })).filter(c=>c.max>0).sort((a,b)=>a.pct-b.pct);
  if(!cats.length){
    container.innerHTML=`<div style="padding:40px;text-align:center;color:var(--t3)">평가 데이터가 충분하지 않습니다.</div>`;
    return;
  }
  // 상위 3개 약점 카테고리
  const top3Weak=cats.slice(0,3);
  const overallAvg=cats.reduce((a,c)=>a+c.pct,0)/cats.length;
  // 학습 자료 / 링크에서 카테고리명 매칭
  const findRelatedMaterials=(catName)=>{
    const kw=catName.toLowerCase();
    const checklists=(D.checklists||[]).filter(c=>(c.name||'').toLowerCase().includes(kw)||(c.category||'').toLowerCase().includes(kw));
    const links=(D.learningLinks||[]).filter(l=>(l.name||'').toLowerCase().includes(kw)||(l.description||'').toLowerCase().includes(kw));
    return {checklists, links};
  };
  // 색상 함수
  const colorOf=(pct)=>pct>=85?'#10b981':pct>=70?'#f59e0b':'#ef4444';
  // HTML 렌더
  container.innerHTML=`
    <!-- 요약 카드 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
      <div style="border:1px solid var(--bdr);border-radius:14px;padding:18px;background:linear-gradient(135deg,rgba(0,120,200,.04),rgba(0,120,200,.01))">
        <div style="font-size:11px;color:var(--t3);font-weight:700;margin-bottom:6px">📊 분석 범위</div>
        <div style="font-size:22px;font-weight:900;color:var(--t1)">${targetEvals.length}<span style="font-size:13px;color:var(--t3);font-weight:700">건 평가</span></div>
        <div style="font-size:11px;color:var(--t3);margin-top:4px">${recentEvals.length?'최근 3개월':'전체 기간'} 기준</div>
      </div>
      <div style="border:1px solid var(--bdr);border-radius:14px;padding:18px;background:linear-gradient(135deg,${colorOf(overallAvg)}10,${colorOf(overallAvg)}03)">
        <div style="font-size:11px;color:var(--t3);font-weight:700;margin-bottom:6px">🎯 종합 평균</div>
        <div style="font-size:22px;font-weight:900;color:${colorOf(overallAvg)}">${Math.round(overallAvg)}<span style="font-size:13px;color:var(--t3);font-weight:700">점</span></div>
        <div style="font-size:11px;color:var(--t3);margin-top:4px">전 카테고리 평균</div>
      </div>
    </div>
    <!-- 약점 카테고리 카드 -->
    <div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:10px">🔥 우선 개선 포인트 ${top3Weak.length}개</div>
    <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:24px">
      ${top3Weak.map((c,i)=>{
        const mat=findRelatedMaterials(c.name);
        const color=colorOf(c.pct);
        return `<div style="border:1px solid var(--bdr);border-radius:14px;overflow:hidden;background:#fff">
          <div style="padding:16px 18px;background:${color}08;border-bottom:1px solid ${color}20;display:flex;align-items:center;gap:12px">
            <div style="width:36px;height:36px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;flex-shrink:0">${i+1}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:800;color:var(--t1)">${c.name}</div>
              <div style="font-size:11px;color:var(--t3);margin-top:2px">평균 ${c.pct}점 · ${c.count}회 평가</div>
            </div>
            <div style="flex-shrink:0;text-align:right">
              <div style="font-size:24px;font-weight:900;color:${color}">${c.pct}<span style="font-size:12px;color:var(--t3)">%</span></div>
            </div>
          </div>
          <!-- AI 코칭 솔루션 (가장 최근 ) -->
          ${c.items.length?`<div style="padding:14px 18px;border-bottom:1px solid var(--bdr)">
            <div style="font-size:11px;font-weight:700;color:var(--t3);margin-bottom:6px">💡 AI 추천 솔루션</div>
            <div style="font-size:12.5px;color:var(--t2);line-height:1.6">${(c.items[0].solution||c.items[0].text||'').replace(/</g,'&lt;')}</div>
          </div>`:''}
          <!-- 추천 학습 자료 -->
          <div style="padding:14px 18px">
            <div style="font-size:11px;font-weight:700;color:var(--t3);margin-bottom:8px">📘 추천 학습</div>
            ${(mat.checklists.length||mat.links.length)?
              [...mat.checklists.map(cl=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fafafa;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="showPage('page-edu')">
                <span style="font-size:14px">📋</span>
                <span style="font-size:12.5px;color:var(--t1);font-weight:600">${(cl.name||'').replace(/</g,'&lt;')}</span>
                <span style="font-size:10px;color:var(--t3);margin-left:auto">체크리스트</span>
              </div>`),
              ...mat.links.map(lk=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fafafa;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="window.open('${(lk.url||'').replace(/'/g,"\\'")}','_blank')">
                <span style="font-size:14px">🔗</span>
                <span style="font-size:12.5px;color:var(--t1);font-weight:600">${(lk.name||'').replace(/</g,'&lt;')}</span>
                <span style="font-size:10px;color:var(--t3);margin-left:auto">학습 링크</span>
              </div>`)].join('')
            :`<div style="padding:10px;font-size:11.5px;color:var(--t3);background:#fafafa;border-radius:8px">관련 학습 자료 등록 시 여기 자동 표시됩니다. <a href="javascript:showPage('page-edu')" style="color:var(--blue);font-weight:700">교육콘텐츠 →</a></div>`}
          </div>
        </div>`;
      }).join('')}
    </div>
    <!-- 강점 카테고리 (참고) -->
    ${cats.length>3?`<div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:10px">✨ 강점 영역 (계속 유지)</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${cats.slice(-3).reverse().map(c=>`<div style="padding:8px 14px;border:1px solid #d1fae5;background:#ecfdf5;border-radius:999px;font-size:11.5px;color:#065f46;font-weight:700">
        ${c.name} <span style="color:#10b981;margin-left:4px">${c.pct}%</span>
      </div>`).join('')}
    </div>`:''}
  `;
}

