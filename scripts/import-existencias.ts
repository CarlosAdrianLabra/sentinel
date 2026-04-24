import XLSX from "xlsx";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Error: falta el argumento <ruta-al-archivo.xlsx>");
  console.error(
    "Uso: pnpm tsx scripts/import-existencias.ts <ruta-al-archivo.xlsx>",
  );
  process.exit(1);
} else {
  try {
    console.log("Archivo recibido:", filePath);
    const workbook = XLSX.readFile(filePath);
    console.log("Hojas encontradas:", workbook.SheetNames);
  } catch (error) {
    console.error(
      "Error al leer el archivo:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}
