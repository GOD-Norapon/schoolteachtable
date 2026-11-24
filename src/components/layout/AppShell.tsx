"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  CloudOff,
  Copy,
  Database,
  FileSpreadsheet,
  Layers,
  LayoutGrid,
  Menu,
  Printer,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  X,
  AlertTriangle,
} from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";

interface NavGroup {
  groupTitle: string;
  items: {
    href: string;
    label: string;
    sublabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    dataset,
    readinessReport,
    activeVersionEntries,
    session,
    updateSession,
    cloudState,
    cloudError,
    lastSyncedAt,
    supabaseUrl,
    supabaseKey,
    connectSupabase,
    pushToCloud,
    pullFromCloud,
    resetToSeedData,
    resetToBlankTemplate,
  } = useSchoolData();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);

  // Role modal form
  const [tempName, setTempName] = useState(session.userName);
  const [tempRole, setTempRole] = useState<"admin" | "coordinator">(session.role);
  const [tempDeptId, setTempDeptId] = useState<string>(session.departmentId || "");

  // Cloud modal form
  const [tempUrl, setTempUrl] = useState(supabaseUrl);
  const [tempKey, setTempKey] = useState(supabaseKey);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudFeedback, setCloudFeedback] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const balancedCount = readinessReport.classroomAudits.filter((c) => c.delta === 0).length;
  const totalRooms = readinessReport.classroomAudits.length;
  const completedDepts = dataset.departments.filter((d) => d.isEntryCompleted).length;
  const scheduledCount = activeVersionEntries.filter((e) => e.sourceType !== "free_period").length;
  const errorIssuesCount = readinessReport.issues.filter((i) => i.severity === "error").length;

  const navGroups: NavGroup[] = [
    {
      groupTitle: "ภาพรวม & ตรวจสอบยอดคาบก่อนจัด",
      items: [
        {
          href: "/",
          label: "ตรวจสอบยอดคาบ & ความพร้อม",
          sublabel: `${balancedCount}/${totalRooms} ห้องครบพอดี`,
          icon: ClipboardCheck,
          badge: readinessReport.isAllRoomsBalanced ? "ครบ" : "เช็คยอด",
        },
        {
          href: "/audit",
          label: "รายการตรวจสอบ & แจ้งเตือน",
          sublabel:
            readinessReport.issues.length === 0
              ? "ไม่พบข้อผิดพลาด"
              : `พบ ${readinessReport.issues.length} รายการ`,
          icon: ShieldAlert,
          badge:
            errorIssuesCount > 0
              ? `${errorIssuesCount} ข้อผิดพลาด`
              : readinessReport.issues.length > 0
              ? `${readinessReport.issues.length} คำเตือน`
              : "ผ่าน",
        },
      ],
    },
    {
      groupTitle: "1. ตั้งค่าโครงสร้างพื้นฐาน",
      items: [
        {
          href: "/time-structure",
          label: "โครงสร้างเวลาเรียน & เวลาพัก",
          sublabel: "เวลาคาบ 1–8 • พัก 20 นาที • พักกลางวัน",
          icon: CalendarClock,
        },
        {
          href: "/departments",
          label: "กลุ่มสาระการเรียนรู้",
          sublabel: `${dataset.departments.length} กลุ่มสาระ • เพดานสอน`,
          icon: Layers,
        },
        {
          href: "/classrooms",
          label: "ห้องเรียน & ห้องปฏิบัติการ",
          sublabel: `${dataset.classrooms.length} ห้องเรียน • ${dataset.rooms.length} ห้องจริง`,
          icon: Building2,
        },
      ],
    },
    {
      groupTitle: "2. ลงข้อมูลวิชาและเงื่อนไข",
      items: [
        {
          href: "/special-blocks",
          label: "คาบล็อค คาบอิสระ & ประชุมฝ่าย (นศท.)",
          sublabel: "ทั้งโรงเรียน • ประจำระดับชั้น • ประชุมฝ่าย • นศท.",
          icon: Sparkles,
        },
        {
          href: "/teachers",
          label: "ครูผู้สอน & ล็อคคาบไม่ว่าง",
          sublabel: `${dataset.teachers.length} ท่าน`,
          icon: Users,
        },
        {
          href: "/assignments",
          label: "รายวิชา & ภาระงานสอนครู",
          sublabel: "เลือกครู • ลงวิชาและห้อง • เงื่อนไขเฉพาะห้อง",
          icon: BookOpen,
        },
      ],
    },
    {
      groupTitle: "3. จัดตาราง & ปรับแก้รายกรณี",
      items: [
        {
          href: "/scheduler",
          label: "จัดตารางสอน & ปรับแก้รายกรณี",
          sublabel: scheduledCount > 0 ? `จัดแล้ว ${scheduledCount} คาบ` : "พร้อมกดจัดตาราง",
          icon: LayoutGrid,
        },
      ],
    },
    {
      groupTitle: "4. พิมพ์ตาราง & ส่งออกข้อมูล",
      items: [
        {
          href: "/reports",
          label: "พิมพ์รายคน + สรุปคาบ & Excel",
          sublabel: "A4 รายครู / รายห้อง / .xlsx",
          icon: Printer,
        },
      ],
    },
  ];

  const activeDeptName = session.departmentId
    ? dataset.departments.find((d) => d.id === session.departmentId)?.name
    : null;

  const handleCopySql = async () => {
    try {
      const res = await fetch("/api/sql-schema");
      const json = await res.json();
      if (json.sql) {
        await navigator.clipboard.writeText(json.sql);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 3000);
      }
    } catch {
      setCloudFeedback("คัดลอกไม่สำเร็จ กรุณาเปิดไฟล์ supabase/migrations/001_initial_schema.sql");
    }
  };

  const handleSaveCloud = async () => {
    setCloudBusy(true);
    setCloudFeedback(null);
    const res = await connectSupabase(tempUrl, tempKey);
    setCloudBusy(false);
    if (res.ok) {
      setCloudFeedback(
        tempUrl
          ? "เชื่อมต่อและซิงค์ข้อมูลกับ Supabase สำเร็จ!"
          : "สลับเป็นโหมดบันทึกในเครื่องเรียบร้อย"
      );
    } else {
      setCloudFeedback(`เชื่อมต่อไม่สำเร็จ: ${res.error} (อย่าลืมรัน SQL Schema ใน Supabase ก่อนนะครับ)`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      {/* Sidebar (Hidden when printing) */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 w-72 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow">
              ต
            </div>
            <div>
              <div className="font-bold text-sm leading-tight text-white">
                ระบบจัดตารางสอนออนไลน์
              </div>
              <div className="text-xs text-slate-400 truncate max-w-[185px]">
                {dataset.term.schoolName}
              </div>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
          {navGroups.map((group) => (
            <div key={group.groupTitle}>
              <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.groupTitle}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                        isActive
                          ? "bg-blue-600 text-white shadow-sm font-medium"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate leading-snug">{item.label}</div>
                        <div
                          className={`text-[11px] truncate ${
                            isActive ? "text-blue-100" : "text-slate-400"
                          }`}
                        >
                          {item.sublabel}
                        </div>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            readinessReport.isAllRoomsBalanced
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Summary Card */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span>ภาคเรียนปัจจุบัน:</span>
            <span className="font-semibold text-white">
              {dataset.term.semester}/{dataset.term.academicYear}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">สถานะยอดคาบรายห้อง:</span>
            {readinessReport.isAllRoomsBalanced ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ครบทุกห้อง
              </span>
            ) : (
              <span className="text-amber-400 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> รอปรับยอด
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 print-container">
        {/* Top Collaborative Bar (Hidden when printing) */}
        <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>{dataset.term.schoolName}</span>
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {dataset.term.name}
                </span>
              </div>
              <div className="text-xs text-slate-500 hidden sm:block">
                ครูช่วยกันคีย์ข้อมูลตามกลุ่มสาระ → เช็คยอดคาบรายห้องให้ครบพอดี → กดจัดตาราง → ปรับแก้รายกรณี
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Switch Collaborator Identity / Department */}
            <button
              onClick={() => {
                setTempName(session.userName);
                setTempRole(session.role);
                setTempDeptId(session.departmentId || "");
                setRoleModalOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 transition"
            >
              <UserCheck className="w-4 h-4 text-blue-600" />
              <div className="text-left">
                <span className="font-semibold">{session.userName}</span>
                <span className="text-slate-500 ml-1.5">
                  ({session.role === "admin" ? "ทีมจัดตารางกลาง" : `สาระ: ${activeDeptName || "ทั้งหมด"}`})
                </span>
              </div>
            </button>

            {/* Supabase Cloud Connection Status Button */}
            <button
              onClick={() => {
                setTempUrl(supabaseUrl);
                setTempKey(supabaseKey);
                setCloudFeedback(null);
                setCloudModalOpen(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                cloudState === "connected"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : cloudState === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
              }`}
            >
              {cloudState === "connected" ? (
                <>
                  <Cloud className="w-4 h-4 text-emerald-600" />
                  <span>Supabase ออนไลน์ {lastSyncedAt ? `(${lastSyncedAt})` : ""}</span>
                </>
              ) : cloudState === "error" ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>เช็คการเชื่อมต่อ Supabase</span>
                </>
              ) : (
                <>
                  <CloudOff className="w-4 h-4 text-amber-600" />
                  <span>ตั้งค่าเชื่อม Supabase ออนไลน์</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 lg:p-6 print-container">{children}</main>
      </div>

      {/* Modal 1: สลับบทบาทผู้ใช้งาน (ครูช่วยลงข้อมูลตามกลุ่มสาระ vs ทีมจัดตารางกลาง) */}
      {roleModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                ตั้งค่าผู้ใช้งานปัจจุบัน (โหมดช่วยกันลงข้อมูล)
              </h3>
              <button onClick={() => setRoleModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  ชื่อผู้ใช้งาน (แสดงเวลากดยืนยันข้อมูลกลุ่มสาระ)
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="เช่น ครูสมศักดิ์ หรือ ฝ่ายวิชาการ"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  บทบาทการทำงาน
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTempRole("admin")}
                    className={`p-2.5 rounded-lg border text-left text-xs ${
                      tempRole === "admin"
                        ? "border-blue-600 bg-blue-50 text-blue-800 font-semibold"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div>ทีมผู้จัดตารางสอนกลาง</div>
                    <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                      ดูทุกกลุ่มสาระ ตรวจยอด กดจัดตาราง และปรับแก้รายกรณี
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempRole("coordinator")}
                    className={`p-2.5 rounded-lg border text-left text-xs ${
                      tempRole === "coordinator"
                        ? "border-blue-600 bg-blue-50 text-blue-800 font-semibold"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div>ครู / ตัวแทนกลุ่มสาระ</div>
                    <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                      โฟกัสลงคาบสอน เงื่อนไขครู และวิชาของกลุ่มสาระตนเอง
                    </div>
                  </button>
                </div>
              </div>

              {tempRole === "coordinator" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    เลือกกลุ่มสาระการเรียนรู้ที่รับผิดชอบ
                  </label>
                  <select
                    value={tempDeptId}
                    onChange={(e) => setTempDeptId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">-- ทุกกลุ่มสาระ --</option>
                    {dataset.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setRoleModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  updateSession({
                    userName: tempName.trim() || "ผู้ใช้งาน",
                    role: tempRole,
                    departmentId: tempRole === "coordinator" && tempDeptId ? tempDeptId : null,
                  });
                  setRoleModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >
                บันทึกบทบาท
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: ตั้งค่าการเชื่อมต่อ Supabase ออนไลน์ + จัดการข้อมูลเริ่มต้น */}
      {cloudModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                ตั้งค่าฐานข้อมูลออนไลน์ Supabase & ข้อมูลเริ่มต้น
              </h3>
              <button onClick={() => setCloudModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-2">
              <div className="font-semibold">ขั้นตอนเชื่อมต่อ Supabase ครั้งแรก (ใช้เวลา 1 นาที):</div>
              <ol className="list-decimal ml-4 space-y-1">
                <li>
                  กดปุ่มด้านล่างเพื่อคัดลอกคำสั่งสร้างตาราง SQL ไปวางใน{" "}
                  <strong>Supabase Dashboard → SQL Editor → Run</strong>
                </li>
                <li>
                  คัดลอก <strong>Project URL</strong> (เช่น <code>https://xxxx.supabase.co</code>) จากหน้า{" "}
                  <strong>Project Settings → Data API</strong> มาวางในช่องด้านล่าง (ใส่ API Key ที่ให้มาไว้ให้แล้ว)
                </li>
              </ol>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedSql ? "คัดลอก SQL Schema เรียบร้อยแล้ว!" : "คัดลอก SQL Schema (001_initial_schema.sql)"}
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supabase Project URL (NEXT_PUBLIC_SUPABASE_URL)
                </label>
                <input
                  type="url"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  placeholder="https://your-project-id.supabase.co"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supabase Publishable / Anon Key
                </label>
                <input
                  type="text"
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono bg-slate-50"
                />
              </div>

              {(cloudError || cloudFeedback) && (
                <div
                  className={`p-2.5 rounded-lg text-xs border ${
                    cloudState === "error"
                      ? "bg-rose-50 border-rose-200 text-rose-800"
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  }`}
                >
                  {cloudFeedback || cloudError}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={cloudBusy}
                  onClick={handleSaveCloud}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {cloudBusy ? "กำลังเชื่อมต่อ..." : "บันทึกและเชื่อมต่อ Supabase"}
                </button>
                {cloudState === "connected" && (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        setCloudBusy(true);
                        const r = await pushToCloud();
                        setCloudBusy(false);
                        setCloudFeedback(r.ok ? "ส่งข้อมูลปัจจุบันขึ้น Supabase สำเร็จ!" : `ผิดพลาด: ${r.error}`);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium hover:bg-slate-50"
                    >
                      <Cloud className="w-3.5 h-3.5" /> อัปโหลดข้อมูลชุดนี้ทับบน Cloud
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setCloudBusy(true);
                        const r = await pullFromCloud();
                        setCloudBusy(false);
                        setCloudFeedback(r.ok ? "ดึงข้อมูลล่าสุดจาก Supabase สำเร็จ!" : `ผิดพลาด: ${r.error}`);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium hover:bg-slate-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> ดึงข้อมูลล่าสุดจาก Cloud
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="text-xs font-semibold text-slate-600">จัดการชุดข้อมูลสำหรับทดสอบ / เริ่มระบบใหม่:</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("ต้องการโหลดข้อมูลตัวอย่างโรงเรียนสาธิต (ครบทั้ง 21 เงื่อนไข) ใหม่หรือไม่?")) {
                      resetToSeedData();
                      setCloudModalOpen(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  โหลดข้อมูลตัวอย่างครบ 21 เงื่อนไข (Seed Data)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("ต้องการล้างรายการครู ห้อง และวิชาทั้งหมด เพื่อเริ่มคีย์ข้อมูลโรงเรียนจริงจากศูนย์หรือไม่?")) {
                      resetToBlankTemplate();
                      setCloudModalOpen(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium hover:bg-rose-100"
                >
                  ล้างข้อมูลเพื่อเริ่มคีย์โรงเรียนจริง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
