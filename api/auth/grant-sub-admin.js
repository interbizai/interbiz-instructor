import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 10 };

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const sbAdmin = SB_URL && SB_SERVICE_KEY ? createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } }) : null;

function verifyAuth(req) {
  if (!JWT_SECRET) return { ok: false, error: '서버 설정 오류' };
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { ok: false, error: '인증 필요' };
  try {
    return { ok: true, decoded: jwt.verify(token, JWT_SECRET) };
  } catch (e) {
    return { ok: false, error: '인증 만료' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!sbAdmin) return res.status(500).json({ ok: false, error: '서버 설정 오류' });

  const a = verifyAuth(req);
  if (!a.ok) return res.status(401).json({ ok: false, error: a.error });

  const decoded = a.decoded;
  const isRealAdmin = decoded.sub === 0;
  // 진짜 관리자만 부관리자 권한을 부여/취소 가능 (부관리자 자신은 권한 변경 불가)
  if (!isRealAdmin) return res.status(403).json({ ok: false, error: '진짜 관리자만 가능합니다.' });

  try {
    const { userId, grant } = req.body || {};
    if (typeof userId !== 'number' || typeof grant !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'userId(number), grant(boolean) 필요' });
    }

    // 조직 경계 검증 — 로그인한 조직의 계정에만 권한 부여/취소 가능
    if (decoded.org) {
      const { data: target } = await sbAdmin.from('users').select('org_name').eq('id', userId).maybeSingle();
      if (target && String(target.org_name || '') !== String(decoded.org)) {
        return res.status(403).json({ ok: false, error: '다른 조직의 계정에는 권한을 변경할 수 없습니다.' });
      }
    }

    const { error } = await sbAdmin
      .from('users')
      .update({ is_sub_admin: grant })
      .eq('id', userId);

    if (error) {
      console.error('[grant-sub-admin] update error:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, userId, isSubAdmin: grant });
  } catch (e) {
    console.error('[grant-sub-admin] unexpected:', e);
    return res.status(500).json({ ok: false, error: '권한 변경 중 오류' });
  }
}
