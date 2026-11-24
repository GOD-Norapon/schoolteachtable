import {
  Classroom,
  DayOfWeek,
  ElectiveOffering,
  SchoolDataset,
  TeachingAssignment,
  TimetableEntry,
} from "@/types/timetable";
import {
  canSpanConsecutivePeriods,
  getTeacherMaxLatePeriodDays,
  isTeacherExemptAfternoonStreak,
  isTeacherInGroupMeeting,
  resolveSyncBlockTeachers,
} from "./validator";

export interface SolverProgressEvent {
  phase: "init" | "constructive" | "optimizing" | "completed";
  placedCount: number;
  totalUnits: number;
  hardConflicts: number;
  softScore: number;
  iteration: number;
  elapsedMs: number;
  message: string;
}

export interface SolverOptions {
  versionId: string;
  preservePinnedEntries?: TimetableEntry[];
  maxOptimizationMs?: number;
  seed?: number;
  onProgress?: (event: SolverProgressEvent) => void;
  shouldCancel?: () => boolean;
}

export interface SolverResult {
  entries: TimetableEntry[];
  hardConflicts: number;
  unplacedTitles: string[];
  softScore: number;
  elapsedMs: number;
  stats: {
    totalUnits: number;
    placedUnits: number;
    sequenceHits: number;
    preferredPeriodHits: number;
  };
}

interface InternalUnit {
  idx: number;
  id: string;
  sourceType: "assignment" | "sync_block";
  assignmentId: string | null;
  syncBlockId: string | null;
  sessionIndex: number;
  duration: number;
  classroomIndices: number[];
  classroomIds: string[];
  teacherIndices: number[];
  teacherIds: string[];
  roomIndices: number[];
  explicitRoomId: string | null;
  subjectId: string | null;
  title: string;
  subjectCode: string | null;
  electiveScope: ElectiveOffering[] | null;
  classroomTeacherMap?: Record<string, string[]>;
  subgroupAssignments?: TeachingAssignment[];
  isSubgroup?: boolean;
  isFixed: boolean;
  isPinned: boolean;
  fixedDayIdx: number;
  fixedPeriodIdx: number;
  countsTowardWorkload: boolean;
  allowedPeriodMask: boolean[] | null;
  forbiddenPeriodMask: boolean[];
  preferredPeriodMask: boolean[];
  preferMorning: boolean;
  allowSameDayRepeat: boolean;
  preferAfterSubjectIds: string[];
  preferBeforeSubjectIds: string[];
  basePriority: number;
}

