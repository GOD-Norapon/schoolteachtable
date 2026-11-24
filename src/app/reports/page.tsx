"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Printer,
  Users,
  Wand2,
} from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";
import { DAY_LABELS, SchoolDataset } from "@/types/timetable";
import {
  getTeacherFullName,
  resolveEntryPhysicalRooms,
  sortClassrooms,
} from "@/lib/solver/validator";
import {
  generateFullTimetableExcelBuffer,
  getTeacherScheduleAndSummary,
} from "@/lib/excel/exporter";
import { SearchableTeacherSelect } from "@/components/SearchableTeacherSelect";

type ReportTab = "teacher" | "classroom" | "room" | "workload_summary";
type TeacherScope = "single" | "department" | "all";
type ClassroomScope = "single" | "grade" | "all";
type RoomScope = "single" | "all_special";

interface PrintVisualColumn {
  kind: "period" | "break";
  period?: number;
  label: string;
  timeRange: string;
}

function buildPrintVisualColumns(dataset: SchoolDataset): PrintVisualColumn[] {
  const cols: PrintVisualColumn[] = [];
  const sorted = [...dataset.term.periodsConfig].sort((a, b) => a.period - b.period);
  for (const pc of sorted) {
    cols.push({
      kind: "period",
      period: pc.period,
      label: pc.label,
      timeRange: `${pc.startTime}–${pc.endTime}`,
    });
    const brk = dataset.term.breaksConfig.find((b) => b.afterPeriod === pc.period);
    if (brk) {
      cols.push({
        kind: "break",
        label: brk.durationMinutes <= 25 ? `พัก ${brk.durationMinutes}น.` : "พักเที่ยง",
        timeRange: brk.label,
      });
    }
  }
  return cols;
}

const CATEGORY_BADGES: Record<
  "teaching" | "elective" | "advisor" | "activity" | "meeting",
  string
> = {
  teaching: "วิชาการ",
  elective: "วิชาเลือก",
  advisor: "ที่ปรึกษา",
  activity: "กิจกรรม",
  meeting: "ประชุมฝ่าย",
};

