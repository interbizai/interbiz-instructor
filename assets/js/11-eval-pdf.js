/* 11-eval-pdf.js — 평가 결과 PDF 저장 (A4 세로 · 총 4장)
   1장: 교육맞춤평가 요약        2장: 교육맞춤평가 항목별 상세 (반반 2단)
   3장: AI 독자 분석 요약        4장: AI 독자 항목별 상세 (반반 2단)
   방식: 인쇄 전용 레이아웃을 만들어 브라우저 인쇄(→ PDF로 저장) 호출.
        별도 라이브러리 없음 · 한쪽 평가만 있으면 해당 2장만 출력.
   주의: app.css 의 전역 @media print 가 *{overflow:visible;max-height:none}!important 를
        걸므로, 여기의 모든 규칙은 더 높은 특이도 + !important 로 이긴다. */

function _pdfEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _pdfTxt(o){ if(o==null) return ''; if(typeof o==='string') return o; return o.text||o.point||o.content||o.desc||o.item||o.title||''; }
function _pdfColor(score,max){
  const r=max>0?score/max:0;
  return (typeof scoreColorFromRatio==='function')?scoreColorFromRatio(r):(r>=0.7?'#10b981':r>=0.5?'#f59e0b':'#ef4444');
}
// 화면 헤더에서 강의 제목·강사·교육종류를 그대로 읽는다 (별도 상태 관리 불필요)
function _pdfMeta(){
  const g=id=>document.getElementById(id)?.textContent?.replace(/\s+/g,' ').trim()||'';
  const d=new Date();
  return {
    title: g('an-result-title')||'강의 영상 평가',
    person: g('an-result-meta-top'),
    edu: g('an-result-meta'),
    date: `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
  };
}

/* ── 요약 페이지 (1장·3장) ─────────────────────────────── */
function _pdfSummaryPage(r,label,accent,meta){
  const cats=Array.isArray(r.categories)?r.categories:[];
  const bars=cats.map(c=>{
    const p=c.max>0?Math.round(c.score/c.max*100):0;
    const cc=_pdfColor(c.score,c.max);
    return `<div class="pp-bar-row">
      <span class="pp-bar-name">${_pdfEsc(c.name)}</span>
      <span class="pp-bar-track"><span class="pp-bar-fill" style="width:${p}%;background:${cc}"></span></span>
      <span class="pp-bar-pct" style="color:${cc}">${p}%</span>
      <span class="pp-bar-score">${c.score}/${c.max}</span>
    </div>`;
  }).join('');
  const list=(arr,n)=>{
    const items=(Array.isArray(arr)?arr:[]).map(_pdfTxt).filter(Boolean).slice(0,n);
    return items.length?items.map(t=>`<li>${_pdfEsc(t)}</li>`).join(''):'<li class="pp-none">해당 내용 없음</li>';
  };
  const opinion=r.summary_opinion
    ?`<div class="pp-box"><div class="pp-box-t">종합 의견</div><div class="pp-opinion">${_pdfEsc(r.summary_opinion)}</div></div>`:'';
  return `<div class="pdf-page">
    <div class="pp-head" style="border-color:${accent}">
      <div>
        <div class="pp-brand">인터PICK · AI 역량 평가 리포트</div>
        <div class="pp-title" style="color:${accent}">${label}</div>
      </div>
      <div class="pp-score-wrap"><span class="pp-score" style="color:${accent}">${r.overall_score??0}</span><span class="pp-score-max">/100</span></div>
    </div>
    <table class="pp-meta">
      <tr><th>강의 제목</th><td>${_pdfEsc(meta.title)}</td><th>강사</th><td>${_pdfEsc(meta.person||'-')}</td></tr>
      <tr><th>교육종류</th><td>${_pdfEsc(meta.edu||'-')}</td><th>출력일</th><td>${meta.date}</td></tr>
    </table>
    <div class="pp-box"><div class="pp-box-t">대항목별 달성도</div>${bars||'<div class="pp-none">데이터 없음</div>'}</div>
    <div class="pp-2col">
      <div class="pp-box"><div class="pp-box-t" style="color:#10b981">잘한 점</div><ul class="pp-ul">${list(r.good,4)}</ul></div>
      <div class="pp-box"><div class="pp-box-t" style="color:#ef4444">아쉬운 점</div><ul class="pp-ul">${list(r.bad,4)}</ul></div>
    </div>
    <div class="pp-box"><div class="pp-box-t" style="color:#0078C8">개선 제안</div><ul class="pp-ul">${list(r.upgrade,3)}</ul></div>
    ${opinion}
    <div class="pp-foot">본 리포트는 AI 분석 결과입니다 · 5단계 채점 기준: 5점 매우 우수(100%) · 4점 우수(80%) · 3점 보통(60%) · 2점 미흡(40%) · 1점 매우 미흡(20%)</div>
  </div>`;
}

/* ── 상세 페이지 (2장·4장) — 항목을 반반 나눠 좌/우 2단 ── */
function _pdfItemCard(s,idx){
  const max=Number(s.max||0), sc=Number(s.score||0);
  const isNa=s.level==='na';
  const cc=isNa?'#94a3b8':_pdfColor(sc,max);
  const lv=(s.level_score>=1&&s.level_score<=5)?`${s.level_score}점 ${s.level_name||''}`.trim():(s.manual?'수기 조정':'');
  const pill=isNa?'해당없음':`${sc}/${max}${lv?' · '+lv:''}`;
  return `<div class="pp-item">
    <div class="pp-item-h">
      <span class="pp-item-no">${idx}</span>
      <span class="pp-item-name">${_pdfEsc(s.sub_item||'-')}</span>
      <span class="pp-pill" style="background:${cc}1a;color:${cc};border:1px solid ${cc}66">${pill}</span>
    </div>
    ${s.criterion?`<div class="pp-item-cri">${_pdfEsc(s.criterion)}</div>`:''}
    ${s.timestamp?`<div class="pp-item-ts">영상 시점 ${_pdfEsc(s.timestamp)}</div>`:''}
    ${s.analysis?`<div class="pp-item-ana">${_pdfEsc(s.analysis)}</div>`:''}
    ${(!isNa&&s.solution)?`<div class="pp-item-sol">솔루션: ${_pdfEsc(s.solution)}</div>`:''}
  </div>`;
}
function _pdfDetailPage(r,label,accent,meta){
  const subs=Array.isArray(r.sub_scores)?r.sub_scores:[];
  const half=Math.ceil(subs.length/2);
  const tight=half>8?' tight':'';   // 항목 17개 이상이면 더 압축 (한 장 유지)
  const col=(arr,off)=>arr.map((s,i)=>_pdfItemCard(s,off+i+1)).join('');
  return `<div class="pdf-page">
    <div class="pp-head pp-head-sm" style="border-color:${accent}">
      <div class="pp-title-sm" style="color:${accent}">${label} — 항목별 상세 (${subs.length}개)</div>
      <div class="pp-head-r">${_pdfEsc(meta.title)} · ${meta.date}</div>
    </div>
    <div class="pp-detail-cols${tight}">
      <div class="pp-col">${col(subs.slice(0,half),0)}</div>
      <div class="pp-col">${col(subs.slice(half),half)}</div>
    </div>
  </div>`;
}

/* ── 인쇄 전용 CSS ─────────────────────────────────────── */
const _EVAL_PDF_CSS=`
#eval-pdf-root{display:none}
@media print{
  @page{size:A4 portrait;margin:0}
  body.eval-pdf-mode>*:not(#eval-pdf-root){display:none!important}
  body.eval-pdf-mode #eval-pdf-root{display:block!important}
  body.eval-pdf-mode #eval-pdf-root .pdf-page{position:relative;width:210mm!important;height:296mm!important;overflow:hidden!important;box-sizing:border-box;padding:11mm 10mm 13mm;page-break-after:always;background:#fff;color:#1a202c;font-family:'Pretendard',-apple-system,'Malgun Gothic',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body.eval-pdf-mode #eval-pdf-root .pdf-page:last-child{page-break-after:auto}
  body.eval-pdf-mode #eval-pdf-root .pp-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1mm solid;padding-bottom:3mm;margin-bottom:5mm}
  body.eval-pdf-mode #eval-pdf-root .pp-brand{font-size:9pt;color:#64748b;font-weight:700;letter-spacing:.4px}
  body.eval-pdf-mode #eval-pdf-root .pp-title{font-size:16pt;font-weight:900;margin-top:1mm}
  body.eval-pdf-mode #eval-pdf-root .pp-score-wrap{display:flex;align-items:baseline;gap:1mm}
  body.eval-pdf-mode #eval-pdf-root .pp-score{font-size:30pt;font-weight:900;line-height:1}
  body.eval-pdf-mode #eval-pdf-root .pp-score-max{font-size:11pt;color:#94a3b8;font-weight:700}
  body.eval-pdf-mode #eval-pdf-root .pp-meta{width:100%;border-collapse:collapse;margin-bottom:5mm;font-size:9pt}
  body.eval-pdf-mode #eval-pdf-root .pp-meta th{background:#f8fafc;border:1px solid #e2e8f0;padding:2mm 3mm;width:22mm;text-align:left;color:#475569;font-weight:700}
  body.eval-pdf-mode #eval-pdf-root .pp-meta td{border:1px solid #e2e8f0;padding:2mm 3mm;font-weight:700}
  body.eval-pdf-mode #eval-pdf-root .pp-box{border:1px solid #e2e8f0;border-radius:2mm;padding:3mm 4mm;margin-bottom:4mm}
  body.eval-pdf-mode #eval-pdf-root .pp-box-t{font-size:10pt;font-weight:900;margin-bottom:2mm;color:#1a202c}
  body.eval-pdf-mode #eval-pdf-root .pp-bar-row{display:flex;align-items:center;gap:2mm;margin-bottom:1.8mm;font-size:8.5pt}
  body.eval-pdf-mode #eval-pdf-root .pp-bar-name{width:36mm;font-weight:700;white-space:nowrap;overflow:hidden!important;text-overflow:ellipsis}
  body.eval-pdf-mode #eval-pdf-root .pp-bar-track{flex:1;height:3mm;background:#f1f5f9;border-radius:1.5mm;overflow:hidden!important;display:block}
  body.eval-pdf-mode #eval-pdf-root .pp-bar-fill{display:block;height:100%;border-radius:1.5mm}
  body.eval-pdf-mode #eval-pdf-root .pp-bar-pct{width:10mm;text-align:right;font-weight:800}
  body.eval-pdf-mode #eval-pdf-root .pp-bar-score{width:13mm;text-align:right;color:#64748b}
  body.eval-pdf-mode #eval-pdf-root .pp-2col{display:flex;gap:4mm}
  body.eval-pdf-mode #eval-pdf-root .pp-2col .pp-box{flex:1}
  body.eval-pdf-mode #eval-pdf-root .pp-ul{margin:0;padding-left:4mm;font-size:8.5pt;line-height:1.55}
  body.eval-pdf-mode #eval-pdf-root .pp-ul li{margin-bottom:1mm}
  body.eval-pdf-mode #eval-pdf-root .pp-none{color:#94a3b8;list-style:none;font-size:8.5pt}
  body.eval-pdf-mode #eval-pdf-root .pp-opinion{font-size:8.5pt;line-height:1.55;display:-webkit-box;-webkit-line-clamp:7;-webkit-box-orient:vertical;overflow:hidden!important;max-height:32mm!important}
  body.eval-pdf-mode #eval-pdf-root .pp-foot{position:absolute;left:10mm;right:10mm;bottom:6mm;font-size:7pt;color:#94a3b8;text-align:center}
  body.eval-pdf-mode #eval-pdf-root .pp-head-sm{align-items:center;padding-bottom:2.5mm;margin-bottom:4mm;border-bottom-width:.7mm}
  body.eval-pdf-mode #eval-pdf-root .pp-title-sm{font-size:12pt;font-weight:900}
  body.eval-pdf-mode #eval-pdf-root .pp-head-r{font-size:8pt;color:#64748b;max-width:80mm;white-space:nowrap;overflow:hidden!important;text-overflow:ellipsis}
  body.eval-pdf-mode #eval-pdf-root .pp-detail-cols{display:flex;gap:4mm}
  body.eval-pdf-mode #eval-pdf-root .pp-col{flex:1;min-width:0}
  body.eval-pdf-mode #eval-pdf-root .pp-item{border:1px solid #e8edf3;border-radius:1.5mm;padding:2mm 2.5mm;margin-bottom:2mm}
  body.eval-pdf-mode #eval-pdf-root .pp-item-h{display:flex;align-items:center;gap:1.5mm;margin-bottom:1mm}
  body.eval-pdf-mode #eval-pdf-root .pp-item-no{font-size:7.5pt;font-weight:800;color:#94a3b8;min-width:4mm}
  body.eval-pdf-mode #eval-pdf-root .pp-item-name{font-size:8.5pt;font-weight:800;flex:1;white-space:nowrap;overflow:hidden!important;text-overflow:ellipsis}
  body.eval-pdf-mode #eval-pdf-root .pp-pill{font-size:7.5pt;font-weight:800;padding:.6mm 2mm;border-radius:99px;white-space:nowrap}
  body.eval-pdf-mode #eval-pdf-root .pp-item-cri{font-size:7.5pt;color:#64748b;line-height:1.4;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden!important;max-height:4.2mm!important;margin-bottom:.8mm}
  body.eval-pdf-mode #eval-pdf-root .pp-item-ts{font-size:7pt;color:#0078C8;font-weight:700;margin-bottom:.8mm}
  body.eval-pdf-mode #eval-pdf-root .pp-item-ana{font-size:7.5pt;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden!important;max-height:8.5mm!important}
  body.eval-pdf-mode #eval-pdf-root .pp-item-sol{font-size:7.5pt;color:#b91c1c;line-height:1.4;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden!important;max-height:4.2mm!important;margin-top:.8mm}
  body.eval-pdf-mode #eval-pdf-root .pp-detail-cols.tight .pp-item-cri{display:none}
  body.eval-pdf-mode #eval-pdf-root .pp-detail-cols.tight .pp-item-ana{-webkit-line-clamp:1;max-height:4.3mm!important}
  body.eval-pdf-mode #eval-pdf-root .pp-detail-cols.tight .pp-item{padding:1.5mm 2mm;margin-bottom:1.5mm}
}`;

/* ── 실행 ──────────────────────────────────────────────── */
function downloadEvalPdf(){
  const crit=window._lastVertexResult?.crit;
  const ai=window._lastVertexResult?.ai;
  if(!crit&&!ai){ alert('저장할 평가 결과가 없습니다. 분석을 먼저 실행하거나 과거 영상을 열어주세요.'); return; }
  const meta=_pdfMeta();
  let pages='';
  if(crit){
    pages+=_pdfSummaryPage(crit,'교육맞춤평가 (평가안 기준)','#9f1239',meta);
    pages+=_pdfDetailPage(crit,'교육맞춤평가','#9f1239',meta);
  }
  if(ai){
    pages+=_pdfSummaryPage(ai,'AI 독자 분석','#e8590c',meta);
    pages+=_pdfDetailPage(ai,'AI 독자 분석','#e8590c',meta);
  }
  if(!document.getElementById('eval-pdf-style')){
    const st=document.createElement('style');
    st.id='eval-pdf-style';
    st.textContent=_EVAL_PDF_CSS;
    document.head.appendChild(st);
  }
  document.getElementById('eval-pdf-root')?.remove();
  const root=document.createElement('div');
  root.id='eval-pdf-root';
  root.innerHTML=pages;
  document.body.appendChild(root);
  document.body.classList.add('eval-pdf-mode');
  const cleanup=()=>{
    document.body.classList.remove('eval-pdf-mode');
    root.remove();
    window.removeEventListener('afterprint',cleanup);
  };
  window.addEventListener('afterprint',cleanup);
  // 인쇄 대화상자에서 '대상: PDF로 저장' 선택 → A4 세로 4장
  setTimeout(()=>window.print(),80);
}
