import { prisma } from "@/lib/db/prisma";

export async function getDashboardKpis() {
  const stock = await prisma.inventoryPosition.aggregate({
    _sum: { quantity: true },
  });

  const paresEnPiso = stock._sum.quantity ?? 0;

  const modelosDistintos = await prisma.product.count();

  // KPI 2: Ventas del último día.
  // Paso 1 — encontrar el movementDate más reciente entre las ventas.
  const ultimaVenta = await prisma.inventoryMovement.findFirst({
    where: { movementType: "OUT" },
    orderBy: { movementDate: "desc" },
    select: { movementDate: true },
  });

  const ultimoDia = ultimaVenta?.movementDate ?? null;

  // Paso 2 — contar los OUT de ese día.
  // TODO Carlos: si ultimoDia existe, contar los InventoryMovement con
  //   movementType "OUT" Y movementDate === ultimoDia.
  //   Si ultimoDia es null (no hay ventas), ventasUltimoDia = 0.
  //   Pista: prisma.inventoryMovement.count({ where: { ... } })
  const ventasUltimoDia =
    ultimoDia == null
      ? 0
      : await prisma.inventoryMovement.count({
          where: { movementType: "OUT", movementDate: ultimoDia },
        });
  return {
    paresEnPiso,
    modelosDistintos,
    ventasUltimoDia,
  };
}

export async function getTopSellers() {
  const grupos = await prisma.inventoryMovement.groupBy({
    by: ["productId"],
    where: { movementType: "OUT" },
    _sum: { quantityDelta: true },
    orderBy: { _sum: { quantityDelta: "asc" } }, // más negativo = más vendido, arriba
    take: 5,
  });

  const ids = grupos.map((g) => g.productId);

  const productos = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullDescription: true },
  });

  return grupos.map((g) => {
    const producto = productos.find((p) => p.id === g.productId);
    return {
      id: g.productId,
      nombre: producto?.fullDescription ?? "?",
      unidades: -(g._sum.quantityDelta ?? 0),
    };
  });
}
