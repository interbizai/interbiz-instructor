import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const config = { maxDuration: 60 };  // Vercel hobby 무료 60s까지 가능

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

  // 타이밍 로그 — 다음 504 발생 시 어느 쿼리가 느린지 즉시 파악
  const t0 = Date.now();
  const timing = {};
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

    // ⚡ 핵심 최적화 — users_safe SELECT * 하되 photo 는 서버에서 잘라냄 (USERS_LITE_COLS 명시 시
    //   존재하지 않는 컬럼이 하나라도 있으면 전체 SELECT 실패 → users 0명 반환되는 버그 회피)
    //   photo 는 별도 lazy load (/api/users/photos)
    const corePromises = wantCore ? [
      orgEq(sbAdmin.from('users_safe').select('*').order('id')),
      orgEq(sbAdmin.from('videos').select('*').order('id')),
      orgEq(sbAdmin.from('evaluations').select('*').order('created_at', { ascending: false }).limit(500)),
      orgEq(sbAdmin.from('voice_evals').select('*').order('created_at', { ascending: false }).limit(500)),
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

    const t1 = Date.now();
    const all = await Promise.all([...corePromises, ...contentPromises].map(p => p || Promise.resolve({ data: [] })));
    timing.coreContent = Date.now() - t1;
    const [usersR, videosR, evalR, voiceR, calR, linkR, recR, contR, noticeR, featR, checkR] = all;

    const videos = videosR.data || [];
    let timestamps = [];
    if (wantCore && videos.length) {
      const t2 = Date.now();
      const videoIds = videos.map(v => v.id);
      const { data: ts } = await sbAdmin.from('timestamps').select('*').in('video_id', videoIds).order('id');
      timestamps = ts || [];
      timing.timestamps = Date.now() - t2;
    }

    // 전체 조직 목록 — core 또는 full 일 때만 (content 단독 호출 시 불필요)
    let orgList = [];
    if (wantCore) {
      const t3 = Date.now();
      const { data: distinctOrgs } = await sbAdmin.from('users').select('org_name').not('org_name', 'is', null);
      orgList = [...new Set((distinctOrgs || []).map(u => u.org_name).filter(Boolean))].sort();
      timing.orgList = Date.now() - t3;
    }

    // 타이밍 로그 (Vercel Functions 로그에서 확인 가능)
    timing.total = Date.now() - t0;
    if (timing.total > 3000) {
      console.warn(`[db/load] slow response — tier=${tier} timing=${JSON.stringify(timing)} users=${(usersR.data||[]).length} videos=${videos.length} evals=${(evalR.data||[]).length}`);
    }

    // 약한 캐시 — 같은 사용자/조직이면 5초간 브라우저 캐시 (F5 연타 방지)
    res.setHeader('Cache-Control', 'private, max-age=5');
    res.setHeader('X-Timing', JSON.stringify(timing));

    // photo 컬럼은 페이로드 절감 위해 서버에서 잘라냄 (lazy 로드 사용)
    const usersStripped = (usersR.data || []).map(u => {
      if (u && 'photo' in u) { const { photo, ...rest } = u; return rest; }
      return u;
    });

    return res.status(200).json({
      ok: true,
      tier,
      users: usersStripped,
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
