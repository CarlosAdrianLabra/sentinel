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
    const sheetName = workbook.SheetNames.find((name) =>
      name.startsWith("rpt"),
    );
    if (!sheetName) {
      console.error("Error: no se encontró ninguna hoja que empiece con 'rpt'");
      process.exit(1);
    }
    console.log("Hoja de datos:", sheetName);
  } catch (error) {
    console.error(
      "Error al leer el archivo:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}
