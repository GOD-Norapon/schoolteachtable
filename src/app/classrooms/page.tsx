"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";
import { ROOM_TYPE_LABELS, RoomType } from "@/types/timetable";
import { getTeacherFullName, sortClassrooms } from "@/lib/solver/validator";
import { createStandard60Classrooms } from "@/lib/seed-data";
import { SearchableTeacherSelect } from "@/components/SearchableTeacherSelect";

export default function ClassroomsAndRoomsPage() {
  const {
    dataset,
    upsertClassroom,
    bulkUpsertClassrooms,
    deleteClassroom,
    upsertRoom,
    deleteRoom,
  } = useSchoolData();

  const [tab, setTab] = useState<"classrooms" | "rooms">("classrooms");
  const [filterGradeId, setFilterGradeId] = useState<string>("ALL");

  // New Classroom Form
  const [gradeId, setGradeId] = useState(dataset.gradeLevels[0]?.id || "g_m1");
  const [roomNumber, setRoomNumber] = useState<number>(3);
  const [programName, setProgramName] = useState("ห้องเรียนปกติ");
  const [defaultRoomId, setDefaultRoomId] = useState<string>("");
  const [freeCount, setFreeCount] = useState<number>(2);
  const [advisor1, setAdvisor1] = useState<string>("");
  const [advisor2, setAdvisor2] = useState<string>("");
  const [advisor3, setAdvisor3] = useState<string>("");

  // New Physical Room Form
  const [rmCode, setRmCode] = useState("");
  const [rmName, setRmName] = useState("");
  const [rmBuilding, setRmBuilding] = useState("อาคาร 1");
  const [rmType, setRmType] = useState<RoomType>("lab");
  const [rmCap, setRmCap] = useState<number>(1);
  const [rmAllowOverlap, setRmAllowOverlap] = useState(false);

  const filteredClassrooms = useMemo(() => {
    const list =
      filterGradeId === "ALL"
        ? dataset.classrooms
        : dataset.classrooms.filter((c) => c.gradeLevelId === filterGradeId);
    return sortClassrooms(list);
  }, [dataset.classrooms, filterGradeId]);

  const handleGenerateStandard60 = () => {
    if (
      window.confirm(
        "ต้องการสร้าง/เติมเต็มห้องเรียน ม.1/1 ถึง ม.6/10 (ชั้นละ 10 ห้อง รวม 60 ห้อง) หรือไม่?"
      )
    ) {
      const standard60 = createStandard60Classrooms(dataset.term.id);
      bulkUpsertClassrooms(standard60);
    }
  };

  const handleAddClassroom = (e: React.FormEvent) => {
    e.preventDefault();
    const grade = dataset.gradeLevels.find((g) => g.id === gradeId);
    if (!grade) return;
    const name = `${grade.name}/${roomNumber}`;
    const advisors = Array.from(new Set([advisor1, advisor2, advisor3].filter(Boolean))).slice(0, 3);
    upsertClassroom({
      id: `c_${grade.code.toLowerCase()}_${roomNumber}_${Date.now()}`,
      termId: dataset.term.id,
      gradeLevelId: gradeId,
      name,
      roomNumber,
      programName: programName.trim() || "ห้องเรียนปกติ",
      defaultRoomId: defaultRoomId || null,
      advisorTeacherIds: advisors,
      freePeriodsCount: Math.max(0, freeCount),
      lockedFreeSlots: [],
      preferredFreePeriods: [7, 8],
    });
    setAdvisor1("");
    setAdvisor2("");
    setAdvisor3("");
  };

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rmCode.trim() || !rmName.trim()) return;
    upsertRoom({
      id: `rm_${Date.now()}`,
      termId: dataset.term.id,
      code: rmCode.trim().toUpperCase(),
      name: rmName.trim(),
      building: rmBuilding.trim(),
      roomType: rmType,
      maxConcurrentClasses: Math.max(1, rmCap),
      allowOverlap: rmAllowOverlap,
    });
    setRmCode("");
    setRmName("");
    setRmAllowOverlap(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            ห้องเรียนนักเรียน คาบอิสระรายห้อง ครูที่ปรึกษา & ห้องปฏิบัติการร่วม (ข้อ 2, 5, 9, 18)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            ตั้งค่าห้องประจำชั้นเริ่มต้น จำนวนคาบอิสระที่ไม่เท่ากันในแต่ละห้อง ครูที่ปรึกษา และห้องพิเศษที่ใช้ร่วมกัน
          </p>
        </div>

        <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab("classrooms")}
            className={`px-4 py-1.5 rounded-md transition ${
              tab === "classrooms" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600"
            }`}
          >
            ห้องเรียนนักเรียน ({dataset.classrooms.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("rooms")}
            className={`px-4 py-1.5 rounded-md transition ${
              tab === "rooms" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600"
            }`}
          >
            ห้องเรียนจริง / ห้องแล็บร่วม ({dataset.rooms.length})
          </button>
        </div>
      </div>

      {tab === "classrooms" ? (
        <div className="space-y-5">
          {/* Add Classroom Card */}
          <form
            onSubmit={handleAddClassroom}
            className="bg-white p-5 rounded-xl border border-slate-200 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-800">เพิ่มห้องเรียนนักเรียนใหม่</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">ระดับชั้น</label>
                <select
                  value={gradeId}
                  onChange={(e) => setGradeId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2"
                >
                  {dataset.gradeLevels.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">เลขห้องทับ</label>
                <input
                  type="number"
                  min={1}
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">แผนการเรียน</label>
                <input
                  type="text"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  ห้องประจำชั้น (ข้อ 18)
                </label>
                <select
                  value={defaultRoomId}
                  onChange={(e) => setDefaultRoomId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2"
                >
                  <option value="">-- ไม่ระบุ --</option>
                  {dataset.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} - {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  คาบอิสระ (ข้อ 2)
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={freeCount}
                  onChange={(e) => setFreeCount(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  ครูที่ปรึกษา 1 (ข้อ 5)
                </label>
                <SearchableTeacherSelect
                  teachers={dataset.teachers}
                  departments={dataset.departments}
                  value={advisor1}
                  onChange={setAdvisor1}
                  placeholder="-- ครูที่ปรึกษา 1 --"
                  excludeIds={[advisor2, advisor3].filter(Boolean)}
                  allowEmpty
                  emptyLabel="-- ยังไม่ระบุ --"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">ที่ปรึกษา 2</label>
                <SearchableTeacherSelect
                  teachers={dataset.teachers}
                  departments={dataset.departments}
                  value={advisor2}
                  onChange={setAdvisor2}
                  placeholder="-- ครูที่ปรึกษา 2 --"
                  excludeIds={[advisor1, advisor3].filter(Boolean)}
                  allowEmpty
                  emptyLabel="-- ไม่มี --"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block font-semibold text-slate-600 mb-1">ที่ปรึกษา 3</label>
                  <SearchableTeacherSelect
                    teachers={dataset.teachers}
                    departments={dataset.departments}
                    value={advisor3}
                    onChange={setAdvisor3}
                    placeholder="-- ครูที่ปรึกษา 3 --"
                    excludeIds={[advisor1, advisor2].filter(Boolean)}
                    allowEmpty
                    emptyLabel="-- ไม่มี --"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0"
                  title="เพิ่มห้องเรียน"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>

          {/* Grade Filter & Batch Generate Toolbar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-slate-700 mr-1">เลือกระดับชั้น:</span>
              <button
                type="button"
                onClick={() => setFilterGradeId("ALL")}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  filterGradeId === "ALL"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                ทั้งหมด ({dataset.classrooms.length})
              </button>
              {dataset.gradeLevels.map((g) => {
                const count = dataset.classrooms.filter((c) => c.gradeLevelId === g.id).length;
                const active = filterGradeId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setFilterGradeId(g.id)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                      active
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {g.name} ({count} ห้อง)
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleGenerateStandard60}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>สร้างห้องเรียน ม.1/1 – ม.6/10 (ชั้นละ 10 ห้อง รวม 60 ห้อง)</span>
            </button>
          </div>

          {/* Classrooms Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-left">ห้องเรียน</th>
                  <th className="py-2.5 px-3 text-left">แผนการเรียน</th>
                  <th className="py-2.5 px-3 text-left">
                    ห้องเรียนประจำของนักเรียน (ข้อ 18)
                  </th>
                  <th className="py-2.5 px-3 text-left">
                    ครูที่ปรึกษาประจำห้อง (ไม่เกิน 3 คน) — เข้าคุณธรรม & Homeroom (ข้อ 5)
                  </th>
                  <th className="py-2.5 px-3 text-center">จำนวนคาบอิสระ (ข้อ 2)</th>
                  <th className="py-2.5 px-3 text-right">ลบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredClassrooms.map((cls) => (
                  <tr key={cls.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{cls.name}</td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={cls.programName}
                        onChange={(e) =>
                          upsertClassroom({ ...cls, programName: e.target.value })
                        }
                        className="border border-slate-200 rounded px-2 py-1 w-44"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={cls.defaultRoomId || ""}
                        onChange={(e) =>
                          upsertClassroom({
                            ...cls,
                            defaultRoomId: e.target.value || null,
                          })
                        }
                        className="border border-slate-200 rounded px-2 py-1"
                      >
                        <option value="">-- ไม่ระบุห้องเฉพาะ --</option>
                        {dataset.rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code} ({r.name})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-[390px]">
                        {[0, 1, 2].map((slotIdx) => {
                          const currentTid = cls.advisorTeacherIds[slotIdx] || "";
                          const otherTids = cls.advisorTeacherIds.filter(
                            (_, idx) => idx !== slotIdx
                          );
                          return (
                            <div key={slotIdx} className="w-36">
                              <SearchableTeacherSelect
                                teachers={dataset.teachers}
                                departments={dataset.departments}
                                value={currentTid}
                                onChange={(newTid) => {
                                  const next = [...cls.advisorTeacherIds];
                                  next[slotIdx] = newTid;
                                  const cleaned = Array.from(
                                    new Set(next.filter(Boolean))
                                  ).slice(0, 3);
                                  upsertClassroom({
                                    ...cls,
                                    advisorTeacherIds: cleaned,
                                  });
                                }}
                                placeholder={
                                  slotIdx === 0
                                    ? "-- ที่ปรึกษา 1 --"
                                    : slotIdx === 1
                                    ? "-- ที่ปรึกษา 2 --"
                                    : "-- ที่ปรึกษา 3 --"
                                }
                                excludeIds={otherTids}
                                allowEmpty
                                emptyLabel="-- ไม่มี --"
                                size="sm"
                              />
                            </div>
                          );
                        })}
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={25}
                          value={cls.freePeriodsCount}
                          onChange={(e) =>
                            upsertClassroom({
                              ...cls,
                              freePeriodsCount: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="border border-slate-300 rounded px-2 py-1 w-16 text-center font-bold"
                        />
                        <Link
                          href="/time-structure?tab=locked_slots"
                          className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          {cls.lockedFreeSlots && cls.lockedFreeSlots.length > 0 ? (
                            <span className="text-emerald-700 font-semibold">
                              ล็อค {cls.lockedFreeSlots.length} คาบบนตาราง
                            </span>
                          ) : (
                            <span>+ ล็อคช่องบนตาราง</span>
                          )}
                        </Link>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`ยืนยันลบห้อง ${cls.name} และแผนการสอนของห้องนี้?`)) {
                            deleteClassroom(cls.id);
                          }
                        }}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Add Physical Room / Lab Form */}
          <form
            onSubmit={handleAddRoom}
            className="bg-white p-5 rounded-xl border border-slate-200 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-800">
              เพิ่มห้องเรียน / ห้องปฏิบัติการที่ใช้ร่วมกัน (ข้อ 9 และ ข้อ 18)
            </h2>
            <p className="text-xs text-slate-500">
              หากตั้ง &ldquo;จำนวนห้องที่สอนพร้อมกันได้ = 1&rdquo; เมื่อครู 2 คนลงวิชาที่ใช้ห้องนี้ร่วมกัน ระบบจะห้ามจัดคาบชนกันเด็ดขาด
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">รหัสห้อง</label>
                <input
                  type="text"
                  value={rmCode}
                  onChange={(e) => setRmCode(e.target.value)}
                  placeholder="เช่น LAB-BIO"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">ชื่อห้องปฏิบัติการ / ห้องเรียน</label>
                <input
                  type="text"
                  value={rmName}
                  onChange={(e) => setRmName(e.target.value)}
                  placeholder="เช่น ห้องปฏิบัติการชีววิทยา"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">อาคาร</label>
                <input
                  type="text"
                  value={rmBuilding}
                  onChange={(e) => setRmBuilding(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">ประเภทห้อง</label>
                <select
                  value={rmType}
                  onChange={(e) => setRmType(e.target.value as RoomType)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2"
                >
                  {Object.entries(ROOM_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block font-semibold text-slate-600 mb-1">สอนพร้อมกันสูงสุด</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={rmCap}
                    onChange={(e) => setRmCap(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-center"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  + เพิ่ม
                </button>
              </div>

              <div className="md:col-span-2 lg:col-span-5 flex items-center justify-between p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-purple-900">
                  <input
                    type="checkbox"
                    checked={rmAllowOverlap}
                    onChange={(e) => setRmAllowOverlap(e.target.checked)}
                    className="rounded text-purple-600 border-purple-300"
                  />
                  <span>
                    อนุญาตให้จัดตารางสอนทับซ้อนกันได้ในห้องนี้ (ข้อ 4: เช่น 1/6 ใช้ร่วมกับ 2/5 สลับสัปดาห์เนื่องจากห้องไม่พอ)
                  </span>
                </label>
              </div>
            </div>
          </form>

          {/* Rooms Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-left">รหัสห้อง</th>
                  <th className="py-2.5 px-3 text-left">ชื่อห้อง</th>
                  <th className="py-2.5 px-3 text-left">อาคาร</th>
                  <th className="py-2.5 px-3 text-left">ประเภท</th>
                  <th className="py-2.5 px-3 text-center">จัดทับซ้อน (ข้อ 4)</th>
                  <th className="py-2.5 px-3 text-center">ความจุพร้อมกัน</th>
                  <th className="py-2.5 px-3 text-right">ลบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {dataset.rooms.map((rm) => (
                  <tr key={rm.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{rm.code}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{rm.name}</td>
                    <td className="py-2.5 px-3 text-slate-600">{rm.building}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {ROOM_TYPE_LABELS[rm.roomType]}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          upsertRoom({
                            ...rm,
                            allowOverlap: !rm.allowOverlap,
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                          rm.allowOverlap
                            ? "bg-purple-100 text-purple-800 border-purple-300 shadow-xs"
                            : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                        }`}
                        title={
                          rm.allowOverlap
                            ? "อนุญาตให้จัดตารางสอนทับซ้อนกันได้ (ใช้สลับสัปดาห์ / สิทธิ์ใช้ร่วมกัน)"
                            : "คลิกเพื่ออนุญาตให้จัดทับซ้อนกันได้"
                        }
                      >
                        {rm.allowOverlap ? "✓ จัดทับซ้อนได้ (สลับสัปดาห์)" : "✕ ห้ามทับซ้อน"}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={rm.maxConcurrentClasses}
                        onChange={(e) =>
                          upsertRoom({
                            ...rm,
                            maxConcurrentClasses: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="border border-slate-200 rounded px-2 py-1 w-16 text-center font-bold"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => deleteRoom(rm.id)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
