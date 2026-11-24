import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  AcademicTerm,
  Classroom,
  Department,
  Division,
  GradeLevel,
  GroupMeetingLock,
  Room,
  SchoolDataset,
  SpecificClassroomRule,
  Subject,
  SynchronizedBlock,
  Teacher,
  TeachingAssignment,
  TimetableEntry,
  TimetableVersion,
} from "@/types/timetable";

const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_5LdJGRJiShjri_JAUy0duw_PzWvZH6g";
const STORAGE_CONFIG_KEY = "sts_supabase_connection_v1";

export interface SupabaseConnectionConfig {
  url: string;
  key: string;
}

export function getSupabaseConfig(): SupabaseConnectionConfig {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const envKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    DEFAULT_PUBLISHABLE_KEY;

  if (typeof window === "undefined") {
    return { url: envUrl, key: envKey };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SupabaseConnectionConfig>;
      return {
        url: parsed.url?.trim() || envUrl,
        key: parsed.key?.trim() || envKey,
      };
    }
  } catch {
    // ignore storage read error
  }

  return { url: envUrl, key: envKey };
}

export function saveSupabaseConfig(url: string, key?: string) {
  if (typeof window === "undefined") return;
  const cleanUrl = url.trim().replace(/\/+$/, "");
  const cleanKey = (key || DEFAULT_PUBLISHABLE_KEY).trim();
  window.localStorage.setItem(
    STORAGE_CONFIG_KEY,
    JSON.stringify({ url: cleanUrl, key: cleanKey })
  );
  cachedClient = null;
  cachedUrl = "";
}

let cachedClient: SupabaseClient | null = null;
let cachedUrl = "";
let cachedKey = "";

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseConfig();
  if (!url || !url.startsWith("http") || !key) return null;

  if (cachedClient && cachedUrl === url && cachedKey === key) {
    return cachedClient;
  }

  cachedUrl = url;
  cachedKey = key;
  cachedClient = createClient(url, key, {
    auth: { persistSession: true },
  });
  return cachedClient;
}

// ==================== MAPPERS (camelCase <-> snake_case DB) ====================

