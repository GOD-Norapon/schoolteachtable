"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  Columns2,
  Copy,
  Eye,
  GraduationCap,
  Layers,
  Lock,
  Pin,
  PinOff,
  Play,
  Plus,
  Printer,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";
import {
  DAY_LABELS,
  DayOfWeek,
  SchoolDataset,
  TimetableEntry,
} from "@/types/timetable";
import {
  canSpanConsecutivePeriods,
  evaluateEntryPlacement,
  findSmartSwapSuggestions,
  getTeacherFullName,
  isTeacherInGroupMeeting,
  PlacementCheckResult,
  resolveEntryPhysicalRooms,
  resolveSyncBlockTeachers,
  sortClassrooms,
  SwapSuggestion,
} from "@/lib/solver/validator";
import { SearchableTeacherSelect } from "@/components/SearchableTeacherSelect";
import {
  runTimetableSolver,
  SolverProgressEvent,
  SolverResult,
} from "@/lib/solver/engine";
import type {
  WorkerRequestMessage,
  WorkerResponseMessage,
} from "@/lib/solver/solver.worker";

type PerspectiveMode = "classroom" | "teacher" | "room" | "master";

interface VisualColumn {
  kind: "period" | "break";
  period?: number;
  label: string;
  sublabel: string;
  isLate?: boolean;
}

interface CellEvaluationMeta {
  mode: "move" | "swap" | "blocked";
  status: "valid" | "soft_warning" | "hard_conflict";
  hardReasons: string[];
  softWarnings: string[];
  swapPartner?: TimetableEntry;
  hasPhysicalClash: boolean;
}

function buildVisualColumns(dataset: SchoolDataset): VisualColumn[] {
  const cols: VisualColumn[] = [];
  const sorted = [...dataset.term.periodsConfig].sort((a, b) => a.period - b.period);
  for (const pc of sorted) {
    cols.push({
      kind: "period",
      period: pc.period,
      label: pc.label,
      sublabel: `${pc.startTime}–${pc.endTime}`,
      isLate: pc.isLatePeriod,
    });
    const brk = dataset.term.breaksConfig.find((b) => b.afterPeriod === pc.period);
    if (brk) {
      cols.push({
        kind: "break",
        label: brk.durationMinutes <= 25 ? `พัก ${brk.durationMinutes} น.` : "พักกลางวัน",
        sublabel: brk.label,
      });
    }
  }
  return cols;
}

function DraggableEntryWrapper({
  entry,
  disabled,
  children,
}: {
  entry: TimetableEntry;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `entry:${entry.id}`,
    data: { entry },
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="h-full">
      {children}
    </div>
  );
}

