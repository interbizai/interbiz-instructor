// 기존 base64 사진 → Storage 마이그레이션 (1회용 관리자 API)
// 호출: 관리자 토큰으로 POST → 모든 사용자 photo 컬럼 검사
//       data:image/... 인 경우만 Storage 업로드 후 URL 로 교체
// 결과: 응답 페이로드 99% 감소

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 60 };

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const sbAdmin = SB_URL && SB_SERVICE_KEY
  ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } })
  : null;

const BUCKET = 'user_photos';

function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
}
function extFromMime(m) {
  if (/png/.test(m)) return 'png';
  if (/webp/.test(m)) return 'webp';
  if (/gif/.test(m)) return 'gif';
  return 'jpg';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!JWT_SECRET || !sbAdmin) return res.status(500).json({ ok: false, error: '서버 설정 오류' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); }
  catch (e) { return res.status(401).json({ ok: false, error: '인증 만료' }); }

  // 관리자(부관리자 포함) 만 가능
  if (!decoded.isAdmin) return res.status(403).json({ ok: false, error: '관리자만 가능' });

  try {
    const { data: users, error } = await sbAdmin
      .from('users')
      .select('id, name, email, photo')
      .not('photo', 'is', null);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const results = { total: 0, migrated: 0, skipped: 0, failed: [] };

    for (const u of (users || [])) {
      if (!u.photo) continue;
      results.total++;

      // 이미 URL 형식이면 skip
      if (u.photo.startsWith('http://') || u.photo.startsWith('https://')) {
        results.skipped++;
        continue;
      }

      // data:image/... 인 경우 → Storage 로 이전
      const parsed = parseDataUrl(u.photo);
      if (!parsed) {
        results.failed.push({ id: u.id, name: u.name, reason: 'dataUrl 형식 아님' });
        continue;
      }
      const ext = extFromMime(parsed.mime);
      const path = `${u.id}/${u.id}.${ext}`;

      const { error: upErr } = await sbAdmin.storage
        .from(BUCKET)
        .upload(path, parsed.buf, { contentType: parsed.mime, upsert: true, cacheControl: '3600' });
      if (upErr) {
        results.failed.push({ id: u.id, name: u.name, reason: 'Storage 업로드 실패: ' + upErr.message });
        continue;
      }

      const { data: pub } = sbAdmin.storage.from(BUCKET).getPublicUrl(path);
      const photoUrl = (pub?.publicUrl || '') + '?v=' + Date.now();

      const { error: dbErr } = await sbAdmin
        .from('users')
        .update({ photo: photoUrl })
        .eq('id', u.id);
      if (dbErr) {
        results.failed.push({ id: u.id, name: u.name, reason: 'DB 갱신 실패: ' + dbErr.message });
        continue;
      }

      results.migrated++;
    }

    return res.status(200).json({ ok: true, ...results });
  } catch (e) {
    console.error('[migrate-photos] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
