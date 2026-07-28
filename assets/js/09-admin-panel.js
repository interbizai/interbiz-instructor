/* 09-admin-panel.js — 영상 등록 모달 + 관리자 패널 + 강사 등록(엑셀) + QR
   (index.html 18130~19009행에서 분리 · 로드 순서 유지 필수) */
/* ════════════════════════════════
   VIDEO REGISTER MODAL (from lecturer page)
════════════════════════════════ */
async function openRegisterVideo(userId){
  const title=prompt('영상 제목을 입력하세요:');
  if(!title) return;
  const date=prompt('강의 날짜 (예: 2026-04-01):') || new Date().toISOString().split('T')[0];
  const sc=prompt('교육생 인원수:') || '0';
  const result=await dbCreateVideo({userId,title,date,duration:'—',studentCount:parseInt(sc)||0});
  if(result?._error){ alert('❌ 영상 등록 실패\n\n원인: '+result._error); return; }
  if(result && result.id){ D.videos.push({id:result.id,userId,title,youtube:'',filePath:'',date,duration:'—',studentCount:parseInt(sc)||0,status:'등록완료',timestamps:[],solution:''}); }
  alert('영상이 등록되었습니다.');
  openLecturer(userId,'page-dashboard');
}

/* ════════════════════════════════
   ADMIN PANEL
════════════════════════════════ */
let adminSortKey='name',adminSortAsc=true;
function sortAdminTable(key){
  if(adminSortKey===key) adminSortAsc=!adminSortAsc;
  else {adminSortKey=key;adminSortAsc=true;}
  renderAdmin();
}
// 크레딧 만료 추적 — 관리자 페이지 상단 배너
// 크레딧 정보 (Google Cloud 실제 데이터로 주기적 업데이트 필요)
const CREDIT_INFO={
  trial: { name:'Trial credit for GenAI App Builder', amount:1510026, end:'2027-04-16' },
  free:  { name:'GCP Free Credit', amount:450061, end:'2026-07-13' }
};
function renderAdminCreditBanner(){
  const banner=document.getElementById('admin-credit-banner');
  if(!banner) return;
  banner.style.display='block';
  banner.innerHTML=`<div style="display:flex;justify-content:flex-end;padding:14px 4px">
    <a href="https://console.cloud.google.com/billing" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border:1px solid rgba(0,120,200,.25);border-radius:10px;font-size:13px;color:var(--blue);font-weight:700;text-decoration:none;background:#fff;transition:background .15s ease" onmouseover="this.style.background='rgba(0,120,200,.05)'" onmouseout="this.style.background='#fff'">
      Cloud Console 열기
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17l10-10"/><polyline points="7 7 17 7 17 17"/></svg>
    </a>
  </div>`;
}

// 검색 입력 — debounce 150ms 로 키 입력마다 재렌더
let _adminSearchTimer=null;
function onAdminSearch(){
  clearTimeout(_adminSearchTimer);
  _adminSearchTimer=setTimeout(()=>{ renderAdmin(); }, 150);
}
function clearAdminSearch(){
  const s=el('admin-search'); if(s){ s.value=''; }
  renderAdmin();
  el('admin-search')?.focus();
}

