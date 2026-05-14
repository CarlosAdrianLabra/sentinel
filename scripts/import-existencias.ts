import XLSX from "xlsx";
import { z } from "zod";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { parse } from "date-fns";

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
    console.error("Error: falta el argumento <ruta-al-archivo.xlsx>");
    console.error(
      "Uso: pnpm tsx scripts/import-existencias.ts <ruta-al-archivo.xlsx>",
    );
    process.exit(1);
  }
  return filePath;
}

function readWorkbook(filePath: string) {
  return XLSX.readFile(filePath);
}

function selectDataSheet(workbook: XLSX.WorkBook): string {
  const sheetName = workbook.SheetNames.find((name) => name.startsWith("rpt"));
  if (!sheetName) {
    console.error("Error: no se encontró ninguna hoja que empiece con 'rpt'");
    process.exit(1);
  }
  return sheetName;
}

function extractSnapshotDate(rows: unknown[][]): string {
  const rowImpresion = rows.find((row) => {
    const firstCell = row[0];
    return typeof firstCell === "string" && firstCell.startsWith("Impresión:");
  });
  if (!rowImpresion) {
    console.error(
      "Error: no se encontro ninguna linea con 'Impresión:' y que sea un string",
    );
    process.exit(1);
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

        for (let col = 4; col < 27; col++) {
          const headerCell = blockRow[col];

          if (typeof headerCell !== "string") continue;

          const trimmed = headerCell.trim();
          if (trimmed === "") continue;

          const num = Number(trimmed);
          if (isNaN(num)) continue;
          if (num < 1000 || num > 4000) continue;

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
          }
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
  filePath: string,
  snapshotDate: Date,
): Promise<number> {
  const job = await prisma.importJob.create({
    data: {
      source: "legacy_inventory",
      status: "RUNNING",
      fileName: filePath,
      startedAt: new Date(),
      snapshotDate: snapshotDate,
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

      // 2. Upsert InventoryPosition por (branchId, productId, size)
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

      // 3. Crear InventoryMovement
      await tx.inventoryMovement.create({
        data: {
          branchId: branchId,
          productId: product.id,
          size: tuple.size,
          movementType: "IMPORT_SET",
          quantityDelta: tuple.quantity,
          referenceId: String(importJobId),
        },
      });

      processedCount++;
    }
  });

  return processedCount;
}

async function main(): Promise<void> {
  const filePath = getFilePathFromArgs();
  let importJobId: number | undefined;
  try {
    console.log("Archivo recibido:", filePath);
    const workbook = readWorkbook(filePath);
    console.log("Hojas encontradas:", workbook.SheetNames);
    const sheetName = selectDataSheet(workbook);
    console.log("Hoja de datos:", sheetName);
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const snapshotDateString = extractSnapshotDate(rows);
    console.log("Fecha del snapshot:", snapshotDateString);

    const rawTuples = parseProducts(rows);
    const tuples = validateTuples(rawTuples);

    const branchMap = await buildBranchMap();
    console.log("Mapa de branches (legacyStoreId → id):", branchMap);

    const snapshotDate = parseSnapshotDate(snapshotDateString);
    importJobId = await createImportJob(filePath, snapshotDate);
    console.log(`ImportJob creado con id ${importJobId}`);

    const processedCount = await persistTuples(tuples, branchMap, importJobId);

    // Marcar ImportJob como COMPLETED
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        totalRows: tuples.length,
        processedRows: processedCount,
      },
    });

    console.log(
      `Import completado. ImportJob ${importJobId} marcado como COMPLETED.`,
    );
    console.log(`Productos/posiciones/movements creados: ${processedCount}`);

    const totalPares = tuples.reduce((sum, t) => sum + t.quantity, 0);
    console.log(`Suma de quantity en tuplas: ${totalPares}`);
    console.log(`\nPrimera tupla:`, tuples[0]);
    console.log(`Última tupla:`, tuples[tuples.length - 1]);
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

    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error("Error fatal:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
