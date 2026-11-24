"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Coffee,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";
import {
  BreakConfig,
  DAY_LABELS,
  DayOfWeek,
  PeriodConfig,
} from "@/types/timetable";
import { canSpanConsecutivePeriods } from "@/lib/solver/validator";

const ALL_DAYS: DayOfWeek[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function TimeStructurePage() {
  const router = useRouter();
  const { dataset, updateTerm } = useSchoolData();

  // Draft Term state
  const [termDraft, setTermDraft] = useState(dataset.term);
  const [savedToast, setSavedToast] = useState(false);

  // Sync draft if term changes externally
  useEffect(() => {
    setTermDraft(dataset.term);
  }, [dataset.term]);

  // Helper functions for Term editing
  const toggleDay = (day: DayOfWeek) => {
    setTermDraft((prev) => {
      const exists = prev.daysOfWeek.includes(day);
      const nextDays = exists
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day];
      const ordered = ALL_DAYS.filter((d) => nextDays.includes(d));
      return { ...prev, daysOfWeek: ordered };
    });
  };

  const updatePeriodField = (
    idx: number,
    field: keyof PeriodConfig,
    val: string | boolean | "morning" | "afternoon"
  ) => {
    setTermDraft((prev) => {
      const nextList = [...prev.periodsConfig];
      nextList[idx] = { ...nextList[idx], [field]: val };
      return { ...prev, periodsConfig: nextList };
    });
  };

  const addPeriod = () => {
    setTermDraft((prev) => {
      const nextNum = prev.periodsConfig.length + 1;
      const last = prev.periodsConfig[prev.periodsConfig.length - 1];
      let start = "15:10";
      let end = "16:00";
      if (last) {
        start = last.endTime;
        const [h, m] = last.endTime.split(":").map(Number);
        const endTotal = h * 60 + m + 50;
        const eh = String(Math.floor(endTotal / 60)).padStart(2, "0");
        const em = String(endTotal % 60).padStart(2, "0");
        end = `${eh}:${em}`;
      }
      const newPc: PeriodConfig = {
        period: nextNum,
        label: `คาบ ${nextNum}`,
        startTime: start,
        endTime: end,
        session: nextNum <= 4 ? "morning" : "afternoon",
        isLatePeriod: nextNum >= 8,
      };
      return { ...prev, periodsConfig: [...prev.periodsConfig, newPc] };
    });
  };

  const removeLastPeriod = () => {
    setTermDraft((prev) => {
      if (prev.periodsConfig.length <= 4) return prev;
      return { ...prev, periodsConfig: prev.periodsConfig.slice(0, -1) };
    });
  };

  const addBreak = () => {
    setTermDraft((prev) => {
      const newBrk: BreakConfig = {
        id: `brk_${Date.now()}`,
        label: "พักเบรกระหว่างคาบ",
        afterPeriod: 2,
        durationMinutes: 20,
        blocksConsecutive: true,
      };
      return { ...prev, breaksConfig: [...prev.breaksConfig, newBrk] };
    });
  };

  const removeBreak = (id: string) => {
    setTermDraft((prev) => ({
      ...prev,
      breaksConfig: prev.breaksConfig.filter((b) => b.id !== id),
    }));
  };

  const updateBreakField = (
    id: string,
    field: keyof BreakConfig,
    val: string | number | boolean
  ) => {
    setTermDraft((prev) => ({
      ...prev,
      breaksConfig: prev.breaksConfig.map((b) => (b.id === id ? { ...b, [field]: val } : b)),
    }));
  };

  const handleSave = (andGoToSpecialBlocks = false) => {
    updateTerm(termDraft);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
    if (andGoToSpecialBlocks) {
      router.push("/special-blocks");
    }
  };

  // Double period validity for morning check
  const validMorningDoublePairs = termDraft.periodsConfig
    .filter((p) => p.session === "morning")
    .filter((p) => {
      const nextP = termDraft.periodsConfig.find((x) => x.period === p.period + 1);
      return (
        nextP?.session === "morning" &&
        canSpanConsecutivePeriods(termDraft, p.period, 2).valid
      );
    })
    .map((p) => `คาบ ${p.period}–${p.period + 1}`);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-blue-600" />
              โครงสร้างเวลาเรียน & เวลาพัก (เมนู 1. ตั้งค่าโครงสร้างพื้นฐาน)
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              กำหนดเวลาเริ่มต้น–สิ้นสุดของคาบเรียน 1–8, กำหนดช่วงเวลาพักเบรกเช้า 20 นาที และพักกลางวัน
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/special-blocks"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition"
            >
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span>ไปที่เมนู: คาบล็อค คาบอิสระ & ประชุมฝ่าย</span>
              <ArrowRight className="w-3.5 h-3.5 text-purple-600" />
            </Link>
            <button
              type="button"
              onClick={() => handleSave(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
            >
              <Save className="w-4 h-4" /> บันทึกโครงสร้างเวลา
            </button>
          </div>
        </div>

        {/* Informative Callout Banner */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-slate-700">
            <Sparkles className="w-4.5 h-4.5 text-purple-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900">
                การกำหนดคาบอิสระ คาบล็อคกิจกรรม (ทั้งโรงเรียน / ระดับชั้น / วิชาเลือก) และล็อคประชุมฝ่าย:
              </span>{" "}
              รวมไว้ในหน้ารูปแบบตารางเรียนที่คลิกเลือกในช่องได้ทันที
            </div>
          </div>
          <Link
            href="/special-blocks"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-purple-300 text-purple-700 font-bold hover:bg-purple-50 transition shadow-2xs"
          >
            <span>คลิกไปกำหนดคาบล็อคบนตารางเรียน</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {savedToast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          บันทึกโครงสร้างเวลาเรียนเรียบร้อยแล้ว!
        </div>
      )}

      {/* School Info & Active Days */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">
          1.1 ข้อมูลโรงเรียน ภาคเรียน และวันเปิดเรียน
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">ชื่อโรงเรียน</label>
            <input
              type="text"
              value={termDraft.schoolName}
              onChange={(e) => setTermDraft({ ...termDraft, schoolName: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">ภาคเรียนที่</label>
            <input
              type="text"
              value={termDraft.semester}
              onChange={(e) =>
                setTermDraft({
                  ...termDraft,
                  semester: e.target.value,
                  name: `ภาคเรียนที่ ${e.target.value} ปีการศึกษา ${termDraft.academicYear}`,
                })
              }
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">ปีการศึกษา</label>
            <input
              type="text"
              value={termDraft.academicYear}
              onChange={(e) =>
                setTermDraft({
                  ...termDraft,
                  academicYear: e.target.value,
                  name: `ภาคเรียนที่ ${termDraft.semester} ปีการศึกษา ${e.target.value}`,
                })
              }
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">
            วันเปิดเรียนในตารางสอน (รวม{" "}
            {termDraft.daysOfWeek.length * termDraft.periodsConfig.length} คาบ/สัปดาห์)
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_DAYS.map((d) => {
              const active = termDraft.daysOfWeek.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    active
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {DAY_LABELS[d].full}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Periods Table */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              1.2 ตารางกำหนดเวลาแต่ละคาบเรียน ({termDraft.periodsConfig.length} คาบ/วัน)
            </h2>
            <p className="text-xs text-slate-500">
              กำหนดเวลาเริ่ม–สิ้นสุด ระบุช่วงเช้า/ช่วงบ่าย และระบุคาบท้ายวัน เช่น คาบ 8 (เพดานคาบ 8)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={removeLastPeriod}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium hover:bg-slate-50"
            >
              - ลดคาบสุดท้าย
            </button>
            <button
              type="button"
              onClick={addPeriod}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              <Plus className="w-3.5 h-3.5" /> เพิ่มคาบเรียน
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-center">คาบที่</th>
                <th className="py-2.5 px-3 text-left">ป้ายชื่อคาบ</th>
                <th className="py-2.5 px-3 text-center">เวลาเริ่ม</th>
                <th className="py-2.5 px-3 text-center">เวลาสิ้นสุด</th>
                <th className="py-2.5 px-3 text-center">ช่วงเวลา (เช้า / บ่าย)</th>
                <th className="py-2.5 px-3 text-center">นับเป็นคาบท้ายวัน (คาบ 8)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {termDraft.periodsConfig.map((pc, idx) => (
                <tr key={pc.period} className="hover:bg-slate-50">
                  <td className="py-2 px-3 text-center font-bold">{pc.period}</td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={pc.label}
                      onChange={(e) => updatePeriodField(idx, "label", e.target.value)}
                      className="border border-slate-300 rounded px-2 py-1 w-28"
                    />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input
                      type="time"
                      value={pc.startTime}
                      onChange={(e) => updatePeriodField(idx, "startTime", e.target.value)}
                      className="border border-slate-300 rounded px-2 py-1"
                    />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input
                      type="time"
                      value={pc.endTime}
                      onChange={(e) => updatePeriodField(idx, "endTime", e.target.value)}
                      className="border border-slate-300 rounded px-2 py-1"
                    />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <select
                      value={pc.session}
                      onChange={(e) =>
                        updatePeriodField(idx, "session", e.target.value as "morning" | "afternoon")
                      }
                      className="border border-slate-300 rounded px-2.5 py-1"
                    >
                      <option value="morning">ช่วงเช้า (Morning)</option>
                      <option value="afternoon">ช่วงบ่าย (Afternoon)</option>
                    </select>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={pc.isLatePeriod}
                      onChange={(e) => updatePeriodField(idx, "isLatePeriod", e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Breaks Config (พักเบรก 20 นาที ระหว่างคาบ 2-3 และพักกลางวัน) */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Coffee className="w-4 h-4 text-amber-600" />
              1.3 จุดพักเบรกระหว่างคาบ & พักกลางวัน
            </h2>
            <p className="text-xs text-slate-500">
              หากเปิด &ldquo;ห้ามลงคาบคู่คร่อมจุดพัก&rdquo; ระบบจะบังคับให้คาบคู่ช่วงเช้าลงได้เฉพาะ{" "}
              <strong className="text-blue-700">
                {validMorningDoublePairs.join(" หรือ ") || "ไม่มี"}
              </strong>{" "}
              เท่านั้น
            </p>
          </div>
          <button
            type="button"
            onClick={addBreak}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มจุดพักเบรก
          </button>
        </div>

        <div className="space-y-2.5">
          {termDraft.breaksConfig.map((brk) => (
            <div
              key={brk.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center p-3 rounded-lg bg-amber-50/50 border border-amber-200 text-xs"
            >
              <div className="md:col-span-3">
                <label className="block font-semibold text-slate-600 mb-1">คั่นหลังคาบที่</label>
                <select
                  value={brk.afterPeriod}
                  onChange={(e) =>
                    updateBreakField(brk.id, "afterPeriod", Number(e.target.value))
                  }
                  className="w-full border border-slate-300 bg-white rounded px-2 py-1.5"
                >
                  {termDraft.periodsConfig.slice(0, -1).map((p) => (
                    <option key={p.period} value={p.period}>
                      หลังคาบ {p.period} (คั่นระหว่างคาบ {p.period} และ {p.period + 1})
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">เวลาพัก (นาที)</label>
                <input
                  type="number"
                  min={5}
                  value={brk.durationMinutes}
                  onChange={(e) =>
                    updateBreakField(brk.id, "durationMinutes", Number(e.target.value))
                  }
                  className="w-full border border-slate-300 bg-white rounded px-2 py-1.5"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block font-semibold text-slate-600 mb-1">ข้อความแสดงในตาราง</label>
                <input
                  type="text"
                  value={brk.label}
                  onChange={(e) => updateBreakField(brk.id, "label", e.target.value)}
                  className="w-full border border-slate-300 bg-white rounded px-2 py-1.5"
                />
              </div>
              <div className="md:col-span-2 flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  checked={brk.blocksConsecutive}
                  onChange={(e) =>
                    updateBreakField(brk.id, "blocksConsecutive", e.target.checked)
                  }
                  className="w-4 h-4 accent-amber-600"
                />
                <span className="font-medium text-slate-700">ห้ามคาบคู่คร่อม</span>
              </div>
              <div className="md:col-span-1 flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => removeBreak(brk.id)}
                  className="p-1.5 text-rose-600 hover:bg-rose-100 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Call-to-action button */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-bold text-sm text-blue-950">
            เมื่อตั้งค่าเวลาเรียนและเวลาพักเรียบร้อยแล้ว บันทึกและไปยังเมนูกำหนดคาบล็อคต่อ
          </div>
          <div className="text-xs text-blue-700 mt-0.5">
            ไประบุคาบอิสระของแต่ละห้อง, คาบกิจกรรมทั้งโรงเรียน, คาบระดับชั้น, วิชาเลือก และคาบประชุมฝ่าย
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleSave(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold"
          >
            <Save className="w-4 h-4" />
            <span>บันทึกหน้านี้</span>
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow"
          >
            <span>บันทึกและไปกำหนดคาบล็อคต่อ</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
