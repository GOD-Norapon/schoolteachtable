export type DayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export const DAY_LABELS: Record<DayOfWeek, { full: string; short: string; color: string }> = {
  MON: { full: "วันจันทร์", short: "จ.", color: "#eab308" },
  TUE: { full: "วันอังคาร", short: "อ.", color: "#ec4899" },
  WED: { full: "วันพุธ", short: "พ.", color: "#22c55e" },
  THU: { full: "วันพฤหัสบดี", short: "พฤ.", color: "#f97316" },
  FRI: { full: "วันศุกร์", short: "ศ.", color: "#3b82f6" },
  SAT: { full: "วันเสาร์", short: "ส.", color: "#a855f7" },
  SUN: { full: "วันอาทิตย์", short: "อา.", color: "#ef4444" },
};

export type SessionPart = "morning" | "afternoon";

export interface PeriodConfig {
  period: number; // 1..N
  label: string; // e.g., "คาบ 1"
  startTime: string; // "08:30"
  endTime: string; // "09:20"
  session: SessionPart; // morning | afternoon (ข้อ 10, 12)
  isLatePeriod: boolean; // เช่น คาบ 8 สำหรับนับโควตา 1-3 วัน/สัปดาห์ (ข้อ 11)
}

export interface BreakConfig {
  id: string;
  afterPeriod: number; // เช่น 2 = พักเบรก 20 นาทีระหว่างคาบ 2 และ 3, 4 = พักกลางวันระหว่างคาบ 4 และ 5
  durationMinutes: number;
  label: string;
  blocksConsecutive: boolean; // true = ห้ามลงคาบคู่คร่อมจุดพักนี้ (ข้อ 12)
}

export type ReadinessIssueCategory =
  | "classroom_balance"
  | "teacher_load"
  | "room_load"
  | "lock_conflict"
  | "department_status";

export type ReadinessIssueSeverity = "error" | "warning";

export interface SolverSettings {
  maxAfternoonConsecutive: number; // default 2 (ห้ามสอนบ่าย 3 คาบติด ยกเว้นกลุ่มสาระที่ยกเว้น - ข้อ 10)
  maxLatePeriodDaysPerWeek: number; // default 2 (อยู่ในช่วง 1-3 วัน/สัปดาห์ ยกเว้นกลุ่มสาระที่ยกเว้น - ข้อ 11)
  minLatePeriodDaysPerWeek: number; // default 0 (หรือ 1 หากต้องการขั้นต่ำ)
  countActivitiesInTeacherLimits: boolean; // นับรวมคาบกิจกรรมล็อค (ชุมนุม/นศท.) ในเพดานบ่าย/คาบ 8 หรือไม่
  preferFreePeriodsLate: boolean; // จัดคาบอิสระของนักเรียนไว้ท้ายวัน (คาบ 7-8)
  optimizationSeconds: number; // เวลาปรับปรุงคะแนน Soft Constraints (เช่น 8 วินาที)
}

export interface AcademicTerm {
  id: string;
  name: string;
  schoolName: string;
  academicYear: string;
  semester: string;
  isActive: boolean;
  dataEntryOpen: boolean;
  daysOfWeek: DayOfWeek[];
  periodsConfig: PeriodConfig[];
  breaksConfig: BreakConfig[];
  solverSettings: SolverSettings;
}

export interface Department {
  id: string;
  termId: string;
  code: string;
  name: string;
  color: string;
  exemptAfternoonStreak: boolean; // ข้อ 10: ยกเว้นครูบางกลุ่มสาระสอนบ่าย 3 คาบติดได้
  exemptLatePeriodLimit: boolean; // ข้อ 11: ยกเว้นครูบางกลุ่มสาระสอนคาบ 8 เกินเพดานได้
  customMaxLatePeriodDays: number | null;
  isEntryCompleted: boolean; // สถานะยืนยันว่ากลุ่มสาระลงข้อมูลครบแล้ว
  completedBy: string | null;
}

export interface Division {
  id: string;
  termId: string;
  name: string;
  color: string;
}

export type RoomType = "homeroom" | "lab" | "computer" | "sport" | "art_music" | "hall" | "other";

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  homeroom: "ห้องเรียนประจำชั้น",
  lab: "ห้องปฏิบัติการวิทยาศาสตร์",
  computer: "ห้องปฏิบัติการคอมพิวเตอร์",
  sport: "โรงยิม / สนามกีฬา",
  art_music: "ห้องศิลปะ / ดนตรี / นาฏศิลป์",
  hall: "หอประชุม / ห้องโสตทัศนศึกษา",
  other: "ห้องพิเศษอื่นๆ",
};

