import { ImportForm } from "./import-form";

export default function ExistenciasImportPage() {
  return (
    <div className="p-8 space-y-6">
      <h1 className="font-display text-3xl">Importar existencias</h1>
      <p className="font-ui text-sm text-muted-foreground max-w-prose">
        Sube el reporte de existencias del legacy (.xlsx). Sentinel lee el
        archivo, actualiza el stock y registra el snapshot.
      </p>
      <ImportForm />
    </div>
  );
}
