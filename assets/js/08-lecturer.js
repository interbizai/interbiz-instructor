/* 08-lecturer.js — 강사 상세 + 비교 + 프로필 수정 + 영상 분석 뷰
   (index.html 16549~18129행에서 분리 · 로드 순서 유지 필수) */
/* ════════════════════════════════
   LECTURER DETAIL
════════════════════════════════ */
let lectFromPage='page-pick';
function openLecturer(id, fromPage){
  lectFromPage=fromPage||'page-pick';
  // F5 복원용 컨텍스트 저장
  try{localStorage.setItem('ib_last_ctx',JSON.stringify({type:'lecturer',id,fromPage:lectFromPage}));}catch(_){}
  // Update back button
  const bb=el('lect-back-btn');
  if(bb){ bb.setAttribute('onclick',`showPage('${lectFromPage}')`); }
  curLectId=id;
  const u=D.users.find(x=>String(x.id)===String(id));
  const userVids=D.videos.filter(v=>String(v.userId||v.user_id||'')===String(id));
  const bg=['#E21E26','#0078C8','#10b981','#f59e0b','#8b5cf6','#ec4899'][(id-1)%6];

  // (기존 아코디언용 변수들은 탭 구조 변경으로 제거됨)

  const isOwner=CU && (CU.id===u.id || CU.isAdmin);

  // ── 실 평가 데이터 로드 (evaluations 테이블) ──
  const totalVids=userVids.length;
  // 초기 평균 즉시 계산 (교육맞춤평가 우선) — 첫 평가 대기 문구 잘못 뜨는 문제 방지
  const _uvIds=new Set(userVids.map(v=>v.id));
  const _initEvals=(D.evaluations||[]).filter(e=>e.video_id&&_uvIds.has(e.video_id));
  const _initByVid={};
  _initEvals.forEach(e=>{
    const ex=_initByVid[e.video_id];
    const isCrit=e.eval_type==='평가안기준';
    if(!ex||(isCrit&&ex.eval_type!=='평가안기준')) _initByVid[e.video_id]=e;
  });
  const _initScores=Object.values(_initByVid).map(e=>Number(e.overall_score||0)).filter(s=>s>0);
  let userAvgScore=_initScores.length?_initScores.reduce((a,b)=>a+b,0)/_initScores.length:0;
  let evalCount=_initScores.length;
  const lvData=getLevelInfo(userAvgScore,evalCount,totalVids);
  // 유저별 evaluations 캐시 (필터용)
  window._lectEvals=_initEvals;
  window._lectUserId=id;

  // AI 한줄평가 + 키워드
  const aiKeywords=getAIKeywords(u,userVids);
  const oneLineEval=getOneLineEval(u,aiKeywords,userAvgScore);

  // 카테고리/제품 필터용 — 해당 강사의 실제 데이터에서 추출
  const userCats=[...new Set(userVids.map(v=>v.videoType||v.video_type||'').filter(Boolean))];
  const userProds=[...new Set(userVids.map(v=>v.productName||v.product_name||'').filter(Boolean))];
  const catOptions=userCats.map(c=>`<option value="${c}">${c}</option>`).join('');
  const prodOptions=userProds.map(p=>`<option value="${p}">${p}</option>`).join('');

  el('lecturer-main').innerHTML=`
    <div class="page-title"><div class="page-title-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><h2>MY 역량</h2></div>
    <div class="content-card">

    <!-- ▶ 프로필 상단 (그라데이션 배경) -->
    <div style="position:relative;background:linear-gradient(135deg,${lvData.color}22,${lvData.color}08);border-radius:16px;padding:28px;margin-bottom:24px;display:flex;gap:28px;align-items:center;flex-wrap:wrap">
      ${(()=>{
        const userVids=(D.videos||[]).filter(v=>v.userId===u.id);
        const vidIds=new Set(userVids.map(v=>v.id));
        const vEvals=(D.evaluations||[]).filter(e=>e.video_id&&vidIds.has(e.video_id));
        // 영상별 AI독자 우선 dedupe → 그 중 최신 하나 선택 (AI 평가 페이지 mood badge 와 소스 일치)
        const byVidChip={};
        vEvals.forEach(e=>{const ex=byVidChip[e.video_id];const isAi=e.eval_type==='AI독자';if(!ex||(isAi&&ex.eval_type!=='AI독자')) byVidChip[e.video_id]=e;});
        const dedupedVEvals=Object.values(byVidChip);
        const latestEval=dedupedVEvals.length?[...dedupedVEvals].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]:null;
        const latestVidMood=latestEval?computeAiMood(latestEval.decibel,latestEval.tempo,latestEval.habits):'';
        const vEvalsOnly=(D.voiceEvals||[]).filter(ve=>ve.user_id===u.id);
        const latestVoiceMood=[...vEvalsOnly].sort((a,b)=>new Date(b.created_at||b.eval_date||0)-new Date(a.created_at||a.eval_date||0)).find(ve=>ve.tone)?.tone||'';
        if(!latestVidMood&&!latestVoiceMood) return '';
        const moodChip=(label,val)=>val?`<span onclick="openMoodBreakdown('${u.id}')" title="클릭 시 ${label} 기록 보기" style="display:inline-flex;align-items:center;padding:4px 2px;font-size:12px;color:#000;white-space:nowrap;cursor:pointer;font-weight:700;transition:opacity .15s" onmouseover="this.style.opacity='.55'" onmouseout="this.style.opacity='1'">${label}</span>`:'';
        return `<div style="position:absolute;top:16px;right:20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:flex-end;z-index:2">
          ${moodChip('분위기',latestVidMood)}
          ${moodChip('스피치',latestVoiceMood)}
        </div>`;
      })()}
      <!-- 사진 + Lv 뱃지 -->
      <div style="text-align:center;flex-shrink:0;min-width:200px;padding:0 24px">
        <div style="position:relative;width:170px;height:215px;margin:0 auto 10px">
          <div style="width:170px;height:215px;border-radius:18px;background:${u.photo?'transparent':bg};display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:800;color:#fff;overflow:hidden;${u.photo?'':'box-shadow:0 8px 24px rgba(0,0,0,.14),0 2px 6px rgba(0,0,0,.06);'}${isOwner?'cursor:pointer':'cursor:default'};transition:transform .25s,box-shadow .25s" ${isOwner?`onclick="document.getElementById('prof-photo-input').click()" title="클릭하여 사진 변경"`:''} onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform=''" id="prof-photo-display">${u.photo?`<img src="${u.photo}" decoding="async" style="width:100%;height:100%;object-fit:contain;background:transparent;image-rendering:auto">`:u.name[0]}</div>
          ${isOwner?`<input type="file" id="prof-photo-input" accept="image/*" style="display:none" onchange="changeProfilePhoto(${u.id},this)">`:''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:6px;flex-wrap:wrap">
          <div style="font-size:22px;font-weight:900;color:var(--t1)">${u.name}</div>
          ${(()=>{const st=u.status||'근무';const stColor=st==='근무'?'#10b981':(st==='육아휴직'||st==='휴직')?'#f59e0b':(st==='퇴사')?'#9ca3af':'#6b7280';return `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${stColor}22;color:${stColor};font-weight:800">${st}</span>`;})()}
        </div>
        <div style="font-size:11px;color:var(--t2);margin-top:4px;line-height:1.5">${[u.orgName,u.team,u.position,u.office].filter(Boolean).join(' · ')||(u.office+' · '+u.team)}
          <span style="cursor:pointer;color:var(--blue);margin-left:4px;font-size:10px" onclick="document.getElementById('prof-info-toggle').style.display=document.getElementById('prof-info-toggle').style.display==='none'?'block':'none'">ⓘ 정보</span>
        </div>
        <div style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:16px;background:${lvData.color};color:#fff;font-size:10px;font-weight:800;margin-top:6px;cursor:pointer" onclick="openLevelDetail(${userAvgScore},${evalCount},${totalVids})">
          👑 Lv.${lvData.level} ${lvData.name}
        </div>
        ${isOwner?`<div style="margin-top:6px;display:flex;gap:4px;justify-content:center">
          <button class="btn btn-ghost" style="padding:3px 10px;font-size:9px" onclick="openEditProfile(${u.id})">정보 수정</button>
          <button class="btn btn-ghost" style="padding:3px 10px;font-size:9px" onclick="editCareer(${u.id})">경력 설정</button>
        </div>`:''}
        <!-- 정보 토글 -->
        <div id="prof-info-toggle" style="display:none;text-align:left;margin-top:10px;padding:10px;border-radius:10px;background:#fff;font-size:11px;box-shadow:var(--sh-sm)">
          <div class="prof-row"><span class="prof-key">조직</span><span class="prof-val">${u.orgName||'—'}</span></div>
          <div class="prof-row"><span class="prof-key">팀</span><span class="prof-val">${u.team||'—'}</span></div>
          <div class="prof-row"><span class="prof-key">사무실</span><span class="prof-val">${u.office||'—'}</span></div>
          <div class="prof-row"><span class="prof-key">직군</span><span class="prof-val">${u.position||'—'}</span></div>
          <div class="prof-row"><span class="prof-key">상권</span><span class="prof-val">${u.channel||'—'}</span></div>
          <div class="prof-row"><span class="prof-key">생년월일</span><span class="prof-val">${u.birthDate||(u.birthYear?u.birthYear+'년생':'—')}</span></div>
          <div class="prof-row"><span class="prof-key">입사</span><span class="prof-val">${u.hireDate||'—'}</span></div>
          <div class="prof-row"><span class="prof-key">번호</span><span class="prof-val">${u.phone||'—'}</span></div>
          <div class="prof-row"><span class="prof-key">이메일</span><span class="prof-val">${u.email||'—'}</span></div>
          <div class="prof-row"><span class="prof-key">상태</span><span class="prof-val">${u.status||'근무'}</span></div>
        </div>
      </div>

      <!-- 한줄평 + 키워드 + 통계 -->
      <div style="flex:1;min-width:280px">
        <!-- 경력 -->
        <div style="display:flex;gap:14px;margin-bottom:10px;font-size:11px;color:var(--t2)">
          ${u.lgCareerStart?`<span>LG경력 <strong style="color:var(--t1)">${calcCareer(u.lgCareerStart)}</strong></span>`:''}
          ${u.teachCareerStart?`<span>강의경력 <strong style="color:var(--t1)">${calcCareer(u.teachCareerStart)}</strong></span>`:''}
        </div>
        <!-- 한줄 평가 -->
        <div style="font-size:15px;font-weight:700;color:var(--t1);font-style:italic;margin-bottom:12px;line-height:1.5">"${oneLineEval}"</div>
        <!-- 뱃지 (분류별 3개씩 + 더보기) -->
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:center" id="my-badge-area-${u.id}"></div>

        <!-- 교육자료 + 제품 필터 (pill) -->
        <div style="display:flex;gap:6px;margin-bottom:14px">
          <select id="lect-cat-filter" onchange="filterLectStats(${u.id})" style="padding:4px 24px 4px 10px;border:1px solid #e5e7eb;border-radius:999px;font-size:10.5px;font-weight:600;color:var(--t2);background:#fff;cursor:pointer;max-width:130px">
            <option value="">전체 교육종류</option>
            ${getEduTypes().map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
          <select id="lect-prod-filter" onchange="filterLectStats(${u.id})" style="padding:4px 24px 4px 10px;border:1px solid #e5e7eb;border-radius:999px;font-size:10.5px;font-weight:600;color:var(--t2);background:#fff;cursor:pointer;max-width:130px">
            <option value="">전체 제품</option>
            ${Object.entries(PRODUCT_TREE).map(([g,items])=>`<optgroup label="${g}">${items.map(p=>`<option value="${p}">${p}</option>`).join('')}</optgroup>`).join('')}
          </select>
        </div>

        <!-- 통계 카드 4개 -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px" id="lect-stat-cards">
          <div style="text-align:center;padding:12px 8px;border:1px solid var(--bdr);border-radius:12px;background:#fff">
            <div style="font-size:22px;font-weight:900;color:var(--blue)">${userAvgScore.toFixed(1)}<span style="font-size:10px;color:var(--t3)">/100</span></div>
            <div style="font-size:9px;color:var(--t3);margin-top:3px">평가 점수</div>
          </div>
          <div style="text-align:center;padding:12px 8px;border:1px solid var(--bdr);border-radius:12px;background:#fff">
            <div style="font-size:22px;font-weight:900;color:var(--t1)">${evalCount}<span style="font-size:10px;color:var(--t3)">회</span></div>
            <div style="font-size:9px;color:var(--t3);margin-top:3px">누적 평가횟수</div>
          </div>
          <div style="text-align:center;padding:12px 8px;border:1px solid var(--bdr);border-radius:12px;background:#fff">
            <div style="font-size:22px;font-weight:900;color:var(--t3)">—<span style="font-size:10px;color:var(--t3)">/5.0</span></div>
            <div style="font-size:9px;color:var(--t3);margin-top:3px">개선 지수</div>
          </div>
          <div style="text-align:center;padding:12px 8px;border:1px solid var(--bdr);border-radius:12px;background:#fff">
            <div style="font-size:22px;font-weight:900;color:var(--t3)">—</div>
            <div style="font-size:9px;color:var(--t3);margin-top:3px">종합 등급</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ▶ 탭: MY 역량 | AI 코칭 목록 | MY 메모 -->
    <div class="tab-bar" style="margin-bottom:20px">
      <button class="tab-btn active" onclick="switchLectTab('역량',this)">MY 역량</button>
      <button class="tab-btn" onclick="switchLectTab('코칭',this)">AI 코칭 목록</button>
      <button class="tab-btn" onclick="switchLectTab('메모',this)">MY 메모</button>
    </div>

    <!-- TAB: MY 역량 -->
    <div class="lect-tab-pane" id="lect-tab-역량">
      <!-- 역량 분석 제목 (필터는 상단 프로필 영역의 lect-cat-filter / lect-prod-filter로 통합) -->
      <div style="margin-bottom:28px">
        <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:24px;align-items:center;margin-bottom:12px">
          <div style="font-size:15px;font-weight:800;color:var(--t1)">역량 분석</div>
          <div style="font-size:15px;font-weight:800;color:var(--t1)">역량별 달성도</div>
        </div>
        <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:24px;align-items:stretch" id="lect-radar-wrap">
          <div style="border:1px solid var(--bdr);border-radius:14px;padding:20px;min-height:380px">
            <div style="display:flex;align-items:center;justify-content:center">
              <svg id="radar-chart-${u.id}" viewBox="0 0 400 400" style="width:100%;max-width:480px;height:auto"></svg>
            </div>
            <div style="display:flex;gap:20px;justify-content:center;padding-top:12px;border-top:1px solid rgba(0,0,0,.06);margin-top:8px">
              <div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:#dc2626"></div><span style="font-size:12px;font-weight:600;color:var(--t1)">현재 역량</span></div>
            </div>
          </div>
          <div style="border:1px solid var(--bdr);border-radius:14px;padding:24px;display:flex;flex-direction:column;min-height:380px" id="lect-skills-bars-${u.id}"></div>
        </div>
      </div>

      <!-- AI 역량 분석 총평 -->
      <div style="margin-bottom:20px">
        <div style="font-size:15px;font-weight:800;color:var(--t1);margin-bottom:12px">AI 역량 분석 총평</div>
        <div style="border:1px solid var(--bdr);border-radius:14px;padding:20px" id="lect-ai-summary-${u.id}">
          <div style="text-align:center;color:var(--t3);font-size:12px;padding:8px">데이터 불러오는 중...</div>
        </div>
      </div>

      <!-- 경력 + 포트폴리오 (가로 2컬럼) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px">
        <!-- 강사 경력 이력 -->
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <div style="font-size:15px;font-weight:800;color:var(--t1)">강사 경력</div>
            <div style="display:inline-flex;align-items:center;gap:6px">
              ${u.lgCareerStart?`<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:10px;background:rgba(226,30,38,.08);color:#E21E26;font-size:10px;font-weight:800">LG경력 ${calcCareer(u.lgCareerStart)}</span>`:''}
              ${u.teachCareerStart?`<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:10px;background:rgba(0,120,200,.08);color:var(--blue);font-size:10px;font-weight:800">강의경력 ${calcCareer(u.teachCareerStart)}</span>`:''}
              ${(!u.lgCareerStart&&!u.teachCareerStart)?'<span style="font-size:10px;color:var(--t3)">경력 미설정</span>':''}
            </div>
          </div>
          <div style="border:1px solid var(--bdr);border-radius:14px;padding:20px">
            <div id="career-list-${u.id}" style="position:relative;padding-left:20px"></div>
            ${isOwner?`<div id="career-add-form-${u.id}" style="display:none;margin-top:12px;padding:12px;border:1px solid var(--bdr);border-radius:10px;background:#fafafa">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                <input type="text" id="cr-start-${u.id}" placeholder="시작 (예: 2020.03)" style="padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
                <input type="text" id="cr-end-${u.id}" placeholder="종료 (현재)" value="현재" style="padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
              </div>
              <input type="text" id="cr-title-${u.id}" placeholder="내용 (예: HE사업부 제품교육팀)" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px;margin-bottom:8px">
              <div style="display:flex;gap:8px;align-items:center">
                <input type="text" id="cr-pos-${u.id}" placeholder="직책 (선택)" style="flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
                <button class="btn btn-blue" style="padding:4px 12px;font-size:10px" onclick="submitCareerItem(${u.id})">등록</button>
                <button class="btn btn-ghost" style="padding:4px 10px;font-size:10px" onclick="document.getElementById('career-add-form-${u.id}').style.display='none'">취소</button>
              </div>
            </div>
            <button class="btn btn-ghost" style="margin-top:12px;padding:6px 14px;font-size:11px" onclick="document.getElementById('career-add-form-${u.id}').style.display='block'">+ 경력 추가</button>`:''}
          </div>
        </div>
        <!-- 포트폴리오 -->
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--t1);margin-bottom:12px">포트폴리오</div>
          <div style="border:1px solid var(--bdr);border-radius:14px;padding:20px">
            <div id="portfolio-list-${u.id}"></div>
            ${isOwner?`<div style="margin-top:12px">
              <!-- 빠른 사진 등록 — 슬롯 3개 (모바일 사진첩 연동) -->
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">
                ${[0,1,2].map(i=>`<label for="pf-quick-${u.id}-${i}" style="aspect-ratio:4/3;border:2px dashed #d1d5db;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;background:#fafafa;transition:border-color .2s,background .2s" onmouseover="this.style.borderColor='var(--blue)';this.style.background='rgba(0,120,200,.04)'" onmouseout="this.style.borderColor='#d1d5db';this.style.background='#fafafa'">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  <div style="font-size:11px;color:var(--t3);margin-top:6px;font-weight:700">+ 사진 추가</div>
                  <input type="file" id="pf-quick-${u.id}-${i}" accept="image/*" style="display:none" onchange="quickAddPortfolioImage(${u.id}, this)">
                </label>`).join('')}
              </div>
              <!-- 고급 등록 (제목·부제목·URL — 펼침) -->
              <details style="border:1px solid var(--bdr);border-radius:10px;background:#fafafa">
                <summary style="padding:9px 12px;font-size:11px;color:var(--t2);cursor:pointer;font-weight:700">📝 제목·URL 함께 등록 (선택)</summary>
                <div style="padding:10px 12px 12px;border-top:1px solid var(--bdr)">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                    <input type="text" id="pf-title-${u.id}" placeholder="제목" style="padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
                    <input type="text" id="pf-subtitle-${u.id}" placeholder="부제목 (선택)" style="padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
                  </div>
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <input type="file" id="pf-file-${u.id}" accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt" style="display:none" onchange="document.getElementById('pf-fname-${u.id}').textContent=this.files[0]?.name||''">
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:10px" onclick="document.getElementById('pf-file-${u.id}').click()" title="사진 / PDF / Excel / Word / PPT">📎 파일</button>
                    <span id="pf-fname-${u.id}" style="font-size:9px;color:var(--t3);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
                    <input type="text" id="pf-url-${u.id}" placeholder="또는 URL" style="flex:1;min-width:140px;padding:6px 10px;border:1px solid #ddd;border-radius:8px;font-size:11px">
                    <button class="btn btn-blue" style="padding:4px 12px;font-size:10px" onclick="addPortfolioItem(${u.id})">등록</button>
                  </div>
                </div>
              </details>
              <div style="font-size:9px;color:var(--t3);margin-top:6px">💡 빈 칸 클릭 → 사진첩에서 선택 (모바일 카메라/갤러리 자동 연동) · 큰 사진은 자동 압축</div>
            </div>`:''}
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: AI 코칭 목록 -->
    <div class="lect-tab-pane" id="lect-tab-코칭" style="display:none">
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <select id="coaching-cat-filter" onchange="filterCoachingList(${u.id})" style="padding:4px 24px 4px 10px;border:1px solid #e5e7eb;border-radius:999px;font-size:10.5px;font-weight:600;color:var(--t2);background:#fff;cursor:pointer;max-width:130px">
          <option value="">전체 교육종류</option>
          ${getEduTypes().map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="coaching-prod-filter" onchange="filterCoachingList(${u.id})" style="padding:4px 24px 4px 10px;border:1px solid #e5e7eb;border-radius:999px;font-size:10.5px;font-weight:600;color:var(--t2);background:#fff;cursor:pointer;max-width:130px">
          <option value="">전체 제품</option>
          ${Object.entries(PRODUCT_TREE).map(([g,items])=>`<optgroup label="${g}">${items.map(p=>`<option value="${p}">${p}</option>`).join('')}</optgroup>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px" class="coaching-grid-3">
        <!-- 영상 평가 목록 -->
        <div>
          <div style="font-size:14px;font-weight:800;margin-bottom:10px">평가 내역 (영상) <span style="font-size:11px;color:var(--t3)" id="coaching-vid-count-${u.id}">${userVids.length}건</span></div>
          <div style="border:1px solid var(--bdr);border-radius:12px;overflow:hidden" id="coaching-vid-list-${u.id}">
            ${userVids.length?userVids.map(vid=>{
              const vCat=vid.eduType||vid.edu_type||vid.videoType||vid.video_type||'';
              const vProd=vid.productName||vid.product_name||'';
              return `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer" onclick="openVideo(${vid.id})">
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${vid.title||'—'}</div>
                <div style="font-size:10px;color:var(--t3);margin-top:2px">${vid.date}${vCat?' · '+vCat:''}${vProd?' · '+vProd:''}</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>`;}).join(''):'<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">등록된 영상이 없습니다</div>'}
          </div>
        </div>
        <!-- 음성 평가 목록 -->
        <div>
          <div style="font-size:14px;font-weight:800;margin-bottom:10px">평가 내역 (스피치) <span style="font-size:11px;color:var(--t3)" id="voice-count-${u.id}">0건</span></div>
          <div style="border:1px solid var(--bdr);border-radius:12px;overflow:hidden" id="voice-list-${u.id}">
            <div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">로딩 중...</div>
          </div>
        </div>
        <!-- 시나리오 코칭 목록 -->
        <div>
          <div style="font-size:14px;font-weight:800;margin-bottom:10px">평가 내역 (시나리오) <span style="font-size:11px;color:var(--t3)" id="scenario-count-${u.id}">0건</span></div>
          <div style="border:1px solid var(--bdr);border-radius:12px;overflow:hidden" id="scenario-list-${u.id}">
            <div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">로딩 중...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: MY 메모 -->
    <div class="lect-tab-pane" id="lect-tab-메모" style="display:none">
      ${isOwner?`<div>
        <div style="font-size:14px;font-weight:800;margin-bottom:10px">자유 메모</div>
        <textarea id="self-memo" style="min-height:300px;width:100%;font-size:13px;line-height:1.8;padding:16px;border:1px solid var(--bdr);border-radius:12px;resize:vertical">${u.memo||''}</textarea>
        <button class="btn btn-blue" style="margin-top:10px;padding:10px 20px" onclick="saveMemo(${u.id})">메모 저장</button>
      </div>`:'<div style="font-size:12px;color:var(--t3)">본인만 메모를 작성할 수 있습니다.</div>'}
    </div>

    <div class="pdf-bottom"><button class="btn btn-blue btn-pdf" onclick="window.print()">PDF 출력</button></div>
    </div>`;
  showPage('page-lecturer');
  requestAnimationFrame(()=>{
    document.querySelectorAll('#lecturer-main .bar-fill').forEach(e=>{ e.style.width=e.dataset.pct+'%'; });
    renderCareerList(id);
    renderPortfolioList(id);
  });
  // 음성 목록 렌더링
  renderUserVoiceList(id);
  if(IB_DEMO()) try{ filterCoachingList(id); }catch(_){}
  // 시나리오 코칭 목록 렌더링
  renderUserScenarioList(id);
  // ── 비동기: evaluations 로드 → 통계/레이더 실데이터 반영 ──
  (async()=>{
    const vidIds=userVids.map(v=>v.id);
    if(!vidIds.length){
      renderRadarChart(id); renderMyBadges(id,0);
      return;
    }
    const{data:evals}=await sb.from('evaluations').select('*').in('video_id',vidIds);
    window._lectEvals=evals||[];
    _refreshLectStats(id);
    renderRadarChartFromEvals(id);
    renderMyBadges(id,window._lectAvgScore||0);
  })();
}

// evaluations 기반 통계 카드 갱신 (필터 적용)
function _refreshLectStats(userId){
  const catFilter=document.getElementById('lect-cat-filter')?.value||'';
  const prodFilter=document.getElementById('lect-prod-filter')?.value||'';
  let evals=(window._lectEvals||[]);
  // 필터: 영상의 videoType/productName과 매칭
  if(catFilter||prodFilter){
    const vidIds=new Set((D.videos||[]).filter(v=>{
      if(catFilter&&(v.eduType||v.edu_type||'')!==catFilter) return false;
      if(prodFilter&&!(v.productName||v.product_name||'').includes(prodFilter)) return false;
      return true;
    }).map(v=>v.id));
    evals=evals.filter(e=>vidIds.has(e.video_id));
  }
  // 영상 1개당 최신 평가 1건만 (교육맞춤평가 우선, 없으면 AI독자)
  const byVid=new Map();
  evals.forEach(e=>{
    if(!e.video_id) return;
    const exist=byVid.get(e.video_id);
    if(!exist||e.eval_type==='평가안기준') byVid.set(e.video_id,e);
  });
  const latest=[...byVid.values()];
  const scores=latest.map(e=>Number(e.overall_score||0)).filter(s=>s>0);
  const avg=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length):0;
  const cnt=scores.length;
  window._lectAvgScore=avg;
  const u=D.users.find(x=>x.id===userId);
  const totalVids=(D.videos||[]).filter(v=>v.userId===userId).length;

  // ── 개선 지수 (/5.0) — 최근 평가 향상분 기반 자동 계산 ──
  // latest를 날짜순으로 정렬 → 인접 평가 간 향상률(%) → 최근 3회 평균 → 3.0 ± (%/10) clamp[1,5]
  const sortedEvals=[...latest].sort((a,b)=>{
    const da=new Date(a.created_at||a.eval_date||0).getTime();
    const db=new Date(b.created_at||b.eval_date||0).getTime();
    return da-db;
  });
  const deltas=[];
  for(let i=1;i<sortedEvals.length;i++){
    const prev=Number(sortedEvals[i-1].overall_score||0);
    const cur=Number(sortedEvals[i].overall_score||0);
    if(prev>0) deltas.push((cur-prev)/prev*100);
  }
  const recentDeltas=deltas.slice(-3);
  const avgDelta=recentDeltas.length?recentDeltas.reduce((a,b)=>a+b,0)/recentDeltas.length:null;
  // 3.0 ± (avgDelta/10) — +20% 향상 → 5.0, 0% → 3.0, -20% → 1.0 (clamp 1~5)
  const impIdx=avgDelta==null?null:Math.max(1,Math.min(5,3+avgDelta/10));
  const impDisplay=impIdx==null?'—':impIdx.toFixed(1);
  const impColor=impIdx==null?'var(--t3)':impIdx>=4?'#10b981':impIdx>=3?'#f59e0b':'#ef4444';
  // 최근 평가 점수 추이 데이터 (차트용)
  window._lectImpSeries=window._lectImpSeries||{};
  window._lectImpSeries[userId]=sortedEvals.map(e=>({
    date:(e.eval_date||e.created_at||'').slice(0,10),
    score:Number(e.overall_score||0)
  }));

  // ── 종합 등급 — 평가 점수 기준 자동 매핑 (관리자 override 제거) ──
  const autoGrade=cnt===0?'—':avg>=90?'S':avg>=80?'A':avg>=70?'B':avg>=60?'C':'D';
  const gradeColorMap={'S':'#dc2626','A':'#2563eb','B':'#10b981','C':'#f59e0b','D':'#9ca3af','—':'var(--t3)'};
  const gradeColor=gradeColorMap[autoGrade]||'var(--t3)';

  // 데모 모드: 통계가 비거나 빈약하면 채움 (누적횟수·개선지수·등급)
  let dAvg=avg, dCnt=cnt, dImpDisplay=impDisplay, dImpColor=impColor, dImpNote=(impIdx==null), dGrade=autoGrade, dGradeColor=gradeColor;
  if(IB_DEMO() && cnt<3){
    dAvg = avg>0?avg:92;
    dCnt = cnt>0?Math.max(cnt,8):8;
    dImpDisplay='3.4'; dImpColor='#f59e0b'; dImpNote=false;
    dGrade = dAvg>=90?'S':dAvg>=80?'A':dAvg>=70?'B':dAvg>=60?'C':'D';
    dGradeColor=gradeColorMap[dGrade]||'var(--t3)';
  }
  const cards=document.querySelectorAll('#lect-stat-cards > div');
  if(cards[0]) cards[0].innerHTML=`<div style="font-size:22px;font-weight:900;color:var(--blue)">${dCnt?dAvg.toFixed(1):'0.0'}<span style="font-size:10px;color:var(--t3)">/100</span></div><div style="font-size:9px;color:var(--t3);margin-top:3px">평가 점수</div>`;
  if(cards[1]) cards[1].innerHTML=`<div style="font-size:22px;font-weight:900;color:var(--t1)">${dCnt}<span style="font-size:10px;color:var(--t3)">회</span></div><div style="font-size:9px;color:var(--t3);margin-top:3px">누적 평가횟수</div>`;
  if(cards[2]){
    cards[2].style.cursor='pointer';
    cards[2].title='클릭 시 평가 점수 추이 그래프';
    cards[2].onclick=()=>openImprovementChart(userId);
    cards[2].innerHTML=`<div style="font-size:22px;font-weight:900;color:${dImpColor}">${dImpDisplay}<span style="font-size:10px;color:var(--t3)">/5.0</span></div><div style="font-size:9px;color:var(--t3);margin-top:3px">개선 지수</div>${dImpNote?'<div style="font-size:8px;color:var(--t3);margin-top:2px">평가 2회↑ 필요</div>':''}`;
  }
  if(cards[3]){
    cards[3].style.cursor='pointer';
    cards[3].title='클릭 시 등급 기준 보기';
    cards[3].onclick=()=>openGradeCriteria(userId,dAvg,dGrade);
    cards[3].innerHTML=`<div style="font-size:22px;font-weight:900;color:${dGradeColor}">${dGrade}</div><div style="font-size:9px;color:var(--t3);margin-top:3px">종합 등급</div>`;
  }

  // AI 역량 분석 총평 갱신 (6블록 · 필터 연동)
  buildLectSummary(userId);
}

// AI 역량 분석 총평 생성 — 6블록 (필터 연동 · 따뜻·격려 톤 · 관리자 ⑥ 노출)
function buildLectSummary(userId){
  // JSON string 안전화
  const safeArr=(v)=>Array.isArray(v)?v:(typeof v==='string'?(()=>{try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch(_){return [];}})():[]);
  const u=(D.users||[]).find(x=>x.id===userId);
  const container=document.getElementById('lect-ai-summary-'+userId);
  if(!u||!container) return;

  const catFilter=document.getElementById('lect-cat-filter')?.value||'';
  const prodFilter=document.getElementById('lect-prod-filter')?.value||'';
  const hasFilter=!!(catFilter||prodFilter);

  // 필터 적용된 영상 — type-safe 매칭 (userId 가 number/string 혼재 대응)
  const userIdStr=String(userId);
  const allUserVids=(D.videos||[]).filter(v=>String(v.userId||v.user_id||'')===userIdStr);
  const filteredVids=allUserVids.filter(v=>{
    if(catFilter&&(v.eduType||v.edu_type||v.videoType||v.video_type||'')!==catFilter) return false;
    if(prodFilter&&!(v.productName||v.product_name||'').includes(prodFilter)) return false;
    return true;
  });
  const vidIds=new Set(filteredVids.map(v=>v.id));

  // 해당 영상의 평가 — video_id 매칭 (string/number 호환)
  const vidIdStrs=new Set([...vidIds].map(x=>String(x)));
  const allEvals=(D.evaluations||[]).filter(e=>e.video_id && vidIdStrs.has(String(e.video_id)));
  console.log('[총평] userId='+userId+', 영상 '+allUserVids.length+'건, 평가 '+allEvals.length+'건');
  const byVidScore={};
  const byVidVoice={};
  allEvals.forEach(e=>{
    const sx=byVidScore[e.video_id];
    const isCrit=e.eval_type==='평가안기준';
    if(!sx||(isCrit&&sx.eval_type!=='평가안기준')) byVidScore[e.video_id]=e;
    const vx=byVidVoice[e.video_id];
    const isAi=e.eval_type==='AI독자';
    if(!vx||(isAi&&vx.eval_type!=='AI독자')) byVidVoice[e.video_id]=e;
  });
  const evals=Object.values(byVidScore).sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
  const voiceEvals=Object.values(byVidVoice);
  // overall_score 가 0/null 이면 sub_scores 합산으로 폴백 계산
  const scores=evals.map(e=>{
    let s=Number(e.overall_score||0);
    if(s<=0){
      const subs=safeArr(e.sub_scores).filter(x=>x.level!=='na');
      if(subs.length){
        const ts=subs.reduce((a,x)=>{
          let sc=Number(x.score||0);
          if(sc<=0 && Number(x.max||0)<=0){
            // max=0 인 옛 데이터: level 로 추정
            if(x.level==='good') sc=5;
            else if(x.level==='normal') sc=3;
          }
          return a+sc;
        },0);
        const tm=subs.reduce((a,x)=>{
          const m=Number(x.max||0);
          return a+(m>0?m:5);
        },0);
        s = tm>0 ? Math.round(ts/tm*100) : 0;
      }
    }
    return s;
  }).filter(s=>s>0);
  const avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0;
  const evalCount=scores.length;
  console.log('[총평] overall_score 평균:'+Math.round(avg)+', 유효 점수:'+evalCount+'건');

  // 빈 상태
  const filterChipText=hasFilter?[catFilter,prodFilter].filter(Boolean).join(' · ')+' 기준':'전체 기준';
  if(!evalCount){
    container.innerHTML=`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:${hasFilter?'rgba(0,120,200,.1)':'rgba(0,0,0,.06)'};color:${hasFilter?'var(--blue)':'var(--t2)'};font-size:10.5px;font-weight:800">${filterChipText}</span>
      </div>
      <div style="padding:22px;text-align:center;color:var(--t3);font-size:13px;line-height:1.8">
        ${hasFilter?'이 범위의 평가 기록이 아직 없어요.<br>다른 필터로 확인해보시거나, 평가가 쌓이면 여기에 맞춤 총평이 올라와요.':'첫 평가가 완료되면<br>AI가 강점·성장·맞춤 제안을 정리해드릴게요.'}
      </div>`;
    return;
  }

  // 역량별 점수 집계 (categories JSON string 안전 처리)
  const catMap={};
  evals.forEach(e=>{
    let cats=safeArr(e.categories);
    // categories 비면 sub_scores 에서 자동 재계산
    if(!cats.some(c=>Number(c.max||0)>0)){
      const subCatAgg={};
      safeArr(e.sub_scores).forEach(s=>{
        if(!s.category||s.level==='na') return;
        const k=s.category;
        if(!subCatAgg[k]) subCatAgg[k]={name:k,score:0,max:0};
        let sScore=Number(s.score||0), sMax=Number(s.max||0);
        if(sMax<=0){
          sMax=5;
          if(s.level==='good') sScore=5;
          else if(s.level==='normal') sScore=3;
          else sScore=0;
        }
        subCatAgg[k].score+=sScore; subCatAgg[k].max+=sMax;
      });
      cats=Object.values(subCatAgg);
    }
    cats.forEach(c=>{
      const k=c.name||'';if(!k) return;
      if(!catMap[k]) catMap[k]={s:0,m:0,n:0};
      catMap[k].s+=Number(c.score||0); catMap[k].m+=Number(c.max||0); catMap[k].n++;
    });
  });
  const catAvgs=Object.entries(catMap).map(([n,v])=>({name:n,pct:v.m?Math.round(v.s/v.m*100):0,n:v.n})).sort((a,b)=>b.pct-a.pct);
  const topCat=catAvgs[0];
  const botCat=catAvgs[catAvgs.length-1];

  // 스피치 스타일 (템포·성량·반복어)
  // 음성 지표는 AI독자 eval 기준 (voiceEvals 사용)
  const dbs=voiceEvals.map(e=>Number(e.decibel||0)).filter(x=>x>0);
  const tps=voiceEvals.map(e=>Number(e.tempo||0)).filter(x=>x>0);
  const habitSum=voiceEvals.reduce((a,e)=>a+(e.habits||[]).reduce((s,h)=>s+(h.count||0),0),0);
  const avgDb=dbs.length?dbs.reduce((a,b)=>a+b,0)/dbs.length:0;
  const avgTp=tps.length?tps.reduce((a,b)=>a+b,0)/tps.length:0;
  const avgHabit=evalCount?habitSum/evalCount:0;
  const tempoStyle=avgTp>=150?'빠른 템포로 몰입감 있게':avgTp>=130?'적정 템포로 안정감 있게':avgTp>0?'차분한 템포로 또렷하게':'';
  const volumeStyle=avgDb>=78?'크고 뚜렷한 성량으로':avgDb>=68?'안정된 성량으로':avgDb>0?'부드러운 성량으로':'';

  // 다양성
  const userCats=[...new Set(filteredVids.map(v=>v.eduType||v.edu_type||v.videoType||v.video_type||'').filter(Boolean))];
  const diversityStyle=userCats.length>=3?'여러 분야를 두루 소화하는 강사':userCats.length>=2?'복수 영역에서 활동하는 강사':'특정 분야에 집중하는 강사';

  // 연속 N회 80↑ (최근부터)
  let streak=0;
  for(let i=scores.length-1;i>=0;i--){if(scores[i]>=80) streak++; else break;}

  // 최근 3회 vs 이전 평균 Δ
  const recent3=scores.slice(-3);
  const recentAvg=recent3.length?recent3.reduce((a,b)=>a+b,0)/recent3.length:0;
  const prior=scores.slice(0,-3);
  const priorAvg=prior.length?prior.reduce((a,b)=>a+b,0)/prior.length:avg;
  const deltaScore=recentAvg-priorAvg;
  const isGrowing=deltaScore>2;
  const isStable=Math.abs(deltaScore)<=2;

  // 전사 평균 (필터 동일 조건)
  const companyCat={};
  (D.evaluations||[]).forEach(e=>{
    if(!e.video_id) return;
    const v=(D.videos||[]).find(x=>x.id===e.video_id);
    if(!v) return;
    if(catFilter&&(v.eduType||v.edu_type||v.videoType||v.video_type||'')!==catFilter) return;
    if(prodFilter&&!(v.productName||v.product_name||'').includes(prodFilter)) return;
    (e.categories||[]).forEach(c=>{
      const k=c.name||'';if(!k) return;
      if(!companyCat[k]) companyCat[k]={s:0,m:0};
      companyCat[k].s+=Number(c.score||0); companyCat[k].m+=Number(c.max||0);
    });
  });
  let topCatDelta=0;
  if(topCat&&companyCat[topCat.name]){
    const cc=companyCat[topCat.name];
    const ccPct=cc.m?cc.s/cc.m*100:0;
    topCatDelta=topCat.pct-ccPct;
  }

  // 최빈 약점 (sub_scores level='bad' 카테고리 집계)
  const badCnt={};
  evals.forEach(e=>{
    (e.sub_scores||[]).filter(s=>s.level==='bad').forEach(s=>{
      const k=s.category||s.sub_item||'기타';
      badCnt[k]=(badCnt[k]||0)+1;
    });
  });
  const topBad=Object.entries(badCnt).sort((a,b)=>b[1]-a[1])[0];

  const isAdmin=!!(CU?.isAdmin);

  // ① 한 줄 시그니처
  const styleParts=[volumeStyle,tempoStyle].filter(Boolean);
  const styleText=styleParts.length?styleParts.join(' · '):'꾸준한 전달력을 가진';
  const sigLine=`<strong style="color:var(--t1);font-weight:800">${u.name}</strong> 강사님은 ${topCat?`<strong>${topCat.name}</strong>이 가장 빛나는`:'꾸준히 성장 중인'} 분이에요. ${styleText} 전달하는, <strong>${diversityStyle}</strong>입니다.`;

  // ② 자랑거리
  let brag;
  if(topCat){
    if(streak>=3) brag=`특히 <strong>${topCat.name} ${topCat.pct}점</strong>이 든든한 자산이에요. 최근 <strong>${streak}회 연속 80점 이상</strong> 유지하고 계시는 거 정말 대단해요!`;
    else brag=`<strong>${topCat.name} ${topCat.pct}점</strong>이 가장 빛나는 자랑거리예요. 지금 흐름을 이어가면 연속 기록도 만들 수 있습니다.`;
  }else{
    brag=`평가가 조금 더 쌓이면 가장 빛나는 영역을 짚어드릴게요.`;
  }

  // ③ 시그니처 무기
  let weapon;
  if(topCatDelta>=5&&topCat) weapon=`남들과 다른 강점 — <strong>${topCat.name}</strong>에서 동일 조건 전사 평균 대비 <strong>+${topCatDelta.toFixed(1)}점</strong>. 이 영역은 ${u.name} 강사님만의 시그니처예요.`;
  else if(avgHabit<=5&&evalCount>=2) weapon=`반복어 평균 <strong>${avgHabit.toFixed(1)}회/영상</strong> — 깔끔한 화법이 신뢰감을 만들어내고 있어요.`;
  else if(avgTp>=155&&evalCount>=2) weapon=`평균 템포 <strong>${Math.round(avgTp)} WPM</strong>의 빠르고 에너지 있는 전달이 강사님의 무기예요.`;
  else if(avgDb>=78&&evalCount>=2) weapon=`뚜렷한 성량(<strong>${Math.round(avgDb)}dB</strong>)으로 현장 장악력이 돋보여요.`;
  else weapon=`몇 회 더 평가가 쌓이면 ${u.name} 강사님만의 시그니처를 정확히 짚어드릴게요.`;

  // ④ 이번 숙제
  let task;
  if(topBad&&topBad[1]>=2) task=`다음 목표는 <strong>${topBad[0]}</strong> 보완이에요. 최근 평가에서 <strong>${topBad[1]}번</strong> 지적된 부분이라, 한 영상에서 하나만 의식해봐도 달라집니다.`;
  else if(avgHabit>10) task=`다음 숙제는 <strong>반복어 줄이기</strong>예요. 영상당 평균 ${avgHabit.toFixed(1)}회 — <strong>2초 멈추기 연습</strong>부터 작게 시작해봐요.`;
  else if(botCat&&botCat.pct<70) task=`<strong>${botCat.name}</strong> 영역(${botCat.pct}점)을 조금만 끌어올려도 전체 균형이 훨씬 좋아져요. 부담 갖지 말고 작게 시도해봐요.`;
  else task=`현재 수준이 안정적이에요. 다음 영상에서는 <strong>시그니처 스킬을 한 단계 고도화</strong>해보는 건 어떨까요?`;

  // ⑤ 성장 신호
  let growth;
  if(evalCount<2) growth=`평가 <strong>2회 이상</strong> 쌓이면 성장 추세를 보여드릴게요.`;
  else if(isGrowing) growth=`최근 3회 평균이 <strong>+${deltaScore.toFixed(1)}점</strong> 올랐어요! 눈에 띄게 발전 중이에요.`;
  else if(isStable) growth=`꾸준히 안정적인 궤적이에요. <strong>일관성</strong>도 실력입니다.`;
  else growth=`최근 3회가 평균보다 <strong>${Math.abs(deltaScore).toFixed(1)}점</strong> 내려왔어요. 무리하지 말고 호흡 가다듬으면 금방 다시 오를 거예요.`;
  // 스파크라인 (단색)
  const W=120,H=28;
  const sparkHtml=scores.length>=2?(()=>{
    const mn=Math.min(...scores),mx=Math.max(...scores);
    const rng=mx-mn||1;
    const pts=scores.map((s,i)=>`${(i/(scores.length-1))*W},${H-((s-mn)/rng)*H}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100px;height:24px;flex-shrink:0"><polyline points="${pts}" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  })():'';

  // ⑥ 관리자 추천 활용·리스크
  let adminBlock='';
  if(isAdmin){
    const bestCat=topCat;
    const riskCat=catAvgs.find(c=>c.pct<65);
    const volatility=scores.length>=3?(()=>{
      const mn=Math.min(...scores),mx=Math.max(...scores);
      return mx-mn>=20?`점수 편차 ${mx-mn}점 — 안정성 보완 필요`:'';
    })():'';
    adminBlock=`<div style="padding:14px;border-radius:10px;background:#fff;border:1px solid var(--bdr);margin-top:8px">
      <div style="font-size:12px;font-weight:800;color:var(--t1);margin-bottom:6px">⑥ 추천 활용 · 리스크 <span style="font-size:9px;color:var(--t3);font-weight:600;margin-left:4px">관리자 전용</span></div>
      <div style="font-size:12.5px;color:var(--t1);line-height:1.7">
        <div><strong>활용 추천:</strong> ${bestCat?`${bestCat.name} 강의 (평균 ${bestCat.pct}점${streak>=3?', 최근 '+streak+'회 80점↑ 안정':''})`:'—'}</div>
        <div style="margin-top:4px"><strong>주의 포인트:</strong> ${riskCat?`${riskCat.name} (${riskCat.pct}점) — 집중 코칭 권장`:volatility?volatility:'현재 특별한 리스크 신호는 없어요'}</div>
      </div>
    </div>`;
  }

  container.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:#fff;border:1px solid var(--bdr);color:var(--t1);font-size:10.5px;font-weight:800">${filterChipText}</span>
      <span style="font-size:10.5px;color:var(--t3)">평가 ${evalCount}회 · 평균 ${avg.toFixed(1)}점</span>
    </div>
    <div style="padding:14px;border-radius:10px;background:#fff;border:1px solid var(--bdr);margin-bottom:8px">
      <div style="font-size:12px;font-weight:800;color:var(--t1);margin-bottom:6px">① 한 줄 시그니처</div>
      <div style="font-size:12.5px;color:var(--t1);line-height:1.7">${sigLine}</div>
    </div>
    <div style="padding:14px;border-radius:10px;background:#fff;border:1px solid var(--bdr);margin-bottom:8px">
      <div style="font-size:12px;font-weight:800;color:var(--t1);margin-bottom:6px">② 자랑거리</div>
      <div style="font-size:12.5px;color:var(--t1);line-height:1.7">${brag}</div>
    </div>
    <div style="padding:14px;border-radius:10px;background:#fff;border:1px solid var(--bdr);margin-bottom:8px">
      <div style="font-size:12px;font-weight:800;color:var(--t1);margin-bottom:6px">③ 시그니처 무기</div>
      <div style="font-size:12.5px;color:var(--t1);line-height:1.7">${weapon}</div>
    </div>
    <div style="padding:14px;border-radius:10px;background:#fff;border:1px solid var(--bdr);margin-bottom:8px">
      <div style="font-size:12px;font-weight:800;color:var(--t1);margin-bottom:6px">④ 이번 숙제</div>
      <div style="font-size:12.5px;color:var(--t1);line-height:1.7">${task}</div>
    </div>
    <div style="padding:14px;border-radius:10px;background:#fff;border:1px solid var(--bdr);margin-bottom:0">
      <div style="font-size:12px;font-weight:800;color:var(--t1);margin-bottom:6px">⑤ 성장 신호</div>
      <div style="font-size:12.5px;color:var(--t1);line-height:1.7;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="flex:1;min-width:200px">${growth}</span>${sparkHtml}
      </div>
    </div>
    ${adminBlock}
  `;
}

// 종합 등급 기준 모달
function openGradeCriteria(userId,avg,currentGrade){
  document.getElementById('grade-criteria-overlay')?.remove();
  const rows=[
    {g:'S',min:90,max:100,color:'#dc2626',desc:'탁월 — 현장 리더급 강의력'},
    {g:'A',min:80,max:89, color:'#2563eb',desc:'우수 — 안정적 전달력과 전문성 갖춤'},
    {g:'B',min:70,max:79, color:'#10b981',desc:'양호 — 기본기 탄탄, 일부 구간 보완 필요'},
    {g:'C',min:60,max:69, color:'#f59e0b',desc:'보통 — 핵심은 전달되나 세부 개선 여지'},
    {g:'D',min:0, max:59, color:'#9ca3af',desc:'개선 필요 — 주요 항목 집중 보완 권장'}
  ];
  const score=typeof avg==='number'?avg:0;
  const isCurrent=g=>g===currentGrade;
  const rowHtml=rows.map(r=>`<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid ${isCurrent(r.g)?r.color:'rgba(0,0,0,.08)'};background:${isCurrent(r.g)?r.color+'10':'#fff'};border-radius:12px;margin-bottom:8px">
    <div style="width:44px;height:44px;border-radius:50%;background:${r.color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:900;flex-shrink:0">${r.g}</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:3px">
        <span style="font-size:14px;font-weight:800;color:${r.color}">${r.min}${r.max<100?'~'+r.max:'+'}점</span>
        ${isCurrent(r.g)?`<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;background:${r.color};color:#fff">현재</span>`:''}
      </div>
      <div style="font-size:12px;color:var(--t2);line-height:1.5">${r.desc}</div>
    </div>
  </div>`).join('');
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='grade-criteria-overlay';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;max-width:520px;width:92vw;padding:24px;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:17px;font-weight:900;color:var(--t1)">종합 등급 기준</div>
        <div style="font-size:12px;color:var(--t3);margin-top:3px">평가 점수(교육맞춤평가 기반 평균)로 자동 산정됩니다.</div>
      </div>
      <button style="border:none;background:rgba(0,0,0,.06);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:15px" onclick="this.closest('.overlay').remove()">✕</button>
    </div>
    ${rowHtml}
    <div style="margin-top:14px;padding:12px;background:rgba(0,120,200,.06);border-radius:10px;font-size:12px;color:var(--t2);line-height:1.6">
      <strong style="color:var(--blue)">현재 평가 점수:</strong> ${score?score.toFixed(1)+'점':'평가 기록 없음'}
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

// 강의 분위기 AI 판정 — 4차원(성량·템포·언어 신중도·장난기) 기반. 영상 결과 헤더(an-mood-badge)와 동일 로직.
// 성량 = 데시벨 / 템포 = WPM / 언어 신중도 = 반복어 적을수록 높음 / 장난기 = 반복어 많음 + 빠른 템포 조합
function computeAiMood(decibel, tempo, habits){
  const db=Number(decibel)||0, tp=Number(tempo)||0;
  const h=(habits||[]).reduce((a,x)=>a+(x.count||0),0);
  // 1단계: 엄격 규칙 우선 매칭 (먼저 매칭되는 분위기 반환)
  if(tp>=150 && h>=15) return '재미있고 유머러스한';          // 장난기 높음 (빠른 템포 + 많은 반복어)
  if(db>=78 && tp>=155) return '열정적이고 에너지 넘치는';       // 에너지 폭발 (큰 성량 + 빠른 템포)
  if(db>=70 && tp<=135 && h<=5) return '전문적이고 진지한';     // 안정 성량 + 차분 템포 + 언어 매우 신중
  if(db>=70 && tp>=140 && h<10) return '밝고 경쾌한';           // 적정 성량 + 빠른 템포 + 언어 신중
  if(db<=65 && tp<=130) return '차분하고 신뢰감 있는';           // 낮은 성량 + 느린 템포
  if(db>=65 && tp>=125 && tp<=150) return '친근하고 편안한';     // 중간 성량 + 중간 템포
  // 2단계: 엄격 규칙에 걸리지 않으면 각 분위기의 '프로토타입' 과 거리(정규화 Manhattan) 계산해 가장 가까운 것 반환
  const prototypes=[
    {name:'열정적이고 에너지 넘치는',db:82,tp:165,h:8},
    {name:'밝고 경쾌한',db:75,tp:150,h:5},
    {name:'친근하고 편안한',db:70,tp:138,h:8},
    {name:'전문적이고 진지한',db:75,tp:125,h:3},
    {name:'차분하고 신뢰감 있는',db:60,tp:115,h:6},
    {name:'재미있고 유머러스한',db:70,tp:160,h:20}
  ];
  const dist=p=>Math.abs(db-p.db)/10 + Math.abs(tp-p.tp)/20 + Math.abs(h-p.h)/5;
  return prototypes.reduce((best,p)=>dist(p)<dist(best)?p:best).name;
}

// 분위기 통계 모달 — 영상(aiMood 재계산) + 스피치(voice_evals.tone) 누적 집계
function openMoodBreakdown(userId){
  const u=(D.users||[]).find(x=>String(x.id)===String(userId));
  if(!u) return;
  document.getElementById('mood-breakdown-overlay')?.remove();

  const userVids=(D.videos||[]).filter(v=>String(v.userId)===String(userId));
  const vidIds=new Set(userVids.map(v=>v.id));
  const rawVidEvals=(D.evaluations||[]).filter(e=>e.video_id&&vidIds.has(e.video_id));
  // 영상 1개 = 1건. 같은 video_id 안에서 AI독자 우선 (AI 평가 페이지 mood badge 와 소스 일치)
  const byVid={};
  rawVidEvals.forEach(e=>{
    const ex=byVid[e.video_id];
    const isAi=e.eval_type==='AI독자';
    if(!ex || (isAi && ex.eval_type!=='AI독자')) byVid[e.video_id]=e;
  });
  const vidEvals=Object.values(byVid);
  const vidCounts={};
  vidEvals.forEach(e=>{
    const m=computeAiMood(e.decibel,e.tempo,e.habits);
    if(m) vidCounts[m]=(vidCounts[m]||0)+1;
  });
  const vidTotal=Object.values(vidCounts).reduce((a,b)=>a+b,0);

  const voiceEv=(D.voiceEvals||[]).filter(ve=>String(ve.user_id)===String(userId)&&ve.tone);
  const voiceCounts={};
  voiceEv.forEach(ve=>{voiceCounts[ve.tone]=(voiceCounts[ve.tone]||0)+1});
  const voiceTotal=voiceEv.length;

  const buildGrid=(counts,color)=>{
    const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if(!entries.length) return `<div style="padding:18px;text-align:center;color:var(--t3);font-size:12px;background:#f9fafb;border-radius:10px;border:1px dashed rgba(0,0,0,.08)">아직 기록이 없습니다</div>`;
    const cells=entries.map(([mood,cnt])=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:10px;background:#f9fafb;border:1px solid rgba(0,0,0,.06)">
      <span style="font-size:13px;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mood}</span>
      <span style="font-size:14px;font-weight:900;color:${color};white-space:nowrap">${cnt}건</span>
    </div>`).join('');
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${cells}</div>`;
  };

  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='mood-breakdown-overlay';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;max-width:560px;width:92vw;max-height:85vh;overflow-y:auto;padding:24px;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px">
      <div style="min-width:0">
        <div style="font-size:17px;font-weight:900;color:var(--t1)">${u.name||'—'} 강사 · 분위기 기록</div>
        <div style="font-size:12px;color:var(--t3);margin-top:3px">영상(교육맞춤/AI독자)·스피치 평가에서 누적된 분위기 태그</div>
      </div>
      <button style="border:none;background:rgba(0,0,0,.06);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:15px;flex-shrink:0" onclick="this.closest('.overlay').remove()">✕</button>
    </div>

    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(220,38,38,.15)">
        <span style="font-size:14px;font-weight:800;color:#dc2626">영상 분위기</span>
        <span style="font-size:11px;font-weight:700;color:var(--t3);margin-left:auto">총 ${vidTotal}건</span>
      </div>
      ${buildGrid(vidCounts,'#dc2626')}
    </div>

    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(139,92,246,.15)">
        <span style="font-size:14px;font-weight:800;color:#8b5cf6">스피치 분위기</span>
        <span style="font-size:11px;font-weight:700;color:var(--t3);margin-left:auto">총 ${voiceTotal}건</span>
      </div>
      ${buildGrid(voiceCounts,'#8b5cf6')}
    </div>

    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.1)">
        <span style="font-size:14px;font-weight:800;color:var(--t1)">분위기 판정 기준</span>
      </div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:10px;line-height:1.6">
        4가지 포인트로 판정합니다 — <b style="color:var(--t1)">성량</b> · <b style="color:var(--t1)">템포</b> · <b style="color:var(--t1)">언어 신중도</b> · <b style="color:var(--t1)">장난기</b>
        <br><span style="color:var(--t2)">※ 아래 조건에 해당하지 않으면 가장 가까운 분위기로 AI가 자동 매칭합니다.</span>
      </div>
      ${[
        {name:'열정적이고 에너지 넘치는',tags:[['성량','높음'],['템포','빠름']]},
        {name:'밝고 경쾌한',tags:[['성량','적정'],['템포','빠름'],['언어 신중도','높음']]},
        {name:'친근하고 편안한',tags:[['성량','중간'],['템포','중간']]},
        {name:'전문적이고 진지한',tags:[['성량','안정'],['템포','차분'],['언어 신중도','매우 높음']]},
        {name:'차분하고 신뢰감 있는',tags:[['성량','낮음'],['템포','느림']]},
        {name:'재미있고 유머러스한',tags:[['템포','빠름'],['장난기','있음']]}
      ].map(c=>`<div style="padding:10px 12px;border-radius:10px;background:#f9fafb;border:1px solid rgba(0,0,0,.06);margin-bottom:6px">
        <div style="font-size:12.5px;font-weight:700;color:var(--t1);margin-bottom:6px">${c.name}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          ${c.tags.map(([k,v])=>`<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:#fff;border:1px solid rgba(0,0,0,.08);font-size:10.5px"><span style="color:var(--t3);font-weight:700">${k}</span><span style="color:var(--t1);font-weight:600">${v}</span></span>`).join('')}
        </div>
      </div>`).join('')}
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

// 개선 지수 — 최근 평가 점수 추이 그래프 모달 (평가 부족해도 레이아웃 확인용으로 열림)
function openImprovementChart(userId){
  const series=(window._lectImpSeries||{})[userId]||[];
  document.getElementById('imp-chart-overlay')?.remove();
  // 간단한 SVG 라인 차트 (데이터 없어도 축·그리드 렌더)
  const W=640,H=320,PAD_L=48,PAD_R=20,PAD_T=20,PAD_B=36;
  // 데이터 없을 때 기본 Y 범위 0~100
  const hasData=series.length>0;
  const minS=hasData?Math.max(0,Math.min(...series.map(p=>p.score))-10):0;
  const maxS=hasData?Math.min(100,Math.max(...series.map(p=>p.score))+5):100;
  const xAt=i=>PAD_L+(W-PAD_L-PAD_R)*(series.length>1?i/(series.length-1):0.5);
  const yAt=s=>PAD_T+(H-PAD_T-PAD_B)*(1-(s-minS)/Math.max(1,maxS-minS));
  const gridLines=[0,25,50,75,100].filter(v=>v>=minS&&v<=maxS).map(v=>{
    const y=yAt(v);
    return `<line x1="${PAD_L}" y1="${y}" x2="${W-PAD_R}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/><text x="${PAD_L-6}" y="${y+4}" fill="#94a3b8" font-size="10" text-anchor="end">${v}</text>`;
  }).join('');
  const pts=series.length>=2?series.map((p,i)=>`${xAt(i)},${yAt(p.score)}`).join(' '):'';
  const dots=series.map((p,i)=>{
    const cx=xAt(i),cy=yAt(p.score);
    return `<circle cx="${cx}" cy="${cy}" r="5" fill="#0078C8" stroke="#fff" stroke-width="2"/><text x="${cx}" y="${cy-12}" fill="#0078C8" font-size="11" font-weight="800" text-anchor="middle">${p.score}</text>`;
  }).join('');
  const xLabels=series.map((p,i)=>{
    const x=xAt(i);
    return `<text x="${x}" y="${H-PAD_B+18}" fill="#64748b" font-size="10" text-anchor="middle">${p.date||'—'}</text>`;
  }).join('');
  // 평가 부족 시 중앙 안내 텍스트
  const placeholder=!hasData?`<text x="${W/2}" y="${H/2}" fill="#94a3b8" font-size="13" text-anchor="middle" font-weight="600">평가가 쌓이면 이곳에 점수 추이가 표시됩니다</text>`:series.length===1?`<text x="${W/2}" y="${PAD_T+16}" fill="#94a3b8" font-size="11" text-anchor="middle">평가 1회 기록 · 2회째부터 추이선이 그려집니다</text>`:'';
  const svg=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
    ${gridLines}
    ${pts?`<polyline points="${pts}" fill="none" stroke="#0078C8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`:''}
    ${dots}${xLabels}${placeholder}
  </svg>`;
  const overlay=document.createElement('div');
  overlay.className='overlay show';
  overlay.id='imp-chart-overlay';
  overlay.onclick=e=>{if(e.target===overlay) overlay.remove();};
  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;max-width:720px;width:92vw;padding:24px;animation:scaleIn .25s cubic-bezier(.22,1,.36,1)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div>
        <div style="font-size:17px;font-weight:900;color:var(--t1)">평가 점수 추이</div>
        <div style="font-size:12px;color:var(--t3);margin-top:3px">개선 지수는 인접 평가 간 향상률(%)의 최근 3회 평균으로 산출됩니다.</div>
      </div>
      <button style="border:none;background:rgba(0,0,0,.06);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:15px" onclick="this.closest('.overlay').remove()">✕</button>
    </div>
    ${svg}
  </div>`;
  document.body.appendChild(overlay);
}

// 관리자 수강 만족도 수정
async function editSatisfaction(userId){
  const val=prompt('수강 만족도 (0.0~5.0):');
  if(val===null) return;
  const num=parseFloat(val);
  if(isNaN(num)||num<0||num>5){alert('0~5 사이 숫자를 입력하세요.');return;}
  await dbUpdateUser(userId,{satisfaction:num});
  const u=D.users.find(x=>x.id===userId); if(u) u.satisfaction=num;
  _refreshLectStats(userId);
}

// 관리자 종합 등급 수정
async function editGrade(userId){
  const val=prompt('종합 등급 (S/A/B/C/D 또는 빈칸=자동):');
  if(val===null) return;
  const upper=val.trim().toUpperCase();
  if(upper&&!['S','A','B','C','D'].includes(upper)){alert('S/A/B/C/D 중 하나를 입력하세요.');return;}
  await dbUpdateUser(userId,{grade_override:upper||null});
  const u=D.users.find(x=>x.id===userId); if(u) u.grade_override=upper||null;
  _refreshLectStats(userId);
}

// evaluations의 categories를 집계하여 레이더 그리기
// 모든 가능 경로를 시도하고 빈 경우 명확한 진단 안내 표시
function renderRadarChartFromEvals(userId){
  // JSON string 으로 저장된 컬럼도 안전하게 array 로 반환
  const safeArr = (val) => {
    if(Array.isArray(val)) return val;
    if(typeof val==='string'){
      try{ const p=JSON.parse(val); return Array.isArray(p)?p:[]; }catch(_){ return []; }
    }
    return [];
  };
  const catFilter=document.getElementById('lect-cat-filter')?.value||document.getElementById('radar-cat-filter')?.value||'';
  const prodFilter=document.getElementById('lect-prod-filter')?.value||document.getElementById('radar-prod-filter')?.value||'';

  // 1) 1차 소스: _lectEvals (openLecturer 에서 세팅된 캐시)
  let evals=Array.isArray(window._lectEvals)?window._lectEvals.slice():[];

  // 2) 2차 소스 폴백: D.evaluations 에서 직접 필터 (캐시 누락 대비)
  if(!evals.length){
    const u=(D.users||[]).find(x=>x.id===userId);
    const userVidIds=new Set((D.videos||[]).filter(v=>(v.userId||v.user_id)===userId).map(v=>v.id));
    evals=(D.evaluations||[]).filter(e=>{
      // video 기반 평가
      if(e.video_id && userVidIds.has(e.video_id)) return true;
      // user_id 직접 매칭 (스피치 평가 등)
      if(e.user_id===userId) return true;
      // voice_eval_id → voice_evals → user_id 매칭
      if(e.voice_eval_id){
        const ve=(D.voiceEvals||[]).find(x=>x.id===e.voice_eval_id);
        if(ve && ve.user_id===userId) return true;
      }
      return false;
    });
    if(evals.length) console.log('[radar] _lectEvals 비어 D.evaluations 폴백 — '+evals.length+'건 발견');
  }

  // 카테고리·제품 필터 (선택된 경우)
  if(catFilter||prodFilter){
    const vidIds=new Set((D.videos||[]).filter(v=>{
      if(catFilter&&(v.eduType||v.edu_type||'')!==catFilter) return false;
      if(prodFilter&&!(v.productName||v.product_name||'').includes(prodFilter)) return false;
      return true;
    }).map(v=>v.id));
    evals=evals.filter(e=>!e.video_id || vidIds.has(e.video_id));
  }

  // 영상별 최신 1건 (교육맞춤평가 우선, 없으면 AI독자) + 영상 없는 평가도 포함
  const byVid=new Map();
  const voiceEvals=[];
  evals.forEach(e=>{
    if(!e.video_id){ voiceEvals.push(e); return; }
    const ex=byVid.get(e.video_id);
    if(!ex||e.eval_type==='평가안기준') byVid.set(e.video_id,e);
  });
  const latest=[...byVid.values(), ...voiceEvals];

  // categories 집계 (JSON string 도 안전 처리)
  const catAgg=new Map();
  latest.forEach(e=>{
    safeArr(e.categories).forEach(c=>{
      if(!c.name) return;
      const a=catAgg.get(c.name)||{name:c.name,score:0,max:0,count:0};
      a.score+=Number(c.score||0); a.max+=Number(c.max||0); a.count++;
      catAgg.set(c.name,a);
    });
  });
  let cats=[...catAgg.values()];

  // 폴백 ①: categories 가 비어있거나 모두 max=0 이면 sub_scores 에서 카테고리 자동 재계산
  //   max=0 이지만 sub_scores 의 level 별로 점수 추정도 시도 (normalize 안 거친 옛 데이터 호환)
  const hasValidCat = cats.some(c=>Number(c.max||0)>0);
  if(!hasValidCat){
    const subCatAgg=new Map();
    const order=[];
    let evalsWithSubs=0;
    latest.forEach(e=>{
      const subs=safeArr(e.sub_scores);
      if(subs.length) evalsWithSubs++;
      subs.forEach(s=>{
        if(!s.category || s.level==='na') return;
        const k=s.category;
        if(!subCatAgg.has(k)){ subCatAgg.set(k,{name:k,score:0,max:0}); order.push(k); }
        const a=subCatAgg.get(k);
        // max=0 이면 level 로 max·score 추정 (good=5/normal=3/bad=0)
        let sScore=Number(s.score||0), sMax=Number(s.max||0);
        if(sMax<=0){
          sMax=5;
          if(s.level==='good') sScore=5;
          else if(s.level==='normal') sScore=3;
          else sScore=0;
        }
        a.score+=sScore;
        a.max+=sMax;
      });
    });
    const subCats=order.map(k=>subCatAgg.get(k)).filter(c=>c.max>0);
    if(subCats.length){
      cats=subCats;
      console.log('[radar] categories 무효 → sub_scores 로 재계산: '+subCats.length+'개 ('+evalsWithSubs+'건 평가 활용)');
    } else {
      console.log('[radar] sub_scores 도 비어있음. latest 평가:'+latest.length+', sub_scores 보유:'+evalsWithSubs);
    }
  }

  // 폴백 ②: 평가가 전혀 없는데 영상의 timestamps 만 있는 경우 (Top3 점수 출처와 동일)
  // → 영상 자동 태깅(good/bad/tip) 비율로 임시 점수 추정. AI 평가 권유 메시지 같이 표시.
  let usingTimestampFallback=false;
  if(!cats.length){
    const userVids=(D.videos||[]).filter(v=>String(v.userId||v.user_id)===String(userId));
    const userVidsFiltered = (catFilter||prodFilter)
      ? userVids.filter(v=>{
          if(catFilter && (v.eduType||v.edu_type||'')!==catFilter) return false;
          if(prodFilter && !(v.productName||v.product_name||'').includes(prodFilter)) return false;
          return true;
        })
      : userVids;
    let totalGood=0, totalBad=0, totalTip=0, totalNeutral=0;
    userVidsFiltered.forEach(v=>{
      (v.timestamps||[]).forEach(t=>{
        if(t.type==='good') totalGood++;
        else if(t.type==='bad') totalBad++;
        else if(t.type==='tip') totalTip++;
        else totalNeutral++;
      });
    });
    const totalTs = totalGood+totalBad+totalTip+totalNeutral;
    if(totalTs>0){
      const ratio=(n)=>Math.round((n/totalTs)*100);
      cats=[
        {name:'잘한 점 (good)', score:totalGood, max:Math.max(totalGood,Math.ceil(totalTs/3))},
        {name:'개선 필요 (bad)', score:Math.max(0,totalTs-totalBad), max:totalTs},
        {name:'팁/주목 (tip)', score:totalTip, max:Math.max(totalTip,Math.ceil(totalTs/3))},
        {name:'영상 등록량', score:Math.min(100,userVidsFiltered.length*20), max:100},
        {name:'태깅 풍부도', score:Math.min(100,totalTs*5), max:100}
      ];
      usingTimestampFallback=true;
      console.log('[radar] AI 평가 없음 → 영상 timestamps 폴백 ('+totalTs+'개 태그)');
    }
  }

  // max=0 또는 score=max=0 인 항목 제외
  cats=cats.filter(c=>c.max>0);

  // 그래도 비어있으면 명확한 진단 안내 + 강사 상태 요약
  if(!cats.length){
    const svgEl=document.getElementById('radar-chart-'+userId);
    const barsEl=document.getElementById('lect-skills-bars-'+userId);
    const userVids=(D.videos||[]).filter(v=>String(v.userId||v.user_id)===String(userId));
    const evalCnt=evals.length;
    const vidCnt=userVids.length;
    let reason='', actionHint='';
    if(vidCnt===0){
      reason='등록된 영상이 없습니다';
      actionHint='영상을 등록하면 AI 가 자동 분석합니다';
    } else if(evalCnt===0){
      reason=`영상 ${vidCnt}건 등록됨 / AI 평가 0건`;
      actionHint='영상 페이지에서 [AI 분석 시작] 클릭하면 평가됩니다';
    } else {
      reason=`평가 ${evalCnt}건 있으나 점수 항목이 모두 비어있음`;
      actionHint='다시 분석하면 자동으로 점수가 채워집니다';
    }
    if(svgEl){
      svgEl.innerHTML=`<text x="200" y="195" text-anchor="middle" fill="#9ca3af" font-size="13" font-weight="800">분석 데이터 부족</text>
                      <text x="200" y="218" text-anchor="middle" fill="#6b7280" font-size="11">${reason}</text>
                      <text x="200" y="245" text-anchor="middle" fill="#9ca3af" font-size="10">${actionHint}</text>`;
    }
    if(barsEl){
      barsEl.innerHTML=`<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--t3);font-size:12px;text-align:center;padding:24px">
        <div style="font-size:36px;margin-bottom:10px">📊</div>
        <div style="font-weight:800;color:var(--t2);margin-bottom:6px">분석 데이터 부족</div>
        <div style="font-size:11.5px;color:var(--t2);line-height:1.6;margin-bottom:4px"><strong>${reason}</strong></div>
        <div style="font-size:10.5px;color:var(--t3);line-height:1.5">${actionHint}</div>
      </div>`;
    }
    return;
  }
  // 데모 모드: 비어있거나 전부 만점(부자연)일 때 → 현실감 있는 8대 역량으로 채움 (강사별 살짝 다르게)
  if(IB_DEMO()){
    const allMaxed=cats.length&&cats.every(c=>c.max>0&&(c.score/c.max)>=0.97);
    if(!cats.length||allMaxed){
      const off=(_demoHash((D.users.find(x=>x.id===userId)||{}).name||String(userId))%7)-3;
      cats=[['내용 전문성',95],['교수설계 및 교수법',88],['스피치·전달력',92],['맞춤 코칭',84],['소통',90],['프리젠테이션',86],['현장 퍼포먼스 연계',82],['변화 대응력',89]]
        .map(([name,sc])=>({name,score:Math.max(70,Math.min(99,sc+off)),max:100}));
    }
  }
  const items=cats.map(c=>({name:c.name,score:c.score,max:c.max||1}));
  const scores=cats.map(c=>c.max>0?Math.round(c.score/c.max*100):0);
  // 레이더 SVG 직접 그리기
  const svgEl=document.getElementById('radar-chart-'+userId);
  if(!svgEl) return;
  svgEl.setAttribute('viewBox','0 0 500 440');
  svgEl.innerHTML=drawRadarSVG(items);
  // 달성도 바 + (timestamp 폴백 시) 안내 배너
  const barsEl=document.getElementById('lect-skills-bars-'+userId);
  if(barsEl){
    const fallbackBanner = usingTimestampFallback
      ? `<div style="padding:10px 12px;margin-bottom:12px;border-radius:8px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);font-size:10.5px;color:#92400e;line-height:1.5">
           💡 정식 AI 평가가 없어 영상 자동 태깅 기반 임시 분석입니다.<br>
           영상 페이지에서 [AI 분석 시작] 클릭 시 정확한 점수로 자동 갱신됩니다.
         </div>`
      : '';
    barsEl.innerHTML=fallbackBanner+'<div style="flex:1;display:flex;flex-direction:column;justify-content:center">'+
      cats.map(c=>{const p=c.max>0?Math.round(c.score/c.max*100):0;const cc=scoreColorFromRatio(p/100);return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;max-width:560px;margin-left:auto;margin-right:auto;width:100%">
        <span style="font-size:12.5px;font-weight:700;color:var(--t1);width:140px;flex-shrink:0">${c.name}</span>
        <div style="flex:1;height:10px;background:#f0f0f0;border-radius:5px;overflow:hidden;min-width:0"><div style="height:100%;width:${p}%;background:${cc};border-radius:5px;transition:width .8s"></div></div>
        <span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:11.5px;font-weight:800;background:${cc};color:#fff;min-width:50px;text-align:center;flex-shrink:0">${p}%</span>
      </div>`;}).join('')+'</div>';
  }
}

async function saveMemo(uid){
  const memo=el('self-memo').value;
  await dbUpdateUser(uid,{memo});
  const u=D.users.find(x=>x.id===uid);
  if(u) u.memo=memo;
  alert('메모가 저장되었습니다.');
}
async function changeProfilePhoto(uid,input){
  if(!input.files||!input.files[0]) return;
  let file=input.files[0];
  if(!/^image\//.test(file.type)){alert('이미지 파일만 업로드 가능합니다.');input.value='';return;}
  // 본인 사진만 변경 가능 (관리자는 다른 강사 사진을 직접 못 바꿈 — 보안)
  if(!CU || CU.id !== uid){
    alert('본인 사진만 변경 가능합니다. (관리자가 다른 강사 사진 변경은 차단)');
    return;
  }
  // 자동 압축 — 1MB 초과 시
  if(file.size > 1024*1024){
    const origSize=(file.size/1024/1024).toFixed(1);
    file = await compressImage(file);
    console.log(`📸 자동 압축: ${origSize}MB → ${(file.size/1024/1024).toFixed(2)}MB`);
  }
  if(file.size>3*1024*1024){alert('압축 후에도 3MB 초과. 다른 사진을 선택해주세요.');input.value='';return;}
  const reader=new FileReader();
  reader.onload=async e=>{
    const dataUrl=e.target.result;
    // 미리보기
    const disp=el('prof-photo-display');
    if(disp) disp.innerHTML=`<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    try{
      const token=localStorage.getItem('ib_token')||'';
      const r=await fetchWithRetry('/api/auth/update-photo',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({photo:dataUrl})  // Storage 업로드 후 URL 반환
      });
      const j=await r.json().catch(()=>({}));
      if(!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));
      const photoUrl=j.photoUrl;
      // D.users·CU 모두 URL 로 갱신
      const u=D.users.find(x=>x.id===uid);
      if(u) u.photo=photoUrl;
      CU.photo=photoUrl;
      saveStoredUser(CU);
      if(disp) disp.innerHTML=`<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      try{document.querySelectorAll('.hdr-av,.tn-profile-photo').forEach(av=>{av.innerHTML=`<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;});}catch(_){}
      if(typeof showToast==='function') showToast('✓ 사진 변경 완료','#10b981');
    }catch(err){
      alert('❌ 사진 변경 실패\n\n원인: '+(err.message||err));
    }
  };
  reader.readAsDataURL(file);
}

