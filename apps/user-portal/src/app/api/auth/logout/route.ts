import { NextRequest, NextResponse } from "next/server";
import { shouldUseSecureCookie } from "@/lib/cookieSecurity";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("nutriagent_token", "", {
    httpOnly: true,
    secure: shouldUseSecureCookie(req),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
