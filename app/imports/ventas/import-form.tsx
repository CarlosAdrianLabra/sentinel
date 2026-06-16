// app/imports/ventas/import-form.tsx
"use client";

import { useState } from "react";
import { importVentas } from "./actions";
import { type FormState } from "./types";

export function ImportForm() {
  const [form, setForm] = useState<FormState>({ status: "idle" });

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
    <form action={handleSubmit}>
      {/* el name="file" tiene que matchear el formData.get("file") de la action */}
      <input type="file" name="file" accept=".xlsx" />
      <button type="submit">Subir y leer</button>

      {form.status === "procesando" && <p>Procesando...</p>}
      {form.status === "idle" && <p>Selecciona un archivo</p>}
      {form.status === "exito" && (
        <p>
          Import Ok - ImportJob {form.result.importJobId},{" "}
          {form.result.processedCount} movements creados
        </p>
      )}
      {form.status === "error" && <p>Error: {form.mensaje}</p>}
    </form>
  );
}
