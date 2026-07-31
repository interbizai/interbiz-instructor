import { VertexAI } from '@google-cloud/vertexai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Vercel PRO 플랜 — 300초 한도 (5분)
export const config = { maxDuration: 300 };

// 한도(300초)를 넘기면 Vercel 이 함수를 죽여 클라이언트가 504 만 받고 결과는 사라진다.
// 이 시각을 넘겼으면 추가 Gemini 호출을 하지 않고 지금까지 받은 결과로 마무리한다.
const PARSE_RETRY_DEADLINE_MS = 170 * 1000;

const JWT_SECRET = process.env.JWT_SECRET;
const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbAdmin = SB_URL && SB_SERVICE_KEY ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } }) : null;

// 채점 로직/프롬프트를 바꿀 때마다 올린다 → 예전 캐시(후한 점수)가 재사용되는 것을 차단
const PROMPT_VERSION = 'v2-5level-strict-2026-07-30';

function makeCacheKey({ video_gcs_uri, video_url, checklist_items, eval_type, edu_file_url, edu_text, model }) {
  const h = crypto.createHash('sha256');
  h.update(PROMPT_VERSION);
  h.update('|');
  h.update(String(video_gcs_uri || video_url || ''));
  h.update('|');
  h.update(JSON.stringify(checklist_items || []));
  h.update('|');
  h.update(String(eval_type || ''));
  h.update('|');
  h.update(String(edu_file_url || ''));
  h.update('|');
  h.update(String(edu_text || '').slice(0, 20000));
  h.update('|');
  h.update(String(model || 'gemini-2.5-pro'));
  return h.digest('hex');
}

// F3 v2: Vertex AI rate-limit 보호 — 60초 maxDuration 안에서 안전한 짧은 백오프
//   기존 합 49초 → 504 timeout 원인. 합 4초로 단축, 재시도 4회 → 2회
//   첫 시도 실패 시 1회만 짧게 재시도. 그래도 안 되면 클라이언트가 재시도 (callVertexAnalyze 에 자체 retry 있음)
async function generateContentWithBackoff(gm, request, maxAttempts = 2) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await gm.generateContent(request);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e || '');
      const isRateLimit = /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg);
      if (!isRateLimit || attempt === maxAttempts - 1) throw e;
      // 백오프 1.5초 + jitter (총 합 2.5초 이내) — 60초 한도 안에서 안전
      const base = 1500;
      const jitter = Math.floor(Math.random() * 1000);
      console.warn(`[vertex] rate-limit detected, attempt ${attempt + 1}/${maxAttempts}, backoff ${base + jitter}ms`);
      await new Promise((r) => setTimeout(r, base + jitter));
    }
  }
  throw lastErr;
}

function verifyAuth(req) {
  if (!JWT_SECRET) return { ok: false, error: '서버 설정 오류' };
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { ok: false, error: '인증이 필요합니다. 다시 로그인해주세요.' };
  try {
    return { ok: true, decoded: jwt.verify(token, JWT_SECRET) };
  } catch (e) {
    return { ok: false, error: '인증 만료. 다시 로그인해주세요.' };
  }
}

// ── AI 코칭 중지 스위치 (비용 관리) ──────────────────────
// 관리자가 [관리자 → 금액 현황] 에서 중지하면 여기서도 막는다.
// 화면 쪽만 막으면 브라우저 개발자도구로 우회해 비용이 새므로 서버가 최종 판정.
// 관리자(sub===0) 는 점검용으로 통과시킨다.
async function isAiCoachingBlocked(decoded) {
  if (!sbAdmin) return false;
  if (decoded && decoded.sub === 0) return false;          // 관리자는 예외
  const org = decoded && decoded.org ? String(decoded.org) : '';
  const key = org ? `ai_coaching_blocked_${org}` : 'ai_coaching_blocked';
  try {
    const { data, error } = await sbAdmin.from('app_settings').select('value').eq('key', key).maybeSingle();
    if (error) return false;                                // 조회 실패 시 막지 않음 (서비스 중단 방지)
    return String(data?.value || '0') === '1';
  } catch (e) {
    return false;
  }
}

// ── 교육자료 파일 타입별 처리 ──────────────
// Gemini가 직접 처리 가능: PDF, 이미지, 텍스트 → fileData로 전달
// Word/Excel/PowerPoint는 미지원 → 서버에서 텍스트 추출 후 텍스트로 전달
const GEMINI_DIRECT_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/html',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

async function extractTextFromDocx(buffer) {
  const r = await mammoth.extractRawText({ buffer });
  return r.value || '';
}
function extractTextFromXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return wb.SheetNames.map((n) => {
    const ws = wb.Sheets[n];
    return `# Sheet: ${n}\n${XLSX.utils.sheet_to_csv(ws)}`;
  }).join('\n\n');
}
// .pptx — 각 슬라이드 XML에서 텍스트 추출
async function extractTextFromPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a,b)=>{
    const na=parseInt(a.match(/slide(\d+)/)[1]); const nb=parseInt(b.match(/slide(\d+)/)[1]); return na-nb;
  });
  const out = [];
  for (const f of slideFiles) {
    const xml = await zip.file(f).async('string');
    const texts = [];
    const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const t = m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").trim();
      if (t) texts.push(t);
    }
    if (texts.length) out.push(`# Slide ${slideFiles.indexOf(f)+1}\n${texts.join('\n')}`);
  }
  return out.join('\n\n');
}
// 서버가 안전하게 내려받아 풀 수 있는 상한 (Vercel 함수 메모리 한도 고려)
// 이보다 큰 교안은 브라우저에서 텍스트를 추출해 edu_text 로 보내야 한다.
const EDU_SERVER_MAX_MB = 60;

async function fetchEduMaterial(url, mime) {
  if (!url) return { kind: 'none' };
  // Gemini 직접 처리 가능한 타입은 fileData URL 그대로
  if (GEMINI_DIRECT_MIMES.has(mime)) return { kind: 'fileData', mime, url };
  // Word/Excel/PowerPoint는 서버에서 텍스트 추출
  const r = await fetch(url);
  if (!r.ok) throw new Error(`교육자료 다운로드 실패: ${r.status}`);
  // 대용량 방어 — 함수 메모리를 넘기면 분석 전체가 죽으므로 여기서 건너뛴다
  const declared = Number(r.headers.get('content-length') || 0);
  if (declared && declared > EDU_SERVER_MAX_MB * 1024 * 1024) {
    console.warn(`[vertex] 교육자료 ${Math.round(declared / 1024 / 1024)}MB — 서버 추출 상한(${EDU_SERVER_MAX_MB}MB) 초과, 건너뜀`);
    return { kind: 'too_large', mb: Math.round(declared / 1024 / 1024) };
  }
  const ab = await r.arrayBuffer();
  const buf = Buffer.from(ab);
  if (buf.byteLength > EDU_SERVER_MAX_MB * 1024 * 1024) {
    console.warn(`[vertex] 교육자료 ${Math.round(buf.byteLength / 1024 / 1024)}MB — 서버 추출 상한 초과, 건너뜀`);
    return { kind: 'too_large', mb: Math.round(buf.byteLength / 1024 / 1024) };
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword' ||
    /\.docx?$/i.test(url)
  ) {
    const text = await extractTextFromDocx(buf);
    return { kind: 'text', label: '[교육자료 — Word]', text };
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    /\.xlsx?$/i.test(url)
  ) {
    const text = extractTextFromXlsx(buf);
    return { kind: 'text', label: '[교육자료 — Excel]', text };
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.ms-powerpoint' ||
    /\.pptx?$/i.test(url)
  ) {
    const text = await extractTextFromPptx(buf);
    return { kind: 'text', label: '[교육자료 — PowerPoint]', text };
  }
  // 기타 미지원 → 스킵
  return { kind: 'unsupported', mime };
}

