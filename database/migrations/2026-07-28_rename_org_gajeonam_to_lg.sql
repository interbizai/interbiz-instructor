-- ════════════════════════════════════════════════════════════
-- 조직명 변경: '가전AM' → 'LG전자 강사'
-- 실행 위치: Supabase Dashboard → SQL Editor → 전체 붙여넣기 후 Run
-- 2026-07-28 기준 대상: 총 295행 + 설정 키 4건
--   users 49 / videos 8 / evaluations 57 / voice_evals 15
--   calendar_events 85 / learning_links 6 / checklist_files 11
--   edu_types 8 / edu_categories 6 / badge_criteria 50
--   app_settings 키: pick_top3_가전AM, hero_title_가전AM, hero_sub_가전AM, hero_image_가전AM
-- ════════════════════════════════════════════════════════════

UPDATE users              SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE videos             SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE evaluations        SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE voice_evals        SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE calendar_events    SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE learning_links     SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE recommended_videos SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE pick_contents      SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE pick_notices       SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE pick_featured_videos SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE checklist_files    SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE edu_types          SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE edu_categories     SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';
UPDATE badge_criteria     SET org_name = 'LG전자 강사' WHERE org_name = '가전AM';

-- 조직별 설정 키 (메인 대표 사진/문구, TOP3 등)
UPDATE app_settings SET key = replace(key, '가전AM', 'LG전자 강사') WHERE key LIKE '%가전AM%';

-- ── 검증: 아래 두 쿼리 결과가 모두 0행이면 완료 ──
-- SELECT 'users' t, count(*) FROM users WHERE org_name='가전AM'
-- UNION ALL SELECT 'videos', count(*) FROM videos WHERE org_name='가전AM'
-- UNION ALL SELECT 'evaluations', count(*) FROM evaluations WHERE org_name='가전AM'
-- UNION ALL SELECT 'voice_evals', count(*) FROM voice_evals WHERE org_name='가전AM'
-- UNION ALL SELECT 'calendar_events', count(*) FROM calendar_events WHERE org_name='가전AM'
-- UNION ALL SELECT 'learning_links', count(*) FROM learning_links WHERE org_name='가전AM'
-- UNION ALL SELECT 'checklist_files', count(*) FROM checklist_files WHERE org_name='가전AM'
-- UNION ALL SELECT 'edu_types', count(*) FROM edu_types WHERE org_name='가전AM'
-- UNION ALL SELECT 'edu_categories', count(*) FROM edu_categories WHERE org_name='가전AM'
-- UNION ALL SELECT 'badge_criteria', count(*) FROM badge_criteria WHERE org_name='가전AM';
-- SELECT key FROM app_settings WHERE key LIKE '%가전AM%';
