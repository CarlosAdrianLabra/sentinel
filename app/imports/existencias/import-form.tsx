"use client";

import { useState } from "react";
import { importExistencias } from "./actions";
import { type FormState } from "./types";

export function ImportForm() {
  const [form, setForm] = useState<FormState>({ status: "idle" });

  async function handleSubmit(formData: FormData) {
    setForm({ status: "procesando" });
    try {
      const res = await importExistencias(formData);
      setForm({ status: "exito", result: res });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      setForm({ status: "error", mensaje: mensaje });
    }
  }

  return (
    <form action={handleSubmit}>
      <input type="file" name="file" accept=".xlsx" />
      <button type="submit">Subir y leer</button>

      {form.status === "procesando" && <p>Procesando...</p>}
      {form.status === "idle" && <p>Selecciona un archivo</p>}
      {form.status === "exito" && (
        <p>
          Import Ok - ImportJob {form.result.importJobId},{" "}
          {form.result.processedCount} Tuplas procesadas
        </p>
      )}
      {form.status === "error" && <p>Error: {form.mensaje}</p>}
    </form>
  );
}
