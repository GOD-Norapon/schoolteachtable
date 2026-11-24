import {
  AcademicTerm,
  Classroom,
  DayOfWeek,
  Department,
  Division,
  GroupMeetingLock,
  Room,
  SchoolDataset,
  SynchronizedBlock,
  Teacher,
  TimetableEntry,
} from "@/types/timetable";

export interface ClassroomPeriodAudit {
  classroomId: string;
  classroomName: string;
  gradeLevelId: string;
  programName: string;
  totalAvailableSlots: number;
  academicPeriods: number;
  syncBlockPeriods: number;
  freePeriods: number;
  totalPlannedPeriods: number;
  delta: number; // 0 = พอดี, <0 = ขาด, >0 = เกิน
  periodsByDepartment: Record<string, number>;
  missingDepartmentIds: string[];
  advisorCount: number;
}

export interface TeacherWorkloadAudit {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  departmentId: string;
  teachingPeriods: number; // คาบสอนปกติ + สอนร่วม
  electivePeriods: number; // คาบวิชาเลือก
  advisorPeriods: number; // อบรมคุณธรรม + Homeroom
  activityPeriods: number; // ลูกเสือ / ชุมนุม / นศท. ที่ผูกชื่อครู
  meetingPeriods: number; // ประชุมฝ่าย / กลุ่มสาระ
  unavailableHardCount: number; // คาบล็อคไม่ว่างส่วนตัว + ประชุมฝ่าย
  totalCommittedPeriods: number; // รวมปฏิบัติงานทั้งหมด
  maxPossibleSlots: number;
  isOverloaded: boolean;
}

export interface ReadinessIssue {
  id: string;
  severity: "error" | "warning";
  category: "classroom_balance" | "teacher_load" | "room_load" | "lock_conflict" | "department_status";
  title: string;
  detail: string;
  entityId?: string;
  day?: DayOfWeek;
  period?: number;
  syncBlockId?: string;
  meetingId?: string;
}

export interface DatasetReadinessReport {
  isAllRoomsBalanced: boolean;
  isAllDepartmentsCompleted: boolean;
  canRunSolver: boolean;
  totalSlotsPerWeek: number;
  classroomAudits: ClassroomPeriodAudit[];
  teacherAudits: TeacherWorkloadAudit[];
  issues: ReadinessIssue[];
}

export function getTeacherFullName(t: Teacher): string {
  return `${t.prefix}${t.firstName} ${t.lastName}`.trim();
}

export function isTeacherExemptAfternoonStreak(teacher: Teacher, dept?: Department): boolean {
  if (teacher.exemptAfternoonStreakOverride !== null && teacher.exemptAfternoonStreakOverride !== undefined) {
    return teacher.exemptAfternoonStreakOverride;
  }
  return dept?.exemptAfternoonStreak ?? false;
}

export function getTeacherMaxLatePeriodDays(
  teacher: Teacher,
  dept: Department | undefined,
  term: AcademicTerm
): number {
  const isExempt =
    teacher.exemptLatePeriodLimitOverride !== null && teacher.exemptLatePeriodLimitOverride !== undefined
      ? teacher.exemptLatePeriodLimitOverride
      : (dept?.exemptLatePeriodLimit ?? false);
  if (isExempt) return Infinity;
  if (teacher.maxLatePeriodDaysOverride !== null && teacher.maxLatePeriodDaysOverride !== undefined) {
    return teacher.maxLatePeriodDaysOverride;
  }
  if (dept?.customMaxLatePeriodDays !== null && dept?.customMaxLatePeriodDays !== undefined) {
    return dept.customMaxLatePeriodDays;
  }
  return term.solverSettings.maxLatePeriodDaysPerWeek;
}

/**
 * ตรวจสอบว่าคาบต่อเนื่อง (เช่น คาบคู่ 2 คาบติด หรือ 3 คาบติด) ลงที่ startPeriod ได้หรือไม่
 * โดยห้ามเกินจำนวนคาบต่อวัน และห้ามคร่อมจุดพักที่ blocksConsecutive = true (เช่น พักเบรกเช้า 20 นาที ระหว่างคาบ 2-3 และพักกลางวัน ระหว่างคาบ 4-5)
 */
export function canSpanConsecutivePeriods(
  term: AcademicTerm,
  startPeriod: number,
  duration: number
): { valid: boolean; reason?: string } {
  const periodSet = new Set(term.periodsConfig.map((p) => p.period));
  for (let offset = 0; offset < duration; offset++) {
    const p = startPeriod + offset;
    if (!periodSet.has(p)) {
      return { valid: false, reason: `คาบที่ ${p} เกินจำนวนคาบเรียนต่อวัน` };
    }
  }

  for (let offset = 0; offset < duration - 1; offset++) {
    const currentP = startPeriod + offset;
    const blockingBreak = term.breaksConfig.find(
      (b) => b.afterPeriod === currentP && b.blocksConsecutive
    );
    if (blockingBreak) {
      return {
        valid: false,
        reason: `คาบต่อเนื่องคร่อม "${blockingBreak.label}" (หลังคาบ ${currentP})`,
      };
    }
  }

  return { valid: true };
}

/**
 * ดึงรายชื่อครูทุกคนที่ต้องเข้าใน SynchronizedBlock
 * - ข้อ 2: คาบล็อคที่เป็นวิชาเรียนทั้งโรงเรียน (school_lock หรือ bindAllTeachers) ให้ปรากฏในคาบของครูทุกคนด้วย
 * - ข้อ 3: คาบที่เรียนเป็นระดับชั้น เช่น คาบประจำระดับชั้น ให้ปรากฏในคาบของครูที่ปรึกษาระดับชั้นนั้นด้วย (ดึงครูที่ปรึกษาอัตโนมัติ)
 */
export function resolveSyncBlockTeachers(
  block: SynchronizedBlock,
  classroomsMap: Map<string, Classroom>,
  allTeachersList?: Teacher[]
): string[] {
  // กิจกรรมที่กำหนดให้ลงเฉพาะในตารางนักเรียน ไม่ต้องลงในคาบครู (studentOnly)
  if (block.studentOnly) {
    return [];
  }

  const set = new Set<string>(block.teacherIds || []);

  // วิชาเรียนพร้อมกันแยกครูประจำห้อง (เช่น IS): ดึงครูที่สอนประจำแต่ละห้อง
  if (block.classroomTeacherMap) {
    Object.values(block.classroomTeacherMap).forEach((tids) => {
      if (Array.isArray(tids)) {
        tids.forEach((tid) => {
          if (tid) set.add(tid);
        });
      }
    });
  }

  // ข้อ 2: คาบทั้งโรงเรียน ให้ปรากฏในตารางของครูด้วย (ดึงครูทุกคนในโรงเรียน)
  if (
    block.blockType === "school_lock" ||
    block.category === "school" ||
    block.bindAllTeachers
  ) {
    if (allTeachersList && allTeachersList.length > 0) {
      allTeachersList.forEach((t) => set.add(t.id));
    }
  }

  // ข้อ 3: คาบที่เรียนเป็นระดับชั้น เช่น คาบประจำระดับชั้น ให้ปรากฏในคาบของครูที่ปรึกษาระดับชั้นนั้นด้วย
  if (
    block.bindAdvisorsAutomatically ||
    block.blockType === "moral_assembly" ||
    block.blockType === "homeroom" ||
    (block.category === "grade" && block.bindAdvisorsAutomatically)
  ) {
    for (const cid of (block.classroomIds || [])) {
      const room = classroomsMap.get(cid);
      if (room && room.advisorTeacherIds) {
        room.advisorTeacherIds.forEach((tid) => set.add(tid));
      }
    }
  }

  // วิชาเลือก
  if (block.offerings && block.offerings.length > 0) {
    for (const off of block.offerings) {
      if (off && off.teacherIds) {
        off.teacherIds.forEach((tid) => set.add(tid));
      }
    }
  }

  // ข้อ 2: กรองครูที่ได้รับการยกเว้นไม่เข้าคาบนี้ออก (เช่น เลือกลงคาบประชุมแทน)
  if (block.excludedTeacherIds && block.excludedTeacherIds.length > 0) {
    for (const exId of block.excludedTeacherIds) {
      set.delete(exId);
    }
  }

  return Array.from(set);
}

