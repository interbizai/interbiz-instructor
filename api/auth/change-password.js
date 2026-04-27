import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 10 };

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const sbAdmin = SB_URL && SB_SERVICE_KEY ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } }) : null;

function isBcryptHash(s) {
  return typeof s === 'string' && /^\$2[aby]?\$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!JWT_SECRET || !sbAdmin) {
    console.error('[change-password] env missing');
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
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) return res.status(400).json({ ok: false, error: '현재/새 비밀번호 모두 필요' });
    if (!decoded.sub || decoded.sub === 0) return res.status(403).json({ ok: false, error: '본인 계정만 변경 가능합니다.' });

    const { data: user, error: fetchErr } = await sbAdmin.from('users').select('id, pw').eq('id', decoded.sub).maybeSingle();
    if (fetchErr || !user) {
      console.error('[change-password] user fetch error:', fetchErr);
      return res.status(500).json({ ok: false, error: '사용자 조회 실패' });
    }

    const stored = user.pw || '';
    const oldStr = String(oldPassword);
    let oldOk = false;
    if (isBcryptHash(stored)) {
      oldOk = await bcrypt.compare(oldStr, stored);
    } else {
      oldOk = stored === oldStr;
    }
    if (!oldOk) return res.status(401).json({ ok: false, error: '현재 비밀번호가 일치하지 않습니다.' });

    const newPwStr = String(newPassword);
    if (newPwStr.length < 4) return res.status(400).json({ ok: false, error: '새 비밀번호는 4자 이상이어야 합니다.' });
    if (newPwStr === oldStr) return res.status(400).json({ ok: false, error: '새 비밀번호가 기존과 동일합니다.' });

    const hash = await bcrypt.hash(newPwStr, 10);
    const { error: upErr } = await sbAdmin.from('users').update({ pw: hash }).eq('id', user.id);
    if (upErr) {
      console.error('[change-password] update error:', upErr);
      return res.status(500).json({ ok: false, error: '비밀번호 변경 실패' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[change-password] unexpected error:', e);
    return res.status(500).json({ ok: false, error: '비밀번호 변경 처리 중 오류' });
  }
}
