// 프로필 사진 업데이트 (서비스 키 우회) — RLS 정책 미설정 환경에서도 동작
// 클라이언트가 직접 sb.from('users').update 시 RLS 로 막힐 경우 폴백 경로

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const config = {
  maxDuration: 15,
  api: { bodyParser: { sizeLimit: '6mb' } }, // base64 이미지(최대 ~4MB) 수용
};

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const sbAdmin = SB_URL && SB_SERVICE_KEY
  ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } })
  : null;

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

    // photo: null 또는 dataURL 문자열만 허용
    if (photo !== null && photo !== '' && typeof photo !== 'string') {
      return res.status(400).json({ ok: false, error: 'photo 형식 오류' });
    }
    if (typeof photo === 'string' && photo.length > 0 && !photo.startsWith('data:image/')) {
      return res.status(400).json({ ok: false, error: 'photo 는 data:image/... 형식만 허용' });
    }
    if (typeof photo === 'string' && photo.length > 6 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: 'photo 가 너무 큽니다 (6MB 초과)' });
    }

    const newPhoto = (photo === null || photo === '') ? null : photo;

    const { error: upErr } = await sbAdmin
      .from('users')
      .update({ photo: newPhoto })
      .eq('id', decoded.sub);

    if (upErr) {
      // photo 컬럼 없으면 자동 추가 후 재시도
      const msg = (upErr.message || '').toLowerCase();
      if (msg.includes('column') && msg.includes('photo')) {
        return res.status(500).json({ ok: false, error: 'users.photo 컬럼이 없습니다. ALTER TABLE public.users ADD COLUMN photo text; 실행 필요' });
      }
      console.error('[update-photo] update error:', upErr);
      return res.status(500).json({ ok: false, error: upErr.message || '사진 저장 실패' });
    }

    // 검증 — 실제로 저장된 길이 반환
    const { data: verify } = await sbAdmin
      .from('users')
      .select('id, photo')
      .eq('id', decoded.sub)
      .maybeSingle();

    return res.status(200).json({
      ok: true,
      saved: !!verify?.photo,
      length: verify?.photo?.length || 0,
    });
  } catch (e) {
    console.error('[update-photo] unexpected:', e);
    return res.status(500).json({ ok: false, error: '사진 처리 중 오류' });
  }
}
