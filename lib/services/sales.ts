// lib/services/sales.ts
import { prisma } from "@/lib/db/prisma";

// Datos para la vista de ventas: los movimientos OUT que produjeron los
// imports de ventas (source "legacy_sales"), aplanados a las columnas que
// muestra la página.
//
// Son DOS queries y no un include porque referenceId es un String genérico
// sin @relation a ImportJob — no se puede "entrar" desde el ImportJob a sus
// movements en una sola query. Primero los ids de los imports de ventas,
// después los movements que los referencian.
export async function getSalesData() {
  // Query 1: ids de los ImportJob de ventas. Son Int.
  const salesJobs = await prisma.importJob.findMany({
    where: { source: "legacy_sales" },
    select: { id: true },
  });

  // referenceId es String en la DB → doblamos NUESTROS números a string
  // para que entren en el `in`. (La columna no se dobla; es String y punto.)
  const salesJobIds = salesJobs.map((job) => job.id.toString());

  // Query 2: los movements de esos imports, con sucursal y producto.
  const movements = await prisma.inventoryMovement.findMany({
    where: { referenceId: { in: salesJobIds } },
    include: { branch: true, product: true },
    orderBy: { movementDate: "desc" },
  });

  return movements.map((m) => ({
    id: m.id,
    fecha: m.movementDate,
    sucursal: m.branch.name,
    producto: m.product.fullDescription,
    talla: m.size,
    cantidad: -m.quantityDelta,
  }));
}
