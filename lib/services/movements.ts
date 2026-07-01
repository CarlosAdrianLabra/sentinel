// lib/services/movements.ts
import { prisma } from "@/lib/db/prisma";

// Datos para la vista de movimientos: TODOS los movements (ventas OUT +
// ajustes IMPORT_SET), aplanados. Es la película completa del inventario,
// para auditoría / detección de mermas (Jesús).
//
// Una sola query (no como sales, que hace dos para filtrar por origen):
// acá no filtramos por source, los queremos todos.
export async function getMovementsData() {
  const movements = await prisma.inventoryMovement.findMany({
    // TODO Carlos: ¿va un `where` acá? (decidiste que NO se filtra por origen)
    include: { branch: true, product: true },
    orderBy: { id: "desc" },
    take: 100,
  });

  return movements.map((m) => ({
    id: m.id,
    fecha: m.movementDate,
    tipo: m.movementType,
    sucursal: m.branch.name,
    producto: m.product.fullDescription,
    talla: m.size,
    // TODO Carlos: cantidad cruda, sin el `-` de ventas
    cantidad: m.quantityDelta,
  }));
}
