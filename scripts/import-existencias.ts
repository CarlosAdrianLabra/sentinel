import * as XLSX from "xlsx";
import { z } from "zod";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { format, parse } from "date-fns";
import { pathToFileURL } from "url";
import { readFileSync } from "node:fs";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

const InventoryTupleSchema = z.object({
  branchLegacyId: z.number().int().positive(),
  fullDescription: z.string().min(1),
  isActive: z.boolean(),
  size: z.string().regex(/^\d+\.\d$/),
  quantity: z.number().int().nonnegative(),
});

type InventoryTuple = z.infer<typeof InventoryTupleSchema>;

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

function extractSnapshotDate(rows: unknown[][]): string {
  const rowImpresion = rows.find((row) => {
    const firstCell = row[0];
    return typeof firstCell === "string" && firstCell.startsWith("Impresión:");
  });
  if (!rowImpresion) {
    throw new Error(
      "no se encontro ninguna linea con 'Impresión:' y que sea un string",
    );
  }
  const cellValue = rowImpresion[0] as string;
  const snapshotDateString = cellValue.replace("Impresión: ", "").trim();
  return snapshotDateString;
}
function parseSnapshotDate(raw: string): Date {
  const normalized = raw.replace("p. m.", "PM").replace("a. m.", "AM");
  const parsed = parse(normalized, "dd/MM/yyyy hh:mm:ss aa", new Date());
  if (isNaN(parsed.getTime())) {
    throw new Error(`No se pudo parsear el snapshot date: "${raw}"`);
  }
  return parsed;
}
function parseProducts(rows: unknown[][]): InventoryTuple[] {
  const tuples: InventoryTuple[] = [];
  let productCount = 0;
  let positionCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cell = row[1];

    const isProductRow =
      typeof cell === "string" && cell.split("-").length - 1 >= 4;

    if (!isProductRow) {
      continue;
    }

    productCount++;
    const productName = cell;
    console.log(`\nProducto ${productCount}: ${productName}`);

    let j = i + 1;
    let sizeByColumn: Record<number, string> = {};
    let productSum = 0;

    while (j < rows.length) {
      const blockRow = rows[j];
      const blockCell = blockRow[1];

      const isNextProduct =
        typeof blockCell === "string" && blockCell.split("-").length - 1 >= 4;
      if (isNextProduct) {
        break;
      }

      if (blockCell === "SUC.") {
        sizeByColumn = {};
        productSum = 0;

        for (let col = 4; col < 27; col++) {
          const headerCell = blockRow[col];

          if (typeof headerCell !== "string") continue;

          const trimmed = headerCell.trim();
          if (trimmed === "") continue;

          const num = Number(trimmed);
          if (isNaN(num)) continue;
          if (num < 500 || num > 4500) continue;

          const tallaReal = num / 100;
          sizeByColumn[col] = tallaReal.toFixed(1);
        }

        console.log(`  [SUC. en fila ${j}] Mapa de tallas:`, sizeByColumn);
      }

      const branchLegacyId = blockCell;
      if (typeof branchLegacyId === "number") {
        positionCount++;
        for (const claveStr of Object.keys(sizeByColumn)) {
          const col = Number(claveStr);
          const talla = sizeByColumn[col];
          const cantidadCell = blockRow[col];

          if (typeof cantidadCell === "number" && cantidadCell > 0) {
            console.log(
              `  - Branch ${branchLegacyId} (fila ${j}): talla ${talla} → ${cantidadCell} par(es)`,
            );

            const isActive = !productName.endsWith(" *");
            const fullDescription = isActive
              ? productName
              : productName.replace(/ \*$/, "").trim();

            tuples.push({
              branchLegacyId: branchLegacyId,
              fullDescription: fullDescription,
              isActive: isActive,
              size: talla,
              quantity: cantidadCell,
            });
            productSum += cantidadCell;
          }
        }
      }
      // Detección de fila TOT para verificar suma del producto
      const isTotRow = blockRow.some(
        (c) => typeof c === "string" && c.trim() === "TOT.",
      );
      if (isTotRow) {
        // Buscar el número en la fila — el total declarado por el archivo
        const totDeclared = blockRow.find((c) => typeof c === "number");
        if (typeof totDeclared === "number" && totDeclared !== productSum) {
          console.log(
            `*** MISMATCH "${productName}": parser=${productSum}, archivo=${totDeclared}`,
          );
        }
      }

      j++;
    }
    i = j - 1;
  }

  console.log(`\nTotal de productos detectados: ${productCount}`);
  console.log(`Total de filas de datos detectadas: ${positionCount}`);

  return tuples;
}

function validateTuples(tuples: unknown[]): InventoryTuple[] {
  return z.array(InventoryTupleSchema).parse(tuples);
}

async function buildBranchMap(): Promise<Record<string, number>> {
  const branches = await prisma.branch.findMany();
  const map: Record<string, number> = {};
  for (const branch of branches) {
    map[branch.legacyStoreId] = branch.id;
  }
  return map;
}

async function createImportJob(
  fileName: string,
  snapshotDate: Date,
  branchId: number,
): Promise<number> {
  const job = await prisma.importJob.create({
    data: {
      source: "legacy_inventory",
      status: "RUNNING",
      fileName: fileName,
      startedAt: new Date(),
      snapshotDate: snapshotDate,
      branchId: branchId,
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
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: errorMessage,
    },
  });
}

