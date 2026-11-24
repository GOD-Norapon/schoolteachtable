"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X, User } from "lucide-react";
import { Teacher, Department } from "@/types/timetable";
import { getTeacherFullName } from "@/lib/solver/validator";

interface SearchableTeacherSelectProps {
  teachers: Teacher[];
  departments?: Department[];
  value: string;
  onChange: (teacherId: string) => void;
  placeholder?: string;
  excludeIds?: string[];
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  size?: "sm" | "md";
}

export function SearchableTeacherSelect({
  teachers,
  departments = [],
  value,
  onChange,
  placeholder = "-- เลือกครูผู้สอน --",
  excludeIds = [],
  className = "",
  buttonClassName = "",
  disabled = false,
  allowEmpty = false,
  emptyLabel = "-- ไม่มี / ว่าง --",
  size = "md",
}: SearchableTeacherSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedTeacher = useMemo(() => {
    return teachers.find((t) => t.id === value);
  }, [teachers, value]);

  const deptsMap = useMemo(() => {
    return new Map(departments.map((d) => [d.id, d.name]));
  }, [departments]);

  // กรองครูตามค้นหา (ชื่อ-นามสกุล, กลุ่มสาระ)
  const filteredTeachers = useMemo(() => {
    let list = teachers;
    if (excludeIds.length > 0) {
      list = list.filter((t) => !excludeIds.includes(t.id));
    }
    if (!search.trim()) return list;

    const q = search.trim().toLowerCase();
    return list.filter((t) => {
      const full = getTeacherFullName(t).toLowerCase();
      const dept = (deptsMap.get(t.departmentId) || "").toLowerCase();
      const code = (t.code || "").toLowerCase();
      return full.includes(q) || dept.includes(q) || code.includes(q);
    });
  }, [teachers, excludeIds, search, deptsMap]);

  // ปิดเมื่อคลิกนอกพื้นที่
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // โฟกัสช่องค้นหาเมื่อเปิด
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

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  const isSmall = size === "sm";

  return (
    <div ref={containerRef} className={`relative inline-block w-full text-left ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        className={`w-full flex items-center justify-between gap-1.5 rounded-lg border transition text-left bg-white shadow-2xs ${
          isOpen
            ? "border-blue-500 ring-2 ring-blue-100"
            : "border-slate-300 hover:border-slate-400"
        } ${disabled ? "opacity-60 cursor-not-allowed bg-slate-50" : "cursor-pointer"} ${
          isSmall ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-xs font-semibold"
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {selectedTeacher ? (
            <span className="truncate text-slate-800 font-bold">
              {getTeacherFullName(selectedTeacher)}
              {departments.length > 0 && selectedTeacher.departmentId && (
                <span className="ml-1 text-[11px] font-normal text-slate-500">
                  ({deptsMap.get(selectedTeacher.departmentId) || ""})
                </span>
              )}
            </span>
          ) : (
            <span className="truncate text-slate-400 font-normal">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {allowEmpty && value && !disabled && (
            <span
              onClick={handleClear}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded transition"
              title="ล้างการเลือก"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-full min-w-[240px] max-w-[340px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="พิมพ์ชื่อหรือกลุ่มสาระเพื่อค้นหา..."
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 px-1 flex items-center justify-between">
              <span>พบ {filteredTeachers.length} ท่าน</span>
              {search && <span>ค้นหา: &ldquo;{search}&rdquo;</span>}
            </div>
          </div>

          {/* List of Teachers */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 p-1">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => handleSelect("")}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition hover:bg-slate-100 text-slate-500 ${
                  !value ? "bg-slate-100 font-bold" : ""
                }`}
              >
                <span>{emptyLabel}</span>
                {!value && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
              </button>
            )}

            {filteredTeachers.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">
                ไม่พบรายชื่อครูที่ตรงกับคำค้นหา
              </div>
            ) : (
              filteredTeachers.map((t) => {
                const isSelected = t.id === value;
                const deptName = deptsMap.get(t.departmentId);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelect(t.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition ${
                      isSelected
                        ? "bg-blue-50 text-blue-900 font-bold"
                        : "hover:bg-slate-50 text-slate-800"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="truncate font-semibold">{getTeacherFullName(t)}</div>
                      {deptName && (
                        <div className="text-[10px] text-slate-500 font-normal truncate">
                          กลุ่มสาระ{deptName}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600 shrink-0 ml-1" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