export interface Room {
  id: string;
  termId: string;
  code: string;
  name: string;
  building: string;
  roomType: RoomType;
  maxConcurrentClasses: number; // default 1 = ห้ามครู 2 คนลงสอนทับห้องเดียวกัน (ข้อ 9)
  allowOverlap?: boolean; // ข้อ 4: อนุญาตให้จัดตารางสอนทับซ้อนกันได้ (เช่น 1/6 ใช้ร่วมกับ 2/5 สลับสัปดาห์)
}

export interface GradeLevel {
  id: string;
  termId: string;
  code: string; // M1..M6
  name: string; // ม.1..ม.6
  stage: "junior" | "senior"; // ม.ต้น | ม.ปลาย
  sortOrder: number;
}

export interface LockedSlotRef {
  day: DayOfWeek;
  period: number;
}

export interface Classroom {
  id: string;
  termId: string;
  gradeLevelId: string;
  name: string; // เช่น ม.1/1, ม.2/7
  roomNumber: number;
  programName: string; // ห้องเรียนพิเศษวิทย์-คณิต, ห้องเรียนปกติ, ศิลป์-ภาษา ฯลฯ
  defaultRoomId: string | null; // ข้อ 18: ห้องเรียนประจำของนักเรียน (ใช้เมื่อวิชาไม่ระบุห้อง)
  advisorTeacherIds: string[]; // ข้อ 5: ครูที่ปรึกษาประจำห้อง (ไม่เกิน 3 คนต่อห้อง ต้องเข้าอบรมคุณธรรม & Homeroom)
  freePeriodsCount: number; // ข้อ 2: จำนวนคาบอิสระของแต่ละห้อง (แต่ละห้องมีไม่เท่ากันได้)
  lockedFreeSlots: LockedSlotRef[]; // ข้อ 2: ล็อคตำแหน่งคาบอิสระตายตัว (ถ้ามี)
  preferredFreePeriods: number[]; // เช่น [7, 8]
}

export interface TeacherUnavailableSlot {
  day: DayOfWeek;
  period: number;
  type: "hard" | "soft"; // hard = ห้ามจัดสอนเด็ดขาด, soft = ขอหลีกเลี่ยงถ้าทำได้
  reason: string;
}

export interface Teacher {
  id: string;
  termId: string;
  code: string;
  prefix: string;
  firstName: string;
  lastName: string;
  departmentId: string;
  divisionIds: string[]; // ข้อ 7: สังกัดฝ่ายเพื่อล็อคคาบประชุมฝ่าย
  unavailableSlots: TeacherUnavailableSlot[]; // ข้อ 8: ล็อคคาบครูแต่ละคน เช่น คาบแรกของทุกวัน
  exemptAfternoonStreakOverride: boolean | null; // ข้อ 10 รายบุคคล
  exemptLatePeriodLimitOverride: boolean | null; // ข้อ 11 รายบุคคล
  maxLatePeriodDaysOverride: number | null; // ข้อ 11 เพดานคาบ 8 รายบุคคล
}

export interface GroupMeetingLock {
  id: string;
  termId: string;
  divisionName?: string; // ข้อ 5: ฝ่ายสามารถพิมพ์กำหนดเองได้ เช่น ฝ่ายบริหารวิชาการ, ฝ่ายกิจการนักเรียน
  title: string;
  day: DayOfWeek;
  startPeriod: number;
  duration: number; // ข้อ 2: จำนวนคาบที่ประชุม (ระบุเองได้)
  teacherIds?: string[]; // ครูผู้เข้าประชุมในฝ่ายนี้
  excludedTeacherIds?: string[]; // ข้อ 2: ครูที่ได้รับการยกเว้นไม่เข้าประชุมนี้ (เช่น เลือกลงคาบกิจกรรมแทน)
  coexistTeacherIds?: string[]; // ข้อ 4: ครูที่เลือกเก็บไว้ทั้งคู่ ให้แสดงเป็น / (เช่น กิจกรรม / ประชุมฝ่าย)
  roomId: string | null;
  targetType: "department" | "division";
  targetId: string;
}

export type SubjectType = "core" | "additional" | "elective" | "activity";

