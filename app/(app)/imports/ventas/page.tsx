import { ImportForm } from "./import-form";
import { importVentas } from "./actions";

export default function VentasImportPage() {
  return (
    <div className="p-8 space-y-6">
      <h1 className="font-display text-3xl">Importar ventas</h1>
      <p className="font-ui text-sm text-muted-foreground max-w-prose">
        Sube el reporte de ventas del legacy (.xlsx). Sentinel lee el archivo y
        registra las ventas del día como salidas de inventario.
      </p>
      <ImportForm action={importVentas} />
    </div>
  );
}
