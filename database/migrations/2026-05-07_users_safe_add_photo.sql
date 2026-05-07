-- users_safe 뷰에 photo 컬럼 누락 → 새로고침 시 프로필 사진 사라지는 버그 수정
-- 실행: Supabase SQL Editor 에서 1회 실행
-- 안전: 비밀번호(pw) 제외한 모든 컬럼을 명시적으로 포함하여 뷰 재생성

CREATE OR REPLACE VIEW public.users_safe AS
SELECT
  id,
  name,
  email,
  channel,
  team,
  position,
  birth_year,
  birth_date,
  hire_date,
  phone,
  photo,                  -- ★ 누락되어 있었던 컬럼
  memo,
  score,
  grade,
  grade_override,
  lg_career_start,
  teach_career_start,
  scores,
  maxes,
  habits,
  habit_counts,
  engagement_gaps,
  decibel,
  tempo,
  student_count,
  is_sub_admin,
  satisfaction,
  org_name,
  office,
  status,
  deleted_at,
  created_at,
  updated_at
FROM public.users;

-- RLS 무관: VIEW 는 underlying table(users) 의 RLS 를 그대로 따름
-- pw 컬럼만 의도적으로 노출 안 함 (보안)

COMMENT ON VIEW public.users_safe IS 'users 테이블에서 비밀번호(pw)만 제외하고 노출 — 클라이언트가 SELECT 용도로 사용';
