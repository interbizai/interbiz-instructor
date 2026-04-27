import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export const config = { maxDuration: 60 };

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.ADMIN_PIN || '';

const sbAdmin = SB_URL && SB_SERVICE_KEY ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } }) : null;

function isBcryptHash(s) {
  return typeof s === 'string' && /^\$2[aby]?\$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!sbAdmin) return res.status(500).json({ ok: false, error: 'Supabase service 키 미설정' });

  const token = req.headers['x-admin-token'] || (req.body && req.body.admin_token) || '';
  if (!ADMIN_PIN || token !== ADMIN_PIN) {
    return res.status(401).json({ ok: false, error: '관리자 토큰 불일치' });
  }

  const dryRun = !!(req.body && req.body.dry_run);

  try {
    const { data: users, error } = await sbAdmin.from('users').select('id, email, pw');
    if (error) return res.status(500).json({ ok: false, error: 'users 조회 실패: ' + error.message });

    const report = { total: users.length, already_hashed: 0, hashed_now: 0, skipped_empty: 0, failed: [] };

    for (const u of users) {
      if (!u.pw) { report.skipped_empty++; continue; }
      if (isBcryptHash(u.pw)) { report.already_hashed++; continue; }
      if (dryRun) { report.hashed_now++; continue; }
      try {
        const hash = await bcrypt.hash(u.pw, 10);
        const { error: upErr } = await sbAdmin.from('users').update({ pw: hash }).eq('id', u.id);
        if (upErr) report.failed.push({ id: u.id, email: u.email, reason: upErr.message });
        else report.hashed_now++;
      } catch (e) {
        report.failed.push({ id: u.id, email: u.email, reason: e.message || String(e) });
      }
    }

    return res.status(200).json({ ok: true, dry_run: dryRun, report });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
