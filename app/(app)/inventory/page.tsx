// app/inventory/page.tsx
import { searchInventory, countTotalPairs } from "@/lib/services/inventory";
import { SearchInput } from "./search-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function InventoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q ?? "";

  // TODO: llamar a searchInventory(query) y guardar en `results`
  const results = await searchInventory(query);

  // TODO: llamar a countTotalPairs() y guardar en `totalPairs`
  const totalPairs = await countTotalPairs();

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Inventario</h1>

      <SearchInput initialQuery={query} />

      {query === "" ? (
        <p className="text-sm text-gray-400">
          Escribí marca, modelo o color para buscar entre los{" "}
          {totalPairs.toLocaleString()} pares en stock.
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-gray-400">
          No se encontraron resultados para «{query}».
        </p>
      ) : (
        // TODO: renderizar la tabla con results
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead>Cantidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((res) => (
              <TableRow key={res.id}>
                <TableCell>{res.product.fullDescription}</TableCell>
                <TableCell>{res.branch.name}</TableCell>
                <TableCell>{res.size}</TableCell>
                <TableCell>{res.quantity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
