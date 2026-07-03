import { getMovementsData } from "@/lib/services/movements";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

export const dynamic = "force-dynamic";
export default async function MovementsPage() {
  const results = await getMovementsData();

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Movimientos</h1>

      {results.length === 0 ? (
        <p className="text-sm text-gray-400">Todavía no hay movimientos.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              {/* TODO Carlos: agregá el <TableHead> de "Tipo" */}
              <TableHead>Tipo</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead>Cantidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.fecha ? format(row.fecha, "dd/MM/yyyy") : "sin fecha"}
                </TableCell>
                {/* TODO Carlos: agregá el <TableCell> que muestra row.tipo */}
                <TableCell>{row.tipo}</TableCell>
                <TableCell>{row.sucursal}</TableCell>
                <TableCell>{row.producto}</TableCell>
                <TableCell>{row.talla}</TableCell>
                <TableCell>{row.cantidad}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
