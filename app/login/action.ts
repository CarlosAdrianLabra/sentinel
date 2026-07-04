"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sellar } from "@/lib/auth/sello";

export type LoginState =
  | { status: "idle" }
  | { status: "error"; mensaje: string };

export async function entrar(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const clave = formData.get("clave");
  if (typeof clave !== "string" || clave.length === 0) {
    return { status: "error", mensaje: "Escribí la clave" };
  }

  if (clave !== process.env.SENTINEL_PASSWORD) {
    return { status: "error", mensaje: "Clave incorrecta" };
  }

  (await cookies()).set("sentinel_acceso", await sellar(clave), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}