// 관리 탭 상단 — 최근 AI 코칭 업로드 활동 피드 (영상·스피치·시나리오 알림)
function renderAdminRecentFeed(selectedOrg){
  const area=el('admin-recent-feed');
  if(!area) return;
  // 데이터 소스: 영상(D.videos) + 스피치(D.voiceEvals) — 조직 필터 적용
  const orgMatch=(o)=> selectedOrg==='__NONE__' ? !o : (o===selectedOrg);
  const items=[];
  (D.videos||[]).forEach(v=>{
    if(!orgMatch(v.org_name||v.orgName)) return;
    items.push({kind:'video', id:v.id, title:v.title||'(제목 없음)', userId:v.userId||v.user_id, at:v.created_at||v.date||''});
  });
  (D.voiceEvals||[]).forEach(ve=>{
    if(!orgMatch(ve.org_name)) return;
    items.push({kind:'voice', id:ve.id, title:ve.title||'스피치 평가', userId:ve.user_id, at:ve.created_at||ve.eval_date||''});
  });
  // 본인 받은 'upload_*' 알림에서 시나리오도 포함 (시나리오는 DB 행 없으므로 알림으로만 추적)
  // CU 가 부관리자면 본인 알림에 'upload_scenario' 가 있을 수 있음 — D.notifications 가 있다면 사용
  (D.notifications||[]).filter(n=>typeof n.type==='string' && n.type.startsWith('upload_')).forEach(n=>{
    if(n.type==='upload_video' || n.type==='upload_voice') return;  // 영상/스피치는 위에서 이미 포함
    if(!orgMatch(n.org_name)) return;
    items.push({kind: n.type.replace('upload_',''), id:n.id, title:n.body?.replace(/^"|"$/g,'')||n.title||'', notifTitle:n.title, at:n.created_at||''});
  });
  // 최근순 정렬 후 상위 6건
  items.sort((a,b)=> (b.at||'').localeCompare(a.at||''));
  const recent=items.slice(0,6);
  const kindBadge = (k)=>{
    if(k==='video')    return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:8px;background:rgba(0,120,200,.1);color:var(--blue);font-size:10px;font-weight:800">🎬 영상</span>';
    if(k==='voice')    return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:8px;background:rgba(139,92,246,.12);color:#7c3aed;font-size:10px;font-weight:800">🎙 스피치</span>';
    if(k==='scenario') return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:8px;background:rgba(16,185,129,.12);color:#059669;font-size:10px;font-weight:800">📝 시나리오</span>';
    return '<span style="font-size:10px;color:var(--t3)">자료</span>';
  };
  const timeAgo=(iso)=>{
    if(!iso) return '';
    const t=new Date(iso); if(isNaN(t)) return '';
    const diff=(Date.now()-t.getTime())/1000;
    if(diff<60)        return '방금';
    if(diff<3600)      return Math.floor(diff/60)+'분 전';
    if(diff<86400)     return Math.floor(diff/3600)+'시간 전';
    if(diff<86400*7)   return Math.floor(diff/86400)+'일 전';
    return iso.slice(0,10);
  };
  if(!recent.length){
    area.innerHTML=`<div style="padding:14px 16px;border:1px dashed var(--bdr);border-radius:12px;background:#fafafa;font-size:12px;color:var(--t3);text-align:center">${selectedOrg==='__NONE__'?'조직 미설정':selectedOrg} 의 최근 AI 코칭 활동이 없습니다</div>`;
    return;
  }
  const rows=recent.map(it=>{
    const u=(D.users||[]).find(x=>x.id===it.userId);
    const nm=u?.name || it.notifTitle?.match(/^(\S+강사)/)?.[1] || '강사';
    const pos=u?.position || '현장강사';
    const safeT=(it.title||'').replace(/</g,'&lt;');
    const onclickAttr = it.kind==='video' && it.id ? `onclick="openVideo(${it.id})"`
                      : it.kind==='voice' && it.id ? `onclick="openVoiceResult(${it.id})"`
                      : it.kind==='scenario' ? `onclick="showPage('page-aicoach')"`
                      : '';
    const cursor=onclickAttr?'cursor:pointer;':'';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--bdr);transition:background .12s;${cursor}" ${onclickAttr} ${onclickAttr?`onmouseover="this.style.background='rgba(0,120,200,.04)'" onmouseout="this.style.background=''"`:''}>
      ${kindBadge(it.kind)}
      <span style="font-size:12px;font-weight:700;color:var(--t1)">${pos} ${nm}</span>
      <span style="font-size:12px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">— ${safeT}</span>
      <span style="font-size:10.5px;color:var(--t3);flex-shrink:0">${timeAgo(it.at)}</span>
    </div>`;
  }).join('');
  area.innerHTML=`<div style="border:1px solid var(--bdr);border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.04)">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:linear-gradient(135deg,#f8fafc,#f1f5f9);border-bottom:1px solid var(--bdr)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:800;color:var(--t1)">📢 최근 AI 코칭 업로드</span>
        <span style="font-size:10px;color:var(--t3);font-weight:600">(${selectedOrg==='__NONE__'?'조직 미설정':selectedOrg})</span>
      </div>
      <span style="font-size:10px;color:var(--t3)">최근 6건 · 클릭 시 이동</span>
    </div>
    ${rows}
  </div>`;
}

function renderAdmin(){
  // 조직 필터 드롭다운 채우기 (현재 존재하는 org_name들 + 기본값 유지)
  const orgSel=el('admin-org-filter');
  if(orgSel){
    const currentVal=orgSel.value;
    const orgs=[...new Set((D.users||[]).map(u=>u.orgName).filter(Boolean))].sort();
    // 기본값: 기존 선택 유지 → 없으면 'LG전자 강사' → 없으면 첫 번째 조직 → 없으면 '(조직 미설정)'
    let defaultOrg=currentVal && orgs.includes(currentVal) ? currentVal
                  : orgs.includes('LG전자 강사') ? 'LG전자 강사'
                  : orgs[0] || '';
    orgSel.innerHTML=orgs.length
      ? orgs.map(o=>`<option value="${o}"${o===defaultOrg?' selected':''}>${o}</option>`).join('')
        +`<option value="__NONE__"${!defaultOrg?' selected':''}>(조직 미설정)</option>`
      : `<option value="__NONE__" selected>(조직 미설정)</option>`;
    if(!currentVal) orgSel.value=defaultOrg||'__NONE__';
  }
  const selectedOrg=orgSel?.value||'';
  // 최근 AI 코칭 업로드 피드 (조직별)
  try{ renderAdminRecentFeed(selectedOrg); }catch(_){}
  // 선택된 조직만 필터
  let filtered=(D.users||[]).filter(u=>{
    if(selectedOrg==='__NONE__') return !u.orgName;
    return u.orgName===selectedOrg;
  });
  // 검색어 필터 — 성명·팀·사무실·연락처·메일·직군 다중 매칭
  const searchEl=el('admin-search');
  const kw=(searchEl?.value||'').trim().toLowerCase();
  const totalOrg=filtered.length;
  if(kw){
    filtered=filtered.filter(u=>{
      return (u.name||'').toLowerCase().includes(kw)
          || (u.team||'').toLowerCase().includes(kw)
          || (u.office||'').toLowerCase().includes(kw)
          || (u.phone||'').toLowerCase().includes(kw)
          || (u.email||'').toLowerCase().includes(kw)
          || (u.position||'').toLowerCase().includes(kw)
          || (u.channel||'').toLowerCase().includes(kw);
    });
  }
  // 검색 카운트·지우기 버튼 표시
  const cntEl=el('admin-search-count');
  if(cntEl) cntEl.textContent = kw ? `${filtered.length} / ${totalOrg}명` : `${totalOrg}명`;
  const clrBtn=el('admin-search-clear');
  if(clrBtn) clrBtn.style.display = kw ? '' : 'none';
  // User table (정렬)
  const sortedUsers=[...filtered].sort((a,b)=>{
    let va=(a[adminSortKey]||'').toString(), vb=(b[adminSortKey]||'').toString();
    if(adminSortKey==='birthYear'){va=parseInt(va)||0;vb=parseInt(vb)||0;return adminSortAsc?va-vb:vb-va;}
    return adminSortAsc?va.localeCompare(vb):vb.localeCompare(va);
  });
  // 검색 결과 0건 시 안내
  if(kw && !sortedUsers.length){
    el('admin-user-tbody').innerHTML = `<tr><td colspan="13" style="padding:32px;text-align:center;color:var(--t3);font-size:13px">"<b style="color:var(--t1)">${kw}</b>" 검색 결과 없음 · <a href="#" onclick="event.preventDefault();clearAdminSearch();" style="color:var(--blue);text-decoration:underline">검색 지우기</a></td></tr>`;
    return;
  }
  el('admin-user-tbody').innerHTML=sortedUsers.map(u=>{
    const isSubAdmin=u.isSubAdmin;
    const deletedStyle=u.deleted?'background:rgba(239,68,68,.04)':'';
    const deletedBadge=u.deleted?'<span style="font-size:10px;padding:2px 7px;border-radius:8px;background:rgba(239,68,68,.12);color:var(--red);font-weight:700;margin-left:6px">삭제됨</span>':'';
    const st=u.status||'근무';
    const stColor=st==='근무'?'#10b981':(st==='육아휴직'||st==='휴직')?'#f59e0b':(st==='퇴사')?'#9ca3af':'#6b7280';
    const statusBadge=`<span style="font-size:10px;padding:3px 8px;border-radius:10px;background:${stColor}22;color:${stColor};font-weight:700;white-space:nowrap">${st}</span>`;
    const birthDisplay=u.birthDate||(u.birthYear?u.birthYear+'년':'—');
    return `<tr style="${deletedStyle}">
      <td style="font-size:11px;color:var(--t2)">${u.orgName||'—'}</td>
      <td style="font-size:11px">${u.team||'—'}</td>
      <td style="font-size:11px">${u.office||'—'}</td>
      <td style="font-size:11px">${u.position||'—'}</td>
      <td>${u.deleted
        ?`<strong style="color:var(--t3);text-decoration:line-through">${u.name}</strong>`
        :`<strong style="color:var(--blue);cursor:pointer;text-decoration:underline;text-decoration-color:rgba(0,120,200,.3);text-underline-offset:3px" onclick="openLecturer(${u.id},'page-admin')" title="마이페이지로 이동">${u.name}</strong>`}${deletedBadge}</td>
      <td style="font-size:11px">${u.phone||'—'}</td>
      <td style="color:var(--t3);font-size:11px">${birthDisplay}</td>
      <td style="color:var(--t3);font-size:11px">${u.hireDate||'—'}</td>
      <td style="font-size:11px">${u.channel||'—'}</td>
      <td style="color:var(--t3);font-size:11px">${u.email}</td>
      <td>${statusBadge}</td>
      <td>${isSubAdmin?'<span style="font-size:10px;padding:3px 8px;border-radius:10px;background:rgba(0,120,200,.1);color:var(--blue);font-weight:700">부관리자</span>':''}</td>
      <td style="white-space:nowrap">
        ${u.deleted
          ?`<button class="btn" style="padding:4px 8px;font-size:10px;color:var(--green)" onclick="restoreUser(${u.id})">복구</button>
            <button class="btn" style="padding:4px 8px;font-size:10px;color:var(--red)" onclick="permaDeleteUser(${u.id})">영구삭제</button>`
          :`<button class="btn btn-ghost" style="padding:4px 8px;font-size:10px" onclick="openEditUserModal(${u.id})">수정</button>
            <button class="btn btn-ghost" style="padding:4px 8px;font-size:10px" onclick="resetPw(${u.id})">PW초기화</button>
            <button class="btn" style="padding:4px 8px;font-size:10px;color:var(--red)" onclick="deleteUser(${u.id})">삭제</button>
            ${CU?.isSubAdmin?'':(isSubAdmin
              ?`<button class="btn" style="padding:4px 8px;font-size:10px;color:var(--orange)" onclick="toggleSubAdmin(${u.id},false)">권한취소</button>`
              :`<button class="btn btn-ghost" style="padding:4px 8px;font-size:10px;color:var(--blue)" onclick="toggleSubAdmin(${u.id},true)">부관리자</button>`)}`}
      </td>
    </tr>`;
  }).join('');
}
/* ════════════════════════════════
   강사 등록 — 엑셀 일괄 / 단일 수동 / 양식 다운로드
════════════════════════════════ */
// YYMMDD 6자리 숫자 → YYYY-MM-DD 문자열 (25 이하 → 2000대, 초과 → 1900대)
function parseBirth(v){
  if(!v&&v!==0) return null;
  // Excel 날짜 시리얼(숫자, 대략 25000~60000)
  if(typeof v==='number'&&v>=10000&&v<60000){
    const d=new Date(Math.round((v-25569)*86400*1000));
    if(isNaN(d)) return null;
    return d.toISOString().slice(0,10);
  }
  let s=String(v).trim().replace(/[^\d-]/g,'');
  // YYYY-MM-DD 또는 YYYY/MM/DD
  const iso=s.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // YYMMDD 6자리
  const m=s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if(m){
    const yy=parseInt(m[1]);
    const year=yy<=25?2000+yy:1900+yy;
    return `${year}-${m[2]}-${m[3]}`;
  }
  return null;
}
// 입사일 파싱 (Excel 시리얼 or 문자열)
function parseHireDate(v){
  if(!v&&v!==0) return null;
  if(typeof v==='number'&&v>=10000&&v<60000){
    const d=new Date(Math.round((v-25569)*86400*1000));
    if(isNaN(d)) return null;
    return d.toISOString().slice(0,10);
  }
  const s=String(v).trim();
  const m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return s||null;
}
// 엑셀 양식 다운로드
function downloadUserTemplate(){
  const header=['조직명','팀명','사무실','직군','성명','연락처','생년월일','입사일','상권','메일(아이디)','상태'];
  const sample=['LG전자 강사','수도권1','서울','현장강사','홍길동','010-1234-5678','930113','2020-06-01','서울','hong@interbiz.co.kr','근무'];
  const ws=XLSX.utils.aoa_to_sheet([header,sample]);
  ws['!cols']=header.map(()=>({wch:18}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'강사등록');
  XLSX.writeFile(wb,'강사등록_양식.xlsx');
}
// 엑셀 일괄 업로드 (중복 건너뛰기, pw='1234' 자동)
function bulkImportUsers(input){
  const file=input.files?.[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      if(rows.length<2){alert('데이터가 없습니다.');input.value='';return;}
      // 헤더 검증 (1행은 헤더)
      const dataRows=rows.slice(1).filter(r=>(r[4]||'').toString().trim()&&(r[9]||'').toString().trim());
      if(!dataRows.length){alert('유효한 데이터 행이 없습니다.');input.value='';return;}
      const existingEmails=new Set((D.users||[]).map(u=>(u.email||'').toLowerCase().trim()));
      let added=0, skipped=0, failMissing=0, failDB=0;
      const skippedEmails=[], dbErrors=[];
      for(let i=0;i<dataRows.length;i++){
        const r=dataRows[i];
        const rowNum=i+2; // 엑셀에선 1행이 헤더, 2행부터 데이터
        const email=(r[9]||'').toString().trim();
        const name=(r[4]||'').toString().trim();
        if(!name||!email){failMissing++;dbErrors.push(`${rowNum}행: 성명 또는 메일 누락`);continue;}
        if(existingEmails.has(email.toLowerCase())){skipped++;skippedEmails.push(email);continue;}
        const payload={
          orgName:(r[0]||'').toString().trim()||curOrg(),
          team:(r[1]||'').toString().trim()||null,
          office:(r[2]||'').toString().trim()||null,
          position:(r[3]||'').toString().trim()||'현장강사',
          name:name,
          phone:(r[5]||'').toString().trim()||null,
          birthDate:parseBirth(r[6]),
          hireDate:parseHireDate(r[7]),
          channel:(r[8]||'').toString().trim()||null,
          email:email,
          status:(r[10]||'').toString().trim()||'근무',
          pw:'1234'
        };
        const created=await dbCreateUser(payload);
        if(created&&!created._error){added++;existingEmails.add(email.toLowerCase());}
        else{failDB++;dbErrors.push(`${rowNum}행 ${email}: ${created?._error||'DB 저장 실패'}`);}
      }
      await loadFromDB();
      renderAdmin();
      let msg=`✅ ${added}명 등록 완료`;
      if(skipped>0) msg+=`\n⏭ ${skipped}명 중복으로 건너뜀`;
      if(failMissing>0) msg+=`\n⚠️ ${failMissing}명 실패 (성명/메일 누락)`;
      if(failDB>0){
        msg+=`\n❌ ${failDB}명 DB 저장 실패`;
        if(dbErrors.length){
          msg+='\n\n에러 상세 (최대 3건):\n'+dbErrors.slice(0,3).join('\n');
          console.error('전체 실패 내역:',dbErrors);
        }
      }
      if(added>0) msg+='\n\n초기 비밀번호는 전원 1234입니다.';
      alert(msg);
    }catch(err){
      console.error(err);
      alert('엑셀 읽기 실패: '+err.message);
    }
    input.value='';
  };
  reader.readAsArrayBuffer(file);
}
// 단일 강사 추가 모달
function openAddUserModal(){
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='add-user-overlay';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;padding:24px;max-width:560px;width:94vw;max-height:92vh;overflow-y:auto;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div style="font-size:17px;font-weight:900;color:var(--t1)">강사 추가</div>
      <button style="border:none;background:none;cursor:pointer;font-size:22px;color:var(--t3)" onclick="this.closest('.overlay').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${[
        ['au-org','조직명',curOrg()||'LG전자 강사'],['au-team','팀명','수도권1'],['au-office','사무실','서울'],
        ['au-pos','직군','현장강사'],['au-name','성명 *',''],['au-phone','연락처','010-0000-0000'],
        ['au-birth','생년월일','YYYY-MM-DD 또는 YYMMDD'],['au-hire','입사일','YYYY-MM-DD'],
        ['au-ch','상권','서울'],['au-email','아이디 * (이메일 형식 아니어도 됨)','interbiz1989ai'],['au-pw','비밀번호 (비우면 1234)','영문·숫자·특수문자 가능']
      ].map(([id,label,ph])=>`<div><label style="font-size:11px;font-weight:700;color:var(--t2);display:block;margin-bottom:4px">${label}</label><input id="${id}" type="text" placeholder="${ph}" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;font-size:12px"></div>`).join('')}
      <div><label style="font-size:11px;font-weight:700;color:var(--t2);display:block;margin-bottom:4px">상태</label>
        <select id="au-status" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;font-size:12px">
          <option value="근무">근무</option><option value="육아휴직">육아휴직</option><option value="휴직">휴직</option><option value="퇴사">퇴사</option>
        </select>
      </div>
    </div>
    <div style="padding:10px 12px;background:rgba(0,120,200,.06);border-radius:8px;margin-top:14px;font-size:11px;color:var(--t2)">비밀번호를 입력하지 않으면 <strong style="color:var(--blue)">1234</strong>로 설정됩니다. 영문·숫자·특수문자 조합, 4자 이상 권장. 로그인 후 본인이 변경할 수 있습니다.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">취소</button>
      <button class="btn" style="background:var(--blue);color:#fff" onclick="submitAddUser()">등록</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}
async function submitAddUser(){
  const email=v('au-email').trim(), name=v('au-name').trim();
  const pw=v('au-pw').trim()||'1234';
  if(!name){alert('성명을 입력하세요.');return;}
  if(!email){alert('아이디를 입력하세요.');return;}
  if(D.users.some(u=>(u.email||'').toLowerCase()===email.toLowerCase())){alert('이미 등록된 아이디입니다.');return;}
  const payload={
    orgName:v('au-org').trim()||curOrg(),
    team:v('au-team').trim()||null,
    office:v('au-office').trim()||null,
    position:v('au-pos').trim()||'현장강사',
    name, phone:v('au-phone').trim()||null,
    birthDate:parseBirth(v('au-birth').trim()),
    hireDate:parseHireDate(v('au-hire').trim()),
    channel:v('au-ch').trim()||null, email,
    status:v('au-status')||'근무', pw
  };
  const created=await dbCreateUser(payload);
  if(!created){alert('등록 실패');return;}
  await loadFromDB();renderAdmin();
  document.getElementById('add-user-overlay')?.remove();
  alert(`✅ ${name} 강사 등록 완료\n초기 비밀번호: ${pw}`);
}
// 기존 강사 수정 모달
function openEditUserModal(id){
  const u=D.users.find(x=>x.id===id);if(!u){alert('강사를 찾을 수 없습니다.');return;}
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='edit-user-overlay';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  const fields=[
    ['eu-org','조직명',u.orgName||''],['eu-team','팀명',u.team||''],['eu-office','사무실',u.office||''],
    ['eu-pos','직군',u.position||''],['eu-name','성명',u.name||''],['eu-phone','연락처',u.phone||''],
    ['eu-birth','생년월일',u.birthDate||''],['eu-hire','입사일',u.hireDate||''],
    ['eu-ch','상권',u.channel||''],['eu-email','메일(아이디)',u.email||'']
  ];
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;padding:24px;max-width:560px;width:94vw;max-height:92vh;overflow-y:auto;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div style="font-size:17px;font-weight:900;color:var(--t1)">강사 정보 수정</div>
      <button style="border:none;background:none;cursor:pointer;font-size:22px;color:var(--t3)" onclick="this.closest('.overlay').remove()">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${fields.map(([id,label,val])=>`<div><label style="font-size:11px;font-weight:700;color:var(--t2);display:block;margin-bottom:4px">${label}</label><input id="${id}" type="text" value="${(val+'').replace(/"/g,'&quot;')}" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;font-size:12px"></div>`).join('')}
      <div><label style="font-size:11px;font-weight:700;color:var(--t2);display:block;margin-bottom:4px">상태</label>
        <select id="eu-status" style="width:100%;padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;font-size:12px">
          ${['근무','육아휴직','휴직','퇴사'].map(s=>`<option value="${s}" ${u.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">취소</button>
      <button class="btn" style="background:var(--blue);color:#fff" onclick="submitEditUser(${id})">저장</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}
async function submitEditUser(id){
  const u=D.users.find(x=>x.id===id);
  if(!u){alert('강사를 찾을 수 없습니다.');return;}
  const newEmail=(v('eu-email')||'').trim().toLowerCase();
  // 아이디(이메일) 형식 강제 제거 — 이메일 형식 아닌 ID 허용
  // 아이디 중복 체크 (본인 제외)
  if(newEmail && newEmail!==(u.email||'').toLowerCase()){
    const dup=(D.users||[]).find(x=>x.id!==id && (x.email||'').toLowerCase()===newEmail);
    if(dup){alert('이미 사용 중인 이메일입니다: '+dup.name);return;}
  }
  const fields={
    orgName:v('eu-org').trim()||null,
    team:v('eu-team').trim()||null,
    office:v('eu-office').trim()||null,
    position:v('eu-pos').trim()||null,
    name:v('eu-name').trim(),
    phone:v('eu-phone').trim()||null,
    birthDate:parseBirth(v('eu-birth').trim()),
    hireDate:parseHireDate(v('eu-hire').trim()),
    channel:v('eu-ch').trim()||null,
    status:v('eu-status')||'근무'
  };
  // 이메일 변경 시에만 fields 에 포함
  if(newEmail && newEmail!==(u.email||'').toLowerCase()){
    fields.email=newEmail;
  }
  try{
    const upRes=await dbUpdateUser(id,fields);
    if(upRes && upRes.ok===false){
      alert('❌ 저장 실패\n\n원인: '+(upRes.error||'알 수 없음')+'\n\n다음 확인:\n· DB 권한 (GRANT)\n· users 테이블 RLS 상태\n· email unique constraint');
      return;
    }
  }catch(e){
    alert('저장 실패: '+(e?.message||e));
    return;
  }
  // ⚡ silent fail 차단 — DB read 로 실제 반영 확인
  try{
    const{data:verify, error:vErr}=await sb.from('users').select('id,name,email,phone,team,org_name,position,office,status').eq('id',id).maybeSingle();
    if(vErr) throw vErr;
    if(!verify){alert('⚠ 저장 후 DB 검증 실패 — 사용자 행 없음');return;}
    // 이메일 변경했는데 DB 에 반영 안 됨 → 즉시 알림
    if(fields.email && String(verify.email||'').toLowerCase() !== fields.email){
      alert('❌ 이메일 변경 실패\n\n저장 시도는 됐으나 DB에 반영되지 않았습니다.\n\nDB 현재 값: '+(verify.email||'(빈값)')+'\n시도 값: '+fields.email+'\n\n다음 확인:\n· users.email unique constraint 충돌\n· 권한 (GRANT)\n· 같은 이메일을 가진 삭제된 행');
      return;
    }
    // D.users 동기화 (DB 값으로)
    Object.assign(u, verify);
  }catch(verr){
    console.warn('[submitEditUser] 검증 read 실패:', verr);
    Object.assign(u, fields); // 검증 실패해도 일단 캐시 갱신
  }
  document.getElementById('edit-user-overlay')?.remove();
  renderAdmin();
  if(fields.email){
    alert('✅ 저장·검증 완료\n\n· 새 이메일(아이디): '+fields.email+'\n\n⚠ 해당 강사는 새 이메일로 다시 로그인해야 합니다.\n  비밀번호가 기억 안 나면 관리자 → PW초기화 → 0000');
  } else {
    if(typeof showToast==='function') showToast('✓ 저장 완료','#10b981');
  }
}
// 전체 강사 영구 삭제 (3단계 확인)
async function purgeAllUsers(){
  if(CU?.isSubAdmin){alert('전체 삭제는 관리자만 가능합니다.');return;}
  const total=D.users.length;
  if(!total){alert('삭제할 강사가 없습니다.');return;}
  // 1단계: 기본 확인
  if(!confirm(`⚠️ 전체 강사 ${total}명을 영구 삭제합니다.\n\n관련 영상·평가 등 연결 데이터도 함께 삭제될 수 있습니다.\n이 작업은 되돌릴 수 없습니다.\n\n계속하시겠습니까?`)) return;
  // 2단계: 문구 입력 확인
  const typed=prompt(`정말 영구 삭제하시려면 아래 문구를 정확히 입력하세요:\n\n전체삭제\n\n(공백·띄어쓰기 없이)`);
  if(typed!=='전체삭제'){alert('입력 문구가 일치하지 않아 취소되었습니다.');return;}
  // 3단계: 최종 확인
  if(!confirm(`마지막 확인 — ${total}명 전원을 지금 영구 삭제합니다. 진행할까요?`)) return;
  // 삭제 수행 (id>0 — 관리자 하드코딩은 DB에 없음)
  const {error}=await sb.from('users').delete().gte('id',1);
  if(error){
    alert('❌ 삭제 실패: '+error.message+'\n\n연관 데이터(videos·evaluations 등)의 외래키 제약 때문일 수 있습니다.');
    console.error('purgeAllUsers:',error);
    return;
  }
  // 현재 로그인한 강사가 포함됐을 수 있음 → 강제 로그아웃
  if(CU && !CU.isAdmin){
    alert(`✅ ${total}명 영구 삭제 완료\n\n본인 계정도 삭제되어 로그아웃됩니다.`);
    doLogout();
    return;
  }
  await loadFromDB();
  renderAdmin();
  alert(`✅ ${total}명 영구 삭제 완료`);
}
async function toggleSubAdmin(id,grant){
  if(CU?.isSubAdmin){alert('부관리자 등록/취소는 관리자만 가능합니다.');return;}
  // 서버 API 사용 — sbAdmin(service role) 으로 RLS 우회
  try{
    const token=localStorage.getItem('ib_token')||'';
    const r=await fetch('/api/auth/grant-sub-admin',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({userId:id, grant:!!grant})
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok){
      alert('권한 변경 실패: '+(j.error||r.status));
      return;
    }
  }catch(e){
    alert('권한 변경 실패: 네트워크 오류');
    return;
  }
  const u=D.users.find(x=>x.id===id);
  if(u) u.isSubAdmin=grant;
  // 알림 — 승격/취소 대상 본인에게
  try{
    dbCreateNotification({
      userId:id,
      type:'permission',
      title:grant?'🔑 부관리자 권한 부여':'🔑 부관리자 권한 취소',
      body:grant?'관리자에게 부관리자 권한을 부여받았습니다. 새로고침 후 관리자 메뉴를 확인하세요.':'부관리자 권한이 취소되었습니다.',
      link:'page-myprofile',
      orgName:u?.orgName||null
    });
  }catch(e){ console.warn('permission notif:',e); }
  alert(grant?`${u?.name||''} 님에게 부관리자 권한을 부여했습니다.`:`${u?.name||''} 님의 부관리자 권한을 취소했습니다.`);
  renderAdmin();
}
async function resetPw(id){
  const u=D.users.find(x=>x.id===id);
  if(!u){alert('강사를 찾을 수 없습니다.');return;}
  if(!confirm(`${u.name} (${u.email||'이메일 없음'}) 의 비밀번호를 0000 으로 초기화하시겠습니까?`)) return;
  const token=localStorage.getItem('ib_token')||'';
  try{
    const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({userId:id,newPassword:'0000'})});
    const j=await r.json().catch(()=>({}));
    if(!j.ok){ alert('❌ 초기화 실패: '+(j.error||'알 수 없는 오류')+'\n\nstatus='+r.status); return; }
    // 검증 read — 진짜로 pw 가 업데이트됐는지 확인
    try{
      const{data:verify}=await sb.from('users').select('id,name,email,pw').eq('id',id).maybeSingle();
      if(!verify){ alert('⚠ 응답은 성공이지만 사용자 행을 다시 읽지 못함'); return; }
      if(!verify.pw){ alert('⚠ DB에 비밀번호가 비어있음 — 초기화 실패'); return; }
      alert(`✅ 비밀번호 초기화 완료\n\n· 강사: ${verify.name}\n· 이메일(아이디): ${verify.email||'없음'}\n· 새 비밀번호: 0000\n\n해당 강사에게 위 정보를 안내해주세요.`);
    }catch(verr){
      alert(`✅ 초기화 응답 성공 (DB 검증 read 실패: ${verr?.message||verr})\n\n· 강사: ${u.name}\n· 새 비밀번호: 0000`);
    }
  }catch(e){ alert('네트워크 오류: '+(e?.message||e)); }
}
async function deleteUser(id){
  if(!confirm('강사를 삭제하시겠습니까?\n\n삭제 시:\n- 해당 강사는 바로 로그아웃되며 재로그인 불가\n- 인터픽·홈 검색에서 제외\n- 관리자 페이지에는 영상·평가 기록이 그대로 보존됩니다')) return;
  await dbDeleteUser(id);
  const u=D.users.find(x=>x.id===id);
  if(u){ u.deleted=true; u.deletedAt=new Date().toISOString(); }
  renderAdmin();
}
// 단일 강사 영구 삭제 (2단계 확인)
async function permaDeleteUser(id){
  if(CU?.isSubAdmin){alert('영구 삭제는 관리자만 가능합니다.');return;}
  const u=D.users.find(x=>x.id===id);
  const name=u?.name||'';
  if(!confirm(`⚠️ ${name} 강사를 영구 삭제합니다.\n\n관련 영상·평가 등 연결 데이터도 함께 삭제될 수 있습니다.\n이 작업은 되돌릴 수 없습니다.\n\n계속하시겠습니까?`)) return;
  const typed=prompt(`정말 영구 삭제하시려면 강사 이름을 정확히 입력하세요:\n\n${name}`);
  if(typed!==name){alert('입력 이름이 일치하지 않아 취소되었습니다.');return;}
  const {error}=await sb.from('users').delete().eq('id',id);
  if(error){
    alert('❌ 삭제 실패: '+error.message+'\n\n연관 데이터(videos·evaluations 등)의 외래키 제약 때문일 수 있습니다.');
    console.error('permaDeleteUser:',error);
    return;
  }
  if(CU && CU.id===id){
    alert(`✅ ${name} 영구 삭제 완료\n\n본인 계정이라 로그아웃됩니다.`);
    doLogout();
    return;
  }
  await loadFromDB();
  renderAdmin();
  alert(`✅ ${name} 강사 영구 삭제 완료`);
}
async function restoreUser(id){
  if(!confirm('삭제된 강사를 복구하시겠습니까?')) return;
  await dbRestoreUser(id);
  const u=D.users.find(x=>x.id===id);
  if(u){ u.deleted=false; u.deletedAt=null; }
  renderAdmin();
}
function renderCriteria(){
  el('criteria-rows').innerHTML=D.criteria.map((c,i)=>`
    <div style="display:grid;grid-template-columns:1fr 80px 2fr auto;gap:8px;margin-bottom:8px;align-items:center">
      <input type="text" value="${c.name}" onchange="D.criteria[${i}].name=this.value">
      <input type="number" value="${c.max}" onchange="D.criteria[${i}].max=parseInt(this.value)" style="text-align:center">
      <input type="text" value="${c.desc}" onchange="D.criteria[${i}].desc=this.value">
      <button class="btn btn-ghost" style="padding:5px 8px;color:var(--red)" onclick="D.criteria.splice(${i},1);renderCriteria()">✕</button>
    </div>`).join('');
}
function addCriteriaRow(){ D.criteria.push({name:'새 항목',max:10,desc:''}); renderCriteria(); }
function saveCriteria(){ save(); alert('평가 기준이 저장되었습니다.'); }
function renderRefVideos(){
  el('ref-video-list').innerHTML=['가전','IT','서비스'].map(ch=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bdr)">
      <span class="channel-chip ch-${ch}" style="flex-shrink:0">${ch}</span>
      <input type="text" value="${D.refVideos[ch]||''}" placeholder="YouTube URL 입력" id="ref-${ch}" style="flex:1">
      <button class="btn btn-blue" style="padding:6px 12px;font-size:11px;flex-shrink:0" onclick="D.refVideos['${ch}']=document.getElementById('ref-${ch}').value;save();alert('저장됨')">저장</button>
    </div>`).join('');
}
function renderStatChart(){
  const channels=['가전','IT','서비스'];
  el('stat-chart').innerHTML=channels.map(ch=>{
    const users=D.users.filter(u=>u.channel===ch);
    const avg=users.length?(users.reduce((a,b)=>a+b.score,0)/users.length).toFixed(1):'—';
    const pct=users.length?Math.round(parseFloat(avg))+'%':'0%';
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px"><span class="channel-chip ch-${ch}">${ch}</span><span style="font-weight:700">${avg}점 (${users.length}명)</span></div>
      <div class="bar-track"><div class="bar-fill ${ch==='가전'?'bf-red':ch==='IT'?'bf-blue':'bf-green'}" style="width:${pct}"></div></div>
    </div>`;
  }).join('');
}
function switchTab(name,btn){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  el('tab-'+name)?.classList.add('active');
}

/* 교육종류 관리 (관리자 · Supabase 공유, DB 미존재 시 localStorage 폴백) */
function showEduTypeToast(msg,color){
  const t=el('edu-type-toast');
  if(!t) return;
  t.textContent=msg;
  t.style.background=color||'#10b981';
  t.style.opacity='1';
  t.style.transform='translateY(0)';
  clearTimeout(window._eduTypeToastT);
  window._eduTypeToastT=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(-6px)';},1800);
}
// 범용 토스트 (교육자료 페이지 등 다른 곳용 — body 우상단에 고정 표시)
function showToast(msg,color){
  let t=document.getElementById('global-toast');
  if(!t){
    t=document.createElement('div');
    t.id='global-toast';
    t.style.cssText='position:fixed;top:24px;right:24px;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;color:#fff;background:#10b981;opacity:0;transform:translateY(-8px);transition:opacity .25s ease,transform .25s ease;pointer-events:none;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.15);max-width:360px';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.style.background=color||'#10b981';
  t.style.opacity='1';
  t.style.transform='translateY(0)';
  clearTimeout(window._globalToastT);
  window._globalToastT=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(-8px);';},2000);
}
/* ════════════════════════════════
   앱 설치 QR / 포스터  ── 지연 로드 (lazy load)
   실제 로직은 /assets/js/qr-poster.js 에 분리됨.
   "앱 설치 QR" 탭 클릭 시 처음 한 번만 다운로드 → 캐시.
   stub 함수들은 모듈 로드 후 실제 구현으로 자동 교체됨.
════════════════════════════════ */
let _qrModuleLoadingPromise=null;
function _ensureQRModule(){
  if(window._qrModuleLoaded) return Promise.resolve();
  if(_qrModuleLoadingPromise) return _qrModuleLoadingPromise;
  _qrModuleLoadingPromise=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='/assets/js/qr-poster.js';
    s.async=true;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('QR 모듈 로드 실패'));
    document.head.appendChild(s);
  });
  return _qrModuleLoadingPromise;
}
async function renderAppQR(){
  // 모듈 로드 전 클릭됐을 수 있으므로 큐 플래그
  window._qrPendingRender=true;
  try{ await _ensureQRModule(); window.renderAppQR(); }
  catch(e){ console.warn(e); alert('QR 모듈 로드 실패. 새로고침 후 다시 시도하세요.'); }
}
async function openQRPoster(){ try{ await _ensureQRModule(); window.openQRPoster(); }catch(e){console.warn(e);} }
async function printQRPoster(){ try{ await _ensureQRModule(); window.printQRPoster(); }catch(e){console.warn(e);} }
async function downloadQRImage(){ try{ await _ensureQRModule(); window.downloadQRImage(); }catch(e){console.warn(e);} }
async function copyQRLink(){ try{ await _ensureQRModule(); window.copyQRLink(); }catch(e){console.warn(e);} }
async function copyQRShareText(){ try{ await _ensureQRModule(); window.copyQRShareText(); }catch(e){console.warn(e);} }

function renderEduTypeManage(){
  const listEl=el('edu-type-list');
  if(!listEl) return;
  // 진짜 관리자가 '전체 조직' 모드일 때는 추가 차단 안내
  const noOrgWarn=el('edu-type-noorg-warn');
  const inp=el('edu-type-input');
  const addBtn=el('edu-type-add-btn');
  const isAllOrg=D.isRealAdmin && !D.activeOrg;
  if(noOrgWarn) noOrgWarn.style.display=isAllOrg?'block':'none';
  if(inp) inp.disabled=isAllOrg;
  if(addBtn){ addBtn.disabled=isAllOrg; addBtn.style.opacity=isAllOrg?'0.4':'1'; addBtn.style.cursor=isAllOrg?'not-allowed':'pointer'; }
  const records=getEduTypeRecords();
  if(!records.length){
    listEl.innerHTML='<div style="padding:24px;text-align:center;font-size:12px;color:var(--t3)">등록된 교육종류가 없습니다. 상단 입력창으로 추가하세요.</div>';
    return;
  }
  const esc=s=>String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const escHtml=s=>String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  listEl.innerHTML=records.map((r)=>{
    const orgBadge=isAllOrg && r.org_name
      ? `<span style="font-size:10px;font-weight:700;color:var(--blue);background:rgba(0,120,200,.08);padding:2px 8px;border-radius:999px;margin-left:8px">${escHtml(r.org_name)}</span>`
      : (isAllOrg && !r.org_name ? `<span style="font-size:10px;font-weight:700;color:var(--t3);background:rgba(0,0,0,.05);padding:2px 8px;border-radius:999px;margin-left:8px">공통</span>` : '');
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.06)">
      <span style="font-size:13px;font-weight:600;color:var(--t1)">${escHtml(r.name)}${orgBadge}</span>
      <span style="display:inline-flex;gap:6px">
        <button class="btn" style="padding:4px 10px;font-size:11px;font-weight:700;color:var(--blue);border:1px solid var(--blue);border-radius:999px;background:#fff;cursor:pointer" onclick="renameEduType('${esc(r.id)}','${esc(r.name)}')">수정</button>
        <button class="btn" style="padding:4px 10px;font-size:11px;font-weight:700;color:var(--red);border:1px solid var(--red);border-radius:999px;background:#fff;cursor:pointer" onclick="removeEduType('${esc(r.id)}','${esc(r.name)}')">삭제</button>
      </span>
    </div>`;
  }).join('');
  if(inp && !isAllOrg) inp.focus();
}
async function renameEduType(id, oldName){
  const newName = prompt(`교육종류 이름을 수정합니다.\n\n현재: ${oldName}\n새 이름을 입력하세요:`, oldName);
  if(newName===null) return;  // 취소
  const trimmed=newName.trim();
  if(!trimmed){ alert('빈 이름은 사용할 수 없습니다.'); return; }
  if(trimmed===oldName){ return; }
  // 중복 체크
  const existing=getEduTypeRecords().map(r=>r.name);
  if(existing.includes(trimmed)){ alert('이미 등록된 이름입니다.'); return; }
  // 1) 즉시 UI 갱신 (optimistic)
  const snapD=[...(Array.isArray(D.eduTypes)?D.eduTypes:[])];
  let snapLocal=[];
  try{ snapLocal=JSON.parse(localStorage.getItem('interbiz_eduTypes')||'[]'); }catch(_){}
  D.eduTypes=snapD.map(r=>r.name===oldName?{...r,name:trimmed}:r);
  try{ localStorage.setItem('interbiz_eduTypes',JSON.stringify(snapLocal.map(n=>n===oldName?trimmed:n))); }catch(_){}
  renderEduTypeManage();
  // 2) DB 업데이트 — 같은 이름 모든 행 (현재 조직 + NULL 공통)
  const isLocal=!id||String(id).startsWith('local-');
  if(!isLocal){
    try{
      const orFilter=D.activeOrg?`org_name.eq.${D.activeOrg},org_name.is.null`:'org_name.is.null';
      const {data:rows}=await sb.from('edu_types').select('id,name,org_name').eq('name',oldName).or(orFilter);
      let updated=0;
      for(const row of (rows||[])){
        const {error}=await sb.from('edu_types').update({name:trimmed}).eq('id',row.id);
        if(!error) updated++;
        else console.warn('update edu_types failed:',error);
      }
      if(!updated){
        // 롤백
        D.eduTypes=snapD;
        try{ localStorage.setItem('interbiz_eduTypes',JSON.stringify(snapLocal)); }catch(_){}
        renderEduTypeManage();
        alert('❌ 수정 실패\n\nSupabase 권한 또는 RLS 문제일 수 있습니다.\nF12 콘솔의 update edu_types 경고를 확인해주세요.');
        return;
      }
    }catch(e){
      D.eduTypes=snapD;
      try{ localStorage.setItem('interbiz_eduTypes',JSON.stringify(snapLocal)); }catch(_){}
      renderEduTypeManage();
      alert('❌ 수정 실패: '+(e?.message||e));
      return;
    }
  }
  showEduTypeToast(`"${oldName}" → "${trimmed}" 로 수정되었습니다`);
}

async function addEduType(){
  const inp=el('edu-type-input');
  const name=(inp?.value||'').trim();
  if(!name){ inp?.focus(); return; }
  // 진짜 관리자가 '전체 조직' 모드일 때는 어느 조직에 추가할지 모호 → 차단
  if(D.isRealAdmin && !D.activeOrg){
    showEduTypeToast('상단 드롭다운에서 조직을 먼저 선택하세요','#f59e0b');
    inp?.focus();
    return;
  }
  const existing=getEduTypeRecords().map(r=>r.name);
  if(existing.includes(name)){ showEduTypeToast('이미 등록된 교육종류입니다','#f59e0b'); return; }
  // 1) 즉시 UI 반영 (optimistic)
  const tempId='local-'+Date.now();
  const currentDb=(Array.isArray(D.eduTypes)?D.eduTypes:[]);
  D.eduTypes=[...currentDb,{id:tempId,name,org_name:curOrg(),_pending:true}];
  if(inp) inp.value='';
  renderEduTypeManage();
  showEduTypeToast(`"${name}" 추가되었습니다`);
  // 2) 백그라운드 Supabase 저장 — 현재 활성 조직에 귀속
  const row=await dbAddEduType(name, D.activeOrg);
  if(row?._error){
    const msg=(row._error||'').toLowerCase();
    const isTableMissing=msg.includes('relation')||msg.includes('does not exist')||msg.includes('schema cache');
    if(isTableMissing){
      // 테이블 미존재 → localStorage에 보관하고 tempId 유지
      try{
        const cur=JSON.parse(localStorage.getItem('interbiz_eduTypes')||'[]');
        if(!cur.includes(name)){ cur.push(name); localStorage.setItem('interbiz_eduTypes',JSON.stringify(cur)); }
      }catch(e){}
    } else {
      // 다른 에러 → 롤백
      D.eduTypes=D.eduTypes.filter(r=>r.id!==tempId);
      renderEduTypeManage();
      showEduTypeToast('저장 실패: '+row._error,'#ef4444');
    }
  } else {
    // 성공 → tempId를 real id로 교체
    D.eduTypes=D.eduTypes.map(r=>r.id===tempId?{id:String(row.id),name:row.name,org_name:row.org_name||null}:r);
  }
}
async function removeEduType(id,name){
  if(!confirm(`"${name}" 교육종류를 삭제할까요?`)) return;
  // 롤백용 스냅샷
  const snapD=[...(Array.isArray(D.eduTypes)?D.eduTypes:[])];
  let snapLocal=[];
  try{ snapLocal=JSON.parse(localStorage.getItem('interbiz_eduTypes')||'[]'); }catch(e){}
  // 1) 즉시 UI 반영 (optimistic) — 같은 이름의 모든 행 제거
  D.eduTypes=snapD.filter(r=>r.name!==name);
  try{ localStorage.setItem('interbiz_eduTypes',JSON.stringify(snapLocal.filter(n=>n!==name))); }catch(e){}
  renderEduTypeManage();
  // 2) DB에서 같은 이름의 모든 관련 행 한 번에 조회 (현재 조직 + NULL)
  //    여러 시도를 통해 (ORG, LG전자 강사) + NULL 둘 다 있을 수 있으므로
  let relatedRows=[];
  try{
    const orFilter=D.activeOrg?`org_name.eq.${D.activeOrg},org_name.is.null`:'org_name.is.null';
    const r=await sb.from('edu_types').select('*').eq('name',name).or(orFilter);
    relatedRows=r?.data||[];
  }catch(e){ console.warn('select related rows failed:',e); }
  console.log(`[removeEduType] '${name}' 관련 행 ${relatedRows.length}개:`, relatedRows);
  const isLocal=!id||String(id).startsWith('local-');
  let dbDeleted=0;
  // 3) 같은 이름의 모든 관련 행 삭제 (id 단위 정확한 삭제)
  for(const row of relatedRows){
    try{
      const r=await sb.from('edu_types').delete().eq('id', row.id).select();
      const cnt=r?.data?.length||0;
      dbDeleted+=cnt;
      console.log(`  delete id=${row.id} (org=${row.org_name||'NULL'}): ${cnt}`);
    }catch(e){ console.warn('  delete failed for id=',row.id,e); }
  }
  // 4) 진짜 삭제 실패(0건) — DB row 였으나 1건도 못 지움 → 롤백 + 진단 alert
  if(!isLocal && relatedRows.length>0 && dbDeleted===0){
    D.eduTypes=snapD;
    try{ localStorage.setItem('interbiz_eduTypes',JSON.stringify(snapLocal)); }catch(e){}
    renderEduTypeManage();
    showEduTypeToast('❌ 삭제 실패','#ef4444');
    console.error(`"${name}" 삭제: 0 rows affected. RLS/권한 문제.`);
    alert(`삭제 실패: 1개도 지워지지 않았습니다.\n\nSupabase SQL Editor 에서 실행:\n\nALTER TABLE edu_types DISABLE ROW LEVEL SECURITY;\nGRANT ALL ON edu_types TO anon, authenticated;\n\n이미 실행하셨다면 F12 콘솔 에러를 확인해주세요.`);
    return;
  }
  // 5) NULL 레거시 행이 삭제된 경우 → 다른 조직에 fork (현재 조직만 명시 삭제, 나머지 조직은 보존)
  const hadNullRow=relatedRows.some(r=>!r.org_name);
  if(hadNullRow && D.activeOrg && Array.isArray(D.orgList) && D.orgList.length){
    const otherOrgs=D.orgList.filter(o=>o && o!==D.activeOrg);
    for(const otherOrg of otherOrgs){
      try{
        const dup=await sb.from('edu_types').select('id').eq('name',name).eq('org_name',otherOrg).limit(1);
        if(!dup?.data?.length){
          await sb.from('edu_types').insert({name, org_name:otherOrg});
        }
      }catch(e){ console.warn('fork edu_type to',otherOrg,'failed:',e); }
    }
  }
  // 6) 최종 동기화 — DB 기준으로 D.eduTypes 갱신 (현재 조직 스코프)
  const fresh=await dbGetEduTypes(D.activeOrg);
  if(fresh){
    D.eduTypes=fresh.map(r=>({id:String(r.id),name:r.name,org_name:r.org_name||null}));
    renderEduTypeManage();
  }
  showEduTypeToast(`"${name}" 삭제되었습니다`,'#6b7280');
}

