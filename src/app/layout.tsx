import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";
import { SchoolDataProvider } from "@/lib/store/SchoolDataContext";
import { AppShell } from "@/components/layout/AppShell";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sarabun",
});

export const metadata: Metadata = {
  title: "ระบบจัดตารางสอนออนไลน์ | School Timetable Scheduler",
  description:
    "โปรแกรมจัดตารางสอนโรงเรียนออนไลน์ รองรับการทำงานร่วมกันตามกลุ่มสาระ ตรวจสอบยอดคาบรายห้อง จัดตารางอัตโนมัติ ปรับแก้รายกรณี พิมพ์รายคน และส่งออก Excel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body className="min-h-screen antialiased">
        <SchoolDataProvider>
          <AppShell>{children}</AppShell>
        </SchoolDataProvider>
      </body>
    </html>
  );
}