function createRng(seed: number) {
  let s = seed >>> 0 || 123456789;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function runTimetableSolver(
  dataset: SchoolDataset,
  options: SolverOptions
): SolverResult {
  const startTime = Date.now();
  const rng = createRng(options.seed ?? Date.now());
  const {
    term,
    departments,
    divisions,
    classrooms,
    teachers,
    rooms,
    subjects,
    teachingAssignments,
    synchronizedBlocks,
    groupMeetingLocks,
  } = dataset;

  const days = term.daysOfWeek;
  const D = days.length;
  const sortedPeriods = [...term.periodsConfig].sort((a, b) => a.period - b.period);
  const P = sortedPeriods.length;
  const periodNumToIdx = new Map<number, number>();
  sortedPeriods.forEach((pc, i) => periodNumToIdx.set(pc.period, i));
  const dayToIdx = new Map<DayOfWeek, number>();
  days.forEach((d, i) => dayToIdx.set(d, i));

  const morningMask = sortedPeriods.map((pc) => pc.session === "morning");
  const afternoonPeriodIndices = sortedPeriods
    .map((pc, idx) => (pc.session === "afternoon" ? idx : -1))
    .filter((idx) => idx >= 0);
  const latePeriodIndices = sortedPeriods
    .map((pc, idx) => (pc.isLatePeriod ? idx : -1))
    .filter((idx) => idx >= 0);
  const latePeriodMask = sortedPeriods.map((pc) => pc.isLatePeriod);

  // Valid consecutive spans per duration (บังคับข้อ 12: ตอนเช้าคาบคู่ลงได้เฉพาะ 1-2 หรือ 3-4 เท่านั้น)
  const validSpans: Record<number, boolean[]> = {};
  for (let dur = 1; dur <= P; dur++) {
    validSpans[dur] = sortedPeriods.map((pc) => canSpanConsecutivePeriods(term, pc.period, dur).valid);
  }

  const C = classrooms.length;
  const T = teachers.length;
  const R = rooms.length;

  const clsIdToIdx = new Map<string, number>();
  classrooms.forEach((c, i) => clsIdToIdx.set(c.id, i));
  const classroomsMap = new Map<string, Classroom>(classrooms.map((c) => [c.id, c]));

  const tchrIdToIdx = new Map<string, number>();
  teachers.forEach((t, i) => tchrIdToIdx.set(t.id, i));

  const roomIdToIdx = new Map<string, number>();
  rooms.forEach((r, i) => roomIdToIdx.set(r.id, i));
  const roomCapacity = rooms.map((r) =>
    r.allowOverlap ? 99 : Math.max(1, r.maxConcurrentClasses || 1)
  );

  const deptsMap = new Map(departments.map((d) => [d.id, d]));
  const subjectsMap = new Map(subjects.map((s) => [s.id, s]));

  // Precompute teacher constraints
  const teacherHardBlocked: boolean[][] = Array.from({ length: T }, () =>
    new Array(D * P).fill(false)
  );
  const teacherSoftAvoid: boolean[][] = Array.from({ length: T }, () =>
    new Array(D * P).fill(false)
  );
  const teacherExemptAfternoon = teachers.map((t) =>
    isTeacherExemptAfternoonStreak(t, deptsMap.get(t.departmentId))
  );
  const teacherMaxLateDays = teachers.map((t) =>
    getTeacherMaxLatePeriodDays(t, deptsMap.get(t.departmentId), term)
  );

  teachers.forEach((t, tIdx) => {
    for (const u of t.unavailableSlots) {
      const dIdx = dayToIdx.get(u.day);
      const pIdx = periodNumToIdx.get(u.period);
      if (dIdx === undefined || pIdx === undefined) continue;
      if (u.type === "hard") teacherHardBlocked[tIdx][dIdx * P + pIdx] = true;
      else teacherSoftAvoid[tIdx][dIdx * P + pIdx] = true;
    }
    for (const m of groupMeetingLocks) {
      if (!isTeacherInGroupMeeting(t, m, divisions)) continue;
      const dIdx = dayToIdx.get(m.day);
      const pIdx = periodNumToIdx.get(m.startPeriod);
      if (dIdx === undefined || pIdx === undefined) continue;
      for (let k = 0; k < m.duration; k++) {
        if (pIdx + k < P) {
          teacherHardBlocked[tIdx][dIdx * P + pIdx + k] = true;
        }
      }
    }
  });

  // Precompute classroom locked free slots & preferred free periods (ข้อ 2)
  const clsLockedFree: boolean[][] = Array.from({ length: C }, () =>
    new Array(D * P).fill(false)
  );
  const clsPrefFreePeriodMask: boolean[][] = classrooms.map((c) =>
    sortedPeriods.map((pc) => (c.preferredFreePeriods || [7, 8]).includes(pc.period))
  );
  classrooms.forEach((c, cIdx) => {
    for (const lf of c.lockedFreeSlots || []) {
      const dIdx = dayToIdx.get(lf.day);
      const pIdx = periodNumToIdx.get(lf.period);
      if (dIdx !== undefined && pIdx !== undefined) {
        clsLockedFree[cIdx][dIdx * P + pIdx] = true;
      }
    }
  });

  const units: InternalUnit[] = [];
  const pinnedMap = new Map<string, TimetableEntry>();
  for (const pe of options.preservePinnedEntries || []) {
    if (!pe.isPinned || pe.sourceType === "free_period") continue;
    if (pe.sourceType === "sync_block" && pe.syncBlockId) {
      pinnedMap.set(`sync:${pe.syncBlockId}`, pe);
    } else if (pe.sourceType === "assignment" && pe.assignmentId) {
      pinnedMap.set(`asg:${pe.assignmentId}:${pe.sessionIndex}`, pe);
    }
  }

  // 1. Synchronized Blocks (ข้อ 1, 3, 4, 5, 6, 13)
  for (const sb of synchronizedBlocks) {
    const pinned = pinnedMap.get(`sync:${sb.id}`);
    const cIndices = sb.classroomIds
      .map((cid) => clsIdToIdx.get(cid))
      .filter((x): x is number => x !== undefined);
    const resolvedTeacherIds = resolveSyncBlockTeachers(sb, classroomsMap, teachers);
    const tIndices = resolvedTeacherIds
      .map((tid) => tchrIdToIdx.get(tid))
      .filter((x): x is number => x !== undefined);

    const rSet = new Set<number>();
    if (sb.sharedRoomId) {
      const rIdx = roomIdToIdx.get(sb.sharedRoomId);
      if (rIdx !== undefined) rSet.add(rIdx);
    }
    if (sb.blockType === "homeroom") {
      for (const cid of sb.classroomIds) {
        const defRm = classroomsMap.get(cid)?.defaultRoomId;
        if (defRm) {
          const rIdx = roomIdToIdx.get(defRm);
          if (rIdx !== undefined) rSet.add(rIdx);
        }
      }
    }
    for (const off of sb.offerings || []) {
      if (off.roomId) {
        const rIdx = roomIdToIdx.get(off.roomId);
        if (rIdx !== undefined) rSet.add(rIdx);
      }
    }

    let isFixed = false;
    let fixedDayIdx = -1;
    let fixedPeriodIdx = -1;
    if (pinned) {
      const dI = dayToIdx.get(pinned.day);
      const pI = periodNumToIdx.get(pinned.startPeriod);
      if (dI !== undefined && pI !== undefined) {
        isFixed = true;
        fixedDayIdx = dI;
        fixedPeriodIdx = pI;
      }
    } else if (sb.isTimeLocked && sb.fixedDay && sb.fixedStartPeriod !== null) {
      const dI = dayToIdx.get(sb.fixedDay);
      const pI = periodNumToIdx.get(sb.fixedStartPeriod);
      if (dI !== undefined && pI !== undefined) {
        isFixed = true;
        fixedDayIdx = dI;
        fixedPeriodIdx = pI;
      }
    }

    const countsTowardWorkload =
      term.solverSettings.countActivitiesInTeacherLimits ||
      sb.blockType === "elective_pool";

    units.push({
      idx: units.length,
      id: pinned?.id ?? `entry_sync_${sb.id}`,
      sourceType: "sync_block",
      assignmentId: null,
      syncBlockId: sb.id,
      sessionIndex: 0,
      duration: sb.duration,
      classroomIndices: cIndices,
      classroomIds: sb.classroomIds,
      teacherIndices: tIndices,
      teacherIds: resolvedTeacherIds,
      roomIndices: Array.from(rSet),
      explicitRoomId: sb.sharedRoomId,
      subjectId: null,
      title: sb.title,
      subjectCode: sb.subjectCode,
      electiveScope: sb.offerings?.length ? sb.offerings : null,
      classroomTeacherMap: sb.classroomTeacherMap,
      isFixed,
      isPinned: Boolean(pinned),
      fixedDayIdx,
      fixedPeriodIdx,
      countsTowardWorkload,
      allowedPeriodMask: null,
      forbiddenPeriodMask: new Array(P).fill(false),
      preferredPeriodMask: new Array(P).fill(false),
      preferMorning: false,
      allowSameDayRepeat: true,
      preferAfterSubjectIds: [],
      preferBeforeSubjectIds: [],
      basePriority: 2000 + cIndices.length * 80 + tIndices.length * 40 + sb.duration * 60,
    });
  }

  // 2. Teaching Assignments (ข้อ 12, 14, 17, 18)
  // ข้อ 1: รวมกลุ่มวิชาที่เรียนพร้อมกันหลายห้อง (วิชาเลือก / Joint Class) ให้นับคาบครูเพียงครั้งเดียว และจัดลงคาบเดียวกัน
  interface AssignmentGroup {
    groupKey: string;
    primaryAsg: TeachingAssignment;
    allAsgs: TeachingAssignment[];
    classroomIndices: number[];
    classroomIds: string[];
    teacherIndices: number[];
    teacherIds: string[];
  }

  const asgGroupsMap = new Map<string, AssignmentGroup>();
  for (const asg of teachingAssignments) {
    const cIdx = clsIdToIdx.get(asg.classroomId);
    if (cIdx === undefined) continue;
    const sub = subjectsMap.get(asg.subjectId);
    const isJoint = asg.isJointClass || sub?.subjectType === "elective";

    const tKey = asg.teacherIds.slice().sort().join("_");
    const isSubgroup = Boolean(asg.isSubgroup && asg.subgroupSyncId);
    const groupKey = asg.jointGroupId
      ? `joint:${asg.jointGroupId}`
      : isJoint
      ? `joint_elec:${asg.subjectId}:${tKey}`
      : isSubgroup
      ? `subgroup:${asg.classroomId}:${asg.subgroupSyncId}`
      : `single:${asg.id}`;

    const existing = asgGroupsMap.get(groupKey);
    const tIndices = asg.teacherIds
      .map((tid) => tchrIdToIdx.get(tid))
      .filter((x): x is number => x !== undefined);

    if (existing) {
      if (!existing.classroomIndices.includes(cIdx)) {
        existing.classroomIndices.push(cIdx);
        existing.classroomIds.push(asg.classroomId);
      }
      for (const tI of tIndices) {
        if (!existing.teacherIndices.includes(tI)) existing.teacherIndices.push(tI);
      }
      for (const tId of asg.teacherIds) {
        if (!existing.teacherIds.includes(tId)) existing.teacherIds.push(tId);
      }
      existing.allAsgs.push(asg);
    } else {
      asgGroupsMap.set(groupKey, {
        groupKey,
        primaryAsg: asg,
        allAsgs: [asg],
        classroomIndices: [cIdx],
        classroomIds: [asg.classroomId],
        teacherIndices: [...tIndices],
        teacherIds: [...asg.teacherIds],
      });
    }
  }

  for (const group of Array.from(asgGroupsMap.values())) {
    const asg = group.primaryAsg;
    const sub = subjectsMap.get(asg.subjectId);
    const tIndices = group.teacherIndices;
    const cIndices = group.classroomIndices;
    const clsIds = group.classroomIds;
    const firstCls = classrooms[cIndices[0]];

    const spec = group.allAsgs.find((a) => a.specificRule)?.specificRule || asg.specificRule;
    const rules = sub?.rules;

    const allowedMask =
      rules?.allowedPeriodsOnly && rules.allowedPeriodsOnly.length > 0
        ? sortedPeriods.map((pc) => rules.allowedPeriodsOnly!.includes(pc.period))
        : null;

    const forbiddenMask = sortedPeriods.map((pc) => {
      const subForbid = rules?.forbiddenPeriods ? rules.forbiddenPeriods.includes(pc.period) : false;
      const specForbid = spec?.forbiddenPeriods ? spec.forbiddenPeriods.includes(pc.period) : false;
      return subForbid || specForbid;
    });

    const preferredMask = sortedPeriods.map((pc) => {
      const subPref = rules?.preferredPeriods ? rules.preferredPeriods.includes(pc.period) : false;
      const specPref = spec?.preferredPeriods ? spec.preferredPeriods.includes(pc.period) : false;
      return subPref || specPref;
    });

    const preferMorning = Boolean(rules?.preferMorning || spec?.preferMorning);
    const preferAfter = [
      ...(rules?.preferAfterSubjectIds || []),
      ...(spec?.preferAfterSubjectIds || []),
    ];
    const preferBefore = [
      ...(rules?.preferBeforeSubjectIds || []),
      ...(spec?.preferBeforeSubjectIds || []),
    ];

    asg.splitSessions.forEach((sp, sIdx) => {
      const pinned = group.allAsgs
        .map((a) => pinnedMap.get(`asg:${a.id}:${sIdx}`))
        .find(Boolean);
      const resolvedRmId = spec?.customRoomId ?? sp.roomId ?? firstCls?.defaultRoomId ?? null;
      const rIndices: number[] = [];
      if (resolvedRmId) {
        const rI = roomIdToIdx.get(resolvedRmId);
        if (rI !== undefined) rIndices.push(rI);
      }
      if (group.allAsgs.some((a) => a.isSubgroup)) {
        for (const a of group.allAsgs) {
          const aSp = a.splitSessions[sIdx] || a.splitSessions[0];
          const aRmId = a.specificRule?.customRoomId ?? aSp?.roomId ?? null;
          if (aRmId) {
            const rI = roomIdToIdx.get(aRmId);
            if (rI !== undefined && !rIndices.includes(rI)) rIndices.push(rI);
          }
        }
      }

      let isFixed = false;
      let fixedDayIdx = -1;
      let fixedPeriodIdx = -1;
      if (pinned) {
        const dI = dayToIdx.get(pinned.day);
        const pI = periodNumToIdx.get(pinned.startPeriod);
        if (dI !== undefined && pI !== undefined) {
          isFixed = true;
          fixedDayIdx = dI;
          fixedPeriodIdx = pI;
        }
      } else if (spec?.fixedDay && spec?.fixedStartPeriod) {
        // เงื่อนไขเฉพาะห้อง (ข้อ 3: เช่น วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์)
        const targetSession = spec.sessionIndex ?? 0;
        if (sIdx === targetSession) {
          const dI = dayToIdx.get(spec.fixedDay);
          const pI = periodNumToIdx.get(spec.fixedStartPeriod);
          if (dI !== undefined && pI !== undefined) {
            isFixed = true;
            fixedDayIdx = dI;
            fixedPeriodIdx = pI;
          }
        }
      }

      const sharedLabBonus = sp.roomId ? 90 : 0;
      const coTeachBonus = tIndices.length > 1 ? 110 * tIndices.length : 0;
      const multiPeriodBonus = sp.duration >= 2 ? 220 * sp.duration : 0;
      const blockedTeacherBonus = tIndices.reduce(
        (acc, ti) => acc + teacherHardBlocked[ti].filter(Boolean).length * 8,
        0
      );
      const ruleBonus =
        (allowedMask ? 200 : 0) +
        (rules?.preferredPeriods?.length ? 25 : 0) +
        (rules?.preferAfterSubjectIds?.length || rules?.preferBeforeSubjectIds?.length ? 25 : 0);
      const jointRoomBonus = cIndices.length > 1 ? 150 * cIndices.length : 0;

      // Check if this assignment group has different teachers per classroom (e.g. parallel IS)
      const asgTeacherMap: Record<string, string[]> = {};
      let hasDistinctTeachersPerRoom = false;
      for (const a of group.allAsgs) {
        asgTeacherMap[a.classroomId] = a.teacherIds;
      }
      if (group.classroomIds.length > 1 && group.teacherIds.length > 1) {
        hasDistinctTeachersPerRoom = true;
      }

      units.push({
        idx: units.length,
        id: pinned?.id ?? `entry_asg_${asg.id}_${sIdx}`,
        sourceType: "assignment",
        assignmentId: asg.id,
        syncBlockId: null,
        sessionIndex: sIdx,
        duration: sp.duration,
        classroomIndices: cIndices,
        classroomIds: clsIds,
        teacherIndices: tIndices,
        teacherIds: group.teacherIds,
        roomIndices: rIndices,
        explicitRoomId: sp.roomId ?? null,
        subjectId: asg.subjectId,
        title: sub ? `${sub.shortName || sub.name}` : asg.subjectId,
        subjectCode: sub?.code ?? null,
        electiveScope: null,
        classroomTeacherMap: hasDistinctTeachersPerRoom ? asgTeacherMap : undefined,
        subgroupAssignments: group.allAsgs.some((a) => a.isSubgroup) ? group.allAsgs : undefined,
        isSubgroup: group.allAsgs.some((a) => a.isSubgroup),
        isFixed,
        isPinned: Boolean(pinned),
        fixedDayIdx,
        fixedPeriodIdx,
        countsTowardWorkload: true,
        allowedPeriodMask: allowedMask,
        forbiddenPeriodMask: forbiddenMask,
        preferredPeriodMask: preferredMask,
        preferMorning: preferMorning,
        allowSameDayRepeat: rules?.allowSameDayRepeat ?? false,
        preferAfterSubjectIds: preferAfter,
        preferBeforeSubjectIds: preferBefore,
        basePriority: sharedLabBonus + coTeachBonus + multiPeriodBonus + blockedTeacherBonus + ruleBonus + jointRoomBonus,
      });
    });
  }

  const totalUnits = units.length;

  // Board State
  const unitDay = new Int32Array(totalUnits).fill(-1);
  const unitPeriod = new Int32Array(totalUnits).fill(-1);

  const clsGrid: Int32Array[] = Array.from({ length: C }, () => new Int32Array(D * P).fill(-1));
  const tchrGrid: Int32Array[] = Array.from({ length: T }, () => new Int32Array(D * P).fill(-1));
  const tchrWorkCount: Int32Array[] = Array.from({ length: T }, () => new Int32Array(D * P).fill(0));
  const roomUsedCount: Int32Array[] = Array.from({ length: R }, () => new Int32Array(D * P).fill(0));
  // Reverse lookup of active units per room+slot so we don't scan all units
  const roomSlotUnits: number[][][] = Array.from({ length: R }, () =>
    Array.from({ length: D * P }, () => [])
  );

  function placeUnitRaw(uIdx: number, d: number, p: number) {
    const u = units[uIdx];
    unitDay[uIdx] = d;
    unitPeriod[uIdx] = p;
    for (let k = 0; k < u.duration; k++) {
      const slot = d * P + p + k;
      for (const c of u.classroomIndices) clsGrid[c][slot] = uIdx;
      for (const t of u.teacherIndices) {
        tchrGrid[t][slot] = uIdx;
        if (u.countsTowardWorkload) tchrWorkCount[t][slot]++;
      }
      for (const r of u.roomIndices) {
        roomUsedCount[r][slot]++;
        roomSlotUnits[r][slot].push(uIdx);
      }
    }
  }

  function unplaceUnitRaw(uIdx: number) {
    const d = unitDay[uIdx];
    const p = unitPeriod[uIdx];
    if (d === -1) return;
    const u = units[uIdx];
    for (let k = 0; k < u.duration; k++) {
      const slot = d * P + p + k;
      for (const c of u.classroomIndices) {
        if (clsGrid[c][slot] === uIdx) clsGrid[c][slot] = -1;
      }
      for (const t of u.teacherIndices) {
        if (tchrGrid[t][slot] === uIdx) tchrGrid[t][slot] = -1;
        if (u.countsTowardWorkload && tchrWorkCount[t][slot] > 0) tchrWorkCount[t][slot]--;
      }
      for (const r of u.roomIndices) {
        if (roomUsedCount[r][slot] > 0) roomUsedCount[r][slot]--;
        const arr = roomSlotUnits[r][slot];
        const pos = arr.indexOf(uIdx);
        if (pos >= 0) arr.splice(pos, 1);
      }
    }
    unitDay[uIdx] = -1;
    unitPeriod[uIdx] = -1;
  }

  function resetBoard() {
    unitDay.fill(-1);
    unitPeriod.fill(-1);
    for (let c = 0; c < C; c++) clsGrid[c].fill(-1);
    for (let t = 0; t < T; t++) {
      tchrGrid[t].fill(-1);
      tchrWorkCount[t].fill(0);
    }
    for (let r = 0; r < R; r++) {
      roomUsedCount[r].fill(0);
      for (let s = 0; s < D * P; s++) roomSlotUnits[r][s].length = 0;
    }
  }

  function restoreBoardSnapshot(daySnap: Int32Array, periodSnap: Int32Array) {
    resetBoard();
    for (let i = 0; i < totalUnits; i++) {
      if (daySnap[i] !== -1) {
        placeUnitRaw(i, daySnap[i], periodSnap[i]);
      }
    }
  }

  function passesIntrinsicHardRules(u: InternalUnit, d: number, p: number): boolean {
    if (!validSpans[u.duration]?.[p]) return false;
    for (let k = 0; k < u.duration; k++) {
      const pCur = p + k;
      if (u.allowedPeriodMask && !u.allowedPeriodMask[pCur]) return false;
      if (u.forbiddenPeriodMask[pCur]) return false;
      const slot = d * P + pCur;
      for (const c of u.classroomIndices) {
        if (clsLockedFree[c][slot]) return false;
      }
      for (const t of u.teacherIndices) {
        if (teacherHardBlocked[t][slot]) return false;
      }
    }
    return true;
  }

  function violatesTeacherWorkloadIfPlaced(u: InternalUnit, d: number, p: number): boolean {
    if (!u.countsTowardWorkload) return false;
    const maxAft = term.solverSettings.maxAfternoonConsecutive;

    for (const t of u.teacherIndices) {
      if (!teacherExemptAfternoon[t] && afternoonPeriodIndices.length > maxAft) {
        let touchesAfternoon = false;
        for (let k = 0; k < u.duration; k++) {
          if (!morningMask[p + k]) touchesAfternoon = true;
        }
        if (touchesAfternoon) {
          let streak = 0;
          let prevIdx = -99;
          for (const ap of afternoonPeriodIndices) {
            const inCandidate = ap >= p && ap < p + u.duration;
            const occupied = inCandidate || tchrWorkCount[t][d * P + ap] > 0;
            if (occupied) {
              streak = ap === prevIdx + 1 ? streak + 1 : 1;
              if (streak > maxAft) return true;
              prevIdx = ap;
            } else {
              streak = 0;
            }
          }
        }
      }

      const maxLate = teacherMaxLateDays[t];
      if (Number.isFinite(maxLate) && latePeriodIndices.length > 0) {
        let touchesLate = false;
        for (let k = 0; k < u.duration; k++) {
          if (latePeriodMask[p + k]) touchesLate = true;
        }
        if (touchesLate) {
          let lateDaysCount = 0;
          for (let dayI = 0; dayI < D; dayI++) {
            if (dayI === d) {
              lateDaysCount++;
              continue;
            }
            let hasLate = false;
            for (const lp of latePeriodIndices) {
              if (tchrWorkCount[t][dayI * P + lp] > 0) {
                hasLate = true;
                break;
              }
            }
            if (hasLate) lateDaysCount++;
          }
          if (lateDaysCount > maxLate) return true;
        }
      }
    }
    return false;
  }

  function canPlaceCleanly(u: InternalUnit, d: number, p: number): boolean {
    if (!passesIntrinsicHardRules(u, d, p)) return false;
    for (let k = 0; k < u.duration; k++) {
      const slot = d * P + p + k;
      for (const c of u.classroomIndices) {
        if (clsGrid[c][slot] !== -1) return false;
      }
      for (const t of u.teacherIndices) {
        if (tchrGrid[t][slot] !== -1) return false;
      }
      for (const r of u.roomIndices) {
        if (roomUsedCount[r][slot] >= roomCapacity[r]) return false;
      }
    }
    if (violatesTeacherWorkloadIfPlaced(u, d, p)) return false;
    if (!u.allowSameDayRepeat && u.subjectId) {
      for (const c of u.classroomIndices) {
        for (let pi = 0; pi < P; pi++) {
          const occ = clsGrid[c][d * P + pi];
          if (occ !== -1 && occ !== u.idx && units[occ].subjectId === u.subjectId) {
            return false;
          }
        }
      }
    }
    return true;
  }

  function quickSlotPreferenceScore(u: InternalUnit, d: number, p: number): number {
    let score = 0;
    for (let k = 0; k < u.duration; k++) {
      const pCur = p + k;
      if (u.preferredPeriodMask[pCur]) score += 35;
      if (u.preferMorning && morningMask[pCur]) score += 10;
      for (const t of u.teacherIndices) {
        if (teacherSoftAvoid[t][d * P + pCur]) score -= 18;
      }
      if (term.solverSettings.preferFreePeriodsLate && u.classroomIndices.length === 1) {
        const c = u.classroomIndices[0];
        if (classrooms[c].freePeriodsCount > 0 && clsPrefFreePeriodMask[c][pCur] && !u.preferredPeriodMask[pCur]) {
          score -= 6;
        }
      }
    }

    if (u.subjectId && u.classroomIndices.length === 1) {
      const c = u.classroomIndices[0];
      if (!u.allowSameDayRepeat) {
        for (let pi = 0; pi < P; pi++) {
          const otherIdx = clsGrid[c][d * P + pi];
          if (otherIdx !== -1 && otherIdx !== u.idx && units[otherIdx].subjectId === u.subjectId) {
            score -= 35;
            break;
          }
        }
      }
      if (u.preferAfterSubjectIds.length > 0 && p > 0) {
        const prevIdx = clsGrid[c][d * P + (p - 1)];
        if (prevIdx !== -1 && units[prevIdx].subjectId && u.preferAfterSubjectIds.includes(units[prevIdx].subjectId!)) {
          score += 60;
        }
      }
      if (u.preferBeforeSubjectIds.length > 0 && p + u.duration < P) {
        const nextIdx = clsGrid[c][d * P + (p + u.duration)];
        if (nextIdx !== -1 && units[nextIdx].subjectId && u.preferBeforeSubjectIds.includes(units[nextIdx].subjectId!)) {
          score += 60;
        }
      }
    }

    return score;
  }

  /**
   * Bounded Recursive Augmenting-Path Placement (FET-style):
   * Places `uIdx` cleanly if possible; otherwise displaces conflicting movable units and recursively relocates them,
   * strictly rolling back on failure so the number of placed units NEVER decreases!
   */
  function tryPlaceAugmenting(
    uIdx: number,
    depthLeft: number,
    lockedInChain: Set<number>
  ): boolean {
    const u = units[uIdx];

    // 1. Check direct clean placement first
    let bestClean: { d: number; p: number; sc: number } | null = null;
    for (let d = 0; d < D; d++) {
      for (let p = 0; p < P; p++) {
        if (canPlaceCleanly(u, d, p)) {
          const sc = quickSlotPreferenceScore(u, d, p) + rng() * 6;
          if (!bestClean || sc > bestClean.sc) {
            bestClean = { d, p, sc };
          }
        }
      }
    }
    if (bestClean) {
      placeUnitRaw(uIdx, bestClean.d, bestClean.p);
      return true;
    }

    if (depthLeft <= 0) return false;

    // 2. Gather candidate slots sorted by lightest displacement cost
    const candidates: { d: number; p: number; blockers: number[]; cost: number }[] = [];

    for (let d = 0; d < D; d++) {
      for (let p = 0; p < P; p++) {
        if (!passesIntrinsicHardRules(u, d, p)) continue;

        const blockerSet = new Set<number>();
        let invalid = false;

        for (let k = 0; k < u.duration && !invalid; k++) {
          const slot = d * P + p + k;
          for (const c of u.classroomIndices) {
            const occ = clsGrid[c][slot];
            if (occ !== -1) {
              if (units[occ].isFixed || lockedInChain.has(occ)) {
                invalid = true;
                break;
              }
              blockerSet.add(occ);
            }
          }
          if (invalid) break;
          for (const t of u.teacherIndices) {
            const occ = tchrGrid[t][slot];
            if (occ !== -1) {
              if (units[occ].isFixed || lockedInChain.has(occ)) {
                invalid = true;
                break;
              }
              blockerSet.add(occ);
            }
          }
          if (invalid) break;
          for (const r of u.roomIndices) {
            if (roomUsedCount[r][slot] >= roomCapacity[r]) {
              const occList = roomSlotUnits[r][slot];
              const movableOcc = occList.find(
                (id) => !units[id].isFixed && !lockedInChain.has(id)
              );
              if (movableOcc === undefined) {
                invalid = true;
                break;
              }
              blockerSet.add(movableOcc);
            }
          }
        }

        if (invalid) continue;

        if (!u.allowSameDayRepeat && u.subjectId) {
          for (const c of u.classroomIndices) {
            for (let pi = 0; pi < P; pi++) {
              const occ = clsGrid[c][d * P + pi];
              if (occ !== -1 && occ !== u.idx && units[occ].subjectId === u.subjectId) {
                if (units[occ].isFixed || lockedInChain.has(occ)) {
                  invalid = true;
                  break;
                }
                blockerSet.add(occ);
              }
            }
            if (invalid) break;
          }
          if (invalid) continue;
        }

        // Temporarily unplace direct blockers to check workload rules (afternoon streak / Period 8)
        const saved: { idx: number; d: number; p: number }[] = [];
        for (const bIdx of blockerSet) {
          saved.push({ idx: bIdx, d: unitDay[bIdx], p: unitPeriod[bIdx] });
          unplaceUnitRaw(bIdx);
        }

        if (violatesTeacherWorkloadIfPlaced(u, d, p)) {
          for (const t of u.teacherIndices) {
            let guard = 0;
            while (violatesTeacherWorkloadIfPlaced(u, d, p) && guard < 6) {
              guard++;
              let ejected = false;
              for (let pass = 0; pass < 2 && !ejected; pass++) {
                for (let dayI = 0; dayI < D && !ejected; dayI++) {
                  if (pass === 0 && dayI !== d) continue;
                  for (let pi = 0; pi < P && !ejected; pi++) {
                    const isRelevant = pass === 0 ? !morningMask[pi] : latePeriodMask[pi];
                    if (!isRelevant) continue;
                    const occ = tchrGrid[t][dayI * P + pi];
                    if (
                      occ !== -1 &&
                      !units[occ].isFixed &&
                      !lockedInChain.has(occ) &&
                      !blockerSet.has(occ)
                    ) {
                      saved.push({ idx: occ, d: unitDay[occ], p: unitPeriod[occ] });
                      blockerSet.add(occ);
                      unplaceUnitRaw(occ);
                      ejected = true;
                    }
                  }
                }
              }
              if (!ejected) break;
            }
          }
        }

        const workloadOk = !violatesTeacherWorkloadIfPlaced(u, d, p);
        for (const s of saved) placeUnitRaw(s.idx, s.d, s.p);

        if (!workloadOk || blockerSet.size > 4) continue;

        let cost = 0;
        for (const bIdx of blockerSet) {
          const b = units[bIdx];
          cost += 100 + b.duration * 60 + b.classroomIndices.length * 150;
        }
        cost += rng() * 45;
        candidates.push({ d, p, blockers: Array.from(blockerSet), cost });
      }
    }

    candidates.sort((a, b) => a.cost - b.cost);
    const maxBranches = depthLeft >= 4 ? 28 : depthLeft === 3 ? 14 : depthLeft === 2 ? 8 : 5;

    for (let i = 0; i < Math.min(maxBranches, candidates.length); i++) {
      const cand = candidates[i];
      const fullDaySnap = new Int32Array(unitDay);
      const fullPeriodSnap = new Int32Array(unitPeriod);

      for (const bIdx of cand.blockers) unplaceUnitRaw(bIdx);
      if (!canPlaceCleanly(u, cand.d, cand.p)) {
        restoreBoardSnapshot(fullDaySnap, fullPeriodSnap);
        continue;
      }

      placeUnitRaw(uIdx, cand.d, cand.p);
      lockedInChain.add(uIdx);

      let allRelocated = true;
      for (const bIdx of cand.blockers) {
        if (!tryPlaceAugmenting(bIdx, depthLeft - 1, lockedInChain)) {
          allRelocated = false;
          break;
        }
      }

      lockedInChain.delete(uIdx);

      if (allRelocated) {
        return true;
      }

      // Exact full rollback including nested relocations!
      restoreBoardSnapshot(fullDaySnap, fullPeriodSnap);
    }

    return false;
  }

  // ==================== PHASE 1: MRV CONSTRUCTIVE + AUGMENTING REPAIR ====================
  options.onProgress?.({
    phase: "init",
    placedCount: 0,
    totalUnits,
    hardConflicts: 0,
    softScore: 0,
    iteration: 0,
    elapsedMs: Date.now() - startTime,
    message: "กำลังเตรียมโครงสร้างตารางและวางคาบล็อคบังคับ...",
  });

  const fixedUnits = units.filter((u) => u.isFixed);
  const movableUnits = units.filter((u) => !u.isFixed);

  let bestConstructiveDay = new Int32Array(totalUnits).fill(-1);
  let bestConstructivePeriod = new Int32Array(totalUnits).fill(-1);
  let minUnplacedCount = Infinity;

  const maxRestarts = 8;
  for (let attempt = 0; attempt < maxRestarts; attempt++) {
    if (options.shouldCancel?.()) break;
    resetBoard();

    for (const fu of fixedUnits) {
      placeUnitRaw(fu.idx, fu.fixedDayIdx, fu.fixedPeriodIdx);
    }

    const remaining = new Set<number>(movableUnits.map((u) => u.idx));
    const failedOnce: number[] = [];

    // Step 1A: Pure MRV Constructive Pass (always pick unit with fewest remaining clean slots > 0; if 0, repair immediately!)
    let step = 0;
    while (remaining.size > 0) {
      step++;
      if (step % 50 === 0 && options.shouldCancel?.()) break;

      let chosenIdx = -1;
      let minClean = Infinity;
      let tiePriority = -Infinity;

      for (const uIdx of remaining) {
        const u = units[uIdx];
        let cleanOptions = 0;
        for (let d = 0; d < D; d++) {
          for (let p = 0; p < P; p++) {
            if (canPlaceCleanly(u, d, p)) cleanOptions++;
          }
        }
        const prio = u.basePriority + rng() * 12;
        if (
          cleanOptions < minClean ||
          (cleanOptions === minClean && prio > tiePriority)
        ) {
          minClean = cleanOptions;
          tiePriority = prio;
          chosenIdx = uIdx;
        }
      }

      if (chosenIdx === -1) break;
      remaining.delete(chosenIdx);

      const chainSet = new Set<number>();
      const placed = tryPlaceAugmenting(chosenIdx, 3, chainSet);
      if (!placed) {
        failedOnce.push(chosenIdx);
      }

      if (step % 40 === 0) {
        options.onProgress?.({
          phase: "constructive",
          placedCount: totalUnits - remaining.size - failedOnce.length,
          totalUnits,
          hardConflicts: remaining.size + failedOnce.length,
          softScore: 0,
          iteration: step,
          elapsedMs: Date.now() - startTime,
          message: `กำลังจัดวางคาบเรียน (${totalUnits - remaining.size - failedOnce.length}/${totalUnits} รายการ)...`,
        });
      }
    }

    // Step 1B: Second deeper pass (depth 4) for any remaining units
    const stillUnplaced: number[] = [];
    for (const fIdx of failedOnce) {
      const chainSet = new Set<number>();
      if (!tryPlaceAugmenting(fIdx, 4, chainSet)) {
        stillUnplaced.push(fIdx);
      }
    }

    if (stillUnplaced.length < minUnplacedCount) {
      minUnplacedCount = stillUnplaced.length;
      bestConstructiveDay = new Int32Array(unitDay);
      bestConstructivePeriod = new Int32Array(unitPeriod);
    }

    if (minUnplacedCount === 0) break;
  }

  // Load best constructive board
  resetBoard();
  for (let i = 0; i < totalUnits; i++) {
    if (bestConstructiveDay[i] !== -1) {
      placeUnitRaw(i, bestConstructiveDay[i], bestConstructivePeriod[i]);
    }
  }

  // ==================== SOFT SCORE EVALUATION ====================
  function computeTotalSoftScore(): {
    score: number;
    sequenceHits: number;
    preferredPeriodHits: number;
  } {
    let score = 1000;
    let sequenceHits = 0;
    let preferredPeriodHits = 0;

    for (let ui = 0; ui < totalUnits; ui++) {
      const d = unitDay[ui];
      const p = unitPeriod[ui];
      if (d === -1) {
        score -= 500;
        continue;
      }
      const u = units[ui];

      if (u.preferredPeriodMask.some(Boolean)) {
        let hit = false;
        for (let k = 0; k < u.duration; k++) {
          if (u.preferredPeriodMask[p + k]) hit = true;
        }
        if (hit) {
          score += 40;
          preferredPeriodHits++;
        } else {
          score -= 18;
        }
      }

      if (u.preferMorning) {
        let allMorn = true;
        for (let k = 0; k < u.duration; k++) {
          if (!morningMask[p + k]) allMorn = false;
        }
        score += allMorn ? 10 : -5;
      }

      for (let k = 0; k < u.duration; k++) {
        for (const t of u.teacherIndices) {
          if (teacherSoftAvoid[t][d * P + p + k]) score -= 18;
        }
      }

      if (u.preferAfterSubjectIds.length > 0 && u.classroomIndices.length === 1) {
        const c = u.classroomIndices[0];
        if (p > 0) {
          const prevIdx = clsGrid[c][d * P + (p - 1)];
          if (
            prevIdx !== -1 &&
            units[prevIdx].subjectId &&
            u.preferAfterSubjectIds.includes(units[prevIdx].subjectId!)
          ) {
            score += 65;
            sequenceHits++;
          } else {
            score -= 12;
          }
        } else {
          score -= 12;
        }
      }
    }

    for (let c = 0; c < C; c++) {
      for (let d = 0; d < D; d++) {
        const seenSubjects = new Set<string>();
        let lastTaughtPeriod = -1;
        for (let p = P - 1; p >= 0; p--) {
          if (clsGrid[c][d * P + p] !== -1) {
            lastTaughtPeriod = p;
            break;
          }
        }

        for (let p = 0; p < P; p++) {
          const occ = clsGrid[c][d * P + p];
          if (occ === -1) {
            if (term.solverSettings.preferFreePeriodsLate) {
              if (clsPrefFreePeriodMask[c][p]) score += 9;
              else if (p < lastTaughtPeriod) score -= 12;
            }
          } else {
            const u = units[occ];
            if (p === unitPeriod[occ] && u.subjectId && !u.allowSameDayRepeat) {
              if (seenSubjects.has(u.subjectId)) score -= 35;
              else seenSubjects.add(u.subjectId);
            }
          }
        }
      }
    }

    for (let t = 0; t < T; t++) {
      for (let d = 0; d < D; d++) {
        let dailyLoad = 0;
        for (let p = 0; p < P; p++) {
          if (tchrGrid[t][d * P + p] !== -1) dailyLoad++;
        }
        if (dailyLoad >= 7) score -= (dailyLoad - 6) * 10;
      }
    }

    return { score, sequenceHits, preferredPeriodHits };
  }

  // ==================== PHASE 2: SIMULATED ANNEALING + SEQUENCE PAIR MOVES ====================
  let currentEval = computeTotalSoftScore();
  let bestScore = currentEval.score;
  let bestSeqHits = currentEval.sequenceHits;
  let bestPrefHits = currentEval.preferredPeriodHits;
  let bestFinalDay = new Int32Array(unitDay);
  let bestFinalPeriod = new Int32Array(unitPeriod);

  const sequencePairs: { c: number; beforeIdx: number; afterIdx: number; targetPeriodsForAfter: number[] }[] = [];
  for (let c = 0; c < C; c++) {
    const roomMovables = movableUnits.filter(
      (u) => u.classroomIndices.length === 1 && u.classroomIndices[0] === c && u.duration === 1
    );
    for (const uAfter of roomMovables) {
      if (uAfter.preferAfterSubjectIds.length === 0) continue;
      for (const uBefore of roomMovables) {
        if (
          uBefore.idx !== uAfter.idx &&
          uBefore.subjectId &&
          uAfter.preferAfterSubjectIds.includes(uBefore.subjectId)
        ) {
          const prefs: number[] = [];
          for (let pi = 1; pi < P; pi++) {
            if (uAfter.preferredPeriodMask[pi]) prefs.push(pi);
          }
          if (prefs.length === 0) {
            for (let pi = 1; pi < P; pi++) prefs.push(pi);
          }
          sequencePairs.push({
            c,
            beforeIdx: uBefore.idx,
            afterIdx: uAfter.idx,
            targetPeriodsForAfter: prefs,
          });
        }
      }
    }
  }

  const optBudgetMs =
    options.maxOptimizationMs ??
    Math.min(8000, Math.max(1200, (term.solverSettings.optimizationSeconds || 4) * 1000));
  const optDeadline = Date.now() + optBudgetMs;

  if (minUnplacedCount === 0 && movableUnits.length > 1) {
    let iter = 0;
    let temperature = 22.0;

    while (Date.now() < optDeadline) {
      iter++;
      if (iter % 200 === 0) {
        if (options.shouldCancel?.()) break;
        const progressRatio = Math.min(1, 1 - (optDeadline - Date.now()) / optBudgetMs);
        temperature = Math.max(0.5, 22.0 * (1 - progressRatio));
        options.onProgress?.({
          phase: "optimizing",
          placedCount: totalUnits,
          totalUnits,
          hardConflicts: 0,
          softScore: bestScore,
          iteration: iter,
          elapsedMs: Date.now() - startTime,
          message: `กำลังปรับปรุงเงื่อนไขพิเศษรายวิชาและเกลี่ยคาบ (คะแนน ${Math.round(bestScore)})...`,
        });
      }

      const roll = rng();

      // Move Type A (25%): Compound Sequence Pair Move (เช่น ย้าย ศิลปะ คาบ 3 + พละ คาบ 4 หรือ คาบ 7+8 พร้อมกัน!)
      if (roll < 0.25 && sequencePairs.length > 0) {
        const pair = sequencePairs[Math.floor(rng() * sequencePairs.length)];
        const dA = unitDay[pair.beforeIdx];
        const pA = unitPeriod[pair.beforeIdx];
        const dB = unitDay[pair.afterIdx];
        const pB = unitPeriod[pair.afterIdx];
        if (dA === -1 || dB === -1) continue;
        if (dA === dB && pA + 1 === pB && pair.targetPeriodsForAfter.includes(pB) && rng() < 0.9) {
          continue;
        }

        const targetD = Math.floor(rng() * D);
        const targetPAfter =
          pair.targetPeriodsForAfter[Math.floor(rng() * pair.targetPeriodsForAfter.length)];
        const targetPBefore = targetPAfter - 1;
        if (targetPBefore < 0) continue;

        const occ1 = clsGrid[pair.c][targetD * P + targetPBefore];
        const occ2 = clsGrid[pair.c][targetD * P + targetPAfter];
        if (
          (occ1 !== -1 && (units[occ1].isFixed || units[occ1].duration !== 1)) ||
          (occ2 !== -1 && (units[occ2].isFixed || units[occ2].duration !== 1))
        ) {
          continue;
        }

        const involved = Array.from(
          new Set([pair.beforeIdx, pair.afterIdx, occ1, occ2].filter((x) => x !== -1))
        );
        const backup = involved.map((idx) => ({ idx, d: unitDay[idx], p: unitPeriod[idx] }));
        for (const item of backup) unplaceUnitRaw(item.idx);

        if (canPlaceCleanly(units[pair.beforeIdx], targetD, targetPBefore)) {
          placeUnitRaw(pair.beforeIdx, targetD, targetPBefore);
          if (canPlaceCleanly(units[pair.afterIdx], targetD, targetPAfter)) {
            placeUnitRaw(pair.afterIdx, targetD, targetPAfter);

            const displaced = involved.filter(
              (idx) => idx !== pair.beforeIdx && idx !== pair.afterIdx
            );
            const candidateSlots: { d: number; p: number }[] = [
              { d: dA, p: pA },
              { d: dB, p: pB },
            ];
            for (let di = 0; di < D; di++) {
              for (let pi = 0; pi < P; pi++) {
                if (clsGrid[pair.c][di * P + pi] === -1) {
                  candidateSlots.push({ d: di, p: pi });
                }
              }
            }

            let allDisplacedPlaced = true;
            const placedDisp: number[] = [];
            for (const dispIdx of displaced) {
              let placedOne = false;
              for (const cs of candidateSlots) {
                if (canPlaceCleanly(units[dispIdx], cs.d, cs.p)) {
                  placeUnitRaw(dispIdx, cs.d, cs.p);
                  placedDisp.push(dispIdx);
                  placedOne = true;
                  break;
                }
              }
              if (!placedOne) {
                allDisplacedPlaced = false;
                break;
              }
            }

            if (allDisplacedPlaced) {
              const nextEval = computeTotalSoftScore();
              const delta = nextEval.score - currentEval.score;
              if (delta >= 0 || rng() < Math.exp(delta / temperature)) {
                currentEval = nextEval;
                if (nextEval.score > bestScore) {
                  bestScore = nextEval.score;
                  bestSeqHits = nextEval.sequenceHits;
                  bestPrefHits = nextEval.preferredPeriodHits;
                  bestFinalDay = new Int32Array(unitDay);
                  bestFinalPeriod = new Int32Array(unitPeriod);
                }
                continue;
              }
            }
          }
        }

        for (const idx of involved) unplaceUnitRaw(idx);
        for (const item of backup) placeUnitRaw(item.idx, item.d, item.p);
        continue;
      }

      // Move Type B (45%): 1-to-1 Swap between two same-duration movable units in the same classroom
      if (roll < 0.7) {
        const u1 = movableUnits[Math.floor(rng() * movableUnits.length)];
        if (u1.classroomIndices.length !== 1) continue;
        const c = u1.classroomIndices[0];
        const d1 = unitDay[u1.idx];
        const p1 = unitPeriod[u1.idx];
        if (d1 === -1) continue;

        const d2 = Math.floor(rng() * D);
        const p2 = Math.floor(rng() * P);
        const occ2 = clsGrid[c][d2 * P + p2];
        if (occ2 === -1 || occ2 === u1.idx) continue;
        const u2 = units[occ2];
        if (
          u2.isFixed ||
          u2.classroomIndices.length !== 1 ||
          u2.duration !== u1.duration ||
          unitPeriod[occ2] !== p2
        ) {
          continue;
        }

        unplaceUnitRaw(u1.idx);
        unplaceUnitRaw(u2.idx);

        if (canPlaceCleanly(u1, d2, p2)) {
          placeUnitRaw(u1.idx, d2, p2);
          if (canPlaceCleanly(u2, d1, p1)) {
            placeUnitRaw(u2.idx, d1, p1);
            const nextEval = computeTotalSoftScore();
            const delta = nextEval.score - currentEval.score;
            if (delta >= 0 || rng() < Math.exp(delta / temperature)) {
              currentEval = nextEval;
              if (nextEval.score > bestScore) {
                bestScore = nextEval.score;
                bestSeqHits = nextEval.sequenceHits;
                bestPrefHits = nextEval.preferredPeriodHits;
                bestFinalDay = new Int32Array(unitDay);
                bestFinalPeriod = new Int32Array(unitPeriod);
              }
              continue;
            }
          }
        }

        unplaceUnitRaw(u1.idx);
        unplaceUnitRaw(u2.idx);
        placeUnitRaw(u1.idx, d1, p1);
        placeUnitRaw(u2.idx, d2, p2);
        continue;
      }

      // Move Type C (30%): Move a single movable unit into an empty slot
      const u = movableUnits[Math.floor(rng() * movableUnits.length)];
      const oldD = unitDay[u.idx];
      const oldP = unitPeriod[u.idx];
      if (oldD === -1) continue;

      const newD = Math.floor(rng() * D);
      const newP = Math.floor(rng() * P);
      if (newD === oldD && newP === oldP) continue;

      unplaceUnitRaw(u.idx);
      if (canPlaceCleanly(u, newD, newP)) {
        placeUnitRaw(u.idx, newD, newP);
        const nextEval = computeTotalSoftScore();
        const delta = nextEval.score - currentEval.score;
        if (delta >= 0 || rng() < Math.exp(delta / temperature)) {
          currentEval = nextEval;
          if (nextEval.score > bestScore) {
            bestScore = nextEval.score;
            bestSeqHits = nextEval.sequenceHits;
            bestPrefHits = nextEval.preferredPeriodHits;
            bestFinalDay = new Int32Array(unitDay);
            bestFinalPeriod = new Int32Array(unitPeriod);
          }
          continue;
        }
        unplaceUnitRaw(u.idx);
      }
      placeUnitRaw(u.idx, oldD, oldP);
    }
  }

  // Load best final board and emit TimetableEntry[]
  resetBoard();
  const unplacedTitles: string[] = [];
  let placedUnits = 0;

  for (let i = 0; i < totalUnits; i++) {
    if (bestFinalDay[i] !== -1) {
      placeUnitRaw(i, bestFinalDay[i], bestFinalPeriod[i]);
      placedUnits++;
    } else {
      unplacedTitles.push(
        `${units[i].title} (${units[i].classroomIds.map((cid) => classroomsMap.get(cid)?.name ?? cid).join(", ")})`
      );
    }
  }

  const emittedEntries: TimetableEntry[] = [];
  for (let i = 0; i < totalUnits; i++) {
    const d = bestFinalDay[i];
    const p = bestFinalPeriod[i];
    if (d === -1 || p === -1) continue;
    const u = units[i];
    if (u.isSubgroup && u.subgroupAssignments && u.subgroupAssignments.length > 0) {
      for (const subAsg of u.subgroupAssignments) {
        const subSub = subjectsMap.get(subAsg.subjectId);
        const subTitle = subSub ? `${subSub.shortName || subSub.name}` : subAsg.subjectId;
        const subSession = subAsg.splitSessions[u.sessionIndex] || subAsg.splitSessions[0];
        const subRoomId = subAsg.specificRule?.customRoomId ?? subSession?.roomId ?? null;
        emittedEntries.push({
          id: `${u.id}_${subAsg.id}`,
          versionId: options.versionId,
          sourceType: u.sourceType,
          assignmentId: subAsg.id,
          syncBlockId: null,
          sessionIndex: u.sessionIndex,
          day: days[d],
          startPeriod: sortedPeriods[p].period,
          duration: u.duration,
          classroomIds: [subAsg.classroomId],
          subjectId: subAsg.subjectId,
          title: subTitle,
          subjectCode: subSub?.code ?? null,
          teacherIds: subAsg.teacherIds,
          roomId: subRoomId,
          electiveScope: null,
          isSubgroup: true,
          subgroupName: subAsg.subgroupName ?? null,
          subgroupSyncId: subAsg.subgroupSyncId ?? null,
          isPinned: u.isPinned,
          isOverridden: false,
          overrideNote: null,
        });
      }
    } else {
      emittedEntries.push({
        id: u.id,
        versionId: options.versionId,
        sourceType: u.sourceType,
        assignmentId: u.assignmentId,
        syncBlockId: u.syncBlockId,
        sessionIndex: u.sessionIndex,
        day: days[d],
        startPeriod: sortedPeriods[p].period,
        duration: u.duration,
        classroomIds: u.classroomIds,
        subjectId: u.subjectId,
        title: u.title,
        subjectCode: u.subjectCode,
        teacherIds: u.teacherIds,
        roomId: u.explicitRoomId,
        electiveScope: u.electiveScope,
        classroomTeacherMap: u.classroomTeacherMap,
        isPinned: u.isPinned,
        isOverridden: false,
        overrideNote: null,
      });
    }
  }

  // สร้างรายการ "คาบอิสระ" (free_period) ในช่องว่างที่เหลือของแต่ละห้องเรียน (ข้อ 2)
  for (let c = 0; c < C; c++) {
    const cls = classrooms[c];
    for (let d = 0; d < D; d++) {
      for (let p = 0; p < P; p++) {
        if (clsGrid[c][d * P + p] === -1) {
          emittedEntries.push({
            id: `entry_free_${options.versionId}_${cls.id}_${days[d]}_${sortedPeriods[p].period}`,
            versionId: options.versionId,
            sourceType: "free_period",
            assignmentId: null,
            syncBlockId: null,
            sessionIndex: 0,
            day: days[d],
            startPeriod: sortedPeriods[p].period,
            duration: 1,
            classroomIds: [cls.id],
            subjectId: null,
            title: "คาบอิสระ / ค้นคว้า",
            subjectCode: "อิสระ",
            teacherIds: [],
            roomId: null,
            electiveScope: null,
            isPinned: clsLockedFree[c][d * P + p],
            isOverridden: false,
            overrideNote: null,
          });
        }
      }
    }
  }

  const elapsedMs = Date.now() - startTime;
  options.onProgress?.({
    phase: "completed",
    placedCount: placedUnits,
    totalUnits,
    hardConflicts: unplacedTitles.length,
    softScore: bestScore,
    iteration: 0,
    elapsedMs,
    message:
      unplacedTitles.length === 0
        ? "จัดตารางสอนเสร็จสมบูรณ์ (ไม่พบข้อขัดแย้ง)"
        : `จัดตารางเสร็จสิ้น เหลือ ${unplacedTitles.length} คาบที่ต้องปรับเงื่อนไข`,
  });

  return {
    entries: emittedEntries,
    hardConflicts: unplacedTitles.length,
    unplacedTitles,
    softScore: Math.round(bestScore),
    elapsedMs,
    stats: {
      totalUnits,
      placedUnits,
      sequenceHits: bestSeqHits,
      preferredPeriodHits: bestPrefHits,
    },
  };
}
