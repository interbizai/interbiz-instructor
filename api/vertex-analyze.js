import { VertexAI } from '@google-cloud/vertexai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export const config = { maxDuration: 300 };

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
      ? `당신은 현장강사 평가 전문가입니다. 업로드된 영상과 교육자료(시나리오/평가안 — PDF/Word/Excel/PowerPoint 중 하나, 자유양식)를 모두 세세히 읽고 이해한 뒤 아래 체크리스트 기준으로 평가합니다.

교육자료 활용 필수 규칙:
1) 교육자료의 핵심 목표/핵심 메시지/핵심 키워드를 먼저 파악
2) 영상 강사가 그 목표와 키워드를 실제로 전달했는지 대조
3) 교육자료와 영상의 어긋난 부분(빠진 내용/추가된 내용/왜곡)을 구체적으로 지적
4) analysis에 "교육자료에서는 ○○을 다루지만 영상에서는 △△으로 전달되었다"처럼 명시적으로 비교
5) rubric_alignment_score는 아래 기준으로:
   - 90+: 교육자료가 명확하고 구조화되어 있어 평가에 충분
   - 70-89: 대부분 활용 가능하나 일부 모호
   - 50-69: 부분적으로만 활용 가능 (정보 부족)
   - 30-49: 대부분 모호해 해석에 의존
   - 0-29: 교육자료가 비어있거나 내용이 평가 대상과 무관
6) 교육자료가 실제로 전달되지 않았거나 전혀 참조 불가한 경우에만 0`
      : `당신은 현장강사 평가 전문가입니다. 업로드된 영상만 독립적으로 확인하여, 아래 체크리스트 기준으로 평가합니다. 교육자료는 참고하지 않습니다. rubric_alignment_score는 0으로 두세요.`;

  return `${evalContext}

# 체크리스트 (100점 만점)
${JSON.stringify(checklistSpec, null, 2)}

# 채점 규칙
- 각 세부항목은 3단계 판정만 허용: "good"(잘했다 = 배점 100% = 5점 만점 기준 5점), "normal"(보통 = 배점 60% = 5점 만점 기준 3점), "bad"(못했다 = 0점)
- 절대 2점/4점 같은 중간값을 내지 않는다. 애매한 경우 무조건 "normal"(3점)로 반올림하지 말고 분명히 잘했으면 good, 그렇지 않으면 normal, 못 했으면 bad로만 판정
- score 필드 값은 정확히 max 또는 round(max*0.6) 또는 0 중 하나여야 함
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
  "good": [{"title":"강점 제목","reason":"구체 이유+영상 장면"}],
  "bad": [{"title":"약점 제목","reason":"구체 이유","solution":"개선안"}],
  "upgrade": [{"title":"업그레이드 포인트","detail":"추가 설명"}],
  "scenarios": [{"situation":"상황","original_line":"영상 속 원문","suggested_line":"추천 시나리오 대사"}],
  "level_tips": [{"title":"레벨UP 팁","detail":"설명"}],
  "teaching_patterns": [{"type":"도입|피드백|마무리|기타","original":"원 화법","alternative":"추천 대체 화법"}],
  "habits": [{"word":"반복어 (정확히 강사 입에서 들린 표현)","count":int,"occurrences":[{"time":"MM:SS","context":"해당 시점 전후 실제 발화 문장 10~25자 인용"}, ...],"solution":"줄이는 솔루션"}],
  "engagement_gaps_minutes": [분단위 간격 배열 (예: [7,12,9])],
  "mood": "열정적이고 에너지 넘치는|밝고 경쾌한|친근하고 편안한|전문적이고 진지한|차분하고 신뢰감 있는|재미있고 유머러스한",
  "decibel": 대략적 dB 값(int),
  "tempo_wpm": 분당 단어수(int)
}

# good/bad/upgrade 개수 규칙
- good/bad/upgrade: 각 3개 (정확히)
- scenarios/level_tips/teaching_patterns: 각 3개 (정확히)
- 각 문자열 필드는 간결하게 (분석/솔루션은 1~2문장, 40~80자 내외 권장)
- sub_scores는 체크리스트의 모든 세부항목을 빠짐없이 포함하되 analysis/solution을 간결하게 작성

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

  try {
    const {
      video_url,
      video_gcs_uri,
      video_mime = 'video/mp4',
      checklist_items,
      eval_type,
      edu_file_url,
      edu_file_mime,
      model = 'gemini-2.5-flash',
    } = req.body || {};

    if (!video_url && !video_gcs_uri) return res.status(400).json({ ok: false, error: 'video_url 또는 video_gcs_uri 필요' });
    if (!Array.isArray(checklist_items) || !checklist_items.length)
      return res.status(400).json({ ok: false, error: 'checklist_items 필요' });
    if (!eval_type || !['평가안기준', 'AI독자'].includes(eval_type))
      return res.status(400).json({ ok: false, error: 'eval_type: "평가안기준" | "AI독자"' });

    const creds = getCredentials();
    if (!creds.project_id || !creds.client_email || !creds.private_key)
      return res.status(500).json({ ok: false, error: 'GCP credentials missing' });

    const vertex = new VertexAI({
      project: creds.project_id,
      location: 'asia-northeast3',
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
    // fps 기본 0.2 (5초당 1프레임) → 약 40분 영상까지 Flash 131K 토큰 한도 내 처리
    // 요청으로 override 가능 (짧은 영상은 fps=1, 1시간은 fps=0.1)
    const fps = typeof req.body.fps === 'number' ? req.body.fps : 0.2;
    if (video_gcs_uri) {
      parts.push({
        fileData: { mimeType: video_mime, fileUri: video_gcs_uri },
        videoMetadata: { fps },
      });
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
    if (eval_type === '평가안기준' && edu_file_url) {
      const edu = await fetchEduMaterial(edu_file_url, edu_file_mime || '');
      if (edu.kind === 'fileData') {
        parts.push({ fileData: { mimeType: edu.mime, fileUri: edu.url } });
      } else if (edu.kind === 'text') {
        // 1시간 영상 대비 토큰 여유를 위해 교육자료 텍스트 상한을 20K자로 축소
        eduInlineText = `\n\n${edu.label}\n${edu.text.slice(0, 20000)}`;
      }
    }
    parts.push({
      text:
        buildPrompt({
          checklistItems: checklist_items,
          evalType: eval_type,
          hasEduMaterial: eval_type === '평가안기준' && !!edu_file_url,
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
      // 마크다운 펜스 제거 (```json ... ```)
      cleaned = cleaned.replace(/^```(?:json|JSON)?\s*/i, '').replace(/```\s*$/i, '');
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      // 1차 시도
      try { return JSON.parse(cleaned); } catch (e) {}
      // 제어문자 제거 후 재시도
      let c2 = cleaned.replace(/[\u0000-\u001F]+/g, ' ');
      try { return JSON.parse(c2); } catch (e) {}
      // 꼬리 쉼표 제거
      let c3 = c2.replace(/,\s*([}\]])/g, '$1');
      try { return JSON.parse(c3); } catch (e) {}
      // 불완전 괄호 복구 (MAX_TOKENS/STOP 공통)
      let c4 = c3.replace(/,\s*$/, '');
      const openObj = (c4.match(/\{/g) || []).length - (c4.match(/\}/g) || []).length;
      const openArr = (c4.match(/\[/g) || []).length - (c4.match(/\]/g) || []).length;
      const openStr = (c4.match(/"/g) || []).length % 2;
      if (openStr) c4 += '"';
      for (let i = 0; i < openArr; i++) c4 += ']';
      for (let i = 0; i < openObj; i++) c4 += '}';
      try { return JSON.parse(c4); } catch (e) {}
      return null;
    };

    let parsed = tryParse(text);

    // 1차 파싱 실패 시 한 번 재시도 (seed 살짝 바꿔서)
    if (!parsed) {
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

    return res.status(200).json({ ok: true, eval_type, model, result: parsed });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e), stack: e.stack?.split('\n').slice(0, 5).join('\n') });
  }
}
