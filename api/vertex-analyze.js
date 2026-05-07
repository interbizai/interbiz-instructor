import { VertexAI } from '@google-cloud/vertexai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 300 };

const JWT_SECRET = process.env.JWT_SECRET;
const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbAdmin = SB_URL && SB_SERVICE_KEY ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } }) : null;

function makeCacheKey({ video_gcs_uri, video_url, checklist_items, eval_type, edu_file_url, model }) {
  const h = crypto.createHash('sha256');
  h.update(String(video_gcs_uri || video_url || ''));
  h.update('|');
  h.update(JSON.stringify(checklist_items || []));
  h.update('|');
  h.update(String(eval_type || ''));
  h.update('|');
  h.update(String(edu_file_url || ''));
  h.update('|');
  h.update(String(model || 'gemini-2.5-pro'));
  return h.digest('hex');
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
async function fetchEduMaterial(url, mime) {
  if (!url) return { kind: 'none' };
  // Gemini 직접 처리 가능한 타입은 fileData URL 그대로
  if (GEMINI_DIRECT_MIMES.has(mime)) return { kind: 'fileData', mime, url };
  // Word/Excel은 서버에서 텍스트 추출
  const r = await fetch(url);
  if (!r.ok) throw new Error(`교육자료 다운로드 실패: ${r.status}`);
  const ab = await r.arrayBuffer();
  const buf = Buffer.from(ab);
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

function buildPrompt({ checklistItems, evalType, hasEduMaterial }) {
  const checklistSpec = checklistItems.map((it, i) => ({
    n: i + 1,
    category: it.category,
    sub_item: it.sub_item,
    criterion: it.criterion,
    max_score: it.max_score,
    detail: it.detail || '',
  }));

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
      : `당신은 **세계적인 가전 전문 강사**입니다. 스피치·발성·화법·청중 상호작용에 대한 깊은 통찰로 강사를 평가합니다. 업로드된 영상·오디오를 독립적으로 확인하여, 아래 체크리스트 기준으로 평가합니다.
교육자료(시나리오/교안/평가안)가 첨부된 경우 반드시 읽고 내용의 흐름과 영상의 전달이 얼마나 부합하는지 '느낌' 수준으로 반영하되, 평가의 주 기준은 체크리스트입니다.
rubric_alignment_score는 교육자료가 없으면 0, 있으면 50~90 사이로 교육자료의 구조/핵심 키워드 명확도를 참고해 부여하세요.`;

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
5) 점수는 관찰된 근거가 명확할 때만 부여. 근거가 없으면 na로 처리하고 bad로 떨어뜨리지 말 것.
6) 영상 길이가 길어도 fps/샘플링 한계로 놓친 구간을 임의로 추론하지 말 것. 관찰 가능한 구간만 근거로 사용.
7) 동일 문구 반복 금지 — 각 항목의 analysis는 해당 항목 고유의 내용으로 구체 서술.

# 체크리스트 (100점 만점)
${JSON.stringify(checklistSpec, null, 2)}

# 채점 규칙
- 각 세부항목은 4가지 level 중 하나: "good"(잘함), "normal"(보통), "bad"(못함), "na"(해당없음/평가 불가)
- 중요: 영상에 해당 내용이 전혀 관찰되지 않거나 평가 불가한 경우 반드시 "na"로 분류. "평가하기 어렵다", "판단 불가", "관찰되지 않음" 같은 분석을 쓰면서 "bad"로 처리하지 말 것. na일 때 timestamp는 빈 문자열
- score는 0 ≤ score ≤ max 범위의 정수. 관찰된 수행 수준에 맞춰 세밀하게 부여 (예: max=5 이면 0·1·2·3·4·5 모두 허용 / max=10이면 0~10 정수 / max=15면 0~15 정수)
- level은 score/max 비율 기준으로 자동 일치 (max 크기에 따라 임계값 다름):
  · max ≤ 5 일 때
     - score/max ≥ 0.8 (예: 5/5, 4/5)         → "good"
     - 0.6 ≤ score/max < 0.8 (예: 3/5)        → "normal"
     - score/max < 0.6 (예: 2/5, 1/5, 0/5)    → "bad"
  · max ≥ 6 일 때
     - score/max ≥ 0.9 (예: 9/10, 14/15)      → "good"
     - 0.7 ≤ score/max < 0.9 (예: 7/10, 8/10) → "normal"
     - score/max < 0.7                         → "bad"
  · 영상에 관찰 불가 → "na" (점수 합산 제외)