/* ════════════════════════════════
   COMPARE
════════════════════════════════ */
let compareMyId=null;
function openCompareModal(myId){
  compareMyId=myId;
  const ts=el('cmp-team'); ts.innerHTML='<option value="">전체</option>';
  [...new Set(D.users.filter(u=>!u.deleted).map(u=>u.team).filter(Boolean))].forEach(t=>{
    const o=document.createElement('option'); o.value=t; o.textContent=t; ts.appendChild(o);
  });
  const cs=el('cmp-ch'); cs.innerHTML='<option value="">전체</option>';
  [...new Set(D.users.filter(u=>!u.deleted).map(u=>u.orgName).filter(Boolean))].forEach(c=>{
    const o=document.createElement('option'); o.value=c; o.textContent=c; cs.appendChild(o);
  });
  const ns=el('cmp-name'); ns.innerHTML='<option value="">전체</option>';
  D.users.filter(u=>!u.deleted&&u.id!==myId).forEach(u=>{
    const o=document.createElement('option'); o.value=u.name; o.textContent=u.name; ns.appendChild(o);
  });
  el('cmp-results').innerHTML='<div style="font-size:12px;color:var(--t3);padding:10px;text-align:center">필터를 선택하거나 이름을 선택하세요</div>';
  ['cmp-date','cmp-ch','cmp-team','cmp-tenure','cmp-name'].forEach(id=>{
    el(id).onchange=()=>renderCompareResults(myId);
  });
  el('compare-overlay').classList.add('show');
}
function renderCompareResults(myId){
  const ch=v('cmp-ch'),team=v('cmp-team'),tenure=v('cmp-tenure'),name=v('cmp-name');
  const now=new Date();
  let list=D.users.filter(u=>{
    if(u.deleted) return false;
    if(u.id===myId) return false;
    if(ch&&u.orgName!==ch) return false;
    if(team&&u.team!==team) return false;
    if(name&&u.name!==name) return false;
    if(tenure){
      if(!u.hireDate) return false;
      const hd=new Date(u.hireDate);
      const m=(now.getFullYear()-hd.getFullYear())*12+(now.getMonth()-hd.getMonth());
      if(tenure==='3m'&&m>=3) return false;
      if(tenure==='1y'&&m>=12) return false;
      if(tenure==='1y+'&&m<12) return false;
      if(tenure==='5y+'&&m<60) return false;
      if(tenure==='10y+'&&m<120) return false;
    }
    return true;
  });
  if(!list.length){ el('cmp-results').innerHTML='<div style="font-size:12px;color:var(--t3);padding:10px;text-align:center">조건에 맞는 강사가 없습니다</div>'; return; }
  const colors=['#E21E26','#0078C8','#10b981','#f59e0b','#8b5cf6','#ec4899'];
  el('cmp-results').innerHTML=list.map((u,i)=>{
    const bg=colors[i%6];
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(0,0,0,.18);cursor:pointer;border-radius:8px;transition:background .15s" onmouseover="this.style.background='#f8f8f8'" onmouseout="this.style.background=''" onclick="doCompare(${myId},${u.id})">
      <div style="width:36px;height:36px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800;flex-shrink:0;overflow:hidden">${u.photo?'<img src="'+u.photo+'" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">':u.name[0]}</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:700">${u.name}</div><div style="font-size:10px;color:var(--t3)">${u.office} · ${u.team} · ${u.score}점</div></div>
      <span class="grade-badge g-${u.grade}" style="display:inline-flex">${u.grade}</span>
      <span style="font-size:11px;color:var(--blue);font-weight:700">비교 →</span>
    </div>`;
  }).join('');
}
function doCompare(myId,otherId){
  closeOverlay('compare-overlay');
  const me=D.users.find(x=>x.id===myId), other=D.users.find(x=>x.id===otherId);
  if(!me||!other) return;
  const scoreKeys=Object.keys(me.scores);
  const barsHtml=scoreKeys.map(k=>{
    const myPct=Math.round(me.scores[k]/(me.maxes[k]||1)*100);
    const otPct=Math.round((other.scores[k]||0)/((other.maxes||me.maxes)[k]||1)*100);
    const diff=me.scores[k]-(other.scores[k]||0);
    const dc=diff>0?'var(--green)':diff<0?'var(--red)':'var(--t3)';
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="font-weight:600">${k}</span><span style="color:${dc};font-weight:700">${diff>0?'+':''}${diff}점</span></div>
      <div style="display:flex;gap:6px;align-items:center"><span style="font-size:10px;color:var(--blue);width:30px">${me.scores[k]}</span><div style="flex:1"><div class="bar-track"><div class="bar-fill bf-blue" style="width:${myPct}%"></div></div></div></div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:3px"><span style="font-size:10px;color:var(--orange);width:30px">${other.scores[k]||0}</span><div style="flex:1"><div class="bar-track"><div class="bar-fill" style="width:${otPct}%;background:linear-gradient(90deg,var(--orange),#fcd34d)"></div></div></div></div>
    </div>`;
  }).join('');
  const td=me.score-other.score;
  const tdc=td>0?'var(--green)':td<0?'var(--red)':'var(--t3)';
  const otBg=['#E21E26','#0078C8','#10b981','#f59e0b'][(otherId-1)%4];
  el('compare-result-'+myId).innerHTML=`
    <div style="border:1px solid rgba(0,0,0,.18);border-radius:var(--r2);padding:18px;background:#fff">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;flex:1">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;overflow:hidden">${me.photo?'<img src="'+me.photo+'" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">':me.name[0]}</div>
          <div><div style="font-size:13px;font-weight:800">${me.name}</div><div style="font-size:10px;color:var(--t3)">${me.score}점</div></div>
        </div>
        <span style="font-size:16px;font-weight:900;color:var(--t3)">VS</span>
        <div style="display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end">
          <div><div style="font-size:13px;font-weight:800;text-align:right">${other.name}</div><div style="font-size:10px;color:var(--t3);text-align:right">${other.score}점</div></div>
          <div style="width:32px;height:32px;border-radius:50%;background:${otBg};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;overflow:hidden">${other.photo?'<img src="'+other.photo+'" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">':other.name[0]}</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:16px;padding:8px;background:rgba(0,0,0,.03);border-radius:8px">
        <span style="font-size:12px;color:var(--t2)">종합 점수 차이: </span><span style="font-size:18px;font-weight:900;color:${tdc}">${td>0?'+':''}${td}점</span>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;font-size:10px"><span style="color:var(--blue)">● ${me.name}</span><span style="color:var(--orange)">● ${other.name}</span></div>
      ${barsHtml}
    </div>`;
}

