import { NextResponse, type NextRequest } from "next/server";
import { sellar } from "@/lib/auth/sello";

export default async function proxy(request: NextRequest) {
  const sello = request.cookies.get("sentinel_acceso")?.value;
  const esperado = await sellar(process.env.SENTINEL_PASSWORD!);

  if (sello === esperado) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // regex negativo: TODO salvo /login y los assets internos de Next
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
