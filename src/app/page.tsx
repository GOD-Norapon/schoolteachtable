"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ShieldAlert,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";
import { sortClassrooms } from "@/lib/solver/validator";

export default function ReadinessDashboardPage() {
  const {
    dataset,
    readinessReport,
    toggleDepartmentCompleted,
    upsertClassroom,
  } = useSchoolData();

  const [gradeFilterTab, setGradeFilterTab] = useState<string>("ALL");

  const balancedRoomsCount = readinessReport.classroomAudits.filter((c) => c.delta === 0).length;
  const totalRoomsCount = readinessReport.classroomAudits.length;
  const completedDeptsCount = dataset.departments.filter((d) => d.isEntryCompleted).length;
  const errorIssues = readinessReport.issues.filter((i) => i.severity === "error");
  const warningIssues = readinessReport.issues.filter((i) => i.severity === "warning");

  const handleAutoFillFreePeriods = (classroomId: string, neededFree: number) => {
    const cls = dataset.classrooms.find((c) => c.id === classroomId);
    if (!cls) return;
    upsertClassroom({
      ...cls,
      freePeriodsCount: Math.max(0, cls.freePeriodsCount + neededFree),
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
            <ClipboardCheck className="w-3.5 h-3.5" />
            ศูนย์ตรวจสอบความครบถ้วนก่อนกดจัดตารางสอน
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            ตรวจสอบยอดคาบรายห้องเรียน & สถานะการลงข้อมูลแต่ละกลุ่มสาระ
          </h1>
          <p className="text-sm text-slate-600">
            เมื่อครูแต่ละกลุ่มสาระช่วยกันลงคาบสอนและเงื่อนไขครบแล้ว ให้ตรวจเช็คว่ายอดคาบของทุกห้องรวมเป็น{" "}
            <strong>{readinessReport.totalSlotsPerWeek} คาบ/สัปดาห์</strong> พอดี ก่อนกดจัดตารางสอนอัตโนมัติ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            href="/assignments"
            className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition"
          >
            ไปหน้าลงคาบสอนรายห้อง
          </Link>
          <Link
            href="/scheduler"
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm transition ${
              readinessReport.canRunSolver && readinessReport.isAllRoomsBalanced
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>ไปหน้าจัดตารางสอน & ปรับแก้รายกรณี</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500">ความสมดุลยอดคาบรายห้อง</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {balancedRoomsCount} / {totalRoomsCount}
            </span>
            <span className="text-xs text-slate-500">ห้องครบ {readinessReport.totalSlotsPerWeek} คาบ</span>
          </div>
          <div className="mt-2 text-xs">
            {readinessReport.isAllRoomsBalanced ? (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ทุกห้องมียอดคาบครบพอดีเป๊ะ
              </span>
            ) : (
              <span className="text-amber-600 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> มีห้องที่คาบขาดหรือเกินอยู่
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500">การยืนยันข้อมูลจากกลุ่มสาระ</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {completedDeptsCount} / {dataset.departments.length}
            </span>
            <span className="text-xs text-slate-500">กลุ่มสาระยืนยันแล้ว</span>
          </div>
          <div className="mt-2 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all"
              style={{
                width: `${
                  dataset.departments.length
                    ? (completedDeptsCount / dataset.departments.length) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500">จำนวนครู & แผนการสอนที่คีย์แล้ว</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {dataset.teachingAssignments.length}
            </span>
            <span className="text-xs text-slate-500">
              รายการสอน ({dataset.teachers.length} ครู)
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            คาบล็อค/กิจกรรมร่วม {dataset.synchronizedBlocks.length} รายการ
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500">ผลตรวจความพร้อมก่อนรัน Solver</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${
                errorIssues.length === 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {errorIssues.length === 0 ? "พร้อมจัด 100%" : `พบ ${errorIssues.length} ข้อติดขัด`}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            ข้อควรระวังเพิ่มเติม {warningIssues.length} รายการ
          </div>
        </div>
      </div>

      {/* Issues / Alerts Panel (If any) */}
      {readinessReport.issues.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              รายการตรวจสอบที่พบ ({readinessReport.issues.length} รายการ)
            </h2>
            <Link
              href="/audit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold text-xs transition"
            >
              <span>ดูข้อมูลแบบเต็มจอ & แยกประเภท ({readinessReport.issues.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto">
            {readinessReport.issues.slice(0, 6).map((iss) => (
              <div
                key={iss.id}
                className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                  iss.severity === "error"
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                {iss.severity === "error" ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">{iss.title}</div>
                  <div className="opacity-85 mt-0.5">{iss.detail}</div>
                </div>
              </div>
            ))}
          </div>
          {readinessReport.issues.length > 6 && (
            <div className="text-center pt-1 border-t border-slate-100">
              <Link
                href="/audit"
                className="text-xs text-blue-600 hover:underline font-semibold"
              >
                และอีก {readinessReport.issues.length - 6} รายการ คลิกดูทั้งหมดในหน้าศูนย์ตรวจสอบและแจ้งเตือน →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Section 1: สถานะการช่วยกันคีย์ข้อมูลของแต่ละกลุ่มสาระ */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              1. สถานะการลงข้อมูลพื้นฐานของแต่ละกลุ่มสาระการเรียนรู้
            </h2>
            <p className="text-xs text-slate-500">
              ตัวแทนแต่ละกลุ่มสาระสามารถคลิกเข้าไปลงคาบสอนและกดปุ่มยืนยันเมื่อคีย์ข้อมูลครบแล้ว
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dataset.departments.map((dept) => {
            const deptSubIds = new Set(
              dataset.subjects.filter((s) => s.departmentId === dept.id).map((s) => s.id)
            );
            const deptAsgs = dataset.teachingAssignments.filter((a) =>
              deptSubIds.has(a.subjectId)
            );
            const totalPeriods = deptAsgs.reduce((acc, a) => acc + a.periodsPerWeek, 0);
            const deptTeachersCount = dataset.teachers.filter(
              (t) => t.departmentId === dept.id
            ).length;

            return (
              <div
                key={dept.id}
                className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition ${
                  dept.isEntryCompleted
                    ? "border-emerald-200 bg-emerald-50/30"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: dept.color }}
                    />
                    <div>
                      <div className="font-bold text-sm text-slate-800">{dept.name}</div>
                      <div className="text-[11px] text-slate-500">
                        ครู {deptTeachersCount} คน • {deptAsgs.length} รายการสอน ({totalPeriods} คาบ)
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDepartmentCompleted(dept.id, !dept.isEntryCompleted)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition shrink-0 ${
                      dept.isEntryCompleted
                        ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {dept.isEntryCompleted ? "✓ ยืนยันครบแล้ว" : "กดยืนยันเมื่อคีย์ครบ"}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                  <span className="text-slate-500 truncate">
                    {dept.isEntryCompleted
                      ? `ยืนยันโดย: ${dept.completedBy || "ตัวแทนสาระ"}`
                      : "กำลังรอตรวจสอบ/คีย์ข้อมูล"}
                  </span>
                  <Link
                    href={`/assignments?dept=${dept.id}`}
                    className="font-semibold text-blue-600 hover:underline shrink-0"
                  >
                    ลงคาบสอน →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: ตารางตรวจนับยอดคาบรายห้องเรียน (Classroom Period Balance Matrix) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              2. ตารางตรวจนับยอดคาบรายห้องเรียน (ต้องรวมได้ {readinessReport.totalSlotsPerWeek} คาบพอดีทุกห้อง)
            </h2>
            <p className="text-xs text-slate-500">
              แยกแสดงจำนวนคาบตามกลุ่มสาระ + คาบล็อค/กิจกรรม + คาบอิสระของแต่ละห้อง (ปรับคาบอิสระได้ทันทีจากตารางนี้)
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> ครบพอดี ({readinessReport.totalSlotsPerWeek})
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> ยังไม่ครบ
            </span>
            <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> คาบเกิน
            </span>
          </div>
        </div>

        {/* Grade Level Selector Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className="text-slate-600 mr-1">ระดับชั้น (เรียงห้อง 1–10):</span>
            <button
              type="button"
              onClick={() => setGradeFilterTab("ALL")}
              className={`px-3 py-1.5 rounded-lg transition border ${
                gradeFilterTab === "ALL"
                  ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
              }`}
            >
              ทั้งหมด ({dataset.classrooms.length} ห้อง)
            </button>
            {dataset.gradeLevels.map((g) => {
              const count = dataset.classrooms.filter((c) => c.gradeLevelId === g.id).length;
              const active = gradeFilterTab === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGradeFilterTab(g.id)}
                  className={`px-3 py-1.5 rounded-lg transition border ${
                    active
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                  }`}
                >
                  {g.name} ({count} ห้อง)
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <th className="py-2.5 px-3 text-left font-bold sticky left-0 bg-slate-100 z-10">
                  ห้องเรียน
                </th>
                <th className="py-2.5 px-2 text-left font-semibold">แผนการเรียน</th>
                {dataset.departments.map((d) => (
                  <th
                    key={d.id}
                    className="py-2.5 px-2 text-center font-semibold"
                    title={d.name}
                  >
                    <div className="flex flex-col items-center">
                      <span
                        className="w-2 h-2 rounded-full mb-0.5"
                        style={{ backgroundColor: d.color }}
                      />
                      <span>{d.code}</span>
                    </div>
                  </th>
                ))}
                <th className="py-2.5 px-2.5 text-center font-bold bg-blue-50 text-blue-900">
                  รวมวิชา
                </th>
                <th className="py-2.5 px-2.5 text-center font-bold bg-purple-50 text-purple-900">
                  กิจกรรม/ล็อค
                </th>
                <th className="py-2.5 px-2.5 text-center font-bold bg-slate-50 text-slate-800">
                  คาบอิสระ (ข้อ 2)
                </th>
                <th className="py-2.5 px-3 text-center font-bold">
                  ยอดรวม / เต็ม
                </th>
                <th className="py-2.5 px-3 text-center font-bold">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {dataset.gradeLevels
                .filter((g) => gradeFilterTab === "ALL" || gradeFilterTab === g.id)
                .map((g) => {
                  const auditsInGrade = readinessReport.classroomAudits.filter(
                    (a) => a.gradeLevelId === g.id
                  );
                  if (auditsInGrade.length === 0) return null;

                  return (
                    <React.Fragment key={g.id}>
                      {gradeFilterTab === "ALL" && (
                        <tr className="bg-slate-100 font-bold text-slate-800 text-xs border-y border-slate-300">
                          <td
                            colSpan={6 + dataset.departments.length}
                            className="py-1.5 px-3 bg-slate-100 font-bold text-slate-800"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-blue-600" />
                              ระดับชั้น {g.name} ({auditsInGrade.length} ห้องเรียน — เรียงห้อง 1–10)
                            </span>
                          </td>
                        </tr>
                      )}
                      {auditsInGrade.map((audit) => {
                        const cls = dataset.classrooms.find((c) => c.id === audit.classroomId);
                        return (
                          <tr key={audit.classroomId} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-bold text-slate-900 sticky left-0 bg-white">
                              {audit.classroomName}
                            </td>
                            <td className="py-2.5 px-2 text-slate-500 max-w-[140px] truncate">
                              {audit.programName}
                            </td>
                            {dataset.departments.map((d) => {
                              const cnt = audit.periodsByDepartment[d.id] || 0;
                              return (
                                <td
                                  key={d.id}
                                  className={`py-2.5 px-2 text-center ${
                                    cnt === 0 ? "text-slate-300" : "text-slate-700 font-medium"
                                  }`}
                                >
                                  {cnt}
                                </td>
                              );
                            })}
                            <td className="py-2.5 px-2.5 text-center font-bold bg-blue-50/40 text-blue-800">
                              {audit.academicPeriods}
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-bold bg-purple-50/40 text-purple-800">
                              {audit.syncBlockPeriods}
                            </td>
                            <td className="py-2.5 px-2.5 text-center bg-slate-50/60">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    cls &&
                                    upsertClassroom({
                                      ...cls,
                                      freePeriodsCount: Math.max(0, cls.freePeriodsCount - 1),
                                    })
                                  }
                                  className="w-5 h-5 rounded border border-slate-300 bg-white hover:bg-slate-100 font-bold"
                                >
                                  -
                                </button>
                                <span className="w-6 text-center font-bold text-slate-800">
                                  {audit.freePeriods}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    cls &&
                                    upsertClassroom({
                                      ...cls,
                                      freePeriodsCount: cls.freePeriodsCount + 1,
                                    })
                                  }
                                  className="w-5 h-5 rounded border border-slate-300 bg-white hover:bg-slate-100 font-bold"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-sm">
                              <span
                                className={
                                  audit.delta === 0
                                    ? "text-emerald-700"
                                    : audit.delta < 0
                                    ? "text-amber-700"
                                    : "text-rose-700"
                                }
                              >
                                {audit.totalPlannedPeriods} / {audit.totalAvailableSlots}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {audit.delta === 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                                  ✓ ครบพอดี
                                </span>
                              ) : audit.delta < 0 ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                                    ขาด {Math.abs(audit.delta)} คาบ
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAutoFillFreePeriods(audit.classroomId, Math.abs(audit.delta))
                                    }
                                    title="เติมส่วนที่ขาดเป็นคาบอิสระให้ครบพอดี"
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-[10px]"
                                  >
                                    <Wand2 className="w-3 h-3" /> เติมอิสระ
                                  </button>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold">
                                  เกิน {audit.delta} คาบ!
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: สรุปภาระงานครูและความเป็นไปได้เบื้องต้น */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              3. ภาพรวมภาระงานสอนของครูเทียบเพดานเวลาว่าง
            </h2>
            <p className="text-xs text-slate-500">
              ตรวจสอบล่วงหน้าว่าไม่มีครูท่านใดมีคาบสอนเกินเพดานที่จัดลงได้ตามกฎช่วงบ่ายและคาบ 8
            </p>
          </div>
          <Link href="/teachers" className="text-xs font-semibold text-blue-600 hover:underline">
            จัดการข้อมูลครู & ล็อคคาบ →
          </Link>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-80">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-2 px-3 text-left">รหัส</th>
                <th className="py-2 px-3 text-left">ชื่อ - นามสกุล</th>
                <th className="py-2 px-2 text-center">คาบสอนปกติ</th>
                <th className="py-2 px-2 text-center">วิชาเลือก</th>
                <th className="py-2 px-2 text-center">ที่ปรึกษา (คุณธรรม/HR)</th>
                <th className="py-2 px-2 text-center">กิจกรรม</th>
                <th className="py-2 px-2 text-center">ประชุมฝ่าย</th>
                <th className="py-2 px-2 text-center font-bold">รวมปฏิบัติงาน</th>
                <th className="py-2 px-2 text-center">ล็อคไม่ว่าง</th>
                <th className="py-2 px-3 text-center">ความพร้อม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {readinessReport.teacherAudits.map((ta) => (
                <tr key={ta.teacherId} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-mono text-slate-500">{ta.teacherCode}</td>
                  <td className="py-2 px-3 font-semibold text-slate-800">{ta.teacherName}</td>
                  <td className="py-2 px-2 text-center">{ta.teachingPeriods}</td>
                  <td className="py-2 px-2 text-center">{ta.electivePeriods}</td>
                  <td className="py-2 px-2 text-center">{ta.advisorPeriods}</td>
                  <td className="py-2 px-2 text-center">{ta.activityPeriods}</td>
                  <td className="py-2 px-2 text-center">{ta.meetingPeriods}</td>
                  <td className="py-2 px-2 text-center font-bold text-blue-700">
                    {ta.totalCommittedPeriods}
                  </td>
                  <td className="py-2 px-2 text-center text-slate-500">
                    {ta.unavailableHardCount} คาบ
                  </td>
                  <td className="py-2 px-3 text-center">
                    {ta.isOverloaded ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">
                        เกินเพดาน!
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        ปกติ
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
