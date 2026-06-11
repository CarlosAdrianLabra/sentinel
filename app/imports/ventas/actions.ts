// app/imports/ventas/actions.ts
"use server";

import * as XLSX from "xlsx";
import type { ImportResult } from "./types";

export async function importVentas(formData: FormData): Promise<ImportResult> {
  const file = formData.get("file"); // tipo: FormDataEntryValue | null

  if (!(file instanceof File)) throw new Error("No es un archivo permitido");
  // TODO 1 — guard del archivo.
  //   Si `file` no es un File (vino null, o vino como string), lanzá un Error
  //   con mensaje claro. Acá nacen tus futuras X.
  //   Pista: if (!(file instanceof File)) throw new Error("...")
  //   Después de este guard, TS ya sabe que `file` es un File.

  // Lo nuevo: en el navegador no hay ruta en disco. Traemos los BYTES del File
  // y se los damos a SheetJS con `read` (en el parser usás `readFile`, que lee de disco).
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer" });
  const sheetName = workbook.SheetNames.find((name) => name.startsWith("rpt"));
  if (!sheetName) {
    throw new Error("no se encontro ninguna hoja que empiece con 'rpt");
  }
  const sheet = workbook.Sheets[sheetName];
  const rowCount = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
  }).length;

  // TODO 2 — contar filas (esto ya lo sabés del parser).
  //   Para Paso 1 no afines cuál hoja: agarrá la hoja de datos (la misma que ya
  //   identificás en import-ventas.ts) y contá sus filas con:
  //   XLSX.utils.sheet_to_json(sheet, { header: 1 }).length
  //   Solo queremos un número que pruebe el viaje.
  //const rowCount = 0; // TODO: reemplazá esto

  return { fileName: file.name, rowCount };
}
