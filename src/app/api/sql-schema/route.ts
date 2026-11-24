import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const sqlPath = path.join(process.cwd(), "supabase/migrations/001_initial_schema.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");
    return NextResponse.json({ sql });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read SQL schema" },
      { status: 500 }
    );
  }
}
