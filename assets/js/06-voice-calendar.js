/* 06-voice-calendar.js — 보이스 분석 + 캘린더 + 삭제요청/관리자 알림
   (index.html 12602~14323행에서 분리 · 로드 순서 유지 필수) */
/* ════════════════════════════════
   VOICE ANALYSIS PAGE
════════════════════════════════ */
let vaStream=null,vaRecorder=null,vaChunks=[],vaTimerID=null,vaSec=0,vaAudioCtx=null,vaAnalyser=null,vaAnimId=null;
let vaRecognition=null,vaSTTText='',vaSTTLines=[];

// ── (제거) 구버전 page-checklist 페이지 함수들 (openChecklist/uploadChecklist/renderChecklists)
//    교육콘텐츠(page-edu) 의 체크리스트 관리가 대체. phantom page-checklist div 정의도 없음.
//    downloadChecklist 만 유지 (다른 곳에서 호출됨)
function downloadChecklist(id){
  const c=(D.checklists||[]).find(x=>x.id===id);
  if(!c||!c.file_data) return;
  const a=document.createElement('a');
  a.href=c.file_data;
  a.download=c.file_name||'download';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

/* ════════════════════════════════
   CALENDAR
════════════════════════════════ */
let calDate=new Date();
let calEvents=[];
let calEditId=null;

function openCalendar(){
  calDate=new Date();
  loadCalEvents();
  showPage('page-calendar');
}

async function loadCalEvents(){
  // /api/db/load에서 이미 받은 데이터 사용 (조직 필터 적용됨)
  const all=D.calendarEvents||[];
  // 관리자(메인): 전체 표시
  // 그 외: pick_visible(공개) + 본인이 등록한 것 + 같은 조직 관리자/부관리자가 등록한 것
  const myOrg=CU?.orgName||CU?.channel||null;
  // 같은 조직의 관리자·부관리자 ID 목록
  const sameOrgAdminIds=new Set(
    (D.users||[])
      .filter(u=>!u.deleted && u.isSubAdmin && (u.orgName||u.channel)===myOrg)
      .map(u=>u.id)
  );
  calEvents=all.filter(e=>{
    // 메인 관리자(id=0) 또는 부관리자 본인은 본인 + 본인 조직 모두 봄
    if(CU?.email==='admin') return true;  // 진짜 관리자(슈퍼) 모든 일정 봄
    // pick_visible 인 일정은 모두 보임 (관리자가 인터픽 노출용으로 등록)
    if(e.pick_visible) return true;
    // 본인이 등록한 것
    if(e.user_id && CU?.id && String(e.user_id)===String(CU.id)) return true;
    // 같은 조직의 관리자/부관리자가 등록한 것
    if(e.user_id && sameOrgAdminIds.has(e.user_id)) return true;
    // 또는 같은 조직 일정 (org_name 기반)
    if(myOrg && e.org_name && e.org_name===myOrg && CU?.isSubAdmin) return true;
    return false;
  }).map(e=>({...e,start_time:new Date(e.start_time),end_time:new Date(e.end_time)}));
  renderCalendar();
}

function renderCalendar(){
  const y=calDate.getFullYear(), m=calDate.getMonth();
  el('cal-title').textContent=`${y}년 ${m+1}월`;

  // 요일 헤더
  el('cal-header').innerHTML=['일','월','화','수','목','금','토'].map(d=>`<div class="cal-day-hdr">${d}</div>`).join('');

  // 달력 날짜
  const first=new Date(y,m,1);
  const last=new Date(y,m+1,0);
  const startDay=first.getDay();
  const totalDays=last.getDate();
  const prevLast=new Date(y,m,0).getDate();
  const today=new Date();

  let html='';
  // 이전 달
  for(let i=startDay-1;i>=0;i--){
    const d=prevLast-i;
    html+=`<div class="cal-day" onclick="openCalEventModal('${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}')"><div class="cal-day-num other">${d}</div></div>`;
  }
  // 이번 달
  for(let d=1;d<=totalDays;d++){
    const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===d;
    const thisDay=new Date(y,m,d);
    const thisDayEnd=new Date(y,m,d,23,59,59);
    const thisDayStart=new Date(y,m,d,0,0,0);
    const dayEvents=calEvents.filter(e=>{
      const es=new Date(e.start_time), ee=new Date(e.end_time);
      return es<=thisDayEnd && ee>=thisDayStart;
    });
    const evHtml=dayEvents.slice(0,3).map(e=>{
      const es=new Date(e.start_time), ee=new Date(e.end_time);
      const isStart=es.getFullYear()===y&&es.getMonth()===m&&es.getDate()===d;
      const isEnd=ee.getFullYear()===y&&ee.getMonth()===m&&ee.getDate()===d;
      const borderL=isStart?'border-radius:4px 0 0 4px':'border-radius:0';
      const borderR=isEnd?'border-radius:0 4px 4px 0':'';
      const radius=isStart&&isEnd?'border-radius:4px':'';
      const finalRadius=isStart&&isEnd?'border-radius:4px':isStart?'border-radius:4px 0 0 4px':isEnd?'border-radius:0 4px 4px 0':'border-radius:0';
      const ownerName=(CU?.isAdmin&&e.user_id)?(D.users.find(u=>u.id===e.user_id)?.name||''):'';
      const label=isStart?(ownerName?ownerName+' | ':'')+e.title:'';
      return `<div class="cal-ev-chip" style="background:${e.color||'#0078C8'};${finalRadius};margin-right:${isEnd?'0':'-4px'};margin-left:${isStart?'0':'-4px'}" onclick="event.stopPropagation();editCalEvent(${e.id})">${label}</div>`;
    }).join('');
    const more=dayEvents.length>3?`<div style="font-size:10px;color:var(--t3)">+${dayEvents.length-3}개</div>`:'';
    html+=`<div class="cal-day" onclick="openCalEventModal('${dateStr}')"><div class="cal-day-num${isToday?' today':''}">${d}</div>${evHtml}${more}</div>`;
  }
  // 다음 달
  const remain=42-(startDay+totalDays);
  for(let d=1;d<=remain;d++){
    html+=`<div class="cal-day"><div class="cal-day-num other">${d}</div></div>`;
  }
  el('cal-grid').innerHTML=html;
}

function calNav(dir){
  calDate.setMonth(calDate.getMonth()+dir);
  renderCalendar();
}
function calToday(){
  calDate=new Date();
  renderCalendar();
}

function openCalEventModal(dateStr){
  calEditId=null;
  el('cal-modal-title').textContent='일정 추가';
  el('cal-ev-title').value='';
  el('cal-ev-desc').value='';
  el('cal-ev-cat').value='교육';
  el('cal-ev-color').value='#0078C8';
  el('cal-ev-err').textContent='';
  el('cal-ev-del-btn').style.display='none';

  const dateVal=dateStr||new Date().toISOString().slice(0,10);
  el('cal-ev-start-date').value=dateVal;
  el('cal-ev-start-time').value='09:00';
  el('cal-ev-end-date').value=dateVal;
  el('cal-ev-end-time').value='10:00';
  // 인터PICK 체크박스 (관리자/부관리자만)
  const pickWrap=el('cal-ev-pick-wrap');
  if(pickWrap) pickWrap.style.display=(CU?.isAdmin)?'block':'none';
  const pickCb=document.getElementById('cal-ev-pick');
  if(pickCb) pickCb.checked=false;
  el('cal-event-overlay').classList.add('show');
}

function editCalEvent(id){
  const ev=calEvents.find(e=>e.id===id);
  if(!ev) return;
  calEditId=id;
  el('cal-modal-title').textContent='일정 수정';
  el('cal-ev-title').value=ev.title||'';
  el('cal-ev-desc').value=ev.description||'';
  el('cal-ev-cat').value=ev.category||'교육';
  el('cal-ev-color').value=ev.color||'#0078C8';

  const s=new Date(ev.start_time), e2=new Date(ev.end_time);
  const fmtD=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const fmtT=d=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  el('cal-ev-start-date').value=fmtD(s);
  el('cal-ev-start-time').value=fmtT(s);
  el('cal-ev-end-date').value=fmtD(e2);
  el('cal-ev-end-time').value=fmtT(e2);

  // 수정/삭제 권한: 본인 또는 관리자
  const canEdit=CU&&(CU.isAdmin||(ev.user_id&&CU.id===ev.user_id));
  el('cal-ev-del-btn').style.display=canEdit?'':'none';
  el('cal-ev-err').textContent='';
  // 인터PICK 체크박스
  const pickWrap=el('cal-ev-pick-wrap');
  if(pickWrap) pickWrap.style.display=(CU?.isAdmin)?'block':'none';
  const pickCb=document.getElementById('cal-ev-pick');
  if(pickCb) pickCb.checked=!!ev.pick_visible;
  el('cal-event-overlay').classList.add('show');
}

async function saveCalEvent(){
  const title=v('cal-ev-title').trim();
  if(!title){el('cal-ev-err').textContent='제목을 입력하세요.';return;}
  const startDate=v('cal-ev-start-date'), startTime=v('cal-ev-start-time');
  const endDate=v('cal-ev-end-date'), endTime=v('cal-ev-end-time');
  if(!startDate||!endDate){el('cal-ev-err').textContent='날짜를 입력하세요.';return;}

  const pickCb=document.getElementById('cal-ev-pick');
  const data={
    title,
    description:v('cal-ev-desc'),
    start_time:new Date(`${startDate}T${startTime||'09:00'}`).toISOString(),
    end_time:new Date(`${endDate}T${endTime||'10:00'}`).toISOString(),
    color:v('cal-ev-color'),
    category:v('cal-ev-cat'),
    user_id:CU?.id||null,
    pick_visible:pickCb?.checked||false
  };

  if(calEditId){
    await sb.from('calendar_events').update(data).eq('id',calEditId);
  } else {
    await sb.from('calendar_events').insert({...data,org_name:curOrg()});
  }
  closeOverlay('cal-event-overlay');
  await loadFromDB(); // D.calendarEvents 갱신 (조직 필터 적용)
  await loadCalEvents();
}

async function deleteCalEvent(){
  if(!calEditId||!confirm('삭제하시겠습니까?')) return;
  await sb.from('calendar_events').delete().eq('id',calEditId);
  closeOverlay('cal-event-overlay');
  await loadFromDB(); // D.calendarEvents 갱신
  await loadCalEvents();
}

/* ════════════════════════════════
   DELETE REQUEST / ADMIN NOTIFICATIONS
════════════════════════════════ */
let _delReqVideoId=null;

// 관리자: 직접 삭제
async function adminDeleteVideo(videoId){
  if(!confirm('이 평가를 삭제하시겠습니까?')) return;
  await sb.from('timestamps').delete().eq('video_id',videoId);
  await sb.from('videos').delete().eq('id',videoId);
  await loadFromDB();
  alert('삭제되었습니다.');
  showPage('page-pick');
}

// 본인: 삭제 요청 모달
function openDeleteRequest(videoId,videoTitle){
  _delReqVideoId=videoId;
  el('delreq-info').textContent=`"${videoTitle}" 평가 삭제를 요청합니다.`;
  el('delreq-reason').value='';
  el('delreq-err').textContent='';
  el('delreq-overlay').classList.add('show');
}

async function submitDeleteRequest(){
  const reason=v('delreq-reason').trim();
  if(!reason){el('delreq-err').textContent='사유를 입력하세요.';return;}
  const orgName=D.activeOrg || CU?.orgName || CU?.channel || null;
  await sb.from('delete_requests').insert({
    user_id:CU?.id||null,
    user_name:CU?.name||'',
    video_id:_delReqVideoId,
    reason,
    status:'pending',
    org_name:orgName
  });
  // 알림 — 자기 조직 부관리자 + 진짜 관리자(id=0)
  try{
    const vid=(D.videos||[]).find(x=>String(x.id)===String(_delReqVideoId));
    const title='🗑 영상 삭제 요청';
    const body=`${CU?.name||'강사'} — ${vid?.title||'영상'}`;
    const subAdmins=(D.users||[]).filter(u=>!u.deleted && u.isSubAdmin && u.orgName===orgName);
    subAdmins.forEach(u=>{ dbCreateNotification({userId:u.id,type:'delete_request',title,body,link:'page-admin',orgName}); });
    dbCreateNotification({userId:0,type:'delete_request',title,body,link:'page-admin',orgName});
  }catch(e){ console.warn('delete_request notif:',e); }
  await loadFromDB();
  closeOverlay('delreq-overlay');
  alert('삭제 요청이 접수되었습니다. 관리자 승인 후 삭제됩니다.');
}

// 관리자: 알림 목록
function openNotifications(){
  const pending=(D.deleteRequests||[]).filter(r=>r.status==='pending');
  const all=(D.deleteRequests||[]);

  el('notif-list').innerHTML=pending.length?pending.map(r=>{
    const vid=D.videos.find(v=>v.id===r.video_id);
    return `<div style="padding:14px;border-bottom:1px solid rgba(0,0,0,.18);display:flex;gap:12px;align-items:flex-start">
      <div style="width:8px;height:8px;border-radius:50%;background:var(--red);margin-top:6px;flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:700">${r.user_name||'알 수 없음'}</div>
        <div style="font-size:12px;color:var(--t3);margin-top:2px">영상: ${vid?.title||'삭제된 영상'} · ${new Date(r.created_at).toLocaleDateString()}</div>
        <div style="font-size:13px;color:var(--t2);margin-top:6px;padding:8px 12px;background:#f8f9fa;border-radius:8px;border-left:3px solid var(--orange)">
          <strong>사유:</strong> ${r.reason}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-red" style="padding:5px 14px;font-size:12px" onclick="approveDeleteRequest(${r.id},${r.video_id})">승인 (삭제)</button>
          <button class="btn btn-ghost" style="padding:5px 14px;font-size:12px" onclick="rejectDeleteRequest(${r.id})">거절</button>
        </div>
      </div>
    </div>`;
  }).join(''):'<div style="padding:30px;text-align:center;color:var(--t3)">새로운 알림이 없습니다.</div>';

  // 이전 처리 내역
  const processed=all.filter(r=>r.status!=='pending');
  if(processed.length){
    el('notif-list').innerHTML+=`<div style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--t3);background:#f8f9fa;border-top:1px solid rgba(0,0,0,.18)">이전 처리 내역</div>`;
    el('notif-list').innerHTML+=processed.slice(0,10).map(r=>`
      <div style="padding:10px 14px;border-bottom:1px solid rgba(0,0,0,.08);opacity:.6">
        <div style="font-size:12px"><strong>${r.user_name}</strong> · ${r.status==='approved'?'<span style="color:var(--red)">삭제됨</span>':'<span style="color:var(--t3)">거절됨</span>'} · ${new Date(r.created_at).toLocaleDateString()}</div>
        <div style="font-size:11px;color:var(--t3)">${r.reason}</div>
      </div>`).join('');
  }

  el('notif-overlay').classList.add('show');
}

async function approveDeleteRequest(reqId,videoId){
  if(!confirm('삭제를 승인하시겠습니까? 해당 평가가 영구 삭제됩니다.')) return;
  // 영상+타임스탬프 삭제
  await sb.from('timestamps').delete().eq('video_id',videoId);
  await sb.from('videos').delete().eq('id',videoId);
  // 요청 상태 업데이트
  await sb.from('delete_requests').update({status:'approved'}).eq('id',reqId);
  await loadFromDB();
  openNotifications(); // 새로고침
  updateHeaderUI();
}

async function rejectDeleteRequest(reqId){
  await sb.from('delete_requests').update({status:'rejected'}).eq('id',reqId);
  await loadFromDB();
  openNotifications();
  updateHeaderUI();
}

// ── (제거) 구버전 page-links 페이지 함수들 (openLearningLinks/renderLinks/addLearningLink/removeLearningLink)
//    교육콘텐츠(page-edu) 의 addEduLink/deleteLink 가 대체. phantom page-links div 정의도 없음.

function openVoiceAnalysis(){
  el('va-step1').style.display='';
  el('va-step2').style.display='none';
  const pdfBtn=el('va-pdf-btn');if(pdfBtn)pdfBtn.style.display='none';
  el('va-title').value='';el('va-count').value='';
  const vaProd=el('va-product');if(vaProd){const cats=getEduCategories();vaProd.innerHTML='<option value="">선택</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join('');}
  const vaEduType=el('va-edu-type');if(vaEduType){const types=getEduTypes();vaEduType.innerHTML='<option value="">선택</option>'+types.map(t=>`<option value="${t}">${t}</option>`).join('');}
  el('va-file-name').textContent='음성/영상 파일 업로드 (mp3, wav, mp4)';
  el('va-cl-name').textContent='없음';
  // 제품 셀렉트 초기화
  const vaProdSel=document.getElementById('va-prod-select');
  if(vaProdSel&&vaProdSel.options.length<=1){
    Object.entries(PRODUCT_TREE).forEach(([g,items])=>{
      const og=document.createElement('optgroup');og.label=g;
      items.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;og.appendChild(o);});
      vaProdSel.appendChild(og);
    });
  }
  const vaEdu=document.getElementById('va-edu-files');if(vaEdu)vaEdu.style.display='none';
  showPage('page-voice');
}

