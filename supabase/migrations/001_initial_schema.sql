-- =============================================================================
-- ระบบจัดตารางสอนออนไลน์ (School Timetable Scheduler)
-- Supabase PostgreSQL Schema + Row Level Security + Realtime Publication
-- วิธีใช้: คัดลอกไฟล์นี้ไปรันใน Supabase Dashboard -> SQL Editor -> Run
-- =============================================================================

create extension if not exists "pgcrypto";

-- 1. ปีการศึกษา / ภาคเรียน / โครงสร้างเวลาเรียน (ข้อ 10, 11, 12, 21)
create table if not exists public.academic_terms (
  id text primary key,
  name text not null,
  school_name text not null default 'โรงเรียนตัวอย่างวิทยาคม',
  academic_year text not null default '2569',
  semester text not null default '1',
  is_active boolean not null default true,
  data_entry_open boolean not null default true,
  days_of_week jsonb not null default '["MON","TUE","WED","THU","FRI"]'::jsonb,
  periods_config jsonb not null default '[]'::jsonb,
  breaks_config jsonb not null default '[]'::jsonb,
  solver_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. กลุ่มสาระการเรียนรู้ (ข้อ 7, 10, 11 + สถานะการช่วยกันคีย์ข้อมูล)
create table if not exists public.departments (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  code text not null,
  name text not null,
  color text not null default '#3b82f6',
  exempt_afternoon_streak boolean not null default false,
  exempt_late_period_limit boolean not null default false,
  custom_max_late_period_days integer,
  is_entry_completed boolean not null default false,
  completed_by text,
  updated_at timestamptz not null default now()
);

-- 3. ฝ่ายบริหาร / งานพิเศษ สำหรับล็อคคาบประชุมฝ่าย (ข้อ 7)
create table if not exists public.divisions (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  name text not null,
  color text not null default '#8b5cf6',
  updated_at timestamptz not null default now()
);

-- 4. ห้องเรียนและห้องปฏิบัติการที่ใช้ร่วมกัน (ข้อ 9, 18)
create table if not exists public.rooms (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  code text not null,
  name text not null,
  building text not null default '',
  room_type text not null default 'homeroom',
  max_concurrent_classes integer not null default 1,
  allow_overlap boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.rooms add column if not exists allow_overlap boolean not null default false;

-- 5. ระดับชั้น (ม.1 - ม.6)
create table if not exists public.grade_levels (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  code text not null,
  name text not null,
  stage text not null default 'junior',
  sort_order integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 6. ห้องเรียนนักเรียน + คาบอิสระรายห้อง + ครูที่ปรึกษา (ข้อ 2, 5, 18)
create table if not exists public.classrooms (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  grade_level_id text not null references public.grade_levels(id) on delete cascade,
  name text not null,
  room_number integer not null default 1,
  program_name text not null default 'ห้องเรียนปกติ',
  default_room_id text references public.rooms(id) on delete set null,
  advisor_teacher_ids jsonb not null default '[]'::jsonb,
  free_periods_count integer not null default 0,
  locked_free_slots jsonb not null default '[]'::jsonb,
  preferred_free_periods jsonb not null default '[7, 8]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 7. ครูผู้สอน + คาบไม่ว่างรายคน + ข้อยกเว้นรายบุคคล (ข้อ 7, 8, 10, 11)
create table if not exists public.teachers (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  code text not null,
  prefix text not null default 'ครู',
  first_name text not null,
  last_name text not null,
  department_id text not null references public.departments(id) on delete cascade,
  division_ids jsonb not null default '[]'::jsonb,
  unavailable_slots jsonb not null default '[]'::jsonb,
  exempt_afternoon_streak_override boolean,
  exempt_late_period_limit_override boolean,
  max_late_period_days_override integer,
  updated_at timestamptz not null default now()
);

-- 8. ล็อคคาบประชุมฝ่าย / ประชุมกลุ่มสาระ (ข้อ 7)
create table if not exists public.group_meeting_locks (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  target_type text not null, -- 'department' | 'division'
  target_id text not null,
  title text not null,
  day text not null,
  start_period integer not null,
  duration integer not null default 1,
  room_id text references public.rooms(id) on delete set null,
  coexist_teacher_ids jsonb not null default '[]'::jsonb,
  excluded_teacher_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.group_meeting_locks add column if not exists coexist_teacher_ids jsonb not null default '[]'::jsonb;
alter table public.group_meeting_locks add column if not exists excluded_teacher_ids jsonb not null default '[]'::jsonb;

-- 9. รายวิชา + เงื่อนไขพิเศษรายวิชา เช่น พละคาบ 4/8, ศิลปะก่อนพละ (ข้อ 17)
create table if not exists public.subjects (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  code text not null,
  name text not null,
  short_name text not null default '',
  department_id text not null references public.departments(id) on delete cascade,
  subject_type text not null default 'core',
  credits numeric(4,2) not null default 1.0,
  default_periods_per_week integer not null default 2,
  default_split_pattern jsonb not null default '[1, 1]'::jsonb,
  default_room_id text references public.rooms(id) on delete set null,
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 10. แผนการสอนรายห้อง รองรับครูสอนร่วม >1 คน และห้องแล็บแยกตามคาบ (ข้อ 12, 14, 18)
create table if not exists public.teaching_assignments (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  classroom_id text not null references public.classrooms(id) on delete cascade,
  subject_id text not null references public.subjects(id) on delete cascade,
  periods_per_week integer not null,
  split_sessions jsonb not null default '[]'::jsonb,
  teacher_ids jsonb not null default '[]'::jsonb,
  notes text,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- 11. คาบล็อค/กิจกรรม/ชุมนุม/ลูกเสือ/คุณธรรม/Homeroom/วิชาเลือก/นศท. (ข้อ 1, 3, 4, 5, 6, 13)
create table if not exists public.synchronized_blocks (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  block_type text not null,
  title text not null,
  subject_code text,
  grade_level_ids jsonb not null default '[]'::jsonb,
  classroom_ids jsonb not null default '[]'::jsonb,
  bind_advisors_automatically boolean not null default false,
  teacher_ids jsonb not null default '[]'::jsonb,
  shared_room_id text references public.rooms(id) on delete set null,
  offerings jsonb not null default '[]'::jsonb,
  duration integer not null default 1,
  is_time_locked boolean not null default true,
  fixed_day text,
  fixed_start_period integer,
  coexist_teacher_ids jsonb not null default '[]'::jsonb,
  excluded_teacher_ids jsonb not null default '[]'::jsonb,
  classroom_teacher_map jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.synchronized_blocks add column if not exists coexist_teacher_ids jsonb not null default '[]'::jsonb;
alter table public.synchronized_blocks add column if not exists excluded_teacher_ids jsonb not null default '[]'::jsonb;
alter table public.synchronized_blocks add column if not exists classroom_teacher_map jsonb not null default '{}'::jsonb;

-- 12. เวอร์ชันร่างตารางสอน (Draft / Published Snapshots)
create table if not exists public.timetable_versions (
  id text primary key,
  term_id text not null references public.academic_terms(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  score numeric(10,2) not null default 0,
  hard_conflicts_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 13. คาบเรียนที่จัดลงตารางแล้ว รองรับย้ายเอง ปักหมุด และอนุโลมรายกรณี (ข้อ 15, 16, 19, 20)
create table if not exists public.timetable_entries (
  id text primary key,
  version_id text not null references public.timetable_versions(id) on delete cascade,
  source_type text not null,
  assignment_id text,
  sync_block_id text,
  session_index integer not null default 0,
  day text not null,
  start_period integer not null,
  duration integer not null default 1,
  classroom_ids jsonb not null default '[]'::jsonb,
  subject_id text,
  title text not null,
  subject_code text,
  teacher_ids jsonb not null default '[]'::jsonb,
  room_id text,
  elective_scope jsonb,
  is_pinned boolean not null default false,
  is_overridden boolean not null default false,
  override_note text,
  updated_at timestamptz not null default now()
);

-- Indexes for fast queries
create index if not exists idx_departments_term on public.departments(term_id);
create index if not exists idx_classrooms_term on public.classrooms(term_id);
create index if not exists idx_teachers_term on public.teachers(term_id);
create index if not exists idx_subjects_term on public.subjects(term_id);
create index if not exists idx_assignments_term on public.teaching_assignments(term_id);
create index if not exists idx_assignments_classroom on public.teaching_assignments(classroom_id);
create index if not exists idx_sync_blocks_term on public.synchronized_blocks(term_id);
create index if not exists idx_entries_version on public.timetable_entries(version_id);

-- Row Level Security (เปิดให้ทีมครูและวิชาการที่ถือ Publishable Key ทำงานร่วมกันได้ทันที)
alter table public.academic_terms enable row level security;
alter table public.departments enable row level security;
alter table public.divisions enable row level security;
alter table public.rooms enable row level security;
alter table public.grade_levels enable row level security;
alter table public.classrooms enable row level security;
alter table public.teachers enable row level security;
alter table public.group_meeting_locks enable row level security;
alter table public.subjects enable row level security;
alter table public.teaching_assignments enable row level security;
alter table public.synchronized_blocks enable row level security;
alter table public.timetable_versions enable row level security;
alter table public.timetable_entries enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_terms','departments','divisions','rooms','grade_levels',
    'classrooms','teachers','group_meeting_locks','subjects',
    'teaching_assignments','synchronized_blocks','timetable_versions','timetable_entries'
  ] loop
    execute format('drop policy if exists "Allow collaborative access on %I" on public.%I', t, t);
    execute format('create policy "Allow collaborative access on %I" on public.%I for all to anon, authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

-- เปิด Supabase Realtime สำหรับการทำงานร่วมกันสด (Multi-user Realtime Sync)
do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_terms','departments','divisions','rooms','grade_levels',
    'classrooms','teachers','group_meeting_locks','subjects',
    'teaching_assignments','synchronized_blocks','timetable_versions','timetable_entries'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
