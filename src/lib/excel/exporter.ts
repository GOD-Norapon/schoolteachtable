import ExcelJS from "exceljs";
import {
  DAY_LABELS,
  DayOfWeek,
  SchoolDataset,
  TimetableEntry,
} from "@/types/timetable";
import { getTeacherFullName, sortClassrooms } from "@/lib/solver/validator";

interface ColumnSlot {
  kind: "period" | "break";
  period?: number;
  headerTitle: string;
  timeRange: string;
}

function buildVisualColumns(dataset: SchoolDataset): ColumnSlot[] {
  const cols: ColumnSlot[] = [];
  const sortedPeriods = [...dataset.term.periodsConfig].sort((a, b) => a.period - b.period);
  for (const pc of sortedPeriods) {
    cols.push({
      kind: "period",
      period: pc.period,
      headerTitle: pc.label,
      timeRange: `${pc.startTime}-${pc.endTime}`,
    });
    const brk = dataset.term.breaksConfig.find((b) => b.afterPeriod === pc.period);
    if (brk) {
      cols.push({
        kind: "break",
        headerTitle: brk.durationMinutes <= 25 ? `พัก ${brk.durationMinutes}น.` : "พักกลางวัน",
        timeRange: brk.label,
      });
    }
  }
  return cols;
}

export interface TeacherCourseSummaryRow {
  code: string;
  title: string;
  targetRooms: string;
  periods: number;
  category: "teaching" | "elective" | "advisor" | "activity" | "meeting";
}

