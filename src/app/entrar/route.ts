import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "agenda_access";

export async function GET(req: NextRequest) {
  const secret = process.env.ACCESS_KEY;
  const k = req.nextUrl.searchParams.get("k");
  const next = req.nextUrl.searchParams.get("next") || "/agenda";

  if (!secret || k !== secret) {
    return new NextResponse("Acesso negado.", { status: 403 });
  }

  const res = NextResponse.redirect(new URL(next, req.url));
  res.cookies.set(COOKIE_NAME, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
