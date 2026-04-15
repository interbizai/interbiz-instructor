import { VertexAI } from '@google-cloud/vertexai';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const mode = (req.query.mode || '').toString();

  const projectId = process.env.GCP_PROJECT_ID;
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const rawKey = process.env.GCP_PRIVATE_KEY || '';
  const privateKey = rawKey.replace(/\\n/g, '\n');

  // ── 진단 모드: 환경변수 상태만 리턴 (값은 마스킹) ───────────────
  if (mode === 'diag') {
    return res.status(200).json({
      ok: true,
      mode: 'diag',
      project_id: projectId || null,
      client_email_masked: clientEmail ? clientEmail.replace(/(.{4}).+(@.+)/, '$1***$2') : null,
      private_key_raw_length: rawKey.length,
      private_key_after_replace_length: privateKey.length,
      private_key_starts_with_begin: privateKey.startsWith('-----BEGIN PRIVATE KEY-----'),
      private_key_ends_with_end: privateKey.trimEnd().endsWith('-----END PRIVATE KEY-----'),
      private_key_has_literal_backslash_n: rawKey.includes('\\n'),
      private_key_has_real_newline: rawKey.includes('\n'),
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
      location: 'asia-northeast3',
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
      location: 'asia-northeast3',
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