/**
 * ดึงรายการห้องเรียนกายภาพ (Physical Rooms) ที่ถูกใช้งานโดย TimetableEntry
 */
export function resolveEntryPhysicalRooms(
  entry: TimetableEntry,
  classroomsMap: Map<string, Classroom>,
  syncBlocksMap: Map<string, SynchronizedBlock>
): string[] {
  const rooms = new Set<string>();

  if (entry.sourceType === "assignment") {
    if (entry.roomId) {
      rooms.add(entry.roomId);
    } else if (entry.classroomIds.length === 1) {
      const c = classroomsMap.get(entry.classroomIds[0]);
      if (c?.defaultRoomId) rooms.add(c.defaultRoomId);
    }
    return Array.from(rooms);
  }

  if (entry.sourceType === "sync_block") {
    if (entry.roomId) {
      rooms.add(entry.roomId);
    }
    const block = entry.syncBlockId ? syncBlocksMap.get(entry.syncBlockId) : undefined;
    if (block?.blockType === "homeroom") {
      for (const cid of entry.classroomIds) {
        const c = classroomsMap.get(cid);
        if (c?.defaultRoomId) rooms.add(c.defaultRoomId);
      }
    }
    if (entry.electiveScope) {
      for (const off of entry.electiveScope) {
        if (off.roomId) rooms.add(off.roomId);
      }
    }
  }

  return Array.from(rooms);
}

/**
 * ตรวจสอบความครบถ้วนของยอดคาบรายห้องเรียน ความพร้อมของกลุ่มสาระ และความเป็นไปได้ก่อนกดจัดตารางสอน
 */
