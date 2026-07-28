import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Expire it rather than just deleting client-side: the session is stateless,
  // so the cookie is the session.
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
