"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Filter,
  Layers,
  LayoutGrid,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";
import { ReadinessIssueCategory, ReadinessIssueSeverity } from "@/types/timetable";

const CATEGORY_CONFIG: Record<
  ReadinessIssueCategory,
  { label: string; icon: React.ElementType; color: string; bg: string; border: string }
> = {
  classroom_balance: {
    label: "ยอดคาบรายห้องเรียน",
    icon: Building2,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  teacher_load: {
    label: "ภาระงานสอนครู",
    icon: Users,
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  lock_conflict: {
    label: "ข้อขัดแย้งคาบล็อค/ประชุม",
    icon: CalendarClock,
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
  },
  room_load: {
    label: "การใช้งานห้องเรียน/แล็บ",
    icon: LayoutGrid,
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
  },
  department_status: {
    label: "การยืนยันข้อมูลกลุ่มสาระ",
    icon: Layers,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
};

export default function AuditReportPage() {
  const { dataset, readinessReport, upsertClassroom } = useSchoolData();

  const [selectedCategory, setSelectedCategory] = useState<ReadinessIssueCategory | "ALL">("ALL");
  const [selectedSeverity, setSelectedSeverity] = useState<ReadinessIssueSeverity | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const errorIssues = useMemo(
    () => readinessReport.issues.filter((i) => i.severity === "error"),
    [readinessReport.issues]
  );
  const warningIssues = useMemo(
    () => readinessReport.issues.filter((i) => i.severity === "warning"),
    [readinessReport.issues]
  );

  // Group counts by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: readinessReport.issues.length,
      classroom_balance: 0,
      teacher_load: 0,
      lock_conflict: 0,
      room_load: 0,
      department_status: 0,
    };
    for (const issue of readinessReport.issues) {
      if (counts[issue.category] !== undefined) {
        counts[issue.category]++;
      }
    }
    return counts;
  }, [readinessReport.issues]);

  // Filtered issues
  const filteredIssues = useMemo(() => {
    return readinessReport.issues.filter((issue) => {
      if (selectedCategory !== "ALL" && issue.category !== selectedCategory) return false;
      if (selectedSeverity !== "ALL" && issue.severity !== selectedSeverity) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = issue.title.toLowerCase().includes(q);
        const matchDetail = issue.detail.toLowerCase().includes(q);
        if (!matchTitle && !matchDetail) return false;
      }
      return true;
    });
  }, [readinessReport.issues, selectedCategory, selectedSeverity, searchQuery]);

  const handleAutoFillFreePeriods = (classroomId: string, neededFree: number) => {
    const cls = dataset.classrooms.find((c) => c.id === classroomId);
    if (!cls) return;
    upsertClassroom({
      ...cls,
      freePeriodsCount: Math.max(0, cls.freePeriodsCount + neededFree),
    });
  };

  const getActionLink = (issue: (typeof readinessReport.issues)[0]) => {
    switch (issue.category) {
      case "classroom_balance":
        if (issue.entityId && issue.entityId.startsWith("c_")) {
          return {
            href: `/assignments?cls=${issue.entityId}`,
            label: "ไปหน้าลงคาบสอนห้องนี้",
            icon: BookOpen,
          };
        }
        return {
          href: "/",
          label: "ไปตารางตรวจยอดคาบรายห้อง",
          icon: Building2,
        };
      case "teacher_load":
        if (issue.entityId && issue.entityId.startsWith("t_")) {
          return {
            href: `/teachers?t=${issue.entityId}`,
            label: "ไปตั้งค่าคาบไม่ว่างครูท่านนี้",
            icon: Users,
          };
        }
        return {
          href: "/assignments",
          label: "ไปหน้ารายวิชาและภาระงานสอนครู",
          icon: BookOpen,
        };
      case "lock_conflict": {
        const teacherParam = issue.entityId ? `&teacherId=${issue.entityId}` : "";
        const dayParam = issue.day ? `&day=${issue.day}` : "";
        const periodParam = issue.period !== undefined ? `&period=${issue.period}` : "";
        const blockParam = issue.syncBlockId ? `&syncBlockId=${issue.syncBlockId}` : "";
        return {
          href: `/scheduler?perspective=teacher${teacherParam}${dayParam}${periodParam}${blockParam}`,
          label: "ไปแก้ไขที่ตารางสอนครูท่านนี้ →",
          icon: Sparkles,
        };
      }
      case "department_status":
        return {
          href: `/assignments?dept=${issue.entityId || ""}`,
          label: "ไปตรวจสอบรายวิชากลุ่มสาระนี้",
          icon: Layers,
        };
      case "room_load":
        return {
          href: "/classrooms",
          label: "ไปจัดการห้องเรียนและห้องปฏิบัติการ",
          icon: LayoutGrid,
        };
      default:
        return {
          href: "/",
          label: "ไปหน้าภาพรวม",
          icon: ArrowRight,
        };
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Breadcrumb & Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-blue-600 flex items-center gap-1 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> ภาพรวม & ตรวจสอบยอดคาบ
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <span className="font-semibold text-slate-800">รายการตรวจสอบ & แจ้งเตือนข้อขัดแย้ง</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/scheduler"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>ไปหน้าจัดตารางสอน</span>
          </Link>
        </div>
      </div>

      {/* Hero Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
            <ShieldAlert className="w-3.5 h-3.5" />
            ศูนย์รวมรายการตรวจสอบความพร้อมและข้อขัดแย้งแบบเต็มจอ
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            รายการตรวจสอบที่พบ & ข้อขัดแย้งของข้อมูลทั้งระบบ
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-3xl">
            แสดงรายการแจ้งเตือนทั้งหมดอย่างโปร่งใส แยกตามประเภท (ยอดคาบห้องเรียน, ภาระงานครู, คาบล็อคชน, ห้องเรียน, และกลุ่มสาระ)
            เพื่อให้ผู้จัดตารางตรวจสอบและแก้ไขก่อนเริ่มประมวลผลจัดตารางจริง
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-500">สถานะความพร้อม</div>
            <div
              className={`text-base font-bold ${
                readinessReport.canRunSolver ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {readinessReport.canRunSolver ? "✓ พร้อมจัดตารางได้" : "⚠️ ต้องแก้ไขก่อนจัด"}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => {
            setSelectedSeverity("ALL");
            setSelectedCategory("ALL");
          }}
          className={`cursor-pointer bg-white rounded-xl border p-4 transition shadow-xs hover:border-slate-400 ${
            selectedSeverity === "ALL" && selectedCategory === "ALL"
              ? "ring-2 ring-blue-500 border-blue-500"
              : "border-slate-200"
          }`}
        >
          <div className="text-xs font-medium text-slate-500">รายการตรวจสอบทั้งหมด</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {readinessReport.issues.length}
            </span>
            <span className="text-xs text-slate-500">รายการ</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            คลิกเพื่อแสดงรายการทั้งหมด
          </div>
        </div>

        <div
          onClick={() => setSelectedSeverity("error")}
          className={`cursor-pointer bg-white rounded-xl border p-4 transition shadow-xs hover:border-rose-400 ${
            selectedSeverity === "error"
              ? "ring-2 ring-rose-500 border-rose-500 bg-rose-50/20"
              : "border-slate-200"
          }`}
        >
          <div className="text-xs font-medium text-rose-600 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> ข้อผิดพลาดที่ต้องแก้ไข (Error)
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600">{errorIssues.length}</span>
            <span className="text-xs text-slate-500">รายการขัดขวาง</span>
          </div>
          <div className="mt-2 text-xs text-rose-700 font-medium">
            {errorIssues.length === 0 ? "✓ ไม่มีข้อผิดพลาดขัดขวาง" : "ต้องแก้ไขก่อนรัน Solver"}
          </div>
        </div>

        <div
          onClick={() => setSelectedSeverity("warning")}
          className={`cursor-pointer bg-white rounded-xl border p-4 transition shadow-xs hover:border-amber-400 ${
            selectedSeverity === "warning"
              ? "ring-2 ring-amber-500 border-amber-500 bg-amber-50/20"
              : "border-slate-200"
          }`}
        >
          <div className="text-xs font-medium text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> ข้อควรระวัง / คำแนะนำ (Warning)
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600">{warningIssues.length}</span>
            <span className="text-xs text-slate-500">ข้อควรทราบ</span>
          </div>
          <div className="mt-2 text-xs text-amber-700 font-medium">
            เช่น คาบอิสระยังไม่เต็ม / รอสาระกดยืนยัน
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium text-slate-500">ความสมดุลคาบห้องเรียน</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {readinessReport.classroomAudits.filter((c) => c.delta === 0).length} /{" "}
              {readinessReport.classroomAudits.length}
            </span>
            <span className="text-xs text-slate-500">ห้องครบ {readinessReport.totalSlotsPerWeek} คาบ</span>
          </div>
          <div className="mt-2 text-xs">
            {readinessReport.isAllRoomsBalanced ? (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ทุกห้องมียอดครบ {readinessReport.totalSlotsPerWeek} คาบเป๊ะ
              </span>
            ) : (
              <span className="text-amber-600 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> มีห้องที่คาบขาด/เกิน
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Category Selection Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-xs">
        {/* Row 1: Category Filter Pills (แยกประเภทรายการแจ้งเตือน) */}
        <div>
          <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>แยกประเภทรายการแจ้งเตือน (คลิกเลือกประเภทเพื่อดูเฉพาะหมวดที่สนใจ):</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                selectedCategory === "ALL"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
            >
              🌟 ทั้งหมด ({categoryCounts.ALL})
            </button>

            {(Object.keys(CATEGORY_CONFIG) as ReadinessIssueCategory[]).map((catKey) => {
              const cfg = CATEGORY_CONFIG[catKey];
              const Icon = cfg.icon;
              const count = categoryCounts[catKey] || 0;
              const active = selectedCategory === catKey;

              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setSelectedCategory(catKey)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    active
                      ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-blue-400 font-bold shadow-xs`
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  <span>{cfg.label}</span>
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                      count > 0 ? "bg-slate-200 text-slate-800" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Severity Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-600 mr-1">ระดับความรุนแรง:</span>
            <button
              type="button"
              onClick={() => setSelectedSeverity("ALL")}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                selectedSeverity === "ALL"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setSelectedSeverity("error")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition ${
                selectedSeverity === "error"
                  ? "bg-rose-600 text-white"
                  : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
              }`}
            >
              <AlertCircle className="w-3 h-3" /> เฉพาะข้อผิดพลาด ({errorIssues.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedSeverity("warning")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition ${
                selectedSeverity === "warning"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
              }`}
            >
              <AlertTriangle className="w-3 h-3" /> เฉพาะข้อควรระวัง ({warningIssues.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาตามชื่อครู, ห้อง, วิชา..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Main Issue Cards List (เต็มจอ) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>
            กำลังแสดง <strong>{filteredIssues.length}</strong> รายการ
            {selectedCategory !== "ALL" && ` ในหมวด "${CATEGORY_CONFIG[selectedCategory].label}"`}
            {selectedSeverity !== "ALL" &&
              ` (${selectedSeverity === "error" ? "เฉพาะข้อผิดพลาด" : "เฉพาะข้อควรระวัง"})`}
          </span>
          {(selectedCategory !== "ALL" || selectedSeverity !== "ALL" || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("ALL");
                setSelectedSeverity("ALL");
                setSearchQuery("");
              }}
              className="text-blue-600 hover:underline font-semibold"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>

        {filteredIssues.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              ยอดเยี่ยมมาก! ไม่พบข้อผิดพลาดหรือข้อขัดแย้งในหมวดนี้
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              ข้อมูลในส่วนนี้ผ่านการตรวจสอบเรียบร้อยแล้ว ท่านสามารถไปจัดตารางสอนหรือตรวจสอบหมวดอื่นได้ทันที
            </p>
            <div className="pt-2">
              <Link
                href="/scheduler"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>ไปหน้าจัดตารางสอน (OR-Tools Solver)</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredIssues.map((issue) => {
              const catCfg = CATEGORY_CONFIG[issue.category] || CATEGORY_CONFIG.classroom_balance;
              const CatIcon = catCfg.icon;
              const action = getActionLink(issue);

              // Check if this is an under-allocated classroom issue with delta < 0
              const isUnderClassroom = issue.id.startsWith("cls_under_");
              const underClassroomId = isUnderClassroom ? issue.entityId : null;
              const underAudit = underClassroomId
                ? readinessReport.classroomAudits.find((a) => a.classroomId === underClassroomId)
                : null;
              const missingPeriods = underAudit && underAudit.delta < 0 ? Math.abs(underAudit.delta) : 0;

              return (
                <div
                  key={issue.id}
                  className={`p-4 rounded-xl border transition shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                    issue.severity === "error"
                      ? "bg-white border-rose-200 hover:border-rose-400"
                      : "bg-white border-slate-200 hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {issue.severity === "error" ? (
                        <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                          <AlertCircle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            issue.severity === "error"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {issue.severity === "error" ? "ข้อผิดพลาด" : "คำเตือน/ข้อควรระวัง"}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${catCfg.bg} ${catCfg.color} ${catCfg.border}`}
                        >
                          <CatIcon className="w-3 h-3" />
                          <span>{catCfg.label}</span>
                        </span>
                      </div>

                      <div className="font-bold text-sm text-slate-900">{issue.title}</div>
                      <div className="text-xs text-slate-600 leading-relaxed">{issue.detail}</div>
                    </div>
                  </div>

                  {/* Actions column */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 md:self-center pl-11 md:pl-0">
                    {/* 1-Click Fix for Under-allocated classrooms */}
                    {isUnderClassroom && underClassroomId && missingPeriods > 0 && (
                      <button
                        type="button"
                        onClick={() => handleAutoFillFreePeriods(underClassroomId, missingPeriods)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs"
                        title="เติมคาบอิสระให้อัตโนมัติเพื่อให้ยอดครบ 40 คาบพอดี"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>เติมคาบอิสระ {missingPeriods} คาบ</span>
                      </button>
                    )}

                    <Link
                      href={action.href}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-600 font-semibold text-xs transition"
                    >
                      <action.icon className="w-3.5 h-3.5" />
                      <span>{action.label}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
