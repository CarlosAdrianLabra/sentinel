// lib/services/inventory.ts
import { prisma } from "@/lib/db/prisma";

// Límite de resultados por búsqueda. Suficiente para una página
// de resultados sin abrumar al usuario ni a la DB. Si el usuario
// quiere ver más, refina la búsqueda.
const SEARCH_LIMIT = 100;

export async function searchInventory(query: string) {
  // Búsqueda vacía → no devolvemos nada. La página se encarga
  // de mostrar el mensaje guía. El servicio no conoce de UI.
  const trimmed = query.trim().toUpperCase();
  if (trimmed === "") {
    return [];
  }

  return prisma.inventoryPosition.findMany({
    where: {
      quantity: { gt: 0 },
      product: {
        fullDescription: {
          contains: trimmed,
        },
      },
    },
    include: {
      product: true,
      branch: true,
    },
    orderBy: [
      { product: { fullDescription: "asc" } },
      { branch: { code: "asc" } },
      { size: "asc" },
    ],
    take: SEARCH_LIMIT,
  });
}

// Cuenta total de pares en stock — para el mensaje guía en la
// página vacía ("buscá entre los X pares en stock").
export async function countTotalPairs(): Promise<number> {
  const result = await prisma.inventoryPosition.aggregate({
    where: { quantity: { gt: 0 } },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}