export function auditDatasetReadiness(dataset: SchoolDataset): DatasetReadinessReport {
  const { term, departments, classrooms, teachers, rooms, subjects, teachingAssignments, synchronizedBlocks, groupMeetingLocks } = dataset;

  const totalSlotsPerWeek = term.daysOfWeek.length * term.periodsConfig.length;
  const subjectsMap = new Map(subjects.map((s) => [s.id, s]));
  const classroomsMap = new Map(classrooms.map((c) => [c.id, c]));
  const roomsMap = new Map(rooms.map((r) => [r.id, r]));
  const issues: ReadinessIssue[] = [];

  // ตรวจสอบสถานะการยืนยันข้อมูลของกลุ่มสาระ
  const incompleteDepts = departments.filter((d) => !d.isEntryCompleted);
  for (const d of incompleteDepts) {
    issues.push({
      id: `dept_inc_${d.id}`,
      severity: "warning",
      category: "department_status",
      title: `กลุ่มสาระ "${d.name}" ยังไม่ได้กดยืนยันว่าลงข้อมูลครบแล้ว`,
      detail: `แนะนำให้ตัวแทนกลุ่มสาระตรวจสอบวิชาและกดปุ่มยืนยันความครบถ้วนก่อนจัดตาราง`,
      entityId: d.id,
    });
  }

  // 1. ตรวจนับยอดคาบรายห้องเรียน (Classroom Period Balance) เรียงตามระดับชั้นและห้อง 1-10 เสมอ
  const coreAcademicDepts = departments.filter((d) => d.code !== "AC");
  const sortedClassrooms = sortClassrooms(classrooms);
  const classroomAudits: ClassroomPeriodAudit[] = sortedClassrooms.map((c) => {
    const roomAssignments = teachingAssignments.filter((a) => a.classroomId === c.id);
    const periodsByDepartment: Record<string, number> = {};
    departments.forEach((d) => {
      periodsByDepartment[d.id] = 0;
    });

    // แยกวิชาปกติ กับวิชาแยกกลุ่ม/แยกแผนในห้องเดียว (subgroup)
    // หากเป็นวิชาแยกแผนที่เรียนคู่ขนานพร้อมกัน (มี subgroupSyncId เดียวกัน)
    // ให้นับจำนวนคาบลงตารางของห้องเพียงครั้งเดียว (ตาม max ของคาบในกลุ่ม)
    const normalRoomAsgs = roomAssignments.filter((a) => !a.isSubgroup || !a.subgroupSyncId);
    const subgroupRoomAsgs = roomAssignments.filter((a) => a.isSubgroup && a.subgroupSyncId);

    let academicPeriods = normalRoomAsgs.reduce((sum, a) => sum + a.periodsPerWeek, 0);
    const subgroupMaxMap = new Map<string, number>();
    for (const asg of subgroupRoomAsgs) {
      const cur = subgroupMaxMap.get(asg.subgroupSyncId!) || 0;
      subgroupMaxMap.set(asg.subgroupSyncId!, Math.max(cur, asg.periodsPerWeek));
    }
    for (const periods of subgroupMaxMap.values()) {
      academicPeriods += periods;
    }

    for (const asg of roomAssignments) {
      const sub = subjectsMap.get(asg.subjectId);
      if (sub) {
        periodsByDepartment[sub.departmentId] = (periodsByDepartment[sub.departmentId] || 0) + asg.periodsPerWeek;
      }
      if (asg.teacherIds.length === 0) {
        issues.push({
          id: `asg_notchr_${asg.id}`,
          severity: "error",
          category: "teacher_load",
          title: `ห้อง ${c.name} วิชา ${sub?.name ?? asg.subjectId} ยังไม่ได้ระบุครูผู้สอน`,
          detail: `กรุณาเลือกครูผู้สอนอย่างน้อย 1 ท่าน`,
          entityId: asg.id,
        });
      }
    }

    const roomSyncBlocks = synchronizedBlocks.filter((b) => b.classroomIds.includes(c.id));
    const syncBlockPeriods = roomSyncBlocks.reduce((sum, b) => sum + b.duration, 0);
    const freePeriods = Math.max(c.freePeriodsCount || 0, c.lockedFreeSlots?.length || 0);
    const totalPlannedPeriods = academicPeriods + syncBlockPeriods + freePeriods;
    const delta = totalPlannedPeriods - totalSlotsPerWeek;

    const missingDepartmentIds = coreAcademicDepts
      .filter((d) => (periodsByDepartment[d.id] || 0) === 0)
      .map((d) => d.id);

    if (delta > 0) {
      issues.push({
        id: `cls_over_${c.id}`,
        severity: "error",
        category: "classroom_balance",
        title: `ห้อง ${c.name} มียอดคาบรวมเกินตาราง (${totalPlannedPeriods}/${totalSlotsPerWeek} คาบ — เกิน ${delta} คาบ)`,
        detail: `วิชาเรียน ${academicPeriods} + คาบกิจกรรม/ล็อค ${syncBlockPeriods} + คาบอิสระ ${freePeriods} = ${totalPlannedPeriods} คาบ กรุณาลดวิชาหรือปรับจำนวนคาบอิสระ`,
        entityId: c.id,
      });
    } else if (delta < 0) {
      issues.push({
        id: `cls_under_${c.id}`,
        severity: "warning",
        category: "classroom_balance",
        title: `ห้อง ${c.name} มียอดคาบยังไม่ครบ (${totalPlannedPeriods}/${totalSlotsPerWeek} คาบ — ขาดอีก ${Math.abs(delta)} คาบ)`,
        detail: `หากตั้งใจให้เป็นคาบว่างของนักเรียน สามารถเพิ่มจำนวน "คาบอิสระ" ของห้อง ${c.name} อีก ${Math.abs(delta)} คาบเพื่อให้ยอดครบ ${totalSlotsPerWeek}/${totalSlotsPerWeek} พอดี`,
        entityId: c.id,
      });
    }

    if (c.advisorTeacherIds.length === 0) {
      issues.push({
        id: `cls_noadv_${c.id}`,
        severity: "warning",
        category: "classroom_balance",
        title: `ห้อง ${c.name} ยังไม่ได้ระบุครูที่ปรึกษา`,
        detail: `ควรระบุครูที่ปรึกษาเพื่อให้ระบบดึงเข้าคาบอบรมคุณธรรมและ Homeroom อัตโนมัติ (ข้อ 5)`,
        entityId: c.id,
      });
    } else if (c.advisorTeacherIds.length > 3) {
      issues.push({
        id: `cls_toomany_adv_${c.id}`,
        severity: "warning",
        category: "classroom_balance",
        title: `ห้อง ${c.name} มีครูที่ปรึกษาเกิน 3 คน (${c.advisorTeacherIds.length} คน)`,
        detail: `ระบบกำหนดให้มีครูที่ปรึกษาประจำห้องได้ไม่เกิน 3 คนต่อห้อง`,
        entityId: c.id,
      });
    }

    return {
      classroomId: c.id,
      classroomName: c.name,
      gradeLevelId: c.gradeLevelId,
      programName: c.programName,
      totalAvailableSlots: totalSlotsPerWeek,
      academicPeriods,
      syncBlockPeriods,
      freePeriods,
      totalPlannedPeriods,
      delta,
      periodsByDepartment,
      missingDepartmentIds,
      advisorCount: c.advisorTeacherIds.length,
    };
  });

  // 2. ตรวจภาระงานและความเป็นไปได้ของครูแต่ละคน (ข้อ 1: วิชาเลือก/เรียนพร้อมกันนับคาบเดียว ไม่คูณจำนวนห้อง)
  const teacherAudits: TeacherWorkloadAudit[] = teachers.map((t) => {
    const workload = calculateTeacherWorkload(t.id, dataset);
    const teachingPeriods = workload.teachingPeriods;
    const electivePeriods = workload.electivePeriods;
    const advisorPeriods = workload.advisorPeriods;
    const activityPeriods = workload.activityPeriods;
    const meetingPeriods = workload.meetingPeriods;

    const teacherMeetings = groupMeetingLocks.filter((m) =>
      isTeacherInGroupMeeting(t, m, dataset.divisions)
    );

    // นับช่องที่ถูกล็อคไม่ให้สอนแบบไม่ซ้ำ (Hard Unavailable + Meeting Locks)
    const blockedSet = new Set<string>();
    for (const u of t.unavailableSlots || []) {
      if (u.type === "hard") blockedSet.add(`${u.day}:${u.period}`);
    }
    for (const m of teacherMeetings) {
      if (m.excludedTeacherIds?.includes(t.id)) continue;
      for (let k = 0; k < m.duration; k++) {
        blockedSet.add(`${m.day}:${m.startPeriod + k}`);
      }
    }

    const dept = departments.find((d) => d.id === t.departmentId);
    const exemptAft = isTeacherExemptAfternoonStreak(t, dept);
    const maxLateDays = getTeacherMaxLatePeriodDays(t, dept, term);

    // คำนวณเพดานคาบสอนสูงสุดต่อสัปดาห์ตามกฎช่วงบ่าย (ข้อ 10) และคาบ 8 (ข้อ 11)
    let theoreticalTeachingCap = 0;
    const afternoonCountPerDay = term.periodsConfig.filter((pc) => pc.session === "afternoon").length;
    const lateCountPerDay = term.periodsConfig.filter((pc) => pc.isLatePeriod).length;
    const dayCaps: { withLate: number; withoutLate: number }[] = [];

    for (const day of term.daysOfWeek) {
      let freeMorning = 0;
      let freeAftTotal = 0;
      let freeAftNonLate = 0;
      for (const pc of term.periodsConfig) {
        if (blockedSet.has(`${day}:${pc.period}`)) continue;
        if (pc.session === "morning") {
          freeMorning++;
        } else {
          freeAftTotal++;
          if (!pc.isLatePeriod) freeAftNonLate++;
        }
      }

      const maxInSpan = (len: number) => {
        if (exemptAft) return len;
        const k = term.solverSettings.maxAfternoonConsecutive;
        if (k <= 0) return 0;
        // Max items in length `len` with at most `k` consecutive = floor((len + 1) * k / (k + 1)) approx
        let cnt = 0;
        let streak = 0;
        for (let i = 0; i < len; i++) {
          if (streak < k) {
            cnt++;
            streak++;
          } else {
            streak = 0;
          }
        }
        return cnt;
      };

      const capWithLate = freeMorning + Math.min(freeAftTotal, maxInSpan(afternoonCountPerDay));
      const capWithoutLate =
        freeMorning + Math.min(freeAftNonLate, maxInSpan(afternoonCountPerDay - lateCountPerDay));
      dayCaps.push({ withLate: capWithLate, withoutLate: capWithoutLate });
    }

    dayCaps.sort((a, b) => (b.withLate - b.withoutLate) - (a.withLate - a.withoutLate));
    dayCaps.forEach((dc, idx) => {
      theoreticalTeachingCap += idx < maxLateDays ? dc.withLate : dc.withoutLate;
    });

    const totalScheduledForTeacher = teachingPeriods + electivePeriods + advisorPeriods + activityPeriods;
    const workloadSubjectToCap = teachingPeriods + electivePeriods;
    const availableForTeaching = Math.min(totalSlotsPerWeek - blockedSet.size, theoreticalTeachingCap + advisorPeriods + activityPeriods);
    const isOverloaded =
      totalScheduledForTeacher > totalSlotsPerWeek - blockedSet.size ||
      workloadSubjectToCap > theoreticalTeachingCap;

    if (isOverloaded) {
      issues.push({
        id: `tchr_over_${t.id}`,
        severity: "error",
        category: "teacher_load",
        title: `${getTeacherFullName(t)} มีคาบสอน (${workloadSubjectToCap} คาบ / รวมกิจกรรม ${totalScheduledForTeacher} คาบ) เกินเพดานที่เป็นไปได้ (${theoreticalTeachingCap} คาบสอน)`,
        detail: `คำนวณจากเวลาว่างหักล็อคส่วนตัว/ประชุม (${blockedSet.size} คาบ) และกฎช่วงบ่ายไม่เกิน ${term.solverSettings.maxAfternoonConsecutive} คาบติด + คาบ 8 ไม่เกิน ${Number.isFinite(maxLateDays) ? maxLateDays : "ไม่จำกัด"} วัน/สัปดาห์`,
        entityId: t.id,
      });
    }

    // ตรวจสอบว่าคาบล็อคตายตัว (Fixed SyncBlock) ชนกับคาบล็อคส่วนตัวหรือคาบประชุมของครูหรือไม่
    for (const b of synchronizedBlocks) {
      if (!b.isTimeLocked || !b.fixedDay || !b.fixedStartPeriod) continue;
      const blockTeachers = resolveSyncBlockTeachers(b, classroomsMap, teachers);
      if (!blockTeachers.includes(t.id)) continue;

      // หากครูได้รับการยกเว้นจากกิจกรรม หรือเลือกแนวทาง "เก็บไว้ทั้งคู่" ร่วมกับกิจกรรมนี้แล้ว จะไม่นับเป็นข้อผิดพลาด
      if (b.excludedTeacherIds?.includes(t.id)) continue;
      if (b.coexistTeacherIds?.includes(t.id)) continue;

      for (let k = 0; k < b.duration; k++) {
        const pNum = b.fixedStartPeriod + k;
        const key = `${b.fixedDay}:${pNum}`;
        if (blockedSet.has(key)) {
          // ตรวจสอบว่าชนกับคาบประชุมใด หรือคาบส่วนตัว
          const clashingMeeting = teacherMeetings.find(
            (m) => m.day === b.fixedDay && pNum >= m.startPeriod && pNum < m.startPeriod + m.duration
          );

          if (clashingMeeting?.excludedTeacherIds?.includes(t.id)) {
            continue; // ได้รับการยกเว้นไม่ต้องเข้าประชุมในคาบนี้แล้ว
          }

          if (clashingMeeting?.coexistTeacherIds?.includes(t.id)) {
            continue; // มีการเลือกเก็บไว้ทั้งคู่แล้ว
          }

          issues.push({
            id: `tchr_fixed_clash_${t.id}_${b.id}_${k}`,
            severity: "error",
            category: "lock_conflict",
            title: `เวลาของ "${b.title}" ชนกับคาบล็อคไม่ว่าง/ประชุมของ ${getTeacherFullName(t)}`,
            detail: `ชนกันที่ ${b.fixedDay} คาบ ${pNum} กรุณาปรับเวลาคาบกิจกรรมหรือปลดล็อคคาบครู`,
            entityId: t.id,
            day: b.fixedDay,
            period: pNum,
            syncBlockId: b.id,
            meetingId: clashingMeeting?.id,
          });
        }
      }
    }

    return {
      teacherId: t.id,
      teacherCode: t.code,
      teacherName: getTeacherFullName(t),
      departmentId: t.departmentId,
      teachingPeriods,
      electivePeriods,
      advisorPeriods,
      activityPeriods,
      meetingPeriods,
      unavailableHardCount: blockedSet.size,
      totalCommittedPeriods: totalScheduledForTeacher + meetingPeriods,
      maxPossibleSlots: availableForTeaching,
      isOverloaded,
    };
  });

  // 3. ตรวจความจุห้องปฏิบัติการร่วม (Room Capacity Check - ข้อ 9, 18)
  const roomUsageCount = new Map<string, number>();
  for (const asg of teachingAssignments) {
    const c = classroomsMap.get(asg.classroomId);
    for (const sp of asg.splitSessions) {
      const rid = sp.roomId ?? c?.defaultRoomId ?? null;
      if (rid) roomUsageCount.set(rid, (roomUsageCount.get(rid) || 0) + sp.duration);
    }
  }
  for (const b of synchronizedBlocks) {
    if (b.sharedRoomId) {
      roomUsageCount.set(b.sharedRoomId, (roomUsageCount.get(b.sharedRoomId) || 0) + b.duration);
    }
    for (const off of b.offerings || []) {
      if (off.roomId) {
        roomUsageCount.set(off.roomId, (roomUsageCount.get(off.roomId) || 0) + b.duration);
      }
    }
  }
  for (const [rid, used] of roomUsageCount.entries()) {
    const rm = roomsMap.get(rid);
    if (!rm || rm.allowOverlap) continue; // ข้อ 4: อนุญาตให้จัดตารางทับซ้อนกันได้ (สลับสัปดาห์ / สิทธิ์ใช้ร่วมกัน)
    const maxCap = totalSlotsPerWeek * (rm.maxConcurrentClasses || 1);
    if (used > maxCap) {
      issues.push({
        id: `room_over_${rid}`,
        severity: "error",
        category: "room_load",
        title: `ห้อง "${rm.code} - ${rm.name}" ถูกใช้งานรวม ${used} คาบ เกินความจุสูงสุด (${maxCap} คาบ/สัปดาห์)`,
        detail: `กรุณากระจายบางวิชาไปใช้ห้องปฏิบัติการอื่นหรือห้องเรียนนักเรียน`,
        entityId: rid,
      });
    }
  }

  const hasFatalError = issues.some((i) => i.severity === "error");
  const isAllRoomsBalanced = classroomAudits.every((a) => a.delta === 0);
  const isAllDepartmentsCompleted = incompleteDepts.length === 0;

  return {
    isAllRoomsBalanced,
    isAllDepartmentsCompleted,
    canRunSolver: !hasFatalError,
    totalSlotsPerWeek,
    classroomAudits,
    teacherAudits,
    issues,
  };
}