export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  core: "รายวิชาพื้นฐาน",
  additional: "รายวิชาเพิ่มเติม",
  elective: "วิชาเลือกเสรี",
  activity: "กิจกรรมพัฒนาผู้เรียน",
};

export interface SubjectSchedulingRules {
  preferredPeriods: number[]; // ข้อ 17: เช่น [4, 8] สำหรับวิชาพละ
  forbiddenPeriods: number[]; // ห้ามลงคาบเหล่านี้เด็ดขาด
  allowedPeriodsOnly: number[] | null; // บังคับลงเฉพาะคาบที่ระบุ (ถ้าระบุ)
  preferAfterSubjectIds: string[]; // ข้อ 17: เช่น พละ กำหนดให้เรียนต่อจาก [ศิลปะ] = ก่อนวิชาพละเรียนศิลปะ!
  preferBeforeSubjectIds: string[]; // ข้อ 17: เช่น ศิลปะ กำหนดให้อยู่ก่อนหน้า [พละ]
  preferMorning: boolean; // เน้นเรียนช่วงเช้า
  allowSameDayRepeat: boolean; // อนุญาตให้คาบเดี่ยววิชาเดียวกันลงซ้ำวันเดียวกันหรือไม่ (default false)
}

export interface Subject {
  id: string;
  termId: string;
  code: string;
  name: string;
  shortName: string;
  departmentId: string;
  subjectType: SubjectType;
  credits: number;
  defaultPeriodsPerWeek: number;
  defaultSplitPattern: number[]; // เช่น [2, 1] หรือ [1, 1, 1]
  defaultRoomId: string | null;
  rules: SubjectSchedulingRules;
}

export interface SessionSplitItem {
  duration: number; // 1 = คาบเดี่ยว, 2 = คาบคู่, 3 = 3 คาบติด
  roomId: string | null; // ข้อ 18: null = ใช้ห้องเรียนนักเรียน (defaultRoomId), ถ้าระบุ = ใช้ห้องพิเศษ/ห้องใช้ร่วมกัน
}

export interface SpecificClassroomRule {
  fixedDay?: DayOfWeek | null; // เช่น MON (ข้อ 3: วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์)
  fixedStartPeriod?: number | null; // เช่น 1
  sessionIndex?: number; // 0 = คาบแรก, 1 = คาบที่สอง หรือ null
  preferredPeriods?: number[]; // คาบที่ต้องการ เช่น [1, 2, 4]
  forbiddenPeriods?: number[]; // คาบที่ห้ามลง
  preferMorning?: boolean; // เน้นคาบเช้า
  preferAfterSubjectIds?: string[]; // ต่อจากวิชา...
  preferBeforeSubjectIds?: string[]; // ก่อนหน้าวิชา...
  customRoomId?: string | null; // ห้องเรียนเฉพาะห้องนี้ (ถ้าต่างจากห้องหลัก)
  notes?: string | null; // บันทึกเงื่อนไข เช่น "วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์"
}

export interface TeachingAssignment {
  id: string;
  termId: string;
  classroomId: string;
  subjectId: string;
  periodsPerWeek: number;
  splitSessions: SessionSplitItem[];
  teacherIds: string[]; // ข้อ 14: ครูผู้สอน 1 คน หรือมากกว่า 1 คน (สอนร่วมกัน Co-teaching)
  notes: string | null;
  updatedBy: string | null;
  specificRule?: SpecificClassroomRule | null; // ข้อ 3: เงื่อนไขเฉพาะของวิชาห้องนั้น
  isJointClass?: boolean; // ข้อ 1: เรียนพร้อมกันหลายห้อง (วิชาเลือก / รวมกลุ่มห้องเรียน)
  jointGroupId?: string | null; // รหัสกลุ่มเชื่อมโยงห้องเรียนที่เรียนพร้อมกัน
  jointClassroomIds?: string[]; // รายชื่อห้องเรียนทั้งหมดที่เรียนพร้อมกัน
  isSubgroup?: boolean; // วิชาแยกกลุ่ม / แยกแผนการเรียนในห้องเดียว (เช่น ม.4/7 แบ่งแผนคณิต/ภาษา)
  subgroupName?: string | null; // ชื่อกลุ่มย่อย เช่น "แผนคณิต", "แผนภาษา", "กลุ่ม 1", "กลุ่ม 2"
  subgroupSyncId?: string | null; // รหัสเชื่อมโยงวิชาคู่ขนานที่เรียนพร้อมกันในห้องนี้
}

