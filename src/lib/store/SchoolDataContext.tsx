"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AcademicTerm,
  Classroom,
  CollaborativeSession,
  Department,
  Division,
  GroupMeetingLock,
  Room,
  SchoolDataset,
  Subject,
  SynchronizedBlock,
  Teacher,
  TeachingAssignment,
  TimetableEntry,
  TimetableVersion,
} from "@/types/timetable";
import { createDefaultTerm, createSeedDataset } from "@/lib/seed-data";
import {
  dbMappers,
  fetchDatasetFromSupabase,
  getSupabaseClient,
  getSupabaseConfig,
  pushDatasetToSupabase,
  saveSupabaseConfig,
} from "@/lib/supabase/client";
import { auditDatasetReadiness, DatasetReadinessReport } from "@/lib/solver/validator";

const LOCAL_DATASET_KEY = "sts_school_dataset_v1";
const LOCAL_SESSION_KEY = "sts_collab_session_v1";

export type CloudSyncState = "local_only" | "connecting" | "connected" | "error";

interface SchoolDataContextValue {
  dataset: SchoolDataset;
  isHydrated: boolean;
  activeVersionId: string;
  setActiveVersionId: (id: string) => void;
  activeVersionEntries: TimetableEntry[];
  readinessReport: DatasetReadinessReport;

  // Collaborative Session
  session: CollaborativeSession;
  updateSession: (next: CollaborativeSession) => void;

  // Supabase Cloud Connection
  cloudState: CloudSyncState;
  cloudError: string | null;
  lastSyncedAt: string | null;
  supabaseUrl: string;
  supabaseKey: string;
  connectSupabase: (url: string, key?: string) => Promise<{ ok: boolean; error?: string }>;
  pushToCloud: () => Promise<{ ok: boolean; error?: string }>;
  pullFromCloud: (silent?: boolean) => Promise<{ ok: boolean; error?: string }>;

  // Mutations
  updateTerm: (term: AcademicTerm) => void;
  upsertDepartment: (dept: Department) => void;
  deleteDepartment: (id: string) => void;
  toggleDepartmentCompleted: (deptId: string, completed: boolean) => void;

  upsertDivision: (div: Division) => void;
  deleteDivision: (id: string) => void;
  upsertMeetingLock: (lock: GroupMeetingLock) => void;
  deleteMeetingLock: (id: string) => void;

  upsertRoom: (room: Room) => void;
  deleteRoom: (id: string) => void;

  upsertClassroom: (cls: Classroom) => void;
  bulkUpsertClassrooms: (newClassrooms: Classroom[]) => void;
  deleteClassroom: (id: string) => void;

  upsertTeacher: (teacher: Teacher) => void;
  deleteTeacher: (id: string) => void;

  upsertSubject: (sub: Subject) => void;
  deleteSubject: (id: string) => void;

  upsertAssignment: (asg: TeachingAssignment) => void;
  bulkUpsertAssignments: (asgs: TeachingAssignment[]) => void;
  deleteAssignment: (id: string) => void;

  upsertSyncBlock: (block: SynchronizedBlock) => void;
  deleteSyncBlock: (id: string) => void;

  createVersion: (name: string, copyFromCurrent?: boolean) => string;
  deleteVersion: (id: string) => void;
  setVersionPublished: (id: string) => void;
  replaceVersionEntries: (
    versionId: string,
    entries: TimetableEntry[],
    score: number,
    hardConflictsCount: number
  ) => void;
  updateEntriesBatch: (updatedEntries: TimetableEntry[]) => void;

  resetToSeedData: () => void;
  resetToBlankTemplate: () => void;
}

const SchoolDataContext = createContext<SchoolDataContextValue | null>(null);

