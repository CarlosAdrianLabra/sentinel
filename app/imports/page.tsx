// app/imports/page.tsx
import { getImportsPageData } from "@/lib/services/imports";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export default async function ImportsPage() {
  const { history } = await getImportsPageData();

  return (
    <main className="p-8">
      <h1 className="text-3xl">Imports</h1>
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