export function getTeacherScheduleAndSummary(
  teacherId: string,
  versionEntries: TimetableEntry[],
  dataset: SchoolDataset
) {
  const classroomsMap = new Map(dataset.classrooms.map((c) => [c.id, c]));
  const roomsMap = new Map(dataset.rooms.map((r) => [r.id, r]));
  const subjectsMap = new Map(dataset.subjects.map((s) => [s.id, s]));
  const syncMap = new Map(dataset.synchronizedBlocks.map((b) => [b.id, b]));
  const teacher = dataset.teachers.find((t) => t.id === teacherId);

  // คาบในตารางที่ครูท่านนี้เกี่ยวข้อง
  const activeEntries = versionEntries.filter((e) => {
    if (e.sourceType === "free_period" || !e.teacherIds.includes(teacherId)) return false;
    if (e.sourceType === "sync_block" && e.syncBlockId) {
      const sb = syncMap.get(e.syncBlockId);
      if (sb?.excludedTeacherIds?.includes(teacherId)) return false;
    }
    return true;
  });

  // คาบประชุมฝ่ายของครูท่านนี้
  const meetings = teacher
    ? dataset.groupMeetingLocks.filter(
        (m) =>
          ((m.targetType === "department" && m.targetId === teacher.departmentId) ||
            (m.targetType === "division" && teacher.divisionIds.includes(m.targetId))) &&
          !m.excludedTeacherIds?.includes(teacherId)
      )
    : [];

  // สรุปรายวิชาและจำนวนคาบ (ข้อ 20)
  const summaryMap = new Map<string, TeacherCourseSummaryRow>();
  let teachingTotal = 0;
  let electiveTotal = 0;
  let advisorTotal = 0;
  let activityTotal = 0;

  const seenSlotKeys = new Set<string>();

  for (const e of activeEntries) {
    if (e.sourceType === "assignment") {
      const sub = e.subjectId ? subjectsMap.get(e.subjectId) : undefined;
      const isElective = sub?.subjectType === "elective";
      const slotKey = `${e.day}:${e.startPeriod}`;
      const isDupSlot = seenSlotKeys.has(slotKey);
      seenSlotKeys.add(slotKey);

      if (!isDupSlot) {
        if (isElective) {
          electiveTotal += e.duration;
        } else {
          teachingTotal += e.duration;
        }
      }

      const cName = e.classroomIds.map((cid) => classroomsMap.get(cid)?.name ?? cid).join(", ") +
        (e.subgroupName ? ` (${e.subgroupName})` : "");
      const key = `asg:${e.jointGroupId ?? e.subgroupSyncId ?? e.subjectId ?? e.title}:${cName}`;
      const existing = summaryMap.get(key);
      if (existing) {
        if (!isDupSlot) {
          existing.periods += e.duration;
        }
      } else {
        summaryMap.set(key, {
          code: sub?.code || e.subjectCode || "-",
          title: (e.subgroupName ? `[${e.subgroupName}] ` : "") + (e.classroomIds.length > 1 ? "[กลุ่มรวม] " : "") + (sub?.name || e.title),
          targetRooms: cName,
          periods: e.duration,
          category: isElective ? "elective" : "teaching",
        });
      }
    } else if (e.sourceType === "sync_block") {
      const sb = e.syncBlockId ? syncMap.get(e.syncBlockId) : undefined;
      const offering = e.electiveScope?.find((o) => o.teacherIds.includes(teacherId));

      if (offering) {
        electiveTotal += e.duration;
        summaryMap.set(`elec:${e.id}:${offering.id}`, {
          code: offering.subjectCode || "เลือกเสรี",
          title: `${offering.subjectName} (${e.title})`,
          targetRooms: e.classroomIds.map((cid) => classroomsMap.get(cid)?.name ?? cid).join(", "),
          periods: e.duration,
          category: "elective",
        });
      } else if (sb?.blockType === "moral_assembly" || sb?.blockType === "homeroom") {
        advisorTotal += e.duration;
        const myAdvised = dataset.classrooms
          .filter((c) => e.classroomIds.includes(c.id) && c.advisorTeacherIds.includes(teacherId))
          .map((c) => c.name);
        summaryMap.set(`adv:${e.id}`, {
          code: e.subjectCode || "ที่ปรึกษา",
          title: e.title,
          targetRooms: myAdvised.length > 0 ? myAdvised.join(", ") : "สายชั้น",
          periods: e.duration,
          category: "advisor",
        });
      } else if (sb?.blockType === "parallel_subject" || sb?.classroomTeacherMap || e.classroomTeacherMap) {
        teachingTotal += e.duration;
        const ctm = sb?.classroomTeacherMap || e.classroomTeacherMap;
        const myClassrooms = ctm
          ? Object.entries(ctm)
              .filter(([, tids]) => tids.includes(teacherId))
              .map(([cid]) => classroomsMap.get(cid)?.name ?? cid)
          : [];
        summaryMap.set(`parallel:${e.id}`, {
          code: e.subjectCode || "IS",
          title: e.title,
          targetRooms: myClassrooms.length > 0 ? myClassrooms.join(", ") : "ห้องเรียน",
          periods: e.duration,
          category: "teaching",
        });
      } else {
        activityTotal += e.duration;
        summaryMap.set(`act:${e.id}`, {
          code: e.subjectCode || "กิจกรรม",
          title: e.title,
          targetRooms:
            e.classroomIds.length > 4
              ? `${e.classroomIds.length} ห้องเรียน`
              : e.classroomIds.map((cid) => classroomsMap.get(cid)?.name ?? cid).join(", "),
          periods: e.duration,
          category: "activity",
        });
      }
    }
  }

  let meetingTotal = 0;
  for (const m of meetings) {
    meetingTotal += m.duration;
    summaryMap.set(`mtg:${m.id}`, {
      code: "ประชุม",
      title: m.title,
      targetRooms: `${DAY_LABELS[m.day]?.short ?? m.day} คาบ ${m.startPeriod}`,
      periods: m.duration,
      category: "meeting",
    });
  }

  const latePeriodSet = new Set(
    dataset.term.periodsConfig.filter((p) => p.isLatePeriod).map((p) => p.period)
  );
  const lateDays = new Set<DayOfWeek>();
  for (const e of activeEntries) {
    for (let k = 0; k < e.duration; k++) {
      if (latePeriodSet.has(e.startPeriod + k)) lateDays.add(e.day);
    }
  }

  function formatCellForTeacher(day: DayOfWeek, period: number): { text: string; span: number } | null {
    const mtg = meetings.find((m) => m.day === day && m.startPeriod === period);
    const ent = activeEntries.find((e) => e.day === day && e.startPeriod === period);

    const getEntText = (e: TimetableEntry) => {
      if (e.sourceType === "assignment") {
        const clsName = e.classroomIds.map((cid) => classroomsMap.get(cid)?.name ?? cid).join(", ");
        const resolvedRmId =
          e.roomId ??
          (e.classroomIds[0] ? classroomsMap.get(e.classroomIds[0])?.defaultRoomId : null) ??
          null;
        const rm = resolvedRmId ? roomsMap.get(resolvedRmId) : undefined;
        const isJoint = e.classroomIds.length > 1;
        const jointPrefix = isJoint ? "[กลุ่มรวม] " : "";
        const subgroupPrefix = e.subgroupName ? `[${e.subgroupName}] ` : "";
        const coTeachers =
          e.teacherIds.length > 1 ? ` (สอนร่วม ${e.teacherIds.length} คน)` : "";
        return `${e.subjectCode || ""}\n${subgroupPrefix}${jointPrefix}${e.title}${coTeachers}\n${clsName}${e.subgroupName ? ` (${e.subgroupName})` : ""} ${rm ? `[${rm.code}]` : ""}`.trim();
      }

      const off = e.electiveScope?.find((o) => o.teacherIds.includes(teacherId));
      if (off) {
        const rm = off.roomId ? roomsMap.get(off.roomId) : undefined;
        return `${off.subjectCode}\n${off.subjectName}\nวิชาเลือก ${rm ? `[${rm.code}]` : ""}`.trim();
      }

      const rm = e.roomId ? roomsMap.get(e.roomId) : undefined;
      const sb = e.syncBlockId ? syncMap.get(e.syncBlockId) : undefined;
      const ctm = sb?.classroomTeacherMap || e.classroomTeacherMap;
      let roomHint = "";
      if (ctm) {
        const myRooms = Object.entries(ctm)
          .filter(([, tids]) => tids.includes(teacherId))
          .map(([cid]) => classroomsMap.get(cid)?.name ?? cid);
        if (myRooms.length > 0) {
          roomHint = myRooms.join(", ");
        }
      } else {
        const advisedRoom = dataset.classrooms.find(
          (c) => e.classroomIds.includes(c.id) && c.advisorTeacherIds.includes(teacherId)
        );
        roomHint = rm ? `[${rm.code}]` : advisedRoom ? advisedRoom.name : "";
      }
      return `${e.title}\n${roomHint}`.trim();
    };

    if (mtg && ent) {
      const entText = getEntText(ent);
      return {
        text: `📌 ${entText}\n─────────\n🏢 [ประชุม] ${mtg.title}`,
        span: Math.max(mtg.duration, ent.duration),
      };
    }

    if (mtg) {
      return { text: `[ประชุม]\n${mtg.title}`, span: mtg.duration };
    }

    if (!ent) return null;

    return {
      text: getEntText(ent),
      span: ent.duration,
    };
  }

  return {
    activeEntries,
    meetings,
    summaryRows: Array.from(summaryMap.values()),
    totals: {
      teachingTotal,
      electiveTotal,
      advisorTotal,
      activityTotal,
      meetingTotal,
      totalTeaching: teachingTotal + electiveTotal + advisorTotal + activityTotal, // ไม่นับคาบประชุม ตามข้อ 2
      grandTotal: teachingTotal + electiveTotal + advisorTotal + activityTotal + meetingTotal,
      lateDaysCount: lateDays.size,
    },
    formatCellForTeacher,
  };
}

