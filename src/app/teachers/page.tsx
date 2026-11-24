"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Edit3, Lock, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";
import { DAY_LABELS, DayOfWeek, Division, Teacher, TeacherUnavailableSlot } from "@/types/timetable";
import { getTeacherFullName, isTeacherInGroupMeeting } from "@/lib/solver/validator";

export default function TeachersManagementPage() {
  const { dataset, session, upsertTeacher, deleteTeacher } = useSchoolData();

  const [filterDeptId, setFilterDeptId] = useState<string>(session.departmentId || "ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    dataset.teachers[0]?.id || ""
  );
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  // Add Teacher Form
  const [prefix, setPrefix] = useState("ครู");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [deptId, setDeptId] = useState(
    session.departmentId || dataset.departments[0]?.id || ""
  );

  const filteredTeachers = useMemo(() => {
    let list = dataset.teachers;
    if (filterDeptId !== "ALL") {
      list = list.filter((t) => t.departmentId === filterDeptId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((t) => {
        const full = `${t.prefix}${t.firstName} ${t.lastName}`.toLowerCase();
        const dept = dataset.departments.find((d) => d.id === t.departmentId)?.name.toLowerCase() || "";
        return full.includes(q) || dept.includes(q);
      });
    }
    return list;
  }, [dataset.departments, dataset.teachers, filterDeptId, searchQuery]);

  const activeTeacher: Teacher | undefined =
    dataset.teachers.find((t) => t.id === selectedTeacherId) || filteredTeachers[0];

  // ดึงรายชื่อฝ่ายจาก dataset.divisions ที่ถูกจัดการในหน้าคาบล็อคโดยตรง (กรองเฉพาะชื่อที่ถูกต้อง)
  const allDivisions = useMemo(() => {
    return dataset.divisions.filter(
      (d) => d && d.name && !d.name.startsWith("div_") && d.name.trim().length > 0
    );
  }, [dataset.divisions]);

  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;
    const newId = `t_${Date.now()}`;
    const autoCode = `T${String(dataset.teachers.length + 1).padStart(2, "0")}`;
    upsertTeacher({
      id: newId,
      termId: dataset.term.id,
      code: autoCode,
      prefix: prefix.trim() || "ครู",
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      departmentId: deptId || dataset.departments[0]?.id || "",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    });
    setFirstName("");
    setLastName("");
    setSelectedTeacherId(newId);
  };

  // สลับสถานะช่องเวลาของครู: ว่าง -> ห้ามสอนเด็ดขาด (hard) -> ขอหลีกเลี่ยง (soft) -> ว่าง
  const cycleTeacherSlot = (t: Teacher, day: DayOfWeek, period: number) => {
    const existing = t.unavailableSlots.find(
      (u) => u.day === day && u.period === period
    );
    let nextSlots: TeacherUnavailableSlot[];
    if (!existing) {
      nextSlots = [
        ...t.unavailableSlots,
        { day, period, type: "hard", reason: "ไม่สะดวกลงสอน" },
      ];
    } else if (existing.type === "hard") {
      nextSlots = t.unavailableSlots.map((u) =>
        u.day === day && u.period === period
          ? { ...u, type: "soft", reason: "ขอหลีกเลี่ยงถ้าทำได้" }
          : u
      );
    } else {
      nextSlots = t.unavailableSlots.filter(
        (u) => !(u.day === day && u.period === period)
      );
    }
    upsertTeacher({ ...t, unavailableSlots: nextSlots });
  };

  // ปุ่มลัด: ล็อคคาบที่ระบุของทุกวัน (เช่น ล็อคคาบแรกของทุกวัน ข้อ 8!)
  const lockPeriodAllDays = (t: Teacher, period: number, reason: string) => {
    const others = t.unavailableSlots.filter((u) => u.period !== period);
    const added: TeacherUnavailableSlot[] = dataset.term.daysOfWeek.map((day) => ({
      day,
      period,
      type: "hard",
      reason,
    }));
    upsertTeacher({ ...t, unavailableSlots: [...others, ...added] });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            ข้อมูลครูผู้สอน สังกัดฝ่ายประชุม & ล็อคคาบไม่ว่างรายบุคคล (ข้อ 7, 8, 10, 11)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            เพิ่มรายชื่อครู เลือกฝ่ายบริหารเพื่อรับการล็อคประชุมฝ่ายอัตโนมัติ และคลิกตารางล็อคคาบไม่สอนรายคน เช่น คาบแรกของทุกวัน
          </p>
        </div>

        <select
          value={filterDeptId}
          onChange={(e) => setFilterDeptId(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold bg-white"
        >
          <option value="ALL">แสดงทุกกลุ่มสาระ ({dataset.teachers.length} คน)</option>
          {dataset.departments.map((d) => (
            <option key={d.id} value={d.id}>
              กลุ่มสาระ{d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Add Teacher Form */}
      <form
        onSubmit={handleAddTeacher}
        className="bg-white p-5 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs items-end"
      >
        <div>
          <label className="block font-semibold text-slate-600 mb-1">คำนำหน้า</label>
          <input
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="ครู / นาย / นาง / น.ส."
            className="w-full border border-slate-300 rounded-lg px-2.5 py-2 font-medium"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">ชื่อจริง <span className="text-rose-500">*</span></label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="ชื่อ..."
            required
            className="w-full border border-slate-300 rounded-lg px-2.5 py-2 font-semibold"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">นามสกุล</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="นามสกุล..."
            className="w-full border border-slate-300 rounded-lg px-2.5 py-2"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">กลุ่มสาระ</label>
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2 py-2 font-medium bg-white"
          >
            {dataset.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
        >
          <Plus className="w-4 h-4" /> เพิ่มครูผู้สอน
        </button>
      </form>

      {/* Master-Detail Layout: Left Teacher List, Right Availability & Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col max-h-[720px] shadow-sm">
          {/* Header + Search Box (ข้อ 3) */}
          <div className="p-3 bg-slate-100 border-b border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>รายชื่อครูผู้สอน ({filteredTeachers.length} ท่าน)</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-[11px] text-blue-600 hover:underline font-normal"
                >
                  ล้างค้นหา
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อ, รหัสครู, กลุ่มสาระ..."
                className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto">
            {filteredTeachers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                ไม่พบรายชื่อครูที่ตรงกับเงื่อนไขการค้นหา
              </div>
            ) : (
              filteredTeachers.map((t) => {
                const dept = dataset.departments.find((d) => d.id === t.departmentId);
                const isSelected = activeTeacher?.id === t.id;
                const lockCount = t.unavailableSlots.length;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTeacherId(t.id)}
                    className={`p-3 cursor-pointer flex items-center justify-between gap-2 text-xs transition ${
                      isSelected
                        ? "bg-blue-50 border-l-4 border-l-blue-600"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        {getTeacherFullName(t)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{dept?.name}</span>
                        {lockCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 font-semibold">
                            ล็อค {lockCount} คาบ
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEditingTeacher(t);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded transition"
                        title="แก้ไขข้อมูลครู (ข้อ 2)"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (window.confirm(`ต้องการลบรายชื่อ ${getTeacherFullName(t)} หรือไม่?`)) {
                            deleteTeacher(t.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded transition"
                        title="ลบรายชื่อครู"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail: Individual Teacher Lock Grid (ข้อ 8) + Divisions (ข้อ 7) + Overrides (ข้อ 10, 11) */}
        <div className="lg:col-span-8 space-y-4">
          {activeTeacher ? (
            <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-rose-600" />
                      ตั้งค่าตารางไม่สอน & ฝ่ายประชุม: {getTeacherFullName(activeTeacher)}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setEditingTeacher(activeTeacher)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold border border-blue-200 transition"
                      title="แก้ไขชื่อและข้อมูลครูท่านนี้"
                    >
                      <Pencil className="w-3 h-3" /> แก้ไขชื่อ/ข้อมูล
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    คลิกที่ช่องตารางเพื่อสลับ: <strong>ว่าง (สีขาว)</strong> →{" "}
                    <strong className="text-rose-600">ห้ามสอนเด็ดขาด (สีแดง)</strong> →{" "}
                    <strong className="text-amber-600">ขอหลีกเลี่ยง (สีเหลือง)</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/assignments?teacherId=${activeTeacher.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>👉 จัดภาระงานสอนครูท่านนี้</span>
                  </Link>

                  {/* Quick Lock Buttons (ข้อ 8) */}
                  <div className="flex flex-wrap gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        lockPeriodAllDays(activeTeacher, 1, "ไม่สอนคาบแรกของทุกวัน (ข้อ 8)")
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs"
                    >
                      ล็อคคาบ 1 ทุกวัน
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        lockPeriodAllDays(
                          activeTeacher,
                          dataset.term.periodsConfig[dataset.term.periodsConfig.length - 1]?.period || 8,
                          "ไม่สอนคาบสุดท้ายของทุกวัน"
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold"
                    >
                      ล็อคคาบสุดท้ายทุกวัน
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        upsertTeacher({ ...activeTeacher, unavailableSlots: [] })
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                    >
                      ล้างล็อค
                    </button>
                  </div>
                </div>
              </div>

              {/* Availability Grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-200 py-2 px-3 text-left">วัน / คาบ</th>
                      {dataset.term.periodsConfig.map((pc) => (
                        <th key={pc.period} className="border border-slate-200 py-2 px-2 text-center">
                          <div className="font-bold">{pc.label}</div>
                          <div className="text-[10px] font-normal text-slate-500">
                            {pc.startTime}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.term.daysOfWeek.map((day) => (
                      <tr key={day}>
                        <td className="border border-slate-200 py-2.5 px-3 font-bold bg-slate-50">
                          {DAY_LABELS[day].full}
                        </td>
                        {dataset.term.periodsConfig.map((pc) => {
                          const personal = activeTeacher.unavailableSlots.find(
                            (u) => u.day === day && u.period === pc.period
                          );
                          const mtg = dataset.groupMeetingLocks.find(
                            (m) =>
                              m.day === day &&
                              pc.period >= m.startPeriod &&
                              pc.period < m.startPeriod + m.duration &&
                              isTeacherInGroupMeeting(activeTeacher, m, allDivisions)
                          );

                          return (
                            <td
                              key={pc.period}
                              onClick={() => {
                                if (!mtg) cycleTeacherSlot(activeTeacher, day, pc.period);
                              }}
                              className={`border border-slate-200 p-2 text-center select-none transition ${
                                mtg
                                  ? "bg-purple-100 text-purple-900 cursor-not-allowed"
                                  : personal?.type === "hard"
                                  ? "bg-rose-100 text-rose-800 font-bold cursor-pointer hover:bg-rose-200"
                                  : personal?.type === "soft"
                                  ? "bg-amber-100 text-amber-800 font-semibold cursor-pointer hover:bg-amber-200"
                                  : "bg-white text-emerald-700 cursor-pointer hover:bg-slate-50"
                              }`}
                            >
                              {mtg ? (
                                <div className="text-[10px] leading-tight font-semibold">
                                  🔒 {mtg.title}
                                </div>
                              ) : personal?.type === "hard" ? (
                                <div>ห้ามสอน</div>
                              ) : personal?.type === "soft" ? (
                                <div>เลี่ยง</div>
                              ) : (
                                <div className="text-slate-300">ว่าง</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Division Membership (ข้อ 7) & Personal Overrides (ข้อ 10, 11) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-800">
                      สังกัดฝ่ายบริหาร / คณะทำงาน (ใช้ล็อคคาบประชุมฝ่าย ข้อ 7)
                    </div>
                    <Link
                      href="/special-blocks"
                      className="text-[11px] text-purple-700 hover:text-purple-900 underline font-medium"
                    >
                      ⚙️ จัดการรายชื่อฝ่าย (ในคาบล็อค)
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {allDivisions.length === 0 ? (
                      <div className="text-xs text-slate-400 py-1">
                        ยังไม่มีรายชื่อฝ่ายในระบบ สามารถไปเพิ่มชื่อฝ่ายได้ที่เมนู{" "}
                        <Link href="/special-blocks" className="text-purple-600 underline font-semibold">
                          คาบล็อค คาบอิสระ & ประชุมฝ่าย
                        </Link>
                      </div>
                    ) : (
                      allDivisions.map((div) => {
                        const checked =
                          activeTeacher.divisionIds.includes(div.id) ||
                          activeTeacher.divisionIds.includes(div.name);
                        return (
                          <label
                            key={div.id}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer select-none transition ${
                              checked
                                ? "border-purple-500 bg-purple-50 text-purple-800 font-semibold shadow-2xs"
                                : "border-slate-200 hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                let next: string[];
                                if (isChecked) {
                                  next = Array.from(
                                    new Set([...activeTeacher.divisionIds, div.id, div.name])
                                  );
                                } else {
                                  next = activeTeacher.divisionIds.filter(
                                    (x) => x !== div.id && x !== div.name
                                  );
                                }
                                upsertTeacher({ ...activeTeacher, divisionIds: next });
                              }}
                              className="accent-purple-600"
                            />
                            <span>{div.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-bold text-slate-800">
                    ตั้งค่าข้อยกเว้นเฉพาะบุคคล (Override ระดับกลุ่มสาระ)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        กฎบ่ายห้าม 3 คาบติด (ข้อ 10)
                      </label>
                      <select
                        value={
                          activeTeacher.exemptAfternoonStreakOverride === null
                            ? "inherit"
                            : activeTeacher.exemptAfternoonStreakOverride
                            ? "true"
                            : "false"
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          upsertTeacher({
                            ...activeTeacher,
                            exemptAfternoonStreakOverride:
                              v === "inherit" ? null : v === "true",
                          });
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1.5"
                      >
                        <option value="inherit">ตามค่าของกลุ่มสาระ</option>
                        <option value="true">ยกเว้น (สอนบ่ายติด 3 คาบได้)</option>
                        <option value="false">บังคับห้ามสอนบ่ายติด 3 คาบ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        เพดานคาบ 8 รายบุคคล (ข้อ 11)
                      </label>
                      <select
                        value={
                          activeTeacher.exemptLatePeriodLimitOverride
                            ? "unlimited"
                            : activeTeacher.maxLatePeriodDaysOverride ?? "inherit"
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "inherit") {
                            upsertTeacher({
                              ...activeTeacher,
                              exemptLatePeriodLimitOverride: null,
                              maxLatePeriodDaysOverride: null,
                            });
                          } else if (v === "unlimited") {
                            upsertTeacher({
                              ...activeTeacher,
                              exemptLatePeriodLimitOverride: true,
                              maxLatePeriodDaysOverride: null,
                            });
                          } else {
                            upsertTeacher({
                              ...activeTeacher,
                              exemptLatePeriodLimitOverride: false,
                              maxLatePeriodDaysOverride: Number(v),
                            });
                          }
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1.5"
                      >
                        <option value="inherit">ตามค่าของกลุ่มสาระ/โรงเรียน</option>
                        <option value="1">สอนคาบ 8 ได้สูงสุด 1 วัน</option>
                        <option value="2">สอนคาบ 8 ได้สูงสุด 2 วัน</option>
                        <option value="3">สอนคาบ 8 ได้สูงสุด 3 วัน</option>
                        <option value="unlimited">ยกเว้น (ไม่จำกัดวันคาบ 8)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-10 rounded-xl border border-slate-200 text-center text-sm text-slate-500">
              กรุณาเลือกหรือเพิ่มรายชื่อครูทางด้านซ้าย
            </div>
          )}
        </div>
      </div>

      {/* Modal: แก้ไขข้อมูลครูผู้สอน (ข้อ 2) */}
      {editingTeacher && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  แก้ไขข้อมูลครูผู้สอน: {editingTeacher.code} {editingTeacher.prefix}
                  {editingTeacher.firstName} {editingTeacher.lastName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingTeacher.firstName.trim()) return;
                upsertTeacher(editingTeacher);
                setEditingTeacher(null);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  คำนำหน้าชื่อ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingTeacher.prefix}
                  onChange={(e) =>
                    setEditingTeacher({
                      ...editingTeacher,
                      prefix: e.target.value,
                    })
                  }
                  placeholder="นาย / นาง / น.ส. / ครู"
                  required
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ชื่อจริง <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingTeacher.firstName}
                    onChange={(e) =>
                      setEditingTeacher({
                        ...editingTeacher,
                        firstName: e.target.value,
                      })
                    }
                    required
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    นามสกุล
                  </label>
                  <input
                    type="text"
                    value={editingTeacher.lastName}
                    onChange={(e) =>
                      setEditingTeacher({
                        ...editingTeacher,
                        lastName: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  กลุ่มสาระการเรียนรู้ <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editingTeacher.departmentId}
                  onChange={(e) =>
                    setEditingTeacher({
                      ...editingTeacher,
                      departmentId: e.target.value,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                >
                  {dataset.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      กลุ่มสาระ{d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  ฝ่ายบริหารที่สังกัด (เพื่อรับการล็อคคาบประชุมฝ่ายอัตโนมัติ):
                </label>
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  {allDivisions.map((div) => {
                    const isMember =
                      editingTeacher.divisionIds.includes(div.id) ||
                      editingTeacher.divisionIds.includes(div.name);
                    return (
                      <label
                        key={div.id}
                        className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900"
                      >
                        <input
                          type="checkbox"
                          checked={isMember}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            const next = isChecked
                              ? Array.from(new Set([...editingTeacher.divisionIds, div.id, div.name]))
                              : editingTeacher.divisionIds.filter(
                                  (id) => id !== div.id && id !== div.name
                                );
                            setEditingTeacher({
                              ...editingTeacher,
                              divisionIds: next,
                            });
                          }}
                          className="w-4 h-4 accent-purple-600 rounded"
                        />
                        <span className="truncate">{div.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingTeacher(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
