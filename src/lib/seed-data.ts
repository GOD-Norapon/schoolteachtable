import {
  AcademicTerm,
  Classroom,
  Department,
  Division,
  GradeLevel,
  GroupMeetingLock,
  Room,
  SchoolDataset,
  Subject,
  SynchronizedBlock,
  Teacher,
  TeachingAssignment,
  TimetableVersion,
} from "@/types/timetable";

export function createDefaultTerm(id = "term_2569_1"): AcademicTerm {
  return {
    id,
    name: "ภาคเรียนที่ 1 ปีการศึกษา 2569",
    schoolName: "โรงเรียนสาธิตวิทยาคม",
    academicYear: "2569",
    semester: "1",
    isActive: true,
    dataEntryOpen: true,
    daysOfWeek: ["MON", "TUE", "WED", "THU", "FRI"],
    periodsConfig: [
      { period: 1, label: "คาบ 1", startTime: "08:30", endTime: "09:20", session: "morning", isLatePeriod: false },
      { period: 2, label: "คาบ 2", startTime: "09:20", endTime: "10:10", session: "morning", isLatePeriod: false },
      { period: 3, label: "คาบ 3", startTime: "10:30", endTime: "11:20", session: "morning", isLatePeriod: false },
      { period: 4, label: "คาบ 4", startTime: "11:20", endTime: "12:10", session: "morning", isLatePeriod: false },
      { period: 5, label: "คาบ 5", startTime: "13:00", endTime: "13:50", session: "afternoon", isLatePeriod: false },
      { period: 6, label: "คาบ 6", startTime: "13:50", endTime: "14:40", session: "afternoon", isLatePeriod: false },
      { period: 7, label: "คาบ 7", startTime: "14:40", endTime: "15:30", session: "afternoon", isLatePeriod: false },
      { period: 8, label: "คาบ 8", startTime: "15:30", endTime: "16:20", session: "afternoon", isLatePeriod: true },
    ],
    breaksConfig: [
      {
        id: "brk_morning",
        afterPeriod: 2,
        durationMinutes: 20,
        label: "พักเบรกเช้า 20 นาที (10:10–10:30)",
        blocksConsecutive: true, // ข้อ 12: บังคับคาบคู่ช่วงเช้าลงได้เฉพาะ 1-2 หรือ 3-4 เท่านั้น
      },
      {
        id: "brk_lunch",
        afterPeriod: 4,
        durationMinutes: 50,
        label: "พักกลางวัน (12:10–13:00)",
        blocksConsecutive: true,
      },
    ],
    solverSettings: {
      maxAfternoonConsecutive: 2, // ข้อ 10: ตอนบ่ายห้ามสอน 3 คาบติด (สูงสุด 2 คาบติด)
      maxLatePeriodDaysPerWeek: 2, // ข้อ 11: สอนคาบ 8 ได้ไม่เกิน 2 วัน/สัปดาห์ (ตั้งได้ 1-3 วัน)
      minLatePeriodDaysPerWeek: 0,
      countActivitiesInTeacherLimits: false,
      preferFreePeriodsLate: true,
      optimizationSeconds: 6,
    },
  };
}

export function createStandard60Classrooms(termId: string): Classroom[] {
  const grades = [
    { id: "g_m1", code: "M1", name: "ม.1", stage: "junior" as const },
    { id: "g_m2", code: "M2", name: "ม.2", stage: "junior" as const },
    { id: "g_m3", code: "M3", name: "ม.3", stage: "junior" as const },
    { id: "g_m4", code: "M4", name: "ม.4", stage: "senior" as const },
    { id: "g_m5", code: "M5", name: "ม.5", stage: "senior" as const },
    { id: "g_m6", code: "M6", name: "ม.6", stage: "senior" as const },
  ];

  const list: Classroom[] = [];
  for (const g of grades) {
    for (let r = 1; r <= 10; r++) {
      let programName = "ห้องเรียนปกติ";
      if (r <= 2) {
        programName = g.stage === "junior" ? "วิทย์-คณิตเข้มข้น" : "วิทย์-คณิต";
      } else if (g.code === "M2" && r >= 7) {
        programName = "ห้องเรียนปกติ (กลุ่มวิชาเลือก)";
      } else if (g.stage === "senior" && r >= 7) {
        programName = "ศิลป์-ภาษา";
      }

      list.push({
        id: `c_${g.code.toLowerCase()}_${r}`,
        termId,
        gradeLevelId: g.id,
        name: `${g.name}/${r}`,
        roomNumber: r,
        programName,
        defaultRoomId: null,
        advisorTeacherIds: [],
        freePeriodsCount: 2,
        lockedFreeSlots: [],
        preferredFreePeriods: [7, 8],
      });
    }
  }
  return list;
}

