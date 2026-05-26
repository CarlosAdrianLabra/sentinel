import { getImportsPageData } from "@/lib/services/imports";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const FRESHNESS_STYLES: Record<
  "AL_DIA" | "PENDIENTE" | "DESACTUALIZADO" | "FALLO" | "SIN_DATOS",
  { label: string; cardClass: string }
> = {
  AL_DIA: {
    label: "Al día",
    cardClass: "border-green-600 bg-green-50 dark:bg-green-950",
  },
  PENDIENTE: {
    label: "Pendiente del import de hoy",
    cardClass: "border-yellow-600 bg-yellow-50 dark:bg-yellow-950",
  },
  DESACTUALIZADO: {
    label: "Datos desactualizados",
    cardClass: "border-red-600 bg-red-50 dark:bg-red-950",
  },
  FALLO: {
    label: "Último intento falló",
    cardClass: "border-red-600 bg-red-50 dark:bg-red-950",
  },
  SIN_DATOS: {
    label: "Sin datos importados",
    cardClass: "border-gray-400 bg-gray-50 dark:bg-gray-900",
  },
};
export default async function ImportsPage() {
  const { freshness, history } = await getImportsPageData();
  const freshnessStyle = FRESHNESS_STYLES[freshness.level];

  return (
    <main className="p-8 space-y-8">
      <h1 className="text-3xl">Imports</h1>
      <Card className={freshnessStyle.cardClass}>
        <CardHeader>
          <CardTitle>{freshnessStyle.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {freshness.lastSuccessful ? (
            <p>
              Datos del legacy:{" "}
              {freshness.lastSuccessful.snapshotDate?.toLocaleString() ?? "—"}
              <br />
              Importado a Sentinel:{" "}
              {freshness.lastSuccessful.createdAt.toLocaleString()}
            </p>
          ) : (
            <p>No hay imports COMPLETED en Sentinel.</p>
          )}
        </CardContent>
      </Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SnapshotDate</TableHead>
            <TableHead>createdAt</TableHead>
            <TableHead>status</TableHead>
            <TableHead>fileName</TableHead>
            <TableHead>processedRows</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((job) => (
            <TableRow key={job.id}>
              <TableCell>{job.snapshotDate?.toLocaleString()}</TableCell>
              <TableCell>{job.createdAt?.toLocaleString()}</TableCell>
              <TableCell>{job.status}</TableCell>
              <TableCell>{job.fileName}</TableCell>
              <TableCell>{job.processedRows}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
