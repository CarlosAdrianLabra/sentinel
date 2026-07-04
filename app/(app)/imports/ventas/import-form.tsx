"use client";

import { useState } from "react";
import { importVentas } from "./actions";
import { type FormState } from "./types";

export function ImportForm() {
  const [form, setForm] = useState<FormState>({ status: "idle" });
  const [hayArchivo, setHayArchivo] = useState(false);

  async function handleSubmit(formData: FormData) {
    setForm({ status: "procesando" });
    try {
      const res = await importVentas(formData);
      setForm({ status: "exito", result: res });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      setForm({ status: "error", mensaje: mensaje });
    }
  }

  return (
    <form
      action={handleSubmit}
      className="max-w-lg rounded-lg border border-border bg-card p-6 space-y-4"
    >
      <input
        type="file"
        name="file"
        accept=".xlsx"
        onChange={(e) => setHayArchivo(e.target.files!.length > 0)}
        className="block w-full font-ui text-sm text-muted-foreground
    file:mr-4 file:rounded-md file:border-0
    file:bg-secondary file:px-4 file:py-2
    file:font-ui file:text-sm file:text-foreground
    hover:file:bg-secondary/70 file:cursor-pointer"
      />

      <button
        type="submit"
        disabled={!hayArchivo}
        className="rounded-md bg-primary px-4 py-2 font-ui text-sm text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Subir y leer
      </button>

      {form.status === "idle" && (
        <p className="font-ui text-sm text-muted-foreground">
          Seleccioná un archivo para empezar.
        </p>
      )}

      {form.status === "procesando" && (
        <p className="font-hud text-sm text-primary animate-pulse">
          Procesando archivo…
        </p>
      )}

      {form.status === "exito" && (
        <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3 font-ui text-sm text-green-400">
          Import completo · ImportJob {form.result.importJobId} ·{" "}
          {form.result.processedCount} movements creados
        </div>
      )}

      {form.status === "error" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 font-ui text-sm text-destructive">
          Error · {form.mensaje}
        </div>
      )}
    </form>
  );
}