function loadVoiceEduFiles(){
  const cat=document.getElementById('va-product')?.value||'';
  const wrap=document.getElementById('va-edu-files');
  const list=document.getElementById('va-edu-file-list');
  if(!wrap||!list) return;
  if(!cat){wrap.style.display='none';return;}
  const files=(D.checklists||[]).filter(c=>(c.category||'')===cat);
  if(!files.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  list.innerHTML=files.map(f=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onclick="applyVoiceEduFile('${f.file_url}','${(f.name||'').replace(/'/g,"\\'")}')">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <div style="flex:1;font-size:11px;font-weight:600">${f.name}</div>
    <span style="font-size:10px;color:var(--blue)">적용</span>
  </div>`).join('');
}
function applyVoiceEduFile(url,name){
  document.getElementById('va-cl-name').textContent=name+' (교육자료 적용)';
  if(!document.getElementById('va-checklist-url')){
    const h=document.createElement('input');h.type='hidden';h.id='va-checklist-url';document.body.appendChild(h);
  }
  document.getElementById('va-checklist-url').value=url;
  document.getElementById('va-edu-files').style.display='none';
}

function toggleVoiceRec(){
  const btn=el('va-rec-btn');
  const pauseBtn=el('va-pause-btn');
  if(!vaRecorder||vaRecorder.state==='inactive'){
    navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
      vaStream=stream;
      vaChunks=[];
      vaRecorder=new MediaRecorder(stream);
      vaRecorder.ondataavailable=e=>{if(e.data.size>0)vaChunks.push(e.data);};
      vaRecorder.start();
      btn.innerHTML='⏹ 녹음 완료'; btn.style.background='var(--t1)'; btn.style.color='#fff';
      if(pauseBtn){pauseBtn.style.display='inline-flex';}
      el('va-status').textContent='녹음 중'; el('va-status').className='stream-status ss-recording';
      vaSec=0;
      vaTimerID=setInterval(()=>{
        vaSec++;
        el('va-timer').textContent=String(Math.floor(vaSec/60)).padStart(2,'0')+':'+String(vaSec%60).padStart(2,'0');
      },1000);
      // Waveform
      vaAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
      const src=vaAudioCtx.createMediaStreamSource(stream);
      vaAnalyser=vaAudioCtx.createAnalyser();vaAnalyser.fftSize=256;vaAnalyser.smoothingTimeConstant=0.75;
      src.connect(vaAnalyser);
      drawVaWave();
      // Speech-to-Text (Web Speech API)
      try{
        const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
        if(SR){
          vaRecognition=new SR();
          vaRecognition.lang='ko-KR';
          vaRecognition.continuous=true;
          vaRecognition.interimResults=true;
          vaSTTText='';vaSTTLines=[];
          el('va-stt-area').style.display='block';
          el('va-stt-text').textContent='음성 인식 대기 중...';
          vaRecognition.onresult=function(e){
            let interim='',final='';
            for(let i=e.resultIndex;i<e.results.length;i++){
              if(e.results[i].isFinal){
                const txt=e.results[i][0].transcript.trim();
                if(txt){
                  const time=String(Math.floor(vaSec/60)).padStart(2,'0')+':'+String(vaSec%60).padStart(2,'0');
                  vaSTTLines.push({time,text:txt});
                  final+=txt+' ';
                }
              } else {interim+=e.results[i][0].transcript;}
            }
            if(final) vaSTTText+=final;
            el('va-stt-text').textContent=(vaSTTText||'')+interim;
            el('va-stt-area').scrollTop=el('va-stt-area').scrollHeight;
          };
          vaRecognition.onerror=function(e){console.log('STT error:',e.error);};
          vaRecognition.onend=function(){if(vaRecorder&&vaRecorder.state==='recording')try{vaRecognition.start();}catch(e){}};
          vaRecognition.start();
        }
      }catch(e){console.log('Speech API not supported');}
    }).catch(err=>alert('마이크 권한이 필요합니다: '+err.message));
  } else {
    vaRecorder.stop();
    if(vaStream){vaStream.getTracks().forEach(t=>t.stop());vaStream=null;}
    if(vaRecognition){try{vaRecognition.stop();}catch(e){}vaRecognition=null;}
    btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg> 다시 녹음';
    btn.style.background='';btn.style.color='';
    const pauseBtn2=el('va-pause-btn');if(pauseBtn2)pauseBtn2.style.display='none';
    el('va-status').textContent='녹음 완료'; el('va-status').className='stream-status ss-done';
    clearInterval(vaTimerID);
    if(vaAnimId){cancelAnimationFrame(vaAnimId);vaAnimId=null;}
    if(vaAudioCtx){vaAudioCtx.close();vaAudioCtx=null;vaAnalyser=null;}
    if(vaSTTText) el('va-stt-text').textContent=vaSTTText;
  }
}
function toggleVoicePause(){
  if(!vaRecorder) return;
  const btn=el('va-pause-btn');
  if(vaRecorder.state==='recording'){
    vaRecorder.pause();
    clearInterval(vaTimerID);
    if(vaRecognition) try{vaRecognition.stop();}catch(e){}
    if(btn) btn.innerHTML='▶ 재개';
    el('va-status').textContent='일시정지'; el('va-status').className='stream-status ss-ready';
  } else if(vaRecorder.state==='paused'){
    vaRecorder.resume();
    vaTimerID=setInterval(()=>{
      vaSec++;
      el('va-timer').textContent=String(Math.floor(vaSec/60)).padStart(2,'0')+':'+String(vaSec%60).padStart(2,'0');
    },1000);
    if(vaRecognition) try{vaRecognition.start();}catch(e){}
    if(btn) btn.innerHTML='⏸ 일시정지';
    el('va-status').textContent='녹음 중'; el('va-status').className='stream-status ss-recording';
  }
}

function drawVaWave(){
  const canvas=el('va-waveform');if(!canvas||!vaAnalyser)return;
  const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;
  const buf=new Uint8Array(vaAnalyser.frequencyBinCount);
  function draw(){
    vaAnimId=requestAnimationFrame(draw);
    vaAnalyser.getByteFrequencyData(buf);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
    let sum=0;for(let i=0;i<buf.length;i++)sum+=buf[i];
    const avg=sum/buf.length;const db=Math.round(avg*0.4);
    el('va-db-live').innerHTML=db+' <span style="font-size:10px;color:var(--t3)">dB</span>';
    const bars=40;const gap=1;const bw=(W-(bars-1)*gap)/bars;
    const step=Math.floor(buf.length/bars);
    for(let i=0;i<bars;i++){
      const val=buf[i*step]/255;const bh=Math.max(2,val*H*.85);
      const r=Math.round(val*226);const g=Math.round(120-val*90);const b=Math.round(200-val*170);
      ctx.fillStyle=`rgba(${r},${g},${b},${.3+val*.7})`;
      const x=i*(bw+gap);const y=(H-bh)/2;
      ctx.beginPath();ctx.roundRect(x,y,bw,bh,2);ctx.fill();
    }
  }
  draw();
}

function stopVoiceRec(){
  if(vaStream){vaStream.getTracks().forEach(t=>t.stop());vaStream=null;}
  if(vaRecorder&&vaRecorder.state!=='inactive')vaRecorder.stop();
  clearInterval(vaTimerID);vaSec=0;
  if(vaAnimId){cancelAnimationFrame(vaAnimId);vaAnimId=null;}
  if(vaAudioCtx){vaAudioCtx.close();vaAudioCtx=null;vaAnalyser=null;}
}

async function runVoiceAnalysis(){
  if(!requireAnalysisPermission('스피치 평가 분석')) return;
  const title=v('va-title').trim();
  if(!title){alert('강의 제목을 입력하세요.');return;}
  const hasFile=el('va-file').files?.length>0;
  const hasRec=vaChunks.length>0;
  if(!hasFile&&!hasRec){alert('녹음하거나 파일을 업로드하세요.');return;}

  const count=parseInt(v('va-count'))||20;
  const tone=v('va-tone');
  const checklistId=parseInt(document.getElementById('va-cl-select')?.value||'0')||null;
  const eduFileUrl=document.getElementById('va-checklist-url')?.value||'';
  const hasCL=!!checklistId||el('va-checklist').files?.length>0||!!document.getElementById('va-cl-url')?.value;

  // 스피치 예상 시간 (Pro 기준, 단일 호출)
  // 업로드 10s + Pro 호출 (25s + 길이*10%) + 저장 5s
  // 5분: 10+25+30+5 = 70s
  // 20분: 10+25+120+5 = 160s (2.7분)
  // 1시간: 10+25+360+5 = 400s (6.7분)
  const vaTmpFile=el('va-file').files?.[0];
  const vaTmpDur=vaTmpFile?await readVideoDuration(vaTmpFile).catch(()=>0):0;
  showAiLoading(true,Math.max(90,Math.round(40+vaTmpDur*0.1)));
  setAiLoadingStep('스피치 분석 준비 중...');
  // 스피치는 교육맞춤평가 단계 스킵 표시
  setAiLoadingStage('crit','done');

  el('va-step1').style.display='none';
  el('va-step2').style.display='';

  if(!hasCL){
    el('va-criteria-result').parentElement.parentElement.style.display='none';
    el('va-split').style.gridTemplateColumns='1fr';
  } else {
    el('va-criteria-result').parentElement.parentElement.style.display='';
    el('va-split').style.gridTemplateColumns='1fr 1fr';
  }

  el('va-ai-result').innerHTML='<div style="text-align:center;padding:20px;color:var(--t3)">AI 스피치 분석 중...</div>';
  el('va-report').innerHTML='';

  try {
    // 1) 파일 업로드 (GCS)
    setAiLoadingStep('음성 파일 업로드 중...');
    setAiLoadingStage('upload','active');
    let audioFile=el('va-file').files?.[0];
    if(!audioFile&&hasRec){ audioFile=new Blob(vaChunks,{type:'audio/webm'}); audioFile.name='recording.webm'; }
    const up=await uploadAnalysisVideo(audioFile);
    setAiLoadingStage('upload','done');
    const audioUrl=up.public_url;
    const audioGcsUri=up.gcs_uri;
    const audioMime=audioFile.type||'audio/webm';

    // 2) 체크리스트 로드
    setAiLoadingStep('체크리스트 로드 중...');
    setAiLoadingStage('checklist','active');
    let checklistItems=[];
    if(checklistId) checklistItems=await loadChecklistItemsForEval(checklistId);
    setAiLoadingStage('checklist','done');

    // 3) 길이 → 적응형 fps
    let durSec=await readVideoDuration(audioFile).catch(()=>0);
    // duration 못 읽으면 파일 크기로 추정 (192kbps 기준 ≈ 초당 24KB)
    if(!durSec&&audioFile.size) durSec=Math.round(audioFile.size/24000);
    // 오디오/비디오 토큰 한도 사전 체크
    const isPureAudio=(audioFile.type||'').startsWith('audio');
    // 오디오는 AI 토큰 제약으로 약 65분 이상은 한도 초과
    // 비디오는 fps로 조절 가능 → 거의 무제한
    if(isPureAudio && durSec > 60*65){
      showAiLoading(false);
      alert(`오디오가 너무 깁니다 (${Math.round(durSec/60)}분).\n\n65분 이하로 잘라서 다시 업로드해주세요.\n(AI 오디오 분석 한도: 약 65분)`);
      return;
    }
    // 안전 마진을 더 보수적으로 (토큰 max 70K)
    const fps=(()=>{
      if(!durSec||durSec<=0) return 0.2;
      const maxTokens=70000;
      const ideal=maxTokens/(durSec*263);
      if(ideal>=1) return 1.0;
      if(ideal>=0.5) return 0.5;
      if(ideal>=0.25) return 0.25;
      if(ideal>=0.15) return 0.15;
      if(ideal>=0.1) return 0.1;
      if(ideal>=0.06) return 0.06;
      return 0.04;
    })();

    // 4) 스피치 AI독자 호출 — Flash 먼저, 토큰 초과 시 Pro(1M 컨텍스트)로 전환
    setAiLoadingStep('AI 스피치 분석 중...');
    let aiResRaw=null;
    const attempts=[
      {model:'gemini-2.5-flash', fps:fps, label:'표준'},
      {model:'gemini-2.5-flash', fps:0.1, label:'최적화 1'},
      {model:'gemini-2.5-flash', fps:0.04, label:'최적화 2'},
      {model:'gemini-2.5-pro', fps:0.5, label:'정밀'},
      {model:'gemini-2.5-pro', fps:0.2, label:'정밀(안전)'},
    ];
    let lastErr=null;
    setAiLoadingStage('ai','active');
    for(let i=0;i<attempts.length&&!aiResRaw;i++){
      const a=attempts[i];
      setAiLoadingStep(`AI 스피치 분석 중 (${a.label})...`);
      try{
        aiResRaw=await callVertexAnalyze({
          video_url:audioUrl, video_gcs_uri:audioGcsUri, video_mime:audioMime, fps:a.fps,
          // 체크리스트 없을 때 풍부한 기본 평가 기준 (8개 항목, 4개 카테고리) — AI 차트가 단조롭게 나오는 문제 해결
          checklist_items:checklistItems.length?checklistItems:[
            {category:'발성',sub_item:'발성 안정성',criterion:'고른 발성과 호흡 안정성',max_score:100,detail:'',sort_order:0},
            {category:'발성',sub_item:'음성 품질',criterion:'발성 크기·맑기·울림',max_score:100,detail:'',sort_order:1},
            {category:'발음',sub_item:'발음 명확도',criterion:'자음·모음의 정확한 전달',max_score:100,detail:'',sort_order:2},
            {category:'발음',sub_item:'억양 자연성',criterion:'문장 흐름에 따른 자연스러운 억양 변화',max_score:100,detail:'',sort_order:3},
            {category:'전달력',sub_item:'속도 적절성',criterion:'경청 가능한 속도 (200~230 WPM 권장)',max_score:100,detail:'',sort_order:4},
            {category:'전달력',sub_item:'간격·호흡',criterion:'문장 사이 적절한 휴식과 끊김',max_score:100,detail:'',sort_order:5},
            {category:'표현력',sub_item:'강조·변화',criterion:'중요 부분의 강조와 단조롭지 않은 변화',max_score:100,detail:'',sort_order:6},
            {category:'표현력',sub_item:'신뢰·몰입',criterion:'청자가 받는 전반적 신뢰감과 몰입도',max_score:100,detail:'',sort_order:7}
          ],
          eval_type:'AI독자',
          edu_file_url:eduFileUrl||undefined,
          model:a.model
        });
      }catch(e){
        lastErr=e;
        // 일시 장애 (504/timeout/rate limit) → 다음 모델·fps 시도
        // 인증 만료 등 영구 오류는 즉시 throw
        if(!/input token count|INVALID_ARGUMENT|RESOURCE_EXHAUSTED|504|FUNCTION_INVOCATION_TIMEOUT|deployment|timeout|503|overloaded|네트워크/i.test(e.message||'')) throw e;
      }
    }
    if(!aiResRaw) throw new Error('일시적인 서버 부하로 분석 실패. 잠시 후 다시 시도해주세요. ('+(lastErr?.message||'')+')');
    setAiLoadingStage('ai','done');
    setAiLoadingStage('save','active');
    const aiRes=normalizeVertexResult(aiResRaw);
    window._lastVertexResult={crit:null,ai:aiRes};
    // voice_evals 레코드 생성 → id 확보 후 evaluations 연결
    let voiceEvalId=null;
    try{
      // 하드코딩 관리자(email='admin')만 null; 실계정(부관리자 포함)은 본인 id 사용
    if(CU?.email==='admin'){alert('평가 업로드는 강사 본인 계정으로 진행해주세요.');return;}
    const userId=CU?.id||null;
    if(!userId){alert('로그인 계정을 확인할 수 없습니다.');return;}
      const eduType=v('va-edu-type')||'';
      const insertData={user_name:CU?.name||'관리자', title, score:aiRes.overall_score||0,
        tone, student_count:count, eval_date:new Date().toISOString().split('T')[0],
        result_data:{eduType,analysis:aiRes},
        org_name: curOrg()};
      if(userId) insertData.user_id=userId;
      if(eduType) insertData.edu_type=eduType;
      let {data:vRow,error:vErr}=await sb.from('voice_evals').insert(insertData).select().single();
      if(vErr && (vErr.message||'').toLowerCase().includes('edu_type')){
        delete insertData.edu_type;
        ({data:vRow}=await sb.from('voice_evals').insert(insertData).select().single());
      }
      voiceEvalId=vRow?.id||null;
      if(voiceEvalId) notifyAdminsOfUpload({kind:'voice', title, uploaderId:userId, orgName:insertData.org_name, link:'page-admin'}).catch(()=>{});
    }catch(e){console.warn('voice_evals insert failed:',e);}
    await saveEvaluation({videoId:null,voiceEvalId,checklistId:checklistId||null,eduFileUrl:eduFileUrl||null,evalType:'AI독자',result:aiRes});
    await loadFromDB();
    window._anVoiceEvalId=voiceEvalId;
    const mapped=mapVertexToLegacy(null,aiRes);
    renderVoiceResult(mapped,count,tone);
    setAiLoadingStage('save','done');
    setTimeout(()=>showAiLoading(false),400);
  } catch(e){
    console.error('스피치 분석 실패:',e);
    showAiLoading(false);
    alert('스피치 분석 실패: '+e.message);

    // 폴백: 목업 데이터 표시
    const mock=generateMockVoice(count,tone);
    renderVoiceResult(mock,hasCL,count,tone);
    autoSaveVoice(mock,count,tone);
  } // catch(e) 끝
} // runVoiceAnalysis 끝

function generateMockVoice(count,tone){
  const role=v('va-role')||'현장강사';
  const task=v('va-task')||'교육 강의';
  return {
    decibel:{current:74,recommended_min:70,recommended_max:82,status:'적정',
      comment:`${count}명 교육장 기준 74dB로 적정 범위. 단, 00:42~01:10 구간에서 67dB로 저하되어 뒷줄 교육생 청취에 어려움 예상. 제품 시연 중 고개를 숙이면서 볼륨이 줄어드는 패턴 감지.`},
    tempo:{wpm:148,recommended_min:130,recommended_max:160,status:'주의',
      comment:'평균 148 WPM으로 적정하나, 00:32~00:48 제품 스펙 설명 구간에서 182 WPM까지 급상승. "MOF 소재, 노벨 화학상, 유증기 및 암모니아" 부분에서 교육생이 따라가기 어려운 속도. 반면 00:49~01:13 맞춤케어 설명에서는 128 WPM으로 안정적.'},
    tone_match:{score:78,percent:73,target:tone,actual:'전반적으로 밝고 자신감 있으나, 제품 설명 시 읽는 듯한 톤 전환',
      comment:`목표 분위기 "${tone}"에 73% 부합. 오프닝(00:00~00:18)은 높은 적합도(92%)를 보이나, 기술 스펙 설명(00:32~00:48)에서 교과서 읽기 톤으로 전환되며 적합도 54%까지 하락. 맞춤케어 구간(00:49~01:13)에서 다시 회복(85%). 스펙 설명을 대화체로 전환하면 전체 적합도 85% 이상 달성 가능.`},
    role_fit:{score:82,role:role,task:task,
      comment:`${role}의 ${task} 업무에 82점 적합. 강점: ① 고객 눈높이에서 365일 사용 가치를 먼저 제시하는 화법 ② 구독 상담 진입이 자연스러움 ③ 라이프스타일별 맞춤 제안 능력 우수. 개선점: ① 기술 용어(MOF, 필터 구조) 설명 시 전문가 언어에서 고객 언어로 전환 필요 ② 제품 시연 시 "보시면" "이게" 등 지시어 대신 "고객님께서 직접 느끼실 수 있는" 등 체험 유도형 표현 권장.`},
    clarity:{score:81,
      comment:'전체 발음 명확도 81점. "공기청정기"(정확), "라이프스타일"(정확), "암모니아"(약간 뭉개짐), "오브제"(정확). 기술 용어 중 "MOF"는 "엠오에프"로 또박또박 발음하나, 뒤이어 나오는 설명이 빨라지면서 "화학상을받은물질인" 부분이 연음 처리됨. 전문 용어 직후 0.5초 멈춤 필요.'},
    energy:{score:72,pattern:'V자형 (고-저-고)',
      comment:'에너지 패턴 분석: 오프닝(00:00~00:18) 에너지 레벨 9/10 → 제품 스펙(00:32~00:48) 에너지 5/10으로 급하락 → 맞춤케어(00:49~01:13) 에너지 8/10 회복 → 센서 시연(01:14~01:40) 에너지 6/10 → 마무리(01:41~01:50) 에너지 8/10. 기술 설명 구간에서 일관된 에너지 유지가 과제.'},
    habits:[
      {word:'음~',count:7,
        context:'00:31 "음~ 그래서 이 필터가...", 00:45 "음~ MOF라는 소재가...", 01:25 "음~ AI 센서가..." — 기술 설명 전환 시 집중 발생 (7회 중 5회가 스펙 설명 구간)',
        replacement:'"여기서 중요한 포인트가 있는데요," 또는 0.5초 침묵 후 "핵심은요," — 기술 설명 진입 시 자신감 있는 브릿지 멘트 사용'},
      {word:'이게',count:5,
        context:'00:33 "이게 MOF 소재인데...", 00:47 "이게 필터 위치인데...", 01:36 "이게 센서 부분인데..." — 제품 지시 시 반복',
        replacement:'"지금 보시는 이 부분이 바로" 또는 "고객님께서 직접 확인하실 수 있는 부분은" — 제품 안내 시 고객 중심 표현'},
      {word:'좀',count:4,
        context:'01:14 "좀 더 정밀하게...", 01:27 "좀 보시면..." — 정확도를 낮추는 축소 표현',
        replacement:'"훨씬 더 정밀하게" 또는 "확실하게 확인하실 수 있습니다" — 확신을 주는 강화 표현으로 교체'},
      {word:'근데',count:3,
        context:'00:24 "근데 이 오브제 공기청정기는...", 01:38 "근데 여기 디스플레이가..." — 전환 시 구어체',
        replacement:'"특히 주목하실 부분은요," 또는 "여기서 더 놀라운 건요," — 기대감을 높이는 전환 표현'}
    ],
    silence_ratio:{percent:6,
      comment:'전체 발화 대비 침묵 비율 6%로 낮음 (권장: 12~18%). 특히 핵심 포인트 전달 후 교육생이 소화할 시간이 부족. "365일 끄지 않고 사용" 후 바로 다음 내용 진행, "MOF 소재" 설명 후 즉시 다음 기능으로 넘어감. 핵심 문장 후 2초 침묵 삽입 시 교육생 기억 정착률 40% 향상 예상.'},
    engagement_voice:{score:76,
      comment:'음성 변화로 본 수강생 관심도 76점. 질문형 톤 사용 2회("구독이라고 하면 어떤 느낌이세요?", "이런 경험 있으시죠?")로 적절하나 빈도 부족. 강조 시 볼륨 변화(+15%)는 있으나 속도 변화(-20%) 병행이 없어 단조로움. 핵심 키워드에서 "또박또박 + 느리게 + 크게" 3박자 조합 권장.'},
    criteriaScores:[
      {name:'발성 크기',score:16,max:20},
      {name:'발음 명확도',score:16,max:20},
      {name:'속도 조절',score:11,max:15},
      {name:'톤 적절성',score:11,max:15},
      {name:'강약 조절',score:10,max:15},
      {name:'침묵 활용',score:8,max:15}
    ],
    criteriaSummary:'총 72/100점 (B등급). 발성 크기와 명확도는 상위 수준이나, 속도 조절(-4)과 침묵 활용(-7)에서 감점. 기술 설명 구간의 속도 제어와 핵심 포인트 후 의도적 멈춤 훈련 시 A등급(80점+) 달성 가능.',
    overall_score:76,
    solution:`1. <strong>기술 스펙 → 대화체 전환:</strong> "MOF 소재로 유증기를 제거합니다"보다 "요리할 때 기름 냄새, 이 필터 하나면 깔끔하게 사라져요" — 나라면 고객 생활 언어로 바꾸겠습니다<br>
2. <strong>속도 브레이크 포인트 3곳 설정:</strong> 제품 핵심 기능(00:35), 가격 안내(01:00), 케어서비스(01:45) — 이 3곳에서 의도적으로 2초 멈추고 교육생 눈 마주치기<br>
3. <strong>"음~" → 파워 브릿지 멘트:</strong> 기술 설명 전 "여기가 진짜 핵심인데요," "이 부분 꼭 기억해 주세요," 등 기대감 조성 멘트로 100% 대체 가능<br>
4. <strong>시연 멘트 업그레이드:</strong> "이게 필터입니다" → "고객님 손으로 직접 잡아보시면 이 묵직한 느낌이 바로 MOF 소재예요" — 오감 체험 유도형 화법`,
    training:`1. <strong>3-2-1 속도 훈련:</strong> 같은 제품 설명을 3분 → 2분 → 1분에 맞춰 연습. 핵심만 남기는 압축 능력과 속도 조절 감각 동시 훈련 (주 3회, 10분)<br>
2. <strong>침묵 파워 연습:</strong> 거울 보고 제품 설명 후 "2초 침묵 + 미소 + 눈 맞춤" 3박자 반복. 처음엔 어색하지만 3일이면 자연스러워짐. 교육생 앞에서 침묵이 "자신감"으로 보이는 순간을 체험하게 됨<br>
3. <strong>고객 언어 변환 노트:</strong> 제품 카탈로그의 기술 용어 20개를 고객 생활 언어로 번역하는 노트 작성. "MOF 흡착" → "냄새 잡는 특수 필터", "AI 센서" → "알아서 공기 상태를 감지하는 똑똑한 기능" 등. 이 노트를 현장에서 바로 활용`,
    voice_timestamps:[
      {category:'발성',item:'오프닝 인사',score:5,maxScore:5,t:'00:00 ~ 00:08',type:'good',text:'밝고 에너지 있는 톤으로 시작. "새로 나왔어요" 강조 시 볼륨 +18%로 자연스러운 하이라이트',solution:''},
      {category:'발성',item:'제품 관심 유도',score:5,maxScore:5,t:'00:04 ~ 00:13',type:'good',text:'"365일 끄지 않고" 부분에서 또박또박 발음 + 적절한 속도(132 WPM). 교육생 집중도 상승 구간',solution:''},
      {category:'속도',item:'구독 스몰토크',score:4,maxScore:5,t:'00:14 ~ 00:18',type:'good',text:'구독 화두 전환 시 톤 변화로 자연스럽게 주의 환기. 다만 "구매하시는 방식" 부분 살짝 빠름(156 WPM)',solution:''},
      {category:'속도',item:'기술 스펙 설명',score:2,maxScore:5,t:'00:32 ~ 00:48',type:'bad',text:'182 WPM 급상승. "MOF 소재, 노벨 화학상, 유증기 및 암모니아 제거" 연속 전문 용어를 한 호흡에 전달하여 교육생 이해도 저하 예상',solution:'"이 필터의 핵심 소재가 있는데요—(1초 멈춤)—노벨 화학상을 받은 기술이에요. (2초 멈춤) 쉽게 말하면, 요리 냄새도 잡고 암모니아까지 제거해줍니다"'},
      {category:'톤',item:'맞춤케어 상담',score:5,maxScore:5,t:'00:49 ~ 01:13',type:'good',text:'고객 눈높이로 전환 성공. "요리할 때", "반려동물" 등 생활 밀착 표현 사용 + 공감 톤(128 WPM). 이 구간이 전체 최고 구간',solution:''},
      {category:'습관어',item:'"음~" 반복 구간',score:2,maxScore:5,t:'00:31 ~ 00:45',type:'bad',text:'15초 동안 "음~" 3회 연속 발생. 기술 설명 진입 시 자신감 부족 신호. 교육생 집중도 하락 포인트',solution:'"여기서 중요한 포인트가 있는데요," 또는 1초 침묵 후 "핵심은요," — 기술 설명 진입 시 파워 브릿지 멘트로 대체'},
      {category:'발성',item:'AI 센서 설명',score:4,maxScore:5,t:'01:14 ~ 01:25',type:'good',text:'오염도와 필터 수명 설명에서 안정적 톤(142 WPM). "정밀하게 측정합니다" 강조 시 볼륨 상승 적절',solution:''},
      {category:'시연',item:'센서 위치 안내',score:2,maxScore:5,t:'01:35 ~ 01:37',type:'bad',text:'2초 만에 센서 위치 안내 종료. 시연 시 고개를 숙이며 볼륨 67dB로 하락. 뒷줄 교육생 청취 어려움',solution:'"여기 하단에 센서가 있는데요—(센서 가리키며 3초 유지)—이 센서가 실시간으로 공기 상태를 체크해서 디스플레이에 숫자로 보여줍니다" + 서서 설명'},
      {category:'침묵',item:'핵심 후 멈춤',score:1,maxScore:5,t:'전체',type:'bad',text:'전체 침묵 비율 6% (권장 12~18%). "365일 끄지 않고 사용" 후 0.3초 만에 다음 문장 시작. 핵심 메시지 소화 시간 부족',solution:'핵심 문장 후 반드시 "2초 침묵 + 교육생 눈 마주침". 특히 가격/핵심기능/케어서비스 3곳에서 의도적 멈춤 필수'},
      {category:'강약',item:'마무리 케어서비스',score:4,maxScore:5,t:'01:41 ~ 01:50',type:'good',text:'"관리가 핵심" 강조 시 볼륨 +15% 상승 + 속도 감소(125 WPM). 설득력 있는 마무리. 다만 마지막 문장이 살짝 급히 끝남',solution:''},
    ]
  };
}

function renderVoiceResult(r,hasCL,count,tone){
  // 데모 모드: 음성 데이터 — 빈 항목만 개별로 샘플 채움 (있는 값은 유지)
  if(IB_DEMO()){
    const dv=makeDemoVoice();
    let a=window._lastVertexResult?.ai;
    if(!a||!(a.sub_scores&&a.sub_scores.length)||!(a.overall_score>0)){
      a=dv.ai; window._lastVertexResult={crit:null,ai:a};
    } else {
      if(!(a.good&&a.good.length)) a.good=dv.ai.good;
      if(!(a.bad&&a.bad.length)) a.bad=dv.ai.bad;
      if(!(a.upgrade&&a.upgrade.length)) a.upgrade=dv.ai.upgrade;
      if(!(a.engagement_gaps_minutes&&a.engagement_gaps_minutes.length)) a.engagement_gaps_minutes=dv.ai.engagement_gaps_minutes;
      if(!a.summary_opinion) a.summary_opinion=dv.ai.summary_opinion;
    }
    try{
      const dbCur=typeof r.decibel==='object'?(r.decibel?.current||0):(r.decibel||0);
      const tpCur=typeof r.tempo==='object'?(r.tempo?.wpm||0):(r.tempo||0);
      if(!dbCur) r.decibel=dv.r.decibel;
      if(!tpCur) r.tempo=dv.r.tempo;
      if(!(r.habits&&r.habits.length)) r.habits=dv.r.habits;
      const rep=Object.assign({},r.speech_report||{});
      if(!(Array.isArray(rep.improvements)&&rep.improvements.length)&&!r.solution) rep.improvements=dv.r.speech_report.improvements;
      if(!(Array.isArray(rep.training)&&rep.training.length)&&!r.training) rep.training=dv.r.speech_report.training;
      r.speech_report=rep;
    }catch(_){}
  }
  // 스피치: 평가안기준 X, AI독자 전용 구조로 렌더
  // 무조건 분할 구조 숨김 (구 UI 제거)
  const split=document.getElementById('va-split');
  if(split) split.style.display='none';
  const aiRaw=window._lastVertexResult?.ai||null;
  if(aiRaw){
    window._lastVertexResult={crit:null,ai:aiRaw};
    const pdfBtn=el('va-pdf-btn');if(pdfBtn) pdfBtn.style.display='';
    const dbRaw=r.decibel, tpRaw=r.tempo;
    let vDb=typeof dbRaw==='object'?(dbRaw?.current||0):(dbRaw||0);
    let vTp=typeof tpRaw==='object'?(tpRaw?.wpm||0):(tpRaw||0);
    // AI 가 0/누락 반환 시 안내 — 0 표시되면 사용자 혼란 → 명확한 미측정 표기
    const vDbMissing = !vDb || vDb<=0;
    const vTpMissing = !vTp || vTp<=0;
    const vDbSt=vDbMissing ? '미측정' : (typeof dbRaw==='object'?(dbRaw?.status||'적정'):(r.decibelStatus||'적정'));
    const vTpSt=vTpMissing ? '미측정' : (typeof tpRaw==='object'?(tpRaw?.status||'적정'):(r.tempoStatus||'적정'));
    const vHb=(r.habits||[]).reduce((a,h)=>a+(h.count||0),0);
    const vFit=vDb>=80?'20명+':vDb>=75?'15~20명':vDb>=70?'10~15명':vDb>=65?'5~10명':vDb>=60?'3~5명':'1~3명';
    let vMood='밝고 경쾌한';
    if(vDb>=78&&vTp>=155) vMood='열정적이고 에너지 넘치는';
    else if(vDb>=70&&vTp>=140&&vHb<10) vMood='밝고 경쾌한';
    else if(vDb>=65&&vTp>=130&&vTp<=150) vMood='친근하고 편안한';
    else if(vDb>=70&&vTp<=135) vMood='전문적이고 진지한';
    else if(vDb<=65&&vTp<=130) vMood='차분하고 신뢰감 있는';
    else if(vTp>=150&&vHb>15) vMood='재미있고 유머러스한';
    const mc={'열정적이고 에너지 넘치는':'#E21E26','밝고 경쾌한':'#f59e0b','친근하고 편안한':'#10b981','전문적이고 진지한':'#0078C8','차분하고 신뢰감 있는':'#8b5cf6','재미있고 유머러스한':'#ec4899'};

    // 체크리스트 대항목 레이더 아이템
    // 다각형 차트 가독성: categories 가 3개 미만이면 sub_scores 로 차트 그림
    // (categories 2개면 polygon 이 수직선처럼 보이는 문제 해결)
    const categories=aiRaw.categories||[];
    const subScoresEff=(aiRaw.sub_scores||[]).filter(s=>s.level!=='na');
    const radarItems = categories.length>=3
      ? categories.map(c=>({name:c.name,score:c.score||0,max:c.max||1}))
      : subScoresEff.map(s=>({name:s.sub_item||s.criterion||'항목',score:s.score||0,max:s.max||1}));
    const overall=aiRaw.overall_score||0;
    const summary=aiRaw.summary_opinion||'';

    // 타임스탬프 (sub_scores)
    const timestamps=(aiRaw.sub_scores||[]).map(s=>({
      category:s.category, item:s.sub_item, criteria:s.criterion||'',
      score:s.score||0, maxScore:s.max||0, t:s.timestamp||'',
      type:s.level==='good'?'good':s.level==='bad'?'bad':'tip',
      text:s.analysis||'', solution:s.solution||''
    }));
    window._anTimestamps=timestamps;
    // 반복어
    window._anHabits=r.habits||[];
    const habitHtml=(r.habits||[]).map((h,hi)=>{
      const cls=h.count>10?'hb-high':h.count>5?'hb-mid':'hb-low';
      const hasTs=(h.timestamps&&h.timestamps.length);
      const clickable=hasTs?'cursor:pointer;text-decoration:underline dotted':'';
      return `<span class="habit-badge ${cls}" style="${clickable}" ${hasTs?`onclick="openHabitTimestamps(${hi})"`:''}>${h.word} <span class="habit-cnt">${h.count}회</span></span>`;
    }).join('')||'<span style="font-size:11px;color:var(--t3)">감지된 반복어 없음</span>';

    const goodList=(aiRaw.good||[]).slice(0,5);
    const badList=(aiRaw.bad||[]).slice(0,5);
    const upgradeList=(aiRaw.upgrade||[]).slice(0,5);
    const gradeColor=overall>=90?'#10b981':overall>=70?'#f59e0b':'#E21E26';
    const gradeLabel=overall>=90?'우수':overall>=70?'양호':'개선 필요';

    // 스피치 종합 리포트
    const rep=r.speech_report||{};
    const improvements=Array.isArray(rep.improvements)?rep.improvements:(r.solution?[{title:'개선 솔루션',detail:r.solution}]:[]);
    const trainings=Array.isArray(rep.training)?rep.training:(r.training?[{title:'트레이닝',detail:r.training}]:[]);

    el('va-report').innerHTML=`
      <!-- 총점 배너 -->
      <div style="border-radius:16px;overflow:hidden;margin-bottom:20px;background:linear-gradient(135deg,#e8590c,#d9480f);padding:22px 28px;display:flex;align-items:center;gap:22px;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.1)">
        <div style="position:relative;width:72px;height:72px;flex-shrink:0">
          <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg)">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="8"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke="#fda4af" stroke-width="8" stroke-dasharray="264" stroke-dashoffset="${264-264*overall/100}" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900">${overall}%</div>
        </div>
        <div style="display:flex;gap:18px;flex-shrink:0">
          <div style="text-align:center"><div style="font-size:22px;font-weight:900">${overall}</div><div style="font-size:9px;color:rgba(255,255,255,.6)">AI점수</div></div>
          <div style="text-align:center"><div style="font-size:22px;font-weight:900">${categories.length}</div><div style="font-size:9px;color:rgba(255,255,255,.6)">대항목</div></div>
          <div style="text-align:center"><div style="font-size:22px;font-weight:900">${(aiRaw.sub_scores||[]).length}</div><div style="font-size:9px;color:rgba(255,255,255,.6)">세부항목</div></div>
        </div>
        <div style="flex:1;min-width:180px">
          <div style="font-size:10px;color:rgba(255,255,255,.5);margin-bottom:3px">AI 스피치 분석 요약</div>
          <div style="font-size:12px;line-height:1.6">총점 <strong>${overall}/100점(${overall}%)</strong>으로 <span style="color:${gradeColor}">${gradeLabel}</span> 성과입니다. ${summary?summary.split('.').slice(0,2).join('.')+'.':''}</div>
        </div>
      </div>

      <!-- 스피치 분석 (4칸) -->
      <div style="margin-bottom:20px">
        <div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:12px">스피치 분석</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          <div style="padding:12px;background:#f8f9fa;border-radius:8px"><div style="font-size:10px;color:var(--t3)">데시벨</div><div style="font-size:16px;font-weight:900">${vDb} dB</div><div style="font-size:10px;color:${vDbSt==='적정'?'var(--green)':'var(--orange)'}">${vDbSt}</div></div>
          <div style="padding:12px;background:#f8f9fa;border-radius:8px"><div style="font-size:10px;color:var(--t3)">템포</div><div style="font-size:16px;font-weight:900">${vTp} WPM</div><div style="font-size:10px;color:${vTpSt==='적정'?'var(--green)':'var(--orange)'}">${vTpSt}</div></div>
          <div style="padding:12px;background:#f8f9fa;border-radius:8px"><div style="font-size:10px;color:var(--t3)">적정 인원</div><div style="font-size:16px;font-weight:800">${vFit}</div><div style="font-size:10px;color:var(--t3)">${vDb}dB 기준</div></div>
          <div style="padding:12px;background:${mc[vMood]||'#f8f9fa'};border-radius:8px;color:#fff"><div style="font-size:10px;color:rgba(255,255,255,.7)">강의 분위기</div><div style="font-size:13px;font-weight:800">${vMood}</div><div style="font-size:10px;color:rgba(255,255,255,.6)">AI 판정</div></div>
        </div>
      </div>

      <!-- 체크리스트 기반 레이더 + 달성도 -->
      ${radarItems.length?`<div style="margin-bottom:20px">
        <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:24px;align-items:center;margin-bottom:12px">
          <div style="font-size:15px;font-weight:800;color:var(--t1)">AI 역량 분석</div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:15px;font-weight:800;color:var(--t1)">AI 역량별 달성도</div>
            <button class="btn btn-ghost" style="padding:5px 12px;font-size:11px;font-weight:700;color:var(--blue);border:1px solid rgba(0,120,200,.2);border-radius:999px" onclick="openChecklistDetail('ai')">전체 보기</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:24px;align-items:stretch">
          <div style="border:1px solid var(--bdr);border-radius:14px;padding:20px;display:flex;align-items:center;justify-content:center;min-height:340px">
            <svg viewBox="0 0 500 440" style="width:100%;max-width:480px;height:auto">${drawRadarSVG(radarItems,{clickable:true,which:'ai'})}</svg>
          </div>
          <div style="border:1px solid var(--bdr);border-radius:14px;padding:24px;display:flex;flex-direction:column;min-height:340px">
            <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
            ${radarItems.map(c=>{const p=c.max>0?Math.round(c.score/c.max*100):0;const cc=scoreColorFromRatio(p/100);return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;max-width:560px;margin-left:auto;margin-right:auto;width:100%">
              <span style="font-size:12.5px;font-weight:700;color:var(--t1);width:140px;flex-shrink:0">${c.name}</span>
              <div style="flex:1;height:10px;background:#f0f0f0;border-radius:5px;overflow:hidden;min-width:0"><div style="height:100%;width:${p}%;background:${cc};border-radius:5px"></div></div>
              <span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:11.5px;font-weight:800;background:${cc};color:#fff;min-width:50px;text-align:center;flex-shrink:0">${p}%</span>
            </div>`;}).join('')}
            </div>
          </div>
        </div>
      </div>`:''}

      <!-- 평가 항목별 피드백 -->
      ${timestamps.length?`<div style="margin-bottom:20px">
        <div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:12px">평가 항목별 피드백</div>
        <div style="border:1px solid var(--bdr);border-radius:14px;overflow:hidden;background:#fff">${renderTsTable(timestamps,'ai')}</div>
      </div>`:''}

      <!-- 반복어 습관 + 환기 -->
      <div style="margin-bottom:20px">
        <div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:12px">음성 & 습관 분석</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div style="border:1px solid var(--bdr);border-radius:14px;padding:16px">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px">반복어 습관</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">${habitHtml}</div>
          </div>
          <div style="border:1px solid var(--bdr);border-radius:14px;padding:16px">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px">환기 타이밍</div>
            <div style="font-size:12px;color:var(--t2);line-height:1.7">간격: <strong>${(aiRaw.engagement_gaps_minutes||[]).join('분 → ')||'—'}${(aiRaw.engagement_gaps_minutes||[]).length?'분':''}</strong></div>
          </div>
        </div>
      </div>

      <!-- Good/Bad/Upgrade -->
      <div style="margin-bottom:20px;border:1px solid var(--bdr);border-radius:14px">
        ${renderOpinionTabs('va-opinion',goodList,badList,upgradeList,'vop',summary||'스피치 종합 의견입니다.')}
      </div>

      <!-- 스피치 종합 리포트 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="border:1px solid var(--bdr);border-radius:14px;padding:20px">
          <div style="font-size:13px;font-weight:700;color:var(--blue);margin-bottom:8px">스피치 개선 솔루션</div>
          <div style="font-size:12px;color:var(--t2);line-height:1.7">${improvements.length?improvements.map((x,i)=>`${i+1}. <strong>${x.title||''}</strong>${x.detail?': '+x.detail:''}`).join('<br>'):(r.solution||'개선 솔루션이 생성되지 않았습니다.')}</div>
        </div>
        <div style="border:1px solid var(--bdr);border-radius:14px;padding:20px">
          <div style="font-size:13px;font-weight:700;color:var(--purple);margin-bottom:8px">스피치 트레이닝 추천</div>
          <div style="font-size:12px;color:var(--t2);line-height:1.7">${trainings.length?trainings.map((x,i)=>`${i+1}. <strong>${x.title||''}</strong>${x.detail?': '+x.detail:''}`).join('<br>'):(r.training||'트레이닝 추천이 생성되지 않았습니다.')}</div>
        </div>
      </div>
    `;
    return;
  }
  // ─── 레거시 폴백 (Vertex 결과 없을 때) ───
  // 구 분할 UI 완전 제거 — va-report에 안내만 표시
  const pdfBtn=el('va-pdf-btn');if(pdfBtn) pdfBtn.style.display='none';
  el('va-report').innerHTML=`<div style="padding:40px 24px;text-align:center;border:1px dashed var(--bdr);border-radius:14px;background:#fafafa">
    <div style="font-size:16px;font-weight:800;color:var(--t1);margin-bottom:8px">AI 분석 결과가 없습니다</div>
    <div style="font-size:12px;color:var(--t3);line-height:1.7">이 스피치는 이전 버전에 저장된 데이터이거나 분석이 실패했습니다.<br>새로 분석을 돌려주세요.</div>
  </div>`;
  return;

  // 이하 구 레거시 분할 렌더 (dead code — 미사용) ───
  // AI 독자 분석
  // eslint-disable-next-line no-unreachable
  const db=r.decibel||{};const tp=r.tempo||{};const tm=r.tone_match||{};const rf=r.role_fit||{};
  const cl=r.clarity||{};const en=r.energy||{};const sr=r.silence_ratio||{};const ev=r.engagement_voice||{};
  // 습관어 (코칭형 대체 문구 포함)
  const habitHtml=(r.habits||[]).map(h=>{
    const cls=h.count>10?'hb-high':h.count>5?'hb-mid':'hb-low';
    return `<div style="padding:10px;border:1px solid rgba(0,0,0,.18);border-radius:8px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span class="habit-badge ${cls}">${h.word} <span class="habit-cnt">${h.count}회</span></span>
      </div>
      ${h.context?`<div style="font-size:11px;color:var(--t3);margin-bottom:4px">📍 ${h.context}</div>`:''}
      ${h.replacement?`<div style="font-size:12px;color:var(--green);font-weight:600">💬 나라면: "${h.replacement}"</div>`:''}
    </div>`;
  }).join('')||'<span style="font-size:11px;color:var(--t3)">감지 없음</span>';

  const voiceRadar=[
    {name:'데시벨',score:Math.min(100,Math.round((db.current||70)/80*100)),max:100},
    {name:'템포',score:Math.min(100,Math.round((tp.wpm||140)/160*100)),max:100},
    {name:'톤 매칭',score:tm.score||70,max:100},
    {name:'명확도',score:cl.score||70,max:100},
    {name:'에너지',score:en.score||70,max:100},
    {name:'침묵 활용',score:Math.min(100,(sr.percent||10)*5),max:100},
  ];

  el('va-ai-result').innerHTML=`
    <div style="text-align:center;margin-bottom:8px">
      <div style="font-size:36px;font-weight:900;color:${r.overall_score>=80?'var(--green)':r.overall_score>=60?'var(--blue)':'var(--red)'}">${r.overall_score}</div>
      <div style="font-size:11px;color:var(--t3)">음성 종합 점수 /100</div>
    </div>
    ${drawRadarChart(voiceRadar,'#8b5cf6',340)}
    <!-- 데시벨 -->
    <div style="margin-bottom:12px;padding:10px;background:#f8f9fa;border-radius:8px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="font-weight:700">🔊 데시벨</span><span style="color:${db.status==='적정'?'var(--green)':'var(--orange)'};font-weight:700">${db.current} dB · ${db.status}</span></div>
      <div class="bar-track"><div class="bar-fill bf-blue" style="width:${Math.min(100,(db.current||0)/90*100)}%"></div></div>
      <div style="font-size:10px;color:var(--t3);margin-top:3px">권장: ${db.recommended_min}~${db.recommended_max} dB (${count}명 기준) · ${db.comment||''}</div>
    </div>
    <!-- 템포 -->
    <div style="margin-bottom:12px;padding:10px;background:#f8f9fa;border-radius:8px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="font-weight:700">⏱️ 말하기 속도</span><span style="color:${tp.status==='적정'?'var(--green)':'var(--orange)'};font-weight:700">${tp.wpm} WPM · ${tp.status}</span></div>
      <div class="bar-track"><div class="bar-fill bf-green" style="width:${Math.min(100,(tp.wpm||0)/200*100)}%"></div></div>
      <div style="font-size:10px;color:var(--t3);margin-top:3px">권장: ${tp.recommended_min}~${tp.recommended_max} WPM · ${tp.comment||''}</div>
    </div>
    <!-- 분위기 적합도 -->
    <div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;font-weight:700">🎭 강의 분위기 적합도</span>
        <span style="font-size:20px;font-weight:900;color:var(--purple)">${tm.percent||tm.score||0}%</span>
      </div>
      <div class="bar-track" style="height:8px;border-radius:4px"><div class="bar-fill" style="width:${tm.percent||tm.score||0}%;background:linear-gradient(90deg,var(--purple),#c4b5fd);border-radius:4px"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px">
        <span style="color:var(--t3)">목표: <strong>${tm.target||tone}</strong></span>
        <span style="color:var(--t2)">실제: <strong>${tm.actual||'—'}</strong></span>
      </div>
      <div style="font-size:11px;color:var(--t2);margin-top:4px;line-height:1.5">${tm.comment||''}</div>
    </div>
    <!-- 직군별 맞춤 평가 -->
    <div style="margin-bottom:12px;padding:12px;background:rgba(0,120,200,.03);border-radius:8px;border-left:3px solid var(--blue)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px;font-weight:700">👤 직군별 맞춤 평가</span>
        <span style="font-size:14px;font-weight:800;color:var(--blue)">${rf.score||0}/100</span>
      </div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:4px">${rf.role||'현장강사'} · ${rf.task||'교육 강의'}</div>
      <div style="font-size:12px;color:var(--t2);line-height:1.6">${rf.comment||''}</div>
    </div>
    <!-- 스코어 그리드 -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="padding:8px;background:#f8f9fa;border-radius:8px;text-align:center"><div style="font-size:10px;color:var(--t3)">발음 명확도</div><div style="font-size:18px;font-weight:900;color:var(--blue)">${cl.score||0}</div></div>
      <div style="padding:8px;background:#f8f9fa;border-radius:8px;text-align:center"><div style="font-size:10px;color:var(--t3)">에너지 패턴</div><div style="font-size:18px;font-weight:900;color:var(--green)">${en.score||0}</div><div style="font-size:9px;color:var(--t3)">${en.pattern||''}</div></div>
      <div style="padding:8px;background:#f8f9fa;border-radius:8px;text-align:center"><div style="font-size:10px;color:var(--t3)">침묵 활용</div><div style="font-size:18px;font-weight:900;color:var(--purple)">${sr.percent||0}%</div></div>
    </div>
    <!-- 반복어 -->
    <div style="margin-bottom:12px"><div style="font-size:12px;font-weight:700;margin-bottom:6px">🗣️ 반복어 습관</div><div style="display:flex;flex-wrap:wrap;gap:5px">${habitHtml}</div></div>
    <!-- 관심 유지 -->
    <div style="padding:10px;background:#f8f9fa;border-radius:8px">
      <div style="font-size:11px;font-weight:700;margin-bottom:3px">👥 수강생 관심 유지력: <span style="color:var(--blue)">${ev.score||0}/100</span></div>
      <div style="font-size:10px;color:var(--t3)">${ev.comment||''}</div>
    </div>`;

  // 리포트
  // ─── 음성 타임스탬프 테이블 ───
  window._vaTimestamps=r.voice_timestamps||[];
  const vaTsHtml=(r.voice_timestamps||[]).length?`
    <div style="margin-bottom:18px">
      <div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:12px">스피치 타임스탬프 피드</div>
      <div style="border:1px solid var(--bdr);border-radius:14px;overflow:hidden">
        ${renderTsTable(r.voice_timestamps||[])}
      </div>
    </div>`:'';

  el('va-report').innerHTML=`
    <!-- 스피치 분석 (4칸 카드) — 상단 -->
    <div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:12px">스피치 분석</div>
        ${(()=>{
          const vDbRaw=r.decibel;
          const vDb=typeof vDbRaw==='object'?(vDbRaw?.current||0):(vDbRaw||0);
          const vTpRaw=r.tempo;
          const vTp=typeof vTpRaw==='object'?(vTpRaw?.wpm||0):(vTpRaw||0);
          const vHb=(r.habits||[]).reduce((a,h)=>a+h.count,0);
          const vFit=vDb>=80?'20명+':vDb>=75?'15~20명':vDb>=70?'10~15명':vDb>=65?'5~10명':vDb>=60?'3~5명':'1~3명';
          const vDbSt=typeof vDbRaw==='object'?(vDbRaw?.status||''):(r.decibelStatus||'');
          const vTpSt=typeof vTpRaw==='object'?(vTpRaw?.status||''):(r.tempoStatus||'');
          let vMood='밝고 경쾌한';
          if(vDb>=78&&vTp>=155) vMood='열정적이고 에너지 넘치는';
          else if(vDb>=70&&vTp>=140&&vHb<10) vMood='밝고 경쾌한';
          else if(vDb>=65&&vTp>=130&&vTp<=150) vMood='친근하고 편안한';
          else if(vDb>=70&&vTp<=135) vMood='전문적이고 진지한';
          else if(vDb<=65&&vTp<=130) vMood='차분하고 신뢰감 있는';
          else if(vTp>=150&&vHb>15) vMood='재미있고 유머러스한';
          const mc={'열정적이고 에너지 넘치는':'#E21E26','밝고 경쾌한':'#f59e0b','친근하고 편안한':'#10b981','전문적이고 진지한':'#0078C8','차분하고 신뢰감 있는':'#8b5cf6','재미있고 유머러스한':'#ec4899'};
          return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            <div style="padding:12px;background:#f8f9fa;border-radius:8px"><div style="font-size:10px;color:var(--t3)">데시벨</div><div style="font-size:16px;font-weight:900">${vDb} dB</div><div style="font-size:10px;color:${vDbSt==='적정'?'var(--green)':'var(--orange)'}">${vDbSt}</div></div>
            <div style="padding:12px;background:#f8f9fa;border-radius:8px"><div style="font-size:10px;color:var(--t3)">템포</div><div style="font-size:16px;font-weight:900">${vTp} WPM</div><div style="font-size:10px;color:${vTpSt==='적정'?'var(--green)':'var(--orange)'}">${vTpSt}</div></div>
            <div style="padding:12px;background:#f8f9fa;border-radius:8px"><div style="font-size:10px;color:var(--t3)">적정 인원</div><div style="font-size:16px;font-weight:800">${vFit}</div><div style="font-size:10px;color:var(--t3)">${vDb}dB 기준</div></div>
            <div style="padding:12px;background:${mc[vMood]||'#f8f9fa'};border-radius:8px;color:#fff"><div style="font-size:10px;color:rgba(255,255,255,.7)">강의 분위기</div><div style="font-size:13px;font-weight:800">${vMood}</div><div style="font-size:10px;color:rgba(255,255,255,.6)">AI 판정</div></div>
          </div>`;
        })()}
      </div>
    </div>
    <!-- 타임스탬프 피드 -->
    ${vaTsHtml}
    <!-- 스피치 종합 리포트 -->
    <div style="margin-top:20px">
      <div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:12px">스피치 종합 리포트</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="border:1px solid var(--bdr);border-radius:14px;padding:20px"><div style="font-size:13px;font-weight:700;color:var(--blue);margin-bottom:8px">스피치 개선 솔루션</div><div style="font-size:12px;color:var(--t2);line-height:1.7">${r.solution||''}</div></div>
        <div style="border:1px solid var(--bdr);border-radius:14px;padding:20px"><div style="font-size:13px;font-weight:700;color:var(--purple);margin-bottom:8px">스피치 트레이닝 추천</div><div style="font-size:12px;color:var(--t2);line-height:1.7">${r.training||''}</div></div>
      </div>
    </div>`;
}

const _DEMO_SPEECH=[
  {title:'26년 거점집합교육 냉장고',date:'2026-06-11'},
  {title:'26년 구독 연습 정수기',date:'2026-06-09'},
  {title:'26년 현장코칭 워시타워',date:'2026-06-06'},
  {title:'26년 RP 스타일러',date:'2026-06-04'},
  {title:'26년 화상 교육 TV',date:'2026-06-02'},
];
function renderUserVoiceList(userId){
  const vaData=(D.voiceEvals||[]).map(v=>({id:v.id,userId:v.user_id,title:v.title,score:v.score,tone:v.tone,studentCount:v.student_count,date:v.eval_date}));
  let rows=vaData.filter(v=>v.userId===userId);
  const countEl=el('voice-count-'+userId);
  const listEl=el('voice-list-'+userId);
  if(!listEl) return;
  // 데모 모드: 적으면 종류별 샘플로 채움 (클릭 시 실제 음성평가 1건이 데모 데이터로 표시)
  if(IB_DEMO() && rows.length<3){
    const realId=(D.voiceEvals||[]).find(v=>v.user_id===userId)?.id || (D.voiceEvals||[])[0]?.id || 0;
    _DEMO_SPEECH.forEach(d=>rows.push({id:realId,title:d.title,date:d.date,_demo:true}));
  }
  if(countEl) countEl.textContent=rows.length+'건';
  if(!rows.length){
    listEl.innerHTML='<p style="font-size:12px;color:var(--t3);padding:12px 0">등록된 음성 평가가 없습니다.</p>';
    return;
  }
  listEl.innerHTML=rows.map(v=>`
    <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onclick="openVoiceResult(${v.id})">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.title||'—'}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">${v.date||'—'}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`).join('');
}