function getCredentials() {
  const credJson = process.env.GCP_CREDENTIALS_JSON;
  if (credJson) {
    try {
      const p = JSON.parse(credJson);
      return {
        project_id: p.project_id,
        client_email: p.client_email,
        private_key: (p.private_key || '').replace(/\\n/g, '\n'),
      };
    } catch (e) {}
  }
  return {
    project_id: process.env.GCP_PROJECT_ID,
    client_email: process.env.GCP_CLIENT_EMAIL,
    private_key: (process.env.GCP_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

// ── 5단계 앵커 채점 체계 ────────────────────────────────
// 엑셀 평가표의 5점/4점/3점/2점/1점 기준 문장을 그대로 AI 에게 앵커(기준점)로 주입한다.
// 점수 환산(표준형): 3점 = 배점의 60% → 전 항목 보통이면 총점 60점(C등급)
const LEVEL_RATIO = { 5: 1.0, 4: 0.8, 3: 0.6, 2: 0.4, 1: 0.2 };
const LEVEL_NAME = { 5: '매우 우수', 4: '우수', 3: '보통', 2: '미흡', 1: '매우 미흡' };
// 엑셀에 세부 기준이 없는 항목 · AI 독자 평가에서 쓰는 범용 앵커
const GENERIC_LEVELS = {
  '5': '교과서적 시범강의 수준으로 완벽히 수행. 신입 강사 교육 교재에 그대로 실어도 되는 장면이 있음',
  '4': '기대 수준을 확실히 넘김. 의도적으로 설계한 흔적이 보이나 완벽하지는 않음',
  '3': '기본은 했음. 큰 문제도 없고 인상적이지도 않은 평균적 수행',
  '2': '시도는 있었으나 형식적이거나 오류·누락이 있어 전달 목적을 충분히 달성하지 못함',
  '1': '거의 수행되지 않았거나 잘못 수행되어 개선이 시급함',
};

function normalizeLevels(raw) {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (e) { return null; }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  for (const n of [5, 4, 3, 2, 1]) {
    const v = obj[String(n)] ?? obj[n];
    if (v && String(v).trim()) out[String(n)] = String(v).trim();
  }
  return Object.keys(out).length >= 2 ? out : null;
}

// 분포 상한 — 항목 수 기준으로 5점/(4+5)점 개수 제한
function distributionCaps(n) {
  return { cap5: Math.max(1, Math.floor(n * 0.2)), cap45: Math.max(2, Math.floor(n * 0.5)) };
}

// 5단계 앵커 채점 규칙 블록 (평가안기준 · AI독자 공통)
function buildScoringRules(itemCount, levelsMode) {
  const { cap5, cap45 } = distributionCaps(itemCount || 15);
  const anchorNote = {
    all: '   · 각 항목의 levels 는 이 조직이 실제로 쓰는 평가표 원문이다. 임의로 해석하거나 완화하지 말고 문장 그대로 적용하라.',
    mixed: `   · levels_source 가 "조직 평가표 원문" 인 항목은 그 문장을 그대로, 글자 그대로 적용하라 (완화·재해석 금지).
   · levels_source 가 "범용 기준" 인 항목은 조직이 세부 기준을 정하지 않은 항목이다.
     이 경우 범용 기준을 그 항목의 criterion(평가 기준)과 detail(기준 상세)에 맞춰 해석해 적용하라.
     기준이 없다고 해서 후하게 주지 말 것 — 판단 근거는 똑같이 영상 속 관찰과 MM:SS 인용이다.`,
    none: `   · 이 평가안에는 조직이 정한 5단계 세부 기준이 없다. 아래 levels 는 범용 기준이다.
     각 항목의 criterion(평가 기준)과 detail(기준 상세)을 그 항목의 실질 기준으로 삼고,
     범용 levels 를 거기에 맞춰 해석해 적용하라.
     세부 기준이 없다는 이유로 점수를 후하게 주는 것은 금지한다. 채점 강도는 동일하다.`,
  }[levelsMode || 'none'];
  return `# 채점 방식 — 5단계 앵커 채점 (이 순서를 반드시 지켜라)
각 세부항목마다:
1) 영상에서 그 항목에 해당하는 장면을 찾아 MM:SS 와 강사의 실제 발화를 인용한다.
2) 그 장면을 아래 체크리스트의 levels(5점~1점 기준 문장)와 한 줄씩 대조한다.
3) 근거가 실제로 충족하는 가장 높은 단계를 level_score(1~5 정수)로 정한다.
4) evidence 에 "몇 점 기준 문장의 어느 부분을 무엇으로 충족했는지"를 MM:SS 인용과 함께 적는다.
5) score(점수 숫자)는 서버가 level_score 로 자동 환산한다. 너는 level_score 만 정확히 정하면 된다.
${anchorNote}

# ⛔ 캘리브레이션 — 점수 인플레이션 금지 (이 규칙이 다른 모든 규칙보다 우선한다)
1) **모든 항목의 출발점은 3점(보통)이다.** 근거 인용 없이 4점 이상을 준 항목은 오답으로 간주한다.
2) 4점 이상은 evidence 에 MM:SS 인용이 반드시 있어야 한다. 인용이 없으면 3점 이하로 내려라.
3) 5점은 "이 장면을 신입 강사 교육 교재에 그대로 실을 수 있는가?"에 '예'라고 답할 수 있을 때만.
   "잘했다", "무난했다", "문제 없었다" 수준은 5점이 아니라 3점이다.
4) **분포 기준선 (총 ${itemCount}개 항목 기준)**
   · 5점: ${cap5}개 이내가 정상
   · 4점 + 5점 합계: ${cap45}개 이내가 정상
   · **이 기준선을 넘겨도 된다. 단, 넘기는 항목마다 evidence 에 "5점(또는 4점) 기준 문장의 어느 부분을
     영상 MM:SS 의 무엇으로 충족했는지"가 반드시 적혀 있어야 한다.**
   · 근거 인용 없이 기준선을 넘긴 항목은 서버가 자동으로 강등한다. 즉 근거 없는 고득점은 무의미하다.
   · 정말 뛰어난 강의라면 기준선을 넘겨 90점대가 나와도 된다. 다만 근거로 증명하라.
   · 반대로 근거를 못 대겠으면 미련 없이 3점으로 내려라.
5) 전 항목이 4~5점이거나 전 항목이 동일 점수면 **관찰 실패**로 간주한다. 반드시 잘한 항목과 못한 항목이 갈려야 한다.
6) 강사가 그 항목을 **아예 하지 않았다면 1점**이다. "관찰되지 않았다"를 이유로 na 처리하지 말 것.
7) na(해당없음)는 오직 **영상 자체가 그 항목을 담을 수 없는 경우**에만 쓴다.
   · na 허용 예: 수강생이 화면·소리에 전혀 등장하지 않아 '수강생 반응 관찰' 을 물리적으로 확인할 방법이 없음
   · na 금지 예: 강사가 참여 유도를 하지 않았다 → 이것은 1점이다
   · na 금지 예: 시간이 짧아 판단이 애매하다 → 관찰된 만큼만 보고 2~3점을 주어라
8) level(good/normal/bad)은 level_score 에서 자동으로 정한다: 5·4점 → "good" / 3점 → "normal" / 2·1점 → "bad"
9) 점수 환산표 (참고용, 계산은 서버가 함): 5점=배점의 100% / 4점=80% / 3점=60% / 2점=40% / 1점=20%
   → 전 항목 3점이면 총점 60점이다. 60점은 '보통'이며 정상적인 결과다. 총점을 높이려고 점수를 올리지 마라.`;
}

// ── 서버측 채점 확정 ────────────────────────────────
// AI 가 캘리브레이션 규칙을 어겨도 여기서 되돌린다 (프롬프트만으로는 인플레이션이 완전히 안 잡힘)
//  1) level_score(1~5) 정규화 — 누락 시 score/max 비율에서 역산
//  2) 분포 상한 강제 — 근거(evidence) 없는 항목부터 강등
//  3) score = 배점 × 환산비율, level = good/normal/bad 확정
//  4) 대항목/총점 재계산 (na 는 분자·분모 모두에서 제외)
function enforceScoring(parsed) {
  if (!parsed || !Array.isArray(parsed.sub_scores) || !parsed.sub_scores.length) return parsed;
  const subs = parsed.sub_scores;
  const scored = subs.filter((s) => s.level !== 'na');

  // 1) level_score 정규화
  for (const s of scored) {
    let ls = Math.round(Number(s.level_score));
    if (!(ls >= 1 && ls <= 5)) {
      const max = Number(s.max) || 5;
      const ratio = max > 0 ? Number(s.score || 0) / max : 0;
      ls = ratio >= 0.95 ? 5 : ratio >= 0.75 ? 4 : ratio >= 0.55 ? 3 : ratio >= 0.3 ? 2 : 1;
    }
    s.level_score = ls;
  }

  // 2) 분포 상한 강제 — 근거가 빈약한 항목부터 끌어내린다
  const { cap5, cap45 } = distributionCaps(scored.length || 15);
  const hasTime = (s) => /\d{1,2}:\d{2}/.test(String(s.evidence || '') + ' ' + String(s.timestamp || ''));
  const weakness = (s) => (String(s.evidence || '').trim() ? 0 : 2) + (hasTime(s) ? 0 : 1);
  // ⚠ 상한을 넘었다고 무조건 깎지 않는다.
  //   근거(evidence + MM:SS 인용)가 부실한 항목만 끌어내린다.
  //   → 근거가 확실한 고득점은 살아남으므로, 진짜 잘한 강의는 90점대도 나올 수 있다.
  //     반대로 "그냥 잘했다" 식의 무근거 고득점은 전부 강등된다.
  const demote = (pred, cap, target) => {
    const hits = scored.filter(pred);
    let over = hits.length - cap;
    if (over <= 0) return 0;
    const weak = hits.filter((s) => weakness(s) > 0).sort((a, b) => weakness(b) - weakness(a));
    let n = 0;
    for (const s of weak) {
      if (over <= 0) break;
      s.level_score = target;
      s.score_capped = true;
      over--; n++;
    }
    return n;
  };
  const capped5 = demote((s) => s.level_score === 5, cap5, 4);
  const capped45 = demote((s) => s.level_score >= 4, cap45, 3);

  // 3) score / level 확정
  for (const s of subs) {
    if (s.level === 'na') { s.level_score = 0; s.score = 0; s.level_name = '해당없음'; continue; }
    const max = Number(s.max) || 0;
    const ls = s.level_score;
    s.score = Math.round(max * (LEVEL_RATIO[ls] || 0));
    s.level = ls >= 4 ? 'good' : ls === 3 ? 'normal' : 'bad';
    s.level_name = LEVEL_NAME[ls] || '';
  }

  // 4) 대항목 · 총점 재계산 (na 제외)
  const order = [];
  const catMap = new Map();
  for (const s of subs) {
    const k = s.category || '기타';
    if (!order.includes(k)) order.push(k);
    if (s.level === 'na') continue;
    if (!catMap.has(k)) catMap.set(k, { name: k, score: 0, max: 0 });
    const c = catMap.get(k);
    c.score += Number(s.score || 0);
    c.max += Number(s.max || 0);
  }
  const categories = order.filter((k) => catMap.has(k)).map((k) => {
    const c = catMap.get(k);
    return { name: k, score: c.score, max: c.max, achievement: c.max > 0 ? Math.round((c.score / c.max) * 100) : 0 };
  });
  const totalScore = categories.reduce((a, c) => a + c.score, 0);
  const totalMax = categories.reduce((a, c) => a + c.max, 0);

  // 실제 분포 재집계
  const dist = { '5점': 0, '4점': 0, '3점': 0, '2점': 0, '1점': 0, na: 0 };
  for (const s of subs) {
    if (s.level === 'na') dist.na++;
    else if (s.level_score >= 1 && s.level_score <= 5) dist[`${s.level_score}점`]++;
  }

  return {
    ...parsed,
    categories,
    overall_score: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0,
    score_distribution: dist,
    scoring_meta: {
      version: PROMPT_VERSION,
      ratio: LEVEL_RATIO,
      caps: { cap5, cap45, item_count: scored.length },
      capped: { from5to4: capped5, from4to3: capped45 },
    },
  };
}

function buildPrompt({ checklistItems, evalType, hasEduMaterial, autoRubric }) {
  // 등록된 평가안이 있으면(autoRubric 아님) 그 5단계 세부 기준표를 앵커로 쓴다.
  //   · 세부 기준표가 없는 항목은 범용 앵커(GENERIC_LEVELS)로 대체 — 채점 자체는 동일하게 동작
  //   · 한 체크리스트 안에 있는 항목/없는 항목이 섞여 있어도 항목별로 알맞게 처리
  // AI 독자(자동 평가안)는 조직 기준을 일부러 보지 않으므로 항상 범용 앵커.
  const useCustomLevels = !autoRubric;
  let customCount = 0;
  const checklistSpec = (checklistItems || []).map((it, i) => {
    const custom = useCustomLevels ? normalizeLevels(it.levels) : null;
    if (custom) customCount++;
    return {
      n: i + 1,
      category: it.category,
      sub_item: it.sub_item,
      criterion: it.criterion,
      max_score: it.max_score,
      detail: it.detail || '',
      scale: it.scale_max || 5,
      levels_source: custom ? '조직 평가표 원문' : '범용 기준',
      levels: custom || GENERIC_LEVELS,
    };
  });
  const totalCount = checklistSpec.length;
  const levelsMode = customCount === 0 ? 'none' : (customCount === totalCount ? 'all' : 'mixed');

  const evalContext =
    evalType === '평가안기준'
      ? `당신은 **세계적인 가전 전문 강사**입니다. 수십 년간 대기업 영업/현장 판매 강사를 코칭하며 세일즈 현장의 맥락·고객 언어·시나리오 기반 역할극의 효과를 깊이 이해해왔으며, 평가는 엄격하면서도 실전 코칭 가치를 최우선에 둡니다. 업로드된 영상과 교육자료(시나리오/평가안 — PDF/Word/Excel/PowerPoint 중 하나, 자유양식)를 모두 세세히 읽고 이해한 뒤 아래 체크리스트 기준으로 평가합니다.

교육자료 활용 필수 규칙:
1) 교육자료의 핵심 목표/핵심 메시지/핵심 키워드를 먼저 파악
2) 영상 강사가 그 목표와 키워드를 실제로 전달했는지 대조
3) 교육자료와 영상의 어긋난 부분(빠진 내용/추가된 내용/왜곡)을 구체적으로 지적
4) analysis에 "교육자료에서는 ○○을 다루지만 영상에서는 △△으로 전달되었다"처럼 명시적으로 비교
5) rubric_alignment_score는 아래 기준으로 엄격하게 채점 — 대부분의 교육자료는 70 이하가 정상:
   - 90-100: 교육자료가 체크리스트 20개 항목 전부와 1:1 매칭되고, 각 항목에 대한 구체적 가이드/스크립트가 포함됨 (매우 드묾)
   - 70-89: 체크리스트 항목의 70% 이상을 커버하고, 구조화된 목차/핵심 키워드가 명확함
   - 50-69: 절반 정도 커버. 핵심은 있으나 세부 기준과 매칭이 느슨함
   - 30-49: 교육자료가 영상 주제와 관련은 있으나, 평가 기준으로 활용하기 어려움 (자유양식이라 구조 부족)
   - 10-29: 교육자료 내용이 빈약하거나 영상 내용과 괴리가 큼
   - 0-9: 교육자료가 비어있거나 전혀 무관한 내용
6) 교육자료가 전달되지 않았거나 텍스트가 비어있으면 반드시 0
7) 95% 이상은 교육자료가 완벽한 교안+대본+평가기준을 모두 포함한 경우에만. 일반적인 시나리오/PPT는 50~70이 현실적`
      : `당신은 **세계적인 가전 전문 강사**입니다. 스피치·발성·화법·청중 상호작용에 대한 깊은 통찰로 강사를 평가합니다.
이것은 **AI 독자 평가**입니다. 조직이 등록한 상세 평가표(세부 기준표)는 일부러 보지 않고, **전문 강사 코치로서 영상만 보고 내린 독립적 판단**을 점수로 내야 합니다.
- 조직 평가표에 맞춰주려 하지 말 것. 조직 기준으로는 통과여도 전문가 눈에 부족하면 낮은 점수를 주는 것이 이 평가의 존재 이유입니다.
- 기준은 "대한민국 상위 10% 현장 강사와 비교했을 때 이 강의는 어느 수준인가?" 입니다. 평균적인 강의는 3점(보통)입니다.
교육자료(시나리오/교안/평가안)가 첨부된 경우 흐름 참고용으로만 읽고, 평가의 주 기준은 어디까지나 영상에서 관찰된 실제 수행입니다.
rubric_alignment_score는 0으로 두세요.`;

  return `${evalContext}

# ⚠ 분석 엄밀성 원칙 — 반드시 준수
0) **언어 규칙: 응답 전체를 순수 한국어(한글)로만 작성하라. 한자(漢字) 절대 사용 금지.**
   · 나쁜 예: "잠시停 (停 = 한자)", "人間", "漢字", "文章"
   · 좋은 예: "잠시 멈춤", "사람", "한글", "문장"
   · 한자어를 나타낼 때도 무조건 한글로만 표기. 괄호로 한자 병기도 금지.
   · 영어 약어(MM:SS, AI, CMH 등 고유 용어)는 허용, 한자만 금지.
1) 영상은 처음부터 끝까지 전체를 시간 순서대로 샅샅이 확인하라. 도입 1분만 보고 판단하지 말 것.
2) 체크리스트 세부항목은 **모든 n개 항목을 빠짐없이** 하나씩 매칭해 평가하라. 단 하나라도 누락·추측 금지.
3) 각 항목의 analysis에는 반드시 영상 속 실제 장면/발화를 구체적으로 인용하라 ("MM:SS에서 강사가 ~라고 말했다", "MM:SS에 제품 부품을 직접 들어 시연했다" 등).
4) 교육자료(시나리오/교안/평가안)가 첨부된 경우:
   - 문서 전체를 읽고 핵심 목표 · 핵심 키워드 · 권장 흐름을 먼저 뽑아라
   - 영상 강사의 실제 전달과 1:1 대조해 일치/불일치 지점을 구체적으로 명시
   - analysis에 "교육자료의 ○○ 부분을 영상에서는 △△로 전달함" 식으로 명시적 비교를 포함
5) 근거 없이 후한 점수를 주는 것은 최악의 오답이다. 근거가 약하면 점수를 내려라 (na로 도피하지 말 것).
6) 영상 길이가 길어도 fps/샘플링 한계로 놓친 구간을 임의로 추론하지 말 것. 관찰 가능한 구간만 근거로 사용.
7) 동일 문구 반복 금지 — 각 항목의 analysis는 해당 항목 고유의 내용으로 구체 서술.

${autoRubric
  ? `# 자체 평가안 설계 (등록된 평가안 없음 → 네가 직접 만든다)
이 평가에는 등록된 체크리스트가 없다. 따라서 **먼저 이 영상에 맞는 평가안을 직접 설계한 뒤, 그 평가안으로 채점**한다.
1) 영상을 처음부터 끝까지 본 뒤 이 강의의 성격(제품 교육 / 판매 화법 / 서비스 응대 / 실습 지도 등)을 판단한다.
2) 대항목 4~6개, 세부항목 총 12~16개의 평가안을 설계한다. 각 세부항목에 반드시 포함:
   · category  : 대항목명 (예: "1.내용 전문성")
   · no        : "1-1" 형식의 번호
   · sub_item  : 세부항목명 (예: "제품 숙지도")
   · criterion : 평가 기준을 질문형으로 (예: "제품의 원리와 특장점을 정확히 이해하고 교육하였는가?")
   · detail    : 평가 기준 상세 한 줄 (무엇을 봤을 때 잘한 것으로 볼지)
   · max_score : 배점. 중요 항목 10점, 일반 항목 5점 식으로 가중
   · levels    : {"5":"…","4":"…","3":"…","2":"…","1":"…"} 5단계 기준 문장 (각 30~60자, 서로 확실히 구분되게)
3) **max_score 의 합계는 정확히 100 이어야 한다.** 설계 후 반드시 합계를 검산하라.
4) 설계한 평가안 전체를 응답의 "generated_checklist" 배열에 담는다.
5) 그 다음 아래 채점 방식대로 sub_scores 를 작성한다.
   sub_scores 의 category / sub_item / criterion / max 는 generated_checklist 와 **정확히 일치**해야 한다.