function DroppableSlotCell({
  day,
  period,
  colSpan,
  className,
  onClick,
  title,
  children,
}: {
  day: DayOfWeek;
  period: number;
  colSpan: number;
  className?: string;
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot:${day}:${period}`,
    data: { day, period },
  });

  return (
    <td
      ref={setNodeRef}
      colSpan={colSpan}
      onClick={onClick}
      title={title}
      className={`${className || ""} ${
        isOver ? "ring-2 ring-inset ring-blue-600 bg-blue-50/80" : ""
      }`}
    >
      {children}
    </td>
  );
}

class SchedulerErrorBoundary extends React.Component<
  { children: React.ReactNode; fallbackTitle?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallbackTitle?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Scheduler grid error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white rounded-xl border border-rose-200 p-6 shadow-sm text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-rose-700 bg-rose-50 px-3 py-1 rounded-full text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            {this.props.fallbackTitle || "เกิดข้อผิดพลาดในการแสดงผลตาราง"}
          </div>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            {this.state.error?.message || "ระบบพบปัญหาข้อมูลบางส่วนในตารางนี้"}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition"
          >
            ลองโหลดตารางใหม่อีกครั้ง
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface ConflictModalPayload {
  teacherId: string;
  day: DayOfWeek;
  period: number;
  syncBlock?: any;
  meeting?: any;
  unavail?: any;
  existingEntry?: TimetableEntry;
  isCoexist?: boolean;
}

function SchedulerInner() {
  const searchParams = useSearchParams();

  const {
    dataset,
    activeVersionId,
    setActiveVersionId,
    activeVersionEntries,
    readinessReport,
    createVersion,
    deleteVersion,
    setVersionPublished,
    replaceVersionEntries,
    updateEntriesBatch,
    upsertSyncBlock,
    upsertMeetingLock,
    upsertTeacher,
  } = useSchoolData();

  const [perspective, setPerspective] = useState<PerspectiveMode>("classroom");
  const [splitView, setSplitView] = useState<boolean>(true);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(
    () => dataset.classrooms[0]?.id ?? ""
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    () => dataset.teachers[0]?.id ?? ""
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    () => dataset.rooms.find((r) => r.roomType !== "homeroom")?.id ?? dataset.rooms[0]?.id ?? ""
  );

  // Focus & Conflict resolution states (ข้อ 1-4: คาบกิจกรรมชนคาบล็อคครู)
  const [focusedSlot, setFocusedSlot] = useState<{ day: DayOfWeek; period: number } | null>(null);
  const [conflictModalState, setConflictModalState] = useState<ConflictModalPayload | null>(null);
  const dismissedConflictKeysRef = useRef<Set<string>>(new Set());
  const autoOpenedConflictKeyRef = useRef<string | null>(null);

  const closeConflictModal = () => {
    if (conflictModalState) {
      const key = `${conflictModalState.teacherId}:${conflictModalState.day}:${conflictModalState.period}`;
      dismissedConflictKeysRef.current.add(key);
    }
    setConflictModalState(null);

    // ล้าง query parameters ออกจาก URL เพื่อป้องกันไม่ให้ useEffect เปิดโมดอลซ้ำวนลูป
    if (typeof window !== "undefined" && window.location.search) {
      const url = new URL(window.location.href);
      let changed = false;
      for (const p of ["day", "period", "syncBlockId"]) {
        if (url.searchParams.has(p)) {
          url.searchParams.delete(p);
          changed = true;
        }
      }
      if (changed) {
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    }
  };

  // Handle URL query parameters to immediately open a teacher's schedule and focus slot
  useEffect(() => {
    const p = searchParams.get("perspective");
    const tId = searchParams.get("teacherId");
    const cId = searchParams.get("classroomId");
    const rId = searchParams.get("roomId");
    const day = searchParams.get("day");
    const period = searchParams.get("period");

    if (p === "teacher" || tId) {
      setPerspective("teacher");
      if (tId) {
        setSelectedTeacherId(tId);
      }
    } else if (p === "classroom" || cId) {
      setPerspective("classroom");
      if (cId) {
        setSelectedClassroomId(cId);
      }
    } else if (p === "room" || rId) {
      setPerspective("room");
      if (rId) {
        setSelectedRoomId(rId);
      }
    }

    if (day && period) {
      setFocusedSlot({ day: day as DayOfWeek, period: Number(period) });
    }
  }, [searchParams, dataset.teachers, dataset.classrooms, dataset.rooms]);

  // Active classroom & Grade level selection (ข้อ 3: เลือกระดับชั้นก่อน แล้วค่อยเลือกห้อง 1-10)
  const activeClassroom = useMemo(
    () => dataset.classrooms.find((c) => c.id === selectedClassroomId) || dataset.classrooms[0],
    [dataset.classrooms, selectedClassroomId]
  );

  const [selectedGradeId, setSelectedGradeId] = useState<string>(() => {
    const initialRoom = dataset.classrooms[0];
    return initialRoom?.gradeLevelId ?? dataset.gradeLevels[0]?.id ?? "";
  });

  useEffect(() => {
    if (selectedClassroomId) {
      const room = dataset.classrooms.find((c) => c.id === selectedClassroomId);
      if (room && room.gradeLevelId && room.gradeLevelId !== selectedGradeId) {
        setSelectedGradeId(room.gradeLevelId);
      }
    }
  }, [selectedClassroomId, dataset.classrooms, selectedGradeId]);

  const gradeSortedClassrooms = useMemo(() => {
    const roomsInGrade = dataset.classrooms.filter((c) => c.gradeLevelId === selectedGradeId);
    return sortClassrooms(roomsInGrade);
  }, [dataset.classrooms, selectedGradeId]);

  const handleSelectGrade = (gradeId: string) => {
    setSelectedGradeId(gradeId);
    const roomsInGrade = sortClassrooms(dataset.classrooms.filter((c) => c.gradeLevelId === gradeId));
    if (roomsInGrade.length > 0) {
      setSelectedClassroomId(roomsInGrade[0].id);
    }
  };

  // Solver execution state
  const [keepPinned, setKeepPinned] = useState<boolean>(true);
  const [optSeconds, setOptSeconds] = useState<number>(
    dataset.term.solverSettings.optimizationSeconds || 6
  );
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [solverProgress, setSolverProgress] = useState<SolverProgressEvent | null>(null);
  const [lastSolverSummary, setLastSolverSummary] = useState<SolverResult | null>(null);
  const [solverError, setSolverError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Interactive selection & drag state
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [activeDragEntry, setActiveDragEntry] = useState<TimetableEntry | null>(null);
  const [actionBanner, setActionBanner] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  // Case-by-case Override confirmation modal
  const [overrideModal, setOverrideModal] = useState<{
    sourceEntry: TimetableEntry;
    targetDay: DayOfWeek;
    targetPeriod: number;
    swapPartner?: TimetableEntry;
    hardReasons: string[];
    softWarnings: string[];
    note: string;
  } | null>(null);

  // New version modal
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [copyCurrentEntries, setCopyCurrentEntries] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  // Keep selected entity IDs valid when dataset changes
  useEffect(() => {
    if (dataset.classrooms.length > 0 && !dataset.classrooms.some((c) => c.id === selectedClassroomId)) {
      setSelectedClassroomId(dataset.classrooms[0]?.id ?? "");
    }
    if (dataset.teachers.length > 0 && !dataset.teachers.some((t) => t.id === selectedTeacherId)) {
      const tId = searchParams.get("teacherId");
      if (tId && dataset.teachers.some((t) => t.id === tId)) {
        setSelectedTeacherId(tId);
      } else {
        setSelectedTeacherId(dataset.teachers[0]?.id ?? "");
      }
    }
    if (dataset.rooms.length > 0 && !dataset.rooms.some((r) => r.id === selectedRoomId)) {
      setSelectedRoomId(
        dataset.rooms.find((r) => r.roomType !== "homeroom")?.id ?? dataset.rooms[0]?.id ?? ""
      );
    }
  }, [dataset.classrooms, dataset.teachers, dataset.rooms, selectedClassroomId, selectedTeacherId, selectedRoomId, searchParams]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const visualCols = useMemo(() => buildVisualColumns(dataset), [dataset]);
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
  const deptsMap = useMemo(
    () => new Map(dataset.departments.map((d) => [d.id, d])),
    [dataset.departments]
  );
  const syncBlocksMap = useMemo(
    () => new Map(dataset.synchronizedBlocks.map((b) => [b.id, b])),
    [dataset.synchronizedBlocks]
  );

  const activeVersion = useMemo(
    () => dataset.versions.find((v) => v.id === activeVersionId) ?? dataset.versions[0],
    [dataset.versions, activeVersionId]
  );

  const selectedEntry = useMemo(
    () => activeVersionEntries.find((e) => e.id === selectedEntryId) ?? null,
    [activeVersionEntries, selectedEntryId]
  );

  // Automatically sync Split-View companion teacher/room when user clicks an entry
  useEffect(() => {
    if (!selectedEntry) return;
    if (perspective === "classroom" && selectedEntry.teacherIds.length > 0) {
      setSelectedTeacherId(selectedEntry.teacherIds[0]);
    } else if (perspective === "teacher" && selectedEntry.classroomIds.length > 0) {
      setSelectedClassroomId(selectedEntry.classroomIds[0]);
    }
  }, [selectedEntry, perspective]);

  // If URL parameters request a specific teacher slot (e.g. from /audit or notification link), auto-open conflict modal
  useEffect(() => {
    const tId = searchParams.get("teacherId");
    const day = searchParams.get("day") as DayOfWeek | null;
    const period = searchParams.get("period");
    if (!tId || !day || !period) return;

    const slotKey = `${tId}:${day}:${period}`;
    // ถ้าผู้ใช้เคยปิดหรือเลือกแนวทางแก้ไขไปแล้ว หรือเคยเปิดไปแล้ว ไม่ต้องเด้งซ้ำ
    if (dismissedConflictKeysRef.current.has(slotKey)) return;
    if (autoOpenedConflictKeyRef.current === slotKey) return;

    const pNum = Number(period);
    const teacher = teachersMap.get(tId);
    if (!teacher) return;

    const teacherMeetings = (dataset.groupMeetingLocks || []).filter(
      (m) => isTeacherInGroupMeeting(teacher, m, dataset.divisions)
    );
    const clashingMtg = teacherMeetings.find(
      (m) => m.day === day && pNum >= m.startPeriod && pNum < m.startPeriod + (m.duration || 1)
    );
    const syncBlockIdParam = searchParams.get("syncBlockId");
    const clashingSb = syncBlockIdParam
      ? syncBlocksMap.get(syncBlockIdParam)
      : dataset.synchronizedBlocks.find(
          (b) =>
            b.isTimeLocked &&
            b.fixedDay === day &&
            b.fixedStartPeriod !== null &&
            b.fixedStartPeriod !== undefined &&
            pNum >= b.fixedStartPeriod &&
            pNum < b.fixedStartPeriod + (b.duration || 1) &&
            resolveSyncBlockTeachers(b, classroomsMap, dataset.teachers).includes(tId)
        );
    const unavail = (teacher.unavailableSlots || []).find(
      (u) => u.day === day && u.period === pNum
    );

    // หากมีการแก้ไขให้ลงคู่กัน (coexist) หรือยกเว้นไปแล้ว (excluded) ถือว่าจัดการเสร็จแล้ว ไม่ต้องเด้งโมดอลขึ้นมาเตือนอีก
    const isAlreadyCoexist = Boolean(
      clashingSb?.coexistTeacherIds?.includes(tId) ||
      clashingMtg?.coexistTeacherIds?.includes(tId)
    );
    const isAlreadyExcluded = Boolean(
      clashingSb?.excludedTeacherIds?.includes(tId) ||
      clashingMtg?.excludedTeacherIds?.includes(tId)
    );
    if (isAlreadyCoexist || isAlreadyExcluded) {
      dismissedConflictKeysRef.current.add(slotKey);
      return;
    }

    if (clashingSb || clashingMtg) {
      autoOpenedConflictKeyRef.current = slotKey;
      setConflictModalState({
        teacherId: tId,
        day,
        period: pNum,
        syncBlock: clashingSb,
        meeting: clashingMtg,
        unavail,
        existingEntry: undefined,
        isCoexist: false,
      });
    }
  }, [searchParams, teachersMap, syncBlocksMap, classroomsMap, dataset.groupMeetingLocks, dataset.synchronizedBlocks, dataset.teachers]);

  const activeSubjectEntry = activeDragEntry ?? selectedEntry;

  // Evaluate all cells on the currently viewed Classroom or Teacher grid for live green/amber/red guidance
  const cellEvaluations = useMemo(() => {
    const map = new Map<string, CellEvaluationMeta>();
    if (!activeSubjectEntry || activeSubjectEntry.sourceType === "free_period") return map;

    const focusClassroomId =
      perspective === "classroom"
        ? selectedClassroomId
        : activeSubjectEntry.classroomIds.length === 1
        ? activeSubjectEntry.classroomIds[0]
        : "";

    const othersWithoutSource = activeVersionEntries.filter(
      (e) => e.id !== activeSubjectEntry.id && e.sourceType !== "free_period"
    );

    for (const day of dataset.term.daysOfWeek) {
      for (const pc of dataset.term.periodsConfig) {
        const p = pc.period;
        const key = `${day}:${p}`;
        if (day === activeSubjectEntry.day && p === activeSubjectEntry.startPeriod) continue;

        const spanOk = canSpanConsecutivePeriods(
          dataset.term,
          p,
          activeSubjectEntry.duration
        );
        if (!spanOk.valid) {
          map.set(key, {
            mode: "blocked",
            status: "hard_conflict",
            hardReasons: [spanOk.reason || "คร่อมเวลาพัก"],
            softWarnings: [],
            hasPhysicalClash: true,
          });
          continue;
        }

        // Check if occupied in the same classroom (potential 1-to-1 swap)
        const overlappingInFocusRoom = focusClassroomId
          ? othersWithoutSource.filter(
              (e) =>
                e.classroomIds.includes(focusClassroomId) &&
                e.day === day &&
                p < e.startPeriod + e.duration &&
                p + activeSubjectEntry.duration > e.startPeriod
            )
          : [];

        if (
          overlappingInFocusRoom.length === 1 &&
          activeSubjectEntry.classroomIds.length === 1 &&
          overlappingInFocusRoom[0].classroomIds.length === 1 &&
          overlappingInFocusRoom[0].sourceType === "assignment" &&
          overlappingInFocusRoom[0].duration === activeSubjectEntry.duration &&
          overlappingInFocusRoom[0].startPeriod === p
        ) {
          const partner = overlappingInFocusRoom[0];
          if (partner.isPinned) {
            map.set(key, {
              mode: "swap",
              status: "hard_conflict",
              hardReasons: [`คาบ "${partner.title}" ถูกปักหมุดล็อคไว้ (📌)`],
              softWarnings: [],
              swapPartner: partner,
              hasPhysicalClash: true,
            });
            continue;
          }

          const remaining = othersWithoutSource.filter((e) => e.id !== partner.id);
          const movedA: TimetableEntry = {
            ...activeSubjectEntry,
            day,
            startPeriod: p,
          };
          const evalA: PlacementCheckResult = evaluateEntryPlacement(
            activeSubjectEntry,
            day,
            p,
            remaining,
            dataset
          );
          const evalB: PlacementCheckResult = evaluateEntryPlacement(
            partner,
            activeSubjectEntry.day,
            activeSubjectEntry.startPeriod,
            [...remaining, movedA],
            dataset
          );

          const combinedHard = [...evalA.hardReasons, ...evalB.hardReasons];
          const combinedSoft = [...evalA.softWarnings, ...evalB.softWarnings];

          // Check whether any hard reason is an actual teacher/classroom double-booking
          const physicalDoubleBook = combinedHard.some(
            (r) => r.includes("มีเรียน") || r.includes("ติดสอน") || r.includes("ห้ามใช้ทับกัน")
          );

          map.set(key, {
            mode: "swap",
            status:
              combinedHard.length > 0
                ? "hard_conflict"
                : combinedSoft.length > 0
                ? "soft_warning"
                : "valid",
            hardReasons: combinedHard,
            softWarnings: combinedSoft,
            swapPartner: partner,
            hasPhysicalClash: physicalDoubleBook,
          });
          continue;
        }

        // Direct move check
        const evalMove = evaluateEntryPlacement(
          activeSubjectEntry,
          day,
          p,
          othersWithoutSource,
          dataset
        );
        const physicalDoubleBook = evalMove.hardReasons.some(
          (r) => r.includes("มีเรียน") || r.includes("ติดสอน") || r.includes("ห้ามใช้ทับกัน")
        );

        map.set(key, {
          mode: "move",
          status: evalMove.status,
          hardReasons: evalMove.hardReasons,
          softWarnings: evalMove.softWarnings,
          hasPhysicalClash: physicalDoubleBook,
        });
      }
    }

    return map;
  }, [activeSubjectEntry, activeVersionEntries, dataset, perspective, selectedClassroomId]);

  // Smart swap suggestions for the selected entry
  const smartSuggestions = useMemo<SwapSuggestion[]>(() => {
    if (!selectedEntry || selectedEntry.sourceType !== "assignment") return [];
    return findSmartSwapSuggestions(selectedEntry, activeVersionEntries, dataset).slice(0, 10);
  }, [selectedEntry, activeVersionEntries, dataset]);

  // Commit a direct move or 2-way swap while keeping classroom `free_period` entries strictly synchronized
  const commitMoveOrSwap = (
    source: TimetableEntry,
    targetDay: DayOfWeek,
    targetPeriod: number,
    swapPartner?: TimetableEntry,
    overrideInfo?: { overridden: boolean; note: string }
  ) => {
    const oldDay = source.day;
    const oldStart = source.startPeriod;

    if (swapPartner) {
      const updatedSource: TimetableEntry = {
        ...source,
        day: targetDay,
        startPeriod: targetPeriod,
        isOverridden: overrideInfo?.overridden ?? false,
        overrideNote: overrideInfo?.overridden ? overrideInfo.note : null,
      };
      const updatedPartner: TimetableEntry = {
        ...swapPartner,
        day: oldDay,
        startPeriod: oldStart,
        isOverridden: overrideInfo?.overridden ? true : swapPartner.isOverridden,
        overrideNote: overrideInfo?.overridden ? overrideInfo.note : swapPartner.overrideNote,
      };
      updateEntriesBatch([updatedSource, updatedPartner]);
      setActionBanner({
        tone: overrideInfo?.overridden ? "warning" : "success",
        text: `สลับคาบสำเร็จ: "${source.title}" ⇄ "${swapPartner.title}" (${DAY_LABELS[targetDay]?.short} คาบ ${targetPeriod})`,
      });
      return;
    }

    // Direct move: relocate any free_period entries in affected classrooms so vacant slots become free_period
    const updatedSource: TimetableEntry = {
      ...source,
      day: targetDay,
      startPeriod: targetPeriod,
      isOverridden: overrideInfo?.overridden ?? false,
      overrideNote: overrideInfo?.overridden ? overrideInfo.note : null,
    };

    const nonFreeNext = activeVersionEntries
      .filter((e) => e.sourceType !== "free_period")
      .map((e) => (e.id === source.id ? updatedSource : e));

    // Rebuild exact free_period entries for all classrooms in this version
    const rebuiltFreeEntries: TimetableEntry[] = [];
    for (const cls of dataset.classrooms) {
      const occupied = new Set<string>();
      for (const e of nonFreeNext) {
        if (!e.classroomIds.includes(cls.id)) continue;
        for (let k = 0; k < e.duration; k++) {
          occupied.add(`${e.day}:${e.startPeriod + k}`);
        }
      }
      let freeIdx = 0;
      for (const day of dataset.term.daysOfWeek) {
        for (const pc of dataset.term.periodsConfig) {
          if (!occupied.has(`${day}:${pc.period}`)) {
            rebuiltFreeEntries.push({
              id: `${activeVersionId}_free_${cls.id}_${day}_${pc.period}`,
              versionId: activeVersionId,
              sourceType: "free_period",
              assignmentId: null,
              syncBlockId: null,
              sessionIndex: freeIdx++,
              day,
              startPeriod: pc.period,
              duration: 1,
              classroomIds: [cls.id],
              subjectId: null,
              title: "คาบอิสระ",
              subjectCode: "FREE",
              teacherIds: [],
              roomId: null,
              electiveScope: null,
              isPinned: false,
              isOverridden: false,
              overrideNote: null,
            });
          }
        }
      }
    }

    replaceVersionEntries(
      activeVersionId,
      [...nonFreeNext, ...rebuiltFreeEntries],
      activeVersion?.score ?? 0,
      activeVersion?.hardConflictsCount ?? 0
    );

    setActionBanner({
      tone: overrideInfo?.overridden ? "warning" : "success",
      text: `ย้าย "${source.title}" ไปยัง ${DAY_LABELS[targetDay]?.full} คาบ ${
        source.duration > 1 ? `${targetPeriod}–${targetPeriod + source.duration - 1}` : targetPeriod
      } เรียบร้อยแล้ว`,
    });
  };

  const attemptTransferToSlot = (
    source: TimetableEntry,
    targetDay: DayOfWeek,
    targetPeriod: number
  ) => {
    if (source.sourceType === "free_period") return;
    if (source.day === targetDay && source.startPeriod === targetPeriod) return;

    if (source.isPinned) {
      setActionBanner({
        tone: "error",
        text: `คาบ "${source.title}" ถูกปักหมุด (📌) อยู่ กรุณาปลดหมุดก่อนย้ายตำแหน่ง`,
      });
      return;
    }

    const meta = cellEvaluations.get(`${targetDay}:${targetPeriod}`);
    if (!meta) return;

    if (meta.mode === "blocked") {
      setActionBanner({
        tone: "error",
        text: `ไม่สามารถวางได้: ${meta.hardReasons.join(" • ")}`,
      });
      return;
    }

    if (meta.status === "hard_conflict") {
      if (meta.hasPhysicalClash) {
        setActionBanner({
          tone: "error",
          text: `ย้ายไม่ได้เนื่องจากชนตารางซ้ำซ้อน: ${meta.hardReasons.join(" | ")}`,
        });
        return;
      }
      // Policy conflict only (e.g. Teacher personal lock, Meeting lock, Afternoon 3-streak, Period 8 cap, Subject period rule) -> Offer Case-by-Case Override!
      setOverrideModal({
        sourceEntry: source,
        targetDay,
        targetPeriod,
        swapPartner: meta.swapPartner,
        hardReasons: meta.hardReasons,
        softWarnings: meta.softWarnings,
        note: "ปรับแก้และอนุโลมรายกรณีโดยทีมวิชาการ",
      });
      return;
    }

    commitMoveOrSwap(source, targetDay, targetPeriod, meta.swapPartner);
  };

  // Drag-and-Drop handlers
  const handleDragStart = (ev: DragStartEvent) => {
    const ent = ev.active.data.current?.entry as TimetableEntry | undefined;
    if (ent) {
      setActiveDragEntry(ent);
      setSelectedEntryId(ent.id);
    }
  };

  const handleDragEnd = (ev: DragEndEvent) => {
    const source = activeDragEntry;
    setActiveDragEntry(null);
    if (!source || !ev.over) return;
    const targetData = ev.over.data.current as { day: DayOfWeek; period: number } | undefined;
    if (!targetData) return;
    attemptTransferToSlot(source, targetData.day, targetData.period);
  };

  // Run Auto-Solver via Web Worker (with direct fallback)
  const handleStartAutoSolve = () => {
    setSolverError(null);
    setActionBanner(null);
    setIsSolving(true);

    const pinnedEntries = keepPinned
      ? activeVersionEntries.filter((e) => e.isPinned && e.sourceType !== "free_period")
      : [];

    const finishWithResult = (res: SolverResult) => {
      replaceVersionEntries(activeVersionId, res.entries, res.softScore, res.hardConflicts);
      setLastSolverSummary(res);
      setIsSolving(false);
      setSolverProgress(null);
      setSelectedEntryId(null);
    };

    try {
      const worker = new Worker(
        new URL("../../lib/solver/solver.worker.ts", import.meta.url)
      );
      workerRef.current = worker;

      worker.onmessage = (ev: MessageEvent<WorkerResponseMessage>) => {
        const msg = ev.data;
        if (msg.type === "PROGRESS") {
          setSolverProgress(msg.event);
        } else if (msg.type === "RESULT") {
          finishWithResult(msg.result);
          worker.terminate();
          workerRef.current = null;
        } else if (msg.type === "ERROR") {
          setSolverError(msg.error);
          setIsSolving(false);
          worker.terminate();
          workerRef.current = null;
        }
      };

      worker.onerror = () => {
        worker.terminate();
        workerRef.current = null;
        // Fallback to main thread execution
        setTimeout(() => {
          try {
            const res = runTimetableSolver(dataset, {
              versionId: activeVersionId,
              preservePinnedEntries: pinnedEntries,
              maxOptimizationMs: optSeconds * 1000,
            });
            finishWithResult(res);
          } catch (err) {
            setSolverError(err instanceof Error ? err.message : String(err));
            setIsSolving(false);
          }
        }, 50);
      };

      const startMsg: WorkerRequestMessage = {
        type: "START_SOLVE",
        dataset,
        versionId: activeVersionId,
        preservePinnedEntries: pinnedEntries,
        maxOptimizationMs: optSeconds * 1000,
      };
      worker.postMessage(startMsg);
    } catch {
      // Fallback if Worker constructor unavailable
      setTimeout(() => {
        try {
          const res = runTimetableSolver(dataset, {
            versionId: activeVersionId,
            preservePinnedEntries: pinnedEntries,
            maxOptimizationMs: optSeconds * 1000,
          });
          finishWithResult(res);
        } catch (err) {
          setSolverError(err instanceof Error ? err.message : String(err));
          setIsSolving(false);
        }
      }, 50);
    }
  };

  const handleCancelSolver = () => {
    if (workerRef.current) {
      const cancelMsg: WorkerRequestMessage = { type: "CANCEL_SOLVE" };
      workerRef.current.postMessage(cancelMsg);
    }
  };

  // ข้อ 4: อัปเดตคาบล็อคและคาบประชุมลงตารางทันที เพื่อ recheck ก่อนกดจัดตาราง
  const handleSyncLockedBlocksAndMeetings = () => {
    const syncEntries: TimetableEntry[] = [];

    // 1. Synchronized Blocks ที่ล็อคเวลาไว้ (school_lock, grade_sync, elective_pool)
    for (const sb of dataset.synchronizedBlocks) {
      if (!sb.isTimeLocked || !sb.fixedDay || sb.fixedStartPeriod === null) continue;
      const resolvedTeachers = resolveSyncBlockTeachers(sb, classroomsMap, dataset.teachers);
      syncEntries.push({
        id: `sync_entry_${sb.id}`,
        versionId: activeVersionId,
        assignmentId: null,
        syncBlockId: sb.id,
        sessionIndex: 0,
        subjectId: null,
        classroomIds: sb.classroomIds,
        teacherIds: resolvedTeachers,
        roomId: sb.sharedRoomId || null,
        day: sb.fixedDay,
        startPeriod: sb.fixedStartPeriod,
        duration: sb.duration,
        isPinned: true,
        isOverridden: false,
        overrideNote: null,
        sourceType: "sync_block",
        title: sb.title,
        subjectCode: sb.subjectCode || null,
        electiveScope: sb.offerings?.length ? sb.offerings : null,
      });
    }

    // 2. คาบอิสระของแต่ละห้องเรียน (lockedFreeSlots)
    for (const cls of dataset.classrooms) {
      for (const slot of cls.lockedFreeSlots || []) {
        syncEntries.push({
          id: `free_${cls.id}_${slot.day}_${slot.period}`,
          versionId: activeVersionId,
          assignmentId: null,
          syncBlockId: null,
          sessionIndex: 0,
          subjectId: null,
          classroomIds: [cls.id],
          teacherIds: [],
          roomId: null,
          day: slot.day,
          startPeriod: slot.period,
          duration: 1,
          isPinned: true,
          isOverridden: false,
          overrideNote: null,
          sourceType: "free_period",
          title: "คาบอิสระ",
          subjectCode: null,
          electiveScope: null,
        });
      }
    }

    // 3. คงวิชาสอนวิชาการเดิมที่เคยจัดไว้แล้ว (ถ้ามี)
    const existingAcademic = activeVersionEntries.filter(
      (e) => e.sourceType === "assignment"
    );

    const merged = [...syncEntries, ...existingAcademic];
    replaceVersionEntries(activeVersionId, merged, 0, 0);

    const fixedCount = syncEntries.filter((e) => e.sourceType !== "free_period").length;
    setActionBanner({
      tone: "success",
      text: `✅ อัปเดตคาบล็อคและคาบกิจกรรมลงตารางเรียบร้อยแล้ว (${fixedCount} รายการ) ท่านสามารถตรวจสอบตารางครูและห้องเรียนก่อนเริ่มจัดตารางได้ทันที`,
    });
  };

  // ข้อ 1-4: ฟังก์ชันจัดการและแก้ไขคาบกิจกรรมชนกับคาบล็อค/ประชุมครู
  const handleChooseActivityOnly = () => {
    if (!conflictModalState) return;
    const { teacherId, syncBlock, meeting, unavail } = conflictModalState;

    if (meeting) {
      const updatedMtg = {
        ...meeting,
        excludedTeacherIds: Array.from(new Set([...(meeting.excludedTeacherIds || []), teacherId])),
        coexistTeacherIds: (meeting.coexistTeacherIds || []).filter((id: string) => id !== teacherId),
      };
      upsertMeetingLock(updatedMtg);
    }

    if (unavail) {
      const t = teachersMap.get(teacherId);
      if (t) {
        upsertTeacher({
          ...t,
          unavailableSlots: t.unavailableSlots.filter(
            (u) => !(u.day === conflictModalState.day && u.period === conflictModalState.period)
          ),
        });
      }
    }

    if (syncBlock) {
      const updatedBlock = {
        ...syncBlock,
        excludedTeacherIds: (syncBlock.excludedTeacherIds || []).filter((id: string) => id !== teacherId),
        coexistTeacherIds: (syncBlock.coexistTeacherIds || []).filter((id: string) => id !== teacherId),
      };
      upsertSyncBlock(updatedBlock);

      if (activeVersionEntries.length > 0) {
        const nextTeachers = resolveSyncBlockTeachers(updatedBlock, classroomsMap, dataset.teachers);
        const updated = activeVersionEntries.map((e) =>
          e.syncBlockId === syncBlock.id ? { ...e, teacherIds: nextTeachers } : e
        );
        updateEntriesBatch(updated);
      }
    }

    setActionBanner({
      tone: "success",
      text: `✅ บันทึกแล้ว: ให้ ${teachersMap.get(teacherId)?.prefix || ""}${teachersMap.get(teacherId)?.firstName || ""} เข้ากิจกรรม และยกเว้นจากคาบประชุมในคาบนี้`,
    });
    closeConflictModal();
  };

  const handleChooseMeetingOnly = () => {
    if (!conflictModalState) return;
    const { teacherId, syncBlock, meeting } = conflictModalState;

    if (syncBlock) {
      const updatedBlock = {
        ...syncBlock,
        excludedTeacherIds: Array.from(new Set([...(syncBlock.excludedTeacherIds || []), teacherId])),
        coexistTeacherIds: (syncBlock.coexistTeacherIds || []).filter((id: string) => id !== teacherId),
      };
      upsertSyncBlock(updatedBlock);

      if (activeVersionEntries.length > 0) {
        const nextTeachers = resolveSyncBlockTeachers(updatedBlock, classroomsMap, dataset.teachers);
        const updated = activeVersionEntries.map((e) =>
          e.syncBlockId === syncBlock.id ? { ...e, teacherIds: nextTeachers } : e
        );
        updateEntriesBatch(updated);
      }
    }

    if (meeting) {
      const updatedMtg = {
        ...meeting,
        excludedTeacherIds: (meeting.excludedTeacherIds || []).filter((id: string) => id !== teacherId),
        coexistTeacherIds: (meeting.coexistTeacherIds || []).filter((id: string) => id !== teacherId),
      };
      upsertMeetingLock(updatedMtg);
    }

    setActionBanner({
      tone: "success",
      text: `✅ บันทึกแล้ว: ให้ ${teachersMap.get(teacherId)?.prefix || ""}${teachersMap.get(teacherId)?.firstName || ""} เข้าประชุม และยกเว้นจากคาบกิจกรรมในคาบนี้`,
    });
    closeConflictModal();
  };

  const handleChooseKeepBoth = () => {
    if (!conflictModalState) return;
    const { teacherId, syncBlock, meeting } = conflictModalState;

    if (syncBlock) {
      const updatedBlock = {
        ...syncBlock,
        excludedTeacherIds: (syncBlock.excludedTeacherIds || []).filter((id: string) => id !== teacherId),
        coexistTeacherIds: Array.from(new Set([...(syncBlock.coexistTeacherIds || []), teacherId])),
      };
      upsertSyncBlock(updatedBlock);

      if (activeVersionEntries.length > 0) {
        const nextTeachers = resolveSyncBlockTeachers(updatedBlock, classroomsMap, dataset.teachers);
        const updated = activeVersionEntries.map((e) =>
          e.syncBlockId === syncBlock.id ? { ...e, teacherIds: nextTeachers } : e
        );
        updateEntriesBatch(updated);
      }
    }

    if (meeting) {
      const updatedMtg = {
        ...meeting,
        excludedTeacherIds: (meeting.excludedTeacherIds || []).filter((id: string) => id !== teacherId),
        coexistTeacherIds: Array.from(new Set([...(meeting.coexistTeacherIds || []), teacherId])),
      };
      upsertMeetingLock(updatedMtg);
    }

    setActionBanner({
      tone: "success",
      text: `✅ บันทึกแล้ว: ให้ ${teachersMap.get(teacherId)?.prefix || ""}${teachersMap.get(teacherId)?.firstName || ""} ปฏิบัติหน้าที่ทั้งคู่ (แสดงเป็น / ในตาราง และไม่แจ้งเตือนข้อผิดพลาด)`,
    });
    closeConflictModal();
  };

  const handleResetConflictChoice = () => {
    if (!conflictModalState) return;
    const { teacherId, syncBlock, meeting } = conflictModalState;

    if (syncBlock) {
      const updatedBlock = {
        ...syncBlock,
        excludedTeacherIds: (syncBlock.excludedTeacherIds || []).filter((id: string) => id !== teacherId),
        coexistTeacherIds: (syncBlock.coexistTeacherIds || []).filter((id: string) => id !== teacherId),
      };
      upsertSyncBlock(updatedBlock);

      if (activeVersionEntries.length > 0) {
        const nextTeachers = resolveSyncBlockTeachers(updatedBlock, classroomsMap, dataset.teachers);
        const updated = activeVersionEntries.map((e) =>
          e.syncBlockId === syncBlock.id ? { ...e, teacherIds: nextTeachers } : e
        );
        updateEntriesBatch(updated);
      }
    }

    if (meeting) {
      const updatedMtg = {
        ...meeting,
        excludedTeacherIds: (meeting.excludedTeacherIds || []).filter((id: string) => id !== teacherId),
        coexistTeacherIds: (meeting.coexistTeacherIds || []).filter((id: string) => id !== teacherId),
      };
      upsertMeetingLock(updatedMtg);
    }

    setActionBanner({
      tone: "success",
      text: `↺ รีเซ็ตการเลือกเรียบร้อยแล้ว`,
    });
    closeConflictModal();
  };

  // Toggle Pin on selected entry
  const togglePinEntry = (entry: TimetableEntry) => {
    updateEntriesBatch([{ ...entry, isPinned: !entry.isPinned }]);
  };

  // Change physical room on selected entry (ข้อ 18)
  const updateEntryRoom = (entry: TimetableEntry, newRoomId: string | null) => {
    updateEntriesBatch([{ ...entry, roomId: newRoomId }]);
    setActionBanner({
      tone: "success",
      text: `อัปเดตห้องเรียนของวิชา "${entry.title}" เรียบร้อยแล้ว`,
    });
  };

  // Render helper: Classroom Timetable Table
  const renderClassroomGrid = (classroomId: string, interactive: boolean) => {
    const cls =
      classroomsMap.get(classroomId) ||
      dataset.classrooms.find((c) => c.id === classroomId) ||
      dataset.classrooms[0];
    if (!cls) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
          ยังไม่มีข้อมูลห้องเรียนในระบบ
        </div>
      );
    }
    const defRoom = cls.defaultRoomId ? roomsMap.get(cls.defaultRoomId) : undefined;
    const clsEntries = activeVersionEntries.filter((e) => (e.classroomIds || []).includes(cls.id));

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 text-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-blue-300" />
            <span className="font-bold text-sm">
              ตารางเรียนห้อง {cls.name} ({cls.programName})
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-200">
              ห้องประจำ: {defRoom?.code ?? "ไม่ระบุ"}
            </span>
          </div>
          <div className="text-xs text-slate-300">
            ครูที่ปรึกษา:{" "}
            {cls.advisorTeacherIds
              .map((tid) => teachersMap.get(tid))
              .filter(Boolean)
              .map((t) => getTeacherFullName(t!))
              .join(", ") || "-"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[820px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                <th className="p-2 border-r border-slate-200 w-24 text-center font-bold">
                  วัน / คาบ
                </th>
                {visualCols.map((vc, idx) => (
                  <th
                    key={idx}
                    className={`p-1.5 border-r border-slate-200 text-center ${
                      vc.kind === "break"
                        ? "bg-amber-50/90 text-amber-900 w-14"
                        : vc.isLate
                        ? "bg-indigo-50/60 min-w-[92px]"
                        : "min-w-[92px]"
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
                      const matchingEntries = clsEntries.filter(
                        (e) => e.day === day && e.startPeriod === pNum
                      );
                      const ent = matchingEntries[0];
                      const periodSpan = matchingEntries.length > 0
                        ? Math.max(...matchingEntries.map((e) => (e.duration > 1 ? e.duration : 1)))
                        : 1;
                      const endPeriod = pNum + periodSpan - 1;
                      const endColIdx =
                        periodSpan > 1
                          ? visualCols.findIndex(
                              (x) => x.kind === "period" && x.period === endPeriod
                            )
                          : cIdx;
                      const span = endColIdx >= cIdx ? endColIdx - cIdx + 1 : 1;
                      if (span > 1) {
                        skipUntilColIdx = cIdx + span;
                      }

                      const evalMeta = interactive ? cellEvaluations.get(`${day}:${pNum}`) : undefined;
                      const isSelected = Boolean(ent && ent.id === selectedEntryId);

                      let highlightCls = "bg-white hover:bg-slate-50/80";
                      if (evalMeta && activeSubjectEntry) {
                        if (evalMeta.status === "valid") {
                          highlightCls =
                            "bg-emerald-50/90 ring-2 ring-inset ring-emerald-400 cursor-pointer hover:bg-emerald-100/80";
                        } else if (evalMeta.status === "soft_warning") {
                          highlightCls =
                            "bg-amber-50/90 ring-2 ring-inset ring-amber-400 cursor-pointer hover:bg-amber-100/80";
                        } else {
                          highlightCls = evalMeta.hasPhysicalClash
                            ? "bg-rose-50/70 ring-1 ring-inset ring-rose-300 cursor-not-allowed"
                            : "bg-orange-50/80 ring-1 ring-inset ring-orange-400 cursor-pointer";
                        }
                      }

                      const tooltip = evalMeta
                        ? evalMeta.status === "valid"
                          ? evalMeta.mode === "swap"
                            ? `คลิกเพื่อสลับกับ "${evalMeta.swapPartner?.title}" ได้ทันที (ไม่ติดเงื่อนไข)`
                            : "คลิกเพื่อย้ายมาช่องนี้ได้ทันที (ไม่ติดเงื่อนไข)"
                          : evalMeta.status === "soft_warning"
                          ? `ย้าย/สลับได้ (มีคำแนะนำ): ${evalMeta.softWarnings.join(", ")}`
                          : `${
                              evalMeta.hasPhysicalClash
                                ? "ติดชนซ้ำซ้อน"
                                : "ติดเงื่อนไข (คลิกเพื่อดู/ขออนุโลมรายกรณีได้)"
                            }: ${evalMeta.hardReasons.join(" | ")}`
                        : undefined;

                      const handleCellClick = () => {
                        if (!interactive) return;
                        if (selectedEntry && selectedEntry.id !== ent?.id && evalMeta) {
                          attemptTransferToSlot(selectedEntry, day, pNum);
                          return;
                        }
                        if (ent && ent.sourceType !== "free_period") {
                          setSelectedEntryId((prev) => (prev === ent.id ? null : ent.id));
                        }
                      };

                      const sub = ent?.subjectId ? subjectsMap.get(ent.subjectId) : undefined;
                      const deptColor = sub
                        ? deptsMap.get(sub.departmentId)?.color ?? "#3b82f6"
                        : ent?.sourceType === "sync_block"
                        ? "#7c3aed"
                        : "#94a3b8";

                      const rmCode = ent
                        ? ent.roomId
                          ? roomsMap.get(ent.roomId)?.code
                          : defRoom?.code
                        : undefined;

                      // ข้อ 3: คาบทั้งโรงเรียน, คาบวิชาเลือก, คาบสอนหลายคน ไม่ต้องระบุชื่อครูในตารางสอนนักเรียน ให้ระบุเฉพาะวิชาที่สอนคนเดียว
                      const isSchoolSync = ent?.sourceType === "sync_block";
                      const isElective = Boolean(
                        ent?.electiveScope?.length ||
                        sub?.subjectType === "elective" ||
                        ent?.isJointClass ||
                        ent?.jointGroupId
                      );
                      const sb = ent?.syncBlockId ? syncBlocksMap.get(ent.syncBlockId) : undefined;
                      const mappedTid = sb?.classroomTeacherMap?.[classroomId]?.[0] || ent?.classroomTeacherMap?.[classroomId]?.[0];
                      const isSingleTeacher = (ent?.teacherIds.length || 0) === 1;
                      const showTeacherName = !isSchoolSync && !isElective && isSingleTeacher;
                      const singleTeacher = showTeacherName ? teachersMap.get(ent!.teacherIds[0]) : null;
                      const assignedTeacher = mappedTid ? teachersMap.get(mappedTid) : singleTeacher;
                      const teacherShort = assignedTeacher ? `ครู${assignedTeacher.firstName}` : "";

                      const content =
                        !ent || ent.sourceType === "free_period" ? (
                          <div className="h-16 flex flex-col items-center justify-center text-slate-400 text-[11px]">
                            <span>{ent?.sourceType === "free_period" ? "คาบอิสระ" : "ว่าง"}</span>
                            {evalMeta && activeSubjectEntry && evalMeta.status !== "hard_conflict" && (
                              <span className="mt-0.5 text-[10px] font-semibold text-emerald-700">
                                + วางที่นี่ได้
                              </span>
                            )}
                          </div>
                        ) : matchingEntries.length > 1 ? (
                          /* Subgroup Split: แสดงวิชาแยกแผนเรียนคู่ขนาน 2 แผนพร้อมกัน */
                          <div className="h-16 flex flex-col justify-between text-left select-none gap-0.5 overflow-hidden py-0.5">
                            {matchingEntries.map((mEnt, mIdx) => {
                              const mSub = mEnt.subjectId ? subjectsMap.get(mEnt.subjectId) : undefined;
                              const mTeacher = mEnt.teacherIds[0] ? teachersMap.get(mEnt.teacherIds[0]) : null;
                              const mIsSelected = mEnt.id === selectedEntryId;
                              return (
                                <div
                                  key={mEnt.id}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    if (interactive) setSelectedEntryId((prev) => (prev === mEnt.id ? null : mEnt.id));
                                  }}
                                  className={`px-1.5 py-0.5 rounded cursor-pointer transition border flex items-center justify-between gap-1 text-[10px] ${
                                    mIsSelected
                                      ? "bg-blue-600 text-white border-blue-700 shadow-xs"
                                      : mIdx === 0
                                      ? "bg-indigo-50/90 text-indigo-950 border-indigo-200 hover:bg-indigo-100"
                                      : "bg-emerald-50/90 text-emerald-950 border-emerald-200 hover:bg-emerald-100"
                                  }`}
                                >
                                  <div className="truncate flex items-center gap-1 min-w-0">
                                    <span className={`font-bold text-[9px] px-1 rounded shrink-0 ${
                                      mIsSelected ? "bg-white/20 text-white" : "bg-white/80 text-slate-700 border border-slate-200"
                                    }`}>
                                      {mEnt.subgroupName || `กลุ่ม ${mIdx + 1}`}
                                    </span>
                                    <span className="font-semibold truncate">
                                      {mSub?.shortName || mEnt.title}
                                    </span>
                                  </div>
                                  <span className={`text-[9px] shrink-0 font-medium ${
                                    mIsSelected ? "text-blue-100" : "text-slate-500"
                                  }`}>
                                    {mTeacher ? `ครู${mTeacher.firstName}` : ""}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div
                            style={{ borderLeftColor: deptColor }}
                            className={`h-16 p-1.5 rounded border-l-4 flex flex-col justify-between text-left transition select-none ${
                              isSelected
                                ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-300"
                                : ent.sourceType === "sync_block"
                                ? "bg-purple-50/70 text-slate-800 border border-purple-200"
                                : "bg-slate-50/90 text-slate-800 border border-slate-200/80"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span
                                className={`font-bold text-[11px] leading-tight truncate ${
                                  isSelected ? "text-white" : "text-slate-900"
                                }`}
                              >
                                {ent.subjectCode ? `${ent.subjectCode} ` : ""}
                                {sub?.shortName || ent.title}
                              </span>
                              <div className="flex items-center gap-0.5 shrink-0">
                                {ent.isPinned && (
                                  <Pin
                                    className={`w-3 h-3 ${
                                      isSelected ? "text-amber-200" : "text-amber-600"
                                    }`}
                                  />
                                )}
                                {ent.isOverridden && (
                                  <ShieldAlert
                                    className={`w-3 h-3 ${
                                      isSelected ? "text-orange-200" : "text-orange-600"
                                    }`}
                                  />
                                )}
                              </div>
                            </div>
                            <div
                              className={`text-[10px] truncate ${
                                isSelected ? "text-blue-100" : "text-slate-600"
                              }`}
                            >
                              {ent.electiveScope?.length
                                ? `วิชาเลือก (${ent.electiveScope.length} วิชา)`
                                : isElective
                                ? "วิชาเลือก"
                                : isSchoolSync
                                ? ""
                                : teacherShort
                                ? teacherShort
                                : ent.teacherIds.length > 1
                                ? "สอนร่วม"
                                : ""}
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span
                                className={`px-1 rounded ${
                                  isSelected
                                    ? "bg-blue-500 text-white"
                                    : ent.roomId
                                    ? "bg-amber-100 text-amber-900 font-semibold"
                                    : "text-slate-500"
                                }`}
                              >
                                {rmCode || ""}
                              </span>
                              {evalMeta?.mode === "swap" && evalMeta.status !== "hard_conflict" && (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 rounded">
                                  ⇄ สลับได้
                                </span>
                              )}
                            </div>
                          </div>
                        );

                      if (!interactive) {
                        return (
                          <td
                            key={`cell-${day}-${pNum}`}
                            colSpan={span}
                            className="p-1 border-r border-slate-200 align-top"
                          >
                            {content}
                          </td>
                        );
                      }

                      return (
                        <DroppableSlotCell
                          key={`cell-${day}-${pNum}`}
                          day={day}
                          period={pNum}
                          colSpan={span}
                          onClick={handleCellClick}
                          title={tooltip}
                          className={`p-1 border-r border-slate-200 align-top transition ${highlightCls}`}
                        >
                          {ent && ent.sourceType !== "free_period" && !ent.isPinned ? (
                            <DraggableEntryWrapper entry={ent} disabled={false}>
                              {content}
                            </DraggableEntryWrapper>
                          ) : (
                            content
                          )}
                        </DroppableSlotCell>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render helper: Teacher Timetable Table (shows locks, meetings, afternoon streaks, Period 8 days)
  const renderTeacherGrid = (teacherId: string, interactive: boolean) => {
    const teacher =
      teachersMap.get(teacherId) ||
      dataset.teachers.find((t) => t.id === teacherId) ||
      dataset.teachers[0];
    if (!teacher) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
          ยังไม่มีข้อมูลครูผู้สอนในระบบ กรุณาเพิ่มครูผู้สอนก่อน
        </div>
      );
    }
    const dept = deptsMap.get(teacher.departmentId);

    const tEntries = activeVersionEntries.filter(
      (e) => e.sourceType !== "free_period" && (e.teacherIds || []).includes(teacher.id)
    );
    const meetings = dataset.groupMeetingLocks.filter(
      (m) => isTeacherInGroupMeeting(teacher, m, dataset.divisions)
    );

    const lateSet = new Set(
      dataset.term.periodsConfig.filter((p) => p.isLatePeriod).map((p) => p.period)
    );
    const lateDays = new Set<DayOfWeek>();
    for (const e of tEntries) {
      for (let k = 0; k < (e.duration || 1); k++) {
        if (lateSet.has(e.startPeriod + k)) lateDays.add(e.day);
      }
    }

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-indigo-950 text-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-300" />
            <span className="font-bold text-sm">
              ตารางสอน {getTeacherFullName(teacher)}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-900 text-indigo-200">
              สาระ: {dept?.name ?? "-"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-indigo-200">
            <span>
              รวม {tEntries.reduce((s, e) => s + e.duration, 0) + meetings.reduce((s, m) => s + m.duration, 0)} คาบ
            </span>
            <span>•</span>
            <span>สอนคาบ 8: {lateDays.size} วัน/สัปดาห์</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[780px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                <th className="p-2 border-r border-slate-200 w-24 text-center font-bold">
                  วัน / คาบ
                </th>
                {visualCols.map((vc, idx) => (
                  <th
                    key={idx}
                    className={`p-1.5 border-r border-slate-200 text-center ${
                      vc.kind === "break"
                        ? "bg-amber-50/90 text-amber-900 w-14"
                        : "min-w-[88px]"
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
                      {DAY_LABELS[day]?.full}
                    </td>
                    {visualCols.map((vc, cIdx) => {
                      if (cIdx < skipUntilColIdx) return null;

                      if (vc.kind === "break") {
                        return (
                          <td
                            key={`tbrk-${day}-${cIdx}`}
                            className="bg-amber-50/60 border-r border-slate-200 text-center text-[10px] text-amber-800 px-1"
                          >
                            {vc.label}
                          </td>
                        );
                      }

                      const pNum = vc.period!;

                      // Check items starting or covering this slot
                      const startingEnt = tEntries.find(
                        (e) => e.day === day && e.startPeriod === pNum
                      );
                      const startingMtg = meetings.find(
                        (m) => m.day === day && m.startPeriod === pNum
                      );
                      const startingSb = dataset.synchronizedBlocks.find(
                        (b) =>
                          b.isTimeLocked &&
                          b.fixedDay === day &&
                          b.fixedStartPeriod === pNum &&
                          resolveSyncBlockTeachers(b, classroomsMap, dataset.teachers).includes(teacher.id)
                      );

                      const coveringEnt = tEntries.find(
                        (e) => e.day === day && pNum >= e.startPeriod && pNum < e.startPeriod + (e.duration || 1)
                      );
                      const coveringMtg = meetings.find(
                        (m) => m.day === day && pNum >= m.startPeriod && pNum < m.startPeriod + (m.duration || 1)
                      );
                      const coveringSb = dataset.synchronizedBlocks.find(
                        (b) =>
                          b.isTimeLocked &&
                          b.fixedDay === day &&
                          b.fixedStartPeriod !== null &&
                          b.fixedStartPeriod !== undefined &&
                          pNum >= b.fixedStartPeriod &&
                          pNum < b.fixedStartPeriod + (b.duration || 1) &&
                          resolveSyncBlockTeachers(b, classroomsMap, dataset.teachers).includes(teacher.id)
                      );

                      const ent = startingEnt || coveringEnt;
                      const mtg = startingMtg || coveringMtg;
                      const sb = startingSb || coveringSb;

                      // Period span starts from items beginning at pNum (or covers pNum if at start)
                      const periodSpan = Math.max(
                        startingEnt?.duration || (coveringEnt && coveringEnt.startPeriod === pNum ? coveringEnt.duration : 1),
                        startingMtg?.duration || (coveringMtg && coveringMtg.startPeriod === pNum ? coveringMtg.duration : 1),
                        startingSb?.duration || (coveringSb && coveringSb.fixedStartPeriod === pNum ? coveringSb.duration : 1)
                      );

                      // During this cell's range [pNum .. pNum + periodSpan - 1]:
                      // Find any synchronized block or entry overlapping with this span
                      const overlappingSb =
                        sb ||
                        dataset.synchronizedBlocks.find(
                          (b) =>
                            b.isTimeLocked &&
                            b.fixedDay === day &&
                            b.fixedStartPeriod !== null &&
                            b.fixedStartPeriod !== undefined &&
                            b.fixedStartPeriod < pNum + periodSpan &&
                            b.fixedStartPeriod + (b.duration || 1) > pNum &&
                            resolveSyncBlockTeachers(b, classroomsMap, dataset.teachers).includes(teacher.id)
                        );

                      const overlappingEnt =
                        ent ||
                        tEntries.find(
                          (e) =>
                            e.day === day &&
                            e.startPeriod < pNum + periodSpan &&
                            e.startPeriod + (e.duration || 1) > pNum
                        );

                      const activeSb = overlappingEnt?.syncBlockId
                        ? syncBlocksMap.get(overlappingEnt.syncBlockId) || overlappingSb
                        : overlappingSb;

                      const activeMtg =
                        mtg ||
                        meetings.find(
                          (m) =>
                            m.day === day &&
                            m.startPeriod < pNum + periodSpan &&
                            m.startPeriod + (m.duration || 1) > pNum
                        );

                      const unavail = (teacher.unavailableSlots || []).find(
                        (u) => u.day === day && u.period >= pNum && u.period < pNum + periodSpan
                      );

                      // Exclusion & Coexist flags
                      const isExcludedFromBlock = Boolean(activeSb?.excludedTeacherIds?.includes(teacher.id));
                      const isExcludedFromMeeting = Boolean(activeMtg?.excludedTeacherIds?.includes(teacher.id));
                      const isCoexist = Boolean(
                        (activeSb && activeSb.coexistTeacherIds?.includes(teacher.id)) ||
                        (activeMtg && activeMtg.coexistTeacherIds?.includes(teacher.id))
                      );

                      const hasBlockDuty = Boolean((overlappingEnt || activeSb) && !isExcludedFromBlock);
                      const hasMeetingDuty = Boolean(activeMtg && !isExcludedFromMeeting);
                      const hasUnavailDuty = Boolean(unavail);

                      // ข้อ 1-4: ข้อขัดแย้งคาบชนระหว่างกิจกรรม vs คาบประชุม/คาบล็อค
                      const hasOverlapConflict = hasBlockDuty && (hasMeetingDuty || hasUnavailDuty);

                      const endPeriod = pNum + periodSpan - 1;
                      const endColIdx =
                        periodSpan > 1
                          ? visualCols.findIndex(
                              (x) => x.kind === "period" && x.period === endPeriod
                            )
                          : cIdx;
                      const span = endColIdx >= cIdx ? endColIdx - cIdx + 1 : 1;
                      if (span > 1) {
                        skipUntilColIdx = cIdx + span;
                      }

                      const evalMeta = interactive ? cellEvaluations.get(`${day}:${pNum}`) : undefined;
                      const isSelected = Boolean(overlappingEnt && overlappingEnt.id === selectedEntryId);
                      const isSlotFocused = Boolean(
                        focusedSlot &&
                        focusedSlot.day === day &&
                        focusedSlot.period >= pNum &&
                        focusedSlot.period < pNum + periodSpan
                      );

                      let cellBg = "bg-white";
                      if (isSlotFocused) {
                        cellBg = "bg-rose-50 ring-4 ring-rose-500 ring-offset-2 z-10 relative";
                      } else if (hasOverlapConflict && !isCoexist) {
                        cellBg = "bg-rose-50/80";
                      } else if (isCoexist) {
                        cellBg = "bg-purple-50/60";
                      } else if (evalMeta && activeSubjectEntry?.teacherIds.includes(teacherId)) {
                        cellBg =
                          evalMeta.status === "valid"
                            ? "bg-emerald-50 ring-2 ring-inset ring-emerald-400 cursor-pointer"
                            : evalMeta.status === "soft_warning"
                            ? "bg-amber-50 ring-2 ring-inset ring-amber-400 cursor-pointer"
                            : "bg-rose-50/60";
                      }

                      return (
                        <td
                          key={`tcell-${day}-${pNum}`}
                          colSpan={span}
                          onClick={() => {
                            if (interactive && selectedEntry && selectedEntry.id !== overlappingEnt?.id && evalMeta) {
                              attemptTransferToSlot(selectedEntry, day, pNum);
                              return;
                            }
                            if (
                              hasOverlapConflict ||
                              isCoexist ||
                              hasMeetingDuty ||
                              (hasBlockDuty && isExcludedFromMeeting) ||
                              (hasMeetingDuty && isExcludedFromBlock)
                            ) {
                              setConflictModalState({
                                teacherId: teacher.id,
                                day,
                                period: pNum,
                                syncBlock: activeSb,
                                meeting: activeMtg,
                                unavail,
                                existingEntry: overlappingEnt,
                                isCoexist,
                              });
                              return;
                            }
                            if (overlappingEnt) {
                              setSelectedEntryId((prev) => (prev === overlappingEnt.id ? null : overlappingEnt.id));
                            }
                          }}
                          className={`p-1 border-r border-slate-200 align-top ${cellBg}`}
                        >
                          {/* Case 1: Active clash between Activity and Meeting/Lock */}
                          {hasOverlapConflict && !isCoexist ? (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setConflictModalState({
                                  teacherId: teacher.id,
                                  day,
                                  period: pNum,
                                  syncBlock: activeSb,
                                  meeting: activeMtg,
                                  unavail,
                                  existingEntry: overlappingEnt,
                                  isCoexist: false,
                                });
                              }}
                              className="h-16 p-1.5 rounded-lg border-2 border-rose-500 bg-rose-50/95 hover:bg-rose-100 text-slate-800 flex flex-col justify-between cursor-pointer shadow-md transition ring-2 ring-rose-300"
                              title="คลิกเพื่อเลือกแนวทางแก้ไขคาบชน"
                            >
                              <div className="flex items-center justify-between text-[10px] font-black text-rose-700 bg-rose-100/90 px-1 py-0.5 rounded border border-rose-300">
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  <span>⚠️ ชน 2 รายการ!</span>
                                </span>
                                <span className="text-[9px] underline bg-white/80 px-1 rounded">กดเพื่อเลือก</span>
                              </div>
                              <div className="text-[10px] font-bold text-slate-900 truncate">
                                📌 {activeSb?.title || overlappingEnt?.title || "คาบกิจกรรม"}
                              </div>
                              <div className="text-[10px] font-bold text-rose-800 truncate">
                                🏢 {activeMtg?.title || unavail?.reason || "คาบประชุม/ล็อค"}
                              </div>
                              <div className="text-[8.5px] text-center font-bold text-rose-700 bg-white/90 rounded border border-rose-200 py-0.5 shadow-2xs">
                                ⚡ คลิกเพื่อเลือกแนวทางแก้ไข
                              </div>
                            </div>
                          ) : isCoexist ? (
                            /* Case 2: Coexist - แสดง 2 รายการคู่กัน */
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setConflictModalState({
                                  teacherId: teacher.id,
                                  day,
                                  period: pNum,
                                  syncBlock: activeSb,
                                  meeting: activeMtg,
                                  unavail,
                                  existingEntry: overlappingEnt,
                                  isCoexist: true,
                                });
                              }}
                              className="h-16 p-1 rounded-lg border-2 border-purple-400 bg-purple-50/95 hover:bg-purple-100 text-purple-950 flex flex-col justify-between cursor-pointer shadow-xs transition"
                              title="คลิกเพื่อเปลี่ยนหรือรีเซ็ตการเลือก (ลง 2 รายการคู่กัน)"
                            >
                              <div className="flex items-center justify-between text-[8px] font-black text-purple-800 bg-purple-100/90 px-1 py-0.5 rounded border border-purple-200">
                                <span>🤝 ปฏิบัติหน้าที่คู่กัน</span>
                                <span className="bg-purple-200 text-purple-900 px-1 rounded font-bold">2 รายการ</span>
                              </div>
                              <div className="space-y-0.5 text-[9px] my-auto">
                                <div className="flex items-center gap-0.5 font-bold text-blue-900 bg-blue-100/70 px-1 py-0.2 rounded border border-blue-200 truncate">
                                  <span className="shrink-0 text-[8px]">📌</span>
                                  <span className="truncate">{activeSb?.title || overlappingEnt?.title || "กิจกรรม"}</span>
                                </div>
                                <div className="flex items-center gap-0.5 font-bold text-amber-900 bg-amber-100/70 px-1 py-0.2 rounded border border-amber-200 truncate">
                                  <span className="shrink-0 text-[8px]">🏢</span>
                                  <span className="truncate">{activeMtg?.title || unavail?.reason || "ประชุม"}</span>
                                </div>
                              </div>
                              <div className="text-[7.5px] text-purple-600 text-right underline font-medium">
                                คลิกแก้ไข
                              </div>
                            </div>
                          ) : hasBlockDuty ? (
                            /* Case 3: Activity / Teaching Entry */
                            <div
                              className={`h-16 p-1.5 rounded border flex flex-col justify-between cursor-pointer ${
                                isSelected
                                  ? "bg-blue-600 text-white border-blue-700 shadow"
                                  : "bg-indigo-50/70 text-slate-800 border-indigo-200 hover:bg-indigo-100/70"
                              }`}
                            >
                              <div className="font-bold text-[11px] truncate flex items-center gap-1">
                                {overlappingEnt?.subgroupName && (
                                  <span className={`text-[9px] px-1 py-0.2 rounded font-bold shrink-0 ${
                                    isSelected ? "bg-white/20 text-white" : "bg-purple-100 text-purple-900 border border-purple-200"
                                  }`}>
                                    [{overlappingEnt.subgroupName}]
                                  </span>
                                )}
                                <span className="truncate">
                                  {overlappingEnt?.subjectCode ? `${overlappingEnt.subjectCode} ` : ""}
                                  {overlappingEnt?.title || activeSb?.title}
                                </span>
                              </div>
                              {isExcludedFromMeeting && activeMtg && (
                                <div className="text-[8px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded border border-emerald-300 truncate">
                                  ✓ เลือกลงกิจกรรม (ยกเว้นประชุม)
                                </div>
                              )}
                              <div
                                className={`text-[10px] truncate ${
                                  isSelected ? "text-blue-100" : "text-indigo-900 font-medium"
                                }`}
                              >
                                ห้อง:{" "}
                                {(() => {
                                  const sb = (overlappingEnt?.syncBlockId ? syncBlocksMap.get(overlappingEnt.syncBlockId) : undefined) || activeSb;
                                  const ctm = sb?.classroomTeacherMap || overlappingEnt?.classroomTeacherMap;
                                  if (ctm) {
                                    const myRooms = Object.entries(ctm)
                                      .filter(([, tids]) => tids.includes(teacher.id))
                                      .map(([cid]) => classroomsMap.get(cid)?.name ?? cid);
                                    if (myRooms.length > 0) return myRooms.join(", ");
                                  }
                                  const cids = overlappingEnt?.classroomIds || activeSb?.classroomIds || [];
                                  const roomNames = cids.length > 3
                                    ? `${cids.length} ห้องเรียน`
                                    : cids.map((cid: string) => classroomsMap.get(cid)?.name ?? cid).join(", ");
                                  return overlappingEnt?.subgroupName ? `${roomNames} (${overlappingEnt.subgroupName})` : roomNames;
                                })()}
                              </div>
                              <div
                                className={`text-[10px] flex justify-between ${
                                  isSelected ? "text-blue-100" : "text-slate-500"
                                }`}
                              >
                                <span>
                                  {overlappingEnt?.roomId ? roomsMap.get(overlappingEnt.roomId)?.code : activeSb?.sharedRoomId ? roomsMap.get(activeSb.sharedRoomId)?.code : "ห้องนักเรียน"}
                                </span>
                                {(overlappingEnt?.teacherIds || []).length > 1 && (
                                  <span>สอนร่วม {overlappingEnt!.teacherIds.length} คน</span>
                                )}
                              </div>
                            </div>
                          ) : hasMeetingDuty && activeMtg ? (
                            /* Case 4: Meeting Lock */
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setConflictModalState({
                                  teacherId: teacher.id,
                                  day,
                                  period: pNum,
                                  syncBlock: activeSb,
                                  meeting: activeMtg,
                                  unavail,
                                  existingEntry: overlappingEnt,
                                  isCoexist: false,
                                });
                              }}
                              className="h-16 p-1.5 rounded-lg bg-slate-200/90 border border-slate-300 text-slate-700 flex flex-col justify-between items-center text-center cursor-pointer hover:bg-slate-300 transition group shadow-2xs"
                              title="คลิกเพื่อจัดการหรือยกเว้นครูจากคาบประชุมนี้"
                            >
                              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-800">
                                <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                <span className="truncate max-w-[130px]">{activeMtg.title}</span>
                              </div>
                              {isExcludedFromBlock && activeSb && (
                                <div className="text-[8px] bg-amber-100 text-amber-900 font-bold px-1 rounded border border-amber-300 truncate max-w-full">
                                  ✓ ลงประชุม (ยกเว้นจาก {activeSb.title})
                                </div>
                              )}
                              <button
                                type="button"
                                className="text-[9px] text-blue-700 font-bold bg-white/90 hover:bg-blue-600 hover:text-white px-2 py-0.5 rounded border border-slate-300 transition w-full shadow-2xs"
                              >
                                ⚙️ แก้ไข/จัดการคาบนี้
                              </button>
                            </div>
                          ) : unavail ? (
                            /* Case 5: Personal Unavailable Lock */
                            <div className="h-16 p-1.5 rounded bg-rose-50 border border-rose-200 text-rose-800 flex flex-col justify-center items-center text-center">
                              <Lock className="w-3 h-3 text-rose-500 mb-0.5" />
                              <div className="font-semibold text-[10px] leading-tight">
                                ล็อคไม่สอน
                              </div>
                              <div className="text-[9px] truncate max-w-full">
                                {unavail.reason || "คาบส่วนตัว"}
                              </div>
                            </div>
                          ) : (
                            /* Case 6: Empty Slot */
                            <div className="h-16 flex items-center justify-center text-[11px] text-slate-300">
                              ว่าง
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
    );
  };

  // Render helper: Shared Physical Room / Lab Occupancy Table (ข้อ 9, 18)
  const renderPhysicalRoomGrid = (roomId: string) => {
    const room = roomsMap.get(roomId);
    if (!room) return null;

    const roomEntries = activeVersionEntries.filter(
      (e) =>
        e.sourceType !== "free_period" &&
        resolveEntryPhysicalRooms(e, classroomsMap, syncBlocksMap).includes(roomId)
    );

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-teal-900 text-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-300" />
            <span className="font-bold text-sm">
              ตารางการใช้สถานที่: {room.code} — {room.name}
            </span>
            {room.allowOverlap && (
              <span className="px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400 text-[10px] font-bold">
                ✓ อนุญาตให้จัดตารางสอนทับซ้อนกันได้ (สลับสัปดาห์ / สิทธิ์ใช้ร่วมกัน)
              </span>
            )}
          </div>
          <div className="text-xs text-teal-200">
            {room.allowOverlap
              ? "รองรับการใช้สลับสัปดาห์ (ไม่จำกัดกลุ่มเรียน)"
              : `ความจุพร้อมกันสูงสุด: ${room.maxConcurrentClasses} กลุ่มเรียน`}{" "}
            • ใช้งานรวม {roomEntries.reduce((s, e) => s + e.duration, 0)} คาบ/สัปดาห์
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[780px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                <th className="p-2 border-r border-slate-200 w-24 text-center font-bold">
                  วัน / คาบ
                </th>
                {visualCols.map((vc, idx) => (
                  <th
                    key={idx}
                    className={`p-1.5 border-r border-slate-200 text-center ${
                      vc.kind === "break" ? "bg-amber-50/90 text-amber-900 w-14" : "min-w-[88px]"
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
                    <td className="p-2 border-r border-slate-200 font-bold text-slate-700 bg-slate-50 text-center">
                      {DAY_LABELS[day]?.full}
                    </td>
                    {visualCols.map((vc, cIdx) => {
                      if (cIdx < skipUntilColIdx) return null;

                      if (vc.kind === "break") {
                        return (
                          <td
                            key={`rbrk-${day}-${cIdx}`}
                            className="bg-amber-50/60 border-r border-slate-200 text-center text-[10px] text-amber-800"
                          >
                            {vc.label}
                          </td>
                        );
                      }
                      const pNum = vc.period!;
                      const matchingEntries = roomEntries.filter(
                        (e) => e.day === day && e.startPeriod === pNum
                      );
                      const ent = matchingEntries[0];
                      const periodSpan = ent ? ent.duration : 1;
                      const endPeriod = pNum + periodSpan - 1;
                      const endColIdx =
                        periodSpan > 1
                          ? visualCols.findIndex(
                              (x) => x.kind === "period" && x.period === endPeriod
                            )
                          : cIdx;
                      const span = endColIdx >= cIdx ? endColIdx - cIdx + 1 : 1;
                      if (span > 1) skipUntilColIdx = cIdx + span;

                      return (
                        <td
                          key={`rcell-${day}-${pNum}`}
                          colSpan={span}
                          className="p-1 border-r border-slate-200 align-top"
                        >
                          {matchingEntries.length > 0 ? (
                            <div className="space-y-1">
                              {matchingEntries.map((mEnt, mIdx) => (
                                <div
                                  key={mEnt.id}
                                  onClick={() => setSelectedEntryId(mEnt.id)}
                                  className={`p-1.5 rounded border flex flex-col justify-between cursor-pointer transition ${
                                    matchingEntries.length > 1
                                      ? "bg-purple-50 border-purple-300 text-purple-950 hover:bg-purple-100"
                                      : "bg-teal-50 border-teal-200 text-teal-950 hover:bg-teal-100"
                                  }`}
                                >
                                  <div className="font-bold text-[11px] truncate flex items-center justify-between">
                                    <span>{mEnt.title}</span>
                                    {matchingEntries.length > 1 && (
                                      <span className="text-[9px] px-1 bg-purple-200 text-purple-800 rounded font-normal">
                                        สิทธิ์ใช้ร่วม #{mIdx + 1}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] truncate">
                                    ห้องเรียน:{" "}
                                    {mEnt.classroomIds
                                      .map((cid) => classroomsMap.get(cid)?.name ?? cid)
                                      .join(", ")}
                                  </div>
                                </div>
                              ))}
                              {matchingEntries.length > 1 && (
                                <div className="text-[9px] text-purple-700 font-semibold px-1">
                                  ✓ ห้องนี้มีสิทธิ์ใช้ร่วมกัน {matchingEntries.length} ห้อง (สลับสัปดาห์)
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="h-14 flex items-center justify-center text-[11px] text-emerald-600/60">
                              ห้องว่าง
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
    );
  };

  const nonFreeScheduledCount = activeVersionEntries.filter(
    (e) => e.sourceType !== "free_period"
  ).length;
  const academicScheduledCount = activeVersionEntries.filter(
    (e) => e.sourceType === "assignment"
  ).length;
  const syncScheduledCount = activeVersionEntries.filter(
    (e) => e.sourceType === "sync_block"
  ).length;
  const pinnedCount = activeVersionEntries.filter((e) => e.isPinned).length;
  const overriddenCount = activeVersionEntries.filter((e) => e.isOverridden).length;

  return (
    <div className="space-y-4">
      {/* Top Header & Solver Runner Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 lg:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-blue-600" />
              จัดตารางสอนอัตโนมัติ & โหมดนั่งดูปรับแก้ไขรายกรณี
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              รองรับการลากวาง (Drag & Drop) หรือคลิกเลือกวิชาเพื่อดูช่องสีเขียวที่ย้าย/สลับได้ทันที
              พร้อมโหมดเปิดดู 2 ตารางเทียบกัน (ห้องเรียน ⇄ ครูผู้สอน/ห้องปฏิบัติการ)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/reports"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <Printer className="w-4 h-4 text-blue-600" />
              ไปหน้าพิมพ์รายคน & ส่งออก Excel
            </Link>
          </div>
        </div>

        {/* Pre-flight Readiness Strip */}
        {/* Lock Conflict Quick Access Banner (ข้อ 1-4) */}
        {readinessReport.issues.some((i) => i.category === "lock_conflict") && (
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-rose-50 to-amber-50 border-2 border-rose-300 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertTriangle className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <div className="font-bold text-rose-950 flex items-center gap-2">
                  <span>พบคาบกิจกรรมชนกับคาบประชุม/คาบล็อคของครู ({readinessReport.issues.filter((i) => i.category === "lock_conflict").length} รายการ)</span>
                  <span className="text-[10px] bg-rose-200 text-rose-800 px-1.5 py-0.2 rounded-full font-bold">ต้องเลือกแนวทางแก้ไข</span>
                </div>
                <div className="text-slate-600 text-[11px] mt-0.5">
                  คลิกที่ปุ่มครูด้านขวาเพื่อเปิดตารางสอนของครูท่านนั้น และเลือกได้เลยว่าจะเอารายการไหนไว้ หรือเก็บไว้ทั้งคู่ ( / )
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {readinessReport.issues
                .filter((i) => i.category === "lock_conflict")
                .map((iss) => {
                  const t = teachersMap.get(iss.entityId || "");
                  return (
                    <button
                      key={iss.id}
                      type="button"
                      onClick={() => {
                        setPerspective("teacher");
                        if (iss.entityId) setSelectedTeacherId(iss.entityId);
                        if (iss.day && iss.period !== undefined) {
                          setFocusedSlot({ day: iss.day, period: iss.period });
                          const teacher = iss.entityId ? teachersMap.get(iss.entityId) : undefined;
                          const teacherMeetings = (dataset.groupMeetingLocks || []).filter(
                            (m) =>
                              (m.teacherIds && m.teacherIds.includes(iss.entityId!)) ||
                              (teacher && isTeacherInGroupMeeting(teacher, m, dataset.divisions))
                          );
                          const clashingMtg = teacherMeetings.find(
                            (m) => m.day === iss.day && iss.period! >= m.startPeriod && iss.period! < m.startPeriod + (m.duration || 1)
                          );
                          const clashingSb = iss.syncBlockId
                            ? syncBlocksMap.get(iss.syncBlockId)
                            : dataset.synchronizedBlocks.find(
                                (b) =>
                                  b.isTimeLocked &&
                                  b.fixedDay === iss.day &&
                                  b.fixedStartPeriod !== null &&
                                  b.fixedStartPeriod !== undefined &&
                                  iss.period! >= b.fixedStartPeriod &&
                                  iss.period! < b.fixedStartPeriod + (b.duration || 1)
                              );
                          const unavail = (teacher?.unavailableSlots || []).find(
                            (u) => u.day === iss.day && u.period === iss.period
                          );
                          setConflictModalState({
                            teacherId: iss.entityId!,
                            day: iss.day,
                            period: iss.period,
                            syncBlock: clashingSb,
                            meeting: clashingMtg,
                            unavail,
                            existingEntry: undefined,
                            isCoexist: Boolean(
                              clashingSb?.coexistTeacherIds?.includes(iss.entityId!) ||
                              clashingMtg?.coexistTeacherIds?.includes(iss.entityId!)
                            ),
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition"
                    >
                      <span>⚡ แก้ไข {t ? getTeacherFullName(t) : "ครู"} ({DAY_LABELS[iss.day!]?.short || iss.day} คาบ {iss.period}) →</span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {!readinessReport.canRunSolver ? (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                พบข้อผิดพลาดของข้อมูลพื้นฐาน ({readinessReport.issues.filter((i) => i.severity === "error").length}{" "}
                รายการ เช่น ยอดคาบเกินตาราง หรือครูติดภาระงานเกินเพดาน) แนะนำให้ตรวจสอบก่อนกดจัดตาราง
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/audit"
                className="px-3 py-1.5 rounded bg-rose-600 text-white font-semibold hover:bg-rose-700"
              >
                ดูรายการข้อผิดพลาดแบบเต็มจอ ({readinessReport.issues.filter((i) => i.severity === "error").length} รายการ) →
              </Link>
              <Link
                href="/"
                className="px-3 py-1.5 rounded border border-rose-300 bg-white text-rose-800 font-semibold hover:bg-rose-100"
              >
                ตารางยอดคาบรายห้อง
              </Link>
            </div>
          </div>
        ) : !readinessReport.isAllRoomsBalanced ? (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                บางห้องเรียนมียอดคาบรวมยังไม่ครบ {readinessReport.totalSlotsPerWeek} คาบ (ช่องที่เหลือจะถูกเติมเป็นคาบอิสระให้อัตโนมัติ)
              </span>
            </div>
            <Link
              href="/"
              className="px-3 py-1.5 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
            >
              ดูตารางเช็คยอดรายห้อง
            </Link>
          </div>
        ) : null}

        {/* Version Selector + Solver Controls */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 pt-2 border-t border-slate-100 items-center">
          {/* Version Controls */}
          <div className="xl:col-span-5 flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">ร่างตารางสอน:</label>
            <select
              value={activeVersionId}
              onChange={(e) => {
                setActiveVersionId(e.target.value);
                setSelectedEntryId(null);
              }}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-50"
            >
              {dataset.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.status === "published" ? "⭐ (ประกาศใช้)" : "(ร่าง)"}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setNewVersionName(`ร่างปรับแก้ ${dataset.versions.length + 1}`);
                setCopyCurrentEntries(true);
                setVersionModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
              title="สำเนาร่างปัจจุบันเก็บไว้ก่อนปรับแก้รายกรณี"
            >
              <Copy className="w-3.5 h-3.5 text-blue-600" />
              สำเนาร่าง
            </button>

            {activeVersion?.status !== "published" && (
              <button
                type="button"
                onClick={() => setVersionPublished(activeVersionId)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                ตั้งเป็นฉบับจริง
              </button>
            )}

            {dataset.versions.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`ต้องการลบร่าง "${activeVersion?.name}" หรือไม่?`)) {
                    deleteVersion(activeVersionId);
                  }
                }}
                className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                title="ลบร่างนี้"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Solver Execution Controls */}
          <div className="xl:col-span-7 flex flex-wrap items-center justify-end gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={keepPinned}
                onChange={(e) => setKeepPinned(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>คงคาบที่ปักหมุดไว้ ({pinnedCount} คาบ)</span>
            </label>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500">เวลาเกลี่ยตาราง:</span>
              <select
                value={optSeconds}
                onChange={(e) => setOptSeconds(Number(e.target.value))}
                disabled={isSolving}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
              >
                <option value={3}>3 วินาที (เร็ว)</option>
                <option value={6}>6 วินาที (สมดุล)</option>
                <option value={12}>12 วินาที (ละเอียด)</option>
                <option value={20}>20 วินาที (เน้นเรียงลำดับวิชาสูงสุด)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleSyncLockedBlocksAndMeetings}
              disabled={isSolving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold transition shadow-2xs"
              title="ดึงคาบล็อคทั้งหมดและคาบประชุมฝ่ายมาลงในตาราง เพื่อตรวจสอบก่อนกดจัดตารางสอน (ข้อ 4)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-purple-700" />
              <span>ซิงค์คาบล็อค & ประชุม (Recheck)</span>
            </button>

            {!isSolving ? (
              <button
                type="button"
                onClick={handleStartAutoSolve}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
              >
                <Play className="w-4 h-4 fill-current" />
                {nonFreeScheduledCount > 0 ? "จัดตารางสอนใหม่" : "กดจัดตารางสอนอัตโนมัติ"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCancelSolver}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                หยุดและใช้ชุดที่ดีที่สุดตอนนี้
              </button>
            )}
          </div>
        </div>

        {/* Live Progress Indicator */}
        {isSolving && (
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
            <div className="flex items-center justify-between text-xs text-blue-950 font-semibold">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 animate-spin" />
                {solverProgress?.message || "กำลังประมวลผลตารางสอนตามเงื่อนไขทั้ง 21 ข้อ..."}
              </span>
              <span>
                วางแล้ว {solverProgress?.placedCount ?? 0}/{solverProgress?.totalUnits ?? "-"} หน่วยเรียน • คะแนนคุณภาพ{" "}
                {solverProgress?.softScore ?? 0}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-blue-200 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{
                  width: `${
                    solverProgress && solverProgress.totalUnits > 0
                      ? Math.min(
                          100,
                          Math.round((solverProgress.placedCount / solverProgress.totalUnits) * 100)
                        )
                      : 35
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Solver Summary Result */}
        {lastSolverSummary && !isSolving && (
          <div
            className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
              lastSolverSummary.hardConflicts === 0
                ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                : "bg-amber-50 border-amber-200 text-amber-950"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                จัดตารางเสร็จสิ้นใน {(lastSolverSummary.elapsedMs / 1000).toFixed(1)} วินาที:
              </span>
              <span>
                ลงสำเร็จ{" "}
                <strong>
                  {lastSolverSummary.stats.placedUnits}/{lastSolverSummary.stats.totalUnits}
                </strong>{" "}
                หน่วยเรียน
              </span>
              <span>•</span>
              <span>
                ความขัดแย้ง (Hard Conflict): <strong>{lastSolverSummary.hardConflicts}</strong>
              </span>
              <span>•</span>
              <span>
                ตรงคาบแนะนำ (เช่น พละคาบ 4/8):{" "}
                <strong>{lastSolverSummary.stats.preferredPeriodHits}</strong> ครั้ง
              </span>
              <span>•</span>
              <span>
                เรียงวิชาคู่ลำดับ (เช่น ศิลปะ → พละ):{" "}
                <strong>{lastSolverSummary.stats.sequenceHits}</strong> คู่
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLastSolverSummary(null)}
              className="text-slate-500 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {solverError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            เกิดข้อผิดพลาดขณะจัดตาราง: {solverError}
          </div>
        )}

        {actionBanner && (
          <div
            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
              actionBanner.tone === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : actionBanner.tone === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}
          >
            <span>{actionBanner.text}</span>
            <button onClick={() => setActionBanner(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Perspective Tabs & Entity Selector Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPerspective("classroom")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              perspective === "classroom"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            มุมมองรายห้องเรียน
          </button>
          <button
            type="button"
            onClick={() => setPerspective("teacher")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              perspective === "teacher"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            มุมมองรายครูผู้สอน
          </button>
          <button
            type="button"
            onClick={() => setPerspective("room")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              perspective === "room"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Building2 className="w-4 h-4" />
            มุมมองการใช้ห้องร่วม/แล็บ
          </button>
          <button
            type="button"
            onClick={() => setPerspective("master")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              perspective === "master"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            ตารางรวมทั้งโรงเรียน (Master)
          </button>
        </div>

        {/* Entity Filter + Split-View Toggle */}
        <div className="flex flex-wrap items-center gap-2.5">
          {perspective === "classroom" && (
            <div className="flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 text-blue-900">
              <span className="font-semibold text-blue-700">ห้องปัจจุบัน:</span>
              <span className="font-bold">{activeClassroom?.name}</span>
            </div>
          )}

          {perspective === "teacher" && (
            <div className="flex items-center gap-1.5 text-xs w-64">
              <span className="font-semibold text-slate-600 shrink-0">เลือกครู:</span>
              <SearchableTeacherSelect
                teachers={dataset.teachers}
                departments={dataset.departments}
                value={selectedTeacherId}
                onChange={setSelectedTeacherId}
                placeholder="-- ค้นหา/เลือกครู --"
              />
            </div>
          )}

          {perspective === "room" && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-slate-600">เลือกสถานที่:</span>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white"
              >
                {dataset.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(perspective === "classroom" || perspective === "teacher") && (
            <button
              type="button"
              onClick={() => setSplitView((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                splitView
                  ? "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              {splitView ? "เปิดเทียบ 2 ตารางคู่กันอยู่" : "เปิดเทียบตารางครูคู่กัน"}
            </button>
          )}
        </div>
      </div>

      {/* Grade Level & Classroom Selection Bar (ข้อ 3: เลือกระดับชั้นก่อน แล้วค่อยเลือกห้อง 1-10) */}
      {perspective === "classroom" && (
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs space-y-2.5">
          {/* แถวที่ 1: เลือกระดับชั้น ม.1 - ม.6 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-blue-600" />
                เลือกระดับชั้น:
              </span>
              <div className="flex flex-wrap gap-1">
                {dataset.gradeLevels.map((g) => {
                  const isActive = g.id === selectedGradeId;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => handleSelectGrade(g.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                        isActive
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-xs text-slate-500">
              กำลังดู: <strong className="text-blue-900 font-bold text-sm">{activeClassroom?.name}</strong>{" "}
              <span className="text-slate-400">({activeClassroom?.programName})</span>
            </div>
          </div>

          {/* แถวที่ 2: เลือกห้องเรียน เรียงลำดับ 1 - 10 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-600">เลือกห้อง (เรียง 1–10):</span>
              <div className="flex flex-wrap gap-1">
                {gradeSortedClassrooms.map((cls) => {
                  const isSel = cls.id === selectedClassroomId;
                  const match = cls.name.match(/\/(\d+)$/);
                  const roomNum = match ? match[1] : cls.name;
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      title={`${cls.name} (${cls.programName})`}
                      onClick={() => setSelectedClassroomId(cls.id)}
                      className={`min-w-9 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition border ${
                        isSel
                          ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:border-blue-300"
                      }`}
                    >
                      ห้อง {roomNum}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">หรือเลือกจากรายการ:</span>
              <select
                value={selectedClassroomId}
                onChange={(e) => setSelectedClassroomId(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold bg-white"
              >
                {gradeSortedClassrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.programName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Color Legend for Interactive Adjustment */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 px-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-700">วิธีปรับแก้รายกรณี:</span>
          <span>1. คลิกที่คาบเรียน (หรือลากวาง)</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-500 inline-block" />
            สีเขียว = ย้าย/สลับได้ทันที
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-500 inline-block" />
            สีเหลือง = ย้ายได้ (มีข้อแนะนำ)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-orange-100 border border-orange-500 inline-block" />
            สีส้ม = ติดเงื่อนไขนโยบาย (คลิกขออนุโลมรายกรณีได้)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-rose-100 border border-rose-400 inline-block" />
            สีแดง = ชนซ้ำซ้อน/คร่อมเวลาพัก
          </span>
        </div>
        <div>
          ปักหมุด 📌 {pinnedCount} คาบ • อนุโลมรายกรณี {overriddenCount} คาบ
        </div>
      </div>

      {nonFreeScheduledCount === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center space-y-4">
          <Wand2 className="w-10 h-10 text-blue-600 mx-auto" />
          <div className="space-y-1">
            <div className="text-base font-bold text-slate-800">
              ร่างตารางสอนนี้ยังไม่ได้จัดคาบเรียน
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              ท่านสามารถดึงคาบล็อคและคาบประชุมมาลงตารางเพื่อ <strong>Recheck ตารางครูก่อน</strong> หรือกด <strong>&ldquo;เริ่มจัดตารางสอนอัตโนมัติทันที&rdquo;</strong> เพื่อวางคาบล็อคและเกลี่ยวิชาการครบทุกห้อง
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSyncLockedBlocksAndMeetings}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold shadow-xs transition"
            >
              <RotateCcw className="w-4 h-4 text-purple-700" />
              <span>ซิงค์คาบล็อค & ประชุมลงตาราง (Recheck ก่อนจัด)</span>
            </button>
            <button
              type="button"
              onClick={handleStartAutoSolve}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow transition"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>เริ่มจัดตารางสอนอัตโนมัติทันที</span>
            </button>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Pre-flight Recheck Banner (ข้อ 4: เมื่อมีเฉพาะคาบล็อค/ประชุม แต่ยังไม่ได้จัดวิชาการ) */}
          {academicScheduledCount === 0 && syncScheduledCount > 0 && (
            <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-purple-950 mb-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-purple-600 shrink-0" />
                <div>
                  <div className="font-bold">
                    ตารางนี้อัปเดตเฉพาะคาบล็อค กิจกรรม และคาบประชุม ({syncScheduledCount} รายการ) เรียบร้อยแล้ว (ข้อ 4)
                  </div>
                  <div className="text-[11px] text-purple-800">
                    ท่านสามารถสลับไป &ldquo;มุมมองรายครูผู้สอน&rdquo; เพื่อ Recheck ตารางครูแต่ละท่านได้ เมื่อตรวจสอบเรียบร้อยแล้ว ให้กดปุ่มด้านขวาเพื่อเกลี่ยวิชาการทั้งหมด
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleStartAutoSolve}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs transition shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>กดจัดตารางสอนอัตโนมัติทันที</span>
              </button>
            </div>
          )}

          {/* Main Interactive Workspace */}
          {perspective === "classroom" && (
            <div className={splitView ? "grid grid-cols-1 2xl:grid-cols-2 gap-4" : "space-y-4"}>
              <div>{renderClassroomGrid(selectedClassroomId, true)}</div>
              {splitView && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-950">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-indigo-600" />
                      จอเทียบตารางครูผู้สอน (อัปเดตตามคาบที่คลิกด้านซ้ายอัตโนมัติ):
                    </span>
                    <div className="w-56">
                      <SearchableTeacherSelect
                        teachers={dataset.teachers}
                        departments={dataset.departments}
                        value={selectedTeacherId}
                        onChange={setSelectedTeacherId}
                        placeholder="-- ค้นหา/เลือกครู --"
                        size="sm"
                      />
                    </div>
                  </div>
                  <SchedulerErrorBoundary fallbackTitle="ไม่สามารถแสดงตารางครูเทียบได้">
                    {renderTeacherGrid(selectedTeacherId, false)}
                  </SchedulerErrorBoundary>
                </div>
              )}
            </div>
          )}

          {perspective === "teacher" && (
            <div className={splitView ? "grid grid-cols-1 2xl:grid-cols-2 gap-4" : "space-y-4"}>
              <div>
                <SchedulerErrorBoundary fallbackTitle="ไม่สามารถแสดงตารางสอนของครูท่านนี้ได้">
                  {renderTeacherGrid(selectedTeacherId, true)}
                </SchedulerErrorBoundary>
              </div>
              {splitView && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800">
                    <span className="font-semibold">
                      จอเทียบตารางห้องเรียนของคาบที่เลือก:
                    </span>
                    <select
                      value={selectedClassroomId}
                      onChange={(e) => setSelectedClassroomId(e.target.value)}
                      className="border border-slate-300 rounded px-2 py-1 text-xs bg-white font-semibold"
                    >
                      {sortClassrooms(dataset.classrooms).map((c) => (
                        <option key={c.id} value={c.id}>
                          ห้อง {c.name} ({c.programName})
                        </option>
                      ))}
                    </select>
                  </div>
                  <SchedulerErrorBoundary fallbackTitle="ไม่สามารถแสดงตารางห้องเรียนเทียบได้">
                    {renderClassroomGrid(selectedClassroomId, false)}
                  </SchedulerErrorBoundary>
                </div>
              )}
            </div>
          )}

          {perspective === "room" && renderPhysicalRoomGrid(selectedRoomId)}

          {perspective === "master" && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between text-xs">
                <span className="font-bold">
                  ตารางรวมทั้งโรงเรียน (คลิกที่ช่องใดก็ได้เพื่อกระโดดไปปรับแก้ห้องนั้นทันที)
                </span>
                <span className="text-slate-300">{dataset.classrooms.length} ห้องเรียน</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th rowSpan={2} className="p-2 border border-slate-700 sticky left-0 bg-slate-800 z-10">
                        ห้อง
                      </th>
                      {dataset.term.daysOfWeek.map((day) => (
                        <th
                          key={day}
                          colSpan={dataset.term.periodsConfig.length}
                          className="p-1.5 border border-slate-700 text-center font-bold"
                        >
                          {DAY_LABELS[day]?.full}
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-slate-100 text-slate-700">
                      {dataset.term.daysOfWeek.flatMap((day) =>
                        dataset.term.periodsConfig.map((pc) => (
                          <th
                            key={`${day}-${pc.period}`}
                            className="px-1.5 py-1 border border-slate-200 text-center font-semibold min-w-[54px]"
                          >
                            ค.{pc.period}
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.gradeLevels.map((g) => {
                      const roomsInGrade = sortClassrooms(
                        dataset.classrooms.filter((c) => c.gradeLevelId === g.id)
                      );
                      if (roomsInGrade.length === 0) return null;

                      return (
                        <React.Fragment key={g.id}>
                          <tr className="bg-slate-800 text-amber-300 font-bold text-xs border-y border-slate-700">
                            <td
                              colSpan={1 + dataset.term.daysOfWeek.length * dataset.term.periodsConfig.length}
                              className="py-1 px-3 text-left sticky left-0 z-10 bg-slate-800"
                            >
                              ระดับชั้น {g.name} ({roomsInGrade.length} ห้องเรียน — เรียงห้อง 1–10)
                            </td>
                          </tr>
                          {roomsInGrade.map((cls) => {
                            const clsEnts = activeVersionEntries.filter((e) =>
                              e.classroomIds.includes(cls.id)
                            );
                            return (
                              <tr key={cls.id} className="border-b border-slate-200 hover:bg-slate-50">
                                <td className="p-1.5 border-r border-slate-200 font-bold text-slate-800 bg-slate-50 sticky left-0 z-10 text-center whitespace-nowrap">
                                  {cls.name}
                                </td>
                                {dataset.term.daysOfWeek.flatMap((day) =>
                                  dataset.term.periodsConfig.map((pc) => {
                                    const active = clsEnts.find(
                                      (e) =>
                                        e.day === day &&
                                        pc.period >= e.startPeriod &&
                                        pc.period < e.startPeriod + e.duration
                                    );
                                    return (
                                      <td
                                        key={`${cls.id}-${day}-${pc.period}`}
                                        onClick={() => {
                                          setSelectedClassroomId(cls.id);
                                          setPerspective("classroom");
                                          if (active && active.sourceType !== "free_period") {
                                            setSelectedEntryId(active.id);
                                          }
                                        }}
                                        className={`p-1 border-r border-slate-200 text-center cursor-pointer truncate max-w-[64px] ${
                                          active?.sourceType === "free_period"
                                            ? "text-slate-400 bg-slate-50/60 italic"
                                            : active?.sourceType === "sync_block"
                                            ? "bg-purple-50 text-purple-900 font-medium"
                                            : "hover:bg-blue-50 text-slate-800"
                                        }`}
                                        title={
                                          active
                                            ? `${cls.name} • ${DAY_LABELS[day]?.short} คาบ ${pc.period}: ${active.title}`
                                            : ""
                                        }
                                      >
                                        {active
                                          ? active.sourceType === "free_period"
                                            ? "อิสระ"
                                            : active.subjectCode || active.title.slice(0, 7)
                                          : "-"}
                                      </td>
                                    );
                                  })
                                )}
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
          )}

          {/* Drag Overlay Preview */}
          <DragOverlay>
            {activeDragEntry ? (
              <div className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold shadow-xl border border-blue-400 opacity-95">
                <div>
                  {activeDragEntry.subjectCode ? `${activeDragEntry.subjectCode} ` : ""}
                  {activeDragEntry.title}
                </div>
                <div className="text-[10px] text-blue-100">
                  {activeDragEntry.duration} คาบติด • ลากไปวางช่องสีเขียวเพื่อย้าย/สลับ
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Selected Entry Inspector + Smart Swap Finder Panel (โหมดช่วยหาคู่สลับอัตโนมัติ) */}
      {selectedEntry && (
        <div className="bg-white rounded-xl border-2 border-blue-500 p-4 shadow-md space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold">
                  กำลังเลือกคาบเพื่อปรับแก้รายกรณี
                </span>
                <h3 className="font-bold text-sm text-slate-900">
                  {selectedEntry.subjectCode ? `${selectedEntry.subjectCode} — ` : ""}
                  {selectedEntry.title}
                </h3>
                <span className="text-xs text-slate-500">
                  ({DAY_LABELS[selectedEntry.day]?.full} คาบ{" "}
                  {selectedEntry.duration > 1
                    ? `${selectedEntry.startPeriod}–${selectedEntry.startPeriod + selectedEntry.duration - 1}`
                    : selectedEntry.startPeriod}
                  )
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-3">
                <span>
                  ห้องเรียน:{" "}
                  <strong>
                    {selectedEntry.classroomIds
                      .map((cid) => classroomsMap.get(cid)?.name ?? cid)
                      .join(", ")}
                  </strong>
                </span>
                <span>
                  ครูผู้สอน:{" "}
                  <strong>
                    {selectedEntry.teacherIds
                      .map((tid) => teachersMap.get(tid))
                      .filter(Boolean)
                      .map((t) => getTeacherFullName(t!))
                      .join(", ") || "-"}
                  </strong>
                </span>
                {selectedEntry.isOverridden && (
                  <span className="text-orange-700 font-semibold">
                    ⚠️ อนุโลมรายกรณี: {selectedEntry.overrideNote}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Room override selector (ข้อ 18) */}
              {selectedEntry.sourceType === "assignment" && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-600 font-medium">ห้องที่ใช้สอน:</span>
                  <select
                    value={selectedEntry.roomId || ""}
                    onChange={(e) =>
                      updateEntryRoom(selectedEntry, e.target.value ? e.target.value : null)
                    }
                    className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-slate-50"
                  >
                    <option value="">ใช้ห้องประจำของนักเรียน</option>
                    {dataset.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} — {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => togglePinEntry(selectedEntry)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  selectedEntry.isPinned
                    ? "border-amber-400 bg-amber-50 text-amber-900"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {selectedEntry.isPinned ? (
                  <>
                    <PinOff className="w-3.5 h-3.5 text-amber-600" /> ปลดหมุดล็อคคาบนี้
                  </>
                ) : (
                  <>
                    <Pin className="w-3.5 h-3.5 text-slate-600" /> ปักหมุดล็อคตำแหน่งนี้
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedEntryId(null)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50"
              >
                ยกเลิกการเลือก
              </button>
            </div>
          </div>

          {/* Smart Swap Suggestions */}
          {selectedEntry.sourceType === "assignment" && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ArrowLeftRight className="w-4 h-4 text-emerald-600" />
                ตัวช่วยแนะนำช่องย้าย / คู่สลับอัตโนมัติที่ไม่ชนครูและไม่ชนห้องร่วม (คลิกสลับได้ทันที):
              </div>
              {smartSuggestions.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  ไม่พบคู่สลับ 1 ต่อ 1 ที่ปลอดเงื่อนไข 100% — ท่านยังสามารถคลิกช่องสีส้มบนตารางเพื่อตรวจเหตุผลและกด &ldquo;อนุโลมรายกรณี&rdquo; ได้
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {smartSuggestions.map((sug, i) => (
                    <div
                      key={i}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                        sug.status === "valid"
                          ? "bg-emerald-50/70 border-emerald-200"
                          : "bg-amber-50/70 border-amber-200"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">
                          {sug.type === "direct_move"
                            ? `ย้ายไปช่องว่าง ${DAY_LABELS[sug.targetDay]?.short} คาบ ${sug.targetPeriod}`
                            : `สลับกับ "${sug.swapWithEntry?.title}" (${DAY_LABELS[sug.targetDay]?.short} คาบ ${sug.targetPeriod})`}
                        </div>
                        <div className="text-[11px] text-slate-600 truncate">
                          {sug.warnings.length > 0
                            ? sug.warnings[0]
                            : "ผ่านครบทุกเงื่อนไขครู ห้อง และเวลาพัก"}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={selectedEntry.isPinned}
                        onClick={() =>
                          commitMoveOrSwap(
                            selectedEntry,
                            sug.targetDay,
                            sug.targetPeriod,
                            sug.swapWithEntry
                          )
                        }
                        className="shrink-0 px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] disabled:opacity-40"
                      >
                        {sug.type === "direct_move" ? "ย้ายทันที" : "สลับทันที"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: อนุโลมเงื่อนไขรายกรณี (Case-by-Case Policy Override) */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <ShieldAlert className="w-5 h-5 text-orange-600" />
                ยืนยันการปรับแก้และอนุโลมเงื่อนไขรายกรณี
              </h3>
              <button
                onClick={() => setOverrideModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-700">
                การย้ายวิชา <strong>{overrideModal.sourceEntry.title}</strong> ไปยัง{" "}
                <strong>
                  {DAY_LABELS[overrideModal.targetDay]?.full} คาบ {overrideModal.targetPeriod}
                </strong>{" "}
                {overrideModal.swapPartner
                  ? `(สลับกับ "${overrideModal.swapPartner.title}") `
                  : ""}
                <strong>ไม่มีการสอนซ้อนห้องหรือครูชนกัน</strong> แต่ติดเงื่อนไขนโยบายดังนี้:
              </p>

              <ul className="list-disc ml-5 space-y-1 text-orange-900 bg-orange-50 p-3 rounded-lg border border-orange-200">
                {overrideModal.hardReasons.map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  บันทึกหมายเหตุการอนุโลมรายกรณี (เช่น ครูผู้สอนตกลงยินยอมแล้ว):
                </label>
                <input
                  type="text"
                  value={overrideModal.note}
                  onChange={(e) =>
                    setOverrideModal({ ...overrideModal, note: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setOverrideModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  commitMoveOrSwap(
                    overrideModal.sourceEntry,
                    overrideModal.targetDay,
                    overrideModal.targetPeriod,
                    overrideModal.swapPartner,
                    {
                      overridden: true,
                      note: overrideModal.note.trim() || "อนุโลมรายกรณี",
                    }
                  );
                  setOverrideModal(null);
                }}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
              >
                ยืนยันอนุโลมรายกรณี
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: สร้างร่างตารางสอนใหม่ / สำเนาร่าง */}
      {versionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                สร้าง / สำเนาร่างตารางสอน
              </h3>
              <button
                onClick={() => setVersionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ชื่อร่างตารางสอน</label>
                <input
                  type="text"
                  value={newVersionName}
                  onChange={(e) => setNewVersionName(e.target.value)}
                  placeholder="เช่น ร่างที่ 2 (หลังประชุมปรับแก้)"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={copyCurrentEntries}
                  onChange={(e) => setCopyCurrentEntries(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>คัดลอกคาบเรียนจากร่างปัจจุบันมาปรับแก้ต่อ</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setVersionModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  createVersion(
                    newVersionName.trim() || `ร่างตารางสอน ${dataset.versions.length + 1}`,
                    copyCurrentEntries
                  );
                  setVersionModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                สร้างร่างใหม่
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ข้อ 1-4: โมดอลเลือกแนวทางการจัดการคาบกิจกรรมชนกับคาบล็อค/ประชุมครู */}
      {conflictModalState && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeConflictModal();
            }
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-rose-600 via-rose-700 to-amber-600 text-white flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base leading-tight">
                    จัดการข้อขัดแย้งคาบชนของครู
                  </h3>
                  <p className="text-xs text-rose-100">
                    {teachersMap.get(conflictModalState.teacherId)
                      ? getTeacherFullName(teachersMap.get(conflictModalState.teacherId)!)
                      : "ครู"} • วัน{DAY_LABELS[conflictModalState.day]?.full} คาบ {conflictModalState.period}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeConflictModal}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="font-semibold text-slate-700">รายการที่ซ้อนทับกันในคาบนี้:</div>
                <div className="flex items-center gap-2 text-slate-900 bg-white p-2 rounded-lg border border-slate-200 font-medium">
                  <span className="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">1</span>
                  <span>📌 คาบกิจกรรม: <strong className="text-blue-900">{conflictModalState.syncBlock?.title || conflictModalState.existingEntry?.title || "คาบกิจกรรม"}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-900 bg-white p-2 rounded-lg border border-slate-200 font-medium">
                  <span className="w-5 h-5 rounded bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold">2</span>
                  <span>🏢 คาบประชุม/ภารกิจ: <strong className="text-amber-900">{conflictModalState.meeting?.title || conflictModalState.unavail?.reason || "คาบประชุมฝ่าย"}</strong></span>
                </div>
              </div>

              <div className="text-xs font-bold text-slate-700">เลือกแนวทางแก้ไขที่ต้องการ:</div>

              <div className="space-y-2.5">
                {/* Option 1: Pick Activity */}
                <button
                  type="button"
                  onClick={handleChooseActivityOnly}
                  className="w-full text-left p-3 rounded-xl border-2 border-blue-200 bg-blue-50/60 hover:bg-blue-100/80 hover:border-blue-400 transition flex items-start gap-3 group"
                >
                  <span className="text-xl">📌</span>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-blue-950 group-hover:text-blue-700">
                      1. เลือกลงคาบกิจกรรม (ยกเว้นจากคาบประชุม)
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      ครูท่านนี้จะเข้าปฏิบัติหน้าที่ในคาบกิจกรรม และได้รับการยกเว้นไม่ต้องเข้าประชุมในคาบนี้
                    </div>
                  </div>
                </button>

                {/* Option 2: Pick Meeting */}
                <button
                  type="button"
                  onClick={handleChooseMeetingOnly}
                  className="w-full text-left p-3 rounded-xl border-2 border-amber-200 bg-amber-50/60 hover:bg-amber-100/80 hover:border-amber-400 transition flex items-start gap-3 group"
                >
                  <span className="text-xl">🏢</span>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-amber-950 group-hover:text-amber-700">
                      2. เลือกลงคาบประชุม (ไม่ลงคาบกิจกรรม)
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      ครูท่านนี้จะเข้าประชุมตามปกติ และได้รับการยกเว้นไม่ต้องเข้าคาบกิจกรรมในคาบนี้
                    </div>
                  </div>
                </button>

                {/* Option 3: Keep Both (show as /) */}
                <button
                  type="button"
                  onClick={handleChooseKeepBoth}
                  className="w-full text-left p-3 rounded-xl border-2 border-purple-300 bg-purple-50/70 hover:bg-purple-100/90 hover:border-purple-500 transition flex items-start gap-3 group ring-2 ring-purple-200"
                >
                  <span className="text-xl">🤝</span>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-purple-950 group-hover:text-purple-700 flex items-center justify-between">
                      <span>3. เก็บไว้ทั้งคู่ (แสดงเป็น / ในตาราง)</span>
                      <span className="text-[10px] bg-purple-200 text-purple-900 px-1.5 py-0.2 rounded font-bold">แนะนำ</span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      ครูมีชื่อปฏิบัติหน้าที่ทั้งสองอย่าง ในตารางจะแสดงเป็น <strong className="text-purple-900">"{conflictModalState.syncBlock?.title || "กิจกรรม"} / {conflictModalState.meeting?.title || "ประชุม"}"</strong> และระบบจะไม่แจ้งเตือนเป็นข้อผิดพลาด
                    </div>
                  </div>
                </button>
              </div>

              {/* Reset Option if previously chosen */}
              {(conflictModalState.syncBlock?.excludedTeacherIds?.includes(conflictModalState.teacherId) ||
                conflictModalState.meeting?.excludedTeacherIds?.includes(conflictModalState.teacherId) ||
                conflictModalState.syncBlock?.coexistTeacherIds?.includes(conflictModalState.teacherId) ||
                conflictModalState.meeting?.coexistTeacherIds?.includes(conflictModalState.teacherId)) && (
                <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={handleResetConflictChoice}
                    className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 font-medium underline"
                  >
                    ↺ รีเซ็ตการเลือก (คืนค่าให้กลับมาชนกันเหมือนเดิม)
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={closeConflictModal}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SchedulerPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400">กำลังโหลดระบบจัดตารางสอน...</div>}>
      <SchedulerInner />
    </Suspense>
  );
}
