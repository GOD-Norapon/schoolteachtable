"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  Lock,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
  AlertTriangle,
} from "lucide-react";
import { useSchoolData } from "@/lib/store/SchoolDataContext";
import {
  DAY_LABELS,
  DayOfWeek,
  SessionSplitItem,
  SpecificClassroomRule,
  Subject,
  SubjectType,
  SUBJECT_TYPE_LABELS,
  TeachingAssignment,
} from "@/types/timetable";
import {
  calculateTeacherWorkload,
  getTeacherFullName,
  isTeacherInGroupMeeting,
  resolveSyncBlockTeachers,
  sortClassrooms,
} from "@/lib/solver/validator";
import { SearchableTeacherSelect } from "@/components/SearchableTeacherSelect";
import { SearchableSubjectSelect } from "@/components/SearchableSubjectSelect";

function AssignmentsInner() {
  const searchParams = useSearchParams();
  const {
    dataset,
    session,
    readinessReport,
    upsertSubject,
    deleteSubject,
    upsertAssignment,
    bulkUpsertAssignments,
    deleteAssignment,
    toggleDepartmentCompleted,
  } = useSchoolData();

  // Mode: "by_teacher" (จัดภาระงานสอนรายครู - ค่าเริ่มต้นตามคำขอ) vs "by_classroom" (ลงคาบสอนรายห้อง)
  const [viewMode, setViewMode] = useState<"by_teacher" | "by_classroom">("by_teacher");

  // URL query params
  const urlTeacherId = searchParams.get("teacherId");
  const urlDept = searchParams.get("dept");

  // =========================================================================
  // States for Teacher-Centric View ("by_teacher")
  // =========================================================================
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    urlTeacherId || dataset.teachers[0]?.id || ""
  );
  const [teacherSearch, setTeacherSearch] = useState<string>("");
  const [teacherDeptFilter, setTeacherDeptFilter] = useState<string>("ALL");

  // Assignment Form states (ข้อ 5: ระบุจำนวนคาบเดี่ยวและคาบคู่)
  const [tSelectedSubjectId, setTSelectedSubjectId] = useState<string>("");
  const [tSelectedGradeTab, setTSelectedGradeTab] = useState<string>("g_m1");
  const [tSelectedClassroomIds, setTSelectedClassroomIds] = useState<string[]>([]);
  const [tDoubleCount, setTDoubleCount] = useState<number>(1); // คาบคู่ (2 คาบติด)
  const [tSingleCount, setTSingleCount] = useState<number>(1); // คาบเดี่ยว (1 คาบ)
  const [tTripleCount, setTTripleCount] = useState<number>(0); // คาบ 3 คาบติด
  const [tRoomId, setTRoomId] = useState<string>("");
  const [tCoTeacherIds, setTCoTeacherIds] = useState<string[]>([]);
  const [tNotes, setTNotes] = useState<string>("");
  const [tIsJointClass, setTIsJointClass] = useState<boolean>(false);
  const [tIsSubgroup, setTIsSubgroup] = useState<boolean>(false);
  const [tSubgroupName, setTSubgroupName] = useState<string>("");
  const [tSubgroupSyncId, setTSubgroupSyncId] = useState<string>("");

  // Toggle create new subject form right in this view (ข้อ 6: ไม่ต้องกรอกหน่วยกิต)
  const [isCreatingNewSubject, setIsCreatingNewSubject] = useState(false);
  const [newSubCode, setNewSubCode] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [newSubShortName, setNewSubShortName] = useState("");
  const [newSubDeptId, setNewSubDeptId] = useState("");
  const [newSubType, setNewSubType] = useState<SubjectType>("core");
  const [newSubDoubleCount, setNewSubDoubleCount] = useState<number>(1);
  const [newSubSingleCount, setNewSubSingleCount] = useState<number>(1);
  const [newSubRoomId, setNewSubRoomId] = useState("");

  // Modal: Edit Subject Master Rules & Info (ข้อ 2: ข้อมูลแต่ละวิชาที่กรอกไปปรับให้แก้ไขได้ทั้งหมดเลย)
  const [editingMasterSubject, setEditingMasterSubject] = useState<Subject | null>(null);
  const [editMasterDouble, setEditMasterDouble] = useState<number>(0);
  const [editMasterSingle, setEditMasterSingle] = useState<number>(0);

  // Subject Catalog Modal (คลังรายวิชาทั้งหมด)
  const [showSubjectCatalogModal, setShowSubjectCatalogModal] = useState<boolean>(false);
  const [catalogSearch, setCatalogSearch] = useState<string>("");
  const [catalogDeptFilter, setCatalogDeptFilter] = useState<string>("all");

  // Modal: Edit Existing Assignment (ข้อ 4: วิชาของครูที่เพิ่มไปแล้ว ปรับให้มีฟังก์ชันแก้ไข)
  const [editingAssignment, setEditingAssignment] = useState<TeachingAssignment | null>(null);
  const [editSubId, setEditSubId] = useState<string>("");
  const [editGradeTab, setEditGradeTab] = useState<string>("g_m1");
  const [editClassroomIds, setEditClassroomIds] = useState<string[]>([]);
  const [editDoubleCount, setEditDoubleCount] = useState<number>(1);
  const [editSingleCount, setEditSingleCount] = useState<number>(0);
  const [editTripleCount, setEditTripleCount] = useState<number>(0);
  const [editRoomId, setEditRoomId] = useState<string>("");
  const [editCoTeacherIds, setEditCoTeacherIds] = useState<string[]>([]);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editIsJoint, setEditIsJoint] = useState<boolean>(false);
  const [editIsSubgroup, setEditIsSubgroup] = useState<boolean>(false);
  const [editSubgroupName, setEditSubgroupName] = useState<string>("");
  const [editSubgroupSyncId, setEditSubgroupSyncId] = useState<string>("");

  // Modal: Specific Classroom Condition (ข้อ 3: วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์)
  const [editingRuleAssignment, setEditingRuleAssignment] = useState<TeachingAssignment | null>(null);
  const [ruleIsPinned, setRuleIsPinned] = useState(false);
  const [ruleDay, setRuleDay] = useState<DayOfWeek>("MON");
  const [ruleStartPeriod, setRuleStartPeriod] = useState<number>(1);
  const [rulePreferMorning, setRulePreferMorning] = useState(false);
  const [rulePreferredPeriods, setRulePreferredPeriods] = useState<number[]>([]);
  const [ruleForbiddenPeriods, setRuleForbiddenPeriods] = useState<number[]>([]);
  const [ruleCustomRoomId, setRuleCustomRoomId] = useState("");
  const [ruleNotes, setRuleNotes] = useState("");

  // =========================================================================
  // States for Classroom-Centric View ("by_classroom")
  // =========================================================================
  const [filterDeptId, setFilterDeptId] = useState<string>(
    urlDept || session.departmentId || "ALL"
  );
  const [filterClassroomId, setFilterClassroomId] = useState<string>("ALL");
  const [cSelectedSubjectId, setCSelectedSubjectId] = useState<string>("");
  const [cSelectedClassroomIds, setCSelectedClassroomIds] = useState<string[]>([]);
  const [cSplitText, setCSplitText] = useState<string>("2,1");
  const [cSpecialRoomId, setCSpecialRoomId] = useState<string>("");
  const [cPrimaryTeacherId, setCPrimaryTeacherId] = useState<string>("");
  const [cCoTeacherId, setCCoTeacherId] = useState<string>("");
  const [cNotes, setCNotes] = useState<string>("");

  // Sync URL params
  useEffect(() => {
    if (urlTeacherId) {
      setSelectedTeacherId(urlTeacherId);
      setViewMode("by_teacher");
    }
  }, [urlTeacherId]);

  useEffect(() => {
    if (urlDept) setFilterDeptId(urlDept);
  }, [urlDept]);

  // Lookup Maps
  const subjectsMap = useMemo(() => new Map(dataset.subjects.map((s) => [s.id, s])), [dataset.subjects]);
  const classroomsMap = useMemo(() => new Map(dataset.classrooms.map((c) => [c.id, c])), [dataset.classrooms]);
  const teachersMap = useMemo(() => new Map(dataset.teachers.map((t) => [t.id, t])), [dataset.teachers]);
  const roomsMap = useMemo(() => new Map(dataset.rooms.map((r) => [r.id, r])), [dataset.rooms]);

  // Filtered Teachers for Sidebar
  const filteredTeacherList = useMemo(() => {
    let list = dataset.teachers;
    if (teacherDeptFilter !== "ALL") {
      list = list.filter((t) => t.departmentId === teacherDeptFilter);
    }
    if (teacherSearch.trim()) {
      const q = teacherSearch.trim().toLowerCase();
      list = list.filter((t) => {
        const full = `${t.prefix}${t.firstName} ${t.lastName}`.toLowerCase();
        const code = t.code.toLowerCase();
        const dept = dataset.departments.find((d) => d.id === t.departmentId)?.name.toLowerCase() || "";
        return full.includes(q) || code.includes(q) || dept.includes(q);
      });
    }
    return list;
  }, [dataset.departments, dataset.teachers, teacherDeptFilter, teacherSearch]);

  const activeTeacher =
    dataset.teachers.find((t) => t.id === selectedTeacherId) || filteredTeacherList[0];

  // Current active teacher's assignments
  const activeTeacherAssignments = useMemo(() => {
    if (!activeTeacher) return [];
    return dataset.teachingAssignments.filter((a) => a.teacherIds.includes(activeTeacher.id));
  }, [activeTeacher, dataset.teachingAssignments]);

  // คำนวณภาระงานสอนจริงของครู (ข้อ 1: วิชาเลือก/เรียนพร้อมกันนับแค่ครั้งเดียว ไม่คูณจำนวนห้อง)
  const activeTeacherWorkload = useMemo(() => {
    if (!activeTeacher) return null;
    return calculateTeacherWorkload(activeTeacher.id, dataset);
  }, [activeTeacher, dataset]);

  const activeTeacherTotalPeriods = activeTeacherWorkload?.totalTeachingPeriods || 0;

  const activeTeacherClassroomCount = useMemo(() => {
    return new Set(activeTeacherAssignments.map((a) => a.classroomId)).size;
  }, [activeTeacherAssignments]);

  // คาบกิจกรรมโรงเรียน / คาบประจำระดับชั้น / วิชาเลือกที่ครูมีส่วนร่วม (ข้อ 2: ครูอภิสรา กิจกรรมชุมนุม 1 คาบ)
  const activeTeacherSyncBlocks = useMemo(() => {
    if (!activeTeacher) return [];
    const classroomsMap = new Map(dataset.classrooms.map((c) => [c.id, c]));
    return dataset.synchronizedBlocks.filter((b) => {
      const teachers = resolveSyncBlockTeachers(b, classroomsMap, dataset.teachers);
      return teachers.includes(activeTeacher.id);
    });
  }, [activeTeacher, dataset.synchronizedBlocks, dataset.classrooms, dataset.teachers]);

  // คาบประชุมฝ่ายของครูท่านนี้
  const activeTeacherMeetings = useMemo(() => {
    if (!activeTeacher) return [];
    return dataset.groupMeetingLocks.filter((m) =>
      isTeacherInGroupMeeting(activeTeacher, m, dataset.divisions)
    );
  }, [activeTeacher, dataset.groupMeetingLocks, dataset.divisions]);

  // Auto-init Subject in Teacher View
  useEffect(() => {
    if (!activeTeacher) return;
    if (!newSubDeptId) setNewSubDeptId(activeTeacher.departmentId);

    const teacherDeptSubs = dataset.subjects.filter((s) => s.departmentId === activeTeacher.departmentId);
    const subToPick = teacherDeptSubs[0] || dataset.subjects[0];
    if (subToPick && !tSelectedSubjectId) {
      setTSelectedSubjectId(subToPick.id);
      const doubles = subToPick.defaultSplitPattern.filter((x) => x === 2).length;
      const singles = subToPick.defaultSplitPattern.filter((x) => x === 1).length;
      const triples = subToPick.defaultSplitPattern.filter((x) => x === 3).length;
      setTDoubleCount(doubles);
      setTSingleCount(singles);
      setTTripleCount(triples);
      setTRoomId(subToPick.defaultRoomId || "");
      if (subToPick.subjectType === "elective") {
        setTIsJointClass(true);
      }
    }
  }, [activeTeacher, dataset.subjects, tSelectedSubjectId, newSubDeptId]);

  // ตรวจสอบว่าวิชานี้ถูกจัดลงห้องไหนไปแล้วบ้าง (ทุกครู) เพื่อป้องกันการลงซ้ำและแสดงปุ่มแดง
  const assignedClassroomsForSelectedSubject = useMemo(() => {
    const map = new Map<string, TeachingAssignment[]>();
    if (!tSelectedSubjectId) return map;
    for (const asg of dataset.teachingAssignments) {
      if (asg.subjectId === tSelectedSubjectId) {
        const existing = map.get(asg.classroomId) || [];
        existing.push(asg);
        map.set(asg.classroomId, existing);
      }
    }
    return map;
  }, [dataset.teachingAssignments, tSelectedSubjectId]);

  const handleSelectTeacherSubject = (subId: string) => {
    setTSelectedSubjectId(subId);
    const alreadyAssignedIds = new Set(
      dataset.teachingAssignments
        .filter((a) => a.subjectId === subId)
        .map((a) => a.classroomId)
    );
    setTSelectedClassroomIds((prev) => prev.filter((cid) => !alreadyAssignedIds.has(cid)));
    const sub = dataset.subjects.find((s) => s.id === subId);
    if (sub) {
      const doubles = sub.defaultSplitPattern.filter((x) => x === 2).length;
      const singles = sub.defaultSplitPattern.filter((x) => x === 1).length;
      const triples = sub.defaultSplitPattern.filter((x) => x === 3).length;
      setTDoubleCount(doubles);
      setTSingleCount(singles);
      setTTripleCount(triples);
      setTRoomId(sub.defaultRoomId || "");
      if (sub.subjectType === "elective") {
        setTIsJointClass(true);
      }
    }
  };

  // แตกคาบสอน: คำนวณยอดคาบรวมและลำดับคาบ (ข้อ 5)
  const tSplitArray = useMemo(() => {
    return [
      ...Array(tDoubleCount).fill(2),
      ...Array(tTripleCount).fill(3),
      ...Array(tSingleCount).fill(1),
    ];
  }, [tDoubleCount, tTripleCount, tSingleCount]);

  const tTotalPeriods = useMemo(() => {
    return tDoubleCount * 2 + tTripleCount * 3 + tSingleCount * 1;
  }, [tDoubleCount, tTripleCount, tSingleCount]);

  const tSplitSummary = useMemo(() => {
    if (tTotalPeriods === 0) return null;
    return `รวม ${tTotalPeriods} คาบ (${tSplitArray.join("+")})`;
  }, [tTotalPeriods, tSplitArray]);

  // Next / Prev Teacher buttons
  const currentTeacherIdx = filteredTeacherList.findIndex((t) => t.id === activeTeacher?.id);
  const handlePrevTeacher = () => {
    if (filteredTeacherList.length <= 1) return;
    const prevIdx = (currentTeacherIdx - 1 + filteredTeacherList.length) % filteredTeacherList.length;
    setSelectedTeacherId(filteredTeacherList[prevIdx].id);
    setTSelectedClassroomIds([]);
  };

  const handleNextTeacher = () => {
    if (filteredTeacherList.length <= 1) return;
    const nextIdx = (currentTeacherIdx + 1) % filteredTeacherList.length;
    setSelectedTeacherId(filteredTeacherList[nextIdx].id);
    setTSelectedClassroomIds([]);
  };

  // 1. Create New Subject Handler (ข้อ 6: หน่วยกิตไม่ได้ใช้ ไม่ต้องกรอก)
  const handleCreateNewSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubCode.trim() || !newSubName.trim()) {
      window.alert("กรุณากรอกรหัสวิชาและชื่อวิชา");
      return;
    }
    const pattern = [
      ...Array(newSubDoubleCount).fill(2),
      ...Array(newSubSingleCount).fill(1),
    ];
    const finalPattern = pattern.length > 0 ? pattern : [2, 1];
    const totalP = finalPattern.reduce((a, b) => a + b, 0);

    const newSub: Subject = {
      id: `sub_${Date.now()}`,
      termId: dataset.term.id,
      code: newSubCode.trim().toUpperCase(),
      name: newSubName.trim(),
      shortName: newSubShortName.trim() || newSubName.trim().slice(0, 12),
      departmentId: newSubDeptId || activeTeacher?.departmentId || dataset.departments[0]?.id || "",
      subjectType: newSubType,
      credits: 1.0, // ค่าเริ่มต้นภายใน ไม่ต้องให้ผู้ใช้กรอก
      defaultPeriodsPerWeek: totalP,
      defaultSplitPattern: finalPattern,
      defaultRoomId: newSubRoomId || null,
      rules: {
        preferredPeriods: [],
        forbiddenPeriods: [],
        allowedPeriodsOnly: null,
        preferAfterSubjectIds: [],
        preferBeforeSubjectIds: [],
        preferMorning: false,
        allowSameDayRepeat: false,
      },
    };

    upsertSubject(newSub);
    setTSelectedSubjectId(newSub.id);
    setTDoubleCount(newSubDoubleCount);
    setTSingleCount(newSubSingleCount);
    setTTripleCount(0);
    setTRoomId(newSub.defaultRoomId || "");
    setIsCreatingNewSubject(false);
    setNewSubCode("");
    setNewSubName("");
    setNewSubShortName("");
  };

  // 2. Save Teacher Assignments for Selected Classrooms (ข้อ 5: ใช้คาบเดี่ยวและคาบคู่)
  const handleSaveTeacherAssignments = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeacher) return;
    if (!tSelectedSubjectId) {
      window.alert("กรุณาเลือกรายวิชาที่สอน");
      return;
    }
    if (tSelectedClassroomIds.length === 0) {
      window.alert("กรุณาคลิกเลือกห้องเรียนที่สอนอย่างน้อย 1 ห้อง (เช่น ม.1/1)");
      return;
    }

    if (tTotalPeriods === 0) {
      window.alert("กรุณาระบุจำนวนคาบสอน เช่น คาบคู่ 1 ครั้ง หรือ คาบเดี่ยว 1 คาบ");
      return;
    }

    const splits: SessionSplitItem[] = [
      ...Array(tDoubleCount).fill(null).map(() => ({ duration: 2, roomId: tRoomId || null })),
      ...Array(tTripleCount).fill(null).map(() => ({ duration: 3, roomId: tRoomId || null })),
      ...Array(tSingleCount).fill(null).map(() => ({ duration: 1, roomId: tRoomId || null })),
    ];
    const totalP = tTotalPeriods;
    const teacherIds = Array.from(new Set([activeTeacher.id, ...tCoTeacherIds].filter(Boolean)));

    const validClassroomIds = tSelectedClassroomIds.filter(
      (cid) => !assignedClassroomsForSelectedSubject.has(cid)
    );
    if (validClassroomIds.length === 0) {
      window.alert("ห้องเรียนที่เลือกมีการลงวิชานี้ไปแล้ว กรุณาเลือกห้องที่ยังไม่ได้ลง");
      return;
    }

    const isJoint = tIsJointClass && validClassroomIds.length > 1;
    const jointGroupId = isJoint ? `joint_${Date.now()}` : null;

    const batch: TeachingAssignment[] = validClassroomIds.map((cid, idx) => ({
      id: `asg_${activeTeacher.id}_${cid}_${Date.now()}_${idx}`,
      termId: dataset.term.id,
      classroomId: cid,
      subjectId: tSelectedSubjectId,
      periodsPerWeek: totalP,
      splitSessions: splits,
      teacherIds,
      notes: tNotes.trim() || null,
      updatedBy: session.userName,
      specificRule: null,
      isJointClass: isJoint,
      jointGroupId,
      jointClassroomIds: isJoint ? validClassroomIds : undefined,
      isSubgroup: tIsSubgroup,
      subgroupName: tIsSubgroup ? (tSubgroupName.trim() || null) : null,
      subgroupSyncId: tIsSubgroup ? (tSubgroupSyncId.trim() || `subgroup_${cid}_${Date.now()}`) : null,
    }));

    bulkUpsertAssignments(batch);
    setTSelectedClassroomIds([]);
    setTCoTeacherIds([]);
    setTNotes("");
    setTIsSubgroup(false);
    setTSubgroupName("");
    setTSubgroupSyncId("");
  };

  // 3. Edit Existing Assignment Modal Handlers (ข้อ 4: วิชาของครูที่เพิ่มไปแล้ว ปรับให้มีฟังก์ชันแก้ไข)
  const handleOpenEditAssignmentModal = (asg: TeachingAssignment) => {
    setEditingAssignment(asg);
    setEditSubId(asg.subjectId);
    const sub = subjectsMap.get(asg.subjectId);
    const isJoint = asg.isJointClass || asg.jointGroupId !== null || sub?.subjectType === "elective";
    setEditIsJoint(isJoint);

    if (asg.jointGroupId) {
      const groupAsgs = dataset.teachingAssignments.filter(
        (a) => a.jointGroupId === asg.jointGroupId && a.teacherIds.includes(activeTeacher?.id || "")
      );
      setEditClassroomIds(groupAsgs.map((a) => a.classroomId));
      const firstCls = dataset.classrooms.find((c) => c.id === asg.classroomId);
      if (firstCls) setEditGradeTab(firstCls.gradeLevelId);
    } else {
      setEditClassroomIds([asg.classroomId]);
      const cls = dataset.classrooms.find((c) => c.id === asg.classroomId);
      if (cls) setEditGradeTab(cls.gradeLevelId);
    }

    const doubles = asg.splitSessions.filter((s) => s.duration === 2).length;
    const singles = asg.splitSessions.filter((s) => s.duration === 1).length;
    const triples = asg.splitSessions.filter((s) => s.duration === 3).length;
    setEditDoubleCount(doubles);
    setEditSingleCount(singles);
    setEditTripleCount(triples);

    setEditRoomId(asg.splitSessions[0]?.roomId || "");
    const coIds = asg.teacherIds.filter((tid) => tid !== activeTeacher?.id);
    setEditCoTeacherIds(coIds);
    setEditNotes(asg.notes || "");
    setEditIsSubgroup(Boolean(asg.isSubgroup));
    setEditSubgroupName(asg.subgroupName || "");
    setEditSubgroupSyncId(asg.subgroupSyncId || "");
  };

  const handleSaveEditAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment || !activeTeacher) return;
    if (!editSubId) {
      window.alert("กรุณาเลือกรายวิชาที่สอน");
      return;
    }
    if (editClassroomIds.length === 0) {
      window.alert("กรุณาเลือกห้องเรียนที่สอนอย่างน้อย 1 ห้อง");
      return;
    }

    const totalEditP = editDoubleCount * 2 + editTripleCount * 3 + editSingleCount * 1;
    if (totalEditP === 0) {
      window.alert("กรุณาระบุจำนวนคาบสอน (คาบคู่ หรือ คาบเดี่ยว)");
      return;
    }

    const splits: SessionSplitItem[] = [
      ...Array(editDoubleCount).fill(null).map(() => ({ duration: 2, roomId: editRoomId || null })),
      ...Array(editTripleCount).fill(null).map(() => ({ duration: 3, roomId: editRoomId || null })),
      ...Array(editSingleCount).fill(null).map(() => ({ duration: 1, roomId: editRoomId || null })),
    ];
    const teacherIds = Array.from(new Set([activeTeacher.id, ...editCoTeacherIds].filter(Boolean)));
    const isJoint = editIsJoint && editClassroomIds.length > 1;
    const jointGroupId = isJoint ? (editingAssignment.jointGroupId || `joint_${Date.now()}`) : null;

    // 1. ลบรายการเดิม
    if (editingAssignment.jointGroupId) {
      const oldGroup = dataset.teachingAssignments.filter(
        (a) => a.jointGroupId === editingAssignment.jointGroupId
      );
      oldGroup.forEach((a) => deleteAssignment(a.id));
    } else {
      deleteAssignment(editingAssignment.id);
    }

    // 2. บันทึกรายการใหม่
    const newBatch: TeachingAssignment[] = editClassroomIds.map((cid, idx) => ({
      id: `asg_${activeTeacher.id}_${cid}_${Date.now()}_${idx}`,
      termId: dataset.term.id,
      classroomId: cid,
      subjectId: editSubId,
      periodsPerWeek: totalEditP,
      splitSessions: splits,
      teacherIds,
      notes: editNotes.trim() || null,
      updatedBy: session.userName,
      specificRule: editingAssignment.specificRule,
      isJointClass: isJoint,
      jointGroupId,
      jointClassroomIds: isJoint ? editClassroomIds : undefined,
      isSubgroup: editIsSubgroup,
      subgroupName: editIsSubgroup ? (editSubgroupName.trim() || null) : null,
      subgroupSyncId: editIsSubgroup ? (editSubgroupSyncId.trim() || `subgroup_${cid}_${Date.now()}`) : null,
    }));

    bulkUpsertAssignments(newBatch);
    setEditingAssignment(null);
  };

  // 3.1 Subject Master Edit Handlers (ข้อ 2: ปรับให้แก้ไขข้อมูลรายวิชาได้ทั้งหมด)
  const handleOpenEditSubject = (sub: Subject) => {
    setEditingMasterSubject(sub);
    const doubles = sub.defaultSplitPattern.filter((x) => x === 2).length;
    const singles = sub.defaultSplitPattern.filter((x) => x === 1).length;
    setEditMasterDouble(doubles);
    setEditMasterSingle(singles);
  };

  const handleSaveEditSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMasterSubject) return;
    if (!editingMasterSubject.code.trim() || !editingMasterSubject.name.trim()) {
      window.alert("กรุณากรอกรหัสวิชาและชื่อรายวิชา");
      return;
    }
    const newPattern = [
      ...Array(editMasterDouble).fill(2),
      ...Array(editMasterSingle).fill(1),
    ];
    const totalPeriods = editMasterDouble * 2 + editMasterSingle * 1;
    const updated: Subject = {
      ...editingMasterSubject,
      code: editingMasterSubject.code.trim(),
      name: editingMasterSubject.name.trim(),
      defaultSplitPattern: newPattern.length > 0 ? newPattern : [1],
      defaultPeriodsPerWeek: totalPeriods > 0 ? totalPeriods : 1,
    };
    upsertSubject(updated);
    setEditingMasterSubject(null);
  };

  const handleDeleteSubject = (subjectId: string, subjectTitle: string) => {
    const usedAssignments = dataset.teachingAssignments.filter((a) => a.subjectId === subjectId);
    let msg = `ต้องการลบรายวิชา "${subjectTitle}" ออกจากคลังรายวิชาหรือไม่?`;
    if (usedAssignments.length > 0) {
      msg += `\n⚠️ คำเตือน: มีครูผู้สอนที่ได้รับมอบหมายวิชานี้อยู่ ${usedAssignments.length} รายการ`;
    }
    if (window.confirm(msg)) {
      deleteSubject(subjectId);
      if (editingMasterSubject?.id === subjectId) {
        setEditingMasterSubject(null);
      }
    }
  };

  // 3. Open Specific Classroom Condition Modal (วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์)
  const handleOpenRuleModal = (asg: TeachingAssignment) => {
    setEditingRuleAssignment(asg);
    const spec = asg.specificRule;
    if (spec && spec.fixedDay && spec.fixedStartPeriod) {
      setRuleIsPinned(true);
      setRuleDay(spec.fixedDay);
      setRuleStartPeriod(spec.fixedStartPeriod);
    } else {
      setRuleIsPinned(false);
      setRuleDay("MON");
      setRuleStartPeriod(1);
    }
    setRulePreferMorning(spec?.preferMorning ?? false);
    setRulePreferredPeriods(spec?.preferredPeriods ? [...spec.preferredPeriods] : []);
    setRuleForbiddenPeriods(spec?.forbiddenPeriods ? [...spec.forbiddenPeriods] : []);
    setRuleCustomRoomId(spec?.customRoomId ?? "");
    setRuleNotes(spec?.notes ?? "");
  };

  const handleSaveSpecificRule = () => {
    if (!editingRuleAssignment) return;

    const hasAnyRule =
      ruleIsPinned ||
      rulePreferMorning ||
      rulePreferredPeriods.length > 0 ||
      ruleForbiddenPeriods.length > 0 ||
      ruleCustomRoomId ||
      ruleNotes.trim().length > 0;

    const ruleData: SpecificClassroomRule | null = hasAnyRule
      ? {
          fixedDay: ruleIsPinned ? ruleDay : null,
          fixedStartPeriod: ruleIsPinned ? ruleStartPeriod : null,
          sessionIndex: 0,
          preferMorning: rulePreferMorning,
          preferredPeriods: rulePreferredPeriods,
          forbiddenPeriods: ruleForbiddenPeriods,
          customRoomId: ruleCustomRoomId || null,
          notes: ruleNotes.trim() || null,
        }
      : null;

    if (editingRuleAssignment.jointGroupId) {
      const jointGroup = dataset.teachingAssignments.filter(
        (a) => a.jointGroupId === editingRuleAssignment.jointGroupId
      );
      if (jointGroup.length > 0) {
        bulkUpsertAssignments(
          jointGroup.map((a) => ({
            ...a,
            specificRule: ruleData,
          }))
        );
        setEditingRuleAssignment(null);
        return;
      }
    }

    const updatedAsg: TeachingAssignment = {
      ...editingRuleAssignment,
      specificRule: ruleData,
    };

    upsertAssignment(updatedAsg);
    setEditingRuleAssignment(null);
  };

  const handleClearSpecificRule = () => {
    if (!editingRuleAssignment) return;

    if (editingRuleAssignment.jointGroupId) {
      const jointGroup = dataset.teachingAssignments.filter(
        (a) => a.jointGroupId === editingRuleAssignment.jointGroupId
      );
      if (jointGroup.length > 0) {
        bulkUpsertAssignments(
          jointGroup.map((a) => ({
            ...a,
            specificRule: null,
          }))
        );
        setEditingRuleAssignment(null);
        return;
      }
    }

    const updatedAsg: TeachingAssignment = {
      ...editingRuleAssignment,
      specificRule: null,
    };
    upsertAssignment(updatedAsg);
    setEditingRuleAssignment(null);
  };

  // Classroom-centric available subjects
  const cAvailableSubjects = useMemo(() => {
    if (filterDeptId === "ALL") return dataset.subjects;
    return dataset.subjects.filter((s) => s.departmentId === filterDeptId);
  }, [dataset.subjects, filterDeptId]);

  useEffect(() => {
    if (!cAvailableSubjects.some((s) => s.id === cSelectedSubjectId)) {
      const first = cAvailableSubjects[0];
      if (first) {
        setCSelectedSubjectId(first.id);
        setCSplitText(first.defaultSplitPattern.join(","));
        setCSpecialRoomId(first.defaultRoomId || "");
      }
    }
  }, [cAvailableSubjects, cSelectedSubjectId]);

  const handleAddClassroomAssignments = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cSelectedSubjectId || cSelectedClassroomIds.length === 0 || !cPrimaryTeacherId) {
      window.alert("กรุณาเลือก ห้องเรียน รายวิชา และครูผู้สอนหลัก อย่างน้อย 1 ท่าน");
      return;
    }

    const nums = cSplitText
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => n > 0);
    if (nums.length === 0) return;

    const splits: SessionSplitItem[] = nums.map((dur) => ({
      duration: dur,
      roomId: cSpecialRoomId || null,
    }));
    const totalP = splits.reduce((acc, s) => acc + s.duration, 0);
    const teacherIds = Array.from(new Set([cPrimaryTeacherId, cCoTeacherId].filter(Boolean)));

    const batch: TeachingAssignment[] = cSelectedClassroomIds.map((cid, idx) => ({
      id: `asg_${Date.now()}_${idx}`,
      termId: dataset.term.id,
      classroomId: cid,
      subjectId: cSelectedSubjectId,
      periodsPerWeek: totalP,
      splitSessions: splits,
      teacherIds,
      notes: cNotes.trim() || null,
      updatedBy: session.userName,
      specificRule: null,
    }));

    bulkUpsertAssignments(batch);
    setCSelectedClassroomIds([]);
    setCNotes("");
  };

  // 4. Sorted Classrooms 1-10 for Active Grade Tab
  const activeGradeSortedRooms = useMemo(() => {
    const list = dataset.classrooms.filter((c) => c.gradeLevelId === tSelectedGradeTab);
    return sortClassrooms(list);
  }, [dataset.classrooms, tSelectedGradeTab]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Mode Switcher */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            รายวิชา & จัดภาระงานสอนครู (รวมหน้าเดียว)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            เลือกครูผู้สอน • บันทึกวิชาที่สอนพร้อมระบุห้องเรียน (เรียง 1-10) • ใส่เงื่อนไขเฉพาะห้อง เช่น &ldquo;วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์&rdquo;
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switcher Tabs */}
          <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewMode("by_teacher")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md transition ${
                viewMode === "by_teacher"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>จัดภาระงานสอนรายครู (แนะนำ)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("by_classroom")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md transition ${
                viewMode === "by_classroom"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-purple-600" />
              <span>มุมมองลงคาบสอนรายห้อง</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* โหมด 1: จัดภาระงานสอนรายครู (ดูเป็นคนๆ ไป - 4 ข้อหลักที่ผู้ใช้ระบุ) */}
      {/* ========================================================================= */}
      {viewMode === "by_teacher" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Teacher Selector & Search (ข้อ 1: เลือกชื่อครู) */}
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col max-h-[820px] shadow-sm">
            {/* Header + Search + Dept Filter */}
            <div className="p-3.5 bg-slate-100 border-b border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  1. เลือกชื่อครูผู้สอน ({filteredTeacherList.length} ท่าน)
                </span>
                {teacherSearch && (
                  <button
                    type="button"
                    onClick={() => setTeacherSearch("")}
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
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  placeholder="ค้นหารหัส หรือชื่อ-นามสกุลครู..."
                  className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                />
                {teacherSearch && (
                  <button
                    type="button"
                    onClick={() => setTeacherSearch("")}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={teacherDeptFilter}
                onChange={(e) => setTeacherDeptFilter(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium"
              >
                <option value="ALL">ทุกกลุ่มสาระการเรียนรู้</option>
                {dataset.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    กลุ่มสาระ{d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Teacher Cards List */}
            <div className="divide-y divide-slate-100 overflow-y-auto">
              {filteredTeacherList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  ไม่พบรายชื่อครูที่ตรงกับเงื่อนไขการค้นหา
                </div>
              ) : (
                filteredTeacherList.map((t) => {
                  const dept = dataset.departments.find((d) => d.id === t.departmentId);
                  const isSelected = activeTeacher?.id === t.id;
                  const tAsgs = dataset.teachingAssignments.filter((a) => a.teacherIds.includes(t.id));
                  const tWorkload = calculateTeacherWorkload(t.id, dataset);
                  const academicPeriods = tWorkload.teachingPeriods + tWorkload.electivePeriods;
                  const activityPeriods =
                    tWorkload.activityPeriods + tWorkload.advisorPeriods;
                  const totalTeaching = tWorkload.totalTeachingPeriods;
                  const roomCount = new Set(tAsgs.map((a) => a.classroomId)).size;
                  const lockCount = t.unavailableSlots.length;

                  // Load status styling
                  let badgeStyle = "bg-slate-100 text-slate-700";
                  if (totalTeaching >= 16 && totalTeaching <= 22) badgeStyle = "bg-emerald-100 text-emerald-800 font-bold";
                  else if (totalTeaching > 22) badgeStyle = "bg-rose-100 text-rose-800 font-bold";
                  else if (academicPeriods > 0) badgeStyle = "bg-blue-100 text-blue-800 font-semibold";

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTeacherId(t.id)}
                      className={`p-3 cursor-pointer flex items-center justify-between gap-2 text-xs transition ${
                        isSelected
                          ? "bg-blue-50 border-l-4 border-l-blue-600 shadow-2xs"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {getTeacherFullName(t)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>{dept?.name}</span>
                          {lockCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-medium">
                              ล็อค {lockCount} คาบ
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {academicPeriods === 0 && activityPeriods > 0 ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800 font-semibold">
                            สอน 0 (+{activityPeriods} กิจกรรม)
                          </span>
                        ) : academicPeriods > 0 ? (
                          <span className={`px-2 py-0.5 rounded text-xs ${badgeStyle}`}>
                            {academicPeriods} คาบ{activityPeriods > 0 ? ` (+${activityPeriods})` : ""}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500">
                            0 คาบ
                          </span>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {roomCount > 0 ? `${roomCount} ห้อง` : "ยังไม่มีคาบ"}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Teacher Banner, Add Subject & Rooms Form, Assignments Table */}
          <div className="lg:col-span-8 space-y-4">
            {activeTeacher ? (
              <>
                {/* Active Teacher Banner + Stepper Navigation */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-5 h-5 text-blue-600" />
                        <h2 className="text-base font-bold text-slate-900">
                          {getTeacherFullName(activeTeacher)} ({activeTeacher.code})
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          กลุ่มสาระ{dataset.departments.find((d) => d.id === activeTeacher.departmentId)?.name}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        ระบุวิชาที่สอน ห้องเรียนที่สอน (เรียง 1-10) และใส่เงื่อนไขเฉพาะห้อง เช่น วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/teachers`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        title="เปิดตารางล็อคคาบไม่ว่างของครูท่านนี้"
                      >
                        <Lock className="w-3.5 h-3.5 text-rose-600" />
                        <span>ล็อคคาบไม่สอน ({activeTeacher.unavailableSlots.length})</span>
                      </Link>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handlePrevTeacher}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
                          title="ครูคนก่อนหน้า"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleNextTeacher}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
                          title="ครูคนถัดไป"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Period Stats Strip for active teacher */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                    <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200">
                      <span className="text-slate-600 font-medium">วิชาที่สอน:</span>
                      <div className="text-lg font-bold text-blue-900 mt-0.5">
                        {((activeTeacherWorkload?.teachingPeriods || 0) +
                          (activeTeacherWorkload?.electivePeriods || 0))}{" "}
                        คาบ / สัปดาห์
                      </div>
                      {(activeTeacherWorkload?.electivePeriods || 0) > 0 && (
                        <div className="text-[10px] text-blue-700 font-medium mt-0.5">
                          (วิชาพื้นฐาน/เพิ่มเติม {activeTeacherWorkload?.teachingPeriods} + วิชาเลือก {activeTeacherWorkload?.electivePeriods})
                        </div>
                      )}
                    </div>
                    <div className="p-3 rounded-lg bg-purple-50/70 border border-purple-200">
                      <span className="text-purple-900 font-medium">กิจกรรม/ระดับชั้น:</span>
                      <div className="text-lg font-bold text-purple-950 mt-0.5">
                        {(activeTeacherWorkload?.activityPeriods || 0) +
                          (activeTeacherWorkload?.advisorPeriods || 0)}{" "}
                        คาบ
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-600 font-medium">ภาระงานสอนรวม:</span>
                      <div className="text-lg font-bold text-slate-900 mt-0.5">
                        {activeTeacherTotalPeriods} คาบ (สอน {activeTeacherClassroomCount} ห้อง)
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-600 font-medium">คาบล็อคไม่ว่าง/ประชุม:</span>
                      <div className="text-lg font-bold text-amber-800 mt-0.5">
                        {activeTeacher.unavailableSlots.length + (activeTeacherWorkload?.meetingPeriods || 0)} คาบ
                      </div>
                    </div>
                  </div>
                </div>

                {/* =================================================================== */}
                {/* 2. บันทึกวิชาที่ครูสอน พร้อมระบุว่าสอนห้องใดบ้าง แล้วบันทึก */}
                {/* =================================================================== */}
                <form
                  onSubmit={handleSaveTeacherAssignments}
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 text-xs"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-blue-600" />
                      2. บันทึกวิชาที่ {activeTeacher.prefix}{activeTeacher.firstName} สอน พร้อมระบุห้องเรียน
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSubjectCatalogModal(true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                        <span>📚 จัดการคลังรายวิชาทั้งหมด ({dataset.subjects.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingNewSubject((prev) => !prev)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition ${
                          isCreatingNewSubject
                            ? "bg-amber-50 text-amber-900 border-amber-300"
                            : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>{isCreatingNewSubject ? "✕ ปิดฟอร์มสร้างวิชาใหม่" : "+ พิมพ์สร้างรายวิชาใหม่ทันที"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Inline Form: Create New Subject */}
                  {isCreatingNewSubject && (
                    <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3">
                      <div className="font-bold text-blue-900 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-blue-700" />
                        <span>สร้างรายวิชาใหม่ลงคลังทันที (ไม่ต้องสลับหน้า)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            รหัสวิชา <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newSubCode}
                            onChange={(e) => setNewSubCode(e.target.value)}
                            placeholder="เช่น ว21101"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block font-semibold text-slate-700 mb-1">
                            ชื่อรายวิชา <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newSubName}
                            onChange={(e) => setNewSubName(e.target.value)}
                            placeholder="เช่น วิทยาศาสตร์ 1 (ฟิสิกส์พื้นฐาน)"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">กลุ่มสาระ</label>
                          <select
                            value={newSubDeptId}
                            onChange={(e) => setNewSubDeptId(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5"
                          >
                            {dataset.departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">ประเภทวิชา</label>
                          <select
                            value={newSubType}
                            onChange={(e) => setNewSubType(e.target.value as SubjectType)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5"
                          >
                            {Object.entries(SUBJECT_TYPE_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block font-semibold text-slate-700 mb-1">ห้องปฏิบัติการหลัก (ถ้ามี)</label>
                          <select
                            value={newSubRoomId}
                            onChange={(e) => setNewSubRoomId(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5"
                          >
                            <option value="">ห้องประจำชั้นนักเรียน</option>
                            {dataset.rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.code} - {r.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-bold text-slate-800">
                          จำนวนคาบสอนของวิชานี้ (คาบคู่ / คาบเดี่ยว):
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-700">คาบคู่ (2 คาบ):</span>
                            <button
                              type="button"
                              onClick={() => setNewSubDoubleCount(Math.max(0, newSubDoubleCount - 1))}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
                            >
                              -
                            </button>
                            <span className="w-5 text-center font-bold text-blue-900">{newSubDoubleCount}</span>
                            <button
                              type="button"
                              onClick={() => setNewSubDoubleCount(newSubDoubleCount + 1)}
                              className="w-6 h-6 rounded bg-blue-50 hover:bg-blue-100 font-bold text-blue-700 flex items-center justify-center"
                            >
                              +
                            </button>
                            <span className="text-slate-500">ครั้ง</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-700">คาบเดี่ยว (1 คาบ):</span>
                            <button
                              type="button"
                              onClick={() => setNewSubSingleCount(Math.max(0, newSubSingleCount - 1))}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
                            >
                              -
                            </button>
                            <span className="w-5 text-center font-bold text-blue-900">{newSubSingleCount}</span>
                            <button
                              type="button"
                              onClick={() => setNewSubSingleCount(newSubSingleCount + 1)}
                              className="w-6 h-6 rounded bg-blue-50 hover:bg-blue-100 font-bold text-blue-700 flex items-center justify-center"
                            >
                              +
                            </button>
                            <span className="text-slate-500">คาบ</span>
                          </div>

                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                            รวม {newSubDoubleCount * 2 + newSubSingleCount * 1} คาบ/สัปดาห์
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleCreateNewSubject}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold transition shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>บันทึกวิชาใหม่ลงคลัง และเลือกสอนทันที</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 1: Select Subject */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-semibold text-slate-700">
                        เลือกรายวิชาที่สอน <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        {tSelectedSubjectId && (
                          <button
                            type="button"
                            onClick={() => {
                              const sub = dataset.subjects.find((s) => s.id === tSelectedSubjectId);
                              if (sub) handleOpenEditSubject(sub);
                            }}
                            className="text-[11px] text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1 font-bold transition"
                          >
                            <Pencil className="w-3 h-3 text-blue-600" />
                            <span>แก้ไขข้อมูลวิชานี้ (รหัส/ชื่อ/คาบ/เงื่อนไข)</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowSubjectCatalogModal(true)}
                          className="text-[11px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1 font-semibold transition"
                        >
                          <BookOpen className="w-3 h-3 text-slate-500" />
                          <span>ดูทุกวิชา ({dataset.subjects.length})</span>
                        </button>
                      </div>
                    </div>
                    <SearchableSubjectSelect
                      subjects={dataset.subjects}
                      departments={dataset.departments}
                      value={tSelectedSubjectId}
                      onChange={handleSelectTeacherSubject}
                      preferredDepartmentId={activeTeacher.departmentId}
                      placeholder="-- เลือกรายวิชาที่สอน --"
                    />
                  </div>

                  {/* Step 2: Multi-select Classrooms with Grade Tabs (ข้อ 4: เรียงลำดับห้อง 1-10 เสมอ!) */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="font-semibold text-slate-700">
                        เลือกห้องเรียนที่สอนในวิชานี้ (เรียงห้อง 1–10 ตามระดับชั้น): <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const availableRoomsInGrade = activeGradeSortedRooms
                            .filter((c) => !assignedClassroomsForSelectedSubject.has(c.id))
                            .map((c) => c.id);
                          return (
                            <button
                              type="button"
                              disabled={availableRoomsInGrade.length === 0}
                              onClick={() => {
                                if (availableRoomsInGrade.length === 0) return;
                                const allSelected = availableRoomsInGrade.every((id) =>
                                  tSelectedClassroomIds.includes(id)
                                );
                                if (allSelected) {
                                  setTSelectedClassroomIds((prev) =>
                                    prev.filter((id) => !availableRoomsInGrade.includes(id))
                                  );
                                } else {
                                  setTSelectedClassroomIds((prev) =>
                                    Array.from(new Set([...prev, ...availableRoomsInGrade]))
                                  );
                                }
                              }}
                              className={`px-2.5 py-1 rounded-md font-bold text-[11px] ${
                                availableRoomsInGrade.length === 0
                                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                              }`}
                            >
                              เลือก/ยกเลิกห้องที่เหลือในระดับชั้นนี้ ({availableRoomsInGrade.length})
                            </button>
                          );
                        })()}
                        {tSelectedClassroomIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setTSelectedClassroomIds([])}
                            className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 text-[11px]"
                          >
                            ล้างที่เลือก ({tSelectedClassroomIds.length} ห้อง)
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Grade Level Tabs */}
                    <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
                      {dataset.gradeLevels.map((g) => {
                        const active = tSelectedGradeTab === g.id;
                        const roomsInGrade = dataset.classrooms.filter((c) => c.gradeLevelId === g.id);
                        const selectedInGrade = roomsInGrade.filter((c) =>
                          tSelectedClassroomIds.includes(c.id)
                        ).length;
                        const remainingInGrade = roomsInGrade.filter(
                          (c) => !assignedClassroomsForSelectedSubject.has(c.id)
                        ).length;

                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setTSelectedGradeTab(g.id)}
                            className={`flex-1 py-1.5 rounded-md text-center transition ${
                              active ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            <span>{g.name}</span>
                            {selectedInGrade > 0 && (
                              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px]">
                                {selectedInGrade}
                              </span>
                            )}
                            {tSelectedSubjectId && remainingInGrade === 0 && roomsInGrade.length > 0 && (
                              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 text-[10px]">
                                ครบ
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {tSelectedSubjectId && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] px-1">
                        <div className="flex items-center gap-3 text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-xs bg-white border border-slate-300 inline-block" />
                            <span>ยังไม่ได้ลงวิชานี้</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" />
                            <span>กำลังเลือก</span>
                          </span>
                          <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                            <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 inline-block" />
                            <span>ลงวิชานี้แล้ว (เลือกซ้ำไม่ได้)</span>
                          </span>
                        </div>
                        <span className="text-slate-500 font-medium">
                          ระดับชั้นนี้: ลงแล้ว{" "}
                          <strong className="text-rose-600">
                            {activeGradeSortedRooms.filter((c) => assignedClassroomsForSelectedSubject.has(c.id)).length}
                          </strong>{" "}
                          / เหลือ{" "}
                          <strong className="text-emerald-700">
                            {activeGradeSortedRooms.filter((c) => !assignedClassroomsForSelectedSubject.has(c.id)).length}
                          </strong>{" "}
                          ห้อง
                        </span>
                      </div>
                    )}

                    {/* Classrooms Grid: Strictly sorted 1 to 10 (ม.X/1 to ม.X/10) */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                      {activeGradeSortedRooms.map((cls) => {
                        const existingAsgs = assignedClassroomsForSelectedSubject.get(cls.id) || [];
                        const isAlreadyAssigned = existingAsgs.length > 0;
                        const isSelected = !isAlreadyAssigned && tSelectedClassroomIds.includes(cls.id);
                        const audit = readinessReport.classroomAudits.find((a) => a.classroomId === cls.id);
                        const totalAssigned = audit?.totalPlannedPeriods ?? 0;

                        const assignedTeacherNames = isAlreadyAssigned
                          ? existingAsgs
                              .flatMap((a) => a.teacherIds)
                              .map((tid) => {
                                const t = teachersMap.get(tid);
                                return t ? `${t.prefix}${t.firstName}` : tid;
                              })
                              .filter((v, i, arr) => arr.indexOf(v) === i)
                              .join(", ")
                          : "";

                        return (
                          <button
                            key={cls.id}
                            type="button"
                            disabled={isAlreadyAssigned}
                            title={
                              isAlreadyAssigned
                                ? `ห้อง ${cls.name} ลงวิชานี้แล้ว (${assignedTeacherNames || "มีผู้สอนแล้ว"}) ไม่สามารถเลือกซ้ำได้`
                                : `เลือกห้อง ${cls.name}`
                            }
                            onClick={() => {
                              if (isAlreadyAssigned) return;
                              setTSelectedClassroomIds((prev) =>
                                isSelected ? prev.filter((x) => x !== cls.id) : [...prev, cls.id]
                              );
                            }}
                            className={`p-2.5 rounded-lg border text-left transition ${
                              isAlreadyAssigned
                                ? "bg-rose-600 text-white border-rose-700 cursor-not-allowed opacity-90"
                                : isSelected
                                  ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                  : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"
                            }`}
                          >
                            <div className="font-bold flex items-center justify-between gap-1">
                              <span className="text-sm font-mono">{cls.name}</span>
                              {isAlreadyAssigned ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-800/80 text-white">
                                  ลงแล้ว
                                </span>
                              ) : isSelected ? (
                                <span>✓</span>
                              ) : (
                                <span className="text-[10px] text-slate-400">#{cls.roomNumber}</span>
                              )}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 truncate ${
                                isAlreadyAssigned
                                  ? "text-rose-100"
                                  : isSelected
                                    ? "text-blue-100"
                                    : "text-slate-500"
                              }`}
                            >
                              {isAlreadyAssigned
                                ? assignedTeacherNames || "มีผู้สอนแล้ว"
                                : `ยอดคาบ: ${totalAssigned}/40`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 3: กำหนดคาบสอน (คาบเดี่ยว / คาบคู่) (ข้อ 5) */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span>กำหนดจำนวนคาบสอนของวิชานี้ (คาบคู่ / คาบเดี่ยว)</span>
                      </div>
                      {tSplitSummary && (
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200">
                          {tSplitSummary}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* คาบคู่ */}
                      <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between shadow-2xs">
                        <div>
                          <div className="font-bold text-slate-800 text-xs">สอนคาบคู่ (2 คาบติดกัน)</div>
                          <div className="text-[10px] text-slate-500">เช่น คาบ 1-2 หรือ คาบ 3-4</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setTDoubleCount(Math.max(0, tDoubleCount - 1))}
                            className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-sm transition"
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-bold text-sm text-blue-900">{tDoubleCount}</span>
                          <button
                            type="button"
                            onClick={() => setTDoubleCount(tDoubleCount + 1)}
                            className="w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 font-bold text-blue-700 flex items-center justify-center text-sm transition"
                          >
                            +
                          </button>
                          <span className="text-xs text-slate-600 font-medium">ครั้ง</span>
                        </div>
                      </div>

                      {/* คาบเดี่ยว */}
                      <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between shadow-2xs">
                        <div>
                          <div className="font-bold text-slate-800 text-xs">สอนคาบเดี่ยว (1 คาบ)</div>
                          <div className="text-[10px] text-slate-500">บล็อกละ 1 คาบ</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setTSingleCount(Math.max(0, tSingleCount - 1))}
                            className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-sm transition"
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-bold text-sm text-blue-900">{tSingleCount}</span>
                          <button
                            type="button"
                            onClick={() => setTSingleCount(tSingleCount + 1)}
                            className="w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 font-bold text-blue-700 flex items-center justify-center text-sm transition"
                          >
                            +
                          </button>
                          <span className="text-xs text-slate-600 font-medium">คาบ</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 4 & 5: Room, Co-teacher */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        ห้องเรียนที่ใช้สอน (ข้อ 18)
                      </label>
                      <select
                        value={tRoomId}
                        onChange={(e) => setTRoomId(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                      >
                        <option value="">ห้องประจำชั้นของนักเรียน</option>
                        {dataset.rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code} - {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-semibold text-slate-700">
                          ครูสอนร่วมเพิ่มเติม (ข้อ 3: มีสอนร่วมมากกว่า 2 คนได้)
                        </label>
                        {tCoTeacherIds.length > 0 && (
                          <span className="text-[11px] text-blue-700 font-bold">
                            สอนร่วม {tCoTeacherIds.length} ท่าน
                          </span>
                        )}
                      </div>

                      {tCoTeacherIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5 p-1.5 bg-blue-50/60 rounded-lg border border-blue-200">
                          {tCoTeacherIds.map((tid) => {
                            const t = dataset.teachers.find((x) => x.id === tid);
                            return (
                              <span
                                key={tid}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-blue-200 text-blue-900 text-xs font-semibold shadow-2xs"
                              >
                                {t ? getTeacherFullName(t) : tid}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTCoTeacherIds((prev) => prev.filter((id) => id !== tid))
                                  }
                                  className="text-slate-400 hover:text-rose-600 font-bold ml-1"
                                >
                                  ✕
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <SearchableTeacherSelect
                        teachers={dataset.teachers}
                        departments={dataset.departments}
                        value=""
                        onChange={(tid) => {
                          if (tid && !tCoTeacherIds.includes(tid)) {
                            setTCoTeacherIds((prev) => [...prev, tid]);
                          }
                        }}
                        placeholder="+ ค้นหา/เลือกครูสอนร่วมเพิ่มเติม (คนที่ 2, 3...)"
                        excludeIds={[activeTeacher.id, ...tCoTeacherIds]}
                        allowEmpty
                        emptyLabel="-- ไม่เลือก --"
                        size="sm"
                      />
                    </div>
                  </div>

                  {/* Step 6: Joint Class (เรียนพร้อมกันหลายห้อง - วิชาเลือก) (ข้อ 1) */}
                  {tSelectedClassroomIds.length > 1 && (
                    <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-purple-950">
                        <input
                          type="checkbox"
                          checked={tIsJointClass}
                          onChange={(e) => setTIsJointClass(e.target.checked)}
                          className="rounded border-purple-300 text-purple-600 w-4 h-4"
                        />
                        <span>นักเรียนเรียนพร้อมกันหลายห้อง (วิชาเลือก / รวมกลุ่มห้องเรียน) (ข้อ 1)</span>
                      </label>
                      <p className="text-[11px] text-purple-800 mt-1 pl-6">
                        {tIsJointClass
                          ? `✓ นักเรียนทั้ง ${tSelectedClassroomIds.length} ห้องจะเรียนพร้อมกันในคาบเดียวกัน โดยเวลานับภาระงานสอนครูจะนับเพียง ${
                              tSplitSummary ? tSplitSummary.split(" ")[1] : "ตามคาบสอนจริง"
                            } คาบ (ไม่คูณจำนวนห้อง)`
                          : "แยกสอนคนละคาบตามปกติ (นับภาระงานคูณจำนวนห้องเรียน)"}
                      </p>
                    </div>
                  )}

                  {/* Step 7: Subgroup Split (วิชาแยกกลุ่ม / แยกแผนการเรียนในห้องเดียว เช่น ม.4/7 แบ่งแผนคณิต/ภาษา) */}
                  {tSelectedClassroomIds.length === 1 && (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-950">
                        <input
                          type="checkbox"
                          checked={tIsSubgroup}
                          onChange={(e) => {
                            setTIsSubgroup(e.target.checked);
                            if (e.target.checked && !tSubgroupSyncId) {
                              setTSubgroupSyncId(`subgroup_${tSelectedClassroomIds[0]}_${Date.now()}`);
                            }
                          }}
                          className="rounded border-emerald-300 text-emerald-600 w-4 h-4"
                        />
                        <span>📌 วิชาแยกกลุ่ม / แยกแผนการเรียนในห้องเดียว (เช่น ม.4/7 ครึ่งห้องเรียนคณิต อีกครึ่งเรียนภาษา)</span>
                      </label>
                      {tIsSubgroup && (
                        <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                              ชื่อกลุ่มย่อย / แผนการเรียน:
                            </label>
                            <input
                              type="text"
                              placeholder="เช่น แผนคณิต, แผนภาษา, กลุ่ม 1"
                              value={tSubgroupName}
                              onChange={(e) => setTSubgroupName(e.target.value)}
                              className="w-full text-xs px-2.5 py-1.5 border border-emerald-300 rounded bg-white text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                              กลุ่มเชื่อมโยงคู่ขนาน (เรียนเวลาเดียวกัน):
                            </label>
                            {(() => {
                              const roomSubgroups = dataset.teachingAssignments.filter(
                                (a) => a.classroomId === tSelectedClassroomIds[0] && a.isSubgroup && a.subgroupSyncId
                              );
                              const distinctSyncIds = Array.from(new Set(roomSubgroups.map((a) => a.subgroupSyncId!)));
                              return (
                                <div className="space-y-1.5">
                                  {distinctSyncIds.length > 0 && (
                                    <select
                                      value={distinctSyncIds.includes(tSubgroupSyncId) ? tSubgroupSyncId : "new"}
                                      onChange={(e) => {
                                        if (e.target.value === "new") {
                                          setTSubgroupSyncId(`subgroup_${tSelectedClassroomIds[0]}_${Date.now()}`);
                                        } else {
                                          setTSubgroupSyncId(e.target.value);
                                        }
                                      }}
                                      className="w-full text-xs px-2 py-1 border border-emerald-300 rounded bg-white text-slate-800 font-medium"
                                    >
                                      <option value="new">+ สร้างกลุ่มคู่ขนานใหม่</option>
                                      {distinctSyncIds.map((syncId) => {
                                        const paired = roomSubgroups.find((a) => a.subgroupSyncId === syncId);
                                        const subName = paired?.subgroupName || "วิชาคู่ขนาน";
                                        const subSub = paired ? subjectsMap.get(paired.subjectId)?.name : "";
                                        return (
                                          <option key={syncId} value={syncId}>
                                            จับคู่กับ: {subName} ({subSub})
                                          </option>
                                        );
                                      })}
                                    </select>
                                  )}
                                  <input
                                    type="text"
                                    value={tSubgroupSyncId}
                                    onChange={(e) => setTSubgroupSyncId(e.target.value)}
                                    placeholder="รหัสเชื่อมโยง (Sync ID)"
                                    className="w-full text-xs px-2.5 py-1 border border-emerald-300 rounded bg-white text-slate-700 font-mono text-[11px]"
                                  />
                                </div>
                              );
                            })()}
                          </div>
                          <p className="sm:col-span-2 text-[11px] text-emerald-800">
                            💡 ระบบจะจัดวิชาในกลุ่มเชื่อมโยงนี้ให้ลงใน <strong>วันและคาบเดียวกันพอดี</strong> โดยครูแต่ละท่านจะเข้าสอนกลุ่มของตนเอง และยอดคาบเรียนของห้องจะนับเพียงครั้งเดียว (ไม่นับคาบซ้ำ)
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={tSelectedClassroomIds.length === 0}
                      className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold transition shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        บันทึกวิชาและห้องที่สอนให้ {activeTeacher.prefix}{activeTeacher.firstName} (
                        {tSelectedClassroomIds.length} ห้อง)
                      </span>
                    </button>
                  </div>
                </form>

                {/* =================================================================== */}
                {/* 3. ตารางวิชาที่ครูสอน + ปุ่มใส่เงื่อนไขเฉพาะห้อง (ข้อ 3) */}
                {/* =================================================================== */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-blue-600" />
                      <span>
                        รายการวิชาและห้องที่ {getTeacherFullName(activeTeacher)} สอน ({activeTeacherAssignments.length} รายการ)
                      </span>
                    </div>
                    <div className="font-bold text-blue-700">
                      รวมทั้งหมด {activeTeacherTotalPeriods} คาบ/สัปดาห์
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 text-left w-24">ห้องเรียน</th>
                          <th className="py-2.5 px-3 text-left">รหัส / ชื่อวิชา</th>
                          <th className="py-2.5 px-3 text-center w-28">คาบ (แตกคาบ)</th>
                          <th className="py-2.5 px-3 text-left">ห้องที่ใช้</th>
                          <th className="py-2.5 px-3 text-left">ครูสอนร่วม</th>
                          <th className="py-2.5 px-3 text-left">เงื่อนไขเฉพาะห้อง (ข้อ 3)</th>
                          <th className="py-2.5 px-3 text-right w-16">ลบ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {activeTeacherAssignments.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400">
                              ครูท่านนี้ยังไม่มีรายการวิชาที่ได้รับมอบหมายสอน กรอกแบบฟอร์มด้านบนเพื่อเพิ่มวิชาสอน
                            </td>
                          </tr>
                        ) : (
                          // Sort assignments by classroom name naturally (1 to 10)
                          [...activeTeacherAssignments]
                            .sort((a, b) => {
                              const clsA = classroomsMap.get(a.classroomId);
                              const clsB = classroomsMap.get(b.classroomId);
                              if (clsA && clsB) {
                                return sortClassrooms([clsA, clsB])[0].id === clsA.id ? -1 : 1;
                              }
                              return a.classroomId.localeCompare(b.classroomId);
                            })
                            .map((asg) => {
                              const cls = classroomsMap.get(asg.classroomId);
                              const sub = subjectsMap.get(asg.subjectId);
                              const coTeachers = asg.teacherIds
                                .filter((tid) => tid !== activeTeacher.id)
                                .map((tid) => teachersMap.get(tid))
                                .filter(Boolean);
                              const spec = asg.specificRule;
                              const isPinned = Boolean(spec?.fixedDay && spec?.fixedStartPeriod);
                              const isJoint = asg.isJointClass || sub?.subjectType === "elective";

                              return (
                                <tr key={asg.id} className="hover:bg-slate-50">
                                  <td className="py-2.5 px-3 font-bold text-slate-900 font-mono">
                                    <div className="flex flex-col gap-0.5 items-start">
                                      <span
                                        className={`px-2 py-0.5 rounded border ${
                                          isJoint
                                            ? "bg-purple-100 text-purple-900 border-purple-200"
                                            : asg.isSubgroup
                                            ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                                            : "bg-slate-100 text-slate-800 border-slate-200"
                                        }`}
                                      >
                                        {cls?.name ?? asg.classroomId}
                                      </span>
                                      {isJoint && (
                                        <span className="text-[10px] text-purple-700 font-medium">
                                          (เรียนพร้อมกัน)
                                        </span>
                                      )}
                                      {asg.isSubgroup && asg.subgroupName && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 mt-0.5">
                                          [{asg.subgroupName}]
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono font-bold text-slate-800">
                                        {sub?.code}
                                      </span>
                                      <span className="font-medium text-slate-900">{sub?.name}</span>
                                      {sub?.subjectType === "elective" && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-bold">
                                          วิชาเลือก
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono">
                                    <span className="font-bold text-blue-700">{asg.periodsPerWeek}</span> คาบ (
                                    {asg.splitSessions.map((s) => s.duration).join("+")})
                                    {isJoint && (
                                      <div className="text-[10px] text-purple-700 font-medium mt-0.5">
                                        (นับภาระ {asg.periodsPerWeek} คาบ)
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600">
                                    {asg.splitSessions.map((sp, idx) => {
                                      const rmId = spec?.customRoomId ?? sp.roomId;
                                      const rm = rmId ? roomsMap.get(rmId) : undefined;
                                      return (
                                        <span key={idx} className="mr-1">
                                          {rm ? (
                                            <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-mono">
                                              {rm.code}
                                            </span>
                                          ) : (
                                            "ห้องนักเรียน"
                                          )}
                                        </span>
                                      );
                                    })}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600">
                                    {coTeachers.length > 0 ? (
                                      <span className="font-medium text-purple-700">
                                        {coTeachers.map((ct) => `${ct?.prefix}${ct?.firstName}`).join(", ")}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenRuleModal(asg)}
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                                        isPinned
                                          ? "bg-purple-100 text-purple-900 border-purple-300 font-bold shadow-2xs"
                                          : spec
                                          ? "bg-amber-50 text-amber-900 border-amber-300"
                                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                                      }`}
                                    >
                                      {isPinned ? (
                                        <>
                                          <Pin className="w-3.5 h-3.5 text-purple-700" />
                                          <span>
                                            ล็อค: {spec?.fixedDay === "MON" ? "จันทร์" : spec?.fixedDay === "TUE" ? "อังคาร" : spec?.fixedDay === "WED" ? "พุธ" : spec?.fixedDay === "THU" ? "พฤหัส" : "ศุกร์"} คาบ {spec?.fixedStartPeriod}
                                          </span>
                                        </>
                                      ) : spec ? (
                                        <>
                                          <Settings className="w-3.5 h-3.5 text-amber-700" />
                                          <span>มีเงื่อนไขเพิ่มเติม</span>
                                        </>
                                      ) : (
                                        <>
                                          <Settings className="w-3.5 h-3.5 text-slate-400" />
                                          <span>ตั้งเงื่อนไขห้องนี้</span>
                                        </>
                                      )}
                                    </button>
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditAssignmentModal(asg)}
                                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                                        title="แก้ไขข้อมูลวิชานี้ (ข้อ 4)"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (confirm(`ต้องการลบวิชา ${sub?.name} ของห้อง ${cls?.name} หรือไม่?`)) {
                                            deleteAssignment(asg.id);
                                          }
                                        }}
                                        className="text-slate-400 hover:text-rose-600 transition p-1"
                                        title="ลบภาระงานสอนนี้"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ข้อ 2: คาบกิจกรรมโรงเรียน / คาบประจำระดับชั้น / วิชาเลือกที่ครูท่านนี้มีส่วนร่วม */}
                  {activeTeacherSyncBlocks.length > 0 && (
                    <div className="bg-purple-50/70 p-4 rounded-xl border border-purple-200 space-y-2 mt-4">
                      <div className="font-bold text-xs text-purple-950 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-purple-600" />
                          คาบกิจกรรมโรงเรียน / คาบประจำระดับชั้น / วิชาเลือกที่ครูท่านนี้มีส่วนร่วม ({activeTeacherSyncBlocks.length} รายการ):
                        </span>
                        <Link href="/special-blocks" className="text-purple-700 underline text-[11px] font-semibold">
                          แก้ไขในเมนูคาบล็อค & วิชาเลือก →
                        </Link>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {activeTeacherSyncBlocks.map((b) => {
                          const isAdvisor =
                            b.bindAdvisorsAutomatically ||
                            b.blockType === "moral_assembly" ||
                            b.blockType === "homeroom" ||
                            (b.category === "grade" &&
                              b.classroomIds?.some((cid) =>
                                dataset.classrooms.find((c) => c.id === cid)?.advisorTeacherIds.includes(activeTeacher.id)
                              ));
                          const isAll = b.bindAllTeachers || b.category === "school" || b.blockType === "school_lock";
                          const inOffering = b.offerings?.some((o) => o.teacherIds.includes(activeTeacher.id));

                          return (
                            <div
                              key={b.id}
                              className="bg-white p-3 rounded-lg border border-purple-200 shadow-2xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">
                                  {b.title} {b.subjectCode ? `(${b.subjectCode})` : ""}
                                </span>
                                <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded">
                                  {b.duration} คาบ
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600">
                                {b.isTimeLocked && b.fixedDay && b.fixedStartPeriod
                                  ? `ล็อคเวลา: ${DAY_LABELS[b.fixedDay]?.full} คาบ ${b.fixedStartPeriod}`
                                  : "ไม่ล็อคเวลา (Solver จัดให้)"}
                              </div>
                              <div className="text-[10px] text-purple-900 font-medium">
                                บทบาท:{" "}
                                {isAll
                                  ? "ครูทุกคนในโรงเรียนเข้ากิจกรรม"
                                  : isAdvisor
                                  ? "ครูที่ปรึกษาประจำระดับชั้น"
                                  : inOffering
                                  ? "ผู้สอนประจำวิชาเลือก"
                                  : "ครูผู้รับผิดชอบ"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* คาบประชุมฝ่ายของครูท่านนี้ */}
                  {activeTeacherMeetings.length > 0 && (
                    <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-2 mt-4">
                      <div className="font-bold text-xs text-amber-950 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-amber-600" />
                          คาบประชุมฝ่ายที่ต้องเข้าร่วม ({activeTeacherMeetings.length} รายการ - ไม่นับเป็นคาบสอน):
                        </span>
                        <Link href="/special-blocks" className="text-amber-800 underline text-[11px] font-semibold">
                          จัดการคาบประชุมฝ่าย →
                        </Link>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {activeTeacherMeetings.map((m) => (
                          <div
                            key={m.id}
                            className="bg-white p-3 rounded-lg border border-amber-200 shadow-2xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{m.title}</span>
                              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">
                                {m.duration} คาบ
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600">
                              วัน{DAY_LABELS[m.day]?.full} คาบ {m.startPeriod} ({m.divisionName || "ฝ่าย"})
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white p-12 text-center text-slate-400 rounded-xl border border-slate-200">
                กรุณาเลือกรายชื่อครูผู้สอนจากแถบด้านซ้ายเพื่อจัดการภาระงานสอน
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* โหมด 2: ลงคาบสอนรายห้อง (Classroom-Centric View) */}
      {/* ========================================================================= */}
      {viewMode === "by_classroom" && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              ลงภาระงานสอนรายห้องเรียน (จัดวิชาลงห้อง)
            </h2>

            <form onSubmit={handleAddClassroomAssignments} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">กลุ่มสาระการเรียนรู้</label>
                  <select
                    value={filterDeptId}
                    onChange={(e) => setFilterDeptId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                  >
                    <option value="ALL">ทุกกลุ่มสาระการเรียนรู้</option>
                    {dataset.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        กลุ่มสาระ{d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    รายวิชาที่สอน <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={cSelectedSubjectId}
                    onChange={(e) => {
                      setCSelectedSubjectId(e.target.value);
                      const s = dataset.subjects.find((sub) => sub.id === e.target.value);
                      if (s) {
                        setCSplitText(s.defaultSplitPattern.join(","));
                        setCSpecialRoomId(s.defaultRoomId || "");
                      }
                    }}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                  >
                    {cAvailableSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name} ({s.defaultPeriodsPerWeek} คาบ)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ครูผู้สอนหลัก <span className="text-rose-500">*</span>
                  </label>
                  <SearchableTeacherSelect
                    teachers={dataset.teachers}
                    departments={dataset.departments}
                    value={cPrimaryTeacherId}
                    onChange={setCPrimaryTeacherId}
                    placeholder="-- ค้นหา/เลือกครูผู้สอน --"
                  />
                </div>
              </div>

              {/* Classroom select grid sorted 1 to 10 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-700">
                    เลือกห้องเรียนที่สอน (คลิกเลือกได้หลายห้อง): <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (cSelectedClassroomIds.length === dataset.classrooms.length) {
                        setCSelectedClassroomIds([]);
                      } else {
                        setCSelectedClassroomIds(dataset.classrooms.map((c) => c.id));
                      }
                    }}
                    className="text-blue-600 hover:underline text-[11px] font-semibold"
                  >
                    {cSelectedClassroomIds.length === dataset.classrooms.length ? "ล้างทั้งหมด" : "เลือกทุกห้องในโรงเรียน"}
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-10 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  {sortClassrooms(dataset.classrooms).map((cls) => {
                    const sel = cSelectedClassroomIds.includes(cls.id);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => {
                          setCSelectedClassroomIds((prev) =>
                            sel ? prev.filter((id) => id !== cls.id) : [...prev, cls.id]
                          );
                        }}
                        className={`p-2 rounded-lg border text-center transition font-mono ${
                          sel ? "bg-purple-600 text-white border-purple-600 font-bold" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        {cls.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">รูปแบบแตกคาบ</label>
                  <input
                    type="text"
                    value={cSplitText}
                    onChange={(e) => setCSplitText(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ห้องเรียนที่ใช้</label>
                  <select
                    value={cSpecialRoomId}
                    onChange={(e) => setCSpecialRoomId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                  >
                    <option value="">ห้องประจำชั้นของนักเรียน</option>
                    {dataset.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ครูสอนร่วม (ถ้ามี)</label>
                  <SearchableTeacherSelect
                    teachers={dataset.teachers}
                    departments={dataset.departments}
                    value={cCoTeacherId}
                    onChange={setCCoTeacherId}
                    placeholder="-- ไม่มี --"
                    excludeIds={cPrimaryTeacherId ? [cPrimaryTeacherId] : []}
                    allowEmpty
                    emptyLabel="-- ไม่มี --"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={cSelectedClassroomIds.length === 0}
                  className="px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-bold transition shadow-xs"
                >
                  บันทึกภาระงานสอน ({cSelectedClassroomIds.length} ห้อง)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Specific Classroom Rule (ข้อ 3: วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์) */}
      {/* ========================================================================= */}
      {editingRuleAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Pin className="w-4 h-4 text-purple-600" />
                  ตั้งเงื่อนไขเฉพาะห้อง: {subjectsMap.get(editingRuleAssignment.subjectId)?.name} (
                  {classroomsMap.get(editingRuleAssignment.classroomId)?.name})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  กำหนดเงื่อนไขพิเศษสำหรับห้องนี้โดยเฉพาะ เช่น ต้องการเรียนวันจันทร์ คาบ 1 หรือเน้นคาบเช้า
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRuleAssignment(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Rule Section 1: Pinned Day and Period (เช่น วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์) */}
              <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-purple-950 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ruleIsPinned}
                      onChange={(e) => setRuleIsPinned(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                    />
                    <span>📍 ล็อควันและคาบตายตัว (Pinned Slot) สำหรับห้องนี้</span>
                  </label>
                  {ruleIsPinned && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-200 text-purple-900">
                      บังคับลงตำแหน่งนี้
                    </span>
                  )}
                </div>

                {ruleIsPinned && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">วันในสัปดาห์</label>
                      <select
                        value={ruleDay}
                        onChange={(e) => setRuleDay(e.target.value as DayOfWeek)}
                        className="w-full bg-white border border-purple-300 rounded-lg px-2.5 py-1.5 font-bold"
                      >
                        <option value="MON">วันจันทร์ (MON)</option>
                        <option value="TUE">วันอังคาร (TUE)</option>
                        <option value="WED">วันพุธ (WED)</option>
                        <option value="THU">วันพฤหัสบดี (THU)</option>
                        <option value="FRI">วันศุกร์ (FRI)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">เริ่มที่คาบเรียน</label>
                      <select
                        value={ruleStartPeriod}
                        onChange={(e) => setRuleStartPeriod(parseInt(e.target.value, 10))}
                        className="w-full bg-white border border-purple-300 rounded-lg px-2.5 py-1.5 font-bold"
                      >
                        {dataset.term.periodsConfig.map((p) => (
                          <option key={p.period} value={p.period}>
                            {p.label} ({p.startTime}–{p.endTime})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2 text-[11px] text-purple-800 bg-white/80 p-2 rounded-lg border border-purple-200">
                      💡 ตัวอย่าง: หากเลือก <b>วันจันทร์ คาบ 1</b> ระบบจะนำวิชานี้ของห้องนี้ไปลงที่ วันจันทร์ คาบ 1 อย่างแน่นอน
                    </div>
                  </div>
                )}
              </div>

              {/* Rule Section 2: Time preferences */}
              <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="font-bold text-slate-800">เงื่อนไขช่วงเวลาเพิ่มเติม (ถ้ามี)</div>

                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={rulePreferMorning}
                    onChange={(e) => setRulePreferMorning(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span>เน้นให้เรียนช่วงเช้าเท่านั้น (คาบ 1–4)</span>
                </label>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    คาบที่ต้องการเป็นพิเศษ (ถ้ามี เช่น คาบ 4 หรือ 8)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {dataset.term.periodsConfig.map((pc) => {
                      const sel = rulePreferredPeriods.includes(pc.period);
                      return (
                        <button
                          key={pc.period}
                          type="button"
                          onClick={() => {
                            setRulePreferredPeriods((prev) =>
                              sel ? prev.filter((p) => p !== pc.period) : [...prev, pc.period]
                            );
                          }}
                          className={`px-2.5 py-1 rounded border text-xs font-mono font-bold transition ${
                            sel ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          คาบ {pc.period}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    คาบที่ห้ามลงเด็ดขาด (Forbidden Periods)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {dataset.term.periodsConfig.map((pc) => {
                      const sel = ruleForbiddenPeriods.includes(pc.period);
                      return (
                        <button
                          key={pc.period}
                          type="button"
                          onClick={() => {
                            setRuleForbiddenPeriods((prev) =>
                              sel ? prev.filter((p) => p !== pc.period) : [...prev, pc.period]
                            );
                          }}
                          className={`px-2.5 py-1 rounded border text-xs font-mono font-bold transition ${
                            sel ? "bg-rose-600 text-white border-rose-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          ห้ามคาบ {pc.period}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Rule Section 3: Custom Room Override & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ห้องปฏิบัติการเฉพาะห้องนี้ (ถ้าต่างจากห้องอื่น)
                  </label>
                  <select
                    value={ruleCustomRoomId}
                    onChange={(e) => setRuleCustomRoomId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                  >
                    <option value="">ตามค่าเริ่มต้นของวิชา</option>
                    {dataset.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">บันทึกช่วยจำเงื่อนไข</label>
                  <input
                    type="text"
                    value={ruleNotes}
                    onChange={(e) => setRuleNotes(e.target.value)}
                    placeholder="เช่น วิทย์ห้อง 1/10 ต้องการคาบ 1 วันจันทร์"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClearSpecificRule}
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 text-xs font-medium"
              >
                ล้างเงื่อนไขกลับเป็นค่าเริ่มต้น
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRuleAssignment(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSaveSpecificRule}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>บันทึกเงื่อนไขเฉพาะห้องนี้</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Edit Master Subject (ข้อ 2: ข้อมูลแต่ละวิชาที่กรอกไปปรับให้แก้ไขได้ทั้งหมดเลย) */}
      {/* ========================================================================= */}
      {editingMasterSubject && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Pencil className="w-4 h-4 text-blue-600" />
                  แก้ไขข้อมูลรายวิชา: {editingMasterSubject.name} ({editingMasterSubject.code})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  แก้ไขรหัสวิชา ชื่อวิชา กลุ่มสาระ ประเภทวิชา ห้องปฏิบัติการ คาบสอน และเงื่อนไขตาราง
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMasterSubject(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSubject} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {/* ข้อมูลพื้นฐาน */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    รหัสวิชา <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingMasterSubject.code}
                    onChange={(e) =>
                      setEditingMasterSubject({ ...editingMasterSubject, code: e.target.value })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    ชื่อรายวิชา <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingMasterSubject.name}
                    onChange={(e) =>
                      setEditingMasterSubject({ ...editingMasterSubject, name: e.target.value })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">กลุ่มสาระ</label>
                  <select
                    value={editingMasterSubject.departmentId}
                    onChange={(e) =>
                      setEditingMasterSubject({ ...editingMasterSubject, departmentId: e.target.value })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5"
                  >
                    {dataset.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ประเภทวิชา</label>
                  <select
                    value={editingMasterSubject.subjectType}
                    onChange={(e) =>
                      setEditingMasterSubject({
                        ...editingMasterSubject,
                        subjectType: e.target.value as SubjectType,
                      })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5"
                  >
                    {Object.entries(SUBJECT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ห้องปฏิบัติการหลัก</label>
                  <select
                    value={editingMasterSubject.defaultRoomId || ""}
                    onChange={(e) =>
                      setEditingMasterSubject({
                        ...editingMasterSubject,
                        defaultRoomId: e.target.value || null,
                      })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5"
                  >
                    <option value="">ห้องประจำชั้น</option>
                    {dataset.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* การแตกคาบเริ่มต้น (ข้อ 5: คาบคู่ / คาบเดี่ยว) */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-800 text-xs">กำหนดคาบสอนเริ่มต้นของวิชานี้</div>
                  <div className="text-[10px] text-slate-500">
                    รวม: <span className="font-bold text-blue-900">{editMasterDouble * 2 + editMasterSingle * 1}</span> คาบ / สัปดาห์
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-700">คาบคู่ (2 คาบ):</span>
                    <button
                      type="button"
                      onClick={() => setEditMasterDouble(Math.max(0, editMasterDouble - 1))}
                      className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-bold text-blue-900">{editMasterDouble}</span>
                    <button
                      type="button"
                      onClick={() => setEditMasterDouble(editMasterDouble + 1)}
                      className="w-6 h-6 rounded bg-blue-100 hover:bg-blue-200 font-bold text-blue-700 flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-700">คาบเดี่ยว (1 คาบ):</span>
                    <button
                      type="button"
                      onClick={() => setEditMasterSingle(Math.max(0, editMasterSingle - 1))}
                      className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-bold text-blue-900">{editMasterSingle}</span>
                    <button
                      type="button"
                      onClick={() => setEditMasterSingle(editMasterSingle + 1)}
                      className="w-6 h-6 rounded bg-blue-100 hover:bg-blue-200 font-bold text-blue-700 flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* เงื่อนไขกลางตารางสอน */}
              <div className="border-t border-slate-200 pt-3 space-y-3">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-purple-600" />
                  <span>เงื่อนไขการจัดตารางสอนของวิชานี้ (ทุกห้อง)</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    คาบที่ต้องการให้ลงเป็นพิเศษ (Preferred Periods - เช่น พละคาบ 4 หรือ 8)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {dataset.term.periodsConfig.map((pc) => {
                      const sel = editingMasterSubject.rules.preferredPeriods.includes(pc.period);
                      return (
                        <button
                          key={pc.period}
                          type="button"
                          onClick={() => {
                            const cur = editingMasterSubject.rules.preferredPeriods;
                            const next = sel ? cur.filter((p) => p !== pc.period) : [...cur, pc.period];
                            setEditingMasterSubject({
                              ...editingMasterSubject,
                              rules: { ...editingMasterSubject.rules, preferredPeriods: next },
                            });
                          }}
                          className={`px-2.5 py-1 rounded border text-xs font-mono font-bold transition ${
                            sel
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          คาบ {pc.period}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ก่อนวิชานี้ ให้เรียนวิชา... (เช่น ก่อนวิชาพละเรียนศิลปะ)
                  </label>
                  <select
                    value={editingMasterSubject.rules.preferAfterSubjectIds[0] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingMasterSubject({
                        ...editingMasterSubject,
                        rules: {
                          ...editingMasterSubject.rules,
                          preferAfterSubjectIds: val ? [val] : [],
                        },
                      });
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                  >
                    <option value="">-- ไม่กำหนดวิชาก่อนหน้า --</option>
                    {dataset.subjects
                      .filter((s) => s.id !== editingMasterSubject.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} - {s.name}
                        </option>
                      ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editingMasterSubject.rules.preferMorning}
                    onChange={(e) =>
                      setEditingMasterSubject({
                        ...editingMasterSubject,
                        rules: { ...editingMasterSubject.rules, preferMorning: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span>เน้นให้เรียนช่วงเช้า (คาบ 1–4)</span>
                </label>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteSubject(editingMasterSubject.id, `${editingMasterSubject.code} ${editingMasterSubject.name}`)}
                  className="px-3.5 py-2 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold inline-flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ลบวิชานี้</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingMasterSubject(null)}
                    className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs"
                  >
                    บันทึกข้อมูลรายวิชา
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Subject Catalog (คลังรายวิชาทั้งหมด - ค้นหา / ดู / แก้ไข / ลบ) */}
      {/* ========================================================================= */}
      {showSubjectCatalogModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  คลังรายวิชาทั้งหมดของโรงเรียน ({dataset.subjects.length} รายวิชา)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  ค้นหา ตรวจสอบ และคลิก &quot;แก้ไข&quot; เพื่อปรับปรุงข้อมูลวิชา รหัส ชื่อ หรือเงื่อนไขได้ทั้งหมด
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSubjectCatalogModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Catalog Search & Filters */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative min-w-56 flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="ค้นหารหัสวิชา หรือชื่อวิชา..."
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs"
                  />
                </div>
                <select
                  value={catalogDeptFilter}
                  onChange={(e) => setCatalogDeptFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                >
                  <option value="all">ทุกกลุ่มสาระการเรียนรู้</option>
                  {dataset.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowSubjectCatalogModal(false);
                  setIsCreatingNewSubject(true);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold inline-flex items-center gap-1 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ สร้างวิชาใหม่</span>
              </button>
            </div>

            {/* Subject List */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100">
              {dataset.subjects
                .filter((s) => {
                  if (catalogDeptFilter !== "all" && s.departmentId !== catalogDeptFilter) return false;
                  if (catalogSearch.trim()) {
                    const q = catalogSearch.toLowerCase();
                    return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((s) => {
                  const dept = dataset.departments.find((d) => d.id === s.departmentId);
                  const room = dataset.rooms.find((r) => r.id === s.defaultRoomId);
                  const asgs = dataset.teachingAssignments.filter((a) => a.subjectId === s.id);
                  const teachers = Array.from(new Set(asgs.flatMap((a) => a.teacherIds)))
                    .map((tid) => dataset.teachers.find((t) => t.id === tid))
                    .filter(Boolean);

                  return (
                    <div
                      key={s.id}
                      className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 p-2 rounded-lg transition"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                            {s.code}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {SUBJECT_TYPE_LABELS[s.subjectType] || s.subjectType}
                          </span>
                          {dept && (
                            <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">
                              กลุ่มสาระ{dept.name}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                          <span>
                            <strong>{s.defaultPeriodsPerWeek}</strong> คาบ/สัปดาห์ (
                            {s.defaultSplitPattern.join("+")})
                          </span>
                          {room && (
                            <span>
                              ห้องเรียนเฉพาะ: <strong>{room.code} ({room.name})</strong>
                            </span>
                          )}
                          <span>
                            มอบหมายสอน: <strong>{asgs.length}</strong> ห้อง
                            {teachers.length > 0 && (
                              <span> ({teachers.map((t) => t?.firstName).join(", ")})</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditSubject(s)}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-md font-bold inline-flex items-center gap-1 transition"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>แก้ไข</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSubject(s.id, `${s.code} ${s.name}`)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                          title="ลบรายวิชานี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSubjectCatalogModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Edit Existing Assignment (ข้อ 4: วิชาของครูที่เพิ่มไปแล้ว ปรับให้มีฟังก์ชันแก้ไข) */}
      {/* ========================================================================= */}
      {editingAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Pencil className="w-4 h-4 text-blue-600" />
                  แก้ไขภาระงานสอน: {activeTeacher ? `${activeTeacher.prefix}${activeTeacher.firstName} (${activeTeacher.code})` : ""}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  ปรับเปลี่ยนรายวิชา ห้องเรียน คาบสอน หรือห้องเรียนเฉพาะ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAssignment(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAssignment} className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              {/* 1. เลือกวิชา */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  รายวิชาที่สอน <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editSubId}
                  onChange={(e) => {
                    setEditSubId(e.target.value);
                    const sub = dataset.subjects.find((s) => s.id === e.target.value);
                    if (sub) {
                      const doubles = sub.defaultSplitPattern.filter((x) => x === 2).length;
                      const singles = sub.defaultSplitPattern.filter((x) => x === 1).length;
                      setEditDoubleCount(doubles);
                      setEditSingleCount(singles);
                      if (sub.subjectType === "elective") setEditIsJoint(true);
                    }
                  }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-medium"
                >
                  {dataset.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name} ({s.defaultPeriodsPerWeek} คาบ • {s.defaultSplitPattern.join("+")})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. เลือกห้องเรียนที่สอน */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-700">
                    ห้องเรียนที่สอน <span className="text-rose-500">*</span> (เลือกได้หลายห้อง)
                  </label>
                  <span className="text-[11px] text-blue-700 font-bold">
                    เลือกอยู่ {editClassroomIds.length} ห้อง
                  </span>
                </div>

                {/* Grade tabs */}
                <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold mb-2">
                  {dataset.gradeLevels.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setEditGradeTab(g.id)}
                      className={`flex-1 py-1 rounded-md text-center transition ${
                        editGradeTab === g.id ? "bg-white text-blue-700 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>

                {/* Classrooms in active grade tab (1-10) */}
                <div className="grid grid-cols-5 gap-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  {sortClassrooms(dataset.classrooms.filter((c) => c.gradeLevelId === editGradeTab)).map((cls) => {
                    const sel = editClassroomIds.includes(cls.id);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => {
                          setEditClassroomIds((prev) =>
                            sel ? prev.filter((id) => id !== cls.id) : [...prev, cls.id]
                          );
                        }}
                        className={`py-1.5 px-2 rounded-md font-mono text-xs font-bold transition border ${
                          sel
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        {cls.name} {sel ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. แตกคาบสอน (คาบคู่ / คาบเดี่ยว) (ข้อ 5) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>กำหนดจำนวนคาบสอน (คาบคู่ / คาบเดี่ยว)</span>
                  </div>
                  <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200">
                    รวม {editDoubleCount * 2 + editTripleCount * 3 + editSingleCount * 1} คาบ/สัปดาห์
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between shadow-2xs">
                    <div>
                      <div className="font-bold text-slate-800 text-xs">สอนคาบคู่ (2 คาบติดกัน)</div>
                      <div className="text-[10px] text-slate-500">บล็อกละ 2 คาบ</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditDoubleCount(Math.max(0, editDoubleCount - 1))}
                        className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-sm"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-bold text-sm text-blue-900">{editDoubleCount}</span>
                      <button
                        type="button"
                        onClick={() => setEditDoubleCount(editDoubleCount + 1)}
                        className="w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 font-bold text-blue-700 flex items-center justify-center text-sm"
                      >
                        +
                      </button>
                      <span className="text-xs text-slate-600 font-medium">ครั้ง</span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between shadow-2xs">
                    <div>
                      <div className="font-bold text-slate-800 text-xs">สอนคาบเดี่ยว (1 คาบ)</div>
                      <div className="text-[10px] text-slate-500">บล็อกละ 1 คาบ</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditSingleCount(Math.max(0, editSingleCount - 1))}
                        className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-sm"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-bold text-sm text-blue-900">{editSingleCount}</span>
                      <button
                        type="button"
                        onClick={() => setEditSingleCount(editSingleCount + 1)}
                        className="w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 font-bold text-blue-700 flex items-center justify-center text-sm"
                      >
                        +
                      </button>
                      <span className="text-xs text-slate-600 font-medium">คาบ</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. ห้องเรียนเฉพาะ & ครูร่วม */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ห้องปฏิบัติการหลัก
                  </label>
                  <select
                    value={editRoomId}
                    onChange={(e) => setEditRoomId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                  >
                    <option value="">ห้องประจำชั้นของนักเรียน</option>
                    {dataset.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">
                      ครูสอนร่วมเพิ่มเติม (ข้อ 3: มีสอนร่วมมากกว่า 2 คนได้)
                    </label>
                    {editCoTeacherIds.length > 0 && (
                      <span className="text-[11px] text-blue-700 font-bold">
                        สอนร่วม {editCoTeacherIds.length} ท่าน
                      </span>
                    )}
                  </div>

                  {editCoTeacherIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5 p-1.5 bg-blue-50/60 rounded-lg border border-blue-200">
                      {editCoTeacherIds.map((tid) => {
                        const t = dataset.teachers.find((x) => x.id === tid);
                        return (
                          <span
                            key={tid}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-blue-200 text-blue-900 text-xs font-semibold shadow-2xs"
                          >
                            {t ? getTeacherFullName(t) : tid}
                            <button
                              type="button"
                              onClick={() =>
                                setEditCoTeacherIds((prev) => prev.filter((id) => id !== tid))
                              }
                              className="text-slate-400 hover:text-rose-600 font-bold ml-1"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <SearchableTeacherSelect
                    teachers={dataset.teachers}
                    departments={dataset.departments}
                    value=""
                    onChange={(tid) => {
                      if (tid && !editCoTeacherIds.includes(tid)) {
                        setEditCoTeacherIds((prev) => [...prev, tid]);
                      }
                    }}
                    placeholder="+ ค้นหา/เลือกครูสอนร่วมเพิ่มเติม (คนที่ 2, 3...)"
                    excludeIds={activeTeacher ? [activeTeacher.id, ...editCoTeacherIds] : editCoTeacherIds}
                    allowEmpty
                    emptyLabel="-- ไม่เลือก --"
                    size="sm"
                  />
                </div>
              </div>

              {/* 5. Checkbox เรียนพร้อมกัน */}
              {editClassroomIds.length > 1 && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-purple-950">
                    <input
                      type="checkbox"
                      checked={editIsJoint}
                      onChange={(e) => setEditIsJoint(e.target.checked)}
                      className="rounded border-purple-300 text-purple-600 w-4 h-4"
                    />
                    <span>นักเรียนเรียนพร้อมกันหลายห้อง (วิชาเลือก / รวมกลุ่มห้องเรียน)</span>
                  </label>
                  <p className="text-[11px] text-purple-700 mt-1 pl-6">
                    {editIsJoint
                      ? `✓ นักเรียนทั้ง ${editClassroomIds.length} ห้องจะถูกจัดลงในคาบเดียวกัน และนับภาระงานสอนครูเพียง ${
                          editDoubleCount * 2 + editTripleCount * 3 + editSingleCount * 1
                        } คาบ`
                      : "แยกจัดสอนทีละห้องตามปกติ"}
                  </p>
                </div>
              )}

              {/* 5.1 Subgroup Split (วิชาแยกกลุ่ม / แยกแผนการเรียนในห้องเดียว เช่น ม.4/7 แบ่งแผนคณิต/ภาษา) */}
              {editClassroomIds.length === 1 && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-950">
                    <input
                      type="checkbox"
                      checked={editIsSubgroup}
                      onChange={(e) => {
                        setEditIsSubgroup(e.target.checked);
                        if (e.target.checked && !editSubgroupSyncId) {
                          setEditSubgroupSyncId(`subgroup_${editClassroomIds[0]}_${Date.now()}`);
                        }
                      }}
                      className="rounded border-emerald-300 text-emerald-600 w-4 h-4"
                    />
                    <span>📌 วิชาแยกกลุ่ม / แยกแผนการเรียนในห้องเดียว (เช่น ม.4/7 ครึ่งห้องเรียนคณิต อีกครึ่งเรียนภาษา)</span>
                  </label>
                  {editIsSubgroup && (
                    <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                          ชื่อกลุ่มย่อย / แผนการเรียน:
                        </label>
                        <input
                          type="text"
                          placeholder="เช่น แผนคณิต, แผนภาษา, กลุ่ม 1"
                          value={editSubgroupName}
                          onChange={(e) => setEditSubgroupName(e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 border border-emerald-300 rounded bg-white text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                          กลุ่มเชื่อมโยงคู่ขนาน (เรียนเวลาเดียวกัน):
                        </label>
                        {(() => {
                          const roomSubgroups = dataset.teachingAssignments.filter(
                            (a) => a.classroomId === editClassroomIds[0] && a.isSubgroup && a.subgroupSyncId && a.id !== editingAssignment.id
                          );
                          const distinctSyncIds = Array.from(new Set(roomSubgroups.map((a) => a.subgroupSyncId!)));
                          return (
                            <div className="space-y-1.5">
                              {distinctSyncIds.length > 0 && (
                                <select
                                  value={distinctSyncIds.includes(editSubgroupSyncId) ? editSubgroupSyncId : "new"}
                                  onChange={(e) => {
                                    if (e.target.value === "new") {
                                      setEditSubgroupSyncId(`subgroup_${editClassroomIds[0]}_${Date.now()}`);
                                    } else {
                                      setEditSubgroupSyncId(e.target.value);
                                    }
                                  }}
                                  className="w-full text-xs px-2 py-1 border border-emerald-300 rounded bg-white text-slate-800 font-medium"
                                >
                                  <option value="new">+ สร้างกลุ่มคู่ขนานใหม่</option>
                                  {distinctSyncIds.map((syncId) => {
                                    const paired = roomSubgroups.find((a) => a.subgroupSyncId === syncId);
                                    const subName = paired?.subgroupName || "วิชาคู่ขนาน";
                                    const subSub = paired ? subjectsMap.get(paired.subjectId)?.name : "";
                                    return (
                                      <option key={syncId} value={syncId}>
                                        จับคู่กับ: {subName} ({subSub})
                                      </option>
                                    );
                                  })}
                                </select>
                              )}
                              <input
                                type="text"
                                value={editSubgroupSyncId}
                                onChange={(e) => setEditSubgroupSyncId(e.target.value)}
                                placeholder="รหัสเชื่อมโยง (Sync ID)"
                                className="w-full text-xs px-2.5 py-1 border border-emerald-300 rounded bg-white text-slate-700 font-mono text-[11px]"
                              />
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 6. หมายเหตุ */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">หมายเหตุเพิ่มเติม</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="เช่น ต้องการใช้จอโปรเจกเตอร์"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5"
                />
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 -mx-5 -mb-5 mt-4">
                <button
                  type="button"
                  onClick={() => setEditingAssignment(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs"
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

export default function AssignmentsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400">กำลังโหลดข้อมูลภาระงานสอน...</div>}>
      <AssignmentsInner />
    </Suspense>
  );
}