export type SyncBlockType =
  | "school_lock" // ข้อ 1: คาบล็อคทั้งโรงเรียน เช่น ชุมนุม
  | "grade_sync" // ข้อ 3: คาบเรียนเหมือนกันแต่ละระดับชั้น/หลายชั้น เช่น ลูกเสือ ม.1-ม.3
  | "moral_assembly" // ข้อ 4 & 5: คาบอบรมคุณธรรม เรียนเหมือนกันทั้งระดับชั้น + ครูที่ปรึกษาต้องเข้า
  | "homeroom" // ข้อ 5: คาบ Homeroom ครูที่ปรึกษา ตรงกันทั้งระดับชั้น
  | "elective_pool" // ข้อ 6: คาบวิชาเลือกเรียนพร้อมกันบางห้อง เช่น ม.2 ห้อง 7-8-9-10 โดยมีวิชาให้เลือก
  | "cohort_lock" // ข้อ 13: ล็อคคาบนักเรียนเป็นวิชาเฉพาะ เช่น ศุกร์ คาบ 6-7-8 ม.ปลาย = นศท.
  | "parallel_subject"; // วิชาเรียนพร้อมกันแต่แยกครูประจำห้อง เช่น IS (ม.5/1 - ม.5/5) ครู 1 คนต่อ 1 ห้อง

export const SYNC_BLOCK_TYPE_LABELS: Record<
  SyncBlockType,
  { label: string; badgeColor: string; description: string }
> = {
  school_lock: {
    label: "คาบล็อคทั้งโรงเรียน (เช่น ชุมนุม)",
    badgeColor: "#0ea5e9",
    description: "เรียนพร้อมกันทุกระดับชั้นทุกห้องเรียนทั้งโรงเรียน",
  },
  grade_sync: {
    label: "คาบร่วมระดับชั้น (เช่น ลูกเสือ ม.1–ม.3)",
    badgeColor: "#16a34a",
    description: "เรียนพร้อมกันในระดับชั้นหรือกลุ่มระดับชั้นที่เลือก",
  },
  moral_assembly: {
    label: "คาบอบรมคุณธรรมประจำระดับชั้น",
    badgeColor: "#eab308",
    description: "เรียนพร้อมกันทั้งระดับชั้น และดึงครูที่ปรึกษาทุกคนเข้าคาบอัตโนมัติ (ระบุหอประชุมร่วมได้)",
  },
  homeroom: {
    label: "คาบครูที่ปรึกษา (Homeroom)",
    badgeColor: "#f97316",
    description: "ตรงกันทั้งระดับชั้น ดึงครูที่ปรึกษาประจำห้องเข้าห้องนักเรียนของตนเองอัตโนมัติ",
  },
  elective_pool: {
    label: "กลุ่มวิชาเลือกเสรีพร้อมกันบางห้อง",
    badgeColor: "#a855f7",
    description: "เช่น ม.2 ห้อง 7-8-9-10 เรียนพร้อมกัน โดยมีชุดวิชาเลือก ครู และห้องเรียนให้เลือก",
  },
  cohort_lock: {
    label: "ล็อคคาบวิชาเฉพาะกลุ่มนักเรียน (เช่น นศท.)",
    badgeColor: "#ef4444",
    description: "เช่น วันศุกร์ คาบ 6-7-8 ของ ม.ปลายทุกห้องเป็นวิชา นศท.",
  },
  parallel_subject: {
    label: "วิชาเรียนพร้อมกันแยกครูประจำห้อง (เช่น IS)",
    badgeColor: "#059669",
    description: "เรียนพร้อมกันในคาบเดียวกัน เช่น 5/1–5/5 เรียน IS คาบ 8 วันพฤหัสบดี โดยระบุครูผู้สอนแยกแต่ละห้อง (ครู 1 คนต่อ 1 ห้อง)",
  },
};

export interface ElectiveOffering {
  id: string;
  subjectId: string | null;
  subjectCode: string;
  subjectName: string;
  departmentId?: string | null;
  teacherIds: string[]; // รองรับสอนร่วมในวิชาเลือกได้ด้วย (ข้อ 4, 6, 14)
  roomId: string | null;
}

