import { VertexAI } from '@google-cloud/vertexai';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const mode = (req.query.mode || '').toString();

  let projectId = process.env.GCP_PROJECT_ID;
  let clientEmail = process.env.GCP_CLIENT_EMAIL;
  let rawKey = process.env.GCP_PRIVATE_KEY || '';
  let privateKey = rawKey.replace(/\\n/g, '\n');

  // ── 통합 방식: GCP_CREDENTIALS_JSON 하나에 JSON 전체가 들어온 경우 우선 사용 ──
  const credJson = process.env.GCP_CREDENTIALS_JSON;
  let credSource = 'split';
  if (credJson) {
    try {
      const parsed = JSON.parse(credJson);
      projectId = parsed.project_id || projectId;
      clientEmail = parsed.client_email || clientEmail;
      privateKey = (parsed.private_key || '').replace(/\\n/g, '\n');
      rawKey = privateKey;
      credSource = 'unified-json';
    } catch (e) {
      credSource = 'unified-json-parse-failed:' + e.message;
    }
  }

  // ── 진단 모드: 환경변수 상태만 리턴 (값은 마스킹) ───────────────
  if (mode === 'diag') {
    return res.status(200).json({
      ok: true,
      mode: 'diag',
      cred_source: credSource,
      has_unified_json: !!credJson,
      unified_json_length: credJson ? credJson.length : 0,
      project_id: projectId || null,
      client_email_masked: clientEmail ? clientEmail.replace(/(.{4}).+(@.+)/, '$1***$2') : null,
      private_key_length: privateKey.length,
      private_key_starts_with_begin: privateKey.startsWith('-----BEGIN PRIVATE KEY-----'),
      private_key_ends_with_end: privateKey.trimEnd().endsWith('-----END PRIVATE KEY-----'),
      private_key_line_count: privateKey.split('\n').length,
    });
  }

  try {
    if (!projectId || !clientEmail || !privateKey) {
      return res.status(500).json({
        ok: false,
        error: 'Missing environment variables',
        have: {
          GCP_PROJECT_ID: !!projectId,
          GCP_CLIENT_EMAIL: !!clientEmail,
          GCP_PRIVATE_KEY: !!privateKey,
        },
      });
    }

    const vertex = new VertexAI({
      project: projectId,
      location: 'global',
      googleAuthOptions: {
        projectId,
        credentials: {
          type: 'service_account',
          project_id: projectId,
          client_email: clientEmail,
          private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
    });

    const model = vertex.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: '한 문장으로 자기소개 해봐.' }] }],
    });

    const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.status(200).json({
      ok: true,
      project: projectId,
      model: 'gemini-2.5-flash',
      location: 'global',
      response: text,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message || String(e),
      stack: e.stack?.split('\n').slice(0, 5).join('\n'),
    });
  }
}
