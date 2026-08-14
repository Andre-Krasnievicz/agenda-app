import { NextRequest, NextResponse } from "next/server";

/**
 * Proteção provisória enquanto o better-auth não entra (seção 11.1 do plano).
 * O MVP guarda nome, telefone e anotações clínicas de pacientes reais — a URL
 * não pode ficar pública e aberta.
 *
 * Sem `ACCESS_KEY` configurada (ex.: dev local), a proteção fica desligada.
 * Em produção, defina `ACCESS_KEY` nas env vars da Vercel e compartilhe o link
 * `https://seu-app.vercel.app/entrar?k=<ACCESS_KEY>` só com ela.
 */
const COOKIE_NAME = "agenda_access";

export function middleware(req: NextRequest) {
  const secret = process.env.ACCESS_KEY;
  if (!secret) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie === secret) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!entrar|_next/static|_next/image|favicon.ico).*)"],
};
