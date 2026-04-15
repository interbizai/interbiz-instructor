import { VertexAI } from '@google-cloud/vertexai';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  try {
    const projectId = process.env.GCP_PROJECT_ID;
    const clientEmail = process.env.GCP_CLIENT_EMAIL;
    const privateKey = (process.env.GCP_PRIVATE_KEY || '').replace(/\\n/g, '\n');

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
        credentials: { client_email: clientEmail, private_key: privateKey },
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
