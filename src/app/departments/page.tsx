"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Layers, Plus, Trash2 } from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";

export default function DepartmentsAndMeetingsPage() {
  const {
    dataset,
    upsertDepartment,
    deleteDepartment,
  } = useSchoolData();

  // New Dept Form
  const [deptCode, setDeptCode] = useState("");
  const [deptName, setDeptName] = useState("");
  const [deptColor, setDeptColor] = useState("#2563eb");

  const handleAddDept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptCode.trim() || !deptName.trim()) return;
    upsertDepartment({
      id: `dept_${Date.now()}`,
      termId: dataset.term.id,
      code: deptCode.trim().toUpperCase(),
      name: deptName.trim(),
      color: deptColor,
      exemptAfternoonStreak: false,
      exemptLatePeriodLimit: false,
      customMaxLatePeriodDays: null,
      isEntryCompleted: false,
      completedBy: null,
    });
    setDeptCode("");
    setDeptName("");
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="bg-white p-5 rounded-xl border border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          กลุ่มสาระการเรียนรู้ & ข้อยกเว้นภาระงานครู (ข้อ 10, 11)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          กำหนดรายชื่อกลุ่มสาระการเรียนรู้ และข้อยกเว้นการสอนช่วงบ่าย 3 คาบติด (ข้อ 10) หรือเพดานคาบ 8 (ข้อ 11) • สำหรับคาบประชุมฝ่าย ให้ไปจัดการที่เมนู{" "}
          <Link href="/special-blocks" className="text-blue-600 underline font-semibold">
            คาบล็อค คาบอิสระ & ประชุมฝ่าย
          </Link>
        </p>
      </div>

      {/* Section 1: กลุ่มสาระการเรียนรู้ + ตั้งค่ายกเว้นกฎข้อ 10 & 11 */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">
          1. รายชื่อกลุ่มสาระการเรียนรู้ และการยกเว้นกฎภาระงานครู (ข้อ 10, 11)
        </h2>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-left">รหัส</th>
                <th className="py-2.5 px-3 text-left">ชื่อกลุ่มสาระการเรียนรู้</th>
                <th className="py-2.5 px-3 text-center">จำนวนครู</th>
                <th className="py-2.5 px-3 text-center">
                  ยกเว้นห้ามบ่าย 3 คาบติด (ข้อ 10)
                </th>
                <th className="py-2.5 px-3 text-center">
                  ยกเว้นเพดานคาบ 8 (ข้อ 11)
                </th>
                <th className="py-2.5 px-3 text-center">เพดานคาบ 8 เฉพาะสาระ</th>
                <th className="py-2.5 px-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {dataset.departments.map((dept) => {
                const tCount = dataset.teachers.filter((t) => t.departmentId === dept.id).length;
                return (
                  <tr key={dept.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
                        style={{ backgroundColor: dept.color }}
                      />
                      {dept.code}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{dept.name}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{tCount} คน</td>
                    <td className="py-2.5 px-3 text-center">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dept.exemptAfternoonStreak}
                          onChange={(e) =>
                            upsertDepartment({
                              ...dept,
                              exemptAfternoonStreak: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className={dept.exemptAfternoonStreak ? "text-blue-700 font-semibold" : "text-slate-500"}>
                          {dept.exemptAfternoonStreak ? "ยกเว้น (สอนติดได้)" : "ตามกฎปกติ"}
                        </span>
                      </label>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dept.exemptLatePeriodLimit}
                          onChange={(e) =>
                            upsertDepartment({
                              ...dept,
                              exemptLatePeriodLimit: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className={dept.exemptLatePeriodLimit ? "text-blue-700 font-semibold" : "text-slate-500"}>
                          {dept.exemptLatePeriodLimit ? "ยกเว้น (ไม่จำกัด)" : "จำกัดวัน"}
                        </span>
                      </label>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <select
                        disabled={dept.exemptLatePeriodLimit}
                        value={dept.customMaxLatePeriodDays ?? ""}
                        onChange={(e) =>
                          upsertDepartment({
                            ...dept,
                            customMaxLatePeriodDays: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="border border-slate-300 rounded px-2 py-1 disabled:opacity-40"
                      >
                        <option value="">
                          ใช้ค่ากลาง ({dataset.term.solverSettings.maxLatePeriodDaysPerWeek} วัน)
                        </option>
                        <option value="1">ไม่เกิน 1 วัน/สัปดาห์</option>
                        <option value="2">ไม่เกิน 2 วัน/สัปดาห์</option>
                        <option value="3">ไม่เกิน 3 วัน/สัปดาห์</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (tCount > 0) {
                            window.alert("ไม่สามารถลบกลุ่มสาระที่ยังมีรายชื่อครูสังกัดอยู่ได้");
                            return;
                          }
                          deleteDepartment(dept.id);
                        }}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleAddDept} className="flex flex-wrap items-end gap-2.5 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">รหัสย่อ</label>
            <input
              type="text"
              value={deptCode}
              onChange={(e) => setDeptCode(e.target.value)}
              placeholder="เช่น FR"
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-24"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              เพิ่มกลุ่มสาระใหม่
            </label>
            <input
              type="text"
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="ชื่อกลุ่มสาระ..."
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">สีสัญลักษณ์</label>
            <input
              type="color"
              value={deptColor}
              onChange={(e) => setDeptColor(e.target.value)}
              className="h-8 w-12 border border-slate-300 rounded cursor-pointer"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มกลุ่มสาระ
          </button>
        </form>
      </div>
    </div>
  );
}
