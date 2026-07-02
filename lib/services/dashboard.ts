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

export async function getRestockAlerts() {
  // Ingrediente 3: cuántos días DISTINTOS con ventas hay (el divisor).
  // groupBy por movementDate → cada grupo es una fecha distinta.
  // La cantidad de grupos = cantidad de días distintos.
  const diasConVentas = await prisma.inventoryMovement.groupBy({
    by: ["movementDate"],
    where: { movementType: "OUT" },
  });

  const numDias = diasConVentas.length || 1; // || 1 evita dividir por cero

  // (siguen ingredientes 1 y 2 — los agregamos en el próximo paso)

  // Ingrediente 1: stock actual por producto (suma de quantity, agrupado).
  const stockPorProducto = await prisma.inventoryPosition.groupBy({
    by: ["productId"],
    _sum: { quantity: true },
  });

  // Ingrediente 2: vendido por producto (suma de los OUT, agrupado).
  // Gemelo del groupBy de "más vendidos", pero sin take (los queremos todos).
  const vendidoPorProducto = await prisma.inventoryMovement.groupBy({
    by: ["productId"],
    where: { movementType: "OUT" },
    _sum: { quantityDelta: true },
  });

  // Cruce: por cada producto vendido, calcular días hasta agotarse.
  const alertas = vendidoPorProducto.map((v) => {
    // stock de este producto (buscar en la otra lista por id)
    const stockRow = stockPorProducto.find((s) => s.productId === v.productId);
    const stock = stockRow?._sum.quantity ?? 0;

    // vendido en positivo (el _sum viene negativo)
    const vendido = -(v._sum.quantityDelta ?? 0);

    // velocidad diaria y días hasta agotarse
    const velocidad = vendido / numDias;
    const diasRestantes = stock / velocidad; // stock ÷ velocidad

    return { productId: v.productId, stock, diasRestantes };
  });

  // ordenar por urgencia (menos días primero) y quedarnos con los 5 más urgentes
  // ordenar por urgencia (menos días primero)
  alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);

  // TODO Carlos: contar cuántas alertas están en zona crítica (< 15 días).
  //   Se cuenta sobre TODAS (`alertas`), ANTES del slice — si contás después
  //   del slice ya perdiste las que quedaron fuera del top 5.
  //   Pista: alertas.filter((a) => a.diasRestantes < 15).length
  const totalAlertas = alertas.filter((a) => a.diasRestantes < 15).length;

  // top 5 para el hero
  const top = alertas.slice(0, 5);

  const ids = top.map((a) => a.productId);
  const productos = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullDescription: true },
  });

  const lista = top.map((a) => ({
    id: a.productId,
    nombre: productos.find((p) => p.id === a.productId)?.fullDescription ?? "?",
    stock: a.stock,
    dias: Math.round(a.diasRestantes),
  }));

  // ahora devuelve DOS cosas: la lista del hero y el conteo total
  return { lista, totalAlertas };
}