/* ════════════════════════════════
   EDIT PROFILE
════════════════════════════════ */
let editProfileId=null;
function openEditProfile(uid){
  editProfileId=uid;
  const u=D.users.find(x=>x.id===uid);
  if(!u) return;
  el('ep-name').value=u.name||'';
  el('ep-year').value=u.birthYear||'';
  el('ep-channel').value=u.channel||'현장코칭강사';
  el('ep-team').value=u.team||'';
  el('ep-hire').value=u.hireDate||'';
  el('ep-phone').value=u.phone||'';
  if(el('ep-email')) el('ep-email').value=u.email||'';
  el('ep-pw').value='';
  el('ep-err').textContent='';
  el('edit-profile-overlay').classList.add('show');
}
async function saveEditProfile(){
  const u=D.users.find(x=>x.id===editProfileId);
  if(!u) return;
  const name=v('ep-name').trim();
  if(!name){ el('ep-err').textContent='이름을 입력하세요.'; return; }
  const newEmail=(v('ep-email')||'').trim().toLowerCase();
  // 아이디(이메일) 형식 강제 제거 — 이메일 형식 아닌 ID 허용
  // 아이디 중복 체크 (본인 제외)
  if(newEmail && newEmail!==(u.email||'').toLowerCase()){
    const dup=(D.users||[]).find(x=>x.id!==editProfileId && (x.email||'').toLowerCase()===newEmail);
    if(dup){ el('ep-err').textContent='이미 사용 중인 이메일입니다: '+dup.name; return; }
  }
  const pw=v('ep-pw').trim();
  if(pw && pw.length<4){ el('ep-err').textContent='비밀번호는 4자 이상입니다.'; return; }
  const fields={name,birthYear:parseInt(v('ep-year'))||u.birthYear,channel:v('ep-channel'),team:v('ep-team'),hireDate:v('ep-hire'),phone:v('ep-phone')};
  // 이메일 변경 (선택)
  if(newEmail && newEmail!==(u.email||'').toLowerCase()){
    fields.email=newEmail;
  }
  await dbUpdateUser(editProfileId,fields);
  Object.assign(u,fields);
  if(pw){
    const token=localStorage.getItem('ib_token')||'';
    try{
      const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({userId:editProfileId,newPassword:pw})});
      const j=await r.json().catch(()=>({}));
      if(!j.ok){ el('ep-err').textContent='비밀번호 변경 실패: '+(j.error||''); return; }
    }catch(e){ el('ep-err').textContent='네트워크 오류'; return; }
  }
  if(CU&&CU.id===editProfileId){ CU.name=u.name; CU.channel=u.channel; saveStoredUser(CU); }
  closeOverlay('edit-profile-overlay');
  openLecturer(editProfileId, lectFromPage);
  alert(pw ? '✅ 정보 및 비밀번호가 저장되었습니다.' : '✅ 저장되었습니다.');
}