/**
 * สร้างไฟล์ Excel (.xlsx) ครบทั้ง 4 แผ่นงาน:
 * 1. สรุปภาระงานครูทุกคน
 * 2. ตารางสอนรายครู (พร้อมตารางสรุปคาบรายคน)
 * 3. ตารางเรียนรายห้องเรียน
 * 4. ตารางรวมทั้งโรงเรียน (Master Matrix)
 */
export async function generateFullTimetableExcelBuffer(
  dataset: SchoolDataset,
  versionId: string
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = dataset.term.schoolName;
  wb.created = new Date();

  const versionEntries = dataset.entries.filter((e) => e.versionId === versionId);
  const deptsMap = new Map(dataset.departments.map((d) => [d.id, d]));
  const teachersMap = new Map(dataset.teachers.map((t) => [t.id, t]));
  const subjectsMap = new Map(dataset.subjects.map((s) => [s.id, s]));
  const roomsMap = new Map(dataset.rooms.map((r) => [r.id, r]));
  const syncMap = new Map(dataset.synchronizedBlocks.map((b) => [b.id, b]));
  const visualCols = buildVisualColumns(dataset);

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFCBD5E1" } },
    left: { style: "thin", color: { argb: "FFCBD5E1" } },
    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    right: { style: "thin", color: { argb: "FFCBD5E1" } },
  };

  // ==================== SHEET 1: สรุปภาระงานครู ====================
  const wsSummary = wb.addWorksheet("1.สรุปภาระงานครู");
  wsSummary.views = [{ state: "frozen", ySplit: 3 }];
  wsSummary.mergeCells(1, 1, 1, 11);
  const titleCell = wsSummary.getCell(1, 1);
  titleCell.value = `สรุปจำนวนคาบปฏิบัติงานของครูผู้สอน — ${dataset.term.schoolName} (${dataset.term.name})`;
  titleCell.font = { name: "Tahoma", size: 13, bold: true };

  const headers = [
    "รหัสครู",
    "ชื่อ - นามสกุล",
    "กลุ่มสาระการเรียนรู้",
    "ครูที่ปรึกษา",
    "คาบสอนวิชาการ",
    "คาบวิชาเลือก",
    "คุณธรรม/Homeroom",
    "ลูกเสือ/ชุมนุม/นศท.",
    "คาบประชุมฝ่าย",
    "รวมคาบสอน (ไม่รวมประชุม)",
    "วันสอนคาบ 8",
  ];
  const headerRow = wsSummary.getRow(3);
  headers.forEach((h, idx) => {
    const c = headerRow.getCell(idx + 1);
    c.value = h;
    c.font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = thinBorder;
  });
  headerRow.height = 26;

  let rowCursor = 4;
  for (const t of dataset.teachers) {
    const info = getTeacherScheduleAndSummary(t.id, versionEntries, dataset);
    const advised = dataset.classrooms
      .filter((c) => c.advisorTeacherIds.includes(t.id))
      .map((c) => c.name)
      .join(", ");
    const r = wsSummary.getRow(rowCursor++);
    const vals = [
      t.code,
      getTeacherFullName(t),
      deptsMap.get(t.departmentId)?.name ?? "-",
      advised || "-",
      info.totals.teachingTotal,
      info.totals.electiveTotal,
      info.totals.advisorTotal,
      info.totals.activityTotal,
      info.totals.meetingTotal,
      info.totals.totalTeaching,
      `${info.totals.lateDaysCount} วัน`,
    ];
    vals.forEach((v, idx) => {
      const cell = r.getCell(idx + 1);
      cell.value = v;
      cell.font = { name: "Tahoma", size: 10, bold: idx === 9 };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        horizontal: idx >= 4 || idx === 0 || idx === 3 ? "center" : "left",
      };
    });
    r.height = 20;
  }
  wsSummary.columns = [
    { width: 10 },
    { width: 26 },
    { width: 26 },
    { width: 14 },
    { width: 15 },
    { width: 14 },
    { width: 17 },
    { width: 17 },
    { width: 14 },
    { width: 15 },
    { width: 13 },
  ];

  // ==================== SHEET 2: ตารางสอนรายครู + สรุปคาบ ====================
  const wsTeachers = wb.addWorksheet("2.ตารางสอนรายครู");
  wsTeachers.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  let tRow = 1;
  const totalGridCols = 1 + visualCols.length;

  for (const t of dataset.teachers) {
    const info = getTeacherScheduleAndSummary(t.id, versionEntries, dataset);
    const advised = dataset.classrooms
      .filter((c) => c.advisorTeacherIds.includes(t.id))
      .map((c) => c.name)
      .join(", ");

    wsTeachers.mergeCells(tRow, 1, tRow, totalGridCols);
    const hCell = wsTeachers.getCell(tRow, 1);
    hCell.value = `ตารางสอนรายบุคคล: ${getTeacherFullName(t)} (${t.code}) | กลุ่มสาระ${deptsMap.get(t.departmentId)?.name ?? ""} | ที่ปรึกษา: ${advised || "-"} | รวม ${info.totals.totalTeaching} คาบสอน/สัปดาห์${info.totals.meetingTotal > 0 ? ` (ประชุม ${info.totals.meetingTotal} คาบ)` : ""}`;
    hCell.font = { name: "Tahoma", size: 11, bold: true };
    hCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    wsTeachers.getRow(tRow).height = 24;
    tRow++;

    // Header Row (คาบ + เวลา)
    const hr = wsTeachers.getRow(tRow);
    hr.getCell(1).value = "วัน / คาบ";
    hr.getCell(1).font = { name: "Tahoma", size: 9, bold: true };
    hr.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    hr.getCell(1).border = thinBorder;

    visualCols.forEach((vc, idx) => {
      const cell = hr.getCell(idx + 2);
      cell.value = `${vc.headerTitle}\n${vc.timeRange}`;
      cell.font = { name: "Tahoma", size: 8, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: vc.kind === "break" ? "FFFEF3C7" : "FFF1F5F9" },
      };
      cell.border = thinBorder;
    });
    hr.height = 28;
    tRow++;

    // Days rows
    for (const day of dataset.term.daysOfWeek) {
      const dr = wsTeachers.getRow(tRow);
      dr.height = 42;
      const dayCell = dr.getCell(1);
      dayCell.value = DAY_LABELS[day]?.full ?? day;
      dayCell.font = { name: "Tahoma", size: 9, bold: true };
      dayCell.alignment = { horizontal: "center", vertical: "middle" };
      dayCell.border = thinBorder;

      let skipUntilPeriod = -1;
      for (let cIdx = 0; cIdx < visualCols.length; cIdx++) {
        const vc = visualCols[cIdx];
        const colNum = cIdx + 2;
        const cell = dr.getCell(colNum);
        cell.border = thinBorder;

        if (vc.kind === "break") {
          cell.value = vc.headerTitle;
          cell.font = { name: "Tahoma", size: 8, italic: true, color: { argb: "FF92400E" } };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
          continue;
        }

        const pNum = vc.period!;
        if (pNum < skipUntilPeriod) continue;

        const formatted = info.formatCellForTeacher(day, pNum);
        if (!formatted) {
          cell.value = "";
          continue;
        }

        // หาคอลัมน์สิ้นสุดกรณีคาบคู่ / 3 คาบติด
        let endColNum = colNum;
        if (formatted.span > 1) {
          const endPeriod = pNum + formatted.span - 1;
          const endVisualIdx = visualCols.findIndex(
            (x) => x.kind === "period" && x.period === endPeriod
          );
          if (endVisualIdx > cIdx) {
            endColNum = endVisualIdx + 2;
            wsTeachers.mergeCells(tRow, colNum, tRow, endColNum);
          }
          skipUntilPeriod = pNum + formatted.span;
        }

        cell.value = formatted.text;
        cell.font = { name: "Tahoma", size: 8 };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }

      tRow++;
    }

    // ตารางย่อยสรุปรายวิชาของครูท่านนี้ (ข้อ 20)
    const sumHeaderRow = wsTeachers.getRow(tRow);
    sumHeaderRow.getCell(1).value = "สรุปรายวิชา:";
    sumHeaderRow.getCell(1).font = { name: "Tahoma", size: 9, bold: true };
    const summaryText = info.summaryRows
      .map((sr) => `${sr.code} ${sr.title} (${sr.targetRooms}: ${sr.periods} คาบ)`)
      .join("  |  ");
    wsTeachers.mergeCells(tRow, 2, tRow, totalGridCols);
    sumHeaderRow.getCell(2).value = `${summaryText}   ==> รวมปฏิบัติงานทั้งสิ้น ${info.totals.grandTotal} คาบ/สัปดาห์ (สอน ${info.totals.teachingTotal + info.totals.electiveTotal}, ที่ปรึกษา/กิจกรรม ${info.totals.advisorTotal + info.totals.activityTotal}, ประชุม ${info.totals.meetingTotal})`;
    sumHeaderRow.getCell(2).font = { name: "Tahoma", size: 8 };
    sumHeaderRow.getCell(2).alignment = { vertical: "middle", wrapText: true };
    sumHeaderRow.height = 26;
    tRow += 2; // เว้นบรรทัดก่อนคนถัดไป
  }

  wsTeachers.getColumn(1).width = 14;
  visualCols.forEach((vc, idx) => {
    wsTeachers.getColumn(idx + 2).width = vc.kind === "break" ? 9 : 16;
  });

  // ==================== SHEET 3: ตารางเรียนรายห้องเรียน ====================
  const wsRooms = wb.addWorksheet("3.ตารางเรียนรายห้อง");
  wsRooms.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  let cRow = 1;
  for (const cls of sortClassrooms(dataset.classrooms)) {
    const defRm = cls.defaultRoomId ? roomsMap.get(cls.defaultRoomId) : undefined;
    const advisors = cls.advisorTeacherIds
      .map((tid) => teachersMap.get(tid))
      .filter(Boolean)
      .map((t) => getTeacherFullName(t!))
      .join(", ");

    wsRooms.mergeCells(cRow, 1, cRow, totalGridCols);
    const hc = wsRooms.getCell(cRow, 1);
    hc.value = `ตารางเรียนห้อง ${cls.name} (${cls.programName}) | ห้องประจำ: ${defRm?.code ?? "-"} | ครูที่ปรึกษา: ${advisors || "-"}`;
    hc.font = { name: "Tahoma", size: 11, bold: true };
    hc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
    wsRooms.getRow(cRow).height = 24;
    cRow++;

    const hr = wsRooms.getRow(cRow);
    hr.getCell(1).value = "วัน / คาบ";
    hr.getCell(1).font = { name: "Tahoma", size: 9, bold: true };
    hr.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    hr.getCell(1).border = thinBorder;
    visualCols.forEach((vc, idx) => {
      const cell = hr.getCell(idx + 2);
      cell.value = `${vc.headerTitle}\n${vc.timeRange}`;
      cell.font = { name: "Tahoma", size: 8, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: vc.kind === "break" ? "FFFEF3C7" : "FFF1F5F9" },
      };
      cell.border = thinBorder;
    });
    hr.height = 28;
    cRow++;

    const clsEntries = versionEntries.filter((e) => e.classroomIds.includes(cls.id));

    for (const day of dataset.term.daysOfWeek) {
      const dr = wsRooms.getRow(cRow);
      dr.height = 42;
      dr.getCell(1).value = DAY_LABELS[day]?.full ?? day;
      dr.getCell(1).font = { name: "Tahoma", size: 9, bold: true };
      dr.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      dr.getCell(1).border = thinBorder;

      let skipUntilPeriod = -1;
      for (let cIdx = 0; cIdx < visualCols.length; cIdx++) {
        const vc = visualCols[cIdx];
        const colNum = cIdx + 2;
        const cell = dr.getCell(colNum);
        cell.border = thinBorder;

        if (vc.kind === "break") {
          cell.value = vc.headerTitle;
          cell.font = { name: "Tahoma", size: 8, italic: true, color: { argb: "FF92400E" } };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
          continue;
        }

        const pNum = vc.period!;
        if (pNum < skipUntilPeriod) continue;

        const matchingEntries = clsEntries.filter((e) => e.day === day && e.startPeriod === pNum);
        if (matchingEntries.length === 0) continue;
        const ent = matchingEntries[0];
        const duration = Math.max(...matchingEntries.map((e) => e.duration || 1));

        if (duration > 1) {
          const endPeriod = pNum + duration - 1;
          const endVisualIdx = visualCols.findIndex(
            (x) => x.kind === "period" && x.period === endPeriod
          );
          if (endVisualIdx > cIdx) {
            wsRooms.mergeCells(cRow, colNum, cRow, endVisualIdx + 2);
          }
          skipUntilPeriod = pNum + duration;
        }

        if (matchingEntries.length > 1) {
          cell.value = matchingEntries
            .map((mEnt) => {
              const mT = mEnt.teacherIds[0] ? teachersMap.get(mEnt.teacherIds[0]) : null;
              const tStr = mT ? ` (ครู${mT.firstName})` : "";
              const grpStr = mEnt.subgroupName ? `[${mEnt.subgroupName}] ` : "";
              return `${grpStr}${mEnt.title}${tStr}`;
            })
            .join("\n/ ");
          cell.font = { name: "Tahoma", size: 8 };
        } else if (ent.sourceType === "free_period") {
          cell.value = "คาบอิสระ";
          cell.font = { name: "Tahoma", size: 8, italic: true, color: { argb: "FF64748B" } };
        } else {
          // ข้อ 3: คาบทั้งโรงเรียน, คาบวิชาเลือก, คาบสอนหลายคน ไม่ต้องระบุชื่อครูในตารางนักเรียน ระบุเฉพาะวิชาที่สอนคนเดียว
          const sb = ent.syncBlockId ? syncMap.get(ent.syncBlockId) : undefined;
          const mappedTid = sb?.classroomTeacherMap?.[cls.id]?.[0] || ent.classroomTeacherMap?.[cls.id]?.[0];
          const mappedTeacher = mappedTid ? teachersMap.get(mappedTid) : undefined;
          const isSchoolSync = ent.sourceType === "sync_block";
          const sub = ent.subjectId ? subjectsMap.get(ent.subjectId) : undefined;
          const isElective = Boolean(
            ent.electiveScope?.length ||
            sub?.subjectType === "elective" ||
            ent.isJointClass ||
            ent.jointGroupId
          );
          const isSingleTeacher = ent.teacherIds.length === 1;
          const showTeacher = !isSchoolSync && !isElective && isSingleTeacher;
          const tName = showTeacher ? teachersMap.get(ent.teacherIds[0])?.firstName : null;

          const subInfo = ent.electiveScope?.length
            ? "วิชาเลือก"
            : isElective
            ? "วิชาเลือก"
            : mappedTeacher
            ? `ครู${mappedTeacher.firstName}`
            : isSchoolSync
            ? ""
            : tName
            ? `ครู${tName}`
            : ent.teacherIds.length > 1
            ? "สอนร่วม"
            : "";

          const rmCode = ent.roomId
            ? roomsMap.get(ent.roomId)?.code
            : defRm?.code;
          const subgroupPrefix = ent.subgroupName ? `[${ent.subgroupName}] ` : "";
          cell.value = `${ent.subjectCode || ""}\n${subgroupPrefix}${ent.title}\n${subInfo} ${rmCode ? `[${rmCode}]` : ""}`.trim();
          cell.font = { name: "Tahoma", size: 8 };
        }
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }

      cRow++;
    }
    cRow += 1;
  }

  wsRooms.getColumn(1).width = 14;
  visualCols.forEach((vc, idx) => {
    wsRooms.getColumn(idx + 2).width = vc.kind === "break" ? 9 : 16;
  });

  // ==================== SHEET 4: ตารางรวมทั้งโรงเรียน (Master Matrix) ====================
  const wsMaster = wb.addWorksheet("4.ตารางรวมทั้งโรงเรียน");
  wsMaster.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];

  const mRow1 = wsMaster.getRow(1);
  const mRow2 = wsMaster.getRow(2);
  mRow1.getCell(1).value = "ห้องเรียน";
  wsMaster.mergeCells(1, 1, 2, 1);
  mRow1.getCell(1).font = { name: "Tahoma", size: 10, bold: true };
  mRow1.getCell(1).alignment = { horizontal: "center", vertical: "middle" };

  const periodsSorted = [...dataset.term.periodsConfig].sort((a, b) => a.period - b.period);
  let colPtr = 2;
  for (const day of dataset.term.daysOfWeek) {
    const startCol = colPtr;
    for (const pc of periodsSorted) {
      const c2 = mRow2.getCell(colPtr);
      c2.value = `ค.${pc.period}`;
      c2.font = { name: "Tahoma", size: 8, bold: true };
      c2.alignment = { horizontal: "center", vertical: "middle" };
      c2.border = thinBorder;
      wsMaster.getColumn(colPtr).width = 11;
      colPtr++;
    }
    wsMaster.mergeCells(1, startCol, 1, colPtr - 1);
    const c1 = mRow1.getCell(startCol);
    c1.value = DAY_LABELS[day]?.full ?? day;
    c1.font = { name: "Tahoma", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    c1.alignment = { horizontal: "center", vertical: "middle" };
    c1.border = thinBorder;
  }

  sortClassrooms(dataset.classrooms).forEach((cls, rIdx) => {
    const row = wsMaster.getRow(rIdx + 3);
    row.height = 28;
    row.getCell(1).value = cls.name;
    row.getCell(1).font = { name: "Tahoma", size: 9, bold: true };
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(1).border = thinBorder;

    const clsEnts = versionEntries.filter((e) => e.classroomIds.includes(cls.id));
    let ptr = 2;
    for (const day of dataset.term.daysOfWeek) {
      for (const pc of periodsSorted) {
        const active = clsEnts.find(
          (e) => e.day === day && pc.period >= e.startPeriod && pc.period < e.startPeriod + e.duration
        );
        const cell = row.getCell(ptr++);
        cell.border = thinBorder;
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.font = { name: "Tahoma", size: 8 };
        if (active) {
          cell.value =
            active.sourceType === "free_period"
              ? "อิสระ"
              : `${active.subjectCode || active.title}`;
        }
      }
    }
  });
  wsMaster.getColumn(1).width = 12;

  return await wb.xlsx.writeBuffer();
}