6) 평가안은 이 영상 하나를 위해 설계하되, 강사 역량 평가로서 보편타당해야 한다 (강사가 잘한 것만 골라 항목을 만들지 말 것 — 그건 부정행위다).`
  : `# 체크리스트 (배점 합계 100점 · 총 ${totalCount}개 항목)
각 항목의 levels 가 채점 앵커(기준점)다. 반드시 이 문장과 대조해서 level_score 를 정하라.
levels_source 는 그 기준이 조직 평가표 원문인지, 조직이 정하지 않아 범용 기준으로 대체된 것인지를 나타낸다.
${JSON.stringify(checklistSpec, null, 2)}`}

${buildScoringRules(autoRubric ? 15 : totalCount, autoRubric ? 'none' : levelsMode)}

# 그 밖의 작성 규칙
- 시점(timestamp)은 영상 내 MM:SS 또는 MM:SS-MM:SS 형식으로 구체적으로 적기. na 항목만 빈 문자열
- analysis는 한국어로 구체적으로 (영상 속 실제 장면/발언 인용 필수)
- solution은 level_score 4점 이하 항목에 반드시 작성. 5점 항목과 na 항목은 빈 문자열("")
- habits(반복어)는 엄격 검증: 강사 입에서 실제로 여러 번(5회 이상) 반복해서 들리는 표현만 포함. 추측·유추 금지. 각 occurrence에는 MM:SS와 함께 그 시점의 실제 발화 문장 10~25자를 context로 반드시 인용. count는 occurrences 배열 길이와 일치해야 함. 확실하지 않은 반복어는 아예 제외(빈 배열이어도 OK)
- overall_score / categories 는 서버가 level_score 로 재계산한다. 대략값으로 채워도 되지만 level_score 는 절대 대충 정하지 마라

# 응답 JSON 스키마 (반드시 이 구조로만 응답)
{
  "overall_score": 0~100 정수 (참고값 — 서버가 level_score 기준으로 재계산함),
  "score_distribution": {"5점":int,"4점":int,"3점":int,"2점":int,"1점":int,"na":int},
  // ⚠ score_distribution 은 sub_scores 의 level_score 를 직접 세어서 적어라.
  //   분포 기준선을 넘겼다면, 넘긴 항목 전부에 MM:SS 인용이 있는지 응답 전에 스스로 검토하라.
  ${autoRubric ? `"generated_checklist": [{"category":"대항목","no":"1-1","sub_item":"세부항목","criterion":"평가 기준 질문","detail":"기준 상세 한 줄","max_score":int,"levels":{"5":"…","4":"…","3":"…","2":"…","1":"…"}}],
  // ⚠ generated_checklist 의 max_score 합계는 반드시 정확히 100
  ` : ''}"rubric_alignment_score": 0~100 정수 (교육자료가 얼마나 명확하고 유용한지. 평가안기준일 때만 작성, AI독자는 0),
  "rubric_alignment_reason": "rubric_alignment_score의 근거를 한줄로 (예: '교안 구조가 명확하고 핵심 키워드 10개 확인됨' 또는 '교육자료가 전달되지 않아 평가 불가')",
  "categories": [{"name":"대항목명","score":int,"max":int,"achievement":0~100}],
  "sub_scores": [{
    "n": 문항번호,
    "category": "대항목",
    "sub_item": "세부항목",
    "criterion": "평가기준",
    "level_score": 1|2|3|4|5 (na면 0),
    "level": "good"|"normal"|"bad"|"na",
    "evidence": "몇 점 기준 문장의 어느 부분을 무엇으로 충족했는지 + MM:SS 인용 (4점 이상이면 필수)",
    "score": int (서버가 재계산하므로 0이어도 무방),
    "max": int,
    "timestamp": "MM:SS" 또는 "MM:SS-MM:SS" 또는 "",
    "analysis": "구체 분석",
    "solution": "개선 솔루션"
  }],
  "good": [{"title":"강점 제목(체크리스트 외 영상·교육자료 전반에서 관찰된 인상적 포인트)","reason":"구체 이유+영상 장면 인용"}],
  "bad": [{"title":"약점 제목(체크리스트 외 전반 흐름·진행·에너지 등 종합 관찰)","reason":"구체 이유","solution":"개선안"}],
  "upgrade": [{"title":"업그레이드 포인트(특정 항목만이 아닌 강의 전반+세부 모두에서의 개선 아이디어)","detail":"추가 설명·실행 방법"}],
  "scenarios": [{"situation":"상황 (예: 타사 제품 수동 조작 불편함 설명 시)","original_line":"영상에서 강사가 실제로 말한 원문 + MM:SS 시점","script_comparison":"교육자료 시나리오에 명시된 권장 대사 (없으면 '교육자료 미제시')","suggested_line":"전문 강사 코치로서 추천하는 시나리오 대사","reason":"이 시나리오가 왜 더 효과적인지 구체 근거 1~2문장"}],
  "level_tips": [{"title":"레벨UP 포인트 (영상 전반 관점)","observation":"강의 전반에서 관찰된 현재 상태","detail":"구체 개선 방법 (실행 단계·예시 포함)","expected_effect":"이 팁을 적용했을 때 기대되는 효과"}],
  "teaching_patterns": [{"type":"자유롭게 명명 (예: 도입/설명/질문 유도/피드백/마무리/비교 시연/감정 이입/반론 처리/가격 안내/스토리텔링/전환/호응 유도 등 — 관찰된 화법의 성격에 맞게)","original":"영상에서 강사가 실제 말한 원 화법 + MM:SS 시점","alternative":"세계적 전문가 전강사로서 추천하는 대체 화법","reason":"왜 대체 화법이 더 효과적인지 1~2문장 근거"}],
  "summary_opinion": "종합 의견 3~5문장. 이번 강의의 전체적 평가 + 가장 큰 강점 1개 + 가장 큰 약점 1개 + 다음 강의에서 즉시 적용 가능한 구체 액션 1개를 포함. 평가안기준이면 교육자료 대비 달성도도 언급. AI독자면 체크리스트 전체 달성도 요약.",
  "habits": [{"word":"반복어 (정확히 강사 입에서 들린 표현)","count":int,"occurrences":[{"time":"MM:SS","context":"해당 시점 전후 실제 발화 문장 10~25자 인용"}, ...],"solution":"줄이는 솔루션"}],
  // ⚠ 반복어(habits) 엄격 검증 — 개념부터 재정의:
  //  【반복어 정의】전달력/권위/전문성에 '부정적 영향'을 주는 말버릇만 반복어다.
  //   즉, 다음 조건을 모두 충족할 때만 반복어로 등록:
  //    (a) 의미 전달에 기여하지 않고 (b) 반복될수록 듣는 이가 거슬리거나 신뢰도가 떨어지며
  //    (c) 강사 본인이 의식하지 못하고 습관적으로 뱉는 표현
  //  【예시 — 진짜 반복어】"어~","음~","뭐~","그니까","이제","사실","뭐랄까","맞죠?","그렇죠?","아시겠죠?","~같은 경우는"(군더더기로 쓰일 때만)
  //  【예시 — 반복어 아님 (절대 등록 금지)】
  //   - 제품명/고유명사: "퓨리케어","공기청정기","LG" 등
  //   - 전문용어/핵심어: "필터","인증","H13","탈취" 등 — 강의 주제라 반복이 당연함
  //   - 조사/어미: "은/는","이/가","을/를","합니다","~요" 등
  //   - 기능어(정상적으로 쓰이는 접속사/부사): "그리고","그래서","하지만","다음으로" 등
  //   - 강의 중 반복 설명이 필요한 단어: 같은 제품의 특징을 여러 번 언급하는 경우
  //  【검증 절차 — 반드시 수행】
  //   1) 후보 단어를 나열한 뒤, 각 단어에 대해 "이 단어가 제거되어도 의미가 통하는가?"를 자문 → 통하면 반복어, 아니면 제외
  //   2) 해당 단어가 구(phrase) 안의 일부인지 확인. 예: "같은 경우는"에서 '같은'은 '~의 경우' 관용구의 일부 → 단어 '같은'만 분리 등록 금지. 대신 반복되는 구 전체("같은 경우는")로 등록하거나, 정말 군더더기일 때만
  //   3) occurrences의 각 time은 실제 영상에서 해당 단어가 들리는 정확한 시점. 추측 금지. 시점을 확신할 수 없으면 habits에서 제외
  //   4) count = occurrences 길이. 불일치 시 AI 응답 오류로 간주
  //   5) 최소 3회 이상 들릴 때만 등록. 1~2회는 습관이 아님 — 제외
  //   6) 같은 영상 안에서 같은 단어를 서로 다른 habits 항목으로 나누지 말 것 (중복 등록 금지)
  //   7) habits 배열 상한 5개. 가장 부정적 영향이 큰 상위 5개만
  "engagement_gaps_minutes": [{"timestamp":"MM:SS","gap_minutes":int,"observation":"이 시점의 관찰(아래 유형 중 서로 다른 것 섞어서 사용)","suggestion":"이 지점에 넣으면 좋을 구체적 환기 액션"}],
  // ⚠ 환기 포인트(engagement_gaps_minutes) 다양화 규칙:
  //  매 항목마다 '집중력이 떨어질 수 있는 시점' 같은 똑같은 문구 반복 금지.
  //  아래 유형 중 서로 다른 관점으로 최소 3가지 이상 섞어서 observation 작성:
  //   - 전환 포인트: "주제가 A→B로 바뀌는 지점인데 연결 멘트 없이 넘어감"
  //   - 수강생 반응: "농담/질문 뒤 응답을 기다리지 않고 바로 다음 내용으로 넘어감"
  //   - 에너지 흐름: "목소리 톤이 단조로워지며 단순 나열식 설명이 이어짐"
  //   - 상호작용 부재: "일방향 설명이 N분 이상 지속되어 수강생 개입 기회 없음"
  //   - 체험/시연 부족: "제품 시연 없이 개념 설명만 이어지는 구간"
  //   - 속도 변화: "후반부로 갈수록 말 속도가 빨라져 핵심이 묻힘"
  //   - 시각 자료 단조: "같은 PPT 화면이 N분 이상 유지되어 시각 피로 누적"
  //  suggestion도 '짝토론'만 반복 금지 — '제품 직접 터치', '미니 퀴즈', '경험 공유 요청',
  //  '판서로 핵심 정리', '현장 사례 질문', '롤플레이' 등 상황별 액션으로 다양화
  "mood": "열정적이고 에너지 넘치는|밝고 경쾌한|친근하고 편안한|전문적이고 진지한|차분하고 신뢰감 있는|재미있고 유머러스한",
  // ⚠ 음성 분석 핵심 메타 — 절대 누락 금지. 영상이 짧거나 음질 약해도 추정치라도 반드시 반환.
  //   decibel: 상대 음량 추정(70=일반대화 / 78=강의 표준 / 85+=큰 목소리). 무음/매우 약함 → 50~65 사이 추정
  //   tempo_wpm: 한국어 분당 단어수. 강의 평균 120~180 WPM. 명확히 듣기 어려우면 110~140 추정 (0 반환 금지)
  //   두 값 모두 0 또는 누락 시 분석 결과가 화면에 비어 보임 → 사용자 경험 심각 저하
  "decibel": int (0 금지, 최소 50 이상),
  "tempo_wpm": int (0 금지, 최소 80 이상),
  // ── 음높이(pitch) 정성 평가 ── (절대 Hz 측정이 아니라, 강의 전달력 관점의 청각적 인상)
  "pitch_overall": "낮음|적정|높음",                  // 전체 강의의 평균 음높이 인상
  "pitch_recommendation": "더 높여 권장|유지 권장|더 낮춰 권장",  // 다음 강의 권장 방향
  "pitch_reason": "왜 그 권장이 필요한지 1~2문장 (예: '도입부 톤이 너무 낮아 권위감은 있으나 고객 흥미 유도가 약함 → 핵심 포인트 시 반음 올리세요')",
  // 발화 시점별 음높이 힌트 — 강의에서 청각적으로 두드러진 시점 위주로 5~15개 (없으면 빈 배열)
  "pitch_segments": [
    {
      "timestamp": "MM:SS",
      "quote": "해당 시점 실제 발화 5~25자 인용",
      "level": "낮음|적정|높음",          // 그 순간의 청각 인상
      "advice": "↑|=|↓",                   // ↑=높이세요 / ==유지 / ↓=낮추세요
      "reason": "왜 그 방향인지 1문장"
    }
  ]
}

# good/bad/upgrade — 최종 의견 (체크리스트 세부항목과 별개의 종합 관찰)
- 중요: good/bad/upgrade는 sub_scores(체크리스트 세부 채점)와 완전히 독립적인 종합 의견이다.
  · 체크리스트 항목에 없는 관찰 사항도 자유롭게 포함할 것
  · 영상 전반 + 교육자료(시나리오/교안) 대조 + 강사의 종합적 역량을 본 고수준 피드백
- good (잘한 점): 체크리스트 항목 이상으로 인상적이었던 강점
  · 예: "교육자료에는 없지만 수강생 눈높이에 맞춰 즉흥 비유를 만든 순발력"
  · 예: "전반적으로 에너지와 권위 있는 톤이 균형 잡혀 신뢰감 조성"
- bad (아쉬운 점): 체크리스트 채점 외에도 전반에서 드러난 약점
  · 예: "교안 순서는 따랐으나 각 섹션 간 연결 멘트 부재로 흐름이 끊김"
  · 예: "제품 특장점 설명 시 수치만 나열, 고객 체감 언어 부족"
- upgrade (업그레이드 제안): 특정 항목만이 아니라 강의 전반 + 세부 모두에서 더 잘할 수 있는 구체 제안
  · 예: "다음 강의에서는 도입부 3분에 청중 참여 질문을 배치하면 몰입도 향상"
  · 예: "교육자료의 시나리오 중 X구간을 롤플레이로 연출하면 실전 대응력 훈련 효과"
- 개수: 영상에서 실제로 관찰된 내용만 있는 만큼 유연 (각각 최소 0, 최대 8 권장)
- 관찰 의무: 세계적인 가전 전문 강사로서 영상을 **처음부터 끝까지 샅샅이 관찰**하고, 주목할 만한 포인트를
  빠짐없이 포착할 것. 도입 1~2분만 보고 안이하게 2~3개만 적지 말 것. 10분 이상 강의에서 good 1개만 있다면
  관찰이 부족한 것이다.
- 억지로 숫자 맞추기 금지 · 관찰된 근거 없는 항목 채우기 금지. 단, 충분히 관찰하면 자연스럽게 각 배열 3~6개 수준이
  나와야 정상.
- 세 배열 합계 최소 3 이상 권장 (전부 1건 이하면 관찰 부족 의심).
- scenarios/level_tips: 각 3개 (정확히)
- teaching_patterns: 개수 유연 — 영상에서 실제로 개선 가치 있는 화법이 관찰된 만큼
  (최소 1개, 최대 8개 권장). 3개에 억지로 맞추지 말 것.

# 추천 시나리오 (scenarios) 작성 규칙 — 세계적 전문 강사 코치 관점
- 각 항목은 강의 영상에서 실제 발화된 장면(원문 + MM:SS)을 기반으로 할 것
- 교육자료(시나리오·교안)가 있으면 해당 자료의 권장 대사와 대조해 script_comparison에 명시
- suggested_line: 같은 상황에서 고객 언어·세일즈 심리를 활용해 더 효과적인 대사로 재작성
- reason: 왜 그 시나리오가 더 좋은지 고객 체감·전환율·신뢰도 중 하나 이상의 관점에서 설명

# 강의 레벨 UP TIP (level_tips) 작성 규칙
- 영상 전반을 종합적으로 관찰한 "만약 이 강사가 다음 강의에서 한 단계 성장하려면?" 질문에 대한 대답
- 단순 팁 나열 금지 — observation(현재 상태 관찰), detail(구체 실행 방법), expected_effect(기대 효과) 3단 구조 필수
- 강의 전반의 흐름·페이스·몰입도·권위·공감대 등 종합 역량을 다룸 (체크리스트 개별 항목 반복 금지)

# 강사 교육 화법 (teaching_patterns) 작성 규칙
- 영상 속 실제 발화를 original에 인용 (MM:SS 포함)
- alternative는 세계적 전문가 전강사 관점의 "이렇게 말했더라면" 추천 화법
- reason은 왜 대체 화법이 더 효과적인지 구체 근거 (청중 주의 환기·신뢰·전환율 등)
- type은 고정 범주가 아니라 관찰된 성격에 맞춰 자유롭게 작성:
  · 기본 예시: 도입·설명·질문 유도·피드백·마무리
  · 그 외에도 자유: 비교·시연·감정 이입·공감 유도·반론 처리·가격 안내·스토리텔링·
    고객 경험 묘사·권유·긴장 완화·전환·호응 유도·요약 강조 등 영상 관찰에 맞춰 정확한 명칭 부여
- 개수는 관찰된 만큼 유연하게 (개선 가치 있는 포인트 모두 포착 — 1~8개 권장).
  3개에 억지로 맞추지 말 것. 영상에 개선 포인트가 풍부하면 더 많이,
  확실한 포인트만 있으면 적게 자유 판단.
- 당신은 세계적 전문가 전강사 — 영상을 세세히 관찰해 개선 여지가 있는 화법은 빠짐없이 포착
- 각 문자열 필드는 간결하게 (분석/솔루션은 1~2문장, 40~80자 내외 권장)
- sub_scores는 체크리스트의 모든 세부항목을 빠짐없이 포함
- analysis는 반드시 2~3문장(50~100자)으로 영상 속 실제 장면/발언을 구체적으로 인용하여 작성 ("강사가 MM:SS에서 ~라고 말했다" 등)
- solution은 normal/bad 항목에 반드시 1~2문장(30~60자)으로 구체적 개선안 작성 ("다음에는 ~하면 효과적" 등)
- 분석이 1문장 이하이거나 "잘했다/못했다"만 적는 것은 금지. 반드시 영상 속 근거를 들어야 함

${
  evalType === 'AI독자'
    ? '\n※ 이 평가는 AI 독자 분석이므로 scenarios/level_tips/teaching_patterns는 생략 가능(빈 배열).'
    : ''
}
${hasEduMaterial ? '\n※ 첨부된 교육자료(시나리오/평가안)를 영상과 대조해 부합 여부를 반드시 분석에 반영하세요.' : ''}
`;
}

