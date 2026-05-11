// 프로필 사진 업데이트 — base64 → Supabase Storage 업로드 → URL 저장
// (이전: DB users.photo 에 base64 저장 → 5MB 한도/응답 폭증)
// (현재: Storage 'user_photos/{userId}.{ext}' 업로드 → 공개 URL 만 DB 저장)

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: '6mb' } },
};

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const sbAdmin = SB_URL && SB_SERVICE_KEY
  ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } })
  : null;

const BUCKET = 'user_photos';

// dataURL → Buffer + mime
function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  return { mime, buf };
}

function extFromMime(mime) {
  if (/png/.test(mime)) return 'png';
  if (/webp/.test(mime)) return 'webp';
  if (/gif/.test(mime)) return 'gif';
  return 'jpg';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!JWT_SECRET || !sbAdmin) return res.status(500).json({ ok: false, error: '서버 설정 오류' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ ok: false, error: '인증 만료' });
  }

  try {
    const { photo } = req.body || {};
    if (!decoded.sub || decoded.sub === 0) return res.status(403).json({ ok: false, error: '본인 계정만 변경 가능' });

    // photo: null / 빈 문자열 → 사진 제거
    if (photo === null || photo === '') {
      const { error: upErr } = await sbAdmin
        .from('users')
        .update({ photo: null })
        .eq('id', decoded.sub);
      if (upErr) return res.status(500).json({ ok: false, error: upErr.message });
      return res.status(200).json({ ok: true, saved: false, photoUrl: null });
    }

    if (typeof photo !== 'string') {
      return res.status(400).json({ ok: false, error: 'photo 형식 오류' });
    }

    // 기존 URL 형식이면 그대로 저장 (마이그레이션 호환)
    if (photo.startsWith('http://') || photo.startsWith('https://')) {
      const { error: upErr } = await sbAdmin
        .from('users')
        .update({ photo })
        .eq('id', decoded.sub);
      if (upErr) return res.status(500).json({ ok: false, error: upErr.message });
      return res.status(200).json({ ok: true, saved: true, photoUrl: photo, length: photo.length });
    }

    // dataURL 인 경우 → Storage 에 업로드 후 URL 저장
    const parsed = parseDataUrl(photo);
    if (!parsed) return res.status(400).json({ ok: false, error: 'photo 는 data:image/... 또는 https:// URL 만 허용' });

    if (parsed.buf.length > 3 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: '이미지가 너무 큽니다 (3MB 초과)' });
    }

    const ext = extFromMime(parsed.mime);
    // 사용자 ID 기반 고정 경로 — 새 사진 업로드 시 자동 덮어쓰기 (upsert)
    const path = `${decoded.sub}/${decoded.sub}.${ext}`;

    const { error: upErr } = await sbAdmin.storage
      .from(BUCKET)
      .upload(path, parsed.buf, {
        contentType: parsed.mime,
        upsert: true,
        cacheControl: '3600',
      });
    if (upErr) {
      console.error('[update-photo] storage upload:', upErr);
      return res.status(500).json({ ok: false, error: 'Storage 업로드 실패: ' + upErr.message });
    }

    const { data: pub } = sbAdmin.storage.from(BUCKET).getPublicUrl(path);
    const photoUrl = pub?.publicUrl || '';
    if (!photoUrl) return res.status(500).json({ ok: false, error: 'Public URL 발급 실패' });

    // 캐시 무효화 — 같은 경로 재업로드 시 즉시 갱신
    const versionedUrl = photoUrl + '?v=' + Date.now();

    const { error: dbErr } = await sbAdmin
      .from('users')
      .update({ photo: versionedUrl })
      .eq('id', decoded.sub);
    if (dbErr) {
      console.error('[update-photo] db update:', dbErr);
      return res.status(500).json({ ok: false, error: 'DB 저장 실패: ' + dbErr.message });
    }

    return res.status(200).json({
      ok: true,
      saved: true,
      photoUrl: versionedUrl,
      length: versionedUrl.length,
      bytes: parsed.buf.length,
    });
  } catch (e) {
    console.error('[update-photo] unexpected:', e);
    return res.status(500).json({ ok: false, error: e.message || '사진 처리 중 오류' });
  }
}