/**
 * สร้างเทมเพลต Excel สำหรับนำเข้าแผนการสอนรายห้อง (ช่วยให้ครูแต่ละกลุ่มสาระกรอกใน Excel แล้วอัปโหลดได้ทันที)
 */
export async function generateAssignmentImportTemplateBuffer(
  dataset: SchoolDataset
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("นำเข้าแผนการสอน");

  const headers = [
    "ชื่อห้องเรียน (เช่น ม.1/1)",
    "รหัสวิชา (เช่น ค21101)",
    "รูปแบบคาบ (เช่น 2,1,1 หรือ 1,1,1)",
    "รหัสครูผู้สอน (คั่นด้วย , กรณีสอนร่วม เช่น EN01,EN03)",
    "รหัสห้องเรียนพิเศษ (เว้นว่าง = ใช้ห้องนักเรียน)",
    "หมายเหตุ",
  ];
  const hr = ws.getRow(1);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    ws.getColumn(i + 1).width = 28;
  });
  hr.height = 24;

  // ใส่ตัวอย่าง 3 แถวจากข้อมูลปัจจุบัน
  const clsMap = new Map(dataset.classrooms.map((c) => [c.id, c]));
  const subMap = new Map(dataset.subjects.map((s) => [s.id, s]));
  const tMap = new Map(dataset.teachers.map((t) => [t.id, t]));
  const rmMap = new Map(dataset.rooms.map((r) => [r.id, r]));

  dataset.teachingAssignments.slice(0, 5).forEach((a, idx) => {
    const r = ws.getRow(idx + 2);
    r.getCell(1).value = clsMap.get(a.classroomId)?.name ?? "";
    r.getCell(2).value = subMap.get(a.subjectId)?.code ?? "";
    r.getCell(3).value = a.splitSessions.map((s) => s.duration).join(",");
    r.getCell(4).value = a.teacherIds.map((tid) => tMap.get(tid)?.code ?? "").filter(Boolean).join(",");
    const firstSpecialRm = a.splitSessions.find((s) => s.roomId)?.roomId;
    r.getCell(5).value = firstSpecialRm ? rmMap.get(firstSpecialRm)?.code ?? "" : "";
    r.getCell(6).value = a.notes ?? "";
  });

  return await wb.xlsx.writeBuffer();
}
