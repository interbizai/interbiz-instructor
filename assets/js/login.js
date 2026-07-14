/* ════════════════════════════════════════════════════════════
   인터PICK 조직별 로그인 — 공용 스크립트
   각 로그인 페이지에서 window.LOGIN_ORG (조직명) 를 선언한 뒤 이 파일을 로드한다.
   - POST /api/auth/login 에 org 를 함께 전달 → 서버가 소속 검증(강사) / 조직 잠금(관리자)
   - 성공 시 ib_token / ib_user / ib_active_org 저장 후 index.html 로 이동
════════════════════════════════════════════════════════════ */
(function(){
  const ORG = window.LOGIN_ORG || '';

  function el(id){ return document.getElementById(id); }

  function decodeJwtExp(token){
    try{
      const part = token.split('.')[1];
      if(!part) return 0;
      const pad = '='.repeat((4 - part.length % 4) % 4);
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + pad;
      return (JSON.parse(atob(b64)).exp || 0) * 1000;
    }catch(_){ return 0; }
  }

  function hasValidSession(){
    const token = localStorage.getItem('ib_token') || '';
    if(!token) return false;
    const exp = decodeJwtExp(token);
    if(exp && exp < Date.now()){
      // 만료 토큰 정리
      localStorage.removeItem('ib_token');
      localStorage.removeItem('ib_user');
      return false;
    }
    return !!localStorage.getItem('ib_user');
  }

  // 조직이 바뀌면 이전 조직의 화면 복원 정보·캐시가 섞이지 않게 정리
  function clearOrgLocalCaches(){
    ['ib_last_page','ib_last_ctx','interbiz_eduTypes','sc_coach_state_v1'].forEach(k=>{
      try{ localStorage.removeItem(k); }catch(_){ }
    });
  }

  function saveStoredUserLite(u){
    if(!u) return;
    try{
      const { photo, scores, maxes, habits, habit_counts, engagement_gaps, ...lite } = u;
      localStorage.setItem('ib_user', JSON.stringify(lite));
    }catch(_){
      try{
        localStorage.setItem('ib_user', JSON.stringify({
          id:u.id, name:u.name, email:u.email, orgName:u.org_name||u.orgName||ORG,
          isAdmin:!!u.isAdmin, isSubAdmin:!!u.isSubAdmin
        }));
      }catch(_e){}
    }
  }

  async function submitLogin(){
    const emEl = el('li-email'), pwEl = el('li-pw'), errEl = el('li-err'), btn = el('li-btn');
    const em = (emEl.value||'').trim(), pw = (pwEl.value||'').trim();
    if(!em || !pw){ errEl.textContent = '아이디와 비밀번호를 입력해주세요.'; return; }
    errEl.textContent = '';
    btn.disabled = true;
    const btnLabel = btn.textContent;
    btn.textContent = '로그인 중...';
    try{
      const r = await fetch('/api/auth/login', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ email: em, password: pw, org: ORG })
      });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || !j.ok){
        errEl.textContent = j.error || '로그인 실패';
        return;
      }
      // 다른 조직으로 로그인되어 있던 흔적 정리
      const prevOrg = localStorage.getItem('ib_active_org') || '';
      if(prevOrg && prevOrg !== ORG) clearOrgLocalCaches();

      localStorage.setItem('ib_token', j.token);
      localStorage.setItem('ib_active_org', ORG);
      saveStoredUserLite(j.user);
      location.replace('index.html');
    }catch(e){
      errEl.textContent = '네트워크 오류 — 잠시 후 다시 시도해주세요.';
    }finally{
      btn.disabled = false;
      btn.textContent = btnLabel;
    }
  }

  function togglePw(){
    const inp = el('li-pw'), btn = el('li-pw-toggle');
    if(!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    if(btn) btn.style.color = inp.type === 'text' ? 'var(--accent)' : '';
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    // 같은 조직 세션이 살아있으면 바로 앱으로
    if(hasValidSession()){
      const activeOrg = localStorage.getItem('ib_active_org') || '';
      if(!ORG || activeOrg === ORG){
        location.replace('index.html');
        return;
      }
      // 다른 조직 세션 존재 — 안내만 하고, 새로 로그인하면 교체
      const note = el('session-note');
      if(note){
        note.textContent = `현재 [${activeOrg||'다른 조직'}] 계정으로 로그인되어 있습니다. 아래에서 로그인하면 ${ORG} 으로 전환됩니다.`;
        note.classList.add('show');
      }
    }

    const btn = el('li-btn');
    if(btn) btn.addEventListener('click', submitLogin);
    ['li-email','li-pw'].forEach(id=>{
      const inp = el(id);
      if(inp) inp.addEventListener('keydown', e=>{ if(e.key === 'Enter') submitLogin(); });
    });
    const tg = el('li-pw-toggle');
    if(tg) tg.addEventListener('click', togglePw);
  });
})();
