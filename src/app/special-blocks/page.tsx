"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  GraduationCap,
  Layers,
  Lock,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";
import {
  DAY_LABELS,
  DayOfWeek,
  Division,
  ElectiveOffering,
  GroupMeetingLock,
  SYNC_BLOCK_TYPE_LABELS,
  SyncBlockType,
  SynchronizedBlock,
  Teacher,
} from "@/types/timetable";
import {
  getTeacherFullName,
  resolveSyncBlockTeachers,
  sortClassrooms,
  calculateTeacherWorkload,
  findTeacherSlotConflicts,
  TeacherSlotConflict,
} from "@/lib/solver/validator";
import { SearchableTeacherSelect } from "@/components/SearchableTeacherSelect";

type SpecialBlockCategory = "school" | "grade" | "parallel" | "elective" | "meetings";
type GridSubView = "classrooms" | "teachers";
type ClassroomModalTab = "free_period" | "school_lock" | "grade_sync" | "parallel_subject" | "elective_pool";

interface VisualSlotColumn {
  kind: "period" | "break";
  period?: number;
  label: string;
  sublabel: string;
  isLate?: boolean;
}

export default function SpecialBlocksPage() {
  const {
    dataset,
    upsertClassroom,
    upsertTeacher,
    upsertDivision,
    deleteDivision,
    upsertSyncBlock,
    deleteSyncBlock,
    upsertMeetingLock,
    deleteMeetingLock,
  } = useSchoolData();

  // Sub-view on Timetable Grid: ตารางห้องเรียนนักเรียน vs ตารางครู & คาบประชุมฝ่าย
  const [gridSubView, setGridSubView] = useState<GridSubView>("classrooms");

  // Category Tab for the Summary List below the Grid (ข้อ 4 & 5)
  const [activeCategory, setActiveCategory] = useState<SpecialBlockCategory>("school");

  // =========================================================================
  // State: ตารางห้องเรียนนักเรียน (Classroom Timetable View)
  // =========================================================================
  const [selectedGradeId, setSelectedGradeId] = useState<string>("ALL");
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(
    () => dataset.classrooms[0]?.id || ""
  );
  const [batchMode, setBatchMode] = useState<boolean>(false);
  const [batchRoomIds, setBatchRoomIds] = useState<string[]>([]);

  // Filtered & naturally sorted classrooms (1-10)
  const availableClassrooms = useMemo(() => {
    let list = dataset.classrooms;
    if (selectedGradeId !== "ALL") {
      list = list.filter((c) => c.gradeLevelId === selectedGradeId);
    }
    return sortClassrooms(list);
  }, [dataset.classrooms, selectedGradeId]);

  // Active classroom
  const activeClassroom = useMemo(() => {
    return (
      dataset.classrooms.find((c) => c.id === selectedClassroomId) ||
      availableClassrooms[0] ||
      dataset.classrooms[0]
    );
  }, [dataset.classrooms, selectedClassroomId, availableClassrooms]);

  // Target rooms for operations (Free period / Batch)
  const targetClassroomIds = useMemo(() => {
    if (batchMode && batchRoomIds.length > 0) {
      return batchRoomIds;
    }
    return activeClassroom ? [activeClassroom.id] : [];
  }, [batchMode, batchRoomIds, activeClassroom]);

  // Room Summary status strip
  const activeRoomSummary = useMemo(() => {
    if (!activeClassroom) {
      return { freeSlots: 0, syncBlocksCount: 0, syncBlockPeriods: 0, totalSlots: 40, remainingForAcademic: 40 };
    }
    const totalSlots = dataset.term.daysOfWeek.length * dataset.term.periodsConfig.length;
    const freeSlots = activeClassroom.lockedFreeSlots?.length || 0;
    const roomSyncs = dataset.synchronizedBlocks.filter((b) =>
      b.classroomIds.includes(activeClassroom.id)
    );
    const syncBlockPeriods = roomSyncs.reduce((sum, b) => sum + b.duration, 0);
    return {
      freeSlots,
      syncBlocksCount: roomSyncs.length,
      syncBlockPeriods,
      totalSlots,
      remainingForAcademic: Math.max(0, totalSlots - freeSlots - syncBlockPeriods),
    };
  }, [activeClassroom, dataset.term.daysOfWeek.length, dataset.term.periodsConfig.length, dataset.synchronizedBlocks]);

  // =========================================================================
  // State: ตารางครู & คาบประชุมฝ่าย (Teacher Timetable View)
  // =========================================================================
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    () => dataset.teachers[0]?.id || ""
  );
  const [teacherSearch, setTeacherSearch] = useState<string>("");
  const [quickEditTeacher, setQuickEditTeacher] = useState<Teacher | null>(null);

  const activeTeacher = useMemo(() => {
    return dataset.teachers.find((t) => t.id === selectedTeacherId) || dataset.teachers[0];
  }, [dataset.teachers, selectedTeacherId]);

  const activeTeacherWorkload = useMemo(() => {
    return activeTeacher ? calculateTeacherWorkload(activeTeacher.id, dataset) : null;
  }, [activeTeacher, dataset]);

  // =========================================================================
  // Modals on Timetable Cells
  // =========================================================================
  // 1. Classroom Cell Modal (เมื่อคลิกช่องในตารางห้องเรียน)
  const [classroomCellModal, setClassroomCellModal] = useState<{
    day: DayOfWeek;
    period: number;
  } | null>(null);
  const [modalMode, setModalMode] = useState<ClassroomModalTab>("free_period");
  const [editingSyncBlockId, setEditingSyncBlockId] = useState<string | null>(null);

  // Form states inside Classroom Cell Modal
  // A. School-wide
  const [cellSchoolTitle, setCellSchoolTitle] = useState("กิจกรรมชุมนุม");
  const [cellSchoolCode, setCellSchoolCode] = useState("ก20902");
  const [cellSchoolDuration, setCellSchoolDuration] = useState<number>(1);
  const [cellSchoolBindAllTeachers, setCellSchoolBindAllTeachers] = useState<boolean>(true);
  const [cellSchoolRoomId, setCellSchoolRoomId] = useState<string>("");

  // B. Grade-level
  const [cellGradeBlockType, setCellGradeBlockType] = useState<SyncBlockType>("grade_sync");
  const [cellGradeTitle, setCellGradeTitle] = useState("ลูกเสือ-เนตรนารี");
  const [cellGradeCode, setCellGradeCode] = useState("ก21903");
  const [cellGradeDuration, setCellGradeDuration] = useState<number>(1);
  const [cellGradeScope, setCellGradeScope] = useState<"current_grade" | "current_room" | "custom" | "all_rooms">("current_grade");
  const [cellGradeBindAdvisors, setCellGradeBindAdvisors] = useState<boolean>(true);
  const [cellGradeExtraTeacherIds, setCellGradeExtraTeacherIds] = useState<string[]>([]);
  const [cellGradeRoomId, setCellGradeRoomId] = useState<string>("");
  const [cellStudentOnly, setCellStudentOnly] = useState<boolean>(false);
  const [cellExcludedTeacherIds, setCellExcludedTeacherIds] = useState<string[]>([]);
  const [cellCoexistTeacherIds, setCellCoexistTeacherIds] = useState<string[]>([]);
  const [modalSelectedRoomIds, setModalSelectedRoomIds] = useState<string[]>([]);

  // C. Elective Pool
  const [cellElecTitle, setCellElecTitle] = useState("กลุ่มวิชาเลือกเสรี");
  const [cellElecDuration, setCellElecDuration] = useState<number>(2);
  const [cellElecRoomIds, setCellElecRoomIds] = useState<string[]>([]);
  const [cellElecOfferings, setCellElecOfferings] = useState<ElectiveOffering[]>([]);
  const [cellOffCode, setCellOffCode] = useState("");
  const [cellOffName, setCellOffName] = useState("");
  const [cellOffDeptId, setCellOffDeptId] = useState("");
  const [cellOffTeacherId, setCellOffTeacherId] = useState("");
  const [cellOffCoTeacherIds, setCellOffCoTeacherIds] = useState<string[]>([]);
  const [cellOffRoomId, setCellOffRoomId] = useState("");

  // D. Parallel Subject (วิชาเรียนพร้อมกันแต่แยกครูประจำห้อง เช่น IS)
  const [cellParallelTitle, setCellParallelTitle] = useState("การศึกษาค้นคว้าด้วยตนเอง (IS)");
  const [cellParallelCode, setCellParallelCode] = useState("I30201");
  const [cellParallelDuration, setCellParallelDuration] = useState<number>(1);
  const [cellParallelRoomIds, setCellParallelRoomIds] = useState<string[]>([]);
  const [cellParallelTeacherMap, setCellParallelTeacherMap] = useState<Record<string, string>>({});

  // 2. Teacher Cell Modal (เมื่อคลิกช่องในตารางครู หรือกดปุ่มเพิ่ม/แก้ไขคาบประชุมฝ่าย)
  const [teacherCellModal, setTeacherCellModal] = useState<{
    day: DayOfWeek;
    period: number;
    editingMeetingId?: string | null;
  } | null>(null);
  const [mtgDay, setMtgDay] = useState<DayOfWeek>("MON");
  const [mtgStartPeriod, setMtgStartPeriod] = useState<number>(7);
  const [mtgDivisionName, setMtgDivisionName] = useState<string>("ฝ่ายบริหารวิชาการ");
  const [mtgTitle, setMtgTitle] = useState<string>("ประชุมฝ่ายบริหารวิชาการ");
  const [mtgDuration, setMtgDuration] = useState<number>(1);
  const [mtgTeacherIds, setMtgTeacherIds] = useState<string[]>([]);
  const [mtgRoomId, setMtgRoomId] = useState<string>("");

  // State: จัดการรายชื่อฝ่ายบริหารในหน้าคาบล็อค
  const [newDivisionInput, setNewDivisionInput] = useState("");
  const [editingDivision, setEditingDivision] = useState<{ id: string; name: string } | null>(null);

  // Copy modal state
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyTargetRoomIds, setCopyTargetRoomIds] = useState<string[]>([]);

  // =========================================================================
  // Visual Slot Columns (Periods + Breaks)
  // =========================================================================
  const visualCols = useMemo(() => {
    const cols: VisualSlotColumn[] = [];
    const periods = dataset.term.periodsConfig || [];
    const breaks = dataset.term.breaksConfig || [];

    periods.forEach((p) => {
      cols.push({
        kind: "period",
        period: p.period,
        label: `คาบ ${p.period}`,
        sublabel: `${p.startTime}-${p.endTime}`,
        isLate: p.isLatePeriod,
      });

      const b = breaks.find((brk) => brk.afterPeriod === p.period);
      if (b) {
        cols.push({
          kind: "break",
          label: b.durationMinutes <= 25 ? `พัก ${b.durationMinutes}น.` : "พักกลางวัน",
          sublabel: b.label,
        });
      }
    });

    return cols;
  }, [dataset.term.periodsConfig, dataset.term.breaksConfig]);

  // =========================================================================
  // Handlers: Classroom Slots & Free Periods
  // =========================================================================
  const handleToggleFreeSlot = (roomIds: string[], day: DayOfWeek, period: number) => {
    for (const rid of roomIds) {
      const cls = dataset.classrooms.find((c) => c.id === rid);
      if (!cls) continue;
      const exists = cls.lockedFreeSlots?.some((s) => s.day === day && s.period === period);
      const updatedSlots = exists
        ? (cls.lockedFreeSlots || []).filter((s) => !(s.day === day && s.period === period))
        : [...(cls.lockedFreeSlots || []), { day, period }];

      upsertClassroom({
        ...cls,
        lockedFreeSlots: updatedSlots,
        freePeriodsCount: Math.max(cls.freePeriodsCount || 0, updatedSlots.length),
      });
    }
  };

  const handleClearAllFreeSlots = (room: typeof activeClassroom) => {
    if (!room) return;
    if (window.confirm(`ต้องการปลดล็อคคาบอิสระทั้งหมดของห้อง ${room.name} ใช่หรือไม่?`)) {
      upsertClassroom({
        ...room,
        lockedFreeSlots: [],
        freePeriodsCount: 0,
      });
    }
  };

  const handleCopyFreeSlotsToRooms = () => {
    if (!activeClassroom || copyTargetRoomIds.length === 0) return;
    const sourceSlots = activeClassroom.lockedFreeSlots || [];
    for (const rid of copyTargetRoomIds) {
      const targetCls = dataset.classrooms.find((c) => c.id === rid);
      if (!targetCls) continue;
      upsertClassroom({
        ...targetCls,
        lockedFreeSlots: [...sourceSlots],
        freePeriodsCount: Math.max(targetCls.freePeriodsCount || 0, sourceSlots.length),
      });
    }
    setCopyModalOpen(false);
  };

  // Open Classroom Modal on clicked cell (โหมดสร้างใหม่)
  const handleOpenClassroomCellModal = (day: DayOfWeek, period: number) => {
    setEditingSyncBlockId(null);
    setClassroomCellModal({ day, period });
    setModalMode("free_period");

    const initRooms = batchMode && batchRoomIds.length > 0
      ? [...batchRoomIds]
      : activeClassroom
      ? [activeClassroom.id]
      : dataset.classrooms[0]
      ? [dataset.classrooms[0].id]
      : [];
    setModalSelectedRoomIds(initRooms);

    setCellSchoolTitle("กิจกรรมชุมนุม");
    setCellSchoolCode("ก20902");
    setCellSchoolDuration(1);
    setCellSchoolBindAllTeachers(true);
    setCellSchoolRoomId("");

    setCellGradeBlockType("grade_sync");
    const gradeName = activeClassroom ? activeClassroom.name.split("/")[0] : "";
    setCellGradeTitle(`ลูกเสือ-เนตรนารี ${gradeName}`);
    setCellGradeCode("ก21903");
    setCellGradeDuration(1);
    setCellGradeScope("current_grade");
    setCellGradeBindAdvisors(true); // ค่าเริ่มต้น: ดึงครูที่ปรึกษาเข้าคาบ (ลงทั้งครูและนักเรียน)
    setCellGradeExtraTeacherIds([]);
    setCellGradeRoomId("");
    setCellStudentOnly(false); // ค่าเริ่มต้น: ลงทั้งคู่ (หากไม่ต้องการให้ลงครูผู้ใช้จะติ๊กเอง)
    setCellExcludedTeacherIds([]);
    setCellCoexistTeacherIds([]);

    setCellElecTitle(`กลุ่มวิชาเลือกเสรี ${gradeName}`);
    setCellElecDuration(2);
    setCellElecRoomIds(activeClassroom ? [activeClassroom.id] : []);
    setCellElecOfferings([]);

    const gradeRooms = activeClassroom
      ? dataset.classrooms.filter((c) => c.gradeLevelId === activeClassroom.gradeLevelId)
      : dataset.classrooms.slice(0, 5);
    const gName = activeClassroom ? activeClassroom.name.split("/")[0] : "ม.5";
    setCellParallelTitle(`การศึกษาค้นคว้าด้วยตนเอง (IS ${gName})`);
    setCellParallelCode("I30201");
    setCellParallelDuration(1);
    setCellParallelRoomIds(gradeRooms.map((c) => c.id));
    const initParallelMap: Record<string, string> = {};
    gradeRooms.forEach((c) => {
      initParallelMap[c.id] = c.advisorTeacherIds?.[0] || "";
    });
    setCellParallelTeacherMap(initParallelMap);
  };

  // Open Classroom Modal in Edit Mode (ข้อ 1: คาบวิชาเลือกและคาบล็อคปรับให้แก้ไขได้)
  const handleOpenEditSyncBlock = (block: SynchronizedBlock) => {
    setEditingSyncBlockId(block.id);
    if (block.classroomIds && block.classroomIds.length > 0) {
      setSelectedClassroomId(block.classroomIds[0]);
    }
    const day = block.fixedDay || "MON";
    const period = block.fixedStartPeriod || 1;
    setClassroomCellModal({ day, period });
    setModalSelectedRoomIds(block.classroomIds ? [...block.classroomIds] : []);
    setCellExcludedTeacherIds(block.excludedTeacherIds ? [...block.excludedTeacherIds] : []);
    setCellCoexistTeacherIds(block.coexistTeacherIds ? [...block.coexistTeacherIds] : []);
    const isStudentOnly = Boolean(block.studentOnly);
    setCellStudentOnly(isStudentOnly);

    if (block.blockType === "parallel_subject" || block.category === "parallel" || block.classroomTeacherMap) {
      setModalMode("parallel_subject");
      setCellParallelTitle(block.title);
      setCellParallelCode(block.subjectCode || "");
      setCellParallelDuration(block.duration);
      setCellParallelRoomIds(block.classroomIds ? [...block.classroomIds] : []);
      const loadedMap: Record<string, string> = {};
      if (block.classroomTeacherMap) {
        Object.entries(block.classroomTeacherMap).forEach(([cid, tids]) => {
          loadedMap[cid] = tids[0] || "";
        });
      }
      setCellParallelTeacherMap(loadedMap);
    } else if (block.blockType === "elective_pool" || block.category === "elective") {
      setModalMode("elective_pool");
      setCellElecTitle(block.title);
      setCellElecDuration(block.duration);
      setCellElecRoomIds(block.classroomIds ? [...block.classroomIds] : []);
      setCellElecOfferings(block.offerings ? [...block.offerings] : []);
    } else if (block.category === "school" || block.blockType === "school_lock") {
      setModalMode("school_lock");
      setCellSchoolTitle(block.title);
      setCellSchoolCode(block.subjectCode || "");
      setCellSchoolDuration(block.duration);
      setCellSchoolBindAllTeachers(block.bindAllTeachers ?? true);
      setCellSchoolRoomId(block.sharedRoomId || "");
    } else {
      setModalMode("grade_sync");
      setCellGradeBlockType(block.blockType);
      setCellGradeTitle(block.title);
      setCellGradeCode(block.subjectCode || "");
      setCellGradeDuration(block.duration);
      setCellGradeScope(block.classroomIds.length === 1 ? "current_room" : "current_grade");
      setCellGradeBindAdvisors(isStudentOnly ? false : (block.bindAdvisorsAutomatically ?? true));
      setCellGradeExtraTeacherIds(block.teacherIds ? [...block.teacherIds] : []);
      setCellGradeRoomId(block.sharedRoomId || "");
    }
  };

  // Quick Conflict Resolution Handler (ข้อ 1 & 2: เลือกให้ครูลงคาบกิจกรรม, ลงคาบประชุม หรือลงทั้งคู่)
  const handleResolveConflictForTeacher = (
    teacherId: string,
    choice: "attend_activity" | "keep_meeting" | "both"
  ) => {
    if (choice === "keep_meeting") {
      // Option B: Teacher stays in meeting lock, excluded from this activity block
      setCellExcludedTeacherIds((prev) => Array.from(new Set([...prev, teacherId])));
      setCellCoexistTeacherIds((prev) => prev.filter((id) => id !== teacherId));
      if (classroomCellModal) {
        const { day, period } = classroomCellModal;
        const dur =
          modalMode === "school_lock"
            ? cellSchoolDuration
            : modalMode === "grade_sync"
            ? cellGradeDuration
            : modalMode === "parallel_subject"
            ? cellParallelDuration
            : cellElecDuration;
        const meeting = dataset.groupMeetingLocks.find((m) => {
          if (m.day !== day) return false;
          return Math.max(period, m.startPeriod) < Math.min(period + dur, m.startPeriod + m.duration);
        });
        if (meeting) {
          upsertMeetingLock({
            ...meeting,
            excludedTeacherIds: (meeting.excludedTeacherIds || []).filter((id) => id !== teacherId),
            coexistTeacherIds: (meeting.coexistTeacherIds || []).filter((id) => id !== teacherId),
          });
        }
      }
    } else if (choice === "attend_activity") {
      // Option A: Teacher attends activity, exempt/exclude from colliding meeting
      if (classroomCellModal) {
        const { day, period } = classroomCellModal;
        const dur =
          modalMode === "school_lock"
            ? cellSchoolDuration
            : modalMode === "grade_sync"
            ? cellGradeDuration
            : modalMode === "parallel_subject"
            ? cellParallelDuration
            : cellElecDuration;
        const meeting = dataset.groupMeetingLocks.find((m) => {
          if (m.day !== day) return false;
          return Math.max(period, m.startPeriod) < Math.min(period + dur, m.startPeriod + m.duration);
        });
        if (meeting) {
          const updatedEx = Array.from(new Set([...(meeting.excludedTeacherIds || []), teacherId]));
          upsertMeetingLock({
            ...meeting,
            excludedTeacherIds: updatedEx,
            coexistTeacherIds: (meeting.coexistTeacherIds || []).filter((id) => id !== teacherId),
          });
        }
      }
      setCellExcludedTeacherIds((prev) => prev.filter((id) => id !== teacherId));
      setCellCoexistTeacherIds((prev) => prev.filter((id) => id !== teacherId));
    } else if (choice === "both") {
      // Option C: Both - Teacher participates in BOTH (coexist, displays 2 items side-by-side in teacher timetable)
      if (classroomCellModal) {
        const { day, period } = classroomCellModal;
        const dur =
          modalMode === "school_lock"
            ? cellSchoolDuration
            : modalMode === "grade_sync"
            ? cellGradeDuration
            : modalMode === "parallel_subject"
            ? cellParallelDuration
            : cellElecDuration;
        const meeting = dataset.groupMeetingLocks.find((m) => {
          if (m.day !== day) return false;
          return Math.max(period, m.startPeriod) < Math.min(period + dur, m.startPeriod + m.duration);
        });
        if (meeting) {
          upsertMeetingLock({
            ...meeting,
            excludedTeacherIds: (meeting.excludedTeacherIds || []).filter((id) => id !== teacherId),
            coexistTeacherIds: Array.from(new Set([...(meeting.coexistTeacherIds || []), teacherId])),
          });
        }
      }
      setCellExcludedTeacherIds((prev) => prev.filter((id) => id !== teacherId));
      setCellCoexistTeacherIds((prev) => Array.from(new Set([...prev, teacherId])));
    }
  };

  const handleUndoExclusion = (teacherId: string) => {
    setCellExcludedTeacherIds((prev) => prev.filter((id) => id !== teacherId));
  };

  const handleUndoCoexist = (teacherId: string) => {
    setCellCoexistTeacherIds((prev) => prev.filter((id) => id !== teacherId));
    if (classroomCellModal) {
      const { day, period } = classroomCellModal;
      const dur =
        modalMode === "school_lock"
          ? cellSchoolDuration
          : modalMode === "grade_sync"
          ? cellGradeDuration
          : modalMode === "parallel_subject"
          ? cellParallelDuration
          : cellElecDuration;
      const meeting = dataset.groupMeetingLocks.find((m) => {
        if (m.day !== day) return false;
        return Math.max(period, m.startPeriod) < Math.min(period + dur, m.startPeriod + m.duration);
      });
      if (meeting) {
        upsertMeetingLock({
          ...meeting,
          coexistTeacherIds: (meeting.coexistTeacherIds || []).filter((id) => id !== teacherId),
        });
      }
    }
  };

  // Conflict Detection for Modal (ข้อ 1: ตรวจจับคาบล็อคชนคาบประชุมหรือภารกิจอื่นของครูที่ปรึกษา/ครูผู้สอน)
  const detectedModalConflicts = useMemo<TeacherSlotConflict[]>(() => {
    if (!classroomCellModal) return [];
    if (modalMode === "free_period") return [];

    const { day, period } = classroomCellModal;
    let duration = 1;
    let involvedTeacherIds: string[] = [];

    if (modalMode === "school_lock") {
      duration = cellSchoolDuration;
      involvedTeacherIds = cellSchoolBindAllTeachers ? dataset.teachers.map((t) => t.id) : [];
    } else if (modalMode === "grade_sync") {
      duration = cellGradeDuration;
      if (cellStudentOnly) {
        // ลงในของนักเรียน ไม่ต้องลงในคาบครู
        involvedTeacherIds = [];
      } else {
        let rooms: string[] = [];
        if (cellGradeScope === "current_room") {
          rooms = activeClassroom ? [activeClassroom.id] : [];
        } else if (cellGradeScope === "current_grade") {
          rooms = activeClassroom
            ? dataset.classrooms.filter((c) => c.gradeLevelId === activeClassroom.gradeLevelId).map((c) => c.id)
            : [];
        } else {
          rooms = dataset.classrooms.map((c) => c.id);
        }
        const advisors = cellGradeBindAdvisors
          ? dataset.classrooms
              .filter((c) => rooms.includes(c.id))
              .flatMap((c) => c.advisorTeacherIds)
          : [];
        involvedTeacherIds = Array.from(new Set([...advisors, ...cellGradeExtraTeacherIds]));
      }
    } else if (modalMode === "parallel_subject") {
      duration = cellParallelDuration;
      involvedTeacherIds = Array.from(new Set(Object.values(cellParallelTeacherMap).filter(Boolean)));
    } else if (modalMode === "elective_pool") {
      duration = cellElecDuration;
      involvedTeacherIds = Array.from(new Set(cellElecOfferings.flatMap((o) => o.teacherIds)));
    }

    if (involvedTeacherIds.length === 0) return [];

    return findTeacherSlotConflicts(
      involvedTeacherIds,
      day,
      period,
      duration,
      dataset,
      editingSyncBlockId || undefined,
      cellExcludedTeacherIds,
      cellCoexistTeacherIds
    );
  }, [
    classroomCellModal,
    modalMode,
    cellSchoolDuration,
    cellSchoolBindAllTeachers,
    cellGradeDuration,
    cellGradeScope,
    cellGradeBindAdvisors,
    cellGradeExtraTeacherIds,
    cellGradeTitle,
    cellStudentOnly,
    cellParallelDuration,
    cellParallelTeacherMap,
    cellElecDuration,
    cellElecOfferings,
    activeClassroom,
    dataset,
    editingSyncBlockId,
    cellExcludedTeacherIds,
    cellCoexistTeacherIds,
  ]);

  // Save Block from Classroom Modal
  const handleSaveClassroomModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classroomCellModal) return;

    const { day, period } = classroomCellModal;

    if (modalMode === "free_period") {
      const roomsToToggle = modalSelectedRoomIds.length > 0 ? modalSelectedRoomIds : targetClassroomIds;
      handleToggleFreeSlot(roomsToToggle, day, period);
      setEditingSyncBlockId(null);
      setClassroomCellModal(null);
      return;
    }

    // ข้อ 1: แจ้งเตือนเมื่อคาบล็อคชนคาบประชุมหรือภารกิจอื่นของครู
    if (detectedModalConflicts.length > 0) {
      const summary = detectedModalConflicts
        .slice(0, 5)
        .map((c) => `• ${c.teacherName}: ${c.reason}`)
        .join("\n");
      const more =
        detectedModalConflicts.length > 5
          ? `\n... และอีก ${detectedModalConflicts.length - 5} ท่าน`
          : "";
      const confirmMsg = `⚠️ แจ้งเตือน: พบครูติดภารกิจในคาบนี้ ${detectedModalConflicts.length} ท่าน:\n\n${summary}${more}\n\nต้องการยืนยันบันทึกคาบล็อคนี้ต่อไปหรือไม่?\n(ในทางปฏิบัติสามารถให้ครูท่านอื่นเข้าแทนได้)`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    if (modalMode === "school_lock") {
      if (!cellSchoolTitle.trim()) {
        window.alert("กรุณาระบุชื่อกิจกรรมทั้งโรงเรียน");
        return;
      }
      const allRoomIds = dataset.classrooms.map((c) => c.id);
      const allGradeIds = dataset.gradeLevels.map((g) => g.id);

      upsertSyncBlock({
        id: editingSyncBlockId || `sync_school_${Date.now()}`,
        termId: dataset.term.id,
        blockType: "school_lock",
        category: "school",
        title: cellSchoolTitle.trim(),
        subjectCode: cellSchoolCode.trim() || null,
        gradeLevelIds: allGradeIds,
        classroomIds: allRoomIds,
        bindAdvisorsAutomatically: false,
        bindAllTeachers: cellSchoolBindAllTeachers,
        teacherIds: cellSchoolBindAllTeachers ? dataset.teachers.map((t) => t.id) : [],
        excludedTeacherIds: cellExcludedTeacherIds.length > 0 ? cellExcludedTeacherIds : undefined,
        coexistTeacherIds: cellCoexistTeacherIds.length > 0 ? cellCoexistTeacherIds : undefined,
        sharedRoomId: cellSchoolRoomId || null,
        offerings: [],
        duration: cellSchoolDuration,
        isTimeLocked: true,
        fixedDay: day,
        fixedStartPeriod: period,
      });
      setEditingSyncBlockId(null);
      setClassroomCellModal(null);
      return;
    }

    if (modalMode === "grade_sync") {
      if (!cellGradeTitle.trim()) {
        window.alert("กรุณาระบุชื่อกิจกรรมประจำระดับชั้น");
        return;
      }

      let rooms: string[] = [];
      if (cellGradeScope === "current_room") {
        rooms = activeClassroom ? [activeClassroom.id] : [];
      } else if (cellGradeScope === "current_grade") {
        rooms = activeClassroom
          ? dataset.classrooms
              .filter((c) => c.gradeLevelId === activeClassroom.gradeLevelId)
              .map((c) => c.id)
          : [];
      } else if (cellGradeScope === "custom") {
        rooms = modalSelectedRoomIds.length > 0 ? modalSelectedRoomIds : activeClassroom ? [activeClassroom.id] : [];
      } else {
        rooms = dataset.classrooms.map((c) => c.id);
      }

      const gradeIds = Array.from(
        new Set(
          dataset.classrooms.filter((c) => rooms.includes(c.id)).map((c) => c.gradeLevelId)
        )
      );

      const isStudentOnly = Boolean(cellStudentOnly);

      upsertSyncBlock({
        id: editingSyncBlockId || `sync_grade_${Date.now()}`,
        termId: dataset.term.id,
        blockType: cellGradeBlockType,
        category: "grade",
        title: cellGradeTitle.trim(),
        subjectCode: cellGradeCode.trim() || null,
        gradeLevelIds: gradeIds,
        classroomIds: rooms,
        bindAdvisorsAutomatically: isStudentOnly ? false : cellGradeBindAdvisors,
        studentOnly: isStudentOnly,
        teacherIds: isStudentOnly ? [] : cellGradeExtraTeacherIds,
        excludedTeacherIds: cellExcludedTeacherIds.length > 0 ? cellExcludedTeacherIds : undefined,
        coexistTeacherIds: cellCoexistTeacherIds.length > 0 ? cellCoexistTeacherIds : undefined,
        sharedRoomId: cellGradeRoomId || null,
        offerings: [],
        duration: cellGradeDuration,
        isTimeLocked: true,
        fixedDay: day,
        fixedStartPeriod: period,
      });
      setEditingSyncBlockId(null);
      setClassroomCellModal(null);
      return;
    }

    if (modalMode === "parallel_subject") {
      if (!cellParallelTitle.trim()) {
        window.alert("กรุณาระบุชื่อวิชาที่เรียนพร้อมกัน (เช่น การศึกษาค้นคว้าด้วยตนเอง IS)");
        return;
      }
      if (cellParallelRoomIds.length === 0) {
        window.alert("กรุณาเลือกห้องเรียนที่ร่วมเรียนพร้อมกันอย่างน้อย 1 ห้อง");
        return;
      }

      const gradeIds = Array.from(
        new Set(
          dataset.classrooms
            .filter((c) => cellParallelRoomIds.includes(c.id))
            .map((c) => c.gradeLevelId)
        )
      );

      const finalTeacherMap: Record<string, string[]> = {};
      const allTeachers: string[] = [];
      for (const cid of cellParallelRoomIds) {
        const tid = cellParallelTeacherMap[cid];
        if (tid) {
          finalTeacherMap[cid] = [tid];
          allTeachers.push(tid);
        }
      }

      upsertSyncBlock({
        id: editingSyncBlockId || `sync_parallel_${Date.now()}`,
        termId: dataset.term.id,
        blockType: "parallel_subject",
        category: "parallel",
        title: cellParallelTitle.trim(),
        subjectCode: cellParallelCode.trim() || null,
        gradeLevelIds: gradeIds,
        classroomIds: cellParallelRoomIds,
        bindAdvisorsAutomatically: false,
        studentOnly: false,
        teacherIds: Array.from(new Set(allTeachers)),
        classroomTeacherMap: finalTeacherMap,
        excludedTeacherIds: cellExcludedTeacherIds.length > 0 ? cellExcludedTeacherIds : undefined,
        coexistTeacherIds: cellCoexistTeacherIds.length > 0 ? cellCoexistTeacherIds : undefined,
        sharedRoomId: null,
        offerings: [],
        duration: cellParallelDuration,
        isTimeLocked: true,
        fixedDay: day,
        fixedStartPeriod: period,
      });
      setEditingSyncBlockId(null);
      setClassroomCellModal(null);
      return;
    }

    if (modalMode === "elective_pool") {
      if (!cellElecTitle.trim() || cellElecRoomIds.length === 0) {
        window.alert("กรุณาระบุชื่อกลุ่มวิชาเลือก และเลือกห้องเรียนที่เรียนร่วมกัน");
        return;
      }
      if (cellElecOfferings.length === 0) {
        window.alert("กรุณาเพิ่มวิชาเลือกในกลุ่มอย่างน้อย 1 วิชา");
        return;
      }

      const gradeIds = Array.from(
        new Set(
          dataset.classrooms
            .filter((c) => cellElecRoomIds.includes(c.id))
            .map((c) => c.gradeLevelId)
        )
      );

      upsertSyncBlock({
        id: editingSyncBlockId || `sync_elec_${Date.now()}`,
        termId: dataset.term.id,
        blockType: "elective_pool",
        category: "elective",
        title: cellElecTitle.trim(),
        subjectCode: "วิชาเลือก",
        gradeLevelIds: gradeIds,
        classroomIds: cellElecRoomIds,
        bindAdvisorsAutomatically: false,
        teacherIds: [],
        excludedTeacherIds: cellExcludedTeacherIds.length > 0 ? cellExcludedTeacherIds : undefined,
        coexistTeacherIds: cellCoexistTeacherIds.length > 0 ? cellCoexistTeacherIds : undefined,
        sharedRoomId: null,
        offerings: cellElecOfferings,
        duration: cellElecDuration,
        isTimeLocked: true,
        fixedDay: day,
        fixedStartPeriod: period,
      });
      setEditingSyncBlockId(null);
      setClassroomCellModal(null);
      return;
    }
  };

  // Helper for adding offering into cell modal (ข้อ 3: ครูผู้สอนร่วมมากกว่า 2 คน)
  const handleAddCellOffering = () => {
    if (!cellOffName.trim() || !cellOffTeacherId) {
      window.alert("กรุณากรอกชื่อวิชาเลือกและเลือกครูผู้สอน");
      return;
    }
    const tids = Array.from(new Set([cellOffTeacherId, ...cellOffCoTeacherIds].filter(Boolean)));
    setCellElecOfferings((prev) => [
      ...prev,
      {
        id: `off_${Date.now()}_${prev.length}`,
        subjectId: null,
        subjectCode: cellOffCode.trim() || `EL${prev.length + 1}`,
        subjectName: cellOffName.trim(),
        departmentId: cellOffDeptId || null,
        teacherIds: tids,
        roomId: cellOffRoomId || null,
      },
    ]);
    setCellOffCode("");
    setCellOffName("");
    setCellOffDeptId("");
    setCellOffTeacherId("");
    setCellOffCoTeacherIds([]);
    setCellOffRoomId("");
  };

  // =========================================================================
  // Handlers: Teacher Slots & Division Meeting Locks
  // =========================================================================
  const handleOpenAddMeetingModal = (defaultDay: DayOfWeek = "MON", defaultPeriod: number = 7) => {
    setTeacherCellModal({ day: defaultDay, period: defaultPeriod, editingMeetingId: null });
    setMtgDay(defaultDay);
    setMtgStartPeriod(defaultPeriod);
    const defaultDivName =
      activeTeacher?.divisionIds.length
        ? dataset.divisions.find((d) => d.id === activeTeacher.divisionIds[0])?.name ||
          activeTeacher.divisionIds[0] ||
          "ฝ่ายบริหารวิชาการ"
        : "ฝ่ายบริหารวิชาการ";
    setMtgDivisionName(defaultDivName);
    setMtgTitle(`ประชุม${defaultDivName}`);
    setMtgDuration(1);
    setMtgTeacherIds(activeTeacher ? [activeTeacher.id] : []);
    setMtgRoomId("");
  };

  const handleOpenEditMeetingModal = (meeting: GroupMeetingLock) => {
    setTeacherCellModal({
      day: meeting.day,
      period: meeting.startPeriod,
      editingMeetingId: meeting.id,
    });
    setMtgDay(meeting.day);
    setMtgStartPeriod(meeting.startPeriod);
    const existingDivName =
      meeting.divisionName ||
      dataset.divisions.find((d) => d.id === meeting.targetId)?.name ||
      "ฝ่ายบริหารวิชาการ";
    setMtgDivisionName(existingDivName);
    setMtgTitle(meeting.title);
    setMtgDuration(meeting.duration || 1);
    setMtgTeacherIds(meeting.teacherIds || []);
    setMtgRoomId(meeting.roomId || "");
  };

  const handleOpenTeacherCellModal = (day: DayOfWeek, period: number) => {
    // ตรวจสอบว่าในช่องนี้มีคาบประชุมของครูท่านนี้อยู่แล้วหรือไม่ ถ้ามีให้เปิดโหมดแก้ไข
    const existingMtg = dataset.groupMeetingLocks.find((m) => {
      if (m.day !== day) return false;
      const inRange = period >= m.startPeriod && period < m.startPeriod + (m.duration || 1);
      if (!inRange) return false;
      if (m.teacherIds && m.teacherIds.length > 0) {
        return activeTeacher ? m.teacherIds.includes(activeTeacher.id) : false;
      }
      return true;
    });

    if (existingMtg) {
      handleOpenEditMeetingModal(existingMtg);
    } else {
      handleOpenAddMeetingModal(day, period);
    }
  };

  const handleSaveTeacherMeetingModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherCellModal || !mtgTitle.trim()) {
      window.alert("กรุณากรอกชื่อการประชุม หรือกิจกรรมล็อค");
      return;
    }

    const meetingId = teacherCellModal.editingMeetingId || `mtg_${Date.now()}`;
    const divName = mtgDivisionName.trim() || "ฝ่ายบริหาร";

    // ค้นหาหรือบันทึก Division เข้าสู่ dataset.divisions เพื่อให้ทุกหน้าซิงค์กัน
    let targetDiv = dataset.divisions.find(
      (d) =>
        d.name.trim().toLowerCase() === divName.toLowerCase() ||
        d.id.toLowerCase() === divName.toLowerCase()
    );

    let matchingDivId = targetDiv?.id;
    if (!targetDiv) {
      matchingDivId = `div_${Date.now()}`;
      upsertDivision({
        id: matchingDivId,
        termId: dataset.term.id,
        name: divName,
        color: "#7c3aed",
      });
    }

    upsertMeetingLock({
      id: meetingId,
      termId: dataset.term.id,
      divisionName: divName,
      targetType: "division",
      targetId: matchingDivId || divName,
      title: mtgTitle.trim(),
      day: mtgDay,
      startPeriod: mtgStartPeriod,
      duration: Math.max(1, mtgDuration),
      teacherIds: mtgTeacherIds || [],
      roomId: mtgRoomId || null,
    });

    setTeacherCellModal(null);
  };

  // รายชื่อฝ่ายบริหารที่สะอาด (ตัด id ขยะและค่าว่างออก)
  const cleanDivisions = useMemo(() => {
    return dataset.divisions.filter(
      (d) => d && d.name && !d.name.startsWith("div_") && d.name.trim().length > 0
    );
  }, [dataset.divisions]);

  const handleAddDivision = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newDivisionInput.trim();
    if (!name) return;
    if (cleanDivisions.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      window.alert("มีชื่อฝ่ายนี้อยู่ในระบบแล้ว");
      return;
    }
    upsertDivision({
      id: `div_${Date.now()}`,
      termId: dataset.term.id,
      name,
      color: "#7c3aed",
    });
    setNewDivisionInput("");
  };

  const handleUpdateDivisionName = (divId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const targetDiv = dataset.divisions.find((d) => d.id === divId);
    if (!targetDiv) return;
    const oldName = targetDiv.name;
    // 1. อัปเดต division
    upsertDivision({
      ...targetDiv,
      name: trimmed,
    });
    // 2. อัปเดต meeting locks ที่เกี่ยวข้อง
    dataset.groupMeetingLocks.forEach((m) => {
      if (m.targetId === divId || m.divisionName === oldName) {
        upsertMeetingLock({
          ...m,
          targetId: divId,
          divisionName: trimmed,
        });
      }
    });
    // 3. อัปเดตครูที่เคยสังกัดชื่อเดิม
    dataset.teachers.forEach((t) => {
      if ((t.divisionIds || []).includes(oldName)) {
        const next = t.divisionIds.map((x) => (x === oldName ? trimmed : x));
        upsertTeacher({ ...t, divisionIds: next });
      }
    });
    setEditingDivision(null);
  };

  const handleDeleteDivision = (div: Division) => {
    const affectedMtgs = dataset.groupMeetingLocks.filter(
      (m) => m.targetId === div.id || m.divisionName === div.name
    );
    const affectedTeachers = dataset.teachers.filter(
      (t) => (t.divisionIds || []).includes(div.id) || (t.divisionIds || []).includes(div.name)
    );
    const msg =
      `ต้องการลบชื่อฝ่าย "${div.name}" หรือไม่?\n\n` +
      (affectedMtgs.length > 0 ? `• คาบประชุมที่ผูกกับฝ่ายนี้ ${affectedMtgs.length} รายการจะถูกลบไปด้วย\n` : "") +
      (affectedTeachers.length > 0 ? `• ครูที่สังกัดฝ่ายนี้ ${affectedTeachers.length} ท่านจะถูกปลดล็อค\n` : "");
    if (!window.confirm(msg)) return;
    deleteDivision(div.id);
  };

  // Grouped Blocks for Summary Section
  const schoolBlocks = useMemo(() => {
    return dataset.synchronizedBlocks.filter(
      (b) => b.category === "school" || b.blockType === "school_lock"
    );
  }, [dataset.synchronizedBlocks]);

  const gradeBlocks = useMemo(() => {
    return dataset.synchronizedBlocks.filter(
      (b) =>
        b.category === "grade" ||
        ["grade_sync", "moral_assembly", "homeroom", "cohort_lock"].includes(b.blockType)
    );
  }, [dataset.synchronizedBlocks]);

  const electiveBlocks = useMemo(() => {
    return dataset.synchronizedBlocks.filter(
      (b) => b.category === "elective" || b.blockType === "elective_pool"
    );
  }, [dataset.synchronizedBlocks]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Introduction */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            คาบล็อค คาบอิสระ & ประชุมฝ่าย (เมนู 2. ลงข้อมูลวิชาและเงื่อนไข)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            คลิกเลือกช่องบนตารางเรียนได้โดยตรงเพื่อกำหนดคาบอิสระ, คาบทั้งโรงเรียน, คาบประจำระดับชั้น, วิชาเลือก และคาบประชุมฝ่าย
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Switcher: Classroom Timetable vs Teacher Meeting Timetable */}
          <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-bold shadow-2xs">
            <button
              type="button"
              onClick={() => setGridSubView("classrooms")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition ${
                gridSubView === "classrooms"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <GraduationCap className="w-4 h-4 text-blue-600" />
              <span>1. ตารางห้องเรียนนักเรียน (คาบอิสระ & กิจกรรม)</span>
            </button>
            <button
              type="button"
              onClick={() => setGridSubView("teachers")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition ${
                gridSubView === "teachers"
                  ? "bg-white text-purple-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-4 h-4 text-purple-600" />
              <span>2. ตารางภาพรวมคาบล็อค ประชุมฝ่าย & นศท.</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: ตารางห้องเรียนนักเรียน (กำหนดคาบอิสระ & คาบล็อคกิจกรรม) */}
      {/* ========================================================================= */}
      {gridSubView === "classrooms" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Grade filter */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-bold text-slate-700">ระดับชั้น:</span>
                  <select
                    value={selectedGradeId}
                    onChange={(e) => setSelectedGradeId(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white"
                  >
                    <option value="ALL">ทุกระดับชั้น (ม.1–ม.6)</option>
                    {dataset.gradeLevels.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Classroom selector */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-bold text-slate-700">เลือกห้องเรียน:</span>
                  <select
                    value={selectedClassroomId}
                    onChange={(e) => setSelectedClassroomId(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-white"
                  >
                    {availableClassrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        ห้อง {c.name} ({c.programName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Batch Mode toggle */}
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={batchMode}
                    onChange={(e) => {
                      setBatchMode(e.target.checked);
                      if (e.target.checked && activeClassroom) {
                        setBatchRoomIds([activeClassroom.id]);
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="font-semibold">โหมดเลือกหลายห้องพร้อมกัน (Batch)</span>
                </label>
              </div>

              {/* Action buttons for free slots */}
              {activeClassroom && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCopyTargetRoomIds(
                        dataset.classrooms
                          .filter(
                            (c) =>
                              c.gradeLevelId === activeClassroom.gradeLevelId &&
                              c.id !== activeClassroom.id
                          )
                          .map((c) => c.id)
                      );
                      setCopyModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="w-3.5 h-3.5 text-blue-600" />
                    คัดลอกคาบอิสระไปยังห้องอื่น
                  </button>
                </div>
              )}
            </div>

            {/* Batch Room Selector Pills (if batchMode is on) */}
            {batchMode && (
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg text-xs space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-blue-950">
                  <span>ติ๊กเลือกห้องที่ต้องการล็อคคาบอิสระหรือคาบกิจกรรมพร้อมกัน:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBatchRoomIds(availableClassrooms.map((c) => c.id))}
                      className="text-blue-700 underline text-[11px]"
                    >
                      เลือกทุกห้องในกลุ่มนี้
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchRoomIds([])}
                      className="text-slate-500 underline text-[11px]"
                    >
                      ยกเลิกทั้งหมด
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableClassrooms.map((c) => {
                    const isChecked = batchRoomIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setBatchRoomIds((prev) =>
                            prev.includes(c.id)
                              ? prev.filter((id) => id !== c.id)
                              : [...prev, c.id]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                          isChecked
                            ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Room Summary Status Strip */}
            {activeClassroom && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                <div className="flex flex-wrap items-center gap-3 text-slate-700">
                  <span>
                    กำลังดูตารางห้อง: <strong>{activeClassroom.name}</strong> ({activeClassroom.programName})
                  </span>
                  <span>•</span>
                  <span>
                    คาบเต็มสัปดาห์: <strong>{activeRoomSummary.totalSlots}</strong> คาบ
                  </span>
                  <span>•</span>
                  <span className="text-emerald-700 font-bold">
                    คาบอิสระที่ล็อคไว้: {activeRoomSummary.freeSlots} คาบ
                  </span>
                  <span>•</span>
                  <span className="text-purple-700 font-bold">
                    คาบล็อคกิจกรรม: {activeRoomSummary.syncBlockPeriods} คาบ ({activeRoomSummary.syncBlocksCount} รายการ)
                  </span>
                  <span>•</span>
                  <span className="text-slate-900 font-bold">
                    คงเหลือจัดวิชาการ: {activeRoomSummary.remainingForAcademic} คาบ
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  💡 คลิกในช่องตารางด้านล่างเพื่อเลือกล็อคคาบอิสระหรือเพิ่มคาบล็อคกิจกรรม
                </div>
              </div>
            )}
          </div>

          {/* Classroom Timetable Grid */}
          {activeClassroom ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-blue-400" />
                  <span className="font-bold text-sm">
                    ตารางเรียนนักเรียน: ห้อง {activeClassroom.name}
                  </span>
                  {batchMode && batchRoomIds.length > 1 && (
                    <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-[11px] font-semibold">
                      มีผลกับ {batchRoomIds.length} ห้องพร้อมกัน
                    </span>
                  )}
                </div>
                <div className="text-slate-300 text-xs">
                  คลิกที่ช่องใดก็ได้ในตารางเพื่อตั้งเป็นคาบอิสระ หรือเพิ่มคาบล็อคกิจกรรมนักเรียน
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs min-w-[850px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                      <th className="p-2 border-r border-slate-200 w-24 text-center font-bold">
                        วัน / คาบ
                      </th>
                      {visualCols.map((vc, idx) => (
                        <th
                          key={idx}
                          className={`p-1.5 border-r border-slate-200 text-center ${
                            vc.kind === "break" ? "bg-amber-50/90 text-amber-900 w-14" : "min-w-[95px]"
                          }`}
                        >
                          <div className="font-bold leading-tight">{vc.label}</div>
                          <div className="text-[10px] font-normal text-slate-500">{vc.sublabel}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.term.daysOfWeek.map((day) => {
                      let skipUntilColIdx = -1;
                      return (
                        <tr key={day} className="border-b border-slate-200">
                          <td className="p-2 border-r border-slate-200 font-bold text-slate-700 bg-slate-50 text-center whitespace-nowrap">
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-1.5"
                              style={{ backgroundColor: DAY_LABELS[day]?.color }}
                            />
                            {DAY_LABELS[day]?.full}
                          </td>

                          {visualCols.map((vc, cIdx) => {
                            if (cIdx < skipUntilColIdx) return null;

                            if (vc.kind === "break") {
                              return (
                                <td
                                  key={`brk-${day}-${cIdx}`}
                                  className="bg-amber-50/60 border-r border-slate-200 text-center text-[10px] text-amber-800 font-medium px-1 select-none"
                                >
                                  {vc.label}
                                </td>
                              );
                            }

                            const pNum = vc.period!;

                            // 1. ตรวจสอบคาบอิสระ (Locked Free Slot) ของห้องนี้
                            const isFreeSlot = activeClassroom.lockedFreeSlots?.some(
                              (s) => s.day === day && s.period === pNum
                            );

                            // 2. ตรวจสอบคาบล็อคกิจกรรม (SyncBlock) ของห้องนี้
                            const syncBlock = dataset.synchronizedBlocks.find(
                              (b) =>
                                b.isTimeLocked &&
                                b.fixedDay === day &&
                                b.fixedStartPeriod === pNum &&
                                b.classroomIds.includes(activeClassroom.id)
                            );

                            // คำนวณ span กรณีเป็นคาบต่อเนื่องหลายคาบติด
                            const periodSpan = syncBlock ? syncBlock.duration : 1;
                            const endPeriod = pNum + periodSpan - 1;
                            const endColIdx =
                              periodSpan > 1
                                ? visualCols.findIndex((x) => x.kind === "period" && x.period === endPeriod)
                                : cIdx;
                            const span = endColIdx >= cIdx ? endColIdx - cIdx + 1 : 1;
                            if (span > 1) {
                              skipUntilColIdx = cIdx + span;
                            }

                            return (
                              <td
                                key={`slot-${day}-${pNum}`}
                                colSpan={span}
                                onClick={() => handleOpenClassroomCellModal(day, pNum)}
                                className="p-1 border-r border-slate-200 align-top cursor-pointer hover:bg-blue-50/60 transition"
                              >
                                {isFreeSlot ? (
                                  <div className="h-16 p-2 rounded-lg bg-emerald-50 border-2 border-emerald-400 text-emerald-950 flex flex-col justify-between group shadow-2xs">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-[11px] text-emerald-800 flex items-center gap-1">
                                        <Unlock className="w-3 h-3 text-emerald-600" /> คาบอิสระ
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleFreeSlot(targetClassroomIds, day, pNum);
                                        }}
                                        className="text-slate-400 hover:text-rose-600 p-0.5 rounded"
                                        title="ปลดล็อคคาบอิสระนี้"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <div className="text-[10px] text-emerald-700">
                                      {batchMode && batchRoomIds.length > 1
                                        ? `ล็อค ${batchRoomIds.length} ห้อง`
                                        : "คาบว่างของนักเรียน"}
                                    </div>
                                  </div>
                                ) : syncBlock ? (
                                  <div
                                    className="h-16 p-1.5 rounded-lg border-2 flex flex-col justify-between shadow-2xs"
                                    style={{
                                      backgroundColor: `${
                                        SYNC_BLOCK_TYPE_LABELS[syncBlock.blockType]?.badgeColor || "#0ea5e9"
                                      }15`,
                                      borderColor:
                                        SYNC_BLOCK_TYPE_LABELS[syncBlock.blockType]?.badgeColor || "#0ea5e9",
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <span className="font-bold text-[11px] text-slate-900 leading-tight truncate">
                                        {syncBlock.title}
                                      </span>
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                          type="button"
                                          title="แก้ไขคาบล็อคนี้ (ข้อ 1)"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenEditSyncBlock(syncBlock);
                                          }}
                                          className="text-slate-400 hover:text-blue-600 p-0.5 rounded transition"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          title="ลบคาบล็อคนี้"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`ต้องการลบคาบล็อค "${syncBlock.title}" หรือไม่?`)) {
                                              deleteSyncBlock(syncBlock.id);
                                            }
                                          }}
                                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                    <div className="text-[10px] text-slate-600 truncate">
                                      {SYNC_BLOCK_TYPE_LABELS[syncBlock.blockType]?.label}
                                      {syncBlock.duration > 1 ? ` (${syncBlock.duration} คาบติด)` : ""}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-16 border border-dashed border-slate-300 rounded-lg p-1.5 flex flex-col items-center justify-center text-center text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50/40 transition">
                                    <Plus className="w-3.5 h-3.5 mb-0.5" />
                                    <span className="text-[10px]">เลือกล็อคคาบ</span>
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
              </div>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
              ยังไม่มีข้อมูลห้องเรียน กรุณาเพิ่มห้องเรียนก่อน
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: ตารางภาพรวมคาบล็อค ประชุมฝ่าย & นศท. (Master Grid) */}
      {/* ========================================================================= */}
      {gridSubView === "teachers" && (
        <div className="space-y-4">
          {/* Master Timetable Grid */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-bold">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>ภาพรวมตำแหน่งคาบล็อค & ประชุมฝ่าย (Master Schedule)</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block" /> ประชุมฝ่าย
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-lime-400 inline-block" /> กิจกรรม นศท.
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-blue-400 inline-block" /> ทั้งโรงเรียน
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-400 inline-block" /> ประจำระดับชั้น
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs min-w-[880px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="p-2 border-r border-slate-200 w-24 text-center font-bold">
                      วัน / คาบ
                    </th>
                    {visualCols.map((vc, idx) => (
                      <th
                        key={idx}
                        className={`p-1.5 border-r border-slate-200 text-center ${
                          vc.kind === "break" ? "bg-amber-50/90 text-amber-900 w-14" : "min-w-[105px]"
                        }`}
                      >
                        <div className="font-bold leading-tight">{vc.label}</div>
                        <div className="text-[10px] font-normal text-slate-500">{vc.sublabel}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataset.term.daysOfWeek.map((day) => {
                    return (
                      <tr key={day} className="border-b border-slate-200">
                        <td className="p-2 border-r border-slate-200 font-bold text-slate-700 bg-slate-50 text-center whitespace-nowrap">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
                            style={{ backgroundColor: DAY_LABELS[day]?.color }}
                          />
                          {DAY_LABELS[day]?.full}
                        </td>

                        {visualCols.map((vc, cIdx) => {
                          if (vc.kind === "break") {
                            return (
                              <td
                                key={`mbrk-${day}-${cIdx}`}
                                className="bg-amber-50/60 border-r border-slate-200 text-center text-[10px] text-amber-800 font-medium px-1 select-none"
                              >
                                {vc.label}
                              </td>
                            );
                          }

                          const pNum = vc.period!;

                          // 1. Group Meetings active in this slot (can overlap!)
                          const activeMeetings = dataset.groupMeetingLocks.filter(
                            (m) => m.day === day && pNum >= m.startPeriod && pNum < m.startPeriod + (m.duration || 1)
                          );

                          // 2. Synchronized blocks active in this slot
                          const activeSyncBlocks = dataset.synchronizedBlocks.filter(
                            (b) =>
                              b.isTimeLocked &&
                              b.fixedDay === day &&
                              b.fixedStartPeriod !== null &&
                              b.fixedStartPeriod !== undefined &&
                              pNum >= b.fixedStartPeriod &&
                              pNum < b.fixedStartPeriod + (b.duration || 1)
                          );

                          const hasItems = activeMeetings.length > 0 || activeSyncBlocks.length > 0;

                          return (
                            <td
                              key={`mslot-${day}-${pNum}`}
                              className="p-1 border-r border-slate-200 align-top transition hover:bg-slate-50/80"
                            >
                              {hasItems ? (
                                <div className="space-y-1.5 min-h-[92px] flex flex-col justify-between">
                                  <div className="space-y-1">
                                    {activeMeetings.map((m) => {
                                      const isStart = m.startPeriod === pNum;
                                      const isNst =
                                        m.title.toLowerCase().includes("นศท") ||
                                        m.divisionName?.toLowerCase().includes("นศท");

                                      return (
                                        <div
                                          key={m.id}
                                          onClick={() => handleOpenEditMeetingModal(m)}
                                          className={`p-1.5 rounded-lg border text-left cursor-pointer transition shadow-2xs group flex items-start justify-between gap-1 ${
                                            isNst
                                              ? "bg-lime-50/90 border-lime-400 text-lime-950 hover:bg-lime-100"
                                              : "bg-amber-50/90 border-amber-300 text-amber-950 hover:bg-amber-100"
                                          }`}
                                          title={`คลิกเพื่อแก้ไข ${m.title}`}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <div className="font-bold text-[10px] truncate flex items-center gap-1">
                                              <span>{isNst ? "🎖️" : "🏢"}</span>
                                              <span className="truncate">{m.title}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-600 flex items-center gap-1 mt-0.5">
                                              <span className="font-semibold text-amber-800 truncate">
                                                {m.divisionName || "ประชุมฝ่าย"}
                                              </span>
                                              {m.duration > 1 && (
                                                <span className="bg-amber-200/80 text-amber-900 px-1 rounded text-[8px] font-bold shrink-0">
                                                  {m.duration} คาบ
                                                </span>
                                              )}
                                              {!isStart && (
                                                <span className="text-[8px] text-slate-400 shrink-0">(ต่อ)</span>
                                              )}
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (window.confirm(`ต้องการลบคาบประชุม "${m.title}" หรือไม่?`)) {
                                                deleteMeetingLock(m.id);
                                              }
                                            }}
                                            className="text-slate-400 hover:text-rose-600 p-0.5 rounded opacity-50 group-hover:opacity-100 transition shrink-0"
                                            title="ลบคาบประชุมนี้"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      );
                                    })}

                                    {activeSyncBlocks.map((b) => {
                                      const isStart = b.fixedStartPeriod === pNum;
                                      const isSchool = b.category === "school" || b.blockType === "school_lock";
                                      const isGrade =
                                        b.category === "grade" ||
                                        ["grade_sync", "moral_assembly", "homeroom"].includes(b.blockType);

                                      return (
                                        <div
                                          key={b.id}
                                          onClick={() => handleOpenEditSyncBlock(b)}
                                          className={`p-1.5 rounded-lg border text-left cursor-pointer transition shadow-2xs group flex items-start justify-between gap-1 ${
                                            isSchool
                                              ? "bg-blue-50/90 border-blue-300 text-blue-950 hover:bg-blue-100"
                                              : isGrade
                                              ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 hover:bg-emerald-100"
                                              : "bg-purple-50/90 border-purple-300 text-purple-950 hover:bg-purple-100"
                                          }`}
                                          title={`คลิกเพื่อแก้ไข ${b.title}`}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <div className="font-bold text-[10px] truncate flex items-center gap-1">
                                              <span>{isSchool ? "🏫" : isGrade ? "👥" : "✨"}</span>
                                              <span className="truncate">{b.title}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-600 flex items-center gap-1 mt-0.5">
                                              <span className="font-semibold truncate">
                                                {isSchool ? "ทั้งโรงเรียน" : isGrade ? "ระดับชั้น" : "วิชาเลือก"}
                                              </span>
                                              {b.duration > 1 && (
                                                <span className="bg-slate-200 text-slate-800 px-1 rounded text-[8px] font-bold shrink-0">
                                                  {b.duration} คาบ
                                                </span>
                                              )}
                                              {!isStart && (
                                                <span className="text-[8px] text-slate-400 shrink-0">(ต่อ)</span>
                                              )}
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (window.confirm(`ต้องการลบคาบล็อค "${b.title}" หรือไม่?`)) {
                                                deleteSyncBlock(b.id);
                                              }
                                            }}
                                            className="text-slate-400 hover:text-rose-600 p-0.5 rounded opacity-50 group-hover:opacity-100 transition shrink-0"
                                            title="ลบคาบล็อคนี้"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenAddMeetingModal(day, pNum)}
                                    className="w-full text-center py-0.5 text-[9px] text-slate-400 hover:text-purple-700 hover:bg-purple-50 rounded border border-dashed border-slate-200 transition"
                                    title={`เพิ่มคาบประชุม/ล็อคในวัน${DAY_LABELS[day]?.full} คาบ ${pNum}`}
                                  >
                                    + เพิ่มล็อค
                                  </button>
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleOpenAddMeetingModal(day, pNum)}
                                  className="h-full min-h-[92px] border border-dashed border-slate-200 rounded-lg p-1.5 flex flex-col items-center justify-center text-center text-slate-400 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50/40 cursor-pointer transition"
                                  title={`คลิกเพื่อล็อคคาบประชุม/นศท. วัน${DAY_LABELS[day]?.full} คาบ ${pNum}`}
                                >
                                  <Plus className="w-4 h-4 mb-0.5 opacity-60" />
                                  <span className="text-[10px]">เลือกล็อคคาบ</span>
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
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: สรุปหมวดหมู่คาบล็อคทั้งหมด (4 หมวดหมู่ ตามข้อ 4 & 5) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4.5 h-4.5 text-blue-600" />
              สรุปรายการคาบล็อค & คาบประชุมทั้งหมด ({dataset.synchronizedBlocks.length + dataset.groupMeetingLocks.length} รายการ)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ตรวจสอบรายการคาบล็อคที่ตั้งไว้แยกตามหมวดหมู่ หรือคลิกในตารางด้านบนเพื่อแก้ไขตำแหน่งคาบ
            </p>
          </div>

          {/* 4 Category Pill Buttons */}
          <div className="flex flex-wrap rounded-lg bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveCategory("school")}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeCategory === "school"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>1. คาบทั้งโรงเรียน ({schoolBlocks.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("grade")}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeCategory === "grade"
                  ? "bg-white text-emerald-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>2. คาบประจำระดับชั้น ({gradeBlocks.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("elective")}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeCategory === "elective"
                  ? "bg-white text-purple-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-600" />
              <span>3. วิชาเลือก ({electiveBlocks.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("meetings")}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                activeCategory === "meetings"
                  ? "bg-white text-amber-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>4. ล็อคประชุมฝ่าย ({dataset.groupMeetingLocks.length})</span>
            </button>
          </div>
        </div>

        {/* Category 1: คาบทั้งโรงเรียน */}
        {activeCategory === "school" && (
          <div className="space-y-3">
            {schoolBlocks.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                ยังไม่มีคาบล็อคทั้งโรงเรียน คลิกในช่องตารางด้านบนเพื่อเพิ่มกิจกรรมทั้งโรงเรียน (เช่น ชุมนุม)
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {schoolBlocks.map((b) => (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-blue-600" />
                          <span>{b.title}</span>
                          {b.subjectCode && (
                            <span className="text-xs font-normal text-slate-500">({b.subjectCode})</span>
                          )}
                        </div>
                        <div className="text-blue-800 text-[11px] mt-0.5">
                          {b.isTimeLocked && b.fixedDay && b.fixedStartPeriod
                            ? `ล็อคเวลา: ${DAY_LABELS[b.fixedDay]?.full} คาบ ${b.fixedStartPeriod} (${b.duration} คาบ)`
                            : "ไม่ล็อคเวลา (Solver จัดให้)"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="แก้ไขคาบล็อคนี้"
                          onClick={() => handleOpenEditSyncBlock(b)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-100/60 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="ลบคาบล็อคนี้"
                          onClick={() => {
                            if (window.confirm(`ต้องการลบคาบล็อค "${b.title}" หรือไม่?`)) {
                              deleteSyncBlock(b.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 text-slate-600 text-[11px] border-t border-blue-100 pt-2">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>นักเรียน: ทั้งโรงเรียน ({b.classroomIds.length} ห้อง)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>
                          {b.bindAllTeachers
                            ? "ครูทุกคนในโรงเรียนมีคาบนี้ในตารางสอนอัตโนมัติ (ข้อ 2)"
                            : `ครูผู้รับผิดชอบ: ${b.teacherIds.length} ท่าน`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category 2: คาบประจำระดับชั้น */}
        {activeCategory === "grade" && (
          <div className="space-y-3">
            {gradeBlocks.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                ยังไม่มีคาบประจำระดับชั้น คลิกในช่องตารางด้านบนเพื่อเพิ่มกิจกรรม (เช่น ลูกเสือ, อบรมคุณธรรม, Homeroom)
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {gradeBlocks.map((b) => (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-emerald-600" />
                          <span>{b.title}</span>
                          {b.subjectCode && (
                            <span className="text-xs font-normal text-slate-500">({b.subjectCode})</span>
                          )}
                        </div>
                        <div className="text-emerald-800 text-[11px] mt-0.5">
                          {b.isTimeLocked && b.fixedDay && b.fixedStartPeriod
                            ? `ล็อคเวลา: ${DAY_LABELS[b.fixedDay]?.full} คาบ ${b.fixedStartPeriod} (${b.duration} คาบ)`
                            : "ไม่ล็อคเวลา (Solver จัดให้)"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="แก้ไขคาบล็อคนี้"
                          onClick={() => handleOpenEditSyncBlock(b)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-100/60 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="ลบคาบล็อคนี้"
                          onClick={() => {
                            if (window.confirm(`ต้องการลบคาบล็อค "${b.title}" หรือไม่?`)) {
                              deleteSyncBlock(b.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 text-slate-600 text-[11px] border-t border-emerald-100 pt-2">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          ห้องเรียนที่ร่วม ({b.classroomIds.length} ห้อง):{" "}
                          {b.classroomIds
                            .slice(0, 5)
                            .map((id) => dataset.classrooms.find((c) => c.id === id)?.name)
                            .filter(Boolean)
                            .join(", ")}
                          {b.classroomIds.length > 5 ? ` และอีก ${b.classroomIds.length - 5} ห้อง` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>
                          {b.bindAdvisorsAutomatically
                            ? "ดึงครูที่ปรึกษาประจำระดับชั้นเข้าคาบอัตโนมัติ (ข้อ 3)"
                            : `ครูผู้รับผิดชอบ: ${b.teacherIds.length} ท่าน`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category 3: วิชาเลือก */}
        {activeCategory === "elective" && (
          <div className="space-y-3">
            {electiveBlocks.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                ยังไม่มีกลุ่มวิชาเลือก คลิกในช่องตารางด้านบนเพื่อสร้างกลุ่มวิชาเลือกเสรี (มีสอนมากกว่า 2 คน พร้อมระบุห้อง)
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {electiveBlocks.map((b) => (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/40 flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-purple-600" />
                          <span>{b.title}</span>
                          <span className="text-xs bg-purple-200 text-purple-900 px-2 py-0.5 rounded font-semibold">
                            {b.offerings.length} รายวิชาเลือก
                          </span>
                        </div>
                        <div className="text-purple-800 text-[11px] mt-0.5">
                          {b.isTimeLocked && b.fixedDay && b.fixedStartPeriod
                            ? `ล็อคเวลา: ${DAY_LABELS[b.fixedDay]?.full} คาบ ${b.fixedStartPeriod} (${b.duration} คาบ)`
                            : "ไม่ล็อคเวลา (Solver จัดให้)"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="แก้ไขกลุ่มวิชาเลือกนี้"
                          onClick={() => handleOpenEditSyncBlock(b)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-100/60 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="ลบกลุ่มวิชาเลือกนี้"
                          onClick={() => {
                            if (window.confirm(`ต้องการลบกลุ่มวิชาเลือก "${b.title}" หรือไม่?`)) {
                              deleteSyncBlock(b.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 text-slate-600 text-[11px] border-t border-purple-100 pt-2">
                      <div>
                        <strong>ห้องเรียนที่จัดพร้อมกัน ({b.classroomIds.length} ห้อง):</strong>{" "}
                        {b.classroomIds
                          .map((id) => dataset.classrooms.find((c) => c.id === id)?.name)
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                      <div className="space-y-1 pt-1">
                        {b.offerings.map((o) => (
                          <div
                            key={o.id}
                            className="bg-white/80 p-1.5 rounded border border-purple-100 text-[11px] flex justify-between"
                          >
                            <span>
                              <strong>
                                {o.subjectCode} {o.subjectName}
                              </strong>{" "}
                              — ครู:{" "}
                              {o.teacherIds
                                .map((tid) => dataset.teachers.find((t) => t.id === tid)?.firstName)
                                .join(", ")}
                            </span>
                            <span className="text-purple-700">
                              {o.roomId
                                ? dataset.rooms.find((r) => r.id === o.roomId)?.code
                                : "ห้องประจำ"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category 4: ล็อคประชุมฝ่าย & รายชื่อฝ่ายบริหาร */}
        {activeCategory === "meetings" && (
          <div className="space-y-5">
            {/* กล่อง 1: จัดการรายชื่อฝ่ายบริหาร / คณะทำงาน (จัดการที่เดียวในคาบล็อค ตามข้อ 2) */}
            <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/70 pb-2">
                <div>
                  <h3 className="font-bold text-sm text-purple-950 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-purple-700" />
                    รายชื่อฝ่ายบริหาร / คณะทำงาน ({cleanDivisions.length} ฝ่าย)
                  </h3>
                  <p className="text-[11px] text-purple-800 mt-0.5">
                    จัดการรายชื่อฝ่ายทั้งหมดที่ใช้ในโรงเรียน สามารถพิมพ์เพิ่ม แก้ไขชื่อ หรือกดลบฝ่ายได้ที่นี่
                  </p>
                </div>
              </div>

              {/* รายการฝ่าย */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {cleanDivisions.map((div) => {
                  const isEditing = editingDivision?.id === div.id;
                  const memberCount = dataset.teachers.filter(
                    (t) => (t.divisionIds || []).includes(div.id) || (t.divisionIds || []).includes(div.name)
                  ).length;
                  const mtgCount = dataset.groupMeetingLocks.filter(
                    (m) => m.targetId === div.id || m.divisionName === div.name
                  ).length;

                  return (
                    <div
                      key={div.id}
                      className="p-2.5 rounded-lg border border-purple-200 bg-white flex items-center justify-between gap-2 text-xs shadow-2xs"
                    >
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            type="text"
                            value={editingDivision.name}
                            onChange={(e) =>
                              setEditingDivision({ ...editingDivision, name: e.target.value })
                            }
                            className="flex-1 border border-purple-400 rounded px-2 py-1 text-xs font-bold"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleUpdateDivisionName(div.id, editingDivision.name);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateDivisionName(div.id, editingDivision.name)}
                            className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-[10px]"
                          >
                            บันทึก
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDivision(null)}
                            className="px-1.5 py-1 text-slate-400 hover:text-slate-600 text-[10px]"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 truncate">{div.name}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              ครูในฝ่าย {memberCount} ท่าน • คาบประชุม {mtgCount} คาบ
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingDivision({ id: div.id, name: div.name })}
                              className="p-1 text-slate-400 hover:text-purple-700 hover:bg-purple-50 rounded"
                              title="แก้ไขชื่อฝ่ายนี้"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDivision(div)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                              title="ลบฝ่ายนี้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ฟอร์มเพิ่มฝ่าย */}
              <form onSubmit={handleAddDivision} className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newDivisionInput}
                  onChange={(e) => setNewDivisionInput(e.target.value)}
                  placeholder="พิมพ์ชื่อฝ่ายใหม่ เช่น ฝ่ายวิชาการ, นศท, ฝ่ายกิจการพิเศษ..."
                  className="flex-1 border border-purple-300 rounded-lg px-3 py-1.5 text-xs bg-white"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold shadow-2xs"
                >
                  + เพิ่มชื่อฝ่ายใหม่
                </button>
              </form>
            </div>

            {/* กล่อง 2: รายการคาบประชุมฝ่ายที่ล็อคไว้ */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                <div className="text-xs text-amber-950 font-bold">
                  รายการคาบประชุมฝ่ายที่ล็อคไว้ ({dataset.groupMeetingLocks.length} รายการ)
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenAddMeetingModal()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ เพิ่มคาบประชุมฝ่าย</span>
                </button>
              </div>

              {dataset.groupMeetingLocks.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  ยังไม่มีการล็อคคาบประชุมฝ่าย คลิกปุ่ม "+ เพิ่มคาบประชุมฝ่าย" ด้านบน หรือคลิกช่องตารางในแท็บ "2. ตารางภาพรวมคาบล็อค ประชุมฝ่าย & นศท."
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {dataset.groupMeetingLocks.map((m) => (
                    <div
                      key={m.id}
                      className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col justify-between space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <span>{m.title}</span>
                            <span className="text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-semibold">
                              {m.divisionName ||
                                dataset.divisions.find((d) => d.id === m.targetId)?.name ||
                                "ฝ่ายทั่วไป"}
                            </span>
                          </div>
                          <div className="text-amber-800 text-[11px] mt-0.5">
                            เวลาประชุม: {DAY_LABELS[m.day]?.full} คาบ {m.startPeriod} ({m.duration} คาบ)
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="แก้ไขคาบประชุมนี้"
                            onClick={() => handleOpenEditMeetingModal(m)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-100/70 transition"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="ลบคาบประชุมนี้"
                            onClick={() => {
                              if (window.confirm(`ต้องการลบคาบประชุม "${m.title}" หรือไม่?`)) {
                                deleteMeetingLock(m.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 text-slate-600 text-[11px] border-t border-amber-100 pt-2">
                        <div>
                          <strong>ครูที่เข้าประชุม:</strong>{" "}
                          {m.teacherIds && m.teacherIds.length > 0
                            ? m.teacherIds
                                .map((tid) => dataset.teachers.find((t) => t.id === tid)?.firstName)
                                .filter(Boolean)
                                .join(", ")
                            : "ตามสังกัดฝ่าย"}
                        </div>
                        <div className="text-[10px] text-amber-800">
                          🔒 ล็อคเฉพาะครูผู้เข้าประชุม • ไม่กระทบคาบเรียนของนักเรียน
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: กำหนดคาบตารางเรียนห้องเรียน (คลิกช่องตาราง) */}
      {/* ========================================================================= */}
      {classroomCellModal && activeClassroom && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-blue-600" />
                  {editingSyncBlockId ? "✏️ แก้ไขคาบล็อค:" : "กำหนดคาบตารางเรียน:"}{" "}
                  {DAY_LABELS[classroomCellModal.day]?.full} คาบ {classroomCellModal.period}
                </h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  ห้องเป้าหมาย: <strong>{activeClassroom.name}</strong> ({activeClassroom.programName})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClassroomCellModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Selector Tabs inside Classroom Modal */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setModalMode("free_period")}
                className={`p-2 rounded-lg border text-center font-bold transition ${
                  modalMode === "free_period"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div>🟢 คาบอิสระ</div>
                <div className="text-[10px] font-normal text-slate-500">คาบว่างห้องนี้</div>
              </button>

              <button
                type="button"
                onClick={() => setModalMode("school_lock")}
                className={`p-2 rounded-lg border text-center font-bold transition ${
                  modalMode === "school_lock"
                    ? "bg-blue-50 border-blue-500 text-blue-800 shadow-2xs"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div>🏫 ทั้งโรงเรียน</div>
                <div className="text-[10px] font-normal text-slate-500">เช่น ชุมนุม</div>
              </button>

              <button
                type="button"
                onClick={() => setModalMode("grade_sync")}
                className={`p-2 rounded-lg border text-center font-bold transition ${
                  modalMode === "grade_sync"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div>👥 ประจำระดับชั้น</div>
                <div className="text-[10px] font-normal text-slate-500">ลูกเสือ/คุณธรรม</div>
              </button>

              <button
                type="button"
                onClick={() => setModalMode("parallel_subject")}
                className={`p-2 rounded-lg border text-center font-bold transition ${
                  modalMode === "parallel_subject"
                    ? "bg-teal-50 border-teal-500 text-teal-800 shadow-2xs"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div>📚 เรียนพร้อมกัน</div>
                <div className="text-[10px] font-normal text-slate-500">เช่น IS แยกครู</div>
              </button>

              <button
                type="button"
                onClick={() => setModalMode("elective_pool")}
                className={`p-2 rounded-lg border text-center font-bold transition ${
                  modalMode === "elective_pool"
                    ? "bg-purple-50 border-purple-500 text-purple-800 shadow-2xs"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div>✨ วิชาเลือก</div>
                <div className="text-[10px] font-normal text-slate-500">ชุดวิชาเลือกเสรี</div>
              </button>
            </div>

            {/* Warning Alert: Teacher Conflicts & Interactive 2-Way Resolution (ข้อ 1 & 2) */}
            {detectedModalConflicts.length > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-2.5 animate-in fade-in duration-150">
                <div className="font-bold text-amber-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    พบข้อขัดแย้ง: ครูติดภารกิจ/ประชุมในคาบนี้ {detectedModalConflicts.length} ท่าน
                  </span>
                </div>
                <div className="text-[11px] text-amber-900 bg-amber-100/70 p-2.5 rounded-lg leading-relaxed space-y-1">
                  <div className="font-bold">แนวทางแก้ปัญหา 3 รูปแบบ:</div>
                  <div>1. <strong>แก้ไขให้คาบไม่ชนกัน</strong>: ปิดหน้าต่างนี้แล้วเลือกช่องวัน/คาบอื่น</div>
                  <div>
                    2. <strong>กดเลือกแนวทางสำหรับครูแต่ละท่าน</strong>: เลือกลงกิจกรรม, เลือกลงประชุม หรือ <strong>เลือกลงทั้งคู่ (แสดง 2 รายการคู่กันในตาราง)</strong>
                  </div>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {detectedModalConflicts.map((c) => (
                    <div
                      key={c.teacherId}
                      className="p-2.5 rounded-lg bg-white border border-amber-200 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{c.teacherName}</div>
                        <div className="text-[11px] text-amber-700">{c.reason}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResolveConflictForTeacher(c.teacherId, "attend_activity")}
                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition shadow-2xs"
                          title="ให้ครูลงคาบกิจกรรมนี้ (ยกเว้นคาบประชุมสำหรับครูท่านนี้)"
                        >
                          📌 เลือกลงกิจกรรม
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveConflictForTeacher(c.teacherId, "keep_meeting")}
                          className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-800 text-white font-bold text-[11px] transition shadow-2xs"
                          title="ให้ครูลงคาบประชุม (ไม่ลงคาบกิจกรรมนี้)"
                        >
                          🏢 เลือกลงประชุม
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveConflictForTeacher(c.teacherId, "both")}
                          className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] transition shadow-2xs"
                          title="ให้ครูมีชื่อลงทั้งสองรายการคู่กันในตาราง"
                        >
                          🤝 เลือกทั้งคู่ (ลง 2 รายการ)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* List of currently coexist teachers for this block (if any) */}
            {cellCoexistTeacherIds.length > 0 && (
              <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-xs space-y-1.5">
                <div className="font-bold text-purple-900 flex items-center justify-between">
                  <span>🤝 ครูที่เลือกลงทั้งคู่ (ปฏิบัติหน้าที่ 2 รายการคู่กัน) {cellCoexistTeacherIds.length} ท่าน:</span>
                  <button
                    type="button"
                    onClick={() => setCellCoexistTeacherIds([])}
                    className="text-purple-700 hover:underline text-[11px]"
                  >
                    ล้างการเลือกทั้งคู่
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cellCoexistTeacherIds.map((tid) => {
                    const t = dataset.teachers.find((x) => x.id === tid);
                    return (
                      <span
                        key={tid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-purple-300 text-purple-900 text-[11px] font-semibold shadow-2xs"
                      >
                        <span>{t ? getTeacherFullName(t) : tid}</span>
                        <button
                          type="button"
                          onClick={() => handleUndoCoexist(tid)}
                          className="text-purple-400 hover:text-rose-600 font-bold ml-0.5"
                          title="ยกเลิก (คืนค่าให้กลับมาชนกัน)"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* List of currently excluded teachers for this block (if any) */}
            {cellExcludedTeacherIds.length > 0 && (
              <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-lg text-xs space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <span>ครูที่เลือกลงคาบประชุม/ล็อค (ไม่ลงคาบกิจกรรมนี้) {cellExcludedTeacherIds.length} ท่าน:</span>
                  <button
                    type="button"
                    onClick={() => setCellExcludedTeacherIds([])}
                    className="text-blue-600 hover:underline text-[11px]"
                  >
                    ล้างข้อยกเว้นทั้งหมด
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cellExcludedTeacherIds.map((tid) => {
                    const t = dataset.teachers.find((x) => x.id === tid);
                    return (
                      <span
                        key={tid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-300 text-slate-800 text-[11px] font-semibold"
                      >
                        <span>{t ? getTeacherFullName(t) : tid}</span>
                        <button
                          type="button"
                          onClick={() => handleUndoExclusion(tid)}
                          className="text-slate-400 hover:text-rose-600 font-bold ml-0.5"
                          title="ยกเลิกการยกเว้น (ให้กลับมาร่วมกิจกรรม)"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-form 1: คาบอิสระ (Free Period) */}
            {modalMode === "free_period" && (
              <div className="space-y-3 pt-2 text-xs">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900 space-y-1">
                  <div className="font-bold">
                    ตั้งค่าให้ {DAY_LABELS[classroomCellModal.day]?.full} คาบ {classroomCellModal.period} เป็นคาบอิสระ
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    ระบบจัดตารางสอนจะไม่นำวิชาเรียนใดๆ มาลงในคาบนี้ ทำให้นักเรียนมีคาบว่างตรงตามที่ระบุ
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <label className="font-semibold text-slate-700">
                      เลือกห้องเรียนที่ต้องการล็อคคาบอิสระนี้ ({modalSelectedRoomIds.length} ห้อง):
                    </label>
                    <div className="flex gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const gradeRooms = dataset.classrooms
                            .filter((c) => activeClassroom && c.gradeLevelId === activeClassroom.gradeLevelId)
                            .map((c) => c.id);
                          setModalSelectedRoomIds(Array.from(new Set([...modalSelectedRoomIds, ...gradeRooms])));
                        }}
                        className="text-emerald-700 underline font-medium"
                      >
                        เลือกระดับชั้นนี้ ({activeClassroom?.name.split("/")[0]})
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalSelectedRoomIds(dataset.classrooms.map((c) => c.id))}
                        className="text-blue-700 underline font-medium"
                      >
                        เลือกทุกห้องทั้งโรงเรียน
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalSelectedRoomIds([])}
                        className="text-slate-500 underline"
                      >
                        ล้างทั้งหมด
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                    {sortClassrooms(dataset.classrooms).map((c) => {
                      const isChecked = modalSelectedRoomIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded transition">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setModalSelectedRoomIds((prev) => Array.from(new Set([...prev, c.id])));
                              } else {
                                setModalSelectedRoomIds((prev) => prev.filter((id) => id !== c.id));
                              }
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-medium text-slate-800">ห้อง {c.name}</span>
                          <span className="text-slate-400 text-[10px]">({c.programName})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setClassroomCellModal(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (modalSelectedRoomIds.length === 0) {
                        window.alert("กรุณาเลือกห้องเรียนอย่างน้อย 1 ห้อง");
                        return;
                      }
                      handleToggleFreeSlot(modalSelectedRoomIds, classroomCellModal.day, classroomCellModal.period);
                      setClassroomCellModal(null);
                    }}
                    className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
                  >
                    บันทึกเป็นคาบอิสระ ({modalSelectedRoomIds.length} ห้อง)
                  </button>
                </div>
              </div>
            )}

            {/* Sub-form 2: คาบทั้งโรงเรียน (เช่น ชุมนุม) */}
            {modalMode === "school_lock" && (
              <form onSubmit={handleSaveClassroomModal} className="space-y-3 pt-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">ชื่อกิจกรรมทั้งโรงเรียน</label>
                    <input
                      type="text"
                      value={cellSchoolTitle}
                      onChange={(e) => setCellSchoolTitle(e.target.value)}
                      placeholder="เช่น กิจกรรมชุมนุม"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">รหัสวิชา (ถ้ามี)</label>
                    <input
                      type="text"
                      value={cellSchoolCode}
                      onChange={(e) => setCellSchoolCode(e.target.value)}
                      placeholder="เช่น ก20902"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">จำนวนคาบติดกัน</label>
                    <select
                      value={cellSchoolDuration}
                      onChange={(e) => setCellSchoolDuration(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    >
                      <option value={1}>1 คาบ</option>
                      <option value={2}>2 คาบติด</option>
                      <option value={3}>3 คาบติด</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">ห้องที่ใช้ร่วมกัน (ถ้ามี)</label>
                    <select
                      value={cellSchoolRoomId}
                      onChange={(e) => setCellSchoolRoomId(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    >
                      <option value="">ห้องนักเรียน / แยกตามชุมนุม</option>
                      {dataset.rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code} ({r.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cellSchoolBindAllTeachers}
                      onChange={(e) => setCellSchoolBindAllTeachers(e.target.checked)}
                      className="rounded border-blue-300 text-blue-600"
                    />
                    <span className="font-bold text-blue-950">
                      ปรากฏในตารางสอนของครูทุกคนในโรงเรียนอัตโนมัติ (ข้อ 2)
                    </span>
                  </label>
                  <p className="text-[11px] text-blue-800 mt-1 pl-5">
                    ครูทุกคนจะถูกลงตารางในคาบนี้โดยอัตโนมัติ และระบบจะไม่นำคาบสอนวิชาการอื่นมาชน
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setClassroomCellModal(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
                  >
                    {editingSyncBlockId ? "บันทึกการแก้ไขคาบทั้งโรงเรียน" : "บันทึกคาบทั้งโรงเรียน"}
                  </button>
                </div>
              </form>
            )}

            {/* Sub-form 3: คาบประจำระดับชั้น */}
            {modalMode === "grade_sync" && (
              <form onSubmit={handleSaveClassroomModal} className="space-y-3 pt-2 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ประเภทกิจกรรมระดับชั้น</label>
                  <select
                    value={cellGradeBlockType}
                    onChange={(e) => {
                      const next = e.target.value as SyncBlockType;
                      setCellGradeBlockType(next);
                      if (next === "moral_assembly") {
                        setCellGradeTitle(`อบรมคุณธรรม ${activeClassroom?.name.split("/")[0]}`);
                        setCellGradeBindAdvisors(true);
                      } else if (next === "homeroom") {
                        setCellGradeTitle(`พบครูที่ปรึกษา (Homeroom)`);
                        setCellGradeBindAdvisors(true);
                      } else if (next === "grade_sync") {
                        setCellGradeTitle(`ลูกเสือ-เนตรนารี ${activeClassroom?.name.split("/")[0]}`);
                      }
                    }}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                  >
                    {Object.entries(SYNC_BLOCK_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">ชื่อกิจกรรม</label>
                    <input
                      type="text"
                      value={cellGradeTitle}
                      onChange={(e) => setCellGradeTitle(e.target.value)}
                      placeholder="เช่น ลูกเสือ-เนตรนารี ม.1"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">รหัสวิชา (ถ้ามี)</label>
                    <input
                      type="text"
                      value={cellGradeCode}
                      onChange={(e) => setCellGradeCode(e.target.value)}
                      placeholder="เช่น ก21903"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">ขอบเขตห้องเรียน</label>
                    <select
                      value={cellGradeScope}
                      onChange={(e) => setCellGradeScope(e.target.value as typeof cellGradeScope)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-emerald-950 bg-white"
                    >
                      <option value="current_grade">ทั้งระดับชั้นนี้ ({activeClassroom?.name.split("/")[0]})</option>
                      <option value="current_room">เฉพาะห้องนี้ ({activeClassroom?.name})</option>
                      <option value="custom">ระบุห้องเรียนเอง ({modalSelectedRoomIds.length} ห้อง)</option>
                      <option value="all_rooms">ทุกห้องทั้งโรงเรียน ({dataset.classrooms.length} ห้อง)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">จำนวนคาบติดกัน</label>
                    <select
                      value={cellGradeDuration}
                      onChange={(e) => setCellGradeDuration(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    >
                      <option value={1}>1 คาบ</option>
                      <option value={2}>2 คาบติด</option>
                      <option value={3}>3 คาบติด</option>
                    </select>
                  </div>
                </div>

                {cellGradeScope === "custom" && (
                  <div className="border border-emerald-200 bg-emerald-50/50 p-2.5 rounded-lg space-y-1.5 text-xs">
                    <div className="font-semibold text-emerald-950 flex items-center justify-between">
                      <span>ติ๊กเลือกห้องเรียนที่ร่วมกิจกรรมนี้ ({modalSelectedRoomIds.length} ห้อง):</span>
                      <div className="flex gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            const gradeRooms = dataset.classrooms
                              .filter((c) => activeClassroom && c.gradeLevelId === activeClassroom.gradeLevelId)
                              .map((c) => c.id);
                            setModalSelectedRoomIds(Array.from(new Set([...modalSelectedRoomIds, ...gradeRooms])));
                          }}
                          className="text-emerald-700 underline font-medium"
                        >
                          เลือกระดับชั้นนี้
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalSelectedRoomIds(dataset.classrooms.map((c) => c.id))}
                          className="text-blue-700 underline font-medium"
                        >
                          เลือกทุกห้อง
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalSelectedRoomIds([])}
                          className="text-slate-500 underline"
                        >
                          ล้าง
                        </button>
                      </div>
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1 border border-slate-200 bg-white p-2 rounded">
                      {sortClassrooms(dataset.classrooms).map((c) => {
                        const isChecked = modalSelectedRoomIds.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setModalSelectedRoomIds((prev) => Array.from(new Set([...prev, c.id])));
                                } else {
                                  setModalSelectedRoomIds((prev) => prev.filter((id) => id !== c.id));
                                }
                              }}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>ห้อง {c.name}</span>
                            <span className="text-slate-400 text-[10px]">({c.programName})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ตัวเลือกลงเฉพาะนักเรียน หรือลงทั้งคู่ */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cellStudentOnly}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setCellStudentOnly(checked);
                        if (checked) {
                          setCellGradeBindAdvisors(false);
                        } else {
                          setCellGradeBindAdvisors(true);
                        }
                      }}
                      className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-bold text-blue-950">
                      ลงเฉพาะในตารางของนักเรียน (ไม่ลงในตารางสอนของครู)
                    </span>
                  </label>
                  <p className="text-[11px] text-blue-800 pl-5">
                    {cellStudentOnly
                      ? "✓ ติ๊กเลือกแล้ว: คาบนี้จะลงเฉพาะตารางของนักเรียนเท่านั้น ครูจะไม่มีคาบนี้"
                      : "✕ ไม่ได้ติ๊ก (ค่าเริ่มต้น): ลงทั้งคู่ — ทั้งในตารางเรียนของนักเรียน และตารางสอนของครู"}
                  </p>
                </div>

                {!cellStudentOnly && (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-1 animate-in fade-in duration-150">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cellGradeBindAdvisors}
                        onChange={(e) => setCellGradeBindAdvisors(e.target.checked)}
                        className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-bold text-emerald-950">
                        ดึงครูที่ปรึกษาประจำระดับชั้นนี้เข้าคาบอัตโนมัติ (ลงตารางครู)
                      </span>
                    </label>
                    <p className="text-[11px] text-emerald-800 pl-5">
                      ครูที่ปรึกษาทุกคนในระดับชั้นจะถูกจัดลงคาบนี้ในตารางสอนควบคู่กับนักเรียน
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setClassroomCellModal(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                  >
                    {editingSyncBlockId ? "บันทึกการแก้ไขคาบประจำระดับชั้น" : "บันทึกคาบประจำระดับชั้น"}
                  </button>
                </div>
              </form>
            )}

            {/* Sub-form: วิชาเรียนพร้อมกันแต่แยกครูประจำห้อง (เช่น วิชา IS) */}
            {modalMode === "parallel_subject" && (
              <form onSubmit={handleSaveClassroomModal} className="space-y-3 pt-2 text-xs">
                <div className="bg-teal-50 border border-teal-200 p-2.5 rounded-lg text-teal-950 text-[11px] leading-relaxed">
                  <div className="font-bold flex items-center gap-1.5 text-teal-900">
                    <span>📚 วิชาเรียนพร้อมกันแต่แยกครูประจำห้อง (เช่น IS 5/1–5/5 คาบ 8 วันพฤหัสบดี)</span>
                  </div>
                  <div>นักเรียนทุกห้องที่เลือกจะเรียนวิชานี้ในคาบเดียวกัน แต่ระบบจะแยกครูผู้สอน 1 ห้องต่อ 1 คน และลงตารางครูแต่ละท่านแยกตามห้องจริง</div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">ชื่อวิชา / โครงงาน</label>
                    <input
                      type="text"
                      value={cellParallelTitle}
                      onChange={(e) => setCellParallelTitle(e.target.value)}
                      placeholder="เช่น การศึกษาค้นคว้าด้วยตนเอง (IS ม.5)"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">รหัสวิชา</label>
                    <input
                      type="text"
                      value={cellParallelCode}
                      onChange={(e) => setCellParallelCode(e.target.value)}
                      placeholder="เช่น I30201"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">จำนวนคาบติดกัน</label>
                    <select
                      value={cellParallelDuration}
                      onChange={(e) => setCellParallelDuration(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                    >
                      <option value={1}>1 คาบ</option>
                      <option value={2}>2 คาบติด</option>
                      <option value={3}>3 คาบติด</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        const initMap: Record<string, string> = {};
                        cellParallelRoomIds.forEach((rid) => {
                          const cls = dataset.classrooms.find((c) => c.id === rid);
                          if (cls?.advisorTeacherIds?.[0]) {
                            initMap[rid] = cls.advisorTeacherIds[0];
                          }
                        });
                        setCellParallelTeacherMap(initMap);
                      }}
                      className="w-full py-1.5 px-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg text-amber-900 font-bold text-[11px] transition shadow-2xs"
                      title="กรณีครูผู้สอน IS คือครูที่ปรึกษาประจำห้อง"
                    >
                      ⚡ ดึงครูที่ปรึกษาประจำห้องให้อัตโนมัติ
                    </button>
                  </div>
                </div>

                {/* ห้องเรียนที่เรียนพร้อมกัน */}
                <div className="border border-slate-200 bg-slate-50/60 p-2.5 rounded-lg space-y-2">
                  <div className="font-semibold text-slate-800 flex items-center justify-between">
                    <span>1. เลือกห้องเรียนที่เรียนพร้อมกัน ({cellParallelRoomIds.length} ห้อง):</span>
                    <div className="flex gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const gradeRooms = dataset.classrooms
                            .filter((c) => activeClassroom && c.gradeLevelId === activeClassroom.gradeLevelId)
                            .map((c) => c.id);
                          setCellParallelRoomIds(Array.from(new Set([...cellParallelRoomIds, ...gradeRooms])));
                        }}
                        className="text-emerald-700 underline font-medium"
                      >
                        เลือกระดับชั้นนี้
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const gradeRooms = dataset.classrooms
                            .filter((c) => activeClassroom && c.gradeLevelId === activeClassroom.gradeLevelId)
                            .slice(0, 5)
                            .map((c) => c.id);
                          setCellParallelRoomIds(gradeRooms);
                        }}
                        className="text-blue-700 underline font-medium"
                      >
                        เลือก 5 ห้องแรก (เช่น 5/1–5/5)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCellParallelRoomIds([])}
                        className="text-slate-500 underline"
                      >
                        ล้าง
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white border border-slate-200 rounded">
                    {sortClassrooms(dataset.classrooms).map((c) => {
                      const isChecked = cellParallelRoomIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            if (isChecked) {
                              setCellParallelRoomIds((prev) => prev.filter((id) => id !== c.id));
                            } else {
                              setCellParallelRoomIds((prev) => [...prev, c.id]);
                              if (!cellParallelTeacherMap[c.id] && c.advisorTeacherIds?.[0]) {
                                setCellParallelTeacherMap((prev) => ({ ...prev, [c.id]: c.advisorTeacherIds[0] }));
                              }
                            }
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
                            isChecked
                              ? "bg-teal-600 text-white border-teal-700 shadow-2xs"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {isChecked ? "✓ " : ""}ห้อง {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. กำหนดครูผู้สอนประจำแต่ละห้อง (ครูเข้าสอน 1 ห้องต่อครู 1 คน) */}
                <div className="space-y-1.5 border border-teal-200 bg-teal-50/40 p-2.5 rounded-lg">
                  <div className="font-semibold text-teal-950 flex items-center justify-between">
                    <span>2. ระบุครูผู้สอนประจำแต่ละห้อง (1 ห้องต่อครู 1 คน):</span>
                    <span className="text-[10px] text-teal-700 font-normal">
                      ระบุแล้ว {Object.values(cellParallelTeacherMap).filter(Boolean).length} / {cellParallelRoomIds.length} ห้อง
                    </span>
                  </div>

                  {cellParallelRoomIds.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-xs">
                      กรุณาเลือกห้องเรียนที่ร่วมเรียนด้านบนก่อน
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {cellParallelRoomIds.map((rid) => {
                        const cls = dataset.classrooms.find((c) => c.id === rid);
                        const currentTid = cellParallelTeacherMap[rid] || "";
                        return (
                          <div
                            key={rid}
                            className="flex items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs"
                          >
                            <span className="w-20 font-bold text-slate-800 text-[11px] shrink-0 text-center bg-slate-100 py-1 px-1.5 rounded">
                              ห้อง {cls?.name || rid}
                            </span>
                            <div className="flex-1">
                              <SearchableTeacherSelect
                                teachers={dataset.teachers}
                                departments={dataset.departments}
                                value={currentTid}
                                onChange={(tid) =>
                                  setCellParallelTeacherMap((prev) => ({ ...prev, [rid]: tid }))
                                }
                                placeholder={`-- เลือกครูผู้สอนห้อง ${cls?.name || ""} --`}
                              />
                            </div>
                            {currentTid && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCellParallelTeacherMap((prev) => ({ ...prev, [rid]: "" }))
                                }
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="ล้างครูห้องนี้"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setClassroomCellModal(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs"
                  >
                    {editingSyncBlockId ? "บันทึกการแก้ไขวิชาเรียนพร้อมกัน" : "บันทึกวิชาเรียนพร้อมกัน (เช่น IS)"}
                  </button>
                </div>
              </form>
            )}

            {/* Sub-form 4: วิชาเลือก (Elective Pool) */}
            {modalMode === "elective_pool" && (
              <form onSubmit={handleSaveClassroomModal} className="space-y-3 pt-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">ชื่อกลุ่มวิชาเลือก</label>
                    <input
                      type="text"
                      value={cellElecTitle}
                      onChange={(e) => setCellElecTitle(e.target.value)}
                      placeholder="เช่น วิชาเลือกเสรี ม.2 (ห้อง 7-10)"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">จำนวนคาบ</label>
                    <select
                      value={cellElecDuration}
                      onChange={(e) => setCellElecDuration(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    >
                      <option value={1}>1 คาบ</option>
                      <option value={2}>2 คาบติด</option>
                      <option value={3}>3 คาบติด</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    เลือกห้องเรียนที่เรียนวิชาเลือกพร้อมกัน:
                  </label>
                  <div className="flex flex-wrap gap-1.5 p-2 border border-slate-200 rounded-lg max-h-28 overflow-y-auto">
                    {availableClassrooms.map((c) => {
                      const isChecked = cellElecRoomIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCellElecRoomIds((prev) =>
                              prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                            );
                          }}
                          className={`px-2 py-0.5 rounded text-xs border font-medium transition ${
                            isChecked
                              ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Elective Offerings List & Builder */}
                <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg space-y-2">
                  <div className="font-bold text-purple-950 flex items-center justify-between">
                    <span>รายวิชาเลือกที่เปิดพร้อมกัน ({cellElecOfferings.length} วิชา) (ข้อ 4):</span>
                  </div>

                  {cellElecOfferings.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {cellElecOfferings.map((o) => (
                        <div
                          key={o.id}
                          className="bg-white p-2 rounded border border-purple-200 flex items-center justify-between text-[11px]"
                        >
                          <div className="truncate mr-2">
                            <strong>
                              {o.subjectCode} {o.subjectName}
                            </strong>{" "}
                            — ครู:{" "}
                            {o.teacherIds
                              .map((tid) => dataset.teachers.find((t) => t.id === tid)?.firstName)
                              .join(", ")}
                            {" | ห้อง: "}
                            {o.roomId ? dataset.rooms.find((r) => r.id === o.roomId)?.code : "ห้องประจำ"}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setCellElecOfferings((prev) => prev.filter((x) => x.id !== o.id))
                            }
                            className="text-rose-600 font-bold shrink-0"
                          >
                            ลบ
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 pt-1 border-t border-purple-200">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5 items-end">
                      <div>
                        <label className="block text-[10px] font-semibold text-purple-900">ชื่อวิชาเลือก</label>
                        <input
                          type="text"
                          value={cellOffName}
                          onChange={(e) => setCellOffName(e.target.value)}
                          placeholder="ชื่อวิชา"
                          className="w-full border border-purple-300 rounded px-2 py-1 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-purple-900 mb-0.5">ครูผู้สอนหลัก</label>
                        <SearchableTeacherSelect
                          teachers={dataset.teachers}
                          departments={dataset.departments}
                          value={cellOffTeacherId}
                          onChange={setCellOffTeacherId}
                          placeholder="-- ค้นหา/เลือกครู --"
                          size="sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-purple-900">ห้องที่ใช้</label>
                        <select
                          value={cellOffRoomId}
                          onChange={(e) => setCellOffRoomId(e.target.value)}
                          className="w-full border border-purple-300 rounded px-1.5 py-1 text-xs bg-white"
                        >
                          <option value="">ห้องประจำ</option>
                          {dataset.rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.code}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddCellOffering}
                        className="py-1 px-2.5 rounded bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs"
                      >
                        + เพิ่มวิชา
                      </button>
                    </div>

                    {/* ครูสอนร่วมคนที่ 2, 3, 4... (ข้อ 3: มีสอนร่วมมากกว่า 2 คนได้) */}
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-semibold text-purple-900">ครูสอนร่วมเพิ่มเติม (ถ้ามี):</span>
                        {cellOffCoTeacherIds.map((tid) => {
                          const t = dataset.teachers.find((x) => x.id === tid);
                          return (
                            <span key={tid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-200 text-purple-900 text-[10px] font-semibold">
                              {t ? getTeacherFullName(t) : tid}
                              <button
                                type="button"
                                onClick={() => setCellOffCoTeacherIds((prev) => prev.filter((id) => id !== tid))}
                                className="hover:text-rose-700 font-bold ml-0.5"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                      <SearchableTeacherSelect
                        teachers={dataset.teachers}
                        departments={dataset.departments}
                        value=""
                        onChange={(tid) => {
                          if (tid && !cellOffCoTeacherIds.includes(tid)) {
                            setCellOffCoTeacherIds((prev) => [...prev, tid]);
                          }
                        }}
                        placeholder="+ ค้นหา/เลือกครูสอนร่วมเพิ่มเติมในวิชานี้ (คนที่ 2, 3...)"
                        excludeIds={cellOffTeacherId ? [cellOffTeacherId, ...cellOffCoTeacherIds] : cellOffCoTeacherIds}
                        allowEmpty
                        emptyLabel="-- ไม่เลือก --"
                        size="sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setClassroomCellModal(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs"
                  >
                    {editingSyncBlockId ? "บันทึกการแก้ไขกลุ่มวิชาเลือก" : "บันทึกกลุ่มวิชาเลือก"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ล็อคคาบประชุมครู (เพิ่ม/แก้ไขคาบประชุมฝ่าย) */}
      {/* ========================================================================= */}
      {teacherCellModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  {teacherCellModal.editingMeetingId ? "✏️ แก้ไขคาบประชุมฝ่าย" : "+ เพิ่มคาบประชุมฝ่าย"}
                </h3>
                <div className="text-xs text-purple-700 mt-0.5">
                  วัน{DAY_LABELS[mtgDay]?.full} คาบ {mtgStartPeriod} ({mtgDuration} คาบ) • ล็อคเฉพาะครูที่เข้าประชุม
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTeacherCellModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacherMeetingModal} className="space-y-3 pt-1 text-xs">
              <div className="grid grid-cols-3 gap-2 bg-purple-50/60 p-2.5 rounded-lg border border-purple-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">วันประชุม</label>
                  <select
                    value={mtgDay}
                    onChange={(e) => setMtgDay(e.target.value as DayOfWeek)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-purple-900 bg-white"
                  >
                    {dataset.term.daysOfWeek.map((d) => (
                      <option key={d} value={d}>
                        วัน{DAY_LABELS[d]?.full}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">คาบเริ่มต้น</label>
                  <select
                    value={mtgStartPeriod}
                    onChange={(e) => setMtgStartPeriod(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-purple-900 bg-white"
                  >
                    {(dataset.term.periodsConfig || []).map((p) => (
                      <option key={p.period} value={p.period}>
                        คาบ {p.period} ({p.startTime} - {p.endTime})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">จำนวนคาบ</label>
                  <select
                    value={mtgDuration}
                    onChange={(e) => setMtgDuration(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-purple-900 bg-white"
                  >
                    {Array.from({ length: 4 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d} คาบ
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ชื่อฝ่าย / งาน (พิมพ์กำหนดเองได้ หรือเลือกจากลิสต์)
                  </label>
                  <input
                    type="text"
                    list="division-options"
                    value={mtgDivisionName}
                    onChange={(e) => setMtgDivisionName(e.target.value)}
                    placeholder="เช่น ฝ่ายบริหารวิชาการ, ฝ่ายกิจการนักเรียน, นศท"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                    required
                  />
                  <datalist id="division-options">
                    {dataset.divisions.map((d) => (
                      <option key={d.id} value={d.name} />
                    ))}
                    <option value="ฝ่ายบริหารวิชาการ" />
                    <option value="ฝ่ายกิจการนักเรียน" />
                    <option value="ฝ่ายบริหารงานบุคคล" />
                    <option value="ฝ่ายแผนงานและงบประมาณ" />
                    <option value="นศท" />
                    <option value="กลุ่มสาระฯ" />
                  </datalist>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ชื่องานประชุม</label>
                  <input
                    type="text"
                    value={mtgTitle}
                    onChange={(e) => setMtgTitle(e.target.value)}
                    placeholder="เช่น ประชุมฝ่ายบริหารวิชาการประจำสัปดาห์"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                    required
                  />
                </div>
              </div>

              {/* Presets and helpful note */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ตัวเลือกลัด (คลิกเพื่อกำหนดชื่อฝ่าย & งานประชุมอัตโนมัติ):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { div: "ฝ่ายบริหารวิชาการ", title: "ประชุมฝ่ายบริหารวิชาการ" },
                    { div: "ฝ่ายกิจการนักเรียน", title: "ประชุมฝ่ายกิจการนักเรียน" },
                    { div: "ฝ่ายบริหารงานบุคคล", title: "ประชุมฝ่ายบริหารงานบุคคล" },
                    { div: "ฝ่ายแผนงานและงบประมาณ", title: "ประชุมฝ่ายแผนงานและงบประมาณ" },
                    { div: "นศท", title: "กิจกรรม นศท. (นักศึกษาวิชาทหาร)" },
                    { div: "กลุ่มสาระฯ", title: "ประชุมกลุ่มสาระการเรียนรู้" },
                  ].map((preset) => (
                    <button
                      key={preset.title}
                      type="button"
                      onClick={() => {
                        setMtgDivisionName(preset.div);
                        setMtgTitle(preset.title);
                      }}
                      className="px-2.5 py-1 rounded-md bg-purple-100 hover:bg-purple-200 text-purple-900 text-[11px] font-semibold border border-purple-200 transition"
                    >
                      + {preset.div}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                <span className="text-base">💡</span>
                <div>
                  <div className="font-bold">ไม่ต้องเลือกรายชื่อครูในขั้นตอนนี้</div>
                  <div className="text-slate-600 mt-0.5">
                    สามารถลงคาบประชุมฝ่ายและกิจกรรม นศท. ได้หลายรายการในคาบเดียวกัน เมื่อลงตารางแล้ว สามารถไปกำหนดรายชื่อครูผู้รับผิดชอบหรือเข้าประชุมได้ที่เมนู <strong>"ครูผู้สอน & ล็อคคาบไม่ว่าง"</strong> ในภายหลัง
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setTeacherCellModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs"
                >
                  {teacherCellModal.editingMeetingId
                    ? "บันทึกการแก้ไขคาบประชุม"
                    : `บันทึกคาบประชุม (${mtgDuration} คาบ)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Copy Free Slots to other rooms */}
      {/* ========================================================================= */}
      {copyModalOpen && activeClassroom && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Copy className="w-4 h-4 text-blue-600" />
                คัดลอกคาบอิสระจากห้อง {activeClassroom.name}
              </h3>
              <button
                type="button"
                onClick={() => setCopyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                คัดลอกตำแหน่งคาบอิสระจำนวน <strong>{activeClassroom.lockedFreeSlots?.length || 0}</strong> คาบ
                ไปยังห้องเรียนปลายทางที่เลือก:
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2.5">
                {sortClassrooms(
                  dataset.classrooms.filter((c) => c.id !== activeClassroom.id)
                ).map((c) => {
                    const isChecked = copyTargetRoomIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCopyTargetRoomIds((prev) => [...prev, c.id]);
                            } else {
                              setCopyTargetRoomIds((prev) => prev.filter((id) => id !== c.id));
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span>
                          ห้อง {c.name} ({c.programName})
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setCopyModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleCopyFreeSlotsToRooms}
                disabled={copyTargetRoomIds.length === 0}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold"
              >
                คัดลอกไปยัง {copyTargetRoomIds.length} ห้อง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Quick Edit Teacher Name */}
      {/* ========================================================================= */}
      {quickEditTeacher && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Pencil className="w-4 h-4 text-purple-600" />
                แก้ไขรายชื่อครู ({quickEditTeacher.code})
              </h3>
              <button
                type="button"
                onClick={() => setQuickEditTeacher(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                upsertTeacher(quickEditTeacher);
                setQuickEditTeacher(null);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 mb-1">คำนำหน้า</label>
                <input
                  type="text"
                  value={quickEditTeacher.prefix}
                  onChange={(e) =>
                    setQuickEditTeacher({ ...quickEditTeacher, prefix: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ชื่อ</label>
                  <input
                    type="text"
                    value={quickEditTeacher.firstName}
                    onChange={(e) =>
                      setQuickEditTeacher({ ...quickEditTeacher, firstName: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">นามสกุล</label>
                  <input
                    type="text"
                    value={quickEditTeacher.lastName}
                    onChange={(e) =>
                      setQuickEditTeacher({ ...quickEditTeacher, lastName: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setQuickEditTeacher(null)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-xs"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs"
                >
                  บันทึกชื่อครู
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
