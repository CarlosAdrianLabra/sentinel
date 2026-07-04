import { getSalesData } from "@/lib/services/sales";
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
export default async function SalesPage() {
  const results = await getSalesData();

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Ventas</h1>

      {results.length === 0 ? (
        <p className="text-sm text-gray-400">
          Todavía no hay ventas importadas.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
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