export interface PlacementCheckResult {
  status: "valid" | "soft_warning" | "hard_conflict";
  hardReasons: string[];
  softWarnings: string[];
  scoreDelta: number;
}

/**
 * ตรวจสอบความถูกต้องเมื่อวาง `candidateEntry` ลงใน `targetDay`, `targetStartPeriod`
 * เทียบกับ `otherEntries` ทั้งหมดในตาราง (ใช้ทั้งใน Interactive Editor และการตรวจผลลัพธ์)
 */
export function evaluateEntryPlacement(
  candidateEntry: TimetableEntry,
  targetDay: DayOfWeek,
  targetStartPeriod: number,
  otherEntries: TimetableEntry[],
  dataset: SchoolDataset
): PlacementCheckResult {
  const hardReasons: string[] = [];
  const softWarnings: string[] = [];
  let scoreDelta = 0;

  const { term, teachers, departments, classrooms, rooms, subjects, synchronizedBlocks, groupMeetingLocks } = dataset;
  const teachersMap = new Map(teachers.map((t) => [t.id, t]));
  const deptsMap = new Map(departments.map((d) => [d.id, d]));
  const classroomsMap = new Map(classrooms.map((c) => [c.id, c]));
  const roomsMap = new Map(rooms.map((r) => [r.id, r]));
  const subjectsMap = new Map(subjects.map((s) => [s.id, s]));
  const syncBlocksMap = new Map(synchronizedBlocks.map((b) => [b.id, b]));
  const periodsMap = new Map(term.periodsConfig.map((p) => [p.period, p]));

  // 1. ตรวจการคร่อมพักเบรกเช้า 20 นาที / พักกลางวัน (ข้อ 12)
  const spanCheck = canSpanConsecutivePeriods(term, targetStartPeriod, candidateEntry.duration);
  if (!spanCheck.valid && spanCheck.reason) {
    hardReasons.push(spanCheck.reason);
    return { status: "hard_conflict", hardReasons, softWarnings, scoreDelta: -1000 };
  }

  const targetPeriods: number[] = [];
  for (let k = 0; k < candidateEntry.duration; k++) {
    targetPeriods.push(targetStartPeriod + k);
  }

  const candidateRooms = resolveEntryPhysicalRooms(candidateEntry, classroomsMap, syncBlocksMap);

  // 2. ตรวจการชนห้องเรียนนักเรียน, ชนครูผู้สอน, และชนห้องปฏิบัติการร่วมกับคาบอื่น
  for (const p of targetPeriods) {
    const overlapping = otherEntries.filter(
      (e) =>
        e.id !== candidateEntry.id &&
        e.day === targetDay &&
        p >= e.startPeriod &&
        p < e.startPeriod + e.duration
    );

    for (const other of overlapping) {
      if (other.sourceType === "free_period") continue;

      // หากเป็นวิชาแยกกลุ่ม/แยกแผนในห้องเดียวกัน (เช่น ม.4/7 แบ่งแผนคณิต/ภาษา) และเชื่อมโยงรหัสเดียวกัน
      // ถือว่าเจตนาให้เรียนพร้อมกันในคาบเดียวกัน
      const isSameSubgroupPair =
        Boolean(candidateEntry.isSubgroup) &&
        Boolean(other.isSubgroup) &&
        Boolean(candidateEntry.subgroupSyncId) &&
        candidateEntry.subgroupSyncId === other.subgroupSyncId;

      // ชนห้องเรียนนักเรียน
      for (const cid of candidateEntry.classroomIds) {
        if (other.classroomIds.includes(cid)) {
          if (!isSameSubgroupPair) {
            const cName = classroomsMap.get(cid)?.name ?? cid;
            hardReasons.push(`ห้อง ${cName} มีเรียน "${other.title}" อยู่แล้วในคาบ ${p}`);
          }
        }
      }

      // ชนคาบอิสระที่ห้องเรียนล็อคไว้ตายตัว (ข้อ 2)
      if (candidateEntry.sourceType === "assignment") {
        for (const cid of candidateEntry.classroomIds) {
          const cls = classroomsMap.get(cid);
          if (cls?.lockedFreeSlots?.some((lf) => lf.day === targetDay && lf.period === p)) {
            hardReasons.push(`ห้อง ${cls.name} ถูกล็อคเป็น "คาบอิสระ" ในคาบ ${p}`);
          }
        }
      }

      // ชนครูผู้สอน (รวมครูสอนร่วม Co-teaching และครูที่ปรึกษา ข้อ 5, 14)
      for (const tid of candidateEntry.teacherIds) {
        if (other.teacherIds.includes(tid)) {
          const t = teachersMap.get(tid);
          const tName = t ? getTeacherFullName(t) : tid;
          hardReasons.push(`${tName} ติดสอน "${other.title}" ในคาบ ${p}`);
        }
      }

      // ชนห้องปฏิบัติการร่วม (ข้อ 9, 18)
      const otherRooms = resolveEntryPhysicalRooms(other, classroomsMap, syncBlocksMap);
      for (const rid of candidateRooms) {
        if (otherRooms.includes(rid)) {
          // หากเป็นวิชาแยกกลุ่มของห้องเดียวกันที่ใช้ห้องประจำของตนเองร่วมกัน ไม่นับว่าชนห้อง
          if (
            isSameSubgroupPair &&
            candidateEntry.classroomIds.some((cid) => classroomsMap.get(cid)?.defaultRoomId === rid)
          ) {
            continue;
          }
          const rm = roomsMap.get(rid);
          if (rm?.allowOverlap) continue; // ข้อ 4: อนุญาตให้จัดตารางทับซ้อนกันได้
          const maxCap = rm?.maxConcurrentClasses ?? 1;
          const usedCount =
            1 +
            overlapping.filter((oe) => {
              const oeIsSameSubgroup =
                Boolean(candidateEntry.isSubgroup) &&
                Boolean(oe.isSubgroup) &&
                Boolean(candidateEntry.subgroupSyncId) &&
                candidateEntry.subgroupSyncId === oe.subgroupSyncId;
              if (
                oeIsSameSubgroup &&
                candidateEntry.classroomIds.some((cid) => classroomsMap.get(cid)?.defaultRoomId === rid)
              ) {
                return false;
              }
              return resolveEntryPhysicalRooms(oe, classroomsMap, syncBlocksMap).includes(rid);
            }).length;
          if (usedCount > maxCap) {
            hardReasons.push(`ห้อง "${rm?.code ?? rid}" ถูกใช้โดย "${other.title}" ในคาบ ${p} (ห้ามใช้ทับกัน)`);
          }
        }
      }
    }
  }

  // 3. ตรวจล็อคคาบส่วนตัวครู (ข้อ 8), ประชุมฝ่าย (ข้อ 7), บ่าย 3 คาบติด (ข้อ 10), และเพดานคาบ 8 (ข้อ 11)
  const afternoonPeriods = term.periodsConfig
    .filter((pc) => pc.session === "afternoon")
    .map((pc) => pc.period)
    .sort((a, b) => a - b);
  const latePeriodSet = new Set(term.periodsConfig.filter((pc) => pc.isLatePeriod).map((pc) => pc.period));

  for (const tid of candidateEntry.teacherIds) {
    const t = teachersMap.get(tid);
    if (!t) continue;
    const dept = deptsMap.get(t.departmentId);
    const tName = getTeacherFullName(t);

    for (const p of targetPeriods) {
      // ล็อคส่วนตัวครู (ข้อ 8)
      const unavail = t.unavailableSlots.find((u) => u.day === targetDay && u.period === p);
      if (unavail) {
        if (unavail.type === "hard") {
          hardReasons.push(`${tName} ล็อคไม่สอนวัน${targetDay} คาบ ${p} (${unavail.reason || "คาบล็อคครู"})`);
        } else {
          softWarnings.push(`${tName} ขอหลีกเลี่ยงคาบ ${p} (${unavail.reason})`);
          scoreDelta -= 15;
        }
      }

      // ล็อคประชุมฝ่าย / กลุ่มสาระ (ข้อ 7)
      const mtg = groupMeetingLocks.find(
        (m) =>
          m.day === targetDay &&
          p >= m.startPeriod &&
          p < m.startPeriod + m.duration &&
          isTeacherInGroupMeeting(t, m, dataset.divisions)
      );
      if (mtg) {
        hardReasons.push(`${tName} ติด "${mtg.title}" ในคาบ ${p}`);
      }
    }

    const countsTowardWorkloadLimits =
      candidateEntry.sourceType === "assignment" ||
      term.solverSettings.countActivitiesInTeacherLimits ||
      (candidateEntry.sourceType === "sync_block" && Boolean(candidateEntry.electiveScope?.length));

    if (countsTowardWorkloadLimits) {
      // ข้อ 10: ตอนบ่าย ครูจะสอน 3 คาบติดกันไม่ได้ ยกเว้นครูบางกลุ่มสาระ
      if (!isTeacherExemptAfternoonStreak(t, dept) && afternoonPeriods.length > term.solverSettings.maxAfternoonConsecutive) {
        const occupiedAfternoon = new Set<number>();
        for (const p of targetPeriods) {
          if (afternoonPeriods.includes(p)) occupiedAfternoon.add(p);
        }
        for (const oe of otherEntries) {
          if (oe.id === candidateEntry.id || oe.day !== targetDay || !oe.teacherIds.includes(tid)) continue;
          const oeCounts =
            oe.sourceType === "assignment" ||
            term.solverSettings.countActivitiesInTeacherLimits ||
            Boolean(oe.electiveScope?.length);
          if (!oeCounts) continue;
          for (let k = 0; k < oe.duration; k++) {
            const op = oe.startPeriod + k;
            if (afternoonPeriods.includes(op)) occupiedAfternoon.add(op);
          }
        }

        // นับความยาวคาบติดกันสูงสุดในช่วงบ่าย
        let streak = 0;
        let maxStreak = 0;
        let prevP = -99;
        for (const ap of afternoonPeriods) {
          if (occupiedAfternoon.has(ap)) {
            streak = ap === prevP + 1 ? streak + 1 : 1;
            if (streak > maxStreak) maxStreak = streak;
            prevP = ap;
          } else {
            streak = 0;
          }
        }
        if (maxStreak > term.solverSettings.maxAfternoonConsecutive) {
          hardReasons.push(
            `${tName} จะสอนช่วงบ่ายติดกัน ${maxStreak} คาบ (เกินกำหนดสูงสุด ${term.solverSettings.maxAfternoonConsecutive} คาบติด สำหรับกลุ่มสาระ${dept?.name ?? ""})`
          );
        }
      }

      // ข้อ 11: ครูจะสอนคาบ 8 ได้แค่ 1-3 วันต่อสัปดาห์ ยกเว้นครูบางกลุ่มสาระ
      const maxLateDays = getTeacherMaxLatePeriodDays(t, dept, term);
      const touchesLate = targetPeriods.some((p) => latePeriodSet.has(p));
      if (touchesLate && Number.isFinite(maxLateDays)) {
        const lateDays = new Set<DayOfWeek>([targetDay]);
        for (const oe of otherEntries) {
          if (oe.id === candidateEntry.id || !oe.teacherIds.includes(tid)) continue;
          const oeCounts =
            oe.sourceType === "assignment" ||
            term.solverSettings.countActivitiesInTeacherLimits ||
            Boolean(oe.electiveScope?.length);
          if (!oeCounts) continue;
          for (let k = 0; k < oe.duration; k++) {
            if (latePeriodSet.has(oe.startPeriod + k)) {
              lateDays.add(oe.day);
            }
          }
        }
        if (lateDays.size > maxLateDays) {
          hardReasons.push(
            `${tName} จะมีสอนคาบท้ายวัน (คาบ 8) รวม ${lateDays.size} วัน/สัปดาห์ (เกินโควตาสูงสุด ${maxLateDays} วัน)`
          );
        }
      }
    }
  }

  // 4. ตรวจเงื่อนไขเฉพาะรายวิชา (ข้อ 17: คาบที่ต้องการ เช่น พละคาบ 4/8 และลำดับวิชา เช่น ศิลปะก่อนพละ)
  if (candidateEntry.subjectId) {
    const sub = subjectsMap.get(candidateEntry.subjectId);
    if (sub) {
      const { rules } = sub;

      if (rules.allowedPeriodsOnly && rules.allowedPeriodsOnly.length > 0) {
        const allAllowed = targetPeriods.every((p) => rules.allowedPeriodsOnly!.includes(p));
        if (!allAllowed) {
          hardReasons.push(`วิชา "${sub.name}" บังคับลงเฉพาะคาบ ${rules.allowedPeriodsOnly.join(", ")}`);
        }
      }

      if (rules.forbiddenPeriods.some((fp) => targetPeriods.includes(fp))) {
        hardReasons.push(`วิชา "${sub.name}" ห้ามลงในคาบ ${rules.forbiddenPeriods.join(", ")}`);
      }

      if (!rules.allowSameDayRepeat && candidateEntry.classroomIds.length === 1) {
        const cid = candidateEntry.classroomIds[0];
        const sameDaySameSub = otherEntries.some(
          (oe) =>
            oe.id !== candidateEntry.id &&
            oe.day === targetDay &&
            oe.subjectId === sub.id &&
            oe.classroomIds.includes(cid)
        );
        if (sameDaySameSub) {
          softWarnings.push(`ห้องนี้มีเรียนวิชา "${sub.shortName || sub.name}" ในวันเดียวกันแล้ว`);
          scoreDelta -= 25;
        }
      }

      if (rules.preferredPeriods.length > 0) {
        const inPreferred = targetPeriods.some((p) => rules.preferredPeriods.includes(p));
        if (inPreferred) {
          scoreDelta += 30;
        } else {
          softWarnings.push(
            `เงื่อนไขแนะนำ: วิชา "${sub.shortName || sub.name}" ควรอยู่คาบ ${rules.preferredPeriods.join(" หรือ ")}`
          );
          scoreDelta -= 20;
        }
      }

      if (rules.preferMorning) {
        const allMorning = targetPeriods.every((p) => periodsMap.get(p)?.session === "morning");
        if (allMorning) scoreDelta += 10;
        else scoreDelta -= 6;
      }

      // ตรวจลำดับวิชาต่อเนื่องในห้องเดียวกัน เช่น พละควรเรียนต่อจากศิลปะ (ศิลปะ = targetStartPeriod - 1)
      if (rules.preferAfterSubjectIds.length > 0 && candidateEntry.classroomIds.length === 1) {
        const cid = candidateEntry.classroomIds[0];
        const prevPeriod = targetStartPeriod - 1;
        const prevEntry = otherEntries.find(
          (oe) =>
            oe.day === targetDay &&
            oe.classroomIds.includes(cid) &&
            oe.startPeriod + oe.duration - 1 === prevPeriod
        );
        if (prevEntry?.subjectId && rules.preferAfterSubjectIds.includes(prevEntry.subjectId)) {
          scoreDelta += 45;
        } else {
          const wantedNames = rules.preferAfterSubjectIds
            .map((id) => subjectsMap.get(id)?.shortName || subjectsMap.get(id)?.name || id)
            .join("/");
          softWarnings.push(`เงื่อนไขแนะนำ: ก่อนวิชา "${sub.shortName || sub.name}" ควรเป็นวิชา "${wantedNames}"`);
          scoreDelta -= 15;
        }
      }

      if (rules.preferBeforeSubjectIds.length > 0 && candidateEntry.classroomIds.length === 1) {
        const cid = candidateEntry.classroomIds[0];
        const nextPeriod = targetStartPeriod + candidateEntry.duration;
        const nextEntry = otherEntries.find(
          (oe) => oe.day === targetDay && oe.classroomIds.includes(cid) && oe.startPeriod === nextPeriod
        );
        if (nextEntry?.subjectId && rules.preferBeforeSubjectIds.includes(nextEntry.subjectId)) {
          scoreDelta += 45;
        }
      }
    }
  }

  // Dedup reasons
  const uniqueHard = Array.from(new Set(hardReasons));
  const uniqueSoft = Array.from(new Set(softWarnings));

  if (uniqueHard.length > 0) {
    return { status: "hard_conflict", hardReasons: uniqueHard, softWarnings: uniqueSoft, scoreDelta: -1000 };
  }
  if (uniqueSoft.length > 0) {
    return { status: "soft_warning", hardReasons: [], softWarnings: uniqueSoft, scoreDelta };
  }
  return { status: "valid", hardReasons: [], softWarnings: [], scoreDelta };
}

