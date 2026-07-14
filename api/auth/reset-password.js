import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 10 };

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const sbAdmin = SB_URL && SB_SERVICE_KEY ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } }) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!JWT_SECRET || !sbAdmin) {
    console.error('[reset-password] env missing');
    return res.status(500).json({ ok: false, error: '서버 설정 오류' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ ok: false, error: '인증 만료. 다시 로그인해주세요.' });
  }

  try {
    const { userId, newPassword = '0000' } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: 'userId 필요' });

    if (!decoded.isAdmin && decoded.sub !== userId) {
      return res.status(403).json({ ok: false, error: '관리자 또는 본인만 가능합니다.' });
    }

    // 조직 경계 검증 — 관리자/부관리자는 같은 조직의 계정만 초기화 가능
    if (decoded.sub !== userId) {
      let actorOrg = null;
      if (decoded.sub === 0) {
        actorOrg = decoded.org || null;
      } else {
        const { data: me } = await sbAdmin.from('users').select('org_name').eq('id', decoded.sub).maybeSingle();
        actorOrg = me?.org_name || null;
      }
      const { data: target } = await sbAdmin.from('users').select('org_name').eq('id', userId).maybeSingle();
      if (actorOrg && target && String(target.org_name || '') !== String(actorOrg)) {
        return res.status(403).json({ ok: false, error: '다른 조직의 계정은 초기화할 수 없습니다.' });
      }
    }

    const newPwStr = String(newPassword);
    const hash = await bcrypt.hash(newPwStr, 10);
    const { error } = await sbAdmin.from('users').update({ pw: hash }).eq('id', userId);
    if (error) {
      console.error('[reset-password] update error:', error);
      return res.status(500).json({ ok: false, error: '비밀번호 초기화 실패' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[reset-password] unexpected error:', e);
    return res.status(500).json({ ok: false, error: '비밀번호 초기화 처리 중 오류' });
  }
}
