import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 30 };

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
  const a = verifyAuth(req);
  if (!a.ok) return res.status(401).json({ ok: false, error: a.error });
  if (!sbAdmin) {
    console.error('[db/load] sbAdmin not initialized');
    return res.status(500).json({ ok: false, error: '서버 설정 오류' });
  }

  try {
    const decoded = a.decoded;
    const isRealAdmin = decoded.sub === 0;
    let viewerOrg = null;

    if (!isRealAdmin && decoded.sub) {
      const { data: user } = await sbAdmin.from('users').select('id, org_name').eq('id', decoded.sub).maybeSingle();
      viewerOrg = user?.org_name || '';
    }

    const filterOrg = (req.body && req.body.org) || null;
    const targetOrg = isRealAdmin ? filterOrg : viewerOrg;

    const orgEq = (q) => targetOrg ? q.eq('org_name', targetOrg) : q;

    const [usersR, videosR, evalR, voiceR] = await Promise.all([
      orgEq(sbAdmin.from('users_safe').select('*').order('id')),
      orgEq(sbAdmin.from('videos').select('*').order('id')),
      orgEq(sbAdmin.from('evaluations').select('*').order('created_at', { ascending: false })),
      orgEq(sbAdmin.from('voice_evals').select('*').order('created_at', { ascending: false })),
    ]);

    const videos = videosR.data || [];
    const videoIds = videos.map(v => v.id);
    let timestamps = [];
    if (videoIds.length) {
      const { data: ts } = await sbAdmin.from('timestamps').select('*').in('video_id', videoIds).order('id');
      timestamps = ts || [];
    }

    return res.status(200).json({
      ok: true,
      users: usersR.data || [],
      videos,
      timestamps,
      evaluations: evalR.data || [],
      voice_evals: voiceR.data || [],
      meta: {
        viewer_org: viewerOrg,
        is_real_admin: isRealAdmin,
        active_org: targetOrg,
      }
    });
  } catch (e) {
    console.error('[db/load] error:', e);
    return res.status(500).json({ ok: false, error: '데이터 로드 실패' });
  }
}
