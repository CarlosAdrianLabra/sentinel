import * as XLSX from "xlsx";
import { z } from "zod";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { parse } from "date-fns";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

const SaleTupleSchema = z.object({
  branchLegacyId: z.string().regex(/^[0-9]+$/), // ya viene normalizado de normalizeQualifier
  fullDescription: z.string().min(1),
  size: z.string().regex(/^\d+\.\d$/),
  quantity: z.number().int().positive(), // venta siempre > 0
  movementDate: z.date(), // el campo nuevo: cuándo se vendió
});

type SaleTuple = z.infer<typeof SaleTupleSchema>;

// ── Constantes de layout del Detalle de Ventas (formato C) ──
const LABEL_COL = 0; // producto / SUC. / qualifier / TOT. viven acá
const SIZE_SCAN_START = 29; // las tallas arrancan en col 29 (antes hay columnas financieras)
const SIZE_SCAN_END = 50; // tope con margen (sample llega a ~42)
const SIZE_MIN = 500; // talla 5.0
const SIZE_MAX = 4500; // talla 45.0
const CANT_COL = 2; // columna CANT. del bloque (venta bruta de la fila)

function normalizeQualifier(raw: string): string {
  const s = raw.replace(/[^0-9]/g, "");
  const validos = ["1", "2", "5"];
  if (!validos.includes(s)) {
    throw new Error(
      `Qualifier de sucursal inválido: "${raw}" (normalizado: "${s}")`,
    );
  }
  return s;
}

function parseSales(rows: unknown[][], movementDate: Date): SaleTuple[] {
  const tuples: SaleTuple[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][LABEL_COL];

    // RAMA 1 — ¿producto nuevo?
    const isProductRow =
      typeof cell === "string" && cell.split("-").length - 1 >= 4;
    if (!isProductRow) continue;

    const productName = cell;
    let j = i + 1;
    let sizeByColumn: Record<number, string> = {};

    while (j < rows.length) {
      const blockCell = rows[j][LABEL_COL];

      // ¿empezó el siguiente producto? → cerrar este bloque
      const isNextProduct =
        typeof blockCell === "string" && blockCell.split("-").length - 1 >= 4;
      if (isNextProduct) break;

      // RAMA 2 — fila SUC. (header de tallas)
      if (blockCell === "SUC.") {
        sizeByColumn = {};
        for (let col = SIZE_SCAN_START; col < SIZE_SCAN_END; col++) {
          const headerCell = rows[j][col];
          if (typeof headerCell !== "string") continue;
          const trimmed = headerCell.trim();
          if (trimmed === "") continue;
          const num = Number(trimmed);
          if (isNaN(num)) continue;
          if (num < SIZE_MIN || num > SIZE_MAX) continue;
          const tallaReal = num / 100;
          sizeByColumn[col] = tallaReal.toFixed(1);
        }
      }

      // RAMA 3 — fila de datos (qualifier con dígito)
      else if (typeof blockCell === "string" && /\d/.test(blockCell)) {
        // Guard: solo filas que son venta real (CANT > 0).
        // Cambios (CANT 0) y correcciones (CANT negativo) traen celdas
        // en la matriz de tallas que NO son ventas → la fila se brinca entera.
        const cantidad = rows[j][CANT_COL];
        if (typeof cantidad === "number" && cantidad > 0) {
          const legacyStoreId = normalizeQualifier(blockCell);
          const isActive = !productName.endsWith(" *");
          const fullDescription = isActive
            ? productName
            : productName.replace(/ \*$/, "").trim();

          for (const claveStr of Object.keys(sizeByColumn)) {
            const col = Number(claveStr);
            const talla = sizeByColumn[col];
            const cantidadCell = rows[j][col];

            if (typeof cantidadCell === "number" && cantidadCell > 0) {
              tuples.push({
                branchLegacyId: legacyStoreId,
                fullDescription,
                size: talla,
                quantity: cantidadCell,
                movementDate,
              });
            }
          }
        }
      }

      // RAMA 4 — fila TOT. (fin de bloque / validación)
      else if (blockCell === "TOT.") {
        // Validación de suma contra TOT: DESCARTADA a propósito (2026-06-09).
        // 1) El parser ya se verifica end-to-end contra el archivo completo
        //    (102 tuplas/pares confirmados vs lectura en Python) — red más
        //    fuerte que un check por-bloque.
        // 2) Existencias nunca tuvo esta validación y no mordió en 2 imports.
        // 3) El TOT de ventas incluye cambios (CANT=0 + DEV) y devoluciones
        //    que este parser ignora a propósito → sumar tuplas vs TOT NO
        //    cuadraría limpio sin reconstruir qué parte del TOT es venta pura.
        // El TOT se usa solo como marca de fin de bloque (el `break` del
        // siguiente producto ya lo cubre, así que esta rama queda como no-op
        // documentado).
      }

      j++;
    }
    i = j - 1;
  }

  return tuples;
}

function extractFechaFinalString(rows: unknown[][]): string {
  for (const row of rows) {
    const celda = row.find(
      (cell) => typeof cell === "string" && cell.startsWith("Fecha Final"),
    );
    if (celda) {
      return (celda as string).replace("Fecha Final: ", "").trim();
    }
  }
  throw new Error(
    "no se encontro ninguna linea con 'Fecha Final' y que sea string",
  );
}

function parseFechaFinal(raw: string): Date {
  const parsed = parse(raw, "dd/MM/yyyy", new Date());
  if (isNaN(parsed.getTime())) {
    throw new Error(`No se pudo parsear la fecha final: "${raw}"`);
  }
  return parsed;
}