export interface SynchronizedBlock {
  id: string;
  termId: string;
  blockType: SyncBlockType;
  category?: "school" | "grade" | "elective" | "parallel"; // ข้อ 4: 1.คาบทั้งโรงเรียน 2.คาบประจำระดับชั้น 3.วิชาเลือก 4.วิชาเรียนพร้อมกัน
  title: string;
  subjectCode: string | null;
  gradeLevelIds: string[];
  classroomIds: string[]; // ห้องเรียนที่เข้าร่วมทั้งหมด
  bindAdvisorsAutomatically: boolean; // ข้อ 3 & ข้อ 5: คาบประจำระดับชั้น ดึงครูที่ปรึกษาเข้าคาบอัตโนมัติ
  bindAllTeachers?: boolean; // ข้อ 2: คาบทั้งโรงเรียน ดึงครูทุกคนเข้าคาบอัตโนมัติ (เช่น ชุมนุม)
  studentOnly?: boolean; // ข้อ 3: กิจกรรมลงเฉพาะในตารางนักเรียน ไม่ต้องลงในคาบครู (เช่น ลูกเสือ)
  teacherIds: string[]; // ครูผู้รับผิดชอบเพิ่มเติม (เช่น ครูผู้กำกับลูกเสือ/นศท., ครูชุมนุม)
  classroomTeacherMap?: Record<string, string[]>; // ระบุครูผู้สอนแยกแต่ละห้องเรียน (เช่น IS: 5/1 -> [ครู A], 5/2 -> [ครู B])
  excludedTeacherIds?: string[]; // ข้อ 2: ครูที่ได้รับการยกเว้นไม่เข้าคาบนี้ (เช่น เลือกลงคาบประชุมแทน)
  coexistTeacherIds?: string[]; // ข้อ 4: ครูที่เลือกเก็บไว้ทั้งคู่ ให้แสดงเป็น / (เช่น กิจกรรม / ประชุมฝ่าย)
  sharedRoomId: string | null; // เช่น หอประชุม (ป้องกันอบรมคุณธรรม ม.1 กับ ม.2 ชนหอประชุมกัน)
  offerings: ElectiveOffering[]; // ข้อ 6: รายการวิชาเลือกที่เปิดพร้อมกัน
  duration: number; // จำนวนคาบติดกัน เช่น 1, 2, 3
  isTimeLocked: boolean; // true = กำหนดวัน/คาบคงที่, false = ให้ Solver หาช่องว่างตรงกันให้
  fixedDay: DayOfWeek | null;
  fixedStartPeriod: number | null;
}

export interface TimetableVersion {
  id: string;
  termId: string;
  name: string;
  status: "draft" | "published";
  score: number;
  hardConflictsCount: number;
  notes: string | null;
  createdAt: string;
}

export interface TimetableEntry {
  id: string;
  versionId: string;
  sourceType: "assignment" | "sync_block" | "free_period";
  assignmentId: string | null;
  syncBlockId: string | null;
  sessionIndex: number;
  day: DayOfWeek;
  startPeriod: number;
  duration: number;
  classroomIds: string[];
  subjectId: string | null;
  title: string;
  subjectCode: string | null;
  teacherIds: string[];
  roomId: string | null; // null = ใช้ห้องประจำของนักเรียนแต่ละห้อง
  electiveScope: ElectiveOffering[] | null;
  classroomTeacherMap?: Record<string, string[]>; // ระบุครูผู้สอนแยกห้องเรียนสำหรับวิชาเรียนพร้อมกัน
  isJointClass?: boolean;
  jointGroupId?: string | null;
  isSubgroup?: boolean;
  subgroupName?: string | null;
  subgroupSyncId?: string | null;
  isPinned: boolean; // ปักหมุดไม่ให้ขยับเมื่อจัดตารางซ้ำ
  isOverridden: boolean; // อนุโลมเงื่อนไขรายกรณี
  overrideNote: string | null;
}

export interface CollaborativeSession {
  userName: string;
  role: "admin" | "coordinator"; // ทีมจัดตารางสอน | ตัวแทนกลุ่มสาระ/ครูผู้ช่วยลงข้อมูล
  departmentId: string | null;
}

export interface SchoolDataset {
  term: AcademicTerm;
  departments: Department[];
  divisions: Division[];
  rooms: Room[];
  gradeLevels: GradeLevel[];
  classrooms: Classroom[];
  teachers: Teacher[];
  groupMeetingLocks: GroupMeetingLock[];
  subjects: Subject[];
  teachingAssignments: TeachingAssignment[];
  synchronizedBlocks: SynchronizedBlock[];
  versions: TimetableVersion[];
  entries: TimetableEntry[]; // entries across versions for active term
}
