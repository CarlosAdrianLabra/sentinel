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
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const rowImpresion = rows.find((row) => {
      const firstCell = row[0];
      return (
        typeof firstCell === "string" && firstCell.startsWith("Impresión:")
      );
    });
    if (!rowImpresion) {
      console.error(
        "Error: no se encontro ninguna linea con 'Impresión:' y que sea un string",
      );
      process.exit(1);
    }
    const cellValue = rowImpresion[0] as string;
    const snapshotDateString = cellValue.replace("Impresión: ", "").trim();
    console.log("Fecha del snapshot:", snapshotDateString);
    let productCount = 0;

    for (const row of rows) {
      const cell = row[1];
      const isProductRow =
        typeof cell === "string" && cell.split("-").length - 1 >= 4;
      if (isProductRow) {
        productCount++;
        console.log(`Producto ${productCount}:`, cell);
      }
    }

    console.log(`Total de productos detectados: ${productCount}`);
  } catch (error) {
    console.error(
      "Error al leer el archivo:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}
