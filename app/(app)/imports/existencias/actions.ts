"use server";

import * as XLSX from "xlsx";
import type { ImportResult } from "./types";
import { runExistenciasImport } from "@/scripts/import-existencias";
import { revalidatePath } from "next/cache";

export async function importExistencias(
  formData: FormData,
): Promise<ImportResult> {
  const file = formData.get("file");

  if (!(file instanceof File)) throw new Error("No es un archivo permitido");
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer" });
  const result = await runExistenciasImport(workbook, file.name);
  revalidatePath("/inventory");
  return result;
}
