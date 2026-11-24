"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X, BookOpen } from "lucide-react";
import { Subject, Department } from "@/types/timetable";

interface SearchableSubjectSelectProps {
  subjects: Subject[];
  departments?: Department[];
  value: string;
  onChange: (subjectId: string) => void;
  preferredDepartmentId?: string;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
}

export function SearchableSubjectSelect({
  subjects,
  departments = [],
  value,
  onChange,
  preferredDepartmentId,
  placeholder = "-- เลือกรายวิชาที่สอน --",
  className = "",
  buttonClassName = "",
  disabled = false,
}: SearchableSubjectSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.id === value),
    [subjects, value]
  );

  const deptsMap = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments]
  );

  const filteredSubjects = useMemo(() => {
    if (!search.trim()) return subjects;
    const q = search.trim().toLowerCase();
    return subjects.filter((s) => {
      const code = (s.code || "").toLowerCase();
      const name = (s.name || "").toLowerCase();
      const shortName = (s.shortName || "").toLowerCase();
      const dept = (deptsMap.get(s.departmentId) || "").toLowerCase();
      return (
        code.includes(q) ||
        name.includes(q) ||
        shortName.includes(q) ||
        dept.includes(q)
      );
    });
  }, [subjects, search, deptsMap]);

  const { preferredSubjects, otherSubjects } = useMemo(() => {
    if (!preferredDepartmentId) {
      return { preferredSubjects: filteredSubjects, otherSubjects: [] as Subject[] };
    }
    return {
      preferredSubjects: filteredSubjects.filter(
        (s) => s.departmentId === preferredDepartmentId
      ),
      otherSubjects: filteredSubjects.filter(
        (s) => s.departmentId !== preferredDepartmentId
      ),
    };
  }, [filteredSubjects, preferredDepartmentId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch("");
  };

  const preferredDeptName = preferredDepartmentId
    ? deptsMap.get(preferredDepartmentId) || ""
    : "";

  const renderSubjectOption = (s: Subject, showDept: boolean) => {
    const isSelected = s.id === value;
    const deptName = deptsMap.get(s.departmentId);
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => handleSelect(s.id)}
        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition ${
          isSelected
            ? "bg-blue-50 text-blue-800 font-bold"
            : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate">
            <span className="font-mono font-bold text-slate-900">{s.code}</span>{" "}
            <span>- {s.name}</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">
            {s.defaultPeriodsPerWeek} คาบ/สัปดาห์ •{" "}
            {s.defaultSplitPattern.join("+")}
            {showDept && deptName ? ` • กลุ่มสาระ${deptName}` : ""}
          </div>
        </div>
        {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
      </button>
    );
  };

  return (
    <div ref={containerRef} className={`relative w-full text-left ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium bg-white transition text-left ${
          isOpen
            ? "border-blue-500 ring-2 ring-blue-500/20"
            : "border-slate-300 hover:border-slate-400"
        } ${disabled ? "opacity-60 cursor-not-allowed bg-slate-50" : "cursor-pointer"} ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {selectedSubject ? (
            <span className="truncate text-slate-800">
              <span className="font-mono font-bold">{selectedSubject.code}</span>{" "}
              - {selectedSubject.name}{" "}
              <span className="text-slate-500">
                ({selectedSubject.defaultPeriodsPerWeek} คาบ/สัปดาห์ •{" "}
                {selectedSubject.defaultSplitPattern.join("+")})
              </span>
            </span>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัสวิชา, ชื่อวิชา, ชื่อย่อ หรือกลุ่มสาระ..."
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchInputRef.current?.focus();
                }}
                className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                title="ล้างคำค้นหา"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {filteredSubjects.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                ไม่พบรายวิชาที่ตรงกับ &ldquo;{search}&rdquo;
              </div>
            ) : (
              <>
                {preferredSubjects.length > 0 && (
                  <div>
                    {preferredDepartmentId && (
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 bg-blue-50/70 border-b border-blue-100 sticky top-0">
                        วิชาในกลุ่มสาระ{preferredDeptName} ({preferredSubjects.length})
                      </div>
                    )}
                    <div className="divide-y divide-slate-100">
                      {preferredSubjects.map((s) =>
                        renderSubjectOption(s, !preferredDepartmentId)
                      )}
                    </div>
                  </div>
                )}

                {otherSubjects.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 border-b border-slate-200 sticky top-0">
                      วิชานอกกลุ่มสาระอื่นๆ ({otherSubjects.length})
                    </div>
                    <div className="divide-y divide-slate-100">
                      {otherSubjects.map((s) => renderSubjectOption(s, true))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