async function buildBranchMap(): Promise<Record<string, number>> {
  const branches = await prisma.branch.findMany();
  const map: Record<string, number> = {};
  for (const branch of branches) {
    map[branch.legacyStoreId] = branch.id;
  }
  return map;
}

function getFilePathFromArgs(): string {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("falta el argumento <ruta-al-archivo.xlsx>");
  }
  return filePath;
}

function readWorkbook(filePath: string) {
  const buffer = readFileSync(filePath);
  return XLSX.read(buffer, { type: "buffer" });
}

function selectDataSheet(workbook: XLSX.WorkBook): string {
  const sheetName = workbook.SheetNames.find((name) => name.startsWith("rpt"));
  if (!sheetName) {
    throw new Error("No se encontró ninguna hoja que empiece con 'rpt'");
  }
  return sheetName;
}

function validateTuples(tuples: unknown[]): SaleTuple[] {
  return z.array(SaleTupleSchema).parse(tuples);
}

async function createImportJob(
  fileName: string,
  movementDate: Date,
): Promise<number> {
  const job = await prisma.importJob.create({
    data: {
      source: "legacy_sales",
      status: "RUNNING",
      fileName: fileName,
      startedAt: new Date(),
      snapshotDate: movementDate,
    },
  });
  return job.id;
}

async function markImportJobFailed(
  importJobId: number,
  error: unknown,
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: "FAILED", finishedAt: new Date(), errorMessage },
  });
}

async function persistSales(
  tuples: SaleTuple[],
  branchMap: Record<string, number>,
  importJobId: number,
): Promise<number> {
  let processedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const tuple of tuples) {
      const branchId = branchMap[tuple.branchLegacyId];
      if (!branchId) {
        throw new Error(
          `Sucursal desconocida: legacyStoreId=${tuple.branchLegacyId}`,
        );
      }

      const product = await tx.product.upsert({
        where: { fullDescription: tuple.fullDescription },
        update: {},
        create: { fullDescription: tuple.fullDescription },
      });

      await tx.inventoryMovement.create({
        data: {
          branchId: branchId,
          productId: product.id,
          size: tuple.size,
          movementType: "OUT",
          quantityDelta: -tuple.quantity,
          referenceId: String(importJobId),
          movementDate: tuple.movementDate,
        },
      });

      processedCount++;
    }
  });

  return processedCount;
}

// ───────── EL CORE (lo llaman la CLI y, en Paso 3, la Server Action) ─────────

type VentasImportResult = {
  importJobId: number;
  processedCount: number;
};

export async function runVentasImport(
  workbook: XLSX.WorkBook,
  fileName: string,
): Promise<VentasImportResult> {
  let importJobId: number | undefined;
  try {
    const sheetName = selectDataSheet(workbook);
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

    // Header: fecha de venta
    const fechaFinalString = extractFechaFinalString(rows);
    const movementDate = parseFechaFinal(fechaFinalString);

    // ── IDEMPOTENCIA (opción 3): ¿ya existe un import de ventas de esta fecha?
    const existing = await prisma.importJob.findFirst({
      where: {
        source: "legacy_sales",
        status: "COMPLETED",
        snapshotDate: movementDate,
      },
    });
    if (existing) {
      throw new Error(
        `Ya existe un import de ventas COMPLETED para ${fechaFinalString} (ImportJob ${existing.id}). Abortando para no duplicar.`,
      );
    }
    const lastSales = await prisma.importJob.findFirst({
      where: {
        source: "legacy_sales",
        status: "COMPLETED",
      },
      orderBy: {
        snapshotDate: "desc",
      },
    });
    const lastSalesDate = lastSales?.snapshotDate;
    if (lastSalesDate && movementDate < lastSalesDate) {
      throw new Error(
        `Este import tiene una fecha de ${movementDate} y la fecha del import mas nuevo es de ${lastSalesDate} por lo tanto este import es antiguo`,
      );
    }

    // Parsear y validar
    const rawTuples = parseSales(rows, movementDate);
    const tuples = validateTuples(rawTuples);

    const branchMap = await buildBranchMap();

    // Crear ImportJob (después del chequeo de idempotencia)
    importJobId = await createImportJob(fileName, movementDate);

    const processedCount = await persistSales(tuples, branchMap, importJobId);

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        totalRows: tuples.length,
        processedRows: processedCount,
      },
    });

    return { importJobId, processedCount };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Error de validacion de tuplas:");
      for (const issue of error.issues) {
        console.error(` - tupla ${issue.path.join(".")}: ${issue.message}`);
      }
    } else if (importJobId !== undefined) {
      console.error(
        "Error durante la persistencia:",
        error instanceof Error ? error.message : error,
      );
    } else {
      console.error(
        "Error antes de crear el ImportJob:",
        error instanceof Error ? error.message : error,
      );
    }

    if (importJobId !== undefined) {
      await markImportJobFailed(importJobId, error);
      console.error(`ImportJob ${importJobId} marcado como FAILED.`);
    }

    throw error;
  }
}

// ───────── LA CAPA CLI (lo sucio: argv + disco + exit codes) ─────────

async function main(): Promise<void> {
  console.time("total");
  const filePath = getFilePathFromArgs();
  console.log("Archivo recibido:", filePath);
  const workbook = readWorkbook(filePath); // ← acá se lee el disco; la action hará XLSX.read(bytes)

  const result = await runVentasImport(workbook, filePath); // CLI usa filePath como fileName
  console.log(`Import de ventas completado. ImportJob ${result.importJobId}.`);
  console.log(`Movements creados: ${result.processedCount}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error("Error fatal:", error);
      process.exit(1);
    })
    .finally(async () => {
      console.timeEnd("total");
      await prisma.$disconnect();
    });
}
