import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export const config = { maxDuration: 10 };

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbAdmin = SB_URL && SB_SERVICE_KEY ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } }) : null;

function stripPw(user) {
  if (!user) return null;
  const { pw, ...safe } = user;
  return safe;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!sbAdmin) {
    console.error('[create-user] sbAdmin not initialized');
    return res.status(500).json({ ok: false, error: '서버 설정 오류' });
  }

  try {
    const u = req.body || {};
    if (!u.email || !u.name) return res.status(400).json({ ok: false, error: '이름/이메일 필요' });

    const plainPw = String(u.pw || '1234');
    const hashedPw = await bcrypt.hash(plainPw, 10);

    const full = {
      name: u.name,
      email: u.email,
      pw: hashedPw,
      channel: u.channel || '',
      team: u.team || '',
      birth_year: u.birthYear || null,
      hire_date: u.hireDate || null,
      phone: u.phone || '',
      photo: u.photo || null,
      memo: '',
      score: 0,
      grade: '—',
      scores: {},
      maxes: { 발성: 20, 전문성: 25, 판서: 15, 상호작용: 20, 시간관리: 10, 마무리: 10 },
      habits: [],
      habit_counts: [],
      engagement_gaps: [],
      decibel: 0,
      tempo: 0,
      student_count: 0,
      org_name: u.orgName || null,
      office: u.office || null,
      birth_date: u.birthDate || null,
      status: u.status || '근무',
      position: u.position || '현장강사',
    };

    let { data, error } = await sbAdmin.from('users').insert(full).select().single();

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('column') && msg.includes('position')) {
        const { position, ...noPos } = full;
        ({ data, error } = await sbAdmin.from('users').insert(noPos).select().single());
      }
    }

    if (error) {
      console.error('[create-user] insert error:', error);
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
        return res.status(409).json({ ok: false, error: '이미 등록된 이메일입니다.' });
      }
      return res.status(500).json({ ok: false, error: '강사 추가 실패' });
    }

    return res.status(200).json({ ok: true, user: stripPw(data) });
  } catch (e) {
    console.error('[create-user] unexpected error:', e);
    return res.status(500).json({ ok: false, error: '강사 추가 처리 중 오류' });
  }
}
