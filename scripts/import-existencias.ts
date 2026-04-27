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
    let positionCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cell = row[1];

      // ¿Esta fila es inicio de producto? (misma regla que ya conocías)
      const isProductRow =
        typeof cell === "string" && cell.split("-").length - 1 >= 4;

      if (!isProductRow) {
        continue; // no es producto, pasamos a la siguiente fila
      }

      // Encontramos un producto
      productCount++;
      const productName = cell;
      console.log(`\nProducto ${productCount}: ${productName}`);

      // Ahora el bloque del producto arranca en i+1.
      // Mientras no encontremos el próximo producto (o se acabe el archivo),
      // vamos a procesar las filas del bloque.

      let j = i + 1;
      let sizeByColumn: Record<number, string> = {};

      while (j < rows.length) {
        const blockRow = rows[j];
        const blockCell = blockRow[1];

        // ¿Empezó el próximo producto? Si sí, fin del bloque.
        const isNextProduct =
          typeof blockCell === "string" && blockCell.split("-").length - 1 >= 4;
        if (isNextProduct) {
          break;
        }

        // ¿Es la fila header de tallas (SUC.)?
        if (blockCell === "SUC.") {
          sizeByColumn = {}; // reseteamos en cada SUC. (un producto puede tener varios bloques)

          for (let col = 4; col < 27; col++) {
            const headerCell = blockRow[col];

            // ¿es una talla? validar paso por paso
            if (typeof headerCell !== "string") continue;

            const trimmed = headerCell.trim();
            if (trimmed === "") continue;

            const num = Number(trimmed);
            if (isNaN(num)) continue;
            if (num < 1000 || num > 4000) continue;

            const tallaReal = num / 100;
            sizeByColumn[col] = tallaReal.toFixed(1);
          }

          console.log(`  [SUC. en fila ${j}] Mapa de tallas:`, sizeByColumn);
        }

        // ¿Es fila de datos? (sucursal en col 1 es número)
        const branchLegacyId = blockCell;
        if (typeof branchLegacyId === "number") {
          positionCount++;

          // Iterar las claves del mapa de tallas
          for (const claveStr of Object.keys(sizeByColumn)) {
            const col = Number(claveStr);
            const talla = sizeByColumn[col];
            const cantidadCell = blockRow[col];

            // TU TAREA 1: chequear que cantidadCell sea un número
            // TU TAREA 2: chequear que sea mayor a 0
            // TU TAREA 3: si pasa los dos chequeos, imprimir:
            //   `  - Branch ${branchLegacyId} (fila ${j}): talla ${talla} → ${cantidadCell} par(es)`

            if (typeof cantidadCell === "number" && cantidadCell > 0) {
              console.log(
                `  - Branch ${branchLegacyId} (fila ${j}): talla ${talla} → ${cantidadCell} par(es)`,
              );
            }
          }
        }

        j++;
      }

      // Saltamos adelante, al inicio del próximo bloque (donde está j)
      i = j - 1; // -1 porque el for va a hacer i++ automáticamente
    }

    console.log(`\nTotal de productos detectados: ${productCount}`);
    console.log(`Total de filas de datos detectadas: ${positionCount}`);
  } catch (error) {
    console.error(
      "Error al leer el archivo:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}