export interface SwapSuggestion {
  type: "direct_move" | "swap_two";
  targetDay: DayOfWeek;
  targetPeriod: number;
  swapWithEntry?: TimetableEntry;
  status: "valid" | "soft_warning";
  warnings: string[];
  scoreGain: number;
}

/**
 * ตัวช่วยหาช่องย้ายว่าง หรือคู่สลับคาบอัตโนมัติ (Smart Swap Finder) สำหรับโหมดปรับแก้รายกรณี
 */
export function findSmartSwapSuggestions(
  sourceEntry: TimetableEntry,
  allEntries: TimetableEntry[],
  dataset: SchoolDataset
): SwapSuggestion[] {
  const suggestions: SwapSuggestion[] = [];
  if (sourceEntry.classroomIds.length !== 1) return suggestions;
  const cid = sourceEntry.classroomIds[0];

  const othersWithoutSource = allEntries.filter((e) => e.id !== sourceEntry.id && e.sourceType !== "free_period");

  for (const day of dataset.term.daysOfWeek) {
    for (const pc of dataset.term.periodsConfig) {
      const p = pc.period;
      if (day === sourceEntry.day && p === sourceEntry.startPeriod) continue;

      const spanOk = canSpanConsecutivePeriods(dataset.term, p, sourceEntry.duration);
      if (!spanOk.valid) continue;

      // หาคาบที่ขวางอยู่ในห้องเดียวกันช่วง p .. p + duration - 1
      const blockingInRoom = othersWithoutSource.filter(
        (e) =>
          e.classroomIds.includes(cid) &&
          e.day === day &&
          p < e.startPeriod + e.duration &&
          p + sourceEntry.duration > e.startPeriod
      );

      if (blockingInRoom.length === 0) {
        const res = evaluateEntryPlacement(sourceEntry, day, p, othersWithoutSource, dataset);
        if (res.status !== "hard_conflict") {
          suggestions.push({
            type: "direct_move",
            targetDay: day,
            targetPeriod: p,
            status: res.status,
            warnings: res.softWarnings,
            scoreGain: res.scoreDelta,
          });
        }
      } else if (
        blockingInRoom.length === 1 &&
        !blockingInRoom[0].isPinned &&
        blockingInRoom[0].sourceType === "assignment" &&
        blockingInRoom[0].duration === sourceEntry.duration &&
        blockingInRoom[0].startPeriod === p
      ) {
        const targetEntry = blockingInRoom[0];
        const remaining = othersWithoutSource.filter((e) => e.id !== targetEntry.id);

        const movedSource: TimetableEntry = { ...sourceEntry, day, startPeriod: p };
        const resA = evaluateEntryPlacement(sourceEntry, day, p, remaining, dataset);
        if (resA.status === "hard_conflict") continue;

        const resB = evaluateEntryPlacement(
          targetEntry,
          sourceEntry.day,
          sourceEntry.startPeriod,
          [...remaining, movedSource],
          dataset
        );
        if (resB.status === "hard_conflict") continue;

        const combinedStatus =
          resA.status === "soft_warning" || resB.status === "soft_warning" ? "soft_warning" : "valid";
        suggestions.push({
          type: "swap_two",
          targetDay: day,
          targetPeriod: p,
          swapWithEntry: targetEntry,
          status: combinedStatus,
          warnings: [...resA.softWarnings, ...resB.softWarnings],
          scoreGain: resA.scoreDelta + resB.scoreDelta,
        });
      }
    }
  }

  return suggestions.sort((a, b) => {
    if (a.status !== b.status) return a.status === "valid" ? -1 : 1;
    if (a.type !== b.type) return a.type === "direct_move" ? -1 : 1;
    return b.scoreGain - a.scoreGain;
  });
}

