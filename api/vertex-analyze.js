import { VertexAI } from '@google-cloud/vertexai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

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
      ? `당신은 현장강사 평가 전문가입니다. 업로드된 영상과 교육자료(시나리오/평가안)를 모두 세세히 확인하여, 아래 체크리스트 기준으로 평가합니다. 영상이 교육자료에 부합했는지 대조하며 판정해야 합니다.`
      : `당신은 현장강사 평가 전문가입니다. 업로드된 영상만 독립적으로 확인하여, 아래 체크리스트 기준으로 평가합니다. 교육자료는 참고하지 않습니다.`;

  return `${evalContext}

# 체크리스트 (100점 만점)
${JSON.stringify(checklistSpec, null, 2)}

# 채점 규칙
- 각 세부항목은 3단계 판정: "good"(잘했다=배점 100%), "normal"(보통=배점 60%), "bad"(못했다=0점)
- 판정 불가(해당없음)인 경우 "na"로 표기 — 최종 점수 계산에서 해당 항목은 제외되고, 남은 항목으로 100점 환산
- 시점(timestamp)은 영상 내 MM:SS 또는 MM:SS-MM:SS 형식으로 구체적으로 적기
- reason/analysis는 한국어로 구체적으로 (영상 속 실제 장면/발언 인용 권장)

# 응답 JSON 스키마 (반드시 이 구조로만 응답)
{
  "overall_score": 0~100 정수(해당없음 제외 환산),
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
  "habits": [{"word":"반복어","count":int,"timestamps":["MM:SS",...],"solution":"줄이는 솔루션"}],
  "engagement_gaps_minutes": [분단위 간격 배열 (예: [7,12,9])],
  "mood": "열정적이고 에너지 넘치는|밝고 경쾌한|친근하고 편안한|전문적이고 진지한|차분하고 신뢰감 있는|재미있고 유머러스한",
  "decibel": 대략적 dB 값(int),
  "tempo_wpm": 분당 단어수(int)
}

# good/bad/upgrade 개수 규칙
- good 최소 3개, bad 최소 3개, upgrade 최소 3개 (각각 최대 5개)
- scenarios/level_tips/teaching_patterns: 각 3~5개

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

    const gm = vertex.getGenerativeModel({
      model,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 16384,
      },
    });

    // 우선순위: gs:// URI(GCS) → fileData 직접 전달 (크기 제한 없음)
    // 폴백: HTTPS URL → inlineData(base64) (~18MB 이내만)
    const parts = [];
    // fps 기본 0.5 (초당 0.5프레임 = 2초마다 1장) → 약 17분 영상까지 Flash 한도 내 처리 가능
    // 요청으로 override 가능 (예: 긴 영상은 fps=0.2)
    const fps = typeof req.body.fps === 'number' ? req.body.fps : 0.5;
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
        eduInlineText = `\n\n${edu.label}\n${edu.text.slice(0, 30000)}`;
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

    // 마크다운 코드펜스 제거
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    // 첫 {부터 마지막 }까지 추출
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    let parsed = null;
    try { parsed = JSON.parse(cleaned); } catch (e) {
      return res.status(502).json({
        ok: false,
        error: `AI 응답 JSON 파싱 실패 (finishReason=${finishReason})`,
        raw_head: text.slice(0, 500),
        raw_tail: text.slice(-500),
        raw_length: text.length,
        parse_error: e.message,
      });
    }

    return res.status(200).json({ ok: true, eval_type, model, result: parsed });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e), stack: e.stack?.split('\n').slice(0, 5).join('\n') });
  }
}