export function SchoolDataProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<SchoolDataset>(() => createSeedDataset());
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<string>("ver_default");

  const [session, setSession] = useState<CollaborativeSession>({
    userName: "ทีมบริหารวิชาการ",
    role: "admin",
    departmentId: null,
  });

  const [cloudState, setCloudState] = useState<CloudSyncState>("local_only");
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [supabaseUrl, setSupabaseUrl] = useState<string>("");
  const [supabaseKey, setSupabaseKey] = useState<string>(
    "sb_publishable_5LdJGRJiShjri_JAUy0duw_PzWvZH6g"
  );

  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocalMutationRef = useRef<number>(0);

  // Hydrate from localStorage + check Supabase config on mount
  useEffect(() => {
    try {
      const savedSession = window.localStorage.getItem(LOCAL_SESSION_KEY);
      if (savedSession) {
        setSession(JSON.parse(savedSession));
      }
      const savedData = window.localStorage.getItem(LOCAL_DATASET_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData) as SchoolDataset;
        if (parsed?.term?.id) {
          // ล้าง division ขยะที่ไม่มีชื่อหรือชื่อเป็นรหัส div_...
          if (parsed.divisions) {
            parsed.divisions = parsed.divisions.filter(
              (d) => d && d.name && !d.name.startsWith("div_")
            );
          }
          setDataset(parsed);
          if (parsed.versions?.length > 0) {
            setActiveVersionId(parsed.versions[0].id);
          }
        }
      }
    } catch {
      // fallback to seed
    }

    const cfg = getSupabaseConfig();
    setSupabaseUrl(cfg.url);
    setSupabaseKey(cfg.key);
    setIsHydrated(true);
  }, []);

  // Persist local backup whenever dataset changes
  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(LOCAL_DATASET_KEY, JSON.stringify(dataset));
    } catch {
      // ignore quota error
    }
  }, [dataset, isHydrated]);

  const mergeFetchedDataset = useCallback((fetched: SchoolDataset, prev: SchoolDataset): SchoolDataset => {
    const mergedAssignments = fetched.teachingAssignments.map((cloudAsg) => {
      if (cloudAsg.specificRule) return cloudAsg;
      const localAsg = prev.teachingAssignments.find((a) => a.id === cloudAsg.id);
      if (localAsg?.specificRule) {
        return {
          ...cloudAsg,
          specificRule: localAsg.specificRule,
          isJointClass: cloudAsg.isJointClass ?? localAsg.isJointClass,
          jointGroupId: cloudAsg.jointGroupId ?? localAsg.jointGroupId,
          jointClassroomIds: cloudAsg.jointClassroomIds ?? localAsg.jointClassroomIds,
        };
      }
      return cloudAsg;
    });

    const divMap = new Map(fetched.divisions.map((d) => [d.id, d.name]));
    const mergedMeetings = fetched.groupMeetingLocks.map((m) => {
      const localM = prev.groupMeetingLocks.find((l) => l.id === m.id);
      return {
        ...m,
        divisionName: m.divisionName || divMap.get(m.targetId) || undefined,
        coexistTeacherIds: m.coexistTeacherIds ?? localM?.coexistTeacherIds,
        excludedTeacherIds: m.excludedTeacherIds ?? localM?.excludedTeacherIds,
      };
    });

    const mergedBlocks = fetched.synchronizedBlocks.map((b) => {
      const localB = prev.synchronizedBlocks.find((lb) => lb.id === b.id);
      return {
        ...b,
        studentOnly: b.studentOnly ?? localB?.studentOnly,
        classroomTeacherMap: b.classroomTeacherMap ?? localB?.classroomTeacherMap,
        coexistTeacherIds: b.coexistTeacherIds ?? localB?.coexistTeacherIds,
        excludedTeacherIds: b.excludedTeacherIds ?? localB?.excludedTeacherIds,
      };
    });

    const mergedRooms = fetched.rooms.map((cloudRm) => {
      const localRm = prev.rooms.find((r) => r.id === cloudRm.id);
      return {
        ...cloudRm,
        allowOverlap:
          cloudRm.allowOverlap !== undefined
            ? cloudRm.allowOverlap
            : Boolean(localRm?.allowOverlap),
      };
    });

    return {
      ...fetched,
      rooms: mergedRooms,
      teachingAssignments: mergedAssignments,
      groupMeetingLocks: mergedMeetings,
      synchronizedBlocks: mergedBlocks,
    };
  }, []);

  const pullFromCloud = useCallback(async (silent = false) => {
    const sb = getSupabaseClient();
    if (!sb) {
      if (!silent) setCloudState("local_only");
      return { ok: false, error: "ยังไม่ได้ระบุ Supabase Project URL" };
    }
    if (!silent) setCloudState("connecting");
    const res = await fetchDatasetFromSupabase(sb);
    if (!res.ok) {
      if (!silent) {
        setCloudState("error");
        setCloudError(res.error);
      }
      return { ok: false, error: res.error };
    }
    if (res.dataset) {
      setDataset((prev) => mergeFetchedDataset(res.dataset!, prev));
      setActiveVersionId((prev) =>
        res.dataset!.versions.some((v) => v.id === prev)
          ? prev
          : res.dataset!.versions[0]?.id ?? "ver_default"
      );
    }
    setCloudState("connected");
    setCloudError(null);
    setLastSyncedAt(new Date().toLocaleTimeString("th-TH"));
    return { ok: true };
  }, [mergeFetchedDataset]);

  const pushToCloud = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) {
      return { ok: false, error: "ยังไม่ได้ระบุ Supabase Project URL" };
    }
    setCloudState("connecting");
    const res = await pushDatasetToSupabase(sb, dataset);
    if (!res.ok) {
      setCloudState("error");
      setCloudError(res.error);
      return { ok: false, error: res.error };
    }
    setCloudState("connected");
    setCloudError(null);
    setLastSyncedAt(new Date().toLocaleTimeString("th-TH"));
    return { ok: true };
  }, [dataset]);

  // Connect & Subscribe to Supabase Realtime if URL exists
  useEffect(() => {
    if (!isHydrated || !supabaseUrl) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let active = true;
    (async () => {
      const res = await fetchDatasetFromSupabase(sb);
      if (!active) return;
      if (!res.ok) {
        setCloudState("error");
        setCloudError(res.error);
        return;
      }
      if (res.dataset) {
        setDataset((prev) => mergeFetchedDataset(res.dataset!, prev));
        if (res.dataset.versions.length > 0) {
          setActiveVersionId((prev) =>
            res.dataset!.versions.some((v) => v.id === prev)
              ? prev
              : res.dataset!.versions[0].id
          );
        }
      } else {
        // Empty database -> push current dataset automatically
        const pushRes = await pushDatasetToSupabase(sb, dataset);
        if (!pushRes.ok) {
          setCloudState("error");
          setCloudError(pushRes.error);
          return;
        }
      }
      setCloudState("connected");
      setCloudError(null);
      setLastSyncedAt(new Date().toLocaleTimeString("th-TH"));
    })();

    const channel = sb
      .channel("sts_realtime_collab")
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        // หากผู้ใช้เพิ่งมีการแก้ไขข้อมูลเองภายใน 2 วินาที ให้หน่วงเวลา (Debounce) ไว้ 2 วินาที
        // เพื่อให้คำสั่งเซฟทั้งหมดของผู้ใช้ถูกส่งขึ้น Cloud ให้เสร็จสิ้นก่อน และไม่ดึงข้อมูลเก่ากลับมาทับ
        const timeSinceLocalEdit = Date.now() - lastLocalMutationRef.current;
        const debounceDelay = timeSinceLocalEdit < 2000 ? 2000 : 800;

        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = setTimeout(() => {
          void pullFromCloud(true);
        }, debounceDelay);
      })
      .subscribe();

    return () => {
      active = false;
      void sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, supabaseUrl]);

  const connectSupabase = useCallback(
    async (url: string, key?: string) => {
      saveSupabaseConfig(url, key);
      const cfg = getSupabaseConfig();
      setSupabaseUrl(cfg.url);
      setSupabaseKey(cfg.key);
      if (!cfg.url) {
        setCloudState("local_only");
        setCloudError(null);
        return { ok: true };
      }
      const sb = getSupabaseClient();
      if (!sb) return { ok: false, error: "รูปแบบ URL ไม่ถูกต้อง" };

      setCloudState("connecting");
      const fetched = await fetchDatasetFromSupabase(sb);
      if (!fetched.ok) {
        setCloudState("error");
        setCloudError(fetched.error);
        return { ok: false, error: fetched.error };
      }
      if (fetched.dataset) {
        setDataset((prev) => mergeFetchedDataset(fetched.dataset!, prev));
      } else {
        const pushed = await pushDatasetToSupabase(sb, dataset);
        if (!pushed.ok) {
          setCloudState("error");
          setCloudError(pushed.error);
          return { ok: false, error: pushed.error };
        }
      }
      setCloudState("connected");
      setCloudError(null);
      setLastSyncedAt(new Date().toLocaleTimeString("th-TH"));
      return { ok: true };
    },
    [dataset, mergeFetchedDataset]
  );

  // Fire-and-forget single-row cloud sync helper
  const syncRow = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (table: string, action: "upsert" | "delete", payload: any) => {
      const sb = getSupabaseClient();
      if (!sb || cloudState === "local_only") return;
      lastLocalMutationRef.current = Date.now();
      void (async () => {
        let res =
          action === "upsert"
            ? await sb.from(table).upsert(payload)
            : await sb.from(table).delete().eq("id", payload);

        // Fallback if missing column on Supabase (e.g. allow_overlap / coexist_teacher_ids hasn't been added yet)
        if (
          res.error &&
          action === "upsert" &&
          (res.error.message?.includes("allow_overlap") ||
            res.error.message?.includes("coexist_teacher_ids") ||
            res.error.message?.includes("excluded_teacher_ids") ||
            res.error.message?.includes("classroom_teacher_map") ||
            res.error.code === "PGRST204")
        ) {
          const fallback = { ...payload };
          delete fallback.allow_overlap;
          delete fallback.coexist_teacher_ids;
          delete fallback.excluded_teacher_ids;
          delete fallback.classroom_teacher_map;
          res = await sb.from(table).upsert(fallback);
        }

        if (!res.error) {
          setLastSyncedAt(new Date().toLocaleTimeString("th-TH"));
        } else {
          console.warn(`[Supabase syncRow] failed on ${table}:`, res.error);
        }
      })();
    },
    [cloudState]
  );

  const updateSession = useCallback((next: CollaborativeSession) => {
    setSession(next);
    try {
      window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  // ==================== ENTITY MUTATIONS ====================

  const updateTerm = useCallback(
    (term: AcademicTerm) => {
      setDataset((prev) => ({ ...prev, term }));
      syncRow("academic_terms", "upsert", dbMappers.toDbTerm(term));
    },
    [syncRow]
  );

  const upsertDepartment = useCallback(
    (dept: Department) => {
      setDataset((prev) => {
        const exists = prev.departments.some((d) => d.id === dept.id);
        return {
          ...prev,
          departments: exists
            ? prev.departments.map((d) => (d.id === dept.id ? dept : d))
            : [...prev.departments, dept],
        };
      });
      syncRow("departments", "upsert", dbMappers.toDbDept(dept));
    },
    [syncRow]
  );

  const deleteDepartment = useCallback(
    (id: string) => {
      setDataset((prev) => ({
        ...prev,
        departments: prev.departments.filter((d) => d.id !== id),
      }));
      syncRow("departments", "delete", id);
    },
    [syncRow]
  );

  const toggleDepartmentCompleted = useCallback(
    (deptId: string, completed: boolean) => {
      setDataset((prev) => {
        const target = prev.departments.find((d) => d.id === deptId);
        if (!target) return prev;
        const updated: Department = {
          ...target,
          isEntryCompleted: completed,
          completedBy: completed ? session.userName : null,
        };
        syncRow("departments", "upsert", dbMappers.toDbDept(updated));
        return {
          ...prev,
          departments: prev.departments.map((d) => (d.id === deptId ? updated : d)),
        };
      });
    },
    [session.userName, syncRow]
  );

  const upsertDivision = useCallback(
    (div: Division) => {
      setDataset((prev) => {
        const exists = prev.divisions.some((d) => d.id === div.id);
        return {
          ...prev,
          divisions: exists
            ? prev.divisions.map((d) => (d.id === div.id ? div : d))
            : [...prev.divisions, div],
        };
      });
      syncRow("divisions", "upsert", dbMappers.toDbDiv(div));
    },
    [syncRow]
  );

  const deleteDivision = useCallback(
    (id: string) => {
      setDataset((prev) => {
        const targetDiv = prev.divisions.find((d) => d.id === id);
        const divName = targetDiv?.name;
        return {
          ...prev,
          divisions: prev.divisions.filter((d) => d.id !== id && d.name !== id),
          groupMeetingLocks: prev.groupMeetingLocks.filter(
            (m) =>
              !(
                (m.targetType === "division" && m.targetId === id) ||
                (divName && (m.divisionName === divName || m.targetId === divName))
              )
          ),
          teachers: prev.teachers.map((t) => ({
            ...t,
            divisionIds: (t.divisionIds || []).filter(
              (did) => did !== id && did !== divName
            ),
          })),
        };
      });
      syncRow("divisions", "delete", id);
    },
    [syncRow]
  );

  const upsertMeetingLock = useCallback(
    (lock: GroupMeetingLock) => {
      setDataset((prev) => {
        const exists = prev.groupMeetingLocks.some((m) => m.id === lock.id);
        return {
          ...prev,
          groupMeetingLocks: exists
            ? prev.groupMeetingLocks.map((m) => (m.id === lock.id ? lock : m))
            : [...prev.groupMeetingLocks, lock],
        };
      });
      syncRow("group_meeting_locks", "upsert", dbMappers.toDbMeeting(lock));
    },
    [syncRow]
  );

  const deleteMeetingLock = useCallback(
    (id: string) => {
      setDataset((prev) => ({
        ...prev,
        groupMeetingLocks: prev.groupMeetingLocks.filter((m) => m.id !== id),
      }));
      syncRow("group_meeting_locks", "delete", id);
    },
    [syncRow]
  );

  const upsertRoom = useCallback(
    (room: Room) => {
      setDataset((prev) => {
        const exists = prev.rooms.some((r) => r.id === room.id);
        return {
          ...prev,
          rooms: exists
            ? prev.rooms.map((r) => (r.id === room.id ? room : r))
            : [...prev.rooms, room],
        };
      });
      syncRow("rooms", "upsert", dbMappers.toDbRoom(room));
    },
    [syncRow]
  );

  const deleteRoom = useCallback(
    (id: string) => {
      setDataset((prev) => ({
        ...prev,
        rooms: prev.rooms.filter((r) => r.id !== id),
      }));
      syncRow("rooms", "delete", id);
    },
    [syncRow]
  );

  const upsertClassroom = useCallback(
    (cls: Classroom) => {
      setDataset((prev) => {
        const exists = prev.classrooms.some((c) => c.id === cls.id);
        return {
          ...prev,
          classrooms: exists
            ? prev.classrooms.map((c) => (c.id === cls.id ? cls : c))
            : [...prev.classrooms, cls],
        };
      });
      syncRow("classrooms", "upsert", dbMappers.toDbClassroom(cls));
    },
    [syncRow]
  );

  const bulkUpsertClassrooms = useCallback(
    (newClassrooms: Classroom[]) => {
      setDataset((prev) => {
        const idMap = new Map(newClassrooms.map((c) => [c.id, c]));
        const updated = prev.classrooms.map((c) => idMap.get(c.id) || c);
        const existingIds = new Set(prev.classrooms.map((c) => c.id));
        const brandNew = newClassrooms.filter((c) => !existingIds.has(c.id));
        return {
          ...prev,
          classrooms: [...updated, ...brandNew],
        };
      });
      newClassrooms.forEach((c) => syncRow("classrooms", "upsert", dbMappers.toDbClassroom(c)));
    },
    [syncRow]
  );

  const deleteClassroom = useCallback(
    (id: string) => {
      setDataset((prev) => ({
        ...prev,
        classrooms: prev.classrooms.filter((c) => c.id !== id),
        teachingAssignments: prev.teachingAssignments.filter((a) => a.classroomId !== id),
      }));
      syncRow("classrooms", "delete", id);
    },
    [syncRow]
  );

  const upsertTeacher = useCallback(
    (teacher: Teacher) => {
      setDataset((prev) => {
        const exists = prev.teachers.some((t) => t.id === teacher.id);
        return {
          ...prev,
          teachers: exists
            ? prev.teachers.map((t) => (t.id === teacher.id ? teacher : t))
            : [...prev.teachers, teacher],
        };
      });
      syncRow("teachers", "upsert", dbMappers.toDbTeacher(teacher));
    },
    [syncRow]
  );

  const deleteTeacher = useCallback(
    (id: string) => {
      setDataset((prev) => ({
        ...prev,
        teachers: prev.teachers.filter((t) => t.id !== id),
      }));
      syncRow("teachers", "delete", id);
    },
    [syncRow]
  );

  const upsertSubject = useCallback(
    (sub: Subject) => {
      setDataset((prev) => {
        const exists = prev.subjects.some((s) => s.id === sub.id);
        return {
          ...prev,
          subjects: exists
            ? prev.subjects.map((s) => (s.id === sub.id ? sub : s))
            : [...prev.subjects, sub],
        };
      });
      syncRow("subjects", "upsert", dbMappers.toDbSubject(sub));
    },
    [syncRow]
  );

  const deleteSubject = useCallback(
    (id: string) => {
      setDataset((prev) => ({
        ...prev,
        subjects: prev.subjects.filter((s) => s.id !== id),
        teachingAssignments: prev.teachingAssignments.filter((a) => a.subjectId !== id),
      }));
      syncRow("subjects", "delete", id);
    },
    [syncRow]
  );

  const upsertAssignment = useCallback(
    (asg: TeachingAssignment) => {
      const stamped: TeachingAssignment = { ...asg, updatedBy: session.userName };
      setDataset((prev) => {
        const exists = prev.teachingAssignments.some((a) => a.id === stamped.id);
        return {
          ...prev,
          teachingAssignments: exists
            ? prev.teachingAssignments.map((a) => (a.id === stamped.id ? stamped : a))
            : [...prev.teachingAssignments, stamped],
        };
      });
      syncRow("teaching_assignments", "upsert", dbMappers.toDbAssignment(stamped));
    },
    [session.userName, syncRow]
  );

  const bulkUpsertAssignments = useCallback(
    (asgs: TeachingAssignment[]) => {
      if (asgs.length === 0) return;
      const stamped = asgs.map((a) => ({ ...a, updatedBy: session.userName }));
      setDataset((prev) => {
        const map = new Map(prev.teachingAssignments.map((a) => [a.id, a]));
        for (const s of stamped) map.set(s.id, s);
        return {
          ...prev,
          teachingAssignments: Array.from(map.values()),
        };
      });
      syncRow("teaching_assignments", "upsert", stamped.map(dbMappers.toDbAssignment));
    },
    [session.userName, syncRow]
  );

  const deleteAssignment = useCallback(
    (id: string) => {
      setDataset((prev) => ({
        ...prev,
        teachingAssignments: prev.teachingAssignments.filter((a) => a.id !== id),
      }));
      syncRow("teaching_assignments", "delete", id);
    },
    [syncRow]
  );

  const upsertSyncBlock = useCallback(
    (block: SynchronizedBlock) => {
      setDataset((prev) => {
        const exists = prev.synchronizedBlocks.some((b) => b.id === block.id);
        return {
          ...prev,
          synchronizedBlocks: exists
            ? prev.synchronizedBlocks.map((b) => (b.id === block.id ? block : b))
            : [...prev.synchronizedBlocks, block],
        };
      });
      syncRow("synchronized_blocks", "upsert", dbMappers.toDbSyncBlock(block));
    },
    [syncRow]
  );

  const deleteSyncBlock = useCallback(
    (id: string) => {
      setDataset((prev) => ({
        ...prev,
        synchronizedBlocks: prev.synchronizedBlocks.filter((b) => b.id !== id),
      }));
      syncRow("synchronized_blocks", "delete", id);
    },
    [syncRow]
  );

  const createVersion = useCallback(
    (name: string, copyFromCurrent = false): string => {
      const newId = `ver_${Date.now()}`;
      const newVer: TimetableVersion = {
        id: newId,
        termId: dataset.term.id,
        name,
        status: "draft",
        score: 0,
        hardConflictsCount: 0,
        notes: copyFromCurrent ? "คัดลอกจากร่างเดิมเพื่อปรับแก้ต่อ" : null,
        createdAt: new Date().toISOString(),
      };
      const copiedEntries: TimetableEntry[] = copyFromCurrent
        ? dataset.entries
            .filter((e) => e.versionId === activeVersionId)
            .map((e, i) => ({
              ...e,
              id: `${newId}_ent_${i}_${Date.now()}`,
              versionId: newId,
            }))
        : [];

      setDataset((prev) => ({
        ...prev,
        versions: [...prev.versions, newVer],
        entries: [...prev.entries, ...copiedEntries],
      }));
      setActiveVersionId(newId);

      syncRow("timetable_versions", "upsert", dbMappers.toDbVersion(newVer));
      if (copiedEntries.length > 0) {
        syncRow("timetable_entries", "upsert", copiedEntries.map(dbMappers.toDbEntry));
      }
      return newId;
    },
    [activeVersionId, dataset.entries, dataset.term.id, syncRow]
  );

  const deleteVersion = useCallback(
    (id: string) => {
      setDataset((prev) => {
        if (prev.versions.length <= 1) return prev;
        const remaining = prev.versions.filter((v) => v.id !== id);
        if (activeVersionId === id && remaining.length > 0) {
          setActiveVersionId(remaining[0].id);
        }
        return {
          ...prev,
          versions: remaining,
          entries: prev.entries.filter((e) => e.versionId !== id),
        };
      });
      syncRow("timetable_versions", "delete", id);
    },
    [activeVersionId, syncRow]
  );

  const setVersionPublished = useCallback(
    (id: string) => {
      setDataset((prev) => {
        const nextVersions: TimetableVersion[] = prev.versions.map((v) => ({
          ...v,
          status: v.id === id ? "published" : "draft",
        }));
        syncRow("timetable_versions", "upsert", nextVersions.map(dbMappers.toDbVersion));
        return { ...prev, versions: nextVersions };
      });
    },
    [syncRow]
  );

  const replaceVersionEntries = useCallback(
    (
      versionId: string,
      entries: TimetableEntry[],
      score: number,
      hardConflictsCount: number
    ) => {
      setDataset((prev) => {
        const otherEntries = prev.entries.filter((e) => e.versionId !== versionId);
        const updatedVersions = prev.versions.map((v) =>
          v.id === versionId ? { ...v, score, hardConflictsCount } : v
        );
        return {
          ...prev,
          versions: updatedVersions,
          entries: [...otherEntries, ...entries],
        };
      });

      const sb = getSupabaseClient();
      if (sb && cloudState === "connected") {
        void (async () => {
          await sb.from("timetable_entries").delete().eq("version_id", versionId);
          const mapped = entries.map(dbMappers.toDbEntry);
          for (let i = 0; i < mapped.length; i += 250) {
            await sb.from("timetable_entries").upsert(mapped.slice(i, i + 250));
          }
          setLastSyncedAt(new Date().toLocaleTimeString("th-TH"));
        })();
      }
    },
    [cloudState]
  );

  const updateEntriesBatch = useCallback(
    (updatedEntries: TimetableEntry[]) => {
      if (updatedEntries.length === 0) return;
      const map = new Map(updatedEntries.map((e) => [e.id, e]));
      setDataset((prev) => ({
        ...prev,
        entries: prev.entries.map((e) => map.get(e.id) ?? e),
      }));
      syncRow("timetable_entries", "upsert", updatedEntries.map(dbMappers.toDbEntry));
    },
    [syncRow]
  );

  const resetToSeedData = useCallback(() => {
    const fresh = createSeedDataset();
    setDataset(fresh);
    setActiveVersionId(fresh.versions[0].id);
  }, []);

  const resetToBlankTemplate = useCallback(() => {
    const seed = createSeedDataset();
    const term = createDefaultTerm("term_school_1");
    term.schoolName = dataset.term.schoolName;
    const blank: SchoolDataset = {
      term,
      departments: seed.departments.map((d) => ({
        ...d,
        termId: term.id,
        isEntryCompleted: false,
        completedBy: null,
      })),
      divisions: seed.divisions.map((d) => ({ ...d, termId: term.id })),
      rooms: [],
      gradeLevels: seed.gradeLevels.map((g) => ({ ...g, termId: term.id })),
      classrooms: [],
      teachers: [],
      groupMeetingLocks: [],
      subjects: [],
      teachingAssignments: [],
      synchronizedBlocks: [],
      versions: [
        {
          id: "ver_main_1",
          termId: term.id,
          name: "ร่างตารางสอนที่ 1",
          status: "draft",
          score: 0,
          hardConflictsCount: 0,
          notes: null,
          createdAt: new Date().toISOString(),
        },
      ],
      entries: [],
    };
    setDataset(blank);
    setActiveVersionId("ver_main_1");
  }, [dataset.term.schoolName]);

  const activeVersionEntries = useMemo(
    () => dataset.entries.filter((e) => e.versionId === activeVersionId),
    [dataset.entries, activeVersionId]
  );

  const readinessReport = useMemo(() => auditDatasetReadiness(dataset), [dataset]);

  const value: SchoolDataContextValue = {
    dataset,
    isHydrated,
    activeVersionId,
    setActiveVersionId,
    activeVersionEntries,
    readinessReport,
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
    updateTerm,
    upsertDepartment,
    deleteDepartment,
    toggleDepartmentCompleted,
    upsertDivision,
    deleteDivision,
    upsertMeetingLock,
    deleteMeetingLock,
    upsertRoom,
    deleteRoom,
    upsertClassroom,
    bulkUpsertClassrooms,
    deleteClassroom,
    upsertTeacher,
    deleteTeacher,
    upsertSubject,
    deleteSubject,
    upsertAssignment,
    bulkUpsertAssignments,
    deleteAssignment,
    upsertSyncBlock,
    deleteSyncBlock,
    createVersion,
    deleteVersion,
    setVersionPublished,
    replaceVersionEntries,
    updateEntriesBatch,
    resetToSeedData,
    resetToBlankTemplate,
  };

  return (
    <SchoolDataContext.Provider value={value}>{children}</SchoolDataContext.Provider>
  );
}

export function useSchoolData() {
  const ctx = useContext(SchoolDataContext);
  if (!ctx) {
    throw new Error("useSchoolData must be used inside SchoolDataProvider");
  }
  return ctx;
}