async function persistTuples(
  tuples: InventoryTuple[],
  branchMap: Record<string, number>,
  importJobId: number,
): Promise<number> {
  let processedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const tuple of tuples) {
      const branchId = branchMap[String(tuple.branchLegacyId)];
      if (!branchId) {
        throw new Error(
          `Sucursal desconocida: legacyStoreId=${tuple.branchLegacyId}`,
        );
      }

      // 1. Upsert Product por fullDescription
      const product = await tx.product.upsert({
        where: { fullDescription: tuple.fullDescription },
        update: { isActive: tuple.isActive },
        create: {
          fullDescription: tuple.fullDescription,
          isActive: tuple.isActive,
        },
      });

      // 2. Leer InventoryPosition existente (si existe) para calcular delta
      const existingPosition = await tx.inventoryPosition.findUnique({
        where: {
          branchId_productId_size: {
            branchId: branchId,
            productId: product.id,
            size: tuple.size,
          },
        },
      });

      const previousQuantity = existingPosition?.quantity ?? 0;
      const delta = tuple.quantity - previousQuantity;

      // 3. Upsert InventoryPosition con la nueva quantity
      await tx.inventoryPosition.upsert({
        where: {
          branchId_productId_size: {
            branchId: branchId,
            productId: product.id,
            size: tuple.size,
          },
        },
        update: { quantity: tuple.quantity },
        create: {
          branchId: branchId,
          productId: product.id,
          size: tuple.size,
          quantity: tuple.quantity,
        },
      });

      // 4. Crear InventoryMovement solo si hay cambio
      if (delta !== 0) {
        await tx.inventoryMovement.create({
          data: {
            branchId: branchId,
            productId: product.id,
            size: tuple.size,
            movementType: "IMPORT_SET",
            quantityDelta: delta,
            referenceId: String(importJobId),
          },
        });
      }

      processedCount++;
    }
  });

  return processedCount;
}

type ExistenciasImportResult = {
  importJobId: number;
  processedCount: number;
};

export async function runExistenciasImport(
  workbook: XLSX.WorkBook,
  fileName: string,
): Promise<ExistenciasImportResult> {
  let importJobId: number | undefined;
  try {
    const sheetName = selectDataSheet(workbook);
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

    const snapshotDateString = extractSnapshotDate(rows);
    const snapshotDate = parseSnapshotDate(snapshotDateString);

    // El parseo va ANTES del guard: la sucursal del archivo solo existe
    // por-fila adentro de las tuplas, y el guard la necesita para scopear.
    const rawTuples = parseProducts(rows);
    const tuples = validateTuples(rawTuples);

    const branchMap = await buildBranchMap();

    // Derivar LA sucursal del archivo (exports single-branch, Plan B).
    const legacyIds = new Set(tuples.map((t) => t.branchLegacyId));
    if (legacyIds.size === 0) {
      throw new Error(
        "El archivo no trae ninguna posición de inventario (0 tuplas).",
      );
    }
    if (legacyIds.size > 1) {
      throw new Error(
        `Se esperaba un archivo de UNA sucursal; trae ${legacyIds.size}: ${[...legacyIds].join(", ")}.`,
      );
    }
    const fileLegacyId = [...legacyIds][0];
    const fileBranchId = branchMap[String(fileLegacyId)];
    if (!fileBranchId) {
      throw new Error(`Sucursal desconocida: legacyStoreId=${fileLegacyId}`);
    }

    // Validador no-regresivo POR SUCURSAL: rechaza un snapshot más viejo
    // que el último importado de ESA sucursal (no el último global).
    const lastInventory = await prisma.importJob.findFirst({
      where: {
        source: "legacy_inventory",
        status: "COMPLETED",
        branchId: fileBranchId,
      },
      orderBy: { snapshotDate: "desc" },
    });
    const lastInventoryDate = lastInventory?.snapshotDate;
    if (lastInventoryDate && snapshotDate < lastInventoryDate) {
      throw new Error(
        `Este import es del ${format(snapshotDate, "dd/MM/yyyy HH:mm")}, más viejo que el último de esta sucursal (${format(lastInventoryDate, "dd/MM/yyyy HH:mm")}). Rechazado.`,
      );
    }

    importJobId = await createImportJob(fileName, snapshotDate, fileBranchId);
    const processedCount = await persistTuples(tuples, branchMap, importJobId);

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
    if (importJobId !== undefined) {
      await markImportJobFailed(importJobId, error);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const filePath = getFilePathFromArgs();
  console.time("total");
  console.log("Archivo recibido:", filePath);
  const workbook = readWorkbook(filePath);
  const result = await runExistenciasImport(workbook, filePath);
  console.log(
    `import de existencias completado. ImportJob ${result.importJobId}`,
  );
  console.log(`Tuplas procesadas: ${result.processedCount}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main()
    .catch((error) => {
      console.error("Error fatal:", error);
      process.exit(1);
    })
    .finally(async () => {
      console.timeEnd("total");
      await prisma.$disconnect();
    });