// 마이페이지 — 시나리오 코칭 목록 (누적 보관: sc_final_user_{id}_{ts})
async function renderUserScenarioList(userId, catVal, prodVal){
  const listEl=document.getElementById('scenario-list-'+userId);
  const countEl=document.getElementById('scenario-count-'+userId);
  if(!listEl) return;
  // 본인 페이지에서 직접 삭제 가능 여부
  const isOwner=(CU?.id===userId)||CU?.isAdmin||CU?.isSubAdmin;
  let recs=[];
  try{
    if(window.sb){
      const {data}=await sb.from('app_settings').select('key,value,updated_at,created_at').like('key','sc_final_user_'+userId+'_%');
      recs=(data||[]).map(scParseFinalRow).filter(s=>s.user_id===userId && (s.draft||s.revised||s.eduType||s.product));
      // 상세 모달(openScenarioDetailFromAdmin)이 D.scenarioDrafts 캐시를 보므로 동기화
      if(!Array.isArray(D.scenarioDrafts)) D.scenarioDrafts=[];
      D.scenarioDrafts=D.scenarioDrafts.filter(s=>s.user_id!==userId).concat(recs);
    }
  }catch(e){ console.warn('renderUserScenarioList:',e?.message||e); }
  // 데모 모드: 실제 시나리오 없으면 본인 샘플 2건 채움
  if(IB_DEMO() && !recs.length){
    const nm=(D.users||[]).find(x=>x.id===userId)?.name||'';
    recs=[demoScenarioRecord(userId,nm,0),demoScenarioRecord(userId,nm,1)];
    if(!Array.isArray(D.scenarioDrafts)) D.scenarioDrafts=[];
    recs.forEach(r=>{ if(!D.scenarioDrafts.find(s=>s.key===r.key)) D.scenarioDrafts.push(r); });
  }
  if(catVal) recs=recs.filter(s=>(s.eduType||'')===catVal);
  if(prodVal) recs=recs.filter(s=>(s.product||'').includes(prodVal));
  recs.sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''));
  if(countEl) countEl.textContent=recs.length+'건';
  if(!recs.length){
    listEl.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">완성한 시나리오가 없습니다</div>';
    return;
  }
  listEl.innerHTML=recs.map(sc=>{
    const finalText=(sc.revised||sc.draft||'');
    const titleBits=[sc.eduType,sc.product].filter(Boolean).join(' · ')||'시나리오';
    const badge=`<span style="display:inline-block;font-size:9px;font-weight:800;color:#fff;background:#10b981;border-radius:999px;padding:1px 7px;margin-left:6px">완성${sc.grade?' · '+sc.grade:''}</span>`;
    const preview=finalText.slice(0,50).replace(/</g,'&lt;').replace(/\n/g,' ');
    const delBtn=isOwner?`<button class="btn" style="padding:4px 9px;font-size:10px;font-weight:700;color:var(--red);border:1px solid var(--red);border-radius:999px;background:#fff;cursor:pointer" onclick="event.stopPropagation();userDeleteScenario('${sc.key}',${userId},'${(titleBits).replace(/'/g,"\\'")}')">삭제</button>`:'';
    return `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onclick="openScenarioDetailFromAdmin('${sc.key}')">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${titleBits.replace(/</g,'&lt;')}${badge}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">${(sc.updated_at||'').slice(0,10)||'—'}${finalText?' · '+finalText.length+'자':''}</div>
        ${preview?`<div style="font-size:10px;color:var(--t2);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">"${preview}${finalText.length>50?'…':''}"</div>`:''}
      </div>
      ${delBtn}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  }).join('');
}
// 마이페이지에서 본인 시나리오 1건 삭제
async function userDeleteScenario(key, userId, title){
  if(!confirm(`시나리오 "${title}" 을(를) 삭제하시겠습니까?\n완성본 1건이 사라집니다.`)) return;
  try{
    const {error}=await sb.from('app_settings').delete().eq('key', key);
    if(error){ alert('삭제 실패: '+error.message); return; }
    if(Array.isArray(D.scenarioDrafts)) D.scenarioDrafts=D.scenarioDrafts.filter(s=>s.key!==key);
    renderUserScenarioList(userId,
      document.getElementById('coaching-cat-filter')?.value||'',
      document.getElementById('coaching-prod-filter')?.value||'');
    if(typeof showToast==='function') showToast('시나리오 삭제 완료','#10b981');
  }catch(e){ alert('삭제 오류: '+(e?.message||e)); }
}

function openVoiceResult(vaId){
  // F5 복원용 컨텍스트 저장
  try{localStorage.setItem('ib_last_ctx',JSON.stringify({type:'voice',id:vaId}));}catch(_){}
  const raw=D.voiceEvals||[];
  const v=raw.find(x=>x.id===vaId);
  if(v){v.studentCount=v.student_count;v.userName=v.user_name;}
  if(!v) return;
  el('va-step1').style.display='none';
  el('va-step2').style.display='';
  const split=document.getElementById('va-split');if(split) split.style.display='none';
  (async()=>{
    // evaluations 테이블에서 원본 Vertex 결과 로드
    const{data:evals}=await sb.from('evaluations').select('*').eq('voice_eval_id',vaId).order('created_at',{ascending:false});
    const aiRow=(evals||[]).find(e=>e.eval_type==='AI독자')||(evals||[])[0];
    const toVertex=(row)=>row?{
      overall_score:row.overall_score, categories:row.categories||[], sub_scores:row.sub_scores||[],
      good:row.good||[], bad:row.bad||[], upgrade:row.upgrade||[],
      scenarios:row.scenarios||[], level_tips:row.level_tips||[], teaching_patterns:row.teaching_patterns||[],
      habits:row.habits||[], engagement_gaps_minutes:row.engagement_gaps||[],
      mood:row.mood, decibel:row.decibel, tempo_wpm:row.tempo,
      rubric_alignment_score:row.speech_report?.rubric_alignment_score??null,
      rubric_alignment_reason:row.speech_report?.rubric_alignment_reason||'',
      summary_opinion:row.speech_report?.summary_opinion||'',
      pitch_overall:row.speech_report?.pitch_overall||'',
      pitch_recommendation:row.speech_report?.pitch_recommendation||'',
      pitch_reason:row.speech_report?.pitch_reason||'',
      pitch_segments:Array.isArray(row.speech_report?.pitch_segments)?row.speech_report.pitch_segments:[],
      edu_file_url:row.edu_file_url||''
    }:null;
    const aiRes=normalizeVertexResult(toVertex(aiRow));
    if(aiRes){
      window._lastVertexResult={crit:null,ai:aiRes};
      const mapped=mapVertexToLegacy(null,aiRes);
      renderVoiceResult(mapped, v.studentCount||20, v.tone||'밝고 경쾌한');
    } else {
      // 레거시: 원본 없으면 mock으로
      const mock=generateMockVoice(v.studentCount||20, v.tone||'밝고 경쾌한');
      mock.overall_score=v.score;
      renderVoiceResult(mock, false, v.studentCount||20, v.tone||'밝고 경쾌한');
    }
  })();
  // 삭제 버튼
  const delArea=el('va-delete-area');
  if(delArea){
    if(CU?.isAdmin) delArea.innerHTML=`<button class="btn" style="background:var(--t1);color:#fff;padding:10px 24px;font-size:13px;border-radius:999px" onclick="adminDeleteVoice(${v.id})">삭제</button>`;
    else if(CU?.id===v.user_id) delArea.innerHTML=`<button class="btn" style="background:var(--t1);color:#fff;padding:10px 24px;font-size:13px;border-radius:999px" onclick="alert('음성 평가 삭제 요청은 관리자에게 문의하세요')">삭제 요청</button>`;
    else delArea.innerHTML='';
  }
  showPage('page-voice');
}
// 관리자 음성 삭제
async function adminDeleteVoice(voiceId){
  if(!confirm('이 음성 평가를 삭제하시겠습니까?')) return;
  await sb.from('voice_evals').delete().eq('id',voiceId);
  await loadFromDB();
  alert('삭제되었습니다.');
  showPage('page-pick');
}

function openVoiceTimestamp(idx){
  const stamps=window._vaTimestamps||[];
  if(!stamps[idx]) return;
  const ts=stamps[idx];

  const timeStr=(ts.t||'').split('~')[0].trim();
  const parts=timeStr.split(':');
  const sec=parseInt(parts[0]||0)*60+parseInt(parts[1]||0);

  // 모달 재활용
  el('ts-modal-cat').textContent=ts.category||'—';
  el('ts-modal-title').textContent=ts.item||'항목';
  el('ts-modal-item').textContent=ts.item||'—';

  const scoreEl=el('ts-modal-score');
  const sc=ts.type==='good'?'#10b981':ts.type==='bad'?'#E21E26':'#f59e0b';
  const sb=ts.type==='good'?'rgba(16,185,129,.12)':ts.type==='bad'?'rgba(226,30,38,.12)':'rgba(245,158,11,.12)';
  scoreEl.textContent=(ts.score||0)+' / '+(ts.maxScore||5);
  scoreEl.style.background=sb;scoreEl.style.color=sc;

  el('ts-modal-content').textContent=ts.text||'';

  const solEl=el('ts-modal-solution');
  if(ts.solution){solEl.textContent=ts.solution;solEl.style.display='';}
  else solEl.style.display='none';

  // 오디오 (녹음 파일이 있으면)
  el('ts-modal-video').innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#1a1a2e;flex-direction:column;gap:12px;padding:20px">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.5"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    <div style="color:rgba(255,255,255,.5);font-size:13px;text-align:center">🎤 ${ts.t||''}<br><span style="font-size:11px">해당 구간 음성</span></div>
    <div style="color:rgba(255,255,255,.3);font-size:11px">AI 음성 연동 시 자동 재생</div>
  </div>`;

  // 타임라인
  el('ts-modal-timeline').innerHTML=stamps.map((s,i)=>{
    const isActive=i===idx;
    const bg=isActive?'rgba(0,120,200,.06)':'';
    const border=isActive?'border-left:3px solid var(--blue)':'border-left:3px solid transparent';
    return `<div style="padding:10px 14px;cursor:pointer;transition:background .15s;${border};background:${bg}" onclick="openVoiceTimestamp(${i})" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='${bg}'">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <span style="font-size:11px;color:var(--blue);font-weight:700">${s.t||''}</span>
        <span style="font-size:10px;padding:1px 5px;border-radius:8px;background:${s.type==='good'?'rgba(16,185,129,.1)':s.type==='bad'?'rgba(226,30,38,.1)':'rgba(245,158,11,.1)'};color:${s.type==='good'?'#10b981':s.type==='bad'?'#E21E26':'#f59e0b'}">${s.type==='good'?'Good':s.type==='bad'?'Bad':'Tip'}</span>
      </div>
      <div style="font-size:12px;color:var(--t1);${isActive?'font-weight:700':''};line-height:1.5">${s.text?.substring(0,60)||''}${(s.text||'').length>60?'...':''}</div>
    </div>`;
  }).join('');

  setTimeout(()=>{
    const tl=el('ts-modal-timeline');
    if(tl?.children?.[idx]) tl.children[idx].scrollIntoView({block:'center',behavior:'smooth'});
  },100);

  el('ts-modal-edit-btn').style.display='none';
  el('ts-modal-edit').style.display='none';
  el('ts-modal-overlay').classList.add('show');
}

async function autoSaveVoice(resultJson,count,tone){
  if(!CU) return;
  try{
    const title=v('va-title').trim()||'음성 분석';
    const score=resultJson.overall_score||resultJson.overallScore||0;
    const product=v('va-product')||'';
    if(CU?.email==='admin'){alert('평가 업로드는 강사 본인 계정으로 진행해주세요.');return;}
    const userId=CU?.id||null;
    if(!userId){alert('로그인 계정을 확인할 수 없습니다.');return;}
    const eduType=v('va-edu-type')||'';
    const insertData={user_name:CU?.name||'관리자', title, score:parseInt(score)||0,
      tone, student_count:count, eval_date:new Date().toISOString().split('T')[0],
      result_data:{product,eduType,analysis:resultJson},
      org_name: curOrg()};
    if(userId) insertData.user_id=userId;
    if(eduType) insertData.edu_type=eduType;
    let {error:vErr}=await sb.from('voice_evals').insert(insertData);
    if(vErr && (vErr.message||'').toLowerCase().includes('edu_type')){
      delete insertData.edu_type;
      await sb.from('voice_evals').insert(insertData);
    }
    await loadFromDB();
  }catch(e){console.error('auto voice save error:',e);}
}

function downloadSTTExcel(){
  if(!vaSTTLines.length&&!vaSTTText){alert('텍스트 변환 데이터가 없습니다');return;}
  const title=v('va-title')||'음성분석';
  const date=new Date().toISOString().split('T')[0];
  let csv='\uFEFF';
  csv+='음성 텍스트 변환 (시나리오)\n';
  csv+=`제목,${title}\n`;
  csv+=`강사,${CU?.name||'—'}\n`;
  csv+=`날짜,${date}\n\n`;
  csv+='시간,내용\n';
  if(vaSTTLines.length){
    vaSTTLines.forEach(l=>{csv+=`${l.time},"${l.text.replace(/"/g,'""')}"\n`;});
  } else {
    csv+=`00:00,"${vaSTTText.replace(/"/g,'""')}"\n`;
  }
  csv+=`\n전체 텍스트\n"${vaSTTText.replace(/"/g,'""')}"\n`;
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`${title}_시나리오_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadVoiceExcel(){
  const ts=window._vaTimestamps||[];
  if(!ts.length){alert('분석 데이터가 없습니다');return;}
  const title=v('va-title')||'음성분석';
  const date=new Date().toISOString().split('T')[0];
  // CSV 생성 (엑셀 호환 UTF-8 BOM)
  let csv='\uFEFF';
  csv+='음성 분석 시나리오 리포트\n';
  csv+=`제목,${title}\n`;
  csv+=`분석일,${date}\n`;
  csv+=`강사,${CU?.name||'—'}\n\n`;
  csv+='구분,평가 항목,점수,시점,유형,분석 피드백,솔루션\n';
  ts.forEach(t=>{
    const cat=(t.category||'—').replace(/,/g,' ');
    const item=(t.item||'—').replace(/,/g,' ');
    const score=t.score||0;
    const maxS=t.maxScore||5;
    const time=(t.t||'—').replace(/,/g,' ');
    const type=t.type==='good'?'잘함':t.type==='bad'?'취약':'Tip';
    const text=(t.text||'').replace(/,/g,' ').replace(/\n/g,' ');
    const sol=(t.solution||'').replace(/,/g,' ').replace(/\n/g,' ');
    csv+=`${cat},${item},${score}/${maxS},${time},${type},${text},${sol}\n`;
  });
  // 종합 정보 추가
  const scoreEl=el('va-ai-result')?.querySelector('div[style*="font-size:36px"]');
  const overallScore=scoreEl?.textContent||'—';
  csv+=`\n종합 점수,${overallScore}\n`;
  // 다운로드
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`${title}_시나리오_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveVoiceAnalysis(){
  const title=v('va-title').trim();
  const score=el('va-ai-result')?.querySelector('div[style*="font-size:36px"]')?.textContent||'0';
  const tone=v('va-tone');
  const count=parseInt(v('va-count'))||0;
  const userId=CU?.id||null;
  const product=v('va-product')||'';
  const eduType=v('va-edu-type')||'';
  const insertData={user_name:CU?.name||'관리자', title, score:parseInt(score)||0,
    tone, student_count:count, eval_date:new Date().toISOString().split('T')[0],
    result_data:{product,eduType},
    org_name: curOrg()};
  if(userId) insertData.user_id=userId;
  if(eduType) insertData.edu_type=eduType;
  let {error}=await sb.from('voice_evals').insert(insertData);
  if(error && (error.message||'').toLowerCase().includes('edu_type')){
    delete insertData.edu_type;
    ({error}=await sb.from('voice_evals').insert(insertData));
  }
  if(error) console.error('voice save error:',error);
  await loadFromDB();
  alert('음성 분석 결과가 저장되었습니다!');
  showPage('page-pick');
}

function renderVoiceHighlight(filtered){
  const fIds=new Set((filtered||D.users).map(u=>u.id));
  const productFilter=v('f-product')||'';
  const vaData=(D.voiceEvals||[]).filter(ve=>{
    if(!fIds.has(ve.user_id)) return false;
    if(productFilter && ve.result_data?.product!==productFilter) return false;
    return true;
  }).map(ve=>({id:ve.id,userId:ve.user_id,userName:ve.user_name,title:ve.title,score:ve.score,tone:ve.tone,studentCount:ve.student_count,date:ve.eval_date,product:ve.result_data?.product||''}));
  if(!vaData.length){
    el('voice-highlight').innerHTML='<div style="font-size:12px;color:var(--t3);padding:12px">저장된 음성 평가가 없습니다.</div>';
    return;
  }
  const sorted=[...vaData].sort((a,b)=>b.score-a.score);
  const toneColors={'진지하고 엄중한':'var(--t1)','밝고 경쾌한':'var(--blue)','재미있는':'var(--orange)','차분하고 신뢰감 있는':'var(--green)','열정적이고 에너지 넘치는':'var(--red)'};
  el('voice-highlight').innerHTML=sorted.map((v,i)=>`
    <div class="top5-card neu" style="animation-delay:${i*.08}s;cursor:pointer" onclick="openVoiceResult(${v.id})">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span class="top5-rank ${['t5r-1','t5r-2','t5r-3','t5r-4','t5r-5'][i]||'t5r-5'}">${i+1}</span>
        <div>
          <div style="font-size:12px;font-weight:800">${v.title}</div>
          <div style="font-size:10px;color:var(--t3)">${v.userName} · ${v.date}</div>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:6px">
        <span style="font-size:18px;font-weight:900;color:${v.score>=80?'var(--green)':v.score>=60?'var(--blue)':'var(--red)'}">${v.score}</span>
        <span style="font-size:10px;color:var(--t3)">/100</span>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <span style="padding:2px 7px;border-radius:10px;font-size:9px;font-weight:700;background:rgba(0,0,0,.05);color:${toneColors[v.tone]||'var(--t3)'}">${v.tone}</span>
        <span style="padding:2px 7px;border-radius:10px;font-size:9px;background:rgba(0,0,0,.04);color:var(--t3)">${v.studentCount}명</span>
      </div>
    </div>`).join('');
}

function openStreaming(){
  el('stream-step0').style.display='';
  el('stream-step1').style.display='none';
  el('stream-step2').style.display='none';
  el('stream-step3').style.display='none';
  showPage('page-streaming');
}
function openStreamModal(){
  el('st-title').value=''; el('st-count').value='';
  const stType=el('st-type');if(stType){const cats=getEduCategories();stType.innerHTML='<option value="">선택</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join('');}
  const stEduType=el('st-edu-type');if(stEduType){const types=getEduTypes();stEduType.innerHTML='<option value="">선택</option>'+types.map(t=>`<option value="${t}">${t}</option>`).join('');}
  el('st-date').value=new Date().toISOString().split('T')[0];
  el('st-err').textContent='';
  // 제품 셀렉트 초기화
  const stProd=document.getElementById('st-prod-select');
  if(stProd&&stProd.options.length<=1){
    Object.entries(PRODUCT_TREE).forEach(([g,items])=>{
      const og=document.createElement('optgroup');og.label=g;
      items.forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;og.appendChild(o);});
      stProd.appendChild(og);
    });
  }
  const stEdu=document.getElementById('st-edu-files');if(stEdu)stEdu.style.display='none';
  // 체크리스트 드롭다운 즉시 채움
  if(typeof populateChecklistSelects==='function') populateChecklistSelects();
  // 드롭다운 값 초기화 (같은 옵션 재클릭 시 onchange 미발화 방지)
  ['st-cl-select','st-cl-ai-select'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  // 배지 초기화
  ['st-cl-applied','st-cl-ai-applied','st-edu-applied'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  ['st-cl-applied-name','st-cl-ai-applied-name','st-edu-applied-name'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='';});
  // 숨겨진 URL 초기화
  ['st-cl-url','st-cl-url-name','st-cl-ai-url','st-cl-ai-url-name','st-checklist-url'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  el('stream-info-overlay').classList.add('show');
}
function loadStreamEduFiles(){
  const cat=document.getElementById('st-type')?.value||'';
  const wrap=document.getElementById('st-edu-files');
  const list=document.getElementById('st-edu-file-list');
  if(!wrap||!list) return;
  if(!cat){wrap.style.display='none';return;}
  const files=(D.checklists||[]).filter(c=>(c.category||'')===cat);
  if(!files.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  list.innerHTML=files.map(f=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onclick="applyStreamEduFile('${f.file_url}','${(f.name||'').replace(/'/g,"\\'")}')">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <div style="flex:1;font-size:11px;font-weight:600">${f.name}</div>
    <span style="font-size:10px;color:var(--blue)">적용</span>
  </div>`).join('');
}
function applyStreamEduFile(url,name){
  if(!document.getElementById('st-checklist-url')){
    const h=document.createElement('input');h.type='hidden';h.id='st-checklist-url';document.body.appendChild(h);
  }
  document.getElementById('st-checklist-url').value=url;
  document.getElementById('st-edu-files').style.display='none';
  // 드롭다운 바로 아래 배지 (인라인)
  const badge=document.getElementById('st-edu-applied');
  const badgeName=document.getElementById('st-edu-applied-name');
  if(badge){
    badge.style.display='block';
    if(badgeName) badgeName.textContent=name;
    else badge.textContent='📘 교육자료: '+name;
  }
}

let audioCtx=null, analyser=null, animFrameId=null;

function goStreamStep2(){
  const title=v('st-title').trim();
  if(!title){ el('st-err').textContent='영상 제목을 입력하세요.'; return; }
  closeOverlay('stream-info-overlay');
  // Show streaming page
  el('stream-step0').style.display='none';
  el('stream-step1').style.display='none';
  el('stream-step2').style.display='';
  el('stream-step3').style.display='none';
  showPage('page-streaming');
  el('stream-info-display').innerHTML=`
    <strong>제목:</strong> ${title}<br>
    <strong>교육종류:</strong> ${v('st-edu-type')||'—'}<br>
    <strong>교육자료:</strong> ${v('st-type')||'—'}<br>
    <strong>인원:</strong> ${v('st-count')||'—'}명<br>
    <strong>날짜:</strong> ${v('st-date')||'—'}
  `;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    alert('이 브라우저에서 카메라를 지원하지 않습니다.\nHTTPS(배포 사이트)에서 접속해주세요.');
    return;
  }
  getCameraStream().then(stream=>{
    streamStream=stream;
    el('stream-webcam').srcObject=stream;
    // Audio visualizer setup
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const source=audioCtx.createMediaStreamSource(stream);
    analyser=audioCtx.createAnalyser();
    analyser.fftSize=256;
    analyser.smoothingTimeConstant=0.75;
    source.connect(analyser);
    drawWaveform();
  }).catch(err=>alert('카메라 접근 권한이 필요합니다: '+err.message));
}

function drawWaveform(){
  const canvas=el('stream-waveform');
  if(!canvas||!analyser) return;
  const ctx=canvas.getContext('2d');
  const bufLen=analyser.frequencyBinCount;
  const data=new Uint8Array(bufLen);
  const W=canvas.width, H=canvas.height;

  function draw(){
    animFrameId=requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);

    // Clear with light bg
    ctx.fillStyle='#f8f9fa';
    ctx.fillRect(0,0,W,H);

    // Calculate dB
    let sum=0;
    for(let i=0;i<bufLen;i++) sum+=data[i];
    const avg=sum/bufLen;
    const db=Math.round(avg*0.4);
    const dbEl=el('stream-db-live');
    const micDot=el('stream-mic-dot');
    if(dbEl){
      dbEl.textContent=db;
      dbEl.style.color=db>50?'#E21E26':db>20?'#0078C8':'var(--t3)';
    }
    if(micDot) micDot.style.background=db>10?db>50?'#E21E26':'#10b981':'#ddd';

    // Draw rounded bars from center
    const barCount=80;
    const gap=1;
    const barW=(W-(barCount-1)*gap)/barCount;
    const step=Math.floor(bufLen/barCount);
    for(let i=0;i<barCount;i++){
      const val=data[i*step]/255;
      const barH=Math.max(2, val*H*0.85);
      // Color: blue (quiet) → red (loud)
      const r=Math.round(0 + val*226);
      const g=Math.round(120 - val*90);
      const b=Math.round(200 - val*170);
      ctx.fillStyle=`rgba(${r},${g},${b},${0.3+val*0.7})`;
      // Rounded bar from center
      const x=i*(barW+gap);
      const y=(H-barH)/2;
      const radius=Math.min(barW/2, 3);
      ctx.beginPath();
      ctx.moveTo(x+radius,y);
      ctx.lineTo(x+barW-radius,y);
      ctx.quadraticCurveTo(x+barW,y,x+barW,y+radius);
      ctx.lineTo(x+barW,y+barH-radius);
      ctx.quadraticCurveTo(x+barW,y+barH,x+barW-radius,y+barH);
      ctx.lineTo(x+radius,y+barH);
      ctx.quadraticCurveTo(x,y+barH,x,y+barH-radius);
      ctx.lineTo(x,y+radius);
      ctx.quadraticCurveTo(x,y,x+radius,y);
      ctx.fill();
    }

    // Center line
    ctx.strokeStyle='rgba(0,0,0,.04)';
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(0,H/2);
    ctx.lineTo(W,H/2);
    ctx.stroke();
  }
  draw();
}

function stopWaveform(){
  if(animFrameId){ cancelAnimationFrame(animFrameId); animFrameId=null; }
  if(audioCtx){ audioCtx.close(); audioCtx=null; analyser=null; }
  // Clear canvas
  const canvas=el('stream-waveform');
  if(canvas){ const ctx=canvas.getContext('2d'); ctx.fillStyle='#f8f9fa'; ctx.fillRect(0,0,canvas.width,canvas.height); }
}

function toggleStreamRecord(){
  const btn=el('stream-rec-btn');
  if(!streamRecorder||streamRecorder.state==='inactive'){
    streamChunks=[];
    streamRecorder=new MediaRecorder(streamStream,{mimeType:'video/webm'});
    streamRecorder.ondataavailable=e=>{ if(e.data.size>0) streamChunks.push(e.data); };
    streamRecorder.onstop=()=>{
      streamBlob=new Blob(streamChunks,{type:'video/webm'});
    };
    streamRecorder.start();
    btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> 녹화 중지';
    btn.style.background='var(--t1)'; btn.style.color='#fff';
    el('stream-rec-bar').style.display='flex';
    el('stream-status').textContent='녹화 중'; el('stream-status').className='stream-status ss-recording';
    el('stream-finish-btn').style.display='none';
    streamSec=0;
    streamTimerID=setInterval(()=>{
      streamSec++;
      el('stream-rec-timer').textContent=String(Math.floor(streamSec/60)).padStart(2,'0')+':'+String(streamSec%60).padStart(2,'0');
    },1000);
  } else {
    streamRecorder.stop();
    btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg> 다시 녹화';
    btn.style.background=''; btn.style.color='';
    el('stream-rec-bar').style.display='none';
    el('stream-status').textContent='녹화 완료'; el('stream-status').className='stream-status ss-done';
    el('stream-finish-btn').style.display='';
    clearInterval(streamTimerID);
  }
}

let streamHasChecklist=false;
function onStreamChecklist(input){
  if(input.files?.length){
    streamHasChecklist=true;
    el('stream-cl-badge').style.display='';
  }
}

function finishStreamRecord(){
  if(!requireAnalysisPermission('AI 영상 평가 분석')) return;
  stopWaveform();
  if(streamStream){ streamStream.getTracks().forEach(t=>t.stop()); streamStream=null; }

  // 녹화 영상을 page-analysis로 넘겨서 AI 분석
  el('stream-step2').style.display='none';
  el('stream-step0').style.display='none';

  // analysis 페이지 세팅
  el('an-step1').style.display='none';
  el('an-step2').style.display='';
  var apb2=el('an-pdf-btn');if(apb2)apb2.style.display='';
  // 결과 헤더 (스트리밍): 제목 + 교육종류(st-edu-type) + 강사/팀/직군
  setAnResultMeta({title:(v('st-title')||v('an-title')||'').trim(), eduType:(v('st-edu-type')||v('an-edu-type')), userName:CU?.name, team:CU?.team, position:CU?.position});

  // 영상 플레이어
  if(streamBlob){
    el('an-player').innerHTML=`<video id="an-video-el" controls style="width:100%;height:100%;border-radius:var(--r2)"><source src="${URL.createObjectURL(streamBlob)}"></video>`;
  }

  // 평가안 유무
  const hasCL=streamHasChecklist;
  if(!hasCL){
    el('an-split').style.gridTemplateColumns='1fr';
    el('an-criteria-result').parentElement.parentElement.style.display='none';
  } else {
    el('an-split').style.gridTemplateColumns='1fr 1fr';
    el('an-criteria-result').parentElement.parentElement.style.display='';
  }

  // 로딩
  el('an-ai-result').innerHTML='<div style="text-align:center;padding:20px;color:var(--t3)"><div style="font-size:24px;margin-bottom:8px">🤖</div>AI 분석 중...</div>';
  el('an-ts-feed').innerHTML='<div style="text-align:center;padding:20px;color:var(--t3)">평가 항목별 피드백 생성 중...</div>';
  el('an-report').innerHTML='';
  if(hasCL) el('an-criteria-result').innerHTML='<div style="text-align:center;padding:20px;color:var(--t3)">분석 중...</div>';

  showPage('page-analysis');

  // Gemini AI 분석 — 스트리밍은 'st' 접두어로 체크리스트/교육자료 입력 읽기
  const title=v('st-title')||'녹화 영상';
  const count=parseInt(v('st-count'))||20;
  generateAIAnalysis(title,count,hasCL,'st');
  streamHasChecklist=false;
}

function stopStreamWebcam(){
  if(streamStream){ streamStream.getTracks().forEach(t=>t.stop()); streamStream=null; }
  if(streamRecorder&&streamRecorder.state!=='inactive') streamRecorder.stop();
  clearInterval(streamTimerID); streamSec=0;
  stopWaveform();
}

async function saveStreamVideo(){
  if(!CU||!CU.id){ alert('로그인이 필요합니다.'); return; }
  const dur=String(Math.floor(streamSec/60)).padStart(2,'0')+':'+String(streamSec%60).padStart(2,'0');
  const result=await dbCreateVideo({
    userId:CU.id, title:v('st-title'), duration:dur,
    studentCount:parseInt(v('st-count'))||0, status:'분석완료',
    videoType:v('st-type'), channel:v('st-channel'), eduType:v('st-edu-type'),
    date:v('st-date'), solution:'AI 연동 후 솔루션이 자동 생성됩니다.',
    eduFileUrl:document.getElementById('st-checklist-url')?.value||'',
    checklistUrl:document.getElementById('st-cl-url')?.value||'',
    productName:document.getElementById('st-prod-select')?.value||''
  });
  if(result?._error){ alert('❌ 영상 저장 실패\n\n원인: '+result._error+'\n\nDB 또는 권한 확인 필요'); return; }
  if(result && result.id){
    D.videos.push({id:result.id,userId:CU.id,title:v('st-title'),youtube:'',filePath:streamBlob?URL.createObjectURL(streamBlob):'',date:v('st-date'),duration:dur,studentCount:parseInt(v('st-count'))||0,status:'분석완료',timestamps:[],solution:'',videoType:v('st-type')||'',eduType:v('st-edu-type')||''});
    notifyAdminsOfUpload({kind:'video', title:v('st-title'), uploaderId:CU.id, orgName:result.org_name||CU.orgName, link:'page-admin'}).catch(()=>{});
  }
  alert('영상이 저장되었습니다!');
  showPage('page-pick');
}

function retakeStream(){
  el('stream-step3').style.display='none';
  el('stream-step2').style.display='';
  el('step3-num').className='step-num'; el('step3-text').className='step-text';
  el('step2-num').className='step-num active'; el('step2-text').className='step-text active';
  streamBlob=null;
  getCameraStream().then(stream=>{
    streamStream=stream;
    el('stream-webcam').srcObject=stream;
  }).catch(err=>alert('카메라 접근 권한이 필요합니다.'));
}

