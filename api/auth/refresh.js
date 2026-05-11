// F4: 토큰 사전 갱신 — 만료 임박(< 24h) 토큰을 받아 새 토큰 발급
// - 현재 토큰이 유효해야 함 (만료된 토큰은 401)
// - 50명 동시 만료 폭주 방지 — 클라이언트가 사전 갱신 호출
// - 부담 낮음: bcrypt 호출 없이 jwt.verify + jwt.sign 만

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 10 };

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const sbAdmin = SB_URL && SB_SERVICE_KEY
  ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } })
  : null;

function signToken(payload) {
  const baseSeconds = 7 * 24 * 60 * 60;
  const jitter = Math.floor(Math.random() * (12 * 60 * 60));
  return jwt.sign(payload, JWT_SECRET, { expiresIn: baseSeconds + jitter });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: '서버 설정 오류' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ ok: false, error: '토큰 만료/무효 — 다시 로그인 필요' });
  }

  // 관리자(sub=0)는 사용자 조회 없이 즉시 갱신
  if (decoded.isAdmin && decoded.sub === 0) {
    const newToken = signToken({ sub: 0, email: decoded.email, isAdmin: true });
    return res.status(200).json({ ok: true, token: newToken });
  }

  // 일반 강사는 DB 에서 현 상태 확인 — 삭제·권한 변경 반영
  try {
    if (!sbAdmin) return res.status(500).json({ ok: false, error: 'DB 미연결' });
    const { data: user, error } = await sbAdmin
      .from('users')
      .select('id, email, deleted_at, is_sub_admin')
      .eq('id', decoded.sub)
      .maybeSingle();
    if (error || !user) return res.status(401).json({ ok: false, error: '사용자 없음' });
    if (user.deleted_at) return res.status(403).json({ ok: false, error: '삭제된 계정' });
    const isSub = !!user.is_sub_admin;
    const newToken = signToken({ sub: user.id, email: user.email, isAdmin: isSub });
    return res.status(200).json({ ok: true, token: newToken });
  } catch (e) {
    console.error('[refresh] error:', e);
    return res.status(500).json({ ok: false, error: '갱신 실패' });
  }
}