- 애매하면 중간(normal) 쪽. 확실히 뛰어난 부분만 good, 명백한 문제만 bad.
- overall_score는 전체 sub_scores의 score합/max합×100으로 정확히 계산. 0점 항목이 3개 이상이면 80점 이상 나올 수 없음
- 판정 불가(해당없음)인 경우 "na"로 표기 — 점수 합산에서 제외
- 시점(timestamp)은 영상 내 MM:SS 또는 MM:SS-MM:SS 형식으로 구체적으로 적기
- analysis는 한국어로 구체적으로 (영상 속 실제 장면/발언 인용 권장)
- solution은 "normal"/"bad" 항목에만 작성. "good"/"na" 항목은 solution을 빈 문자열("")로 둔다
- habits(반복어)는 엄격 검증: 강사 입에서 실제로 여러 번(5회 이상) 반복해서 들리는 표현만 포함. 추측·유추 금지. 각 occurrence에는 MM:SS와 함께 그 시점의 실제 발화 문장 10~25자를 context로 반드시 인용. count는 occurrences 배열 길이와 일치해야 함. 확실하지 않은 반복어는 아예 제외(빈 배열이어도 OK)
- overall_score = sum(sub_scores[i].score) / sum(sub_scores[i].max) × 100 을 반올림한 정수 (na 항목은 양쪽 합계에서 제외)
- categories[].score = 해당 대항목에 속한 sub_scores의 score 합, categories[].max = max 합 (na 제외)
- categories[].achievement = round(score/max × 100) (max=0이면 0)

# 응답 JSON 스키마 (반드시 이 구조로만 응답)
{
  "overall_score": 0~100 정수 (=sub_scores의 score 합 ÷ max 합 × 100 반올림, na 제외),
  "rubric_alignment_score": 0~100 정수 (교육자료가 얼마나 명확하고 유용한지. 평가안기준일 때만 작성, AI독자는 0),
  "rubric_alignment_reason": "rubric_alignment_score의 근거를 한줄로 (예: '교안 구조가 명확하고 핵심 키워드 10개 확인됨' 또는 '교육자료가 전달되지 않아 평가 불가')",
  "categories": [{"name":"대항목명","score":int,"max":int,"achievement":0~100}],
  "sub_scores": [{
    "n": 문항번호,
    "category": "대항목",
    "sub_item": "세부항목",
    "criterion": "평가기준",
    "level": "good"|"normal"|"bad"|"na",
    "score": int,
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
  "decibel": 대략적 dB 값(int),
  "tempo_wpm": 분당 단어수(int),
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
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const auth = verifyAuth(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

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
      model = 'gemini-2.5-pro',
    } = req.body || {};

    if (!video_url && !video_gcs_uri) return res.status(400).json({ ok: false, error: 'video_url 또는 video_gcs_uri 필요' });
    if (!Array.isArray(checklist_items) || !checklist_items.length)
      return res.status(400).json({ ok: false, error: 'checklist_items 필요' });
    if (!eval_type || !['평가안기준', 'AI독자'].includes(eval_type))
      return res.status(400).json({ ok: false, error: 'eval_type: "평가안기준" | "AI독자"' });

    // 캐시 조회 — 같은 영상+평가안+교육자료+모델이면 저장된 결과 즉시 반환 (Vertex 비용 절감)
    const skipCache = req.body?.skip_cache === true;
    const cacheKey = makeCacheKey({ video_gcs_uri, video_url, checklist_items, eval_type, edu_file_url, model });
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
    // 교육자료는 평가안기준 뿐 아니라 AI독자(스피치)에서도 참고용으로 주입 (있으면)
    if (edu_file_url) {
      const edu = await fetchEduMaterial(edu_file_url, edu_file_mime || '');
      if (edu.kind === 'fileData') {
        parts.push({ fileData: { mimeType: edu.mime, fileUri: edu.url } });
      } else if (edu.kind === 'text') {
        eduInlineText = `\n\n${edu.label}\n${edu.text.slice(0, 20000)}`;
      }
    }
    parts.push({
      text:
        buildPrompt({
          checklistItems: checklist_items,
          evalType: eval_type,
          hasEduMaterial: !!edu_file_url,
        }) + eduInlineText,
    });

    const result = await gm.generateContent({
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

    // 1차 파싱 실패 시 두 번까지 재시도
    for (let i = 0; i < 2 && !parsed; i++) {
      try {
        const retry = await gm.generateContent({ contents: [{ role: 'user', parts }] });
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

    const result = await gm.generateContent(request);
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
