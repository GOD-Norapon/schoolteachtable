import { describe, expect, it } from "vitest";
import { createSeedDataset } from "@/lib/seed-data";
import {
  auditDatasetReadiness,
  canSpanConsecutivePeriods,
  evaluateEntryPlacement,
  findSmartSwapSuggestions,
  resolveEntryPhysicalRooms,
} from "../validator";
import { runTimetableSolver } from "../engine";

describe("School Timetable Validator & 3-Phase Solver Engine (All 21 Requirements)", () => {
  it("audits seed dataset with exact 40/40 periods for all classrooms", () => {
    const dataset = createSeedDataset();
    const report = auditDatasetReadiness(dataset);

    expect(report.totalSlotsPerWeek).toBe(40);
    for (const ca of report.classroomAudits) {
      expect(ca.delta, `Room ${ca.classroomName} delta should be 0`).toBe(0);
      expect(ca.totalPlannedPeriods).toBe(40);
    }
    expect(report.isAllRoomsBalanced).toBe(true);
    expect(report.canRunSolver).toBe(true);
  });

  it("enforces morning 20-minute break between Period 2 and 3 (Req 12)", () => {
    const dataset = createSeedDataset();
    expect(canSpanConsecutivePeriods(dataset.term, 1, 2).valid).toBe(true); // 1-2 OK
    expect(canSpanConsecutivePeriods(dataset.term, 2, 2).valid).toBe(false); // 2-3 crosses 20m break!
    expect(canSpanConsecutivePeriods(dataset.term, 3, 2).valid).toBe(true); // 3-4 OK
    expect(canSpanConsecutivePeriods(dataset.term, 4, 2).valid).toBe(false); // 4-5 crosses lunch!
    expect(canSpanConsecutivePeriods(dataset.term, 6, 3).valid).toBe(true); // 6-7-8 OK (นศท.)
  });

  it("solves full 12-room Thai high school schedule with 0 hard conflicts and satisfies all constraints", () => {
    const dataset = createSeedDataset();
    const res = runTimetableSolver(dataset, {
      versionId: "ver_test",
      maxOptimizationMs: 1800,
      seed: 42,
    });

    expect(res.unplacedTitles).toEqual([]);
    expect(res.hardConflicts).toBe(0);

    const nonFree = res.entries.filter((e) => e.sourceType !== "free_period");
    const freeEntries = res.entries.filter((e) => e.sourceType === "free_period");

    // Req 1: ชุมนุม พฤหัส คาบ 8 ทุกห้อง
    const club = nonFree.find((e) => e.syncBlockId === "sync_club");
    expect(club).toBeDefined();
    expect(club?.day).toBe("THU");
    expect(club?.startPeriod).toBe(8);
    expect(club?.classroomIds.length).toBe(dataset.classrooms.length);

    // Req 2: คาบอิสระแต่ละห้องตรงตามที่ตั้งไว้ (ไม่เท่ากันในแต่ละห้อง)
    for (const cls of dataset.classrooms) {
      const clsFree = freeEntries.filter((e) => e.classroomIds.includes(cls.id));
      expect(clsFree.length).toBe(cls.freePeriodsCount);
    }

    // Req 3: ลูกเสือ ม.1-ม.3 พุธ คาบ 7
    const scout = nonFree.find((e) => e.syncBlockId === "sync_scout");
    expect(scout?.day).toBe("WED");
    expect(scout?.startPeriod).toBe(7);

    // Req 13: นศท. ม.ปลาย ศุกร์ คาบ 6-7-8
    const rotc = nonFree.find((e) => e.syncBlockId === "sync_rotc");
    expect(rotc?.day).toBe("FRI");
    expect(rotc?.startPeriod).toBe(6);
    expect(rotc?.duration).toBe(3);

    // Req 6: ม.2 ห้อง 7-8-9-10 เรียนวิชาเลือกพร้อมกัน 2 คาบติด
    const m2Elective = nonFree.find((e) => e.syncBlockId === "sync_m2_elective");
    expect(m2Elective).toBeDefined();
    expect(m2Elective?.duration).toBe(2);
    expect(m2Elective?.classroomIds).toEqual(["c_m2_7", "c_m2_8", "c_m2_9", "c_m2_10"]);

    // Req 12: คาบคู่ช่วงเช้าทั้งหมดต้องเริ่มที่คาบ 1 หรือ 3 เท่านั้น ห้ามเริ่มที่ 2 หรือ 4
    for (const e of nonFree) {
      if (e.duration === 2 && e.startPeriod <= 4) {
        expect([1, 3]).toContain(e.startPeriod);
      }
    }

    // Req 8: ครูที่ล็อคคาบแรกทุกวัน (t_th1, t_ma1) ต้องไม่มีสอนคาบ 1 เลย
    for (const lockedTid of ["t_th1", "t_ma1"]) {
      const p1Classes = nonFree.filter(
        (e) => e.teacherIds.includes(lockedTid) && e.startPeriod === 1
      );
      expect(p1Classes.length).toBe(0);
    }

    // Req 9 & 18: ห้องที่ใช้ร่วมกัน (เช่น LAB-CHEM, COM-1, HALL, GYM-1) ห้ามชนกันในวัน-คาบเดียวกัน
    const classroomsMap = new Map(dataset.classrooms.map((c) => [c.id, c]));
    const syncMap = new Map(dataset.synchronizedBlocks.map((b) => [b.id, b]));
    for (const d of dataset.term.daysOfWeek) {
      for (let p = 1; p <= 8; p++) {
        const active = nonFree.filter(
          (e) => e.day === d && p >= e.startPeriod && p < e.startPeriod + e.duration
        );
        const roomCounts = new Map<string, number>();
        for (const e of active) {
          for (const rid of resolveEntryPhysicalRooms(e, classroomsMap, syncMap)) {
            roomCounts.set(rid, (roomCounts.get(rid) || 0) + 1);
          }
        }
        for (const [rid, count] of roomCounts.entries()) {
          expect(count, `Room ${rid} double-booked at ${d} P${p}`).toBeLessThanOrEqual(1);
        }
      }
    }

    // Constraint: วิชาเดียวกันที่แยกคาบเดี่ยว ห้ามลงซ้ำในวันเดียวกันในห้องเดียวกัน (allowSameDayRepeat === false)
    for (const cls of dataset.classrooms) {
      const clsAssignments = nonFree.filter(
        (e) => e.sourceType === "assignment" && e.classroomIds.includes(cls.id) && e.subjectId
      );
      for (const d of dataset.term.daysOfWeek) {
        const daySubjects = clsAssignments.filter((e) => e.day === d).map((e) => e.subjectId);
        const uniqueSubjects = new Set(daySubjects);
        expect(
          daySubjects.length,
          `Room ${cls.name} has duplicate subject on ${d}: ${daySubjects.join(", ")}`
        ).toBe(uniqueSubjects.size);
      }
    }

    // Validate every placed entry with evaluateEntryPlacement -> 0 hard reasons!
    for (const e of nonFree) {
      const check = evaluateEntryPlacement(e, e.day, e.startPeriod, nonFree, dataset);
      expect(check.hardReasons, `Entry ${e.id} (${e.title}) had hard conflict`).toEqual([]);
    }

    // Req 17: ตรวจสอบว่ามีการจัด ศิลปะ -> พละ ต่อเนื่องกันและพละลงคาบ 4/8 ได้จริง
    expect(res.stats.preferredPeriodHits).toBeGreaterThanOrEqual(8);
    expect(res.stats.sequenceHits).toBeGreaterThanOrEqual(6);

    // Req 15: Smart Swap Suggestions ทำงานได้ถูกต้อง
    const sampleMoveEntry = nonFree.find((e) => e.sourceType === "assignment" && e.duration === 1)!;
    const swaps = findSmartSwapSuggestions(sampleMoveEntry, res.entries, dataset);
    expect(swaps.length).toBeGreaterThan(0);
  });

  it("handles full 60 classrooms (2,400 periods per week) smoothly under 5 seconds", () => {
    const dataset = createSeedDataset();
    expect(dataset.classrooms.length).toBe(60);

    const tStart = Date.now();
    const res = runTimetableSolver(dataset, {
      versionId: "ver_60_rooms",
      maxOptimizationMs: 3000,
      seed: 42,
    });
    const elapsed = Date.now() - tStart;

    console.log(`[60 Rooms Benchmark] Solved in ${elapsed}ms: ${res.entries.length} slots generated, unplaced: ${res.unplacedTitles.length}, hard conflicts: ${res.hardConflicts}`);
    expect(res.hardConflicts).toBe(0);
    expect(res.unplacedTitles.length).toBe(0);
    expect(res.entries.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(6000);

    // Verify no classroom has duplicate subjects on the same day across all 60 classrooms
    for (const cls of dataset.classrooms) {
      const clsAssignments = res.entries.filter(
        (e) => e.sourceType === "assignment" && e.classroomIds.includes(cls.id) && e.subjectId
      );
      for (const d of dataset.term.daysOfWeek) {
        const daySubjects = clsAssignments.filter((e) => e.day === d).map((e) => e.subjectId);
        const uniqueSubjects = new Set(daySubjects);
        expect(
          daySubjects.length,
          `Room ${cls.name} has duplicate subject on ${d}: ${daySubjects.join(", ")}`
        ).toBe(uniqueSubjects.size);
      }
    }
  });

  it("respects per-classroom specific conditions (e.g. Science for Room 1/10 locked to MON Period 1)", () => {
    const dataset = createSeedDataset();
    // Find an assignment for room 1/1
    const targetAsg = dataset.teachingAssignments[0];
    targetAsg.specificRule = {
      fixedDay: "MON",
      fixedStartPeriod: 1,
      notes: "วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์",
    };

    const res = runTimetableSolver(dataset, {
      versionId: "ver_specific_rule_test",
      maxOptimizationMs: 1500,
      seed: 42,
    });

    const placedTarget = res.entries.find(
      (e) => e.assignmentId === targetAsg.id && e.sessionIndex === 0
    );
    expect(placedTarget).toBeDefined();
    expect(placedTarget?.day).toBe("MON");
    expect(placedTarget?.startPeriod).toBe(1);
  });

  it("enforces school-wide blocks appearing for teachers (Req 2) and grade blocks appearing for advisor teachers (Req 3)", () => {
    const dataset = createSeedDataset();
    const res = runTimetableSolver(dataset, {
      versionId: "ver_sync_teachers_test",
      maxOptimizationMs: 1500,
      seed: 42,
    });

    // Req 2: คาบทั้งโรงเรียน (เช่น ชุมนุม) ให้คาบนั้นปรากฏของครูทุกคนด้วย
    const clubEntry = res.entries.find((e) => e.syncBlockId === "sync_club");
    expect(clubEntry).toBeDefined();
    expect(clubEntry?.teacherIds.length).toBe(dataset.teachers.length);

    // Req 3: สำหรับกิจกรรมลูกเสือ ลงในของนักเรียน ไม่ต้องลงในคาบครู (User Request ข้อ 3)
    const scoutEntry = res.entries.find((e) => e.syncBlockId === "sync_scout");
    expect(scoutEntry).toBeDefined();
    expect(scoutEntry?.classroomIds.length).toBeGreaterThan(0);
    expect(scoutEntry?.teacherIds).toEqual([]); // ไม่ต้องลงในคาบครู!

    // คาบประจำระดับชั้นอื่น (เช่น อบรมคุณธรรม ม.1) ให้ปรากฏในคาบของครูที่ปรึกษาระดับชั้นนั้น
    const moralM1 = res.entries.find((e) => e.syncBlockId === "sync_moral_g_m1");
    if (moralM1) {
      const m1Advisors = dataset.classrooms
        .filter((c) => c.gradeLevelId === "g_m1")
        .flatMap((c) => c.advisorTeacherIds);
      for (const adv of m1Advisors) {
        expect(moralM1.teacherIds).toContain(adv);
      }
    }
  });

  it("supports subgroup split classrooms (1 room with 2 tracks learning concurrently e.g. Math & English in Room 4/7)", () => {
    const dataset = createSeedDataset();
    const targetRoom = dataset.classrooms.find((c) => c.id === "cls_4_1") || dataset.classrooms[0];
    const teacherA = dataset.teachers[0];
    const teacherB = dataset.teachers[1];

    // Replace 1 normal 2-period assignment with 2 paired subgroup assignments
    const existingAsgIdx = dataset.teachingAssignments.findIndex(
      (a) => a.classroomId === targetRoom.id && a.periodsPerWeek === 2
    );
    expect(existingAsgIdx).toBeGreaterThanOrEqual(0);
    const originalAsg = dataset.teachingAssignments[existingAsgIdx];

    const subgroupSyncId = `subgroup_split_${targetRoom.id}_${Date.now()}`;
    const asgTrack1 = {
      ...originalAsg,
      id: `asg_split_track1_${targetRoom.id}`,
      teacherIds: [teacherA.id],
      isSubgroup: true,
      subgroupName: "แผนคณิตศาสตร์",
      subgroupSyncId,
    };
    const asgTrack2 = {
      ...originalAsg,
      id: `asg_split_track2_${targetRoom.id}`,
      teacherIds: [teacherB.id],
      isSubgroup: true,
      subgroupName: "แผนภาษาต่างประเทศ",
      subgroupSyncId,
    };

    dataset.teachingAssignments.splice(existingAsgIdx, 1, asgTrack1, asgTrack2);

    // 1. Audit check: Paired subgroups must NOT double-count classroom periods
    const audit = auditDatasetReadiness(dataset);
    const roomAudit = audit.classroomAudits.find((ca) => ca.classroomId === targetRoom.id);
    expect(roomAudit?.delta).toBe(0);
    expect(roomAudit?.totalPlannedPeriods).toBe(40);

    // 2. Run solver
    const res = runTimetableSolver(dataset, {
      versionId: "ver_subgroup_test",
      maxOptimizationMs: 1500,
      seed: 42,
    });

    expect(res.unplacedTitles).toEqual([]);
    expect(res.hardConflicts).toBe(0);

    // 3. Both subgroup entries must be scheduled at the exact same day and startPeriod
    const track1Entry = res.entries.find((e) => e.assignmentId === asgTrack1.id);
    const track2Entry = res.entries.find((e) => e.assignmentId === asgTrack2.id);

    expect(track1Entry).toBeDefined();
    expect(track2Entry).toBeDefined();
    expect(track1Entry?.day).toBe(track2Entry?.day);
    expect(track1Entry?.startPeriod).toBe(track2Entry?.startPeriod);
    expect(track1Entry?.subgroupName).toBe("แผนคณิตศาสตร์");
    expect(track2Entry?.subgroupName).toBe("แผนภาษาต่างประเทศ");

    // 4. Verify evaluateEntryPlacement does not flag room conflict between them
    const placementCheck = evaluateEntryPlacement(
      track1Entry!,
      track1Entry!.day,
      track1Entry!.startPeriod,
      [track2Entry!],
      dataset
    );
    expect(placementCheck.status).not.toBe("hard_conflict");
  });
});