export function createSeedDataset(): SchoolDataset {
  const termId = "term_2569_1";
  const term = createDefaultTerm(termId);

  const departments: Department[] = [
    {
      id: "dept_thai",
      termId,
      code: "TH",
      name: "ภาษาไทย",
      color: "#d97706",
      exemptAfternoonStreak: false,
      exemptLatePeriodLimit: false,
      customMaxLatePeriodDays: null,
      isEntryCompleted: true,
      completedBy: "ครูนภา (หัวหน้ากลุ่มสาระ)",
    },
    {
      id: "dept_math",
      termId,
      code: "MA",
      name: "คณิตศาสตร์",
      color: "#2563eb",
      exemptAfternoonStreak: false,
      exemptLatePeriodLimit: false,
      customMaxLatePeriodDays: null,
      isEntryCompleted: true,
      completedBy: "ครูสมศักดิ์",
    },
    {
      id: "dept_sci",
      termId,
      code: "SC",
      name: "วิทยาศาสตร์และเทคโนโลยี",
      color: "#059669",
      exemptAfternoonStreak: false,
      exemptLatePeriodLimit: false,
      customMaxLatePeriodDays: null,
      isEntryCompleted: true,
      completedBy: "ดร.กานดา",
    },
    {
      id: "dept_soc",
      termId,
      code: "SO",
      name: "สังคมศึกษา ศาสนาและวัฒนธรรม",
      color: "#7c3aed",
      exemptAfternoonStreak: false,
      exemptLatePeriodLimit: false,
      customMaxLatePeriodDays: null,
      isEntryCompleted: true,
      completedBy: "ครูวีระ",
    },
    {
      id: "dept_pe",
      termId,
      code: "PE",
      name: "สุขศึกษาและพลศึกษา",
      color: "#dc2626",
      exemptAfternoonStreak: true, // ข้อ 10: ตัวอย่างกลุ่มสาระที่ได้รับยกเว้นบ่าย 3 คาบติด
      exemptLatePeriodLimit: true, // ข้อ 11: ตัวอย่างกลุ่มสาระที่ได้รับยกเว้นเพดานคาบ 8
      customMaxLatePeriodDays: null,
      isEntryCompleted: true,
      completedBy: "ครูเกรียงไกร",
    },
    {
      id: "dept_art",
      termId,
      code: "AR",
      name: "ศิลปะ",
      color: "#db2777",
      exemptAfternoonStreak: true,
      exemptLatePeriodLimit: false,
      customMaxLatePeriodDays: 3,
      isEntryCompleted: true,
      completedBy: "ครูพิมพ์ชนก",
    },
    {
      id: "dept_occ",
      termId,
      code: "OC",
      name: "การงานอาชีพ",
      color: "#ca8a04",
      exemptAfternoonStreak: true,
      exemptLatePeriodLimit: false,
      customMaxLatePeriodDays: 3,
      isEntryCompleted: true,
      completedBy: "ครูสุชาติ",
    },
    {
      id: "dept_lang",
      termId,
      code: "EN",
      name: "ภาษาต่างประเทศ",
      color: "#0891b2",
      exemptAfternoonStreak: false,
      exemptLatePeriodLimit: false,
      customMaxLatePeriodDays: null,
      isEntryCompleted: true,
      completedBy: "ครูอารยา",
    },
    {
      id: "dept_act",
      termId,
      code: "AC",
      name: "กิจกรรมพัฒนาผู้เรียน / แนะแนว",
      color: "#4f46e5",
      exemptAfternoonStreak: true,
      exemptLatePeriodLimit: true,
      customMaxLatePeriodDays: null,
      isEntryCompleted: true,
      completedBy: "ครูศิริพร",
    },
  ];

  const divisions: Division[] = [
    { id: "div_academic", termId, name: "ฝ่ายบริหารวิชาการ", color: "#2563eb" },
    { id: "div_student", termId, name: "ฝ่ายกิจการนักเรียน", color: "#16a34a" },
    { id: "div_plan", termId, name: "ฝ่ายแผนงานและงบประมาณ", color: "#9333ea" },
  ];

  const rooms: Room[] = [
    // ห้องประจำชั้น
    { id: "rm_111", termId, code: "111", name: "ห้อง ม.1/1", building: "อาคาร 1", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_112", termId, code: "112", name: "ห้อง ม.1/2", building: "อาคาร 1", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_121", termId, code: "121", name: "ห้อง ม.2/1", building: "อาคาร 1", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_127", termId, code: "127", name: "ห้อง ม.2/7", building: "อาคาร 1", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_128", termId, code: "128", name: "ห้อง ม.2/8", building: "อาคาร 1", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_129", termId, code: "129", name: "ห้อง ม.2/9", building: "อาคาร 1", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_130", termId, code: "130", name: "ห้อง ม.2/10", building: "อาคาร 1", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_131", termId, code: "131", name: "ห้อง ม.3/1", building: "อาคาร 1", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_241", termId, code: "241", name: "ห้อง ม.4/1", building: "อาคาร 2", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_242", termId, code: "242", name: "ห้อง ม.4/2", building: "อาคาร 2", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_251", termId, code: "251", name: "ห้อง ม.5/1", building: "อาคาร 2", roomType: "homeroom", maxConcurrentClasses: 1 },
    { id: "rm_261", termId, code: "261", name: "ห้อง ม.6/1", building: "อาคาร 2", roomType: "homeroom", maxConcurrentClasses: 1 },
    // ห้องปฏิบัติการพิเศษ / ห้องใช้ร่วมกัน (ข้อ 9, 18)
    { id: "rm_lab_sci1", termId, code: "LAB-SCI1", name: "ห้องปฏิบัติการวิทยาศาสตร์ 1", building: "อาคารวิทย์", roomType: "lab", maxConcurrentClasses: 1 },
    { id: "rm_lab_chem", termId, code: "LAB-CHEM", name: "ห้องปฏิบัติการเคมี (ใช้ร่วมกัน)", building: "อาคารวิทย์", roomType: "lab", maxConcurrentClasses: 1 },
    { id: "rm_lab_phys", termId, code: "LAB-PHYS", name: "ห้องปฏิบัติการฟิสิกส์", building: "อาคารวิทย์", roomType: "lab", maxConcurrentClasses: 1 },
    { id: "rm_com1", termId, code: "COM-1", name: "ห้องปฏิบัติการคอมพิวเตอร์ 1 (ใช้ร่วมกัน)", building: "อาคารไอที", roomType: "computer", maxConcurrentClasses: 1 },
    { id: "rm_com2", termId, code: "COM-2", name: "ห้องปฏิบัติการคอมพิวเตอร์ 2", building: "อาคารไอที", roomType: "computer", maxConcurrentClasses: 1 },
    { id: "rm_art", termId, code: "ART-1", name: "ห้องปฏิบัติการทัศนศิลป์", building: "อาคารศิลปะ", roomType: "art_music", maxConcurrentClasses: 1 },
    { id: "rm_gym", termId, code: "GYM-1", name: "โรงพลศึกษา", building: "สนามกีฬา", roomType: "sport", maxConcurrentClasses: 1 },
    { id: "rm_hall", termId, code: "HALL", name: "หอประชุมเกียรติยศ (อบรมคุณธรรม)", building: "อาคารกลาง", roomType: "hall", maxConcurrentClasses: 1 },
  ];

  const gradeLevels: GradeLevel[] = [
    { id: "g_m1", termId, code: "M1", name: "ม.1", stage: "junior", sortOrder: 1 },
    { id: "g_m2", termId, code: "M2", name: "ม.2", stage: "junior", sortOrder: 2 },
    { id: "g_m3", termId, code: "M3", name: "ม.3", stage: "junior", sortOrder: 3 },
    { id: "g_m4", termId, code: "M4", name: "ม.4", stage: "senior", sortOrder: 4 },
    { id: "g_m5", termId, code: "M5", name: "ม.5", stage: "senior", sortOrder: 5 },
    { id: "g_m6", termId, code: "M6", name: "ม.6", stage: "senior", sortOrder: 6 },
  ];

  const allDaysFirstPeriodLock = (reason: string) =>
    (["MON", "TUE", "WED", "THU", "FRI"] as const).map((day) => ({
      day,
      period: 1,
      type: "hard" as const,
      reason,
    }));

  const teachers: Teacher[] = [
    // ภาษาไทย (3 คน)
    {
      id: "t_th1",
      termId,
      code: "TH01",
      prefix: "นาง",
      firstName: "นภา",
      lastName: "วรรณศิลป์",
      departmentId: "dept_thai",
      divisionIds: ["div_academic"],
      unavailableSlots: allDaysFirstPeriodLock("ไม่สะดวกสอนคาบแรกของทุกวัน (ข้อ 8)"),
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_th2",
      termId,
      code: "TH02",
      prefix: "น.ส.",
      firstName: "กมลวรรณ",
      lastName: "คำเจริญ",
      departmentId: "dept_thai",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_th3",
      termId,
      code: "TH03",
      prefix: "นาย",
      firstName: "ธีรภัทร",
      lastName: "อักษรทอง",
      departmentId: "dept_thai",
      divisionIds: ["div_student"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    // คณิตศาสตร์ (4 คน)
    {
      id: "t_ma1",
      termId,
      code: "MA01",
      prefix: "นาย",
      firstName: "สมศักดิ์",
      lastName: "ตรรกะดี",
      departmentId: "dept_math",
      divisionIds: ["div_academic"],
      unavailableSlots: allDaysFirstPeriodLock("ล็อคคาบแรกทุกวัน - งานตรวจข้อสอบกลาง (ข้อ 8)"),
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_ma2",
      termId,
      code: "MA02",
      prefix: "น.ส.",
      firstName: "ปิยะดา",
      lastName: "พหุนาม",
      departmentId: "dept_math",
      divisionIds: ["div_plan"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_ma3",
      termId,
      code: "MA03",
      prefix: "นาย",
      firstName: "อนุชา",
      lastName: "สถิติแม่น",
      departmentId: "dept_math",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_ma4",
      termId,
      code: "MA04",
      prefix: "นาง",
      firstName: "รัตนา",
      lastName: "แคลคูลัส",
      departmentId: "dept_math",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    // วิทยาศาสตร์และเทคโนโลยี (6 คน - มีการใช้ LAB-CHEM และ COM-1 ร่วมกันระหว่างครู 2 คน ข้อ 9)
    {
      id: "t_sc1",
      termId,
      code: "SC01",
      prefix: "ดร.",
      firstName: "กานดา",
      lastName: "อะตอมชน",
      departmentId: "dept_sci",
      divisionIds: ["div_academic"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_sc2",
      termId,
      code: "SC02",
      prefix: "นาย",
      firstName: "วรพจน์",
      lastName: "โมเลกุล",
      departmentId: "dept_sci",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_sc3",
      termId,
      code: "SC03",
      prefix: "นาย",
      firstName: "ชญานนท์",
      lastName: "แรงโน้มถ่วง",
      departmentId: "dept_sci",
      divisionIds: ["div_student"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_sc4",
      termId,
      code: "SC04",
      prefix: "น.ส.",
      firstName: "มินตรา",
      lastName: "ชีวภาพ",
      departmentId: "dept_sci",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_com1",
      termId,
      code: "IT01",
      prefix: "นาย",
      firstName: "ธนกร",
      lastName: "โค้ดดิ้ง",
      departmentId: "dept_sci",
      divisionIds: ["div_plan"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_com2",
      termId,
      code: "IT02",
      prefix: "น.ส.",
      firstName: "แพรวพรรณ",
      lastName: "ดิจิทัล",
      departmentId: "dept_sci",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    // สังคมศึกษา (3 คน)
    {
      id: "t_so1",
      termId,
      code: "SO01",
      prefix: "นาย",
      firstName: "วีระ",
      lastName: "ธรรมรักษ์",
      departmentId: "dept_soc",
      divisionIds: ["div_student"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_so2",
      termId,
      code: "SO02",
      prefix: "นาง",
      firstName: "สุดา",
      lastName: "ภูมิศาสตร์",
      departmentId: "dept_soc",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_so3",
      termId,
      code: "SO03",
      prefix: "นาย",
      firstName: "พงศธร",
      lastName: "พงศาวดาร",
      departmentId: "dept_soc",
      divisionIds: ["div_plan"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    // สุขศึกษาและพลศึกษา (2 คน)
    {
      id: "t_pe1",
      termId,
      code: "PE01",
      prefix: "นาย",
      firstName: "เกรียงไกร",
      lastName: "ใจนักกีฬา",
      departmentId: "dept_pe",
      divisionIds: ["div_student"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_pe2",
      termId,
      code: "PE02",
      prefix: "นาย",
      firstName: "ศุภชัย",
      lastName: "พลานามัย",
      departmentId: "dept_pe",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    // ศิลปะ (2 คน)
    {
      id: "t_ar1",
      termId,
      code: "AR01",
      prefix: "น.ส.",
      firstName: "พิมพ์ชนก",
      lastName: "จิตรกร",
      departmentId: "dept_art",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_ar2",
      termId,
      code: "AR02",
      prefix: "นาย",
      firstName: "กิตติศักดิ์",
      lastName: "ดุริยางค์",
      departmentId: "dept_art",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    // การงานอาชีพ (2 คน)
    {
      id: "t_oc1",
      termId,
      code: "OC01",
      prefix: "นาย",
      firstName: "สุชาติ",
      lastName: "ช่างประดิษฐ์",
      departmentId: "dept_occ",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_oc2",
      termId,
      code: "OC02",
      prefix: "นาง",
      firstName: "มาลี",
      lastName: "โภชนา",
      departmentId: "dept_occ",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    // ภาษาต่างประเทศ (5 คน - มีครูต่างชาติสอนร่วม Co-teaching ข้อ 14)
    {
      id: "t_en1",
      termId,
      code: "EN01",
      prefix: "น.ส.",
      firstName: "อารยา",
      lastName: "อินเตอร์",
      departmentId: "dept_lang",
      divisionIds: ["div_academic"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_en2",
      termId,
      code: "EN02",
      prefix: "น.ส.",
      firstName: "ชนิดา",
      lastName: "แกรมม่า",
      departmentId: "dept_lang",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_en3",
      termId,
      code: "EN04",
      prefix: "นาย",
      firstName: "ภานุวัฒน์",
      lastName: "โฟเนติกส์",
      departmentId: "dept_lang",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_en_native",
      termId,
      code: "EN03",
      prefix: "Mr.",
      firstName: "Daniel",
      lastName: "Wright",
      departmentId: "dept_lang",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_cn1",
      termId,
      code: "CN01",
      prefix: "เหล่าซือ",
      firstName: "หลิน",
      lastName: "เหมยฮวา",
      departmentId: "dept_lang",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    {
      id: "t_kr1",
      termId,
      code: "KR01",
      prefix: "น.ส.",
      firstName: "มินจี",
      lastName: "ฮันกึล",
      departmentId: "dept_lang",
      divisionIds: [],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
    // แนะแนว (1 คน)
    {
      id: "t_gu1",
      termId,
      code: "GU01",
      prefix: "นาง",
      firstName: "ศิริพร",
      lastName: "แนะแนวดี",
      departmentId: "dept_act",
      divisionIds: ["div_student"],
      unavailableSlots: [],
      exemptAfternoonStreakOverride: null,
      exemptLatePeriodLimitOverride: null,
      maxLatePeriodDaysOverride: null,
    },
  ];

  // ข้อ 7: ล็อคคาบประชุมของครูแต่ละฝ่าย
  const groupMeetingLocks: GroupMeetingLock[] = [
    {
      id: "mtg_academic",
      termId,
      divisionName: "ฝ่ายบริหารวิชาการ",
      targetType: "division",
      targetId: "div_academic",
      title: "ประชุมฝ่ายบริหารวิชาการ",
      day: "TUE",
      startPeriod: 8,
      duration: 1,
      teacherIds: teachers.filter((t) => t.divisionIds.includes("div_academic")).map((t) => t.id),
      roomId: null,
    },
    {
      id: "mtg_student",
      termId,
      divisionName: "ฝ่ายกิจการนักเรียน",
      targetType: "division",
      targetId: "div_student",
      title: "ประชุมฝ่ายกิจการนักเรียน",
      day: "MON",
      startPeriod: 8,
      duration: 1,
      teacherIds: teachers.filter((t) => t.divisionIds.includes("div_student")).map((t) => t.id),
      roomId: null,
    },
    {
      id: "mtg_plan",
      termId,
      divisionName: "ฝ่ายแผนงานและงบประมาณ",
      targetType: "division",
      targetId: "div_plan",
      title: "ประชุมฝ่ายแผนงานและงบประมาณ",
      day: "WED",
      startPeriod: 8,
      duration: 1,
      teacherIds: teachers.filter((t) => t.divisionIds.includes("div_plan")).map((t) => t.id),
      roomId: null,
    },
  ];

  // ห้องเรียน ม.1 - ม.6 มีชั้นละ 10 ห้อง รวม 60 ห้อง (ม.1/1 - ม.6/10) (ข้อ 1)
  const base60Classrooms = createStandard60Classrooms(termId);
  const demoRoomsMap = new Map<string, Partial<Classroom>>([
    ["c_m1_1", { defaultRoomId: "rm_111", advisorTeacherIds: ["t_ma1", "t_sc4"], freePeriodsCount: 0 }],
    ["c_m1_2", { defaultRoomId: "rm_112", advisorTeacherIds: ["t_th2"], freePeriodsCount: 2 }],
    ["c_m2_1", { defaultRoomId: "rm_121", advisorTeacherIds: ["t_ma2", "t_en2"], freePeriodsCount: 0 }],
    ["c_m2_7", { defaultRoomId: "rm_127", advisorTeacherIds: ["t_so2"], freePeriodsCount: 2 }],
    ["c_m2_8", { defaultRoomId: "rm_128", advisorTeacherIds: ["t_oc1"], freePeriodsCount: 2 }],
    ["c_m2_9", { defaultRoomId: "rm_129", advisorTeacherIds: ["t_ar1"], freePeriodsCount: 3 }],
    ["c_m2_10", { defaultRoomId: "rm_130", advisorTeacherIds: ["t_com2"], freePeriodsCount: 3 }],
    ["c_m3_1", { defaultRoomId: "rm_131", advisorTeacherIds: ["t_ma3", "t_th3"], freePeriodsCount: 2 }],
    ["c_m4_1", { defaultRoomId: "rm_241", advisorTeacherIds: ["t_sc1", "t_ma4"], freePeriodsCount: 1 }],
    ["c_m4_2", { defaultRoomId: "rm_242", advisorTeacherIds: ["t_en1", "t_cn1"], freePeriodsCount: 3 }],
    ["c_m5_1", { defaultRoomId: "rm_251", advisorTeacherIds: ["t_sc2", "t_so3"], freePeriodsCount: 2 }],
    ["c_m6_1", { defaultRoomId: "rm_261", advisorTeacherIds: ["t_sc3", "t_th1"], freePeriodsCount: 3 }],
  ]);

  const classrooms: Classroom[] = base60Classrooms.map((c) => {
    const demo = demoRoomsMap.get(c.id);
    if (demo) {
      return { ...c, ...demo };
    }
    // สำหรับห้องเรียนอื่นๆ ที่ยังไม่ได้ลงคาบวิชาการ ให้ตั้งคาบอิสระเริ่มต้นไว้เพื่อให้ยอดรวมครบ 40 คาบพอดี
    const isJunior = ["g_m1", "g_m2", "g_m3"].includes(c.gradeLevelId);
    return {
      ...c,
      freePeriodsCount: isJunior ? 36 : 34,
    };
  });

  const defaultRules = () => ({
    preferredPeriods: [] as number[],
    forbiddenPeriods: [] as number[],
    allowedPeriodsOnly: null as number[] | null,
    preferAfterSubjectIds: [] as string[],
    preferBeforeSubjectIds: [] as string[],
    preferMorning: false,
    allowSameDayRepeat: false,
  });

  const subjects: Subject[] = [
    { id: "sub_th", termId, code: "ท21101", name: "ภาษาไทยพื้นฐาน", shortName: "ไทย", departmentId: "dept_thai", subjectType: "core", credits: 1.5, defaultPeriodsPerWeek: 3, defaultSplitPattern: [1, 1, 1], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_th_sr", termId, code: "ท31101", name: "ภาษาไทย ม.ปลาย", shortName: "ไทย", departmentId: "dept_thai", subjectType: "core", credits: 1.0, defaultPeriodsPerWeek: 2, defaultSplitPattern: [1, 1], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_ma", termId, code: "ค21101", name: "คณิตศาสตร์พื้นฐาน", shortName: "คณิต", departmentId: "dept_math", subjectType: "core", credits: 1.5, defaultPeriodsPerWeek: 3, defaultSplitPattern: [1, 1, 1], defaultRoomId: null, rules: { ...defaultRules(), preferMorning: true } },
    { id: "sub_ma_add", termId, code: "ค21201", name: "คณิตศาสตร์เพิ่มเติม", shortName: "คณิตเพิ่ม", departmentId: "dept_math", subjectType: "additional", credits: 1.0, defaultPeriodsPerWeek: 2, defaultSplitPattern: [2], defaultRoomId: null, rules: { ...defaultRules(), preferMorning: true } },
    { id: "sub_sc", termId, code: "ว21101", name: "วิทยาศาสตร์พื้นฐาน", shortName: "วิทย์", departmentId: "dept_sci", subjectType: "core", credits: 1.5, defaultPeriodsPerWeek: 3, defaultSplitPattern: [2, 1], defaultRoomId: "rm_lab_sci1", rules: defaultRules() },
    { id: "sub_chem", termId, code: "ว30221", name: "เคมีเพิ่มเติม (แล็บร่วม)", shortName: "เคมี", departmentId: "dept_sci", subjectType: "additional", credits: 1.5, defaultPeriodsPerWeek: 3, defaultSplitPattern: [2, 1], defaultRoomId: "rm_lab_chem", rules: defaultRules() },
    { id: "sub_phys", termId, code: "ว30201", name: "ฟิสิกส์เพิ่มเติม", shortName: "ฟิสิกส์", departmentId: "dept_sci", subjectType: "additional", credits: 2.0, defaultPeriodsPerWeek: 4, defaultSplitPattern: [2, 2], defaultRoomId: "rm_lab_phys", rules: defaultRules() },
    { id: "sub_bio", termId, code: "ว30241", name: "ชีววิทยาเพิ่มเติม", shortName: "ชีวะ", departmentId: "dept_sci", subjectType: "additional", credits: 1.5, defaultPeriodsPerWeek: 3, defaultSplitPattern: [2, 1], defaultRoomId: "rm_lab_sci1", rules: defaultRules() },
    { id: "sub_com", termId, code: "ว21181", name: "วิทยาการคำนวณ (ห้องคอมร่วม)", shortName: "คอมฯ", departmentId: "dept_sci", subjectType: "core", credits: 1.0, defaultPeriodsPerWeek: 2, defaultSplitPattern: [2], defaultRoomId: "rm_com1", rules: defaultRules() },
    { id: "sub_so", termId, code: "ส21101", name: "สังคมศึกษา", shortName: "สังคม", departmentId: "dept_soc", subjectType: "core", credits: 1.5, defaultPeriodsPerWeek: 3, defaultSplitPattern: [1, 1, 1], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_hi", termId, code: "ส21102", name: "ประวัติศาสตร์", shortName: "ประวัติฯ", departmentId: "dept_soc", subjectType: "core", credits: 0.5, defaultPeriodsPerWeek: 1, defaultSplitPattern: [1], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_he", termId, code: "พ21101", name: "สุขศึกษา", shortName: "สุขศึกษา", departmentId: "dept_pe", subjectType: "core", credits: 0.5, defaultPeriodsPerWeek: 1, defaultSplitPattern: [1], defaultRoomId: null, rules: defaultRules() },
    // ข้อ 17: ศิลปะ และ พลศึกษา (ถ้าเป็นไปได้ให้พละเรียนคาบ 4 หรือ 8 และก่อนวิชาพละเรียนศิลปะ!)
    {
      id: "sub_art",
      termId,
      code: "ศ21101",
      name: "ทัศนศิลป์และดนตรี",
      shortName: "ศิลปะ",
      departmentId: "dept_art",
      subjectType: "core",
      credits: 1.0,
      defaultPeriodsPerWeek: 1,
      defaultSplitPattern: [1],
      defaultRoomId: null,
      rules: {
        ...defaultRules(),
        preferBeforeSubjectIds: ["sub_pe"], // อยู่ก่อนหน้าวิชาพละ
      },
    },
    {
      id: "sub_pe",
      termId,
      code: "พ21102",
      name: "พลศึกษา",
      shortName: "พละ",
      departmentId: "dept_pe",
      subjectType: "core",
      credits: 0.5,
      defaultPeriodsPerWeek: 1,
      defaultSplitPattern: [1],
      defaultRoomId: "rm_gym",
      rules: {
        ...defaultRules(),
        preferredPeriods: [4, 8], // ถ้าเป็นไปได้ให้เรียนคาบ 4 หรือ 8
        preferAfterSubjectIds: ["sub_art"], // ก่อนวิชาพละให้เรียนศิลปะ
      },
    },
    { id: "sub_oc", termId, code: "ง21101", name: "การงานอาชีพ", shortName: "การงาน", departmentId: "dept_occ", subjectType: "core", credits: 1.0, defaultPeriodsPerWeek: 2, defaultSplitPattern: [2], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_en", termId, code: "อ21101", name: "ภาษาอังกฤษพื้นฐาน", shortName: "อังกฤษ", departmentId: "dept_lang", subjectType: "core", credits: 1.5, defaultPeriodsPerWeek: 3, defaultSplitPattern: [1, 1, 1], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_en_comm", termId, code: "อ21201", name: "อังกฤษเพื่อการสื่อสาร (ครูร่วม 2 คน)", shortName: "Eng-Comm", departmentId: "dept_lang", subjectType: "additional", credits: 1.0, defaultPeriodsPerWeek: 2, defaultSplitPattern: [1, 1], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_cn", termId, code: "จ20201", name: "ภาษาจีนเพื่อการสื่อสาร", shortName: "จีน", departmentId: "dept_lang", subjectType: "additional", credits: 1.0, defaultPeriodsPerWeek: 2, defaultSplitPattern: [1, 1], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_kr", termId, code: "ก30201", name: "ภาษาเกาหลีเข้มข้น", shortName: "เกาหลี", departmentId: "dept_lang", subjectType: "additional", credits: 2.0, defaultPeriodsPerWeek: 4, defaultSplitPattern: [2, 2], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_gu", termId, code: "ก21901", name: "แนะแนว", shortName: "แนะแนว", departmentId: "dept_act", subjectType: "activity", credits: 0, defaultPeriodsPerWeek: 1, defaultSplitPattern: [1], defaultRoomId: null, rules: defaultRules() },
    { id: "sub_proj", termId, code: "ว20299", name: "โครงงานวิทยาศาสตร์", shortName: "โครงงานวิทย์", departmentId: "dept_sci", subjectType: "additional", credits: 1.0, defaultPeriodsPerWeek: 2, defaultSplitPattern: [2], defaultRoomId: null, rules: defaultRules() },
  ];

  // คาบล็อคและคาบเรียนพร้อมกัน (ข้อ 1, 3, 4, 5, 6, 13)
  const allClassroomIds = classrooms.map((c) => c.id);
  const juniorClassroomIds = classrooms.filter((c) => ["g_m1", "g_m2", "g_m3"].includes(c.gradeLevelId)).map((c) => c.id);
  const seniorClassroomIds = classrooms.filter((c) => ["g_m4", "g_m5", "g_m6"].includes(c.gradeLevelId)).map((c) => c.id);

  const synchronizedBlocks: SynchronizedBlock[] = [
    // ข้อ 1 & 2: ชุมนุม เรียนเหมือนกันทุกระดับชั้น ปรากฏในตารางสอนของครูทุกคน
    {
      id: "sync_club",
      termId,
      blockType: "school_lock",
      category: "school",
      title: "กิจกรรมชุมนุม (ทั้งโรงเรียน)",
      subjectCode: "ก20902",
      gradeLevelIds: ["g_m1", "g_m2", "g_m3", "g_m4", "g_m5", "g_m6"],
      classroomIds: allClassroomIds,
      bindAdvisorsAutomatically: false,
      bindAllTeachers: true, // ข้อ 2: ให้คาบนั้นปรากฏของครูด้วย
      teacherIds: [],
      sharedRoomId: null,
      offerings: [],
      duration: 1,
      isTimeLocked: true,
      fixedDay: "THU",
      fixedStartPeriod: 8,
    },
    // ข้อ 3: ลูกเสือ-เนตรนารี เรียนเหมือนกัน ม.1-ม.3 ปรากฏในตารางนักเรียน ไม่ต้องลงในคาบครู
    {
      id: "sync_scout",
      termId,
      blockType: "grade_sync",
      category: "grade",
      title: "ลูกเสือ-เนตรนารี (ม.1–ม.3)",
      subjectCode: "ก21903",
      gradeLevelIds: ["g_m1", "g_m2", "g_m3"],
      classroomIds: juniorClassroomIds,
      bindAdvisorsAutomatically: false, // ข้อ 3: ลงในของนักเรียน ไม่ต้องลงในคาบครู
      studentOnly: true,
      teacherIds: [],
      sharedRoomId: null,
      offerings: [],
      duration: 1,
      isTimeLocked: true,
      fixedDay: "WED",
      fixedStartPeriod: 7,
    },
    // ข้อ 13: ศุกร์ คาบ 6-7-8 ของ ม.ปลายทุกห้องเป็นวิชา นศท. / บำเพ็ญประโยชน์
    {
      id: "sync_rotc",
      termId,
      blockType: "cohort_lock",
      category: "grade",
      title: "นักศึกษาวิชาทหาร (นศท.) / บำเพ็ญประโยชน์",
      subjectCode: "ก30904",
      gradeLevelIds: ["g_m4", "g_m5", "g_m6"],
      classroomIds: seniorClassroomIds,
      bindAdvisorsAutomatically: false,
      teacherIds: ["t_pe2"],
      sharedRoomId: null,
      offerings: [],
      duration: 3,
      isTimeLocked: true,
      fixedDay: "FRI",
      fixedStartPeriod: 6, // คาบ 6, 7, 8
    },
    // ข้อ 6: ม.2 ห้อง 7-8-9-10 เรียนวิชาเลือกพร้อมกัน โดยมีวิชาให้เลือก
    {
      id: "sync_m2_elective",
      termId,
      blockType: "elective_pool",
      category: "elective",
      title: "กลุ่มวิชาเลือกเสรี ม.2 (ห้อง 7-8-9-10)",
      subjectCode: "เลือกเสรี",
      gradeLevelIds: ["g_m2"],
      classroomIds: ["c_m2_7", "c_m2_8", "c_m2_9", "c_m2_10"],
      bindAdvisorsAutomatically: false,
      teacherIds: [],
      sharedRoomId: null,
      offerings: [
        { id: "off_robo", subjectId: null, subjectCode: "ว22288", subjectName: "หุ่นยนต์อัจฉริยะ", departmentId: "dept_sci", teacherIds: ["t_com2"], roomId: "rm_com2" },
        { id: "off_art", subjectId: null, subjectCode: "ศ22205", subjectName: "ศิลปะดิจิทัลและเพ้นท์", departmentId: "dept_art", teacherIds: ["t_ar2"], roomId: "rm_art" },
        { id: "off_kr", subjectId: null, subjectCode: "ก22202", subjectName: "ภาษาเกาหลีเบื้องต้น", departmentId: "dept_lang", teacherIds: ["t_kr1"], roomId: "rm_127" },
        { id: "off_cook", subjectId: null, subjectCode: "ง22204", subjectName: "เบเกอรี่และคหกรรม", departmentId: "dept_occ", teacherIds: ["t_oc2"], roomId: "rm_128" },
        { id: "off_pe", subjectId: null, subjectCode: "พ22201", subjectName: "แบดมินตันเพื่อสุขภาพ", departmentId: "dept_pe", teacherIds: ["t_pe2"], roomId: "rm_gym" },
      ],
      duration: 2,
      isTimeLocked: false, // ให้ Solver หาคาบคู่ที่ว่างตรงกันทั้ง 4 ห้องและครูทั้ง 4 คน!
      fixedDay: null,
      fixedStartPeriod: null,
    },
    // ข้อ 4 & 5: คาบอบรมคุณธรรม + Homeroom ประจำแต่ละระดับชั้น (ผูกครูที่ปรึกษาอัตโนมัติ และอบรมคุณธรรมใช้หอประชุม HALL ร่วมกันโดยไม่ชนคาบ!)
    ...(["g_m1", "g_m2", "g_m3", "g_m4", "g_m5", "g_m6"] as const).flatMap((gId, idx) => {
      const gName = `ม.${idx + 1}`;
      const gRooms = classrooms.filter((c) => c.gradeLevelId === gId).map((c) => c.id);
      return [
        {
          id: `sync_moral_${gId}`,
          termId,
          blockType: "moral_assembly" as const,
          category: "grade" as const,
          title: `อบรมคุณธรรม ${gName}`,
          subjectCode: "คุณธรรม",
          gradeLevelIds: [gId],
          classroomIds: gRooms,
          bindAdvisorsAutomatically: true, // ข้อ 3 & ข้อ 5: ครูที่ปรึกษาต้องเข้าคาบอบรมคุณธรรม
          teacherIds: [],
          sharedRoomId: "rm_hall", // ใช้หอประชุมรวม ระบบจะจัดไม่ให้ระดับชั้นชนกันเองอัตโนมัติ
          offerings: [],
          duration: 1,
          isTimeLocked: false,
          fixedDay: null,
          fixedStartPeriod: null,
        },
        {
          id: `sync_hr_${gId}`,
          termId,
          blockType: "homeroom" as const,
          category: "grade" as const,
          title: `พบครูที่ปรึกษา (Homeroom) ${gName}`,
          subjectCode: "HR",
          gradeLevelIds: [gId],
          classroomIds: gRooms,
          bindAdvisorsAutomatically: true, // ข้อ 3 & ข้อ 5: ตรงกันทั้งระดับชั้นและผูกครูที่ปรึกษาทุกคน
          teacherIds: [],
          sharedRoomId: null, // ใช้ห้องเรียนประจำของแต่ละห้อง
          offerings: [],
          duration: 1,
          isTimeLocked: false,
          fixedDay: null,
          fixedStartPeriod: null,
        },
      ];
    }),
  ];

  // Helper สร้างแผนการสอนรายห้องให้ครบ 40/40 คาบพอดีทุกห้อง
  let assignSeq = 1;
  const makeAssign = (
    classroomId: string,
    subjectId: string,
    splits: { duration: number; roomId?: string | null }[],
    teacherIds: string[],
    notes: string | null = null
  ): TeachingAssignment => ({
    id: `asg_${assignSeq++}`,
    termId,
    classroomId,
    subjectId,
    periodsPerWeek: splits.reduce((acc, s) => acc + s.duration, 0),
    splitSessions: splits.map((s) => ({ duration: s.duration, roomId: s.roomId ?? null })),
    teacherIds,
    notes,
    updatedBy: "Seed System",
  });

  const teachingAssignments: TeachingAssignment[] = [
    // ================= ม.1/1 (กิจกรรม 4 + อิสระ 0 + วิชาการ 36 = 40 คาบ) =================
    makeAssign("c_m1_1", "sub_ma", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_ma1"]), // 4
    makeAssign("c_m1_1", "sub_ma_add", [{ duration: 2 }], ["t_ma1"]), // 2
    makeAssign("c_m1_1", "sub_sc", [{ duration: 2, roomId: "rm_lab_sci1" }, { duration: 1 }, { duration: 1 }], ["t_sc4"]), // 4 (คาบคู่ใช้ห้องแล็บ คาบเดี่ยวใช้ห้องนักเรียน ข้อ 18)
    makeAssign("c_m1_1", "sub_com", [{ duration: 2, roomId: "rm_com1" }], ["t_com1"]), // 2 (ใช้ห้องคอมร่วม ข้อ 9)
    makeAssign("c_m1_1", "sub_proj", [{ duration: 2 }], ["t_sc4"]), // 2
    makeAssign("c_m1_1", "sub_th", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_th2"]), // 3
    makeAssign("c_m1_1", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en2"]), // 3
    makeAssign("c_m1_1", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en2", "t_en_native"], "สอนร่วมครูไทย+ต่างชาติ (ข้อ 14)"), // 2
    makeAssign("c_m1_1", "sub_cn", [{ duration: 1 }, { duration: 1 }], ["t_cn1"]), // 2
    makeAssign("c_m1_1", "sub_so", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_so1"]), // 3
    makeAssign("c_m1_1", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m1_1", "sub_he", [{ duration: 1 }], ["t_pe1"]), // 1
    makeAssign("c_m1_1", "sub_art", [{ duration: 1 }], ["t_ar1"]), // 1 (ก่อนพละ ข้อ 17)
    makeAssign("c_m1_1", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe1"]), // 1 (คาบ 4/8 ต่อจากศิลปะ ข้อ 17)
    makeAssign("c_m1_1", "sub_oc", [{ duration: 2 }], ["t_oc1"]), // 2
    makeAssign("c_m1_1", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1
    makeAssign("c_m1_1", "sub_chem", [{ duration: 2, roomId: "rm_lab_chem" }], ["t_sc1"]), // 2 (ใช้แล็บเคมีร่วมกับครู t_sc2 ข้อ 9)

    // ================= ม.1/2 (กิจกรรม 4 + อิสระ 2 + วิชาการ 34 = 40 คาบ) =================
    makeAssign("c_m1_2", "sub_ma", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_ma1"]), // 4
    makeAssign("c_m1_2", "sub_ma_add", [{ duration: 2 }], ["t_ma2"]), // 2
    makeAssign("c_m1_2", "sub_sc", [{ duration: 2, roomId: "rm_lab_sci1" }, { duration: 1 }, { duration: 1 }], ["t_sc4"]), // 4
    makeAssign("c_m1_2", "sub_com", [{ duration: 2, roomId: "rm_com1" }], ["t_com2"]), // 2 (ครู IT02 ใช้ห้อง COM-1 ร่วมกับ IT01 ข้อ 9!)
    makeAssign("c_m1_2", "sub_th", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_th2"]), // 3
    makeAssign("c_m1_2", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en2"]), // 3
    makeAssign("c_m1_2", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en2", "t_en_native"], "สอนร่วมครูไทย+ต่างชาติ"), // 2
    makeAssign("c_m1_2", "sub_cn", [{ duration: 1 }, { duration: 1 }], ["t_cn1"]), // 2
    makeAssign("c_m1_2", "sub_so", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_so1"]), // 3
    makeAssign("c_m1_2", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m1_2", "sub_he", [{ duration: 1 }], ["t_pe1"]), // 1
    makeAssign("c_m1_2", "sub_art", [{ duration: 1 }], ["t_ar1"]), // 1
    makeAssign("c_m1_2", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe1"]), // 1
    makeAssign("c_m1_2", "sub_oc", [{ duration: 2 }], ["t_oc1"]), // 2
    makeAssign("c_m1_2", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1
    makeAssign("c_m1_2", "sub_proj", [{ duration: 2 }], ["t_sc2"]), // 2

    // ================= ม.2/1 (กิจกรรม 4 + อิสระ 0 + วิชาการ 36 = 40 คาบ) =================
    makeAssign("c_m2_1", "sub_ma", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_ma2"]), // 4
    makeAssign("c_m2_1", "sub_ma_add", [{ duration: 2 }], ["t_ma2"]), // 2
    makeAssign("c_m2_1", "sub_sc", [{ duration: 2, roomId: "rm_lab_sci1" }, { duration: 1 }, { duration: 1 }], ["t_sc2"]), // 4
    makeAssign("c_m2_1", "sub_chem", [{ duration: 2, roomId: "rm_lab_chem" }], ["t_sc2"]), // 2 (ใช้แล็บเคมีร่วมกับ t_sc1 ข้อ 9!)
    makeAssign("c_m2_1", "sub_com", [{ duration: 2, roomId: "rm_com1" }], ["t_com1"]), // 2
    makeAssign("c_m2_1", "sub_proj", [{ duration: 2 }], ["t_sc3"]), // 2
    makeAssign("c_m2_1", "sub_th", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_th1"]), // 3
    makeAssign("c_m2_1", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en2"]), // 3
    makeAssign("c_m2_1", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en1", "t_en_native"]), // 2
    makeAssign("c_m2_1", "sub_cn", [{ duration: 1 }, { duration: 1 }], ["t_cn1"]), // 2
    makeAssign("c_m2_1", "sub_so", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_so2"]), // 3
    makeAssign("c_m2_1", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m2_1", "sub_he", [{ duration: 1 }], ["t_pe1"]), // 1
    makeAssign("c_m2_1", "sub_art", [{ duration: 1 }], ["t_ar1"]), // 1
    makeAssign("c_m2_1", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe1"]), // 1
    makeAssign("c_m2_1", "sub_oc", [{ duration: 2 }], ["t_oc1"]), // 2
    makeAssign("c_m2_1", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1

    // ================= ม.2/7 (กิจกรรม 4 + วิชาเลือกกลุ่ม 2 + อิสระ 2 + วิชาการ 32 = 40 คาบ) =================
    makeAssign("c_m2_7", "sub_ma", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_ma2"]), // 4
    makeAssign("c_m2_7", "sub_ma_add", [{ duration: 2 }], ["t_ma3"]), // 2
    makeAssign("c_m2_7", "sub_sc", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_sc4"]), // 4
    makeAssign("c_m2_7", "sub_com", [{ duration: 2, roomId: "rm_com1" }], ["t_com2"]), // 2
    makeAssign("c_m2_7", "sub_th", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_th2"]), // 3
    makeAssign("c_m2_7", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en2"]), // 3
    makeAssign("c_m2_7", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en2", "t_en_native"]), // 2
    makeAssign("c_m2_7", "sub_cn", [{ duration: 1 }, { duration: 1 }], ["t_cn1"]), // 2
    makeAssign("c_m2_7", "sub_so", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_so2"]), // 3
    makeAssign("c_m2_7", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m2_7", "sub_he", [{ duration: 1 }], ["t_pe1"]), // 1
    makeAssign("c_m2_7", "sub_art", [{ duration: 1 }], ["t_ar1"]), // 1
    makeAssign("c_m2_7", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe1"]), // 1
    makeAssign("c_m2_7", "sub_oc", [{ duration: 2 }], ["t_oc1"]), // 2
    makeAssign("c_m2_7", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1

    // ================= ม.2/8 (กิจกรรม 4 + วิชาเลือกกลุ่ม 2 + อิสระ 2 + วิชาการ 32 = 40 คาบ) =================
    makeAssign("c_m2_8", "sub_ma", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_ma3"]), // 4
    makeAssign("c_m2_8", "sub_ma_add", [{ duration: 2 }], ["t_ma3"]), // 2
    makeAssign("c_m2_8", "sub_sc", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_sc2"]), // 4
    makeAssign("c_m2_8", "sub_com", [{ duration: 2, roomId: "rm_com2" }], ["t_com1"]), // 2
    makeAssign("c_m2_8", "sub_th", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_th3"]), // 3
    makeAssign("c_m2_8", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en3"]), // 3
    makeAssign("c_m2_8", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en3", "t_en_native"]), // 2
    makeAssign("c_m2_8", "sub_cn", [{ duration: 1 }, { duration: 1 }], ["t_cn1"]), // 2
    makeAssign("c_m2_8", "sub_so", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_so2"]), // 3
    makeAssign("c_m2_8", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m2_8", "sub_he", [{ duration: 1 }], ["t_pe2"]), // 1
    makeAssign("c_m2_8", "sub_art", [{ duration: 1 }], ["t_ar2"]), // 1
    makeAssign("c_m2_8", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe2"]), // 1
    makeAssign("c_m2_8", "sub_oc", [{ duration: 2 }], ["t_oc2"]), // 2
    makeAssign("c_m2_8", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1

    // ================= ม.2/9 (กิจกรรม 4 + วิชาเลือกกลุ่ม 2 + อิสระ 3 + วิชาการ 31 = 40 คาบ) =================
    makeAssign("c_m2_9", "sub_ma", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_ma3"]), // 3
    makeAssign("c_m2_9", "sub_ma_add", [{ duration: 2 }], ["t_ma4"]), // 2
    makeAssign("c_m2_9", "sub_sc", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_sc4"]), // 4
    makeAssign("c_m2_9", "sub_com", [{ duration: 2, roomId: "rm_com2" }], ["t_com2"]), // 2
    makeAssign("c_m2_9", "sub_th", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_th3"]), // 3
    makeAssign("c_m2_9", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en3"]), // 3
    makeAssign("c_m2_9", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en2", "t_en_native"]), // 2
    makeAssign("c_m2_9", "sub_cn", [{ duration: 1 }, { duration: 1 }], ["t_cn1"]), // 2
    makeAssign("c_m2_9", "sub_so", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_so2"]), // 3
    makeAssign("c_m2_9", "sub_hi", [{ duration: 1 }], ["t_so1"]), // 1
    makeAssign("c_m2_9", "sub_he", [{ duration: 1 }], ["t_pe2"]), // 1
    makeAssign("c_m2_9", "sub_art", [{ duration: 1 }], ["t_ar1"]), // 1
    makeAssign("c_m2_9", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe2"]), // 1
    makeAssign("c_m2_9", "sub_oc", [{ duration: 2 }], ["t_oc2"]), // 2
    makeAssign("c_m2_9", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1

    // ================= ม.2/10 (กิจกรรม 4 + วิชาเลือกกลุ่ม 2 + อิสระ 3 + วิชาการ 31 = 40 คาบ) =================
    makeAssign("c_m2_10", "sub_ma", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_ma4"]), // 3
    makeAssign("c_m2_10", "sub_ma_add", [{ duration: 2 }], ["t_ma4"]), // 2
    makeAssign("c_m2_10", "sub_sc", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_sc3"]), // 4
    makeAssign("c_m2_10", "sub_com", [{ duration: 2, roomId: "rm_com1" }], ["t_com2"]), // 2
    makeAssign("c_m2_10", "sub_th", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_th3"]), // 3
    makeAssign("c_m2_10", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en2"]), // 3
    makeAssign("c_m2_10", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en1", "t_en_native"]), // 2
    makeAssign("c_m2_10", "sub_cn", [{ duration: 1 }, { duration: 1 }], ["t_kr1"]), // 2
    makeAssign("c_m2_10", "sub_so", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_so1"]), // 3
    makeAssign("c_m2_10", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m2_10", "sub_he", [{ duration: 1 }], ["t_pe2"]), // 1
    makeAssign("c_m2_10", "sub_art", [{ duration: 1 }], ["t_ar2"]), // 1
    makeAssign("c_m2_10", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe2"]), // 1
    makeAssign("c_m2_10", "sub_oc", [{ duration: 2 }], ["t_oc1"]), // 2
    makeAssign("c_m2_10", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1

    // ================= ม.3/1 (กิจกรรม 4 + อิสระ 2 + วิชาการ 34 = 40 คาบ) =================
    makeAssign("c_m3_1", "sub_ma", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_ma3"]), // 4
    makeAssign("c_m3_1", "sub_ma_add", [{ duration: 2 }], ["t_ma1"]), // 2
    makeAssign("c_m3_1", "sub_sc", [{ duration: 2, roomId: "rm_lab_sci1" }, { duration: 1 }, { duration: 1 }], ["t_sc3"]), // 4
    makeAssign("c_m3_1", "sub_com", [{ duration: 2, roomId: "rm_com1" }], ["t_com1"]), // 2
    makeAssign("c_m3_1", "sub_proj", [{ duration: 2 }], ["t_sc3"]), // 2
    makeAssign("c_m3_1", "sub_th", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_th3"]), // 3
    makeAssign("c_m3_1", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en1"]), // 3
    makeAssign("c_m3_1", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en1", "t_en_native"]), // 2
    makeAssign("c_m3_1", "sub_cn", [{ duration: 1 }, { duration: 1 }], ["t_cn1"]), // 2
    makeAssign("c_m3_1", "sub_so", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_so1"]), // 3
    makeAssign("c_m3_1", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m3_1", "sub_he", [{ duration: 1 }], ["t_pe1"]), // 1
    makeAssign("c_m3_1", "sub_art", [{ duration: 1 }], ["t_ar2"]), // 1
    makeAssign("c_m3_1", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe1"]), // 1
    makeAssign("c_m3_1", "sub_oc", [{ duration: 2 }], ["t_oc2"]), // 2
    makeAssign("c_m3_1", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1

    // ================= ม.4/1 วิทย์-คณิต (กิจกรรม 6 [ชุมนุม1+นศท3+คุณธรรม1+HR1] + อิสระ 1 + วิชาการ 33 = 40 คาบ) =================
    makeAssign("c_m4_1", "sub_ma", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_ma4"]), // 3
    makeAssign("c_m4_1", "sub_ma_add", [{ duration: 2 }, { duration: 2 }], ["t_ma1"]), // 4
    makeAssign("c_m4_1", "sub_phys", [{ duration: 2, roomId: "rm_lab_phys" }, { duration: 2 }], ["t_sc3"]), // 4
    makeAssign("c_m4_1", "sub_chem", [{ duration: 2, roomId: "rm_lab_chem" }, { duration: 1 }], ["t_sc1"]), // 3
    makeAssign("c_m4_1", "sub_bio", [{ duration: 2, roomId: "rm_lab_sci1" }, { duration: 1 }], ["t_sc4"]), // 3
    makeAssign("c_m4_1", "sub_com", [{ duration: 2, roomId: "rm_com2" }], ["t_com1"]), // 2
    makeAssign("c_m4_1", "sub_th_sr", [{ duration: 1 }, { duration: 1 }], ["t_th1"]), // 2
    makeAssign("c_m4_1", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en1"]), // 3
    makeAssign("c_m4_1", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en1", "t_en_native"]), // 2
    makeAssign("c_m4_1", "sub_so", [{ duration: 1 }, { duration: 1 }], ["t_so3"]), // 2
    makeAssign("c_m4_1", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m4_1", "sub_art", [{ duration: 1 }], ["t_ar1"]), // 1
    makeAssign("c_m4_1", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe2"]), // 1
    makeAssign("c_m4_1", "sub_oc", [{ duration: 1 }], ["t_oc2"]), // 1
    makeAssign("c_m4_1", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1

    // ================= ม.4/2 ศิลป์-ภาษา (กิจกรรม 6 + อิสระ 3 + วิชาการ 31 = 40 คาบ) =================
    makeAssign("c_m4_2", "sub_ma", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_ma2"]), // 3
    makeAssign("c_m4_2", "sub_sc", [{ duration: 2 }, { duration: 1 }], ["t_sc2"]), // 3
    makeAssign("c_m4_2", "sub_com", [{ duration: 2, roomId: "rm_com2" }], ["t_com2"]), // 2
    makeAssign("c_m4_2", "sub_th", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_th1"]), // 3
    makeAssign("c_m4_2", "sub_en", [{ duration: 2 }, { duration: 1 }, { duration: 1 }], ["t_en1"]), // 4
    makeAssign("c_m4_2", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en1", "t_en_native"]), // 2
    makeAssign("c_m4_2", "sub_cn", [{ duration: 2 }, { duration: 1 }], ["t_cn1"]), // 3
    makeAssign("c_m4_2", "sub_kr", [{ duration: 2 }, { duration: 2 }], ["t_kr1"]), // 4
    makeAssign("c_m4_2", "sub_so", [{ duration: 1 }, { duration: 1 }], ["t_so2"]), // 2
    makeAssign("c_m4_2", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m4_2", "sub_art", [{ duration: 1 }], ["t_ar2"]), // 1
    makeAssign("c_m4_2", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe2"]), // 1
    makeAssign("c_m4_2", "sub_oc", [{ duration: 1 }], ["t_oc2"]), // 1
    makeAssign("c_m4_2", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1

    // ================= ม.5/1 วิทย์-คณิต (กิจกรรม 6 + อิสระ 2 + วิชาการ 32 = 40 คาบ) =================
    makeAssign("c_m5_1", "sub_ma", [{ duration: 1 }, { duration: 1 }], ["t_ma4"]), // 2
    makeAssign("c_m5_1", "sub_ma_add", [{ duration: 2 }, { duration: 2 }], ["t_ma4"]), // 4
    makeAssign("c_m5_1", "sub_phys", [{ duration: 2, roomId: "rm_lab_phys" }, { duration: 2 }], ["t_sc3"]), // 4
    makeAssign("c_m5_1", "sub_chem", [{ duration: 2, roomId: "rm_lab_chem" }, { duration: 1 }], ["t_sc2"]), // 3 (ใช้แล็บเคมีร่วมกับ t_sc1!)
    makeAssign("c_m5_1", "sub_bio", [{ duration: 2, roomId: "rm_lab_sci1" }, { duration: 1 }], ["t_sc1"]), // 3
    makeAssign("c_m5_1", "sub_com", [{ duration: 2, roomId: "rm_com1" }], ["t_com1"]), // 2
    makeAssign("c_m5_1", "sub_th_sr", [{ duration: 1 }, { duration: 1 }], ["t_th1"]), // 2
    makeAssign("c_m5_1", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en2"]), // 3
    makeAssign("c_m5_1", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en2", "t_en_native"]), // 2
    makeAssign("c_m5_1", "sub_so", [{ duration: 1 }, { duration: 1 }], ["t_so1"]), // 2
    makeAssign("c_m5_1", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m5_1", "sub_art", [{ duration: 1 }], ["t_ar2"]), // 1
    makeAssign("c_m5_1", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe1"]), // 1
    makeAssign("c_m5_1", "sub_oc", [{ duration: 1 }], ["t_oc1"]), // 1
    makeAssign("c_m5_1", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1

    // ================= ม.6/1 วิทย์-คณิต (กิจกรรม 6 + อิสระ 3 + วิชาการ 31 = 40 คาบ) =================
    makeAssign("c_m6_1", "sub_ma", [{ duration: 1 }, { duration: 1 }], ["t_ma3"]), // 2
    makeAssign("c_m6_1", "sub_ma_add", [{ duration: 2 }, { duration: 2 }], ["t_ma1"]), // 4
    makeAssign("c_m6_1", "sub_phys", [{ duration: 2, roomId: "rm_lab_phys" }, { duration: 1 }], ["t_sc3"]), // 3
    makeAssign("c_m6_1", "sub_chem", [{ duration: 2, roomId: "rm_lab_chem" }, { duration: 1 }], ["t_sc1"]), // 3
    makeAssign("c_m6_1", "sub_bio", [{ duration: 2, roomId: "rm_lab_sci1" }, { duration: 1 }], ["t_sc1"]), // 3
    makeAssign("c_m6_1", "sub_com", [{ duration: 2, roomId: "rm_com2" }], ["t_com1"]), // 2
    makeAssign("c_m6_1", "sub_th_sr", [{ duration: 1 }, { duration: 1 }], ["t_th1"]), // 2
    makeAssign("c_m6_1", "sub_en", [{ duration: 1 }, { duration: 1 }, { duration: 1 }], ["t_en3"]), // 3
    makeAssign("c_m6_1", "sub_en_comm", [{ duration: 1 }, { duration: 1 }], ["t_en3", "t_en_native"]), // 2
    makeAssign("c_m6_1", "sub_so", [{ duration: 1 }, { duration: 1 }], ["t_so2"]), // 2
    makeAssign("c_m6_1", "sub_hi", [{ duration: 1 }], ["t_so3"]), // 1
    makeAssign("c_m6_1", "sub_art", [{ duration: 1 }], ["t_ar2"]), // 1
    makeAssign("c_m6_1", "sub_pe", [{ duration: 1, roomId: "rm_gym" }], ["t_pe2"]), // 1
    makeAssign("c_m6_1", "sub_oc", [{ duration: 1 }], ["t_oc2"]), // 1
    makeAssign("c_m6_1", "sub_gu", [{ duration: 1 }], ["t_gu1"]), // 1
  ];

  const versions: TimetableVersion[] = [
    {
      id: "ver_default",
      termId,
      name: "ร่างตารางสอนที่ 1 (หลัก)",
      status: "draft",
      score: 0,
      hardConflictsCount: 0,
      notes: "พร้อมสำหรับการกดจัดตารางสอนอัตโนมัติ",
      createdAt: new Date().toISOString(),
    },
  ];

  return {
    term,
    departments,
    divisions,
    rooms,
    gradeLevels,
    classrooms,
    teachers,
    groupMeetingLocks,
    subjects,
    teachingAssignments,
    synchronizedBlocks,
    versions,
    entries: [],
  };
}
