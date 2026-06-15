// app/imports/ventas/import-form.tsx
"use client";

import { useState } from "react";
import { importVentas } from "./actions";
import type { ImportResult } from "./types";

export function ImportForm() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setResult(null);
    try {
      const res = await importVentas(formData);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));

      // TODO 3 — `e` es de tipo `unknown` (TS no sabe qué te lanzan en un catch).
      //   Sacá el mensaje y guardalo con setError.
      //   Pista: e instanceof Error ? e.message : String(e)
      //setError("TODO"); // TODO: reemplazá esto
    }
  }

  return (
    <form action={handleSubmit}>
      {/* el name="file" tiene que matchear el formData.get("file") de la action */}
      <input type="file" name="file" accept=".xlsx" />
      <button type="submit">Subir y leer</button>

      {result && (
        <p>
          Import OK — ImportJob {result.importJobId}, {result.processedCount}{" "}
          movements creados
        </p>
      )}
      {error && <p>Error: {error}</p>}
    </form>
  );
}