/**
 * ดึงเลขระดับชั้น (1..6) และเลขห้อง (1..10) จาก classroom name หรือ gradeLevelId
 */
function extractGradeAndRoom(item: { name: string; roomNumber?: number; gradeLevelId?: string }) {
  let gradeNum = 0;
  if (item.gradeLevelId) {
    const gMatch = item.gradeLevelId.match(/(\d+)/);
    if (gMatch) gradeNum = parseInt(gMatch[1], 10);
  }
  if (gradeNum === 0) {
    const nameGMatch = item.name.match(/(?:ม\.|M|ชั้น)?\s*(\d+)\s*\//i);
    if (nameGMatch) gradeNum = parseInt(nameGMatch[1], 10);
  }

  let roomNum = typeof item.roomNumber === "number" && item.roomNumber > 0 ? item.roomNumber : 0;
  if (roomNum === 0) {
    const nameRMatch = item.name.match(/\/(\d+)/);
    if (nameRMatch) roomNum = parseInt(nameRMatch[1], 10);
  }

  return { gradeNum, roomNum };
}

/**
 * เรียงลำดับห้องเรียนในระดับชั้นให้เรียง 1-10 เสมอ (เช่น ม.1/1, ม.1/2, ... ม.1/10)
 * แยกเป็นระดับชั้น ม.1 ถึง ม.6 ตามลำดับ ป้องกันปัญหา string sort ที่เลข 10 ไปอยู่ก่อน 2
 */
export function sortClassrooms<
  T extends { name: string; roomNumber?: number; gradeLevelId?: string }
>(classrooms: T[]): T[] {
  return [...classrooms].sort((a, b) => {
    const pa = extractGradeAndRoom(a);
    const pb = extractGradeAndRoom(b);

    // 1. ระดับชั้น (ม.1 มาก่อน ม.2)
    if (pa.gradeNum !== pb.gradeNum && pa.gradeNum > 0 && pb.gradeNum > 0) {
      return pa.gradeNum - pb.gradeNum;
    }

    if (a.gradeLevelId && b.gradeLevelId && a.gradeLevelId !== b.gradeLevelId) {
      const gCmp = a.gradeLevelId.localeCompare(b.gradeLevelId, "th", { numeric: true });
      if (gCmp !== 0) return gCmp;
    }

    // 2. เลขห้อง 1 ถึง 10 (1 มาก่อน 2 มาก่อน ... 10)
    if (pa.roomNum !== pb.roomNum && pa.roomNum > 0 && pb.roomNum > 0) {
      return pa.roomNum - pb.roomNum;
    }

    return a.name.localeCompare(b.name, "th", { numeric: true });
  });
}

export interface TeacherWorkloadDetail {
  teachingPeriods: number; // คาบสอนวิชาการ (วิชาเลือก/เรียนพร้อมกันนับแค่ครั้งเดียวตามคาบสอนจริง ไม่คูณจำนวนห้อง)
  electivePeriods: number; // คาบวิชาเลือกจาก SyncBlock / Elective Pool
  advisorPeriods: number; // คาบครูที่ปรึกษา (คุณธรรม / Homeroom)
  activityPeriods: number; // คาบกิจกรรม (ลูกเสือ / ชุมนุม / นศท.)
  meetingPeriods: number; // คาบประชุมฝ่าย
  totalTeachingPeriods: number; // คาบสอนจริงรวม (ไม่นับคาบประชุม ตามข้อ 2)
  totalWorkloadPeriods: number; // ยอดรวมภาระงานทั้งหมด (รวมประชุม)
}

/**
 * คำนวณภาระงานของครูรายบุคคล (ข้อ 1)
 * หากวิชาเลือกหรือวิชาเรียนพร้อมกันหลายห้อง (Joint Class) ให้นับคาบตามที่สอนจริง (เช่น วิชาเลือก 2 คาบ ก็นับแค่ 2 คาบ ไม่ใช่ 2 คาบ x 3 ห้อง)
 */
export function calculateTeacherWorkload(
  teacherId: string,
  dataset: SchoolDataset
): TeacherWorkloadDetail {
  const { teachingAssignments, synchronizedBlocks, groupMeetingLocks, subjects, classrooms } = dataset;
  const subjectsMap = new Map(subjects.map((s) => [s.id, s]));
  const classroomsMap = new Map(classrooms.map((c) => [c.id, c]));
  const teacher = dataset.teachers.find((t) => t.id === teacherId);

  // 1. คาบสอนวิชาการ: นับคาบตามกลุ่มวิชาที่สอน (วิชาเลือก/เรียนพร้อมกันนับเพียงครั้งเดียว ไม่คูณจำนวนห้อง)
  const teacherAsgs = teachingAssignments.filter((a) => a.teacherIds.includes(teacherId));
  const seenJointGroups = new Set<string>();
  let teachingPeriods = 0;

  for (const a of teacherAsgs) {
    const sub = subjectsMap.get(a.subjectId);
    const isElective = sub?.subjectType === "elective" || a.isJointClass;

    if (isElective) {
      const groupKey =
        a.jointGroupId ||
        `joint_elec_${a.subjectId}_${a.teacherIds.slice().sort().join("_")}`;
      if (!seenJointGroups.has(groupKey)) {
        seenJointGroups.add(groupKey);
        teachingPeriods += a.periodsPerWeek;
      }
    } else {
      teachingPeriods += a.periodsPerWeek;
    }
  }

  // 2. คาบวิชาเลือก & กิจกรรมจาก Synchronized Blocks
  let electivePeriods = 0;
  let advisorPeriods = 0;
  let activityPeriods = 0;

  for (const b of synchronizedBlocks) {
    const blockTeachers = resolveSyncBlockTeachers(b, classroomsMap, dataset.teachers);
    if (!blockTeachers.includes(teacherId)) continue;

    const inOffering = b.offerings?.some((o) => o.teacherIds.includes(teacherId)) ?? false;
    const isAdvisorBound =
      (b.bindAdvisorsAutomatically ||
        b.blockType === "moral_assembly" ||
        b.blockType === "homeroom" ||
        (b.category === "grade" && b.bindAdvisorsAutomatically)) &&
      b.classroomIds.some((cid) => classroomsMap.get(cid)?.advisorTeacherIds.includes(teacherId));

    if (inOffering) {
      electivePeriods += b.duration;
    } else if (isAdvisorBound) {
      advisorPeriods += b.duration;
    } else {
      activityPeriods += b.duration;
    }
  }

  // 3. คาบประชุมฝ่าย
  let meetingPeriods = 0;
  if (teacher) {
    const teacherMeetings = groupMeetingLocks.filter(
      (m) =>
        (m.teacherIds && m.teacherIds.includes(teacherId)) ||
        (m.targetType === "department" && m.targetId === teacher.departmentId) ||
        (m.targetType === "division" && teacher.divisionIds.includes(m.targetId)) ||
        (m.divisionName && teacher.divisionIds.includes(m.divisionName))
    );
    meetingPeriods = teacherMeetings.reduce((sum, m) => sum + m.duration, 0);
  }

  // คาบสอนจริงของครู: รวมวิชาการ + วิชาเลือก + ที่ปรึกษา + กิจกรรม (ไม่นับคาบประชุม ตามข้อ 2)
  const totalTeachingPeriods =
    teachingPeriods + electivePeriods + advisorPeriods + activityPeriods;

  const totalWorkloadPeriods = totalTeachingPeriods + meetingPeriods;

  return {
    teachingPeriods,
    electivePeriods,
    advisorPeriods,
    activityPeriods,
    meetingPeriods,
    totalTeachingPeriods,
    totalWorkloadPeriods,
  };
}

export interface TeacherSlotConflict {
  teacherId: string;
  teacherName: string;
  reason: string;
  type: "meeting" | "unavailable" | "sync_block";
}

/**
 * ตรวจสอบว่าครูที่ระบุติดภารกิจอื่นในคาบ (day, startPeriod, duration) หรือไม่
 * (เช่น ติดประชุมฝ่าย, ติดคาบไม่สะดวกสอน, หรือติดคาบล็อคอื่น)
 * ข้อ 1: แจ้งเตือนเมื่อลงคาบล็อคชนกับคาบประชุมหรือภารกิจอื่นของครูที่ปรึกษา/ครูผู้สอน
 */
export function findTeacherSlotConflicts(
  teacherIds: string[],
  day: DayOfWeek,
  startPeriod: number,
  duration: number,
  dataset: SchoolDataset,
  excludeSyncBlockId?: string,
  targetExcludedTeacherIds?: string[],
  targetCoexistTeacherIds?: string[]
): TeacherSlotConflict[] {
  const conflicts: TeacherSlotConflict[] = [];
  const teachersMap = new Map(dataset.teachers.map((t) => [t.id, t]));
  const classroomsMap = new Map(dataset.classrooms.map((c) => [c.id, c]));

  for (const tid of teacherIds) {
    if (targetExcludedTeacherIds && targetExcludedTeacherIds.includes(tid)) continue;
    if (targetCoexistTeacherIds && targetCoexistTeacherIds.includes(tid)) continue;
    const t = teachersMap.get(tid);
    if (!t) continue;
    const tName = getTeacherFullName(t);

    for (let p = startPeriod; p < startPeriod + duration; p++) {
      // 1. คาบประชุมฝ่าย
      const meeting = dataset.groupMeetingLocks.find((m) => {
        if (m.day !== day) return false;
        if (m.excludedTeacherIds && m.excludedTeacherIds.includes(tid)) return false;
        if (m.coexistTeacherIds && m.coexistTeacherIds.includes(tid)) return false; // อนุญาตให้ซ้อนทับกันได้
        if (!isTeacherInGroupMeeting(t, m, dataset.divisions)) return false;
        return p >= m.startPeriod && p < m.startPeriod + m.duration;
      });

      if (meeting) {
        conflicts.push({
          teacherId: tid,
          teacherName: tName,
          reason: `ติดประชุมฝ่าย "${meeting.title}" (${meeting.divisionName || "ฝ่าย"}) คาบ ${p}`,
          type: "meeting",
        });
        break;
      }

      // 2. คาบไม่สะดวกสอนส่วนตัว (Unavailable slot)
      const unavail = t.unavailableSlots.find((u) => u.day === day && u.period === p);
      if (unavail) {
        conflicts.push({
          teacherId: tid,
          teacherName: tName,
          reason: `ติดไม่สะดวกสอนส่วนตัว (${unavail.reason || "ไม่สะดวกสอน"}) คาบ ${p}`,
          type: "unavailable",
        });
        break;
      }

      // 3. คาบล็อคกิจกรรมอื่น (Synchronized Block)
      const otherSync = dataset.synchronizedBlocks.find((b) => {
        if (excludeSyncBlockId && b.id === excludeSyncBlockId) return false;
        if (b.coexistTeacherIds && b.coexistTeacherIds.includes(tid)) return false; // อนุญาตให้ซ้อนทับกันได้
        if (!b.isTimeLocked || b.fixedDay !== day || !b.fixedStartPeriod) return false;
        if (p < b.fixedStartPeriod || p >= b.fixedStartPeriod + b.duration) return false;
        const bTeachers = resolveSyncBlockTeachers(b, classroomsMap, dataset.teachers);
        return bTeachers.includes(tid);
      });

      if (otherSync) {
        conflicts.push({
          teacherId: tid,
          teacherName: tName,
          reason: `ติดคาบล็อคอื่น "${otherSync.title}" คาบ ${p}`,
          type: "sync_block",
        });
        break;
      }
    }
  }

  return conflicts;
}

/**
 * Helper: ตรวจสอบว่าครูสังกัดในคาบประชุมฝ่าย / คณะทำงาน / นศท. หรือไม่
 * รองรับทั้งการจับคู่ผ่าน ID (เช่น div_academic) และผ่านชื่อฝ่าย (เช่น ฝ่ายบริหารวิชาการ, นศท.)
 */
export function isTeacherInGroupMeeting(
  teacher: Teacher,
  meeting: GroupMeetingLock,
  divisions: Division[] = []
): boolean {
  if (meeting.excludedTeacherIds && meeting.excludedTeacherIds.includes(teacher.id)) {
    return false;
  }
  // 1. ระบุรายบุคคลโดยตรง
  if (meeting.teacherIds && meeting.teacherIds.includes(teacher.id)) {
    return true;
  }
  // 2. ตามกลุ่มสาระการเรียนรู้
  if (meeting.targetType === "department" && meeting.targetId === teacher.departmentId) {
    return true;
  }

  // 3. ตามฝ่ายบริหาร / คณะทำงาน / นศท.
  const tDivs = teacher.divisionIds || [];
  if (tDivs.length === 0) return false;

  const matchTargets = [meeting.targetId, meeting.divisionName].filter(Boolean) as string[];
  for (const target of matchTargets) {
    if (tDivs.includes(target)) return true;
    const matchedDiv = divisions.find((d) => d.id === target || d.name === target);
    if (matchedDiv) {
      if (tDivs.includes(matchedDiv.id) || tDivs.includes(matchedDiv.name)) return true;
    }
  }

  for (const tDivId of tDivs) {
    const divObj = divisions.find((d) => d.id === tDivId || d.name === tDivId);
    if (divObj) {
      if (
        divObj.id === meeting.targetId ||
        divObj.name === meeting.targetId ||
        divObj.name === meeting.divisionName ||
        divObj.id === meeting.divisionName
      ) {
        return true;
      }
    }
  }

  return false;
}
