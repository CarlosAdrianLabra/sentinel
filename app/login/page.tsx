"use client";

import { useActionState } from "react";
import { entrar, type LoginState } from "./action";

const inicial: LoginState = { status: "idle" };

export default function LoginPage() {
  const [estado, accion, pending] = useActionState(entrar, inicial);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <form
        action={accion}
        className="relative w-full max-w-sm rounded-lg border border-accent bg-card p-8 space-y-6"
      >
        {/* esquinas HUD — mismo patrón que tu hero del dashboard */}
        <span className="pointer-events-none absolute top-2 left-2 h-4 w-4 border-t-2 border-l-2 border-accent" />
        <span className="pointer-events-none absolute top-2 right-2 h-4 w-4 border-t-2 border-r-2 border-accent" />
        <span className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-accent" />
        <span className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-accent" />

        <div className="text-center space-y-1">
          <h1 className="font-display text-3xl tracking-widest">SENTINEL</h1>
          <p className="font-hud text-xs uppercase text-muted-foreground">
            acceso restringido · identificate
          </p>
        </div>

        <input
          type="password"
          name="clave"
          placeholder="clave de acceso"
          autoFocus
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-hud text-sm tracking-widest placeholder:text-muted-foreground focus:outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 font-ui text-sm text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "Verificando…" : "Entrar"}
        </button>

        {estado.status === "error" && (
          <p className="font-hud text-xs uppercase text-destructive text-center">
            {estado.mensaje}
          </p>
        )}
      </form>
    </main>
  );
}
