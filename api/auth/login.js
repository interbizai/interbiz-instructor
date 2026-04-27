import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 10 };

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin';
const ADMIN_PIN = process.env.ADMIN_PIN || '';

const sbAdmin = SB_URL && SB_SERVICE_KEY ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } }) : null;

function isBcryptHash(s) {
  return typeof s === 'string' && /^\$2[aby]?\$/.test(s);
}

function findNonAscii(s) {
  if (!s) return null;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 127) return { index: i, char: s[i], code: c };
  }
  return null;
}

function envHealthCheck() {
  const checks = [
    ['SUPABASE_URL', SB_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SB_SERVICE_KEY],
    ['JWT_SECRET', JWT_SECRET],
    ['ADMIN_PIN', ADMIN_PIN],
  ];
  for (const [name, val] of checks) {
    const bad = findNonAscii(val);
    if (bad) {
      return `환경변수 ${name} 의 ${bad.index}번째 글자가 비영문(코드 ${bad.code}, 글자 "${bad.char}") — Vercel에서 재등록 필요. 길이=${val.length}`;
    }
  }
  return null;
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function stripSensitive(user) {
  if (!user) return null;
  const { pw, ...safe } = user;
  return safe;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!JWT_SECRET || !sbAdmin) {
    console.error('[login] env missing — JWT_SECRET=' + !!JWT_SECRET + ' sbAdmin=' + !!sbAdmin);
    return res.status(500).json({ ok: false, error: '서버 설정 오류' });
  }
  const envBad = envHealthCheck();
  if (envBad) {
    console.error('[login] env health check failed:', envBad);
    return res.status(500).json({ ok: false, error: '서버 설정 오류' });
  }

  try {
    const { email = '', password = '' } = req.body || {};
    const em = String(email).trim();
    const pw = String(password).trim();
    if (!em || !pw) return res.status(400).json({ ok: false, error: '이메일/비밀번호 필요' });

    if (em === ADMIN_EMAIL && ADMIN_PIN && pw === ADMIN_PIN) {
      const adminUser = { id: 0, name: '관리자', email: ADMIN_EMAIL, grade: 'A', channel: '', isAdmin: true };
      const token = signToken({ sub: 0, email: ADMIN_EMAIL, isAdmin: true });
      return res.status(200).json({ ok: true, token, user: adminUser });
    }

    const { data: user, error } = await sbAdmin.from('users').select('*').eq('email', em).maybeSingle();
    if (error) {
      console.error('[login] DB query error:', error);
      return res.status(500).json({ ok: false, error: '로그인 처리 중 오류' });
    }
    if (!user) return res.status(401).json({ ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    if (user.deleted_at) return res.status(403).json({ ok: false, error: '삭제된 계정입니다. 관리자에게 문의하세요.' });

    const stored = user.pw || '';
    let ok = false;
    if (isBcryptHash(stored)) {
      ok = await bcrypt.compare(pw, stored);
    } else {
      ok = stored === pw;
      if (ok) {
        try {
          const hash = await bcrypt.hash(pw, 10);
          await sbAdmin.from('users').update({ pw: hash }).eq('id', user.id);
        } catch (e) {}
      }
    }
    if (!ok) return res.status(401).json({ ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    const token = signToken({ sub: user.id, email: user.email, isAdmin: !!user.isSubAdmin });
    return res.status(200).json({ ok: true, token, user: stripSensitive(user) });
  } catch (e) {
    console.error('[login] unexpected error:', e);
    return res.status(500).json({ ok: false, error: '로그인 처리 중 오류' });
  }
}
