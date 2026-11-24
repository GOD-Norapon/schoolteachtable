import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockCreateClient = vi.fn(() => ({ from: mockFrom }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

describe("GET /api/keep-alive", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.CRON_SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 200 and pokes academic_terms when configured", async () => {
    mockSelect.mockResolvedValueOnce({ error: null });
    const { GET } = await import("./route");

    const req = new NextRequest("http://localhost:3000/api/keep-alive");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.message).toBe("Supabase poked successfully");
    expect(typeof body.latencyMs).toBe("number");
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-anon-key",
      { auth: { persistSession: false } }
    );
    expect(mockFrom).toHaveBeenCalledWith("academic_terms");
    expect(mockSelect).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
  });

  it("returns 401 when CRON_SECRET is set and request is unauthorized", async () => {
    process.env.CRON_SECRET = "my-secret";
    const { GET } = await import("./route");

    const req = new NextRequest("http://localhost:3000/api/keep-alive");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns 200 when CRON_SECRET matches Bearer token", async () => {
    process.env.CRON_SECRET = "my-secret";
    mockSelect.mockResolvedValueOnce({ error: null });
    const { GET } = await import("./route");

    const req = new NextRequest("http://localhost:3000/api/keep-alive", {
      headers: { authorization: "Bearer my-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("returns 500 when Supabase URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    const { GET } = await import("./route");

    const req = new NextRequest("http://localhost:3000/api/keep-alive");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });

  it("returns 503 when Supabase returns a query error", async () => {
    mockSelect.mockResolvedValueOnce({
      error: { message: "Database paused" },
    });
    const { GET } = await import("./route");

    const req = new NextRequest("http://localhost:3000/api/keep-alive");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Database paused");
  });
});
