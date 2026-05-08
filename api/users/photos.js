// 사용자 사진 lazy 로드 — /api/db/load 에서 photo 컬럼 제외(페이로드 절감) → 별도 호출
// 필요한 시점(렌더 직전) 에 한 번만 호출하고 클라이언트가 캐시.

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 30 };

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const sbAdmin = SB_URL && SB_SERVICE_KEY
  ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } })
  : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!JWT_SECRET || !sbAdmin) return res.status(500).json({ ok: false, error: '서버 설정 오류' });

  // 인증 (만료 토큰 차단)
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  try { jwt.verify(token, JWT_SECRET); }
  catch (e) { return res.status(401).json({ ok: false, error: '인증 만료' }); }

  try {
    const { ids, org } = req.body || {};
    let q = sbAdmin.from('users_safe').select('id,photo');
    if (Array.isArray(ids) && ids.length) {
      // 특정 사용자 ID 들만
      q = q.in('id', ids.slice(0, 200)); // 안전 상한
    } else if (org) {
      // 조직 단위
      q = q.eq('org_name', org);
    }
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    // photo 가 NULL 이거나 빈 사용자는 제외 (네트워크 절감)
    const photos = (data || [])
      .filter(r => r && r.photo)
      .map(r => ({ id: r.id, photo: r.photo }));

    // 캐시 가능 — private (사용자별) · 5분
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ ok: true, photos });
  } catch (e) {
    console.error('[users/photos] error:', e);
    return res.status(500).json({ ok: false, error: e.message || '사진 로드 실패' });
  }
}
