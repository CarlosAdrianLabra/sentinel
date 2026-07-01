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