function buildEngagementTimeline(gaps){
  if(!gaps||!gaps.length) return '<p style="font-size:12px;color:var(--t3);padding:10px 0">데이터 없음</p>';
  const avg=(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(1);
  const dots=gaps.map((g,i)=>{
    const color=g<=10?'var(--green)':g<=15?'var(--orange)':'var(--red)';
    return `<div class="eng-seg"><div class="eng-bar" style="width:${g*6}px"></div><div class="eng-wrap"><div class="eng-dot" style="background:${color}"></div><div class="eng-label">${g}분</div></div></div>`;
  }).join('');
  return `<div style="padding:10px 0">
    <div class="eng-line"><div class="eng-dot" style="background:var(--t3)"></div>${dots}</div>
    <div style="font-size:11px;color:var(--t2);margin-top:6px">평균 참여 유도 간격: <strong>${avg}분</strong> · 권장: 10분 이내<br><span style="color:var(--green)">●</span> ≤10분(양호) <span style="color:var(--orange)">●</span> 11-15분(주의) <span style="color:var(--red)">●</span> >15분(개선필요)</div>
  </div>`;
}

/* ════════════════════════════════
   VIDEO ANALYSIS
════════════════════════════════ */
function openVideo(id){
  curVidId=id;
  // F5 복원용 컨텍스트 저장
  try{localStorage.setItem('ib_last_ctx',JSON.stringify({type:'video',id}));}catch(_){}
  const vid=D.videos.find(x=>x.id===id);
  if(!vid) return;
  const u=D.users.find(x=>x.id===vid.userId);

  // page-analysis의 Step2 결과 화면으로 표시
  el('an-step1').style.display='none';
  el('an-step2').style.display='';
  var apb3=el('an-pdf-btn');if(apb3)apb3.style.display='';
  // 결과 헤더 (과거 영상 보기): 제목 + 교육종류 + 해당 강사 이름/팀/직군
  setAnResultMeta({title:vid.title, eduType:(vid.eduType||vid.edu_type), userName:u?.name, team:u?.team, position:u?.position});

  // 영상 플레이어
  window._anYtId=null;
  if(vid.youtube){
    const m=vid.youtube.match(/[?&]v=([^&]+)/);
    if(m){
      window._anYtId=m[1];
      el('an-player').innerHTML=`<iframe id="an-yt-iframe" src="https://www.youtube.com/embed/${m[1]}?enablejsapi=1" allowfullscreen allow="autoplay" style="width:100%;height:100%;border:none;border-radius:var(--r2)"></iframe>`;
    }
  } else if(vid.filePath){
    el('an-player').innerHTML=`<video id="an-video-el" controls style="width:100%;height:100%;border-radius:var(--r2)"><source src="${vid.filePath}"></video>`;
  } else {
    el('an-player').innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.4)"><p>영상이 등록되지 않았습니다</p></div>`;
  }

  const count=vid.studentCount||20;
  const title=vid.title||'';

  // 영상 미니 썸네일
  const miniEl2=el('an-player-mini');
  if(miniEl2&&window._anYtId) miniEl2.innerHTML=`<img src="https://img.youtube.com/vi/${window._anYtId}/mqdefault.jpg" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">`;
  const playerFull2=el('an-player-full');
  if(playerFull2) playerFull2.style.display='none';

  // 로딩 표시
  el('an-ai-summary').textContent='AI 분석 중... 잠시만 기다려주세요';
  el('an-criteria-result').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">분석 중...</div>';
  const opEl=el('an-criteria-opinion');if(opEl) opEl.innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">분석 중...</div>';
  el('an-ai-result').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">AI 분석 중...</div>';
  el('an-ts-feed').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">평가 항목별 피드백 로딩 중...</div>';
  const ebEl=el('an-edu-bars');if(ebEl) ebEl.innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">분석 중...</div>';
  const abEl=el('an-ai-bars');if(abEl) abEl.innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">분석 중...</div>';

  showPage('page-analysis');

  // 삭제 버튼
  const delArea=el('an-delete-area');
  if(delArea){
    if(CU?.isAdmin) delArea.innerHTML=`<button class="btn" style="background:var(--t1);color:#fff;padding:10px 24px;font-size:13px;border-radius:999px" onclick="adminDeleteVideo(${vid.id})">삭제</button>`;
    else if(CU?.id===vid.userId) delArea.innerHTML=`<button class="btn" style="background:var(--t1);color:#fff;padding:10px 24px;font-size:13px;border-radius:999px" onclick="openDeleteRequest(${vid.id},'${(vid.title||'').replace(/'/g,'')}')">삭제 요청</button>`;
    else delArea.innerHTML='';
  }

  // 저장된 평가 결과 로드 (AI 재호출 금지 — 원본 데이터 보존)
  (async()=>{
    const{data:evals}=await sb.from('evaluations').select('*').eq('video_id',id).order('created_at',{ascending:false});
    const pickLatest=(t)=>(evals||[]).find(e=>e.eval_type===t);
    const critRow=pickLatest('평가안기준');
    const aiRow=pickLatest('AI독자');
    if(!critRow&&!aiRow){
      // 저장된 평가 없음 — 구 버전 영상 → 목업 모드 + 재분석 안내
      el('an-ai-summary').textContent='이전 버전 영상입니다. 재분석이 필요합니다.';
      el('an-criteria-result').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">평가 데이터 없음 — 영상을 다시 업로드하여 AI 분석을 받아주세요.</div>';
      el('an-ts-feed').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3)">평가 데이터 없음</div>';
      return;
    }
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
    const critResult=normalizeVertexResult(toVertex(critRow));
    const aiResult=normalizeVertexResult(toVertex(aiRow));
    window._lastVertexResult={crit:critResult,ai:aiResult};
    window._anVideoId=id;
    window._anCritEvalId=critRow?.id||null;  // 관리자 수정용
    window._anAiEvalId=aiRow?.id||null;      // 관리자 수정용
    const mapped=mapVertexToLegacy(critResult,aiResult);
    renderAnalysisResult(mapped,true,count);
  })();
  return;

  // ─── 이하 기존 page-video 코드 (미사용) ───
  const playerHtml=vid.youtube
    ? `<iframe src="${vid.youtube.replace('watch?v=','embed/')}" allowfullscreen></iframe>`
    : vid.filePath
      ? `<video controls src="${vid.filePath}"></video>`
      : `<div class="vid-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg><p>영상이 등록되지 않았습니다</p></div>`;

  const tsHtml=vid.timestamps.map(ts=>`
    <div class="ts-item" id="ts-${ts.id}">
      <div>
        <div class="ts-time" onclick="seekToTime('${ts.t}')">${ts.t}</div>
      </div>
      <span class="ts-badge ts-${ts.type}">${ts.type==='good'?'✅ 잘함':ts.type==='bad'?'⚠️ 취약':'💡 Tip'}</span>
      <div style="flex:1">
        <div class="ts-text" id="ts-text-${ts.id}">${ts.text}</div>
        <div class="ts-tags">${ts.tags.map(t=>`<span class="ts-tag">${t}</span>`).join('')}</div>
      </div>
      <button class="ts-edit-btn" onclick="editTs(${vid.id},${ts.id})">✏️</button>
      <button class="ts-edit-btn" onclick="deleteTs(${vid.id},${ts.id})" style="color:var(--red)">🗑️</button>
    </div>`).join('');

  el('video-main').innerHTML=`
    <div class="content-card">
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div>
        <div style="font-size:18px;font-weight:900">${vid.title}</div>
        <div style="font-size:11px;color:var(--t3)">${u.name} · ${vid.date} · ${vid.duration} · 교육생 ${vid.studentCount}명</div>
      </div>
    </div>
    <!-- Video register -->
    <div class="neu" style="border-radius:var(--r2);padding:14px 18px;margin-bottom:18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <input type="text" id="yt-url" placeholder="YouTube URL 입력 (예: https://youtube.com/watch?v=...)" style="flex:1;min-width:200px">
      <button class="btn btn-blue" onclick="registerYoutube(${vid.id})">YouTube 연결</button>
      <label class="btn btn-ghost" style="cursor:pointer">파일 업로드<input type="file" accept="video/*" style="display:none" onchange="registerFile(${vid.id},this)"></label>
      <button class="btn btn-red" onclick="startWebcam(${vid.id})">즉석 녹화</button>
    </div>
    <!-- Webcam area (hidden by default) -->
    <div id="webcam-area" style="display:none;margin-bottom:18px">
      <div class="rec-rotate-hint">📱 폰을 가로로 돌리면 더 넓게 녹화됩니다</div>
      <div class="webcam-wrap" id="webcam-wrap">
        <video id="webcam-preview" autoplay muted playsinline></video>
        <div class="rec-bar" id="rec-bar" style="display:none"><div class="rec-dot"></div><span id="rec-timer">00:00</span></div>
        <button class="cam-flip-btn" type="button" onclick="flipCamera('rec')" aria-label="카메라 전환" title="전면/후면 전환">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4h-3.2L15 2H9L7.2 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM7 17l-3-3 3-3v2h6v2H7v2zm10-1l-3-3v2H8v-2h6V9l3 3-3 3v-2z"/></svg>
        </button>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-red" id="rec-start-btn" onclick="toggleRecord(${vid.id})">녹화 시작</button>
        <button class="btn btn-ghost" onclick="stopWebcam()">닫기</button>
      </div>
    </div>
    <div class="video-layout">
      <div>
        <div class="video-player neu">${playerHtml}</div>
        <!-- Solution -->
        <div style="margin-top:16px">
          <div class="sec-lbl-sm">AI 솔루션</div>
          <div class="solution-card">${vid.solution||'영상 분석 후 AI 솔루션이 표시됩니다.'}</div>
        </div>
      </div>
      <!-- Timestamp feed with dual tabs -->
      <div>
        <div class="dual-tabs">
          <button class="dual-tab active" onclick="switchDualTab('ts-pane-criteria',this)">교육맞춤평가</button>
          <button class="dual-tab" onclick="switchDualTab('ts-pane-ai',this)">AI 종합 분석</button>
        </div>
        <div class="dual-pane active" id="ts-pane-criteria">
          <div style="border-radius:var(--r2);border:1px solid var(--bdr);padding:14px;margin-bottom:14px;background:rgba(0,120,200,.04)">
            <div style="font-size:12px;font-weight:700;color:var(--blue);margin-bottom:8px">${vid.checklist?'업로드된 교육맞춤평가':'평가안 없음 — AI 자동 분석 적용 중'}</div>
            <div style="font-size:11px;color:var(--t2);line-height:1.7">${vid.checklist||'별도 평가안이 업로드되지 않아 AI가 영상 흐름을 자체 분석합니다. 평가안을 업로드하면 해당 기준으로 재분석됩니다.'}</div>
          </div>
        </div>
        <div class="dual-pane" id="ts-pane-ai">
          <div style="font-size:11px;color:var(--t3);padding:8px 0;margin-bottom:8px">AI가 영상 흐름을 독자적으로 분석한 결과입니다.</div>
        </div>
        <div class="ts-feed neu">
          <div class="ts-hdr">
            <span style="font-size:12px;font-weight:700">타임스탬프 피드</span>
            <button class="btn btn-blue" style="padding:5px 10px;font-size:11px" onclick="openAddTs()">+ 추가</button>
          </div>
          <div class="ts-list" id="ts-list">${tsHtml||'<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">타임스탬프가 없습니다</div>'}</div>
        </div>
      </div>
    </div>
    <div class="pdf-bottom"><button class="btn btn-blue btn-pdf" onclick="window.print()">PDF 출력</button></div>
    </div>`;
  showPage('page-video');
}

