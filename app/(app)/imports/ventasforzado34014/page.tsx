import { ImportForm } from "../ventas/import-form";
import { importVentasForzado } from "../ventas/actions";

export default function VentasForzadoPage() {
  return (
    <div className="p-8 space-y-6">
      <h1 className="font-display text-3xl text-destructive">
        Importar ventas — MODO FORZADO
      </h1>
      <p className="font-ui text-sm text-muted-foreground max-w-prose">
        Salta la guardia de fecha (permite días anteriores al último importado).
        Solo para corregir errores conscientes. La protección contra duplicados
        sigue activa.
      </p>
      <ImportForm action={importVentasForzado} />
    </div>
  );
}