export default function ReportsPage() {
  const {
    dataset,
    activeVersionId,
    setActiveVersionId,
    activeVersionEntries,
  } = useSchoolData();

  const [tab, setTab] = useState<ReportTab>("teacher");

  // Teacher filters
  const [teacherScope, setTeacherScope] = useState<TeacherScope>("single");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    () => dataset.teachers[0]?.id ?? ""
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    () => dataset.departments[0]?.id ?? ""
  );

  // Classroom filters
  const [classroomScope, setClassroomScope] = useState<ClassroomScope>("single");
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(
    () => dataset.classrooms[0]?.id ?? ""
  );
  const [selectedGradeId, setSelectedGradeId] = useState<string>(
    () => dataset.gradeLevels[0]?.id ?? ""
  );

  // Room filters
  const [roomScope, setRoomScope] = useState<RoomScope>("single");
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    () => dataset.rooms.find((r) => r.roomType !== "homeroom")?.id ?? dataset.rooms[0]?.id ?? ""
  );

  // Master workload department filter
  const [summaryDeptFilter, setSummaryDeptFilter] = useState<string>("ALL");

  // Print options
  const [showSignatures, setShowSignatures] = useState<boolean>(true);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);

  const visualCols = useMemo(() => buildPrintVisualColumns(dataset), [dataset]);
  const deptsMap = useMemo(
    () => new Map(dataset.departments.map((d) => [d.id, d])),
    [dataset.departments]
  );
  const classroomsMap = useMemo(
    () => new Map(dataset.classrooms.map((c) => [c.id, c])),
    [dataset.classrooms]
  );
  const teachersMap = useMemo(
    () => new Map(dataset.teachers.map((t) => [t.id, t])),
    [dataset.teachers]
  );
  const roomsMap = useMemo(
    () => new Map(dataset.rooms.map((r) => [r.id, r])),
    [dataset.rooms]
  );
  const subjectsMap = useMemo(
    () => new Map(dataset.subjects.map((s) => [s.id, s])),
    [dataset.subjects]
  );
  const syncBlocksMap = useMemo(
    () => new Map(dataset.synchronizedBlocks.map((b) => [b.id, b])),
    [dataset.synchronizedBlocks]
  );

  const scheduledLessonsCount = useMemo(
    () => activeVersionEntries.filter((e) => e.sourceType !== "free_period").length,
    [activeVersionEntries]
  );

  // Target teachers to render for print
  const targetTeachers = useMemo(() => {
    if (teacherScope === "single") {
      const found = dataset.teachers.find((t) => t.id === selectedTeacherId);
      return found ? [found] : dataset.teachers.slice(0, 1);
    }
    if (teacherScope === "department") {
      return dataset.teachers.filter((t) => t.departmentId === selectedDeptId);
    }
    return dataset.teachers;
  }, [dataset.teachers, teacherScope, selectedTeacherId, selectedDeptId]);

  // Target classrooms to render for print
  const targetClassrooms = useMemo(() => {
    if (classroomScope === "single") {
      const found = dataset.classrooms.find((c) => c.id === selectedClassroomId);
      return found ? [found] : dataset.classrooms.slice(0, 1);
    }
    if (classroomScope === "grade") {
      return sortClassrooms(dataset.classrooms.filter((c) => c.gradeLevelId === selectedGradeId));
    }
    return sortClassrooms(dataset.classrooms);
  }, [dataset.classrooms, classroomScope, selectedClassroomId, selectedGradeId]);

  // Target physical rooms to render for print
  const targetRooms = useMemo(() => {
    if (roomScope === "single") {
      const found = dataset.rooms.find((r) => r.id === selectedRoomId);
      return found ? [found] : dataset.rooms.slice(0, 1);
    }
    return dataset.rooms.filter((r) => r.roomType !== "homeroom");
  }, [dataset.rooms, roomScope, selectedRoomId]);

  const handleDownloadExcel = async () => {
    setExportingExcel(true);
    try {
      const buffer = await generateFullTimetableExcelBuffer(dataset, activeVersionId);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeSchool = dataset.term.schoolName.replace(/\s+/g, "_");
      a.href = url;
      a.download = `ตารางสอน_${safeSchool}_เทอม${dataset.term.semester}_${dataset.term.academicYear}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Control Header & Filters (Hidden when printing) */}
      <div className="no-print bg-white rounded-xl border border-slate-200 p-4 lg:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600" />
              พิมพ์ตารางสอนรายคนพร้อมสรุปจำนวนคาบ & ส่งออกไฟล์ Excel
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              จัดหน้ากระดาษมาตรฐาน A4 แนวนอนอัตโนมัติ (1 คนต่อ 1 หน้า พร้อมตารางสรุปรายวิชาและยอดคาบแยกประเภท)
              และส่งออกไฟล์ Excel (.xlsx) ครบ 4 แผ่นงาน
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeVersionId}
              onChange={(e) => setActiveVersionId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold bg-slate-50"
            >
              {dataset.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  ข้อมูลจาก: {v.name} {v.status === "published" ? "⭐" : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={exportingExcel}
              onClick={handleDownloadExcel}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exportingExcel ? "กำลังสร้างไฟล์ Excel..." : "ส่งออกไฟล์ Excel (.xlsx)"}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
            >
              <Printer className="w-4 h-4" />
              สั่งพิมพ์ / บันทึก PDF (A4 แนวนอน)
            </button>
          </div>
        </div>

        {scheduledLessonsCount === 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
            <span>
              ร่างตารางสอนปัจจุบันยังไม่มีการจัดวางคาบเรียน กรุณากดจัดตารางสอนก่อนสั่งพิมพ์
            </span>
            <Link
              href="/scheduler"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
            >
              <Wand2 className="w-3.5 h-3.5" /> ไปหน้าจัดตารางสอน
            </Link>
          </div>
        )}

        {/* Report Type Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTab("teacher")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                tab === "teacher"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <Users className="w-4 h-4" />
              1. ตารางสอนรายครู + สรุปจำนวนคาบ
            </button>
            <button
              type="button"
              onClick={() => setTab("classroom")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                tab === "classroom"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              2. ตารางเรียนรายห้องเรียน
            </button>
            <button
              type="button"
              onClick={() => setTab("room")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                tab === "room"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <Building2 className="w-4 h-4" />
              3. ตารางการใช้ห้องปฏิบัติการร่วม
            </button>
            <button
              type="button"
              onClick={() => setTab("workload_summary")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                tab === "workload_summary"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              4. ใบสรุปภาระงานครูทั้งโรงเรียน
            </button>
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showSignatures}
              onChange={(e) => setShowSignatures(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <span>แสดงช่องลงนามท้ายกระดาษ</span>
          </label>
        </div>

        {/* Sub-filters per Report Tab */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex flex-wrap items-center gap-3 text-xs">
          {tab === "teacher" && (
            <>
              <span className="font-semibold text-slate-700">ขอบเขตการพิมพ์ตารางครู:</span>
              <select
                value={teacherScope}
                onChange={(e) => setTeacherScope(e.target.value as TeacherScope)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-medium"
              >
                <option value="single">รายบุคคล (เลือกครู 1 ท่าน)</option>
                <option value="department">พิมพ์ทั้งกลุ่มสาระการเรียนรู้</option>
                <option value="all">
                  พิมพ์ครูทุกคนทั้งโรงเรียน ({dataset.teachers.length} หน้า A4)
                </option>
              </select>

              {teacherScope === "single" && (
                <div className="w-64">
                  <SearchableTeacherSelect
                    teachers={dataset.teachers}
                    departments={dataset.departments}
                    value={selectedTeacherId}
                    onChange={setSelectedTeacherId}
                    placeholder="-- ค้นหา/เลือกครู --"
                  />
                </div>
              )}

              {teacherScope === "department" && (
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-semibold"
                >
                  {dataset.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      กลุ่มสาระ{d.name}
                    </option>
                  ))}
                </select>
              )}

              <span className="text-slate-500 ml-auto">
                กำลังแสดงตัวอย่างก่อนพิมพ์ <strong>{targetTeachers.length}</strong> แผ่นงาน
              </span>
            </>
          )}

          {tab === "classroom" && (
            <>
              <span className="font-semibold text-slate-700">ขอบเขตการพิมพ์ตารางห้องเรียน:</span>
              <select
                value={classroomScope}
                onChange={(e) => setClassroomScope(e.target.value as ClassroomScope)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-medium"
              >
                <option value="single">เฉพาะห้องเรียนที่เลือก</option>
                <option value="grade">ทั้งระดับชั้น</option>
                <option value="all">
                  ทุกห้องเรียนทั้งโรงเรียน ({dataset.classrooms.length} หน้า A4)
                </option>
              </select>

              {classroomScope === "single" && (
                <select
                  value={selectedClassroomId}
                  onChange={(e) => setSelectedClassroomId(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-semibold"
                >
                  {dataset.gradeLevels.map((g) => {
                    const rooms = sortClassrooms(
                      dataset.classrooms.filter((c) => c.gradeLevelId === g.id)
                    );
                    if (rooms.length === 0) return null;
                    return (
                      <optgroup key={g.id} label={`ระดับชั้น ${g.name}`}>
                        {rooms.map((c) => (
                          <option key={c.id} value={c.id}>
                            ห้อง {c.name} ({c.programName})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              )}

              {classroomScope === "grade" && (
                <select
                  value={selectedGradeId}
                  onChange={(e) => setSelectedGradeId(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-semibold"
                >
                  {dataset.gradeLevels.map((g) => (
                    <option key={g.id} value={g.id}>
                      ระดับชั้น {g.name}
                    </option>
                  ))}
                </select>
              )}

              <span className="text-slate-500 ml-auto">
                กำลังแสดงตัวอย่างก่อนพิมพ์ <strong>{targetClassrooms.length}</strong> แผ่นงาน
              </span>
            </>
          )}

          {tab === "room" && (
            <>
              <span className="font-semibold text-slate-700">ขอบเขตการพิมพ์ตารางสถานที่:</span>
              <select
                value={roomScope}
                onChange={(e) => setRoomScope(e.target.value as RoomScope)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-medium"
              >
                <option value="single">เฉพาะห้องที่เลือก</option>
                <option value="all_special">ห้องปฏิบัติการ/ห้องพิเศษทั้งหมด</option>
              </select>

              {roomScope === "single" && (
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-semibold"
                >
                  {dataset.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          {tab === "workload_summary" && (
            <>
              <span className="font-semibold text-slate-700">กรองกลุ่มสาระการเรียนรู้:</span>
              <select
                value={summaryDeptFilter}
                onChange={(e) => setSummaryDeptFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-semibold"
              >
                <option value="ALL">ทุกกลุ่มสาระการเรียนรู้ ({dataset.teachers.length} ท่าน)</option>
                {dataset.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    กลุ่มสาระ{d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="ml-auto inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                ดาวน์โหลดตารางสรุปนี้เป็น Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* ==================== PRINTABLE PAGES CONTAINER ==================== */}
      <div className="space-y-6 print:space-y-0">
        {/* MODE 1: INDIVIDUAL TEACHER TIMETABLE + PERIOD SUMMARY (ข้อ 16, 20) */}
        {tab === "teacher" &&
          targetTeachers.map((teacher) => {
            const dept = deptsMap.get(teacher.departmentId);
            const advisedClassrooms = dataset.classrooms
              .filter((c) => c.advisorTeacherIds.includes(teacher.id))
              .map((c) => c.name)
              .join(", ");
            const scheduleInfo = getTeacherScheduleAndSummary(
              teacher.id,
              activeVersionEntries,
              dataset
            );

            return (
              <section
                key={teacher.id}
                className="print-page bg-white rounded-xl border border-slate-300 shadow-sm p-6 space-y-3 text-slate-900"
              >
                {/* Official School Document Header */}
                <div className="border-b-2 border-slate-800 pb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="text-base font-bold text-slate-950">
                      ตารางสอนรายบุคคล — {dataset.term.schoolName}
                    </div>
                    <div className="text-xs text-slate-700">
                      {dataset.term.name} (ภาคเรียนที่ {dataset.term.semester} ปีการศึกษา{" "}
                      {dataset.term.academicYear})
                    </div>
                  </div>
                  <div className="text-right text-xs space-y-0.5">
                    <div className="font-bold text-sm">
                      {getTeacherFullName(teacher)}
                    </div>
                    <div className="text-slate-700">
                      กลุ่มสาระ: <strong>{dept?.name ?? "-"}</strong> | ครูที่ปรึกษา:{" "}
                      <strong>{advisedClassrooms || "-"}</strong>
                    </div>
                  </div>
                </div>

                {/* Main Weekly Timetable Table */}
                <table className="w-full border-collapse border border-slate-500 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-500 p-1.5 w-20 text-center font-bold">
                        วัน / คาบ
                      </th>
                      {visualCols.map((vc, idx) => (
                        <th
                          key={idx}
                          className={`border border-slate-500 p-1 text-center ${
                            vc.kind === "break" ? "bg-slate-50 w-12" : ""
                          }`}
                        >
                          <div className="font-bold leading-tight">{vc.label}</div>
                          <div className="text-[9px] font-normal text-slate-600">
                            {vc.timeRange}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.term.daysOfWeek.map((day) => {
                      let skipUntilColIdx = -1;
                      return (
                        <tr key={day}>
                          <td className="border border-slate-500 p-1.5 font-bold text-center bg-slate-50 whitespace-nowrap">
                            {DAY_LABELS[day]?.full}
                          </td>
                          {visualCols.map((vc, cIdx) => {
                            if (cIdx < skipUntilColIdx) return null;

                            if (vc.kind === "break") {
                              return (
                                <td
                                  key={`pbrk-${day}-${cIdx}`}
                                  className="border border-slate-500 bg-slate-50/80 text-center text-[9px] text-slate-600 px-0.5"
                                >
                                  {vc.label}
                                </td>
                              );
                            }

                            const pNum = vc.period!;
                            const formatted = scheduleInfo.formatCellForTeacher(day, pNum);
                            if (!formatted) {
                              return (
                                <td
                                  key={`pcell-${day}-${pNum}`}
                                  className="border border-slate-500 h-12 text-center text-slate-300"
                                >
                                  -
                                </td>
                              );
                            }

                            const endPeriod = pNum + formatted.span - 1;
                            const endColIdx =
                              formatted.span > 1
                                ? visualCols.findIndex(
                                    (x) => x.kind === "period" && x.period === endPeriod
                                  )
                                : cIdx;
                            const colSpan = endColIdx >= cIdx ? endColIdx - cIdx + 1 : 1;
                            if (colSpan > 1) skipUntilColIdx = cIdx + colSpan;

                            const isDual = formatted.text.includes("─────────");
                            if (isDual) {
                              const parts = formatted.text.split("─────────").map((p) => p.trim());
                              return (
                                <td
                                  key={`pcell-${day}-${pNum}`}
                                  colSpan={colSpan}
                                  className="border border-slate-500 p-1 h-14 text-center align-middle bg-slate-50/60"
                                >
                                  <div className="flex flex-col gap-1">
                                    <div className="bg-amber-100/80 border border-amber-300/90 rounded px-1 py-0.5 text-[9px] leading-tight text-amber-950 font-semibold whitespace-pre-line text-left">
                                      {parts[0]}
                                    </div>
                                    <div className="bg-sky-100/80 border border-sky-300/90 rounded px-1 py-0.5 text-[9px] leading-tight text-sky-950 font-semibold whitespace-pre-line text-left">
                                      {parts[1]}
                                    </div>
                                  </div>
                                </td>
                              );
                            }

                            const lines = formatted.text.split("\n");
                            return (
                              <td
                                key={`pcell-${day}-${pNum}`}
                                colSpan={colSpan}
                                className="border border-slate-500 p-1 h-12 text-center align-middle bg-slate-50/40"
                              >
                                <div className="font-bold text-[10.5px] leading-tight">
                                  {lines[0]}
                                </div>
                                {lines[1] && (
                                  <div className="text-[10px] leading-tight text-slate-800">
                                    {lines[1]}
                                  </div>
                                )}
                                {lines[2] && (
                                  <div className="text-[9.5px] font-semibold text-slate-700 leading-tight mt-0.5">
                                    {lines[2]}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Bottom Split: Course Breakdown + Period Count Summary (ข้อ 20) */}
                <div className="grid grid-cols-12 gap-4 pt-1 items-start">
                  {/* Course & Activity Detail Table */}
                  <div className="col-span-8">
                    <div className="text-[11px] font-bold mb-1 text-slate-900">
                      สรุปรายวิชาที่สอนและกิจกรรมที่ปฏิบัติ ({scheduleInfo.summaryRows.length} รายการ)
                    </div>
                    <table className="w-full border-collapse border border-slate-400 text-[10px]">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-slate-400 px-1.5 py-1 w-8 text-center">
                            ที่
                          </th>
                          <th className="border border-slate-400 px-2 py-1 w-20 text-left">
                            รหัส
                          </th>
                          <th className="border border-slate-400 px-2 py-1 text-left">
                            ชื่อรายวิชา / กิจกรรม
                          </th>
                          <th className="border border-slate-400 px-2 py-1 w-28 text-center">
                            ชั้น / ห้อง
                          </th>
                          <th className="border border-slate-400 px-1.5 py-1 w-16 text-center">
                            ประเภท
                          </th>
                          <th className="border border-slate-400 px-1.5 py-1 w-16 text-center">
                            คาบ/สัปดาห์
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleInfo.summaryRows.map((row, idx) => (
                          <tr key={idx}>
                            <td className="border border-slate-400 px-1.5 py-0.5 text-center">
                              {idx + 1}
                            </td>
                            <td className="border border-slate-400 px-2 py-0.5 font-semibold">
                              {row.code}
                            </td>
                            <td className="border border-slate-400 px-2 py-0.5">{row.title}</td>
                            <td className="border border-slate-400 px-2 py-0.5 text-center">
                              {row.targetRooms}
                            </td>
                            <td className="border border-slate-400 px-1.5 py-0.5 text-center">
                              {CATEGORY_BADGES[row.category]}
                            </td>
                            <td className="border border-slate-400 px-1.5 py-0.5 text-center font-bold">
                              {row.periods}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Period Summary Box */}
                  <div className="col-span-4 space-y-2">
                    <div className="border border-slate-500 rounded p-2.5 text-[10.5px] space-y-1 bg-slate-50/50">
                      <div className="font-bold border-b border-slate-300 pb-1 mb-1 text-slate-950">
                        สรุปจำนวนคาบปฏิบัติงานรายสัปดาห์
                      </div>
                      <div className="flex justify-between">
                        <span>1. คาบสอนรายวิชาพื้นฐาน/เพิ่มเติม:</span>
                        <strong>{scheduleInfo.totals.teachingTotal} คาบ</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>2. คาบสอนวิชาเลือกเสรี:</span>
                        <strong>{scheduleInfo.totals.electiveTotal} คาบ</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>3. คาบครูที่ปรึกษา (คุณธรรม/Homeroom):</span>
                        <strong>{scheduleInfo.totals.advisorTotal} คาบ</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>4. คาบกิจกรรม (ลูกเสือ/ชุมนุม/นศท.):</span>
                        <strong>{scheduleInfo.totals.activityTotal} คาบ</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>5. คาบประชุมฝ่าย / กลุ่มสาระ:</span>
                        <strong>{scheduleInfo.totals.meetingTotal} คาบ</strong>
                      </div>
                      <div className="flex justify-between border-t border-slate-400 pt-1 mt-1 text-xs font-bold text-blue-900">
                        <span>รวมคาบสอนจริง (ข้อ 2):</span>
                        <span>{scheduleInfo.totals.totalTeaching} คาบ/สัปดาห์</span>
                      </div>
                      {scheduleInfo.totals.meetingTotal > 0 && (
                        <div className="flex justify-between text-[10px] text-amber-800">
                          <span>+ คาบประชุมฝ่าย:</span>
                          <span>{scheduleInfo.totals.meetingTotal} คาบ (ไม่นับเป็นคาบสอน)</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[10px] text-slate-600">
                        <span>จำนวนวันที่สอนคาบท้ายวัน (คาบ 8):</span>
                        <span>{scheduleInfo.totals.lateDaysCount} วัน/สัปดาห์</span>
                      </div>
                    </div>

                    {showSignatures && (
                      <div className="grid grid-cols-2 gap-2 pt-3 text-[10px] text-center text-slate-700">
                        <div className="space-y-4">
                          <div>ลงชื่อ........................................</div>
                          <div>({getTeacherFullName(teacher)})</div>
                        </div>
                        <div className="space-y-4">
                          <div>ลงชื่อ........................................</div>
                          <div>(รองผู้อำนวยการฝ่ายวิชาการ)</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

        {/* MODE 2: STUDENT CLASSROOM TIMETABLE */}
        {tab === "classroom" &&
          targetClassrooms.map((cls) => {
            const defRoom = cls.defaultRoomId ? roomsMap.get(cls.defaultRoomId) : undefined;
            const advisors = cls.advisorTeacherIds
              .map((tid) => teachersMap.get(tid))
              .filter(Boolean)
              .map((t) => getTeacherFullName(t!))
              .join(", ");
            const clsEntries = activeVersionEntries.filter((e) =>
              e.classroomIds.includes(cls.id)
            );

            return (
              <section
                key={cls.id}
                className="print-page bg-white rounded-xl border border-slate-300 shadow-sm p-6 space-y-4 text-slate-900"
              >
                <div className="border-b-2 border-slate-800 pb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="text-base font-bold text-slate-950">
                      ตารางเรียนประจำห้อง {cls.name} ({cls.programName})
                    </div>
                    <div className="text-xs text-slate-700">
                      {dataset.term.schoolName} — {dataset.term.name}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div>
                      ห้องเรียนประจำชั้น: <strong>{defRoom?.code ?? "-"}</strong> (
                      {defRoom?.name ?? "ไม่ระบุ"})
                    </div>
                    <div>
                      ครูที่ปรึกษา: <strong>{advisors || "-"}</strong>
                    </div>
                  </div>
                </div>

                <table className="w-full border-collapse border border-slate-500 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-500 p-2 w-24 text-center font-bold">
                        วัน / คาบ
                      </th>
                      {visualCols.map((vc, idx) => (
                        <th
                          key={idx}
                          className={`border border-slate-500 p-1.5 text-center ${
                            vc.kind === "break" ? "bg-slate-50 w-12" : ""
                          }`}
                        >
                          <div className="font-bold">{vc.label}</div>
                          <div className="text-[9.5px] font-normal text-slate-600">
                            {vc.timeRange}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.term.daysOfWeek.map((day) => {
                      let skipUntilColIdx = -1;
                      return (
                        <tr key={day}>
                          <td className="border border-slate-500 p-2 font-bold text-center bg-slate-50 whitespace-nowrap">
                            {DAY_LABELS[day]?.full}
                          </td>
                          {visualCols.map((vc, cIdx) => {
                            if (cIdx < skipUntilColIdx) return null;

                            if (vc.kind === "break") {
                              return (
                                <td
                                  key={`cbrk-${day}-${cIdx}`}
                                  className="border border-slate-500 bg-slate-50 text-center text-[9.5px] text-slate-600 px-1"
                                >
                                  {vc.label}
                                </td>
                              );
                            }

                            const pNum = vc.period!;
                            const matchingEntries = clsEntries.filter(
                              (e) => e.day === day && e.startPeriod === pNum
                            );
                            const ent = matchingEntries[0];
                            const periodSpan = matchingEntries.length > 0
                              ? Math.max(...matchingEntries.map((e) => (e.duration || 1)))
                              : 1;
                            const endPeriod = pNum + periodSpan - 1;
                            const endColIdx =
                              periodSpan > 1
                                ? visualCols.findIndex(
                                    (x) => x.kind === "period" && x.period === endPeriod
                                  )
                                : cIdx;
                            const colSpan = endColIdx >= cIdx ? endColIdx - cIdx + 1 : 1;
                            if (colSpan > 1) skipUntilColIdx = cIdx + colSpan;

                            if (!ent || ent.sourceType === "free_period") {
                              return (
                                <td
                                  key={`ccell-${day}-${pNum}`}
                                  colSpan={colSpan}
                                  className="border border-slate-500 h-14 text-center text-slate-400 italic text-[10.5px]"
                                >
                                  คาบอิสระ
                                </td>
                              );
                            }

                            if (matchingEntries.length > 1) {
                              return (
                                <td
                                  key={`ccell-${day}-${pNum}`}
                                  colSpan={colSpan}
                                  className="border border-slate-500 p-1 h-14 text-center align-middle"
                                >
                                  <div className="flex flex-col gap-1">
                                    {matchingEntries.map((mEnt, mIdx) => {
                                      const mSub = mEnt.subjectId ? subjectsMap.get(mEnt.subjectId) : undefined;
                                      const mT = mEnt.teacherIds[0] ? teachersMap.get(mEnt.teacherIds[0]) : null;
                                      return (
                                        <div
                                          key={mEnt.id}
                                          className={`text-[9.5px] leading-tight pb-0.5 ${
                                            mIdx > 0 ? "border-t border-slate-300 pt-0.5" : ""
                                          }`}
                                        >
                                          <span className="font-bold text-[8.5px] px-1 rounded bg-slate-100 border border-slate-300 mr-1">
                                            {mEnt.subgroupName || `กลุ่ม ${mIdx + 1}`}
                                          </span>
                                          <span className="font-bold text-slate-900">
                                            {mSub?.shortName || mEnt.title}
                                          </span>
                                          {mT && (
                                            <span className="text-slate-600 ml-1">
                                              ({mT.firstName})
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            }

                            const sb = ent.syncBlockId ? syncBlocksMap.get(ent.syncBlockId) : undefined;
                            const mappedTid = sb?.classroomTeacherMap?.[cls.id]?.[0] || ent.classroomTeacherMap?.[cls.id]?.[0];
                            const mappedTeacher = mappedTid ? teachersMap.get(mappedTid) : undefined;
                            const sub = ent.subjectId ? subjectsMap.get(ent.subjectId) : undefined;
                            const isSchoolSync = ent.sourceType === "sync_block";
                            const isElective = Boolean(
                              ent.electiveScope?.length ||
                              sub?.subjectType === "elective" ||
                              ent.isJointClass ||
                              ent.jointGroupId
                            );
                            const isSingleTeacher = ent.teacherIds.length === 1;
                            const showTeacher = !isSchoolSync && !isElective && isSingleTeacher;
                            const tName = showTeacher ? teachersMap.get(ent.teacherIds[0])?.firstName : null;

                            const subDetail = ent.electiveScope?.length
                              ? `กลุ่มวิชาเลือก (${ent.electiveScope.length} วิชา)`
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
                              : defRoom?.code;

                            return (
                              <td
                                key={`ccell-${day}-${pNum}`}
                                colSpan={colSpan}
                                className="border border-slate-500 p-1.5 h-14 text-center align-middle"
                              >
                                <div className="font-bold text-[11px] leading-tight">
                                  {ent.subjectCode ? `${ent.subjectCode} ` : ""}
                                  {sub?.shortName || ent.title}
                                </div>
                                {subDetail && (
                                  <div className="text-[10px] text-slate-700 leading-tight mt-0.5">
                                    {subDetail}
                                  </div>
                                )}
                                {rmCode && (
                                  <div className="text-[9.5px] font-semibold text-slate-600">
                                    [{rmCode}]
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {showSignatures && (
                  <div className="flex justify-between items-center pt-4 text-xs text-slate-700 px-8">
                    <div className="text-center space-y-4">
                      <div>ลงชื่อ........................................................ครูที่ปรึกษา</div>
                      <div>({advisors || "........................................................"})</div>
                    </div>
                    <div className="text-center space-y-4">
                      <div>ลงชื่อ........................................................รองผู้อำนวยการฝ่ายวิชาการ</div>
                      <div>(........................................................)</div>
                    </div>
                  </div>
                )}
              </section>
            );
          })}

        {/* MODE 3: SHARED PHYSICAL ROOM / LAB TIMETABLE */}
        {tab === "room" &&
          targetRooms.map((room) => {
            const roomEntries = activeVersionEntries.filter(
              (e) =>
                e.sourceType !== "free_period" &&
                resolveEntryPhysicalRooms(e, classroomsMap, syncBlocksMap).includes(room.id)
            );

            return (
              <section
                key={room.id}
                className="print-page bg-white rounded-xl border border-slate-300 shadow-sm p-6 space-y-4 text-slate-900"
              >
                <div className="border-b-2 border-slate-800 pb-2 flex items-end justify-between">
                  <div>
                    <div className="text-base font-bold">
                      ตารางการใช้ห้องปฏิบัติการ / ห้องเรียนร่วม: {room.code} — {room.name}
                    </div>
                    <div className="text-xs text-slate-700">
                      อาคาร: {room.building} | {dataset.term.schoolName} ({dataset.term.name})
                    </div>
                  </div>
                  <div className="text-xs font-semibold">
                    รวมใช้งานทั้งสิ้น {roomEntries.reduce((s, e) => s + e.duration, 0)} คาบ/สัปดาห์
                  </div>
                </div>

                <table className="w-full border-collapse border border-slate-500 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-500 p-2 w-24 text-center font-bold">
                        วัน / คาบ
                      </th>
                      {visualCols.map((vc, idx) => (
                        <th
                          key={idx}
                          className={`border border-slate-500 p-1.5 text-center ${
                            vc.kind === "break" ? "bg-slate-50 w-12" : ""
                          }`}
                        >
                          <div className="font-bold">{vc.label}</div>
                          <div className="text-[9.5px] font-normal">{vc.timeRange}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.term.daysOfWeek.map((day) => {
                      let skipUntilColIdx = -1;
                      return (
                        <tr key={day}>
                          <td className="border border-slate-500 p-2 font-bold text-center bg-slate-50">
                            {DAY_LABELS[day]?.full}
                          </td>
                          {visualCols.map((vc, cIdx) => {
                            if (cIdx < skipUntilColIdx) return null;
                            if (vc.kind === "break") {
                              return (
                                <td
                                  key={`rmbrk-${day}-${cIdx}`}
                                  className="border border-slate-500 bg-slate-50 text-center text-[9.5px]"
                                >
                                  {vc.label}
                                </td>
                              );
                            }
                            const pNum = vc.period!;
                            const ent = roomEntries.find(
                              (e) => e.day === day && e.startPeriod === pNum
                            );
                            const periodSpan = ent ? ent.duration : 1;
                            const endPeriod = pNum + periodSpan - 1;
                            const endColIdx =
                              periodSpan > 1
                                ? visualCols.findIndex(
                                    (x) => x.kind === "period" && x.period === endPeriod
                                  )
                                : cIdx;
                            const colSpan = endColIdx >= cIdx ? endColIdx - cIdx + 1 : 1;
                            if (colSpan > 1) skipUntilColIdx = cIdx + colSpan;

                            if (!ent) {
                              return (
                                <td
                                  key={`rmcell-${day}-${pNum}`}
                                  className="border border-slate-500 h-14 text-center text-slate-300"
                                >
                                  ว่าง
                                </td>
                              );
                            }

                            const tNames = ent.teacherIds
                              .map((tid) => teachersMap.get(tid)?.firstName)
                              .filter(Boolean)
                              .join(", ");

                            return (
                              <td
                                key={`rmcell-${day}-${pNum}`}
                                colSpan={colSpan}
                                className="border border-slate-500 p-1.5 h-14 text-center align-middle bg-slate-50/40"
                              >
                                <div className="font-bold text-[10.5px]">{ent.title}</div>
                                <div className="text-[10px]">
                                  ห้อง:{" "}
                                  {ent.classroomIds
                                    .map((cid) => classroomsMap.get(cid)?.name ?? cid)
                                    .join(", ")}
                                </div>
                                {tNames && (
                                  <div className="text-[9.5px] text-slate-700">ครู{tNames}</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}

        {/* MODE 4: MASTER WORKLOAD SUMMARY REPORT FOR ALL TEACHERS (ข้อ 20) */}
        {tab === "workload_summary" && (
          <section className="print-page bg-white rounded-xl border border-slate-300 shadow-sm p-6 space-y-4 text-slate-900">
            <div className="border-b-2 border-slate-800 pb-2 flex items-end justify-between">
              <div>
                <div className="text-base font-bold">
                  แบบสรุปจำนวนคาบปฏิบัติงานของครูผู้สอน — {dataset.term.schoolName}
                </div>
                <div className="text-xs text-slate-700">
                  {dataset.term.name} (ภาคเรียนที่ {dataset.term.semester} ปีการศึกษา{" "}
                  {dataset.term.academicYear})
                </div>
              </div>
              <div className="text-xs font-semibold">
                พิมพ์เมื่อ: {new Date().toLocaleDateString("th-TH")}
              </div>
            </div>

            <table className="w-full border-collapse border border-slate-500 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-500 p-2 w-10 text-center">ที่</th>
                  <th className="border border-slate-500 p-2 w-16 text-center">รหัส</th>
                  <th className="border border-slate-500 p-2 text-left">ชื่อ - นามสกุล</th>
                  <th className="border border-slate-500 p-2 text-left">กลุ่มสาระการเรียนรู้</th>
                  <th className="border border-slate-500 p-2 text-center">ที่ปรึกษา</th>
                  <th className="border border-slate-500 p-2 text-center">สอนวิชาการ</th>
                  <th className="border border-slate-500 p-2 text-center">วิชาเลือก</th>
                  <th className="border border-slate-500 p-2 text-center">คุณธรรม/HR</th>
                  <th className="border border-slate-500 p-2 text-center">กิจกรรม</th>
                  <th className="border border-slate-500 p-2 text-center">ประชุมฝ่าย</th>
                  <th className="border border-slate-500 p-2 text-center font-bold bg-blue-100 text-blue-900">
                    รวมคาบสอน (ไม่รวมประชุม)
                  </th>
                  <th className="border border-slate-500 p-2 text-center">วันสอนคาบ 8</th>
                </tr>
              </thead>
              <tbody>
                {dataset.teachers
                  .filter(
                    (t) => summaryDeptFilter === "ALL" || t.departmentId === summaryDeptFilter
                  )
                  .map((t, idx) => {
                    const info = getTeacherScheduleAndSummary(
                      t.id,
                      activeVersionEntries,
                      dataset
                    );
                    const advised = dataset.classrooms
                      .filter((c) => c.advisorTeacherIds.includes(t.id))
                      .map((c) => c.name)
                      .join(", ");
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="border border-slate-500 p-1.5 text-center">{idx + 1}</td>
                        <td className="border border-slate-500 p-1.5 text-center font-mono">
                          {t.code}
                        </td>
                        <td className="border border-slate-500 p-1.5 font-semibold">
                          {getTeacherFullName(t)}
                        </td>
                        <td className="border border-slate-500 p-1.5">
                          {deptsMap.get(t.departmentId)?.name ?? "-"}
                        </td>
                        <td className="border border-slate-500 p-1.5 text-center">
                          {advised || "-"}
                        </td>
                        <td className="border border-slate-500 p-1.5 text-center">
                          {info.totals.teachingTotal}
                        </td>
                        <td className="border border-slate-500 p-1.5 text-center">
                          {info.totals.electiveTotal}
                        </td>
                        <td className="border border-slate-500 p-1.5 text-center">
                          {info.totals.advisorTotal}
                        </td>
                        <td className="border border-slate-500 p-1.5 text-center">
                          {info.totals.activityTotal}
                        </td>
                        <td className="border border-slate-500 p-1.5 text-center">
                          {info.totals.meetingTotal}
                        </td>
                        <td className="border border-slate-500 p-1.5 text-center font-bold bg-blue-50 text-blue-950">
                          {info.totals.totalTeaching}
                        </td>
                        <td className="border border-slate-500 p-1.5 text-center">
                          {info.totals.lateDaysCount} วัน
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
