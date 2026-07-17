"use server";

import * as XLSX from "xlsx";
import type { ImportResult } from "./types";
import { runVentasImport } from "@/scripts/import-ventas";
import { revalidatePath } from "next/cache";

export async function importVentas(formData: FormData): Promise<ImportResult> {
  const file = formData.get("file");

  if (!(file instanceof File)) throw new Error("No es un archivo permitido");
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer" });
  const result = await runVentasImport(workbook, file.name);
  revalidatePath("/sales");
  return result;
}

export async function importVentasForzado(
  formData: FormData,
): Promise<ImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No es un archivo permitido");
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer" });
  const result = await runVentasImport(workbook, file.name, true);
  revalidatePath("/sales");
  return result;
}