export default async function handler(req, res) {
  const reqStartedAt = Date.now();   // 300초 한도 관리용 (PARSE_RETRY_DEADLINE_MS 참조)
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const auth = verifyAuth(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

  // AI 코칭 중지 스위치 — 화면 우회로 비용이 새는 것을 막는 최종 관문
  if (await isAiCoachingBlocked(auth.decoded)) {
    return res.status(403).json({
      ok: false,
      error: 'AI 코칭이 일시 중지된 상태입니다. 이용이 필요하시면 관리자에게 문의해주세요.',
      code: 'ai_coaching_blocked',
    });
  }

  // AI 시나리오 코치 모드 분기
  if (req.body && req.body.mode === 'scenario_coach') {
    return await handleScenarioCoach(req, res);
  }

  try {
    const {
      video_url,
      video_gcs_uri,
      video_mime = 'video/mp4',
      checklist_items,
      eval_type,
      edu_file_url,
      edu_file_mime,
      edu_text,
      model = 'gemini-2.5-pro',
    } = req.body || {};

    if (!video_url && !video_gcs_uri) return res.status(400).json({ ok: false, error: 'video_url 또는 video_gcs_uri 필요' });
    if (!eval_type || !['평가안기준', 'AI독자'].includes(eval_type))
      return res.status(400).json({ ok: false, error: 'eval_type: "평가안기준" | "AI독자"' });
    // 체크리스트가 없으면 → AI독자 모드에서는 AI가 영상을 보고 평가안을 직접 설계 (auto rubric)
    const hasChecklist = Array.isArray(checklist_items) && checklist_items.length > 0;
    const autoRubric = !hasChecklist;
    if (!hasChecklist && eval_type === '평가안기준')
      return res.status(400).json({ ok: false, error: '평가안기준 분석에는 checklist_items 가 필요합니다' });

    // 캐시 조회 — 같은 영상+평가안+교육자료+모델이면 저장된 결과 즉시 반환 (Vertex 비용 절감)
    const skipCache = req.body?.skip_cache === true;
    const cacheKey = makeCacheKey({ video_gcs_uri, video_url, checklist_items, eval_type, edu_file_url, edu_text, model });
    if (sbAdmin && !skipCache) {
      try {
        const { data: hit } = await sbAdmin.from('vertex_cache').select('result').eq('cache_key', cacheKey).maybeSingle();
        if (hit?.result) {
          // hit 기록 (fire-and-forget)
          sbAdmin.rpc('vertex_cache_hit', { p_key: cacheKey }).then(() => {}).catch(() => {});
          return res.status(200).json({ ok: true, eval_type, model, result: hit.result, cached: true });
        }
      } catch (e) {
        console.warn('[vertex-analyze] cache lookup failed:', e.message);
      }
    }

    const creds = getCredentials();
    if (!creds.project_id || !creds.client_email || !creds.private_key)
      return res.status(500).json({ ok: false, error: 'GCP credentials missing' });

    const vertex = new VertexAI({
      project: creds.project_id,
      location: 'us-central1',
      googleAuthOptions: {
        projectId: creds.project_id,
        credentials: {
          type: 'service_account',
          project_id: creds.project_id,
          client_email: creds.client_email,
          private_key: creds.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
    });

    // 일관성 극대화: temperature=0, topP 낮게, seed 고정 (같은 영상+프롬프트 → 거의 동일 결과)
    const seedBase = (video_gcs_uri || video_url || '').split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const seed = Math.abs(seedBase) % 2147483647 || 12345;
    const gm = vertex.getGenerativeModel({
      model,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
        topP: 0.1,
        seed,
        maxOutputTokens: 32768,
      },
    });

    // 우선순위: gs:// URI(GCS) → fileData 직접 전달 (크기 제한 없음)
    // 폴백: HTTPS URL → inlineData(base64) (~18MB 이내만)
    const parts = [];
    const fps = typeof req.body.fps === 'number' ? req.body.fps : 0.2;
    const isAudio = (video_mime || '').startsWith('audio');
    if (video_gcs_uri) {
      const part = { fileData: { mimeType: video_mime, fileUri: video_gcs_uri } };
      if (!isAudio) part.videoMetadata = { fps };
      parts.push(part);
    } else {
      const vresp = await fetch(video_url);
      if (!vresp.ok) return res.status(502).json({ ok: false, error: `영상 다운로드 실패(${vresp.status}): ${video_url}` });
      const vbuf = Buffer.from(await vresp.arrayBuffer());
      const vMaxMB = 18;
      if (vbuf.byteLength > vMaxMB * 1024 * 1024) {
        return res.status(413).json({ ok: false, error: `영상 크기 ${Math.round(vbuf.byteLength/1024/1024)}MB 초과 (${vMaxMB}MB 이하). GCS(gs://) 경로 사용 권장.` });
      }
      const videoMime = vresp.headers.get('content-type') || 'video/mp4';
      parts.push({ inlineData: { mimeType: videoMime, data: vbuf.toString('base64') } });
    }
    let eduInlineText = '';
    // ① 브라우저에서 미리 뽑아 보낸 교안 텍스트가 있으면 그대로 사용 (대용량 교안 대응 — 다운로드 불필요)
    const eduTextIn = typeof edu_text === 'string' ? edu_text.trim() : '';
    if (eduTextIn) {
      eduInlineText = `\n\n[교육자료 — 교안 본문]\n${eduTextIn.slice(0, 20000)}`;
    } else if (edu_file_url) {
      // ② 없으면 서버가 내려받아 추출 (평가안기준 뿐 아니라 AI독자에서도 참고용으로 주입)
      const edu = await fetchEduMaterial(edu_file_url, edu_file_mime || '');
      if (edu.kind === 'fileData') {
        parts.push({ fileData: { mimeType: edu.mime, fileUri: edu.url } });
      } else if (edu.kind === 'text') {
        eduInlineText = `\n\n${edu.label}\n${edu.text.slice(0, 20000)}`;
      } else if (edu.kind === 'too_large') {
        eduInlineText = `\n\n[교육자료 안내] 교안 파일이 ${edu.mb}MB로 서버에서 열기에 너무 커서 내용을 읽지 못했습니다. 교안 대조 없이 영상만으로 평가하고, rubric_alignment_score 는 0으로 두세요.`;
      }
    }
    const hasEduContent = !!eduTextIn || !!edu_file_url;
    parts.push({
      text:
        buildPrompt({
          checklistItems: checklist_items || [],
          evalType: eval_type,
          hasEduMaterial: hasEduContent,
          autoRubric,
        }) + eduInlineText,
    });

    const result = await generateContentWithBackoff(gm, {
      contents: [{ role: 'user', parts }],
    });

    const cand = result.response?.candidates?.[0];
    const text = cand?.content?.parts?.[0]?.text || '';
    const finishReason = cand?.finishReason || '';

    const tryParse = (raw) => {
      if (!raw) return null;
      let cleaned = raw.trim();
      // 마크다운 펜스 제거
      cleaned = cleaned.replace(/^```(?:json|JSON)?\s*/i, '').replace(/```\s*$/i, '');
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) cleaned = cleaned.slice(firstBrace, lastBrace + 1);

      const attempts = [
        (s) => s,
        (s) => s.replace(/[\u0000-\u001F\u007F]+/g, ' '),
        (s) => s.replace(/,\s*([}\]])/g, '$1'),
        (s) => s.replace(/([{,]\s*)([a-zA-Z_][\w$]*)(\s*:)/g, '$1"$2"$3'),
        (s) => s.replace(/:\s*'([^']*)'/g, ':"$1"'),
        (s) => s.replace(/\\'/g, "'"),
        (s) => {
          let t = s.replace(/,\s*$/, '');
          const oo = (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
          const oa = (t.match(/\[/g) || []).length - (t.match(/\]/g) || []).length;
          const os = (t.match(/"/g) || []).length % 2;
          if (os) t += '"';
          for (let i = 0; i < oa; i++) t += ']';
          for (let i = 0; i < oo; i++) t += '}';
          return t;
        },
      ];
      let current = cleaned;
      for (const fix of attempts) {
        current = fix(current);
        try { return JSON.parse(current); } catch (e) {}
      }
      return null;
    };

    let parsed = tryParse(text);

    // 1차 파싱 실패 시 재시도 — 단, 남은 시간이 있을 때만.
    // ⚠ 이 함수의 한도는 300초다. 한 번의 Gemini 호출이 이미 수 분 걸리므로
    //   무조건 재시도하면 한도를 넘겨 504(FUNCTION_INVOCATION_TIMEOUT)로 죽고
    //   클라이언트는 아무 결과도 못 받는다. → 여유가 있을 때만 다시 부른다.
    for (let i = 0; i < 2 && !parsed; i++) {
      const elapsed = Date.now() - reqStartedAt;
      if (elapsed > PARSE_RETRY_DEADLINE_MS) {
        console.warn(`[vertex] 파싱 재시도 생략 — 경과 ${Math.round(elapsed / 1000)}초 (한도 임박)`);
        break;
      }
      try {
        const retry = await generateContentWithBackoff(gm, { contents: [{ role: 'user', parts }] });
        const rText = retry.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        parsed = tryParse(rText);
      } catch (e) {}
    }

    if (!parsed) {
      return res.status(502).json({
        ok: false,
        error: `AI 응답 JSON 파싱 실패 (finishReason=${finishReason})`,
        raw_head: text.slice(0, 500),
        raw_tail: text.slice(-500),
        raw_length: text.length,
      });
    }

    // AI 독자 자동 평가안: 스스로 만든 배점 합계가 100이 아니면 100 기준으로 보정
    if (autoRubric && Array.isArray(parsed.generated_checklist) && parsed.generated_checklist.length) {
      const sum = parsed.generated_checklist.reduce((a, x) => a + (Number(x.max_score) || 0), 0);
      if (sum > 0 && sum !== 100) {
        console.warn(`[vertex-analyze] 자동 평가안 배점 합계 ${sum} → 100으로 보정`);
        const k = 100 / sum;
        parsed.generated_checklist.forEach((x) => { x.max_score = Math.max(1, Math.round((Number(x.max_score) || 0) * k)); });
        const byName = new Map(parsed.generated_checklist.map((x) => [`${x.category}||${x.sub_item}`, x.max_score]));
        (parsed.sub_scores || []).forEach((s) => {
          const m = byName.get(`${s.category}||${s.sub_item}`);
          if (m) s.max = m;
        });
      }
    }

    // 5단계 앵커 채점 확정 (분포 상한 강제 + 총점 재계산)
    parsed = enforceScoring(parsed);

    // 캐시 저장 (fire-and-forget — 응답 지연 X)
    if (sbAdmin && !skipCache) {
      sbAdmin.from('vertex_cache').upsert({
        cache_key: cacheKey,
        eval_type,
        model,
        result: parsed,
        created_at: new Date().toISOString(),
      }, { onConflict: 'cache_key' }).then(() => {}).catch((e) => {
        console.warn('[vertex-analyze] cache save failed:', e.message);
      });
    }

    return res.status(200).json({ ok: true, eval_type, model, result: parsed, cached: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e), stack: e.stack?.split('\n').slice(0, 5).join('\n') });
  }
}

// ============================================================
// AI 시나리오 코치 (Scenario Coach) — 매장 판매 시나리오 코칭 전용
// ============================================================
async function handleScenarioCoach(req, res) {
  try {
    const {
      edu_type = '', product = '', phase = '',
      customer = '', store = '',
      axes = [], draft = '',
      edu_file_url = '', edu_file_mime = '',
      model = 'gemini-2.5-pro',
    } = req.body || {};

    if (!draft || draft.length < 20) {
      return res.status(400).json({ ok: false, error: '시나리오 초안이 너무 짧습니다 (20자 이상)' });
    }

    const creds = getCredentials();
    if (!creds.project_id || !creds.client_email || !creds.private_key)
      return res.status(500).json({ ok: false, error: 'GCP credentials missing' });

    const vertex = new VertexAI({
      project: creds.project_id,
      location: 'us-central1',
      googleAuthOptions: {
        projectId: creds.project_id,
        credentials: {
          type: 'service_account',
          project_id: creds.project_id,
          client_email: creds.client_email,
          private_key: creds.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
    });

    const gm = vertex.getGenerativeModel({
      model,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    // 축 포매팅
    const axesText = (axes || []).map((a, i) => {
      const n = typeof a === 'string' ? a : a.name;
      const hint = typeof a === 'object' && a.hint ? ` (${a.hint})` : '';
      return `  ${i + 1}. ${n}${hint}`;
    }).join('\n');

    // 교육자료 처리
    let eduPart = '';
    const eduMat = edu_file_url ? await fetchEduMaterial(edu_file_url, edu_file_mime) : { kind: 'none' };
    if (eduMat.kind === 'text') {
      eduPart = `\n\n${eduMat.label}\n${eduMat.text.slice(0, 15000)}\n`;
    }

    const prompt = `당신은 **세계적인 가전 전문 강사**입니다.
수십 년간 LG·삼성·해외 프리미엄 가전 판매 현장을 코칭해온 경험으로, 매장에서 바로 따라 말할 수 있는 **실전 대사 수준** 으로 시나리오를 코칭합니다.

# 원칙
- 개념·원론 금지. 구체 대사·수치·비유로만 피드백.
- 가전은 **실물 시연·경쟁사 비교·수치 근거** 가 결정적이므로 이 3요소 점검 필수.
- 고객 유형(${customer || '미지정'})·매장 환경(${store || '미지정'})에 맞춘 맞춤 코칭.
- 응답 전체를 순수 한국어(한글)로만 작성. 한자 절대 금지.

# 컨텍스트
- 교육 유형: ${edu_type || '미지정'}
- 교육 제품: ${product || '미지정'}
- 시나리오 단계: ${phase || '미지정'}
- 목표 고객: ${customer || '미지정'}
- 매장 환경: ${store || '미지정'}
${eduPart ? '\n# 첨부 교육자료 (비교 대조 대상)\n' + eduPart : ''}

# 강사의 초안
"""
${draft}
"""

# 판단 축 (사용자 편집본)
${axesText || '  (축 미지정 — 공통 7축으로 평가)'}

# 분석 지시
1. 초안을 한 줄 한 줄 세세히 읽고, 각 판단 축별로 반영 정도를 0~100 으로 채점.
2. 가전 판매 현장 경험을 바탕으로 **살려야 할 요소**, **빼야 할 요소**, **보완 제안** 을 각각 구체 대사·표현 수준으로 제시.
3. 필수 요소(경쟁사 비교·실물 시연·수치 근거) 중 누락이 있으면 반드시 지적.
4. 제품별 실제 스펙(예: 에어컨 CMH·효율등급, 냉장고 L·에너지등급)을 언급하며 수치 근거 강조.
5. 첨부 교육자료가 있으면 "교육자료에는 ○○이 있으나 초안에는 △△로 전달됨" 식으로 대조.
6. 전문가 관점의 구간별 추천 대사(오프닝/Needs/FAB/경쟁사/시연/반론/클로징)를 제시.
7. 마지막으로 위 피드백을 종합한 **수정판 시나리오 전문**을 작성 (그대로 매장에서 말할 수 있도록).

# 응답 JSON 스키마
{
  "overall_score": 0~100,
  "grade": "S|A|B|C|D",
  "axis_scores": { "<축이름>": 0~100, ... },
  "strengths": [{"title":"살릴 점 제목","detail":"구체 설명 + 대사 예"}],
  "weaknesses": [{"title":"뺄 점 제목","detail":"구체 설명"}],
  "additions": [{"title":"보완 제안 제목","detail":"구체 대사·수치·비유 제안"}],
  "missing": ["누락 1","누락 2"],
  "expert_scripts": {
    "오프닝": "매장에서 바로 말할 수 있는 대사",
    "Needs": "...",
    "FAB": "...",
    "경쟁사": "...",
    "시연": "...",
    "반론": "...",
    "클로징": "..."
  },
  "revised_scenario": "섹션 구분된 수정판 시나리오 전문 (예: [오프닝]\\n...\\n\\n[Needs]\\n... 형태)",
  "summary": "한 줄 총평 (25자 이내)",
  "improvement_tip": "가장 임팩트 있는 개선 포인트 1개"
}

# 채점 기준
- overall_score = axis_scores 가중 평균 (필수축 가중치 1.5배)
- grade: S(95+) / A(85+) / B(75+) / C(60+) / D(그 외)
- axis_scores 값은 초안에 해당 요소가 얼마나 구체적으로 녹아있는지 기준.`;

    const request = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
    };

    const result = await generateContentWithBackoff(gm, request);
    const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Fallback: JSON 블록 추출
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch (e2) { parsed = null; } }
    }
    if (!parsed) {
      return res.status(500).json({ ok: false, error: 'AI 응답 파싱 실패', raw: text.slice(0, 500) });
    }

    return res.status(200).json({ ok: true, mode: 'scenario_coach', model, result: parsed });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e), stack: e.stack?.split('\n').slice(0, 5).join('\n') });
  }
}
