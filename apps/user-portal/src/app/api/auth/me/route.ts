import { NextRequest, NextResponse } from "next/server";

const API_TARGET = (process.env.API_PROXY_TARGET || "http://127.0.0.1:3000").replace(/\/$/, "");

export async function GET(req: NextRequest) {
  const token = req.cookies.get("nutriagent_token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const upstream = await fetch(`${API_TARGET}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