const toDbTerm = (t: AcademicTerm) => ({
  id: t.id,
  name: t.name,
  school_name: t.schoolName,
  academic_year: t.academicYear,
  semester: t.semester,
  is_active: t.isActive,
  data_entry_open: t.dataEntryOpen,
  days_of_week: t.daysOfWeek,
  periods_config: t.periodsConfig,
  breaks_config: t.breaksConfig,
  solver_settings: t.solverSettings,
  updated_at: new Date().toISOString(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbTerm = (r: any): AcademicTerm => ({
  id: r.id,
  name: r.name,
  schoolName: r.school_name,
  academicYear: r.academic_year,
  semester: r.semester,
  isActive: r.is_active,
  dataEntryOpen: r.data_entry_open ?? true,
  daysOfWeek: r.days_of_week ?? ["MON", "TUE", "WED", "THU", "FRI"],
  periodsConfig: r.periods_config ?? [],
  breaksConfig: r.breaks_config ?? [],
  solverSettings: r.solver_settings ?? {},
});

const toDbDept = (d: Department) => ({
  id: d.id,
  term_id: d.termId,
  code: d.code,
  name: d.name,
  color: d.color,
  exempt_afternoon_streak: d.exemptAfternoonStreak,
  exempt_late_period_limit: d.exemptLatePeriodLimit,
  custom_max_late_period_days: d.customMaxLatePeriodDays,
  is_entry_completed: d.isEntryCompleted,
  completed_by: d.completedBy,
  updated_at: new Date().toISOString(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbDept = (r: any): Department => ({
  id: r.id,
  termId: r.term_id,
  code: r.code,
  name: r.name,
  color: r.color,
  exemptAfternoonStreak: Boolean(r.exempt_afternoon_streak),
  exemptLatePeriodLimit: Boolean(r.exempt_late_period_limit),
  customMaxLatePeriodDays: r.custom_max_late_period_days ?? null,
  isEntryCompleted: Boolean(r.is_entry_completed),
  completedBy: r.completed_by ?? null,
});

const toDbDiv = (d: Division) => ({
  id: d.id,
  term_id: d.termId,
  name: d.name,
  color: d.color,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbDiv = (r: any): Division => ({
  id: r.id,
  termId: r.term_id,
  name: r.name,
  color: r.color,
});

const toDbRoom = (rm: Room) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: Record<string, any> = {
    id: rm.id,
    term_id: rm.termId,
    code: rm.code,
    name: rm.name,
    building: rm.building,
    room_type: rm.roomType,
    max_concurrent_classes: rm.maxConcurrentClasses,
  };
  if (rm.allowOverlap !== undefined) {
    obj.allow_overlap = Boolean(rm.allowOverlap);
  }
  return obj;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbRoom = (r: any): Room => ({
  id: r.id,
  termId: r.term_id,
  code: r.code,
  name: r.name,
  building: r.building ?? "",
  roomType: r.room_type ?? "homeroom",
  maxConcurrentClasses: r.max_concurrent_classes ?? 1,
  allowOverlap:
    r.allow_overlap !== undefined && r.allow_overlap !== null
      ? Boolean(r.allow_overlap)
      : undefined,
});

const toDbGrade = (g: GradeLevel) => ({
  id: g.id,
  term_id: g.termId,
  code: g.code,
  name: g.name,
  stage: g.stage,
  sort_order: g.sortOrder,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbGrade = (r: any): GradeLevel => ({
  id: r.id,
  termId: r.term_id,
  code: r.code,
  name: r.name,
  stage: r.stage ?? "junior",
  sortOrder: r.sort_order ?? 1,
});

const toDbClassroom = (c: Classroom) => ({
  id: c.id,
  term_id: c.termId,
  grade_level_id: c.gradeLevelId,
  name: c.name,
  room_number: c.roomNumber,
  program_name: c.programName,
  default_room_id: c.defaultRoomId,
  advisor_teacher_ids: c.advisorTeacherIds,
  free_periods_count: c.freePeriodsCount,
  locked_free_slots: c.lockedFreeSlots,
  preferred_free_periods: c.preferredFreePeriods,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbClassroom = (r: any): Classroom => ({
  id: r.id,
  termId: r.term_id,
  gradeLevelId: r.grade_level_id,
  name: r.name,
  roomNumber: r.room_number ?? 1,
  programName: r.program_name ?? "",
  defaultRoomId: r.default_room_id ?? null,
  advisorTeacherIds: r.advisor_teacher_ids ?? [],
  freePeriodsCount: r.free_periods_count ?? 0,
  lockedFreeSlots: r.locked_free_slots ?? [],
  preferredFreePeriods: r.preferred_free_periods ?? [7, 8],
});

const toDbTeacher = (t: Teacher) => ({
  id: t.id,
  term_id: t.termId,
  code: t.code,
  prefix: t.prefix,
  first_name: t.firstName,
  last_name: t.lastName,
  department_id: t.departmentId,
  division_ids: t.divisionIds,
  unavailable_slots: t.unavailableSlots,
  exempt_afternoon_streak_override: t.exemptAfternoonStreakOverride,
  exempt_late_period_limit_override: t.exemptLatePeriodLimitOverride,
  max_late_period_days_override: t.maxLatePeriodDaysOverride,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbTeacher = (r: any): Teacher => ({
  id: r.id,
  termId: r.term_id,
  code: r.code,
  prefix: r.prefix ?? "",
  firstName: r.first_name,
  lastName: r.last_name,
  departmentId: r.department_id,
  divisionIds: r.division_ids ?? [],
  unavailableSlots: r.unavailable_slots ?? [],
  exemptAfternoonStreakOverride: r.exempt_afternoon_streak_override ?? null,
  exemptLatePeriodLimitOverride: r.exempt_late_period_limit_override ?? null,
  maxLatePeriodDaysOverride: r.max_late_period_days_override ?? null,
});

const toDbMeeting = (m: GroupMeetingLock) => ({
  id: m.id,
  term_id: m.termId,
  target_type: m.targetType,
  target_id: m.targetId,
  title: m.title,
  day: m.day,
  start_period: m.startPeriod,
  duration: m.duration,
  room_id: m.roomId,
  coexist_teacher_ids: m.coexistTeacherIds ?? [],
  excluded_teacher_ids: m.excludedTeacherIds ?? [],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbMeeting = (r: any): GroupMeetingLock => ({
  id: r.id,
  termId: r.term_id,
  targetType: r.target_type,
  targetId: r.target_id,
  title: r.title,
  day: r.day,
  startPeriod: r.start_period,
  duration: r.duration ?? 1,
  roomId: r.room_id ?? null,
  divisionName: r.division_name ?? undefined,
  teacherIds: r.teacher_ids ?? undefined,
  excludedTeacherIds: r.excluded_teacher_ids ?? undefined,
  coexistTeacherIds: r.coexist_teacher_ids ?? undefined,
});

const toDbSubject = (s: Subject) => ({
  id: s.id,
  term_id: s.termId,
  code: s.code,
  name: s.name,
  short_name: s.shortName,
  department_id: s.departmentId,
  subject_type: s.subjectType,
  credits: s.credits,
  default_periods_per_week: s.defaultPeriodsPerWeek,
  default_split_pattern: s.defaultSplitPattern,
  default_room_id: s.defaultRoomId,
  rules: s.rules,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbSubject = (r: any): Subject => ({
  id: r.id,
  termId: r.term_id,
  code: r.code,
  name: r.name,
  shortName: r.short_name ?? "",
  departmentId: r.department_id,
  subjectType: r.subject_type ?? "core",
  credits: Number(r.credits ?? 1),
  defaultPeriodsPerWeek: r.default_periods_per_week ?? 2,
  defaultSplitPattern: r.default_split_pattern ?? [1, 1],
  defaultRoomId: r.default_room_id ?? null,
  rules: {
    preferredPeriods: r.rules?.preferredPeriods ?? [],
    forbiddenPeriods: r.rules?.forbiddenPeriods ?? [],
    allowedPeriodsOnly: r.rules?.allowedPeriodsOnly ?? null,
    preferAfterSubjectIds: r.rules?.preferAfterSubjectIds ?? [],
    preferBeforeSubjectIds: r.rules?.preferBeforeSubjectIds ?? [],
    preferMorning: Boolean(r.rules?.preferMorning),
    allowSameDayRepeat: Boolean(r.rules?.allowSameDayRepeat),
  },
});

interface AssignmentNotesMeta {
  __asg_meta__: 1;
  userNotes?: string | null;
  specificRule?: SpecificClassroomRule | null;
  isJointClass?: boolean;
  jointGroupId?: string | null;
  jointClassroomIds?: string[];
  isSubgroup?: boolean;
  subgroupName?: string | null;
  subgroupSyncId?: string | null;
}

const encodeAssignmentNotes = (a: TeachingAssignment): string | null => {
  const hasMeta = Boolean(
    a.specificRule ||
    a.isJointClass ||
    a.jointGroupId ||
    (a.jointClassroomIds && a.jointClassroomIds.length > 0) ||
    a.isSubgroup ||
    a.subgroupName ||
    a.subgroupSyncId
  );

  if (!hasMeta) {
    return a.notes ?? null;
  }

  const payload: AssignmentNotesMeta = {
    __asg_meta__: 1,
    userNotes: a.notes ?? null,
    specificRule: a.specificRule ?? null,
    isJointClass: Boolean(a.isJointClass),
    jointGroupId: a.jointGroupId ?? null,
    jointClassroomIds: a.jointClassroomIds ?? [],
    isSubgroup: Boolean(a.isSubgroup),
    subgroupName: a.subgroupName ?? null,
    subgroupSyncId: a.subgroupSyncId ?? null,
  };

  return JSON.stringify(payload);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decodeAssignmentNotes = (rawNotes: any) => {
  let userNotes: string | null = rawNotes ?? null;
  let specificRule: SpecificClassroomRule | null = null;
  let isJointClass = false;
  let jointGroupId: string | null = null;
  let jointClassroomIds: string[] | undefined = undefined;
  let isSubgroup = false;
  let subgroupName: string | null = null;
  let subgroupSyncId: string | null = null;

  if (typeof rawNotes === "string" && rawNotes.startsWith('{"__asg_meta__":')) {
    try {
      const parsed = JSON.parse(rawNotes);
      userNotes = parsed.userNotes ?? null;
      specificRule = parsed.specificRule ?? null;
      isJointClass = Boolean(parsed.isJointClass);
      jointGroupId = parsed.jointGroupId ?? null;
      jointClassroomIds = Array.isArray(parsed.jointClassroomIds) ? parsed.jointClassroomIds : undefined;
      isSubgroup = Boolean(parsed.isSubgroup);
      subgroupName = parsed.subgroupName ?? null;
      subgroupSyncId = parsed.subgroupSyncId ?? null;
    } catch {
      // fallback to plain notes
    }
  }

  return {
    userNotes,
    specificRule,
    isJointClass,
    jointGroupId,
    jointClassroomIds,
    isSubgroup,
    subgroupName,
    subgroupSyncId,
  };
};

const toDbAssignment = (a: TeachingAssignment) => ({
  id: a.id,
  term_id: a.termId,
  classroom_id: a.classroomId,
  subject_id: a.subjectId,
  periods_per_week: a.periodsPerWeek,
  split_sessions: a.splitSessions,
  teacher_ids: a.teacherIds,
  notes: encodeAssignmentNotes(a),
  updated_by: a.updatedBy,
  updated_at: new Date().toISOString(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbAssignment = (r: any): TeachingAssignment => {
  const meta = decodeAssignmentNotes(r.notes);
  return {
    id: r.id,
    termId: r.term_id,
    classroomId: r.classroom_id,
    subjectId: r.subject_id,
    periodsPerWeek: r.periods_per_week,
    splitSessions: r.split_sessions ?? [],
    teacherIds: r.teacher_ids ?? [],
    notes: meta.userNotes,
    updatedBy: r.updated_by ?? null,
    specificRule: r.specific_rule ?? meta.specificRule,
    isJointClass:
      r.is_joint_class !== undefined && r.is_joint_class !== null
        ? Boolean(r.is_joint_class)
        : meta.isJointClass,
    jointGroupId: r.joint_group_id ?? meta.jointGroupId,
    jointClassroomIds: r.joint_classroom_ids ?? meta.jointClassroomIds,
    isSubgroup:
      r.is_subgroup !== undefined && r.is_subgroup !== null
        ? Boolean(r.is_subgroup)
        : meta.isSubgroup,
    subgroupName: r.subgroup_name ?? meta.subgroupName,
    subgroupSyncId: r.subgroup_sync_id ?? meta.subgroupSyncId,
  };
};

const toDbSyncBlock = (b: SynchronizedBlock) => ({
  id: b.id,
  term_id: b.termId,
  block_type: b.blockType,
  title: b.title,
  subject_code: b.subjectCode,
  grade_level_ids: b.gradeLevelIds,
  classroom_ids: b.classroomIds,
  bind_advisors_automatically: b.bindAdvisorsAutomatically,
  teacher_ids: b.teacherIds,
  shared_room_id: b.sharedRoomId,
  offerings: b.offerings,
  duration: b.duration,
  is_time_locked: b.isTimeLocked,
  fixed_day: b.fixedDay,
  fixed_start_period: b.fixedStartPeriod,
  coexist_teacher_ids: b.coexistTeacherIds ?? [],
  excluded_teacher_ids: b.excludedTeacherIds ?? [],
  classroom_teacher_map: b.classroomTeacherMap ?? {},
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbSyncBlock = (r: any): SynchronizedBlock => ({
  id: r.id,
  termId: r.term_id,
  blockType: r.block_type,
  title: r.title,
  subjectCode: r.subject_code ?? null,
  gradeLevelIds: r.grade_level_ids ?? [],
  classroomIds: r.classroom_ids ?? [],
  bindAdvisorsAutomatically: Boolean(r.bind_advisors_automatically),
  teacherIds: r.teacher_ids ?? [],
  classroomTeacherMap: r.classroom_teacher_map ?? undefined,
  sharedRoomId: r.shared_room_id ?? null,
  offerings: r.offerings ?? [],
  duration: r.duration ?? 1,
  isTimeLocked: Boolean(r.is_time_locked),
  fixedDay: r.fixed_day ?? null,
  fixedStartPeriod: r.fixed_start_period ?? null,
  coexistTeacherIds: r.coexist_teacher_ids ?? undefined,
  excludedTeacherIds: r.excluded_teacher_ids ?? undefined,
});

const toDbVersion = (v: TimetableVersion) => ({
  id: v.id,
  term_id: v.termId,
  name: v.name,
  status: v.status,
  score: v.score,
  hard_conflicts_count: v.hardConflictsCount,
  notes: v.notes,
  created_at: v.createdAt,
  updated_at: new Date().toISOString(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbVersion = (r: any): TimetableVersion => ({
  id: r.id,
  termId: r.term_id,
  name: r.name,
  status: r.status ?? "draft",
  score: Number(r.score ?? 0),
  hardConflictsCount: r.hard_conflicts_count ?? 0,
  notes: r.notes ?? null,
  createdAt: r.created_at ?? new Date().toISOString(),
});

const toDbEntry = (e: TimetableEntry) => ({
  id: e.id,
  version_id: e.versionId,
  source_type: e.sourceType,
  assignment_id: e.assignmentId,
  sync_block_id: e.syncBlockId,
  session_index: e.sessionIndex,
  day: e.day,
  start_period: e.startPeriod,
  duration: e.duration,
  classroom_ids: e.classroomIds,
  subject_id: e.subjectId,
  title: e.title,
  subject_code: e.subjectCode,
  teacher_ids: e.teacherIds,
  room_id: e.roomId,
  elective_scope: e.electiveScope,
  is_pinned: e.isPinned,
  is_overridden: e.isOverridden,
  override_note: e.overrideNote,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbEntry = (r: any): TimetableEntry => ({
  id: r.id,
  versionId: r.version_id,
  sourceType: r.source_type,
  assignmentId: r.assignment_id ?? null,
  syncBlockId: r.sync_block_id ?? null,
  sessionIndex: r.session_index ?? 0,
  day: r.day,
  startPeriod: r.start_period,
  duration: r.duration ?? 1,
  classroomIds: r.classroom_ids ?? [],
  subjectId: r.subject_id ?? null,
  title: r.title,
  subjectCode: r.subject_code ?? null,
  teacherIds: r.teacher_ids ?? [],
  roomId: r.room_id ?? null,
  electiveScope: r.elective_scope ?? null,
  isPinned: Boolean(r.is_pinned),
  isOverridden: Boolean(r.is_overridden),
  overrideNote: r.override_note ?? null,
  isSubgroup: Boolean(r.is_subgroup),
  subgroupName: r.subgroup_name ?? null,
  subgroupSyncId: r.subgroup_sync_id ?? null,
});

export async function fetchDatasetFromSupabase(
  sb: SupabaseClient
): Promise<{ ok: true; dataset: SchoolDataset | null } | { ok: false; error: string }> {
  try {
    const { data: terms, error: termErr } = await sb
      .from("academic_terms")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (termErr) {
      return { ok: false, error: termErr.message };
    }
    if (!terms || terms.length === 0) {
      return { ok: true, dataset: null };
    }

    const term = fromDbTerm(terms[0]);
    const tid = term.id;

    const [
      deptsRes,
      divsRes,
      roomsRes,
      gradesRes,
      clsRes,
      tchrsRes,
      mtgsRes,
      subsRes,
      asgsRes,
      syncsRes,
      versRes,
    ] = await Promise.all([
      sb.from("departments").select("*").eq("term_id", tid),
      sb.from("divisions").select("*").eq("term_id", tid),
      sb.from("rooms").select("*").eq("term_id", tid),
      sb.from("grade_levels").select("*").eq("term_id", tid).order("sort_order"),
      sb.from("classrooms").select("*").eq("term_id", tid),
      sb.from("teachers").select("*").eq("term_id", tid),
      sb.from("group_meeting_locks").select("*").eq("term_id", tid),
      sb.from("subjects").select("*").eq("term_id", tid),
      sb.from("teaching_assignments").select("*").eq("term_id", tid),
      sb.from("synchronized_blocks").select("*").eq("term_id", tid),
      sb.from("timetable_versions").select("*").eq("term_id", tid).order("created_at"),
    ]);

    const versions = (versRes.data || []).map(fromDbVersion);
    let entries: TimetableEntry[] = [];
    if (versions.length > 0) {
      const vIds = versions.map((v) => v.id);
      const { data: entRows } = await sb
        .from("timetable_entries")
        .select("*")
        .in("version_id", vIds);
      entries = (entRows || []).map(fromDbEntry);
    }

    return {
      ok: true,
      dataset: {
        term,
        departments: (deptsRes.data || []).map(fromDbDept),
        divisions: (divsRes.data || []).map(fromDbDiv),
        rooms: (roomsRes.data || []).map(fromDbRoom),
        gradeLevels: (gradesRes.data || []).map(fromDbGrade),
        classrooms: (clsRes.data || []).map(fromDbClassroom),
        teachers: (tchrsRes.data || []).map(fromDbTeacher),
        groupMeetingLocks: (mtgsRes.data || []).map(fromDbMeeting),
        subjects: (subsRes.data || []).map(fromDbSubject),
        teachingAssignments: (asgsRes.data || []).map(fromDbAssignment),
        synchronizedBlocks: (syncsRes.data || []).map(fromDbSyncBlock),
        versions,
        entries,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pushDatasetToSupabase(
  sb: SupabaseClient,
  dataset: SchoolDataset
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r1 = await sb.from("academic_terms").upsert(toDbTerm(dataset.term));
    if (r1.error) return { ok: false, error: r1.error.message };

    if (dataset.departments.length) {
      const r = await sb.from("departments").upsert(dataset.departments.map(toDbDept));
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.divisions.length) {
      const r = await sb.from("divisions").upsert(dataset.divisions.map(toDbDiv));
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.rooms.length) {
      let r = await sb.from("rooms").upsert(dataset.rooms.map(toDbRoom));
      if (
        r.error &&
        (r.error.message?.includes("allow_overlap") || r.error.code === "PGRST204")
      ) {
        // Fallback if allow_overlap column does not exist yet on Supabase
        r = await sb.from("rooms").upsert(
          dataset.rooms.map((rm) => {
            const raw = toDbRoom(rm);
            delete raw.allow_overlap;
            return raw;
          })
        );
      }
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.gradeLevels.length) {
      const r = await sb.from("grade_levels").upsert(dataset.gradeLevels.map(toDbGrade));
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.classrooms.length) {
      const r = await sb.from("classrooms").upsert(dataset.classrooms.map(toDbClassroom));
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.teachers.length) {
      const r = await sb.from("teachers").upsert(dataset.teachers.map(toDbTeacher));
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.groupMeetingLocks.length) {
      let r = await sb.from("group_meeting_locks").upsert(dataset.groupMeetingLocks.map(toDbMeeting));
      if (
        r.error &&
        (r.error.message?.includes("coexist_teacher_ids") ||
          r.error.message?.includes("excluded_teacher_ids") ||
          r.error.code === "PGRST204")
      ) {
        r = await sb.from("group_meeting_locks").upsert(
          dataset.groupMeetingLocks.map((m) => {
            const raw = toDbMeeting(m);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (raw as any).coexist_teacher_ids;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (raw as any).excluded_teacher_ids;
            return raw;
          })
        );
      }
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.subjects.length) {
      const r = await sb.from("subjects").upsert(dataset.subjects.map(toDbSubject));
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.teachingAssignments.length) {
      const r = await sb.from("teaching_assignments").upsert(dataset.teachingAssignments.map(toDbAssignment));
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.synchronizedBlocks.length) {
      let r = await sb.from("synchronized_blocks").upsert(dataset.synchronizedBlocks.map(toDbSyncBlock));
      if (
        r.error &&
        (r.error.message?.includes("coexist_teacher_ids") ||
          r.error.message?.includes("excluded_teacher_ids") ||
          r.error.code === "PGRST204")
      ) {
        r = await sb.from("synchronized_blocks").upsert(
          dataset.synchronizedBlocks.map((b) => {
            const raw = toDbSyncBlock(b);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (raw as any).coexist_teacher_ids;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (raw as any).excluded_teacher_ids;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (raw as any).classroom_teacher_map;
            return raw;
          })
        );
      }
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.versions.length) {
      const r = await sb.from("timetable_versions").upsert(dataset.versions.map(toDbVersion));
      if (r.error) return { ok: false, error: r.error.message };
    }
    if (dataset.entries.length) {
      // Batch in chunks of 250
      const mapped = dataset.entries.map(toDbEntry);
      for (let i = 0; i < mapped.length; i += 250) {
        const r = await sb.from("timetable_entries").upsert(mapped.slice(i, i + 250));
        if (r.error) return { ok: false, error: r.error.message };
      }
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const dbMappers = {
  toDbTerm,
  toDbDept,
  toDbDiv,
  toDbRoom,
  toDbGrade,
  toDbClassroom,
  toDbTeacher,
  toDbMeeting,
  toDbSubject,
  toDbAssignment,
  toDbSyncBlock,
  toDbVersion,
  toDbEntry,
};