function openAddTs(){ el('ts-time').value=''; el('ts-text').value=''; el('ts-tags').value=''; el('ts-overlay').classList.add('show'); }
async function saveTimestamp(){
  const vid=D.videos.find(x=>x.id===curVidId);
  if(!vid) return;
  const ts={t:v('ts-time'),type:v('ts-type'),text:v('ts-text'),tags:v('ts-tags').split(',').map(s=>s.trim()).filter(Boolean)};
  const result=await dbAddTimestamp(curVidId,ts);
  if(result){ vid.timestamps.push({id:result.id,...ts}); vid.timestamps.sort((a,b)=>a.t.localeCompare(b.t)); }
  closeOverlay('ts-overlay'); openVideo(curVidId);
}
async function editTs(vidId,tsId){
  const vid=D.videos.find(x=>x.id===vidId);
  const ts=vid.timestamps.find(x=>x.id===tsId);
  const textEl=el(`ts-text-${tsId}`);
  if(textEl.tagName==='TEXTAREA'){ ts.text=textEl.value; await dbUpdateTimestamp(tsId,ts.text); openVideo(vidId); return; }
  const ta=document.createElement('textarea');
  ta.value=ts.text; ta.id=`ts-text-${tsId}`;
  ta.style.cssText='width:100%;min-height:60px;font-size:12px;padding:6px';
  textEl.replaceWith(ta); ta.focus();
}
async function deleteTs(vidId,tsId){
  if(!confirm('삭제하시겠습니까?')) return;
  await dbDeleteTimestamp(tsId);
  const vid=D.videos.find(x=>x.id===vidId);
  vid.timestamps=vid.timestamps.filter(x=>x.id!==tsId);
  openVideo(vidId);
}
async function registerYoutube(vidId){
  const url=v('yt-url').trim();
  if(!url){ alert('URL을 입력하세요'); return; }
  await dbUpdateVideo(vidId,{youtube:url});
  const vid=D.videos.find(x=>x.id===vidId);
  vid.youtube=url; openVideo(vidId);
}
function registerFile(vidId,input){
  const vid=D.videos.find(x=>x.id===vidId);
  vid.filePath=URL.createObjectURL(input.files[0]); save(); openVideo(vidId);
}

