import { Storage } from '@google-cloud/storage';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 15 };

const GCS_BUCKET = process.env.GCS_BUCKET || 'interbiz-videos';
const JWT_SECRET = process.env.JWT_SECRET;

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

function getCredentials() {
  const credJson = process.env.GCP_CREDENTIALS_JSON;
  if (credJson) {
    try {
      const p = JSON.parse(credJson);
      return { project_id: p.project_id, client_email: p.client_email, private_key: (p.private_key || '').replace(/\\n/g, '\n') };
    } catch (e) {}
  }
  return {
    project_id: process.env.GCP_PROJECT_ID,
    client_email: process.env.GCP_CLIENT_EMAIL,
    private_key: (process.env.GCP_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  const auth = verifyAuth(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });
  try {
    const { filename, content_type = 'video/mp4', folder = 'videos/analysis' } = req.body || {};
    if (!filename) return res.status(400).json({ ok: false, error: 'filename 필요' });

    const creds = getCredentials();
    if (!creds.project_id || !creds.client_email || !creds.private_key) {
      return res.status(500).json({ ok: false, error: 'GCP credentials missing' });
    }

    const storage = new Storage({
      projectId: creds.project_id,
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
    });

    // 타임스탬프 기반 안전한 파일명 (한글 금지)
    const ext = (filename.split('.').pop() || 'mp4').toLowerCase();
    const safeName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(safeName);

    // V4 Signed URL (15분 유효)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: content_type,
    });

    const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${safeName}`;
    const gcsUri = `gs://${GCS_BUCKET}/${safeName}`;

    return res.status(200).json({
      ok: true,
      upload_url: signedUrl,
      public_url: publicUrl,
      gcs_uri: gcsUri,
      path: safeName,
      bucket: GCS_BUCKET,
      content_type,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
