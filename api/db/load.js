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

    // tier — 'core'(첫 진입 필수만) / 'content'(콘텐츠/공지/달력) / 'full'(전부, 기본)
    const tier = (req.body && req.body.tier) || 'full';
    const wantCore    = tier === 'core' || tier === 'full';
    const wantContent = tier === 'content' || tier === 'full';

    // 핵심 데이터 (users/videos/evaluations/voice_evals)는 강제 조직 매칭
    const orgEq = (q) => targetOrg ? q.eq('org_name', targetOrg) : q;
    // 콘텐츠/공지/달력 등은 NULL(공통 자료) + 본인 조직 모두 보이게
    const orgOrNull = (q) => targetOrg ? q.or(`org_name.eq.${targetOrg},org_name.is.null`) : q;

    const corePromises = wantCore ? [
      orgEq(sbAdmin.from('users_safe').select('*').order('id')),
      orgEq(sbAdmin.from('videos').select('*').order('id')),
      orgEq(sbAdmin.from('evaluations').select('*').order('created_at', { ascending: false })),
      orgEq(sbAdmin.from('voice_evals').select('*').order('created_at', { ascending: false })),
    ] : [null, null, null, null];

    const contentPromises = wantContent ? [
      orgOrNull(sbAdmin.from('calendar_events').select('*').order('start_time', { ascending: true })),
      orgOrNull(sbAdmin.from('learning_links').select('*').order('created_at', { ascending: false })),
      orgOrNull(sbAdmin.from('recommended_videos').select('*').order('created_at', { ascending: false })),
      orgOrNull(sbAdmin.from('pick_contents').select('*').order('created_at', { ascending: false })),
      orgOrNull(sbAdmin.from('pick_notices').select('*').order('created_at', { ascending: false })),
      orgOrNull(sbAdmin.from('pick_featured_videos').select('*').order('order_index', { ascending: true })),
      orgOrNull(sbAdmin.from('checklist_files').select('*').order('created_at', { ascending: false })),
    ] : [null, null, null, null, null, null, null];

    const all = await Promise.all([...corePromises, ...contentPromises].map(p => p || Promise.resolve({ data: [] })));
    const [usersR, videosR, evalR, voiceR, calR, linkR, recR, contR, noticeR, featR, checkR] = all;

    const videos = videosR.data || [];
    let timestamps = [];
    if (wantCore && videos.length) {
      const videoIds = videos.map(v => v.id);
      const { data: ts } = await sbAdmin.from('timestamps').select('*').in('video_id', videoIds).order('id');
      timestamps = ts || [];
    }

    // 전체 조직 목록 — core 또는 full 일 때만 (content 단독 호출 시 불필요)
    let orgList = [];
    if (wantCore) {
      const { data: distinctOrgs } = await sbAdmin.from('users').select('org_name').not('org_name', 'is', null);
      orgList = [...new Set((distinctOrgs || []).map(u => u.org_name).filter(Boolean))].sort();
    }

    // 약한 캐시 — 같은 사용자/조직이면 5초간 브라우저 캐시 (F5 연타 방지)
    res.setHeader('Cache-Control', 'private, max-age=5');

    return res.status(200).json({
      ok: true,
      tier,
      users: usersR.data || [],
      videos,
      timestamps,
      evaluations: evalR.data || [],
      voice_evals: voiceR.data || [],
      calendar_events: calR.data || [],
      learning_links: linkR.data || [],
      recommended_videos: recR.data || [],
      pick_contents: contR.data || [],
      pick_notices: noticeR.data || [],
      pick_featured_videos: featR.data || [],
      checklist_files: checkR.data || [],
      meta: {
        viewer_org: viewerOrg,
        is_real_admin: isRealAdmin,
        active_org: targetOrg,
        org_list: orgList,
      }
    });
  } catch (e) {
    console.error('[db/load] error:', e);
    return res.status(500).json({ ok: false, error: '데이터 로드 실패' });
  }
}
