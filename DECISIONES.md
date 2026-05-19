# DECISIONES — Sentinel

Documento vivo de decisiones, supuestos y contexto del proyecto.
Actualizar cada vez que se tome una decisión arquitectónica nueva.

---

## 1. Contexto del proyecto

**Nombre:** Sentinel
**Qué es:** Capa externa de control operacional para una zapatería familiar (Grupo del Llano).
**Qué NO es:** Un reemplazo del sistema legacy.

**Legacy existente:** INVENSHOES — sistema de escritorio que ya se usa en la empresa. No se va a tocar. Sentinel vive encima y se conecta vía imports/exports.

**Problema que resuelve:** el legacy no tiene existencias confiables; los nombres fiscales de sucursales no coinciden con los operativos; no hay forma clara de auditar cambios ni reconciliar datos entre unidades operativas.

---

## 2. Perfil del desarrollador

- Carlos, ingeniero en sistemas computacionales.
- 4 años de experiencia previa, principalmente en low-code (Bubble.io) + gestión de equipo (7 juniors a cargo).
- Este proyecto sirve dos propósitos: ayudar a la empresa familiar Y desempolvar habilidades para buscar mejor trabajo.
- Viene de low-code, no de código profesional de Node/TypeScript. Conceptos de arquitectura sí; sintaxis y ecosistema Node no.

**Contrato de trabajo acordado:**

- Empezamos con mucho código explicado por Claude. Gradualmente Carlos escribe más.
- Proporción inicial: 70% dado por Claude / 20% escrito juntos / 10% escrito por Carlos.
- La proporción se mueve a 20/30/50 conforme gana intuición.
- Antes de dar código nuevo, Claude pregunta cómo lo resolvería Carlos primero.
- Claude deja TODOs pequeños en el código dado para que Carlos complete.
- Claude pide predecir qué va a pasar antes de correr código nuevo.
- Cuando Carlos escribe subóptimo pero funcional, Claude a veces lo deja verlo en acción antes de corregir.
- Debugging siempre lo hace Carlos — Claude guía con preguntas, no da la solución directa.
- Carlos debe parar y preguntar cuando algo no le cuadra, no asentir para avanzar.
- Claude avisa cuando perciba pérdida de contexto o calidad reducida.
- Después de correr código, Carlos compara el resultado con su predicción antes de seguir.
  El contraste predicción/realidad es donde se construye intuición.

---

## 3. Stack técnico (MVP v1)

**Tecnologías elegidas:**

- Next.js 16.2.4 (App Router, Turbopack)
- TypeScript 5.9
- Prisma 7.7 + SQLite
- Zod (instalado, no usado aún)
- Tailwind CSS 4
- shadcn/ui (planeado, no instalado aún)

**No usaremos en esta versión:**

- Django / Python
- PostgreSQL
- Auth compleja
- Microservicios
- Docker
- React Compiler (declinado por simplicidad en aprendizaje)

**Gestor de paquetes:** pnpm 10.33
**Node:** v24.14.1
**OS de desarrollo:** Windows 10
**Ruta del proyecto:** `C:\Users\carlo\Documents\dev\sentinel`

---

## 4. Particularidades de Prisma 7 (importantes)

Prisma 7 cambió varias cosas respecto a Prisma 6. Estos son los puntos críticos:

- **Datasource URL NO va en `schema.prisma`** — va en `prisma.config.ts` usando el helper `env("DATABASE_URL")`.
- **Requiere driver adapter.** Para SQLite usamos `@prisma/adapter-better-sqlite3`.
- **Generator debe ser `"prisma-client"`** (NO `"prisma-client-js"`, que es de v6).
- **Cliente se importa desde `generated/prisma/client`**, NO desde `@prisma/client`.
- **`package.json` requiere `"type": "module"`** (ESM).
- **Build scripts de SQLite/esbuild/Prisma requieren `pnpm approve-builds`** — registrado en `pnpm-workspace.yaml`.
- **Seed se configura en `prisma.config.ts`** dentro del bloque `migrations` como `seed: "tsx prisma/seed.ts"`.

---

## 5. Estructura del proyecto

sentinel/
├── app/ # Next.js App Router (vacío por ahora)
├── generated/prisma/ # Cliente Prisma autogenerado (NO EDITAR)
├── lib/
│ ├── constants/
│ │ └── branches.ts # BRANCHES (array de 3 sucursales)
│ └── db/
│ └── prisma.ts # Cliente Prisma singleton (patrón globalThis)
├── prisma/
│ ├── migrations/ # SQL generado por prisma migrate
│ ├── schema.prisma # Fuente de verdad del modelo de datos
│ ├── seed.ts # Pobla BRANCHES con upsert (idempotente)
│ ├── reset.ts # Borra todas las branches con deleteMany
│ └── dev.db # SQLite local (NO va a git)
├── prisma.config.ts # Config de Prisma CLI
├── .env # DATABASE_URL="file:./prisma/dev.db"
└── ...

**Convención:** carpetas autogeneradas (`generated/`, `.next/`, `node_modules/`) NO se editan manualmente y NO van a git.

---

### `Branch` — sucursales

Campos:

- `id` (Int) — identidad técnica interna.
- `code` (String, @unique) — identidad operativa estable ("ABRYL", "TEZONCO", "ECOMM", "MARISOL").
- `name` (String) — nombre operativo corto para mostrar en UI ("Abryl", "Tezonco", "e-commerce", "Marisol"). Distinto de `legacyStoreName`.
- `legacyStoreId` (String, @unique) — puente con INVENSHOES ("1", "2", "4", "5").
- `legacyStoreName` (String?, opcional) — nombre como aparece en el legacy (ej. "Adrian Granados Del Llano").
- `isActive` (Boolean, default true), `createdAt`, `updatedAt` — metadata estándar.

### `Product` — SKUs

- **Llave de negocio:** `fullDescription` (@unique) — ejemplo: `"CHARLY-79340-NIÑO-SINTETICO-BLANCO"`.
- **Campos descompuestos opcionales:** `brand`, `modelNumber`, `gender`, `material`, `color`.
- **`isActive`:** false cuando el legacy marca el producto con `*`.

### `InventoryPosition`

- Tupla única: `(branchId, productId, size)`.
- `size` es **String** (ej. `"17.5"`, `"27.0"`) — el parser normaliza desde el entero del legacy (ej. `1750` → `"17.5"`).

### `InventoryMovement`

- Append-only (nunca se edita ni borra; errores se compensan con movimientos inversos).
- `movementType` como String validado por Zod: `IN | OUT | ADJUSTMENT | IMPORT_SET`. Los traspasos entre sucursales se modelan como dos movimientos con
  el mismo `referenceId`: un `OUT` en la sucursal origen + un `IN` en
  la sucursal destino. El `referenceId` compartido los vincula como
  una sola operación lógica.
- `quantityDelta` puede ser negativo.
- `referenceId` apunta a ImportJob.id u otros folios externos.

### `AuditLog`

- Eventos genéricos del sistema (distinto de movimientos de inventario).
- `metadata` como String (JSON serializado — SQLite no tiene tipo Json).

### `ImportJob`

- Estado y metadata de cada importación desde el legacy.
- Permite revertir un import completo vía `referenceId` en movimientos.

**Queda fuera del MVP:** precios, costos, proveedor-como-entidad, categoría/línea/sublínea, temporada, autenticación, usuarios, multi-talla-tipográfica, borrado suave.

---

## 7. Mapeo de sucursales

| ID legacy | Nombre en INVENSHOES      | Code operativo | Nombre operativo |
| --------- | ------------------------- | -------------- | ---------------- |
| `"1"`     | Adrian Granados Del Llano | `ABRYL`        | Abryl            |
| `"2"`     | Carlos Del Llano Robles   | `TEZONCO`      | Tezonco          |
| `"4"`     | Marisol                   | `MARISOL`      | Marisol          |
| `"5"`     | Sport Tenis               | `ECOMM`        | e-commerce       |

Las sucursales viven en `lib/constants/branches.ts` como constante y se siembran con `prisma/seed.ts`.

**Nota sobre ECOMM (branch 5 / Sport Tenis):**
ECOMM no es una bodega física. Es un canal de ventas llevado por un
distribuidor externo (Sport Tenis) que acepta vales de despensa y
entrega al cliente final. En el legacy, las ventas de e-commerce se
registran como _traspaso_ de ABRYL o TEZONCO hacia ECOMM — indicando
que el zapato físico salió de la bodega de la tienda y ahora está
asignado al distribuidor, pendiente de entrega. Semánticamente, el
"stock de ECOMM" es inventario consignado/en-tránsito, no bodega
propia. Esto afecta cómo se interpretan los archivos de existencias
de ECOMM y cómo se modelan los movimientos de venta de e-commerce.

**Nota sobre MARISOL (branch 4):**
MARISOL no es una bodega física. Es una "sucursal virtual" que el
legacy usa para representar el estado "apartado". Cuando un cliente
aparta un zapato en ABRYL o TEZONCO, el legacy hace un traspaso desde
la sucursal de origen hacia MARISOL; el zapato físicamente sigue en
la bodega de origen, en una sección designada "apartado", pero el
reporte de existencias lo cuenta en MARISOL (SUC. 4), NO en la
sucursal física donde está.

Implicaciones:

- Si alguien pregunta "¿cuántos zapatos tengo físicamente en Abryl?",
  la respuesta verdadera es `stock(ABRYL) + stock(MARISOL que vino de ABRYL)`.
- Si el cliente recoge el apartado, se concreta la venta (movimiento OUT en MARISOL).
- Si no lo recoge, el legacy hace un traspaso inverso MARISOL → sucursal original.
- El propósito del diseño en el legacy (por qué es una sucursal separada
  en vez de una marca de "reservado") es desconocido — pendiente de
  preguntar al operador del legacy.

En Sentinel, por pragmatismo en MVP, MARISOL se modela como una Branch
más (así viene en los datos). Cuando lleguemos a reportes de
reconciliación física, probablemente haya que repensarlo (¿MARISOL es
branch o es un estado?) — decisión diferida.

---

## 8. Formato del legacy INVENSHOES

Análisis de archivos reales (MARZOVENTAS.xlsx, CHARLYEXISTENCIA.xlsx, VENTACHARLY79340.xlsx, COMPRASMARZO.xlsx):

**Formato de descripción de producto: 100% consistente.**
MARCA-MODELO-GENERO-MATERIAL-COLOR

- Siempre 4 guiones, 5 partes.
- 84 marcas distintas detectadas.
- 8 géneros/líneas: `BEBE, CABALLERO, DAMA, JOVEN, NIÑA, NIÑO, UNISEX, VARIOS`.
- 8 materiales: `ALUMINIO, PIEL, PIEL/SINTETICO, SINTETICO, SINTETICO/PIEL, SINTETICO/TEXTIL, TEXTIL, TEXTIL/SINTETICO`.
- Color puede llevar `/` cuando es bicolor (`BLANCO/NEGRO`).
- Productos inactivos llevan `*` al final.

**Implicación para el parser de import:** split por `-` funciona. Validación con Zod después.

**Tallas en el legacy:** vienen como enteros en centésimas (`1750` = talla 17.5). El parser normaliza.

**Formato de archivos de existencias (observado en CHARLYEXISTENCIA.xlsx):**

- NO es tabular. Es un reporte tipo Crystal Reports.
- Dos hojas: "Mapa del documento" (TOC auto-generado, se ignora) y
  la hoja de datos real (nombre tipo `rptNewInventarioGlobal...`).
- Header del archivo (~14 filas): metadatos como `Sucursal:`,
  filtros aplicados (Marca, Proveedor, etc.), fecha de impresión,
  cantidad total, importe total.
- Después del header, bloques repetitivos de ~4 filas por producto:
  1. Fila con `fullDescription` del producto (en columna 1).
  2. Header de tallas: `SUC. CANT. COSTO IMPORTE` + columnas de tallas.
  3. Fila(s) de datos: sucursal, cantidad, costo, importe, cantidades por talla.
  4. Fila `TOT.` con totales.
- Las columnas de tallas **varían por producto** (niños 11.0-21.0,
  adultos 25.0-31.0). El parser debe leer la fila header de cada
  producto para mapear columna → talla.
- Un archivo exportado filtrado por sucursal contiene solo esa sucursal
  (la sucursal está en el header, no por fila). Un archivo multi-sucursal
  presumiblemente tiene múltiples filas de datos por producto — formato
  pendiente de confirmar cuando tengamos un archivo real.
- Timestamp "Impresión: DD/MM/YYYY HH:MM" en el header indica el momento
  del snapshot. El parser debe capturarlo en el `ImportJob`, no usar
  `new Date()` al importar.

**Detalles técnicos observados al parsear Converse.xlsx con `xlsx` (SheetJS):**

- Al convertir la hoja con `sheet_to_json(sheet, { header: 1 })`:
  - Columna 0 es siempre vacía. Los datos útiles arrancan en columna 1.
  - Las tallas en la fila header vienen como **strings con padding de
    espacios** (ej. `"1700      "`), no como números. El parser debe
    hacer `.trim()` antes de convertir a número.
  - Celdas vacías aparecen en tres formas: `undefined` (sparse slots,
    se muestran como `<N empty items>` en Node), `""` (string vacío),
    `null` (raramente). Los tres casos deben normalizarse con un helper
    `isEmpty(cell)`.
  - **Importante: ceros vs vacíos en filas de datos.** El legacy
    distingue entre las dos cosas según la fila:
    - Filas de **SUC.** (datos por sucursal): celda **vacía** cuando
      no hay stock para esa talla. Nunca emite 0 explícito.
    - Filas de **TOT.** (totales de bloque): emite **0 explícito**
      cuando el total es cero.
    Verificado visualmente en CHARLYEXISTENCIA.xlsx (2026-05-15).
    Implicación: un filtro tipo `cantidad > 0` aplicado solo a filas
    de SUC es indistinguible de un filtro `typeof === "number"`,
    porque en esas filas nunca hay 0. El parser actual aprovecha esto
    (ver sección 10).
- Header "Sucursal: TODAS" aparece en archivos multi-sucursal.
  El parser NO debe depender del header para obtener la sucursal —
  siempre debe leer la sucursal de la columna 1 de cada fila de datos.
- Un bloque de producto puede tener múltiples filas de datos (una por
  sucursal que tiene stock) antes del `TOT.` de cierre. El parser itera
  todas las filas entre header y TOT.
- La fila `TOT.` es redundante para nuestros fines (los totales ya
  los podemos calcular desde las filas de datos). Se usa solo como
  marca de "fin de bloque".

---

## 9. Fases completadas

- **Fase 1** — Entorno local (Node, pnpm, git, VS Code).
- **Fase 2** — Proyecto Next.js 16 creado y corriendo en localhost:3000.
- **Fase 3** — Prisma instalado, adapter configurado, primera migración (HealthCheck) validada.
- **Fase 4** — Schema del dominio aplicado (6 entidades). SQL leído y entendido.
- **Fase 5** — Seed de sucursales funcional e idempotente. Reto extra: script reset.ts escrito por Carlos.
- **Fase 6** — Servicio `lib/services/branches.ts` + endpoint `GET /api/branches` funcionando. Separación servicio/handler validada. Respuesta envuelta en `{ branches: [...] }`. Manejo de errores con try/catch en el handler, log autodescriptivo, status 500 con mensaje sanitizado. Verificado en navegador en localhost:3000/api/branches.
- **Fase 7** — Primera UI: `app/branches/page.tsx` como Server Component que llama `listBranches()` directo (sin pasar por fetch a la API). Decisión arquitectónica: Server Components consumen servicios internos; la API route queda para consumidores externos (app móvil futura, integraciones, terceros). Error handling delegado a Next.js (sin try/catch en la página; `error.tsx` pendiente). Estilado con Tailwind puro: jerarquía de texto (h1/h2/p con `text-3xl`, `text-xl`, `text-sm`), tarjetas con `border rounded-lg p-4`, separación entre tarjetas con `space-y-4`, padding de página con `p-8`. Preflight de Tailwind entendido: resetea defaults del navegador, hay que estilizar explícitamente. Dark mode automático vía `prefers-color-scheme` del layout raíz — `text-gray-400` elegido para legibilidad en modo oscuro (solución temporal hasta sistema de temas explícito).

## 10. Fase actual

**Fase 8 — Parser de existencias desde Excel legacy.**

Alcance del MVP:

- Script standalone: `pnpm tsx scripts/import-existencias.ts <archivo.xlsx>`.
- Maneja formato observado en CHARLYEXISTENCIA.xlsx (un archivo = una sucursal).
- Importa todos los productos (activos e inactivos, `isActive` derivado del `*`).
- Crea `InventoryPosition` solo para combos (branch, producto, talla)
  con `quantity > 0` en el snapshot. La decisión original era guardar
  también las de 0, pero en la práctica el legacy nunca emite 0 en filas
  de SUC (siempre celda vacía — ver sección 8), así que el filtro `> 0`
  en el parser y "ignorar celdas no numéricas" son indistinguibles para
  los archivos que tenemos. Limitación conocida: si un import posterior
  no menciona una posición que sí existe en DB, esa posición no se
  actualiza — ver edge case más abajo.
- Ignora costo por ahora (fuera del MVP, queda como ejercicio futuro).
- Captura la fecha del snapshot del header del archivo.
- Persiste en `ImportJob` + `InventoryMovement` de tipo `IMPORT_SET`.
- Validación con Zod en cada frontera.

Fuera del alcance:

- UI de import (Fase 9+).
- Archivos multi-sucursal (cuando tengamos uno para inspeccionar).
- Archivos de ECOMM/branch 5 (semántica distinta, ver Sección 7).
- Otros tipos de archivos (ventas, compras): fases posteriores.

**Progreso de Fase 8 — parser de existencias:**

Hito alcanzado: el parser convierte un archivo xlsx del legacy en un
array tipado `InventoryTuple[]` en memoria, listo para validar y
persistir.

Implementado:

- Validación de argumento CLI (`process.argv[2]`).
- Lectura del workbook con `xlsx` (SheetJS).
- Selección de hoja por convención `rpt*`.
- Extracción del timestamp del header.
- Detección de productos por patrón (>=4 guiones en col 1).
- Soporte de productos multi-rango-tallas (varios bloques `SUC.`).
- Soporte de archivos multi-branch (varias filas de datos por bloque).
- Mapeo dinámico columna → talla (normalizada como string "17.0").
- Detección y limpieza de productos inactivos (terminan con `*`).
- Construcción de tuplas tipadas: `{ branchLegacyId, fullDescription,
isActive, size, quantity }`.
- Validación con Zod: `InventoryTupleSchema` define el contrato runtime
  (entero positivo, regex de talla "N.N", etc.). El type `InventoryTuple`
  se infiere del schema con `z.infer` — fuente única de verdad. Función
  `validateTuples(unknown[])` corre antes de persistir; si Zod tira
  `ZodError`, el catch lo distingue con `instanceof` y muestra mensajes
  legibles (`tupla N.campo: mensaje`).
- **Verificador de TOT (agregado 2026-05-15):** durante el parseo, el
  script suma las cantidades que extrae por bloque SUC. y las compara
  con la fila `TOT.` del mismo bloque. Si difieren, emite un warning
  `*** MISMATCH "<producto>": parser=N, archivo=M`. No frena el import
  — es una guardia diagnóstica para detectar futuros cambios de formato
  del legacy o bugs en el parser. Se decidió dejarlo permanente.

Refactor: el script está dividido en funciones puras
(`getFilePathFromArgs`, `readWorkbook`, `selectDataSheet`,
`extractSnapshotDate`, `parseProducts`) orquestadas por `main()`.

Verificación: probado con Converse.xlsx (multi-branch, multi-rango),
CHARLYEXISTENCIA.xlsx (single-branch, 2,246 productos),
rptNewInvetarioGlobalSinVenta.xlsx (single-branch, 25,052 productos,
113K filas). En Converse: suma de quantity en tuplas = 514, igual al
total reportado por el legacy.

**CHARLY con persistencia (2026-05-15):** corrido end-to-end con
escritura a DB. Resultados:

- Productos detectados: 2,246 (todos los del archivo, activos e inactivos).
- Filas de datos detectadas: 2,811 (más que productos porque hay
  productos multi-rango que generan varios bloques SUC.).
- Tuplas persistidas: 550 (combos branch × producto × talla con stock).
- Suma de pares: 898 — **cuadra exacto con "Cantidad: 898" del header
  del archivo legacy**. Esta es la verificación clave: el parser está
  sumando bien lo que ve.
- ImportJob 11 marcado COMPLETED. Transacción atómica sin errores.

**rptNew con persistencia (2026-05-15):** corrido end-to-end con el
archivo más grande del set (25,052 productos, 113K filas). Resultados
finales después de descubrir y arreglar 3 problemas:

- Productos detectados: 25,052.
- Filas de datos detectadas: 29,565.
- Tuplas persistidas: 8,201+ (combos branch × producto × talla con stock).
- Suma de pares: 15,166.
- "Cantidad" del header legacy: 15,997.
- Diferencia 831 pares: corresponden a productos no-zapato (cremas,
  cabestrillos, andaderas, etc.) deliberadamente fuera del MVP — ver
  sección 11. Para productos zapato el parser cuadra exacto.
- Tiempo total del script: ~14s (incluye parseo + persistencia). No
  pega contra el timeout de 5s de transacciones interactivas de Prisma
  porque el grueso del tiempo se va en el parseo del .xlsx, no en la
  transacción.
- ImportJob 12 marcado COMPLETED.

**Problemas descubiertos y resueltos durante esta verificación
(2026-05-15):**

1. **Falsos mismatches por `productSum` mal reseteado.** El verificador
   de TOT (recién agregado) inicializaba `productSum = 0` una vez por
   producto, no por bloque SUC. En productos multi-rango (bloques SUC.
   múltiples), `productSum` acumulaba entre bloques y comparaba mal
   contra el TOT del bloque actual. Generaba ~190 falsos mismatches.
   Arreglo: mover `productSum = 0` adentro del `if (blockCell === "SUC.")`,
   junto al reset de `sizeByColumn`. **Bug del verificador, no del parser
   real** — las tuplas persistidas eran correctas.

2. **Bug real: tallas BEBE perdidas.** El filtro de columnas de tallas
   era `num < 1000 || num > 4000`. Esto cortaba tallas `0900` (9.0)
   y otras menores a 10.0, que aparecen en productos BEBE y niños
   chicos. 17 productos afectados, ~30 pares perdidos silenciosamente.
   Arreglo: bajar el límite inferior a `< 500`. El rango `500-4000`
   cubre desde 5.0 (bebé recién nacido) hasta 40.0 (adulto grande).
   El límite superior sigue siendo defensa contra basura de captura
   tipo `9500` (typo del legacy confirmado por el operador).

3. **Limitación de scope: productos no-zapato.** 209 productos del
   archivo usan headers de talla categóricos (`PZA`, `XCHI|CHIC|MEDI|GRAN|EXTR`,
   `CH00|MD00|GR00|XG00|JM00`) en vez de tallas numéricas. Marcas:
   ARFAT (cremas, esponjas, plantillas), DAONSA (cabestrillos,
   andaderas, férulas), SUPER CONFORT (sillas de ruedas, bastones),
   MEDI PAR (férulas), LE ROY (collarines), etc. El parser los ignora
   completamente porque sus "tallas" no son numéricas. **Decisión:
   diferido** — el operador (tío de Carlos) confirma que SÍ quiere
   estos productos en Sentinel "preferiblemente", pero NO son
   prioritarios. Requieren rediseño del schema (¿`size` como string
   libre? ¿enum por familia de producto? ¿campo `productCategory`?).
   Ver sección 11.

**Dónde retomar:**

Deudas técnicas completadas (Fase 8):

- ✅ #1 — ImportJob huérfano id=1 eliminado (script puntual scripts/cleanup-orphan-importjobs.ts).
- ✅ #2 — quantityDelta como diferencia (previousQuantity vía findUnique;
  movement omitido si delta=0). Verificado: re-correr Converse identico = 0 movements nuevos.
- ✅ #3 — snapshotDate persistido (DateTime?, parseado con date-fns).
- ✅ #4 — Manejo de errores: catch con 3 ramas + markImportJobFailed.
- ✅ #5 — Refactor: persistTuples extraida de main().

**Pendiente inmediato:** ninguno. Fase 8 cerrada.

- ✅ CHARLYEXISTENCIA.xlsx — corrido con persistencia el 2026-05-15,
  total 898/898 cuadra con el legacy.
- ✅ rptNewInvetarioGlobalSinVenta.xlsx — corrido con persistencia el
  2026-05-15, total 15,166/15,166 para productos zapato (831 pares de
  productos no-zapato fuera de scope, documentados).

**Próxima fase propuesta — Fase 9: UI `/imports`.**

Página que liste ImportJobs (status, fechas, contadores). Requiere
instalar shadcn/ui antes. Extiende la UI de branches (Fase 7) y da
visibilidad de los imports al operador. Antes de empezar, refactorizar
los `process.exit(1)` del parser a `throw new Error(...)` para que sea
seguro invocarlo desde un Server Action (ver sección 11).

**Otras direcciones para futuras sesiones:**

- Otros tipos de import (ventas, compras): requieren diseño formal antes de
  empezar. Ventas seria movements OUT, compras IN. Pensar como reconciliar
  el snapshot de existencias con los movimientos individuales.
- **Edge case no resuelto (refinado 2026-05-15):** si un snapshot
  posterior NO menciona una posición que SÍ existe en DB con stock,
  la posición queda intacta — el parser no genera tupla para ella y
  `persistTuples` nunca la toca. Esto NO se manifiesta dentro de un
  solo import (no hay datos previos contra los que comparar), pero
  SÍ se manifiesta entre imports consecutivos. Concretamente:
  - Día 1: import dice (branch=1, producto X, talla 27.0) = 5 pares.
    DB queda en 5.
  - Día 2: se vendieron los 5. El legacy ya no imprime esa fila
    (celda vacía, no 0). El parser no genera tupla para esa posición.
    `persistTuples` no la toca. DB sigue diciendo 5. **Snapshot mintió.**

  Por qué pasa: el filtro `> 0` en `parseProducts` y la decisión del
  legacy de emitir vacío (no 0) en filas SUC se combinan para que
  "no aparece en el archivo" sea indistinguible de "no está en el
  rango de tallas del producto".

  Estrategia para resolver (diferida): cuando se procese un snapshot,
  hacer un diff contra el estado actual de la DB para el conjunto de
  (branches, productos) que aparecen en el archivo, y generar tuplas
  con quantity=0 para las posiciones que existían y ya no aparecen.
  Decisión de diseño pendiente: ¿alcance del diff? ¿solo dentro de
  productos mencionados, o también productos que aparecían antes y
  ya no aparecen en absoluto?

  Para el MVP (primer import a DB vacía) este bug no se manifiesta —
  no hay posiciones previas contra las que sobrescribir.

## 11. Decisiones pendientes / preguntas abiertas

- Estrategia de conflicto entre legacy y Sentinel: ¿legacy gana, Sentinel gana, o se marca conflicto? Decidir antes del primer import real.
- Si Prisma 7 tendrá un comportamiento distinto en algún aspecto: verificar contra la documentación siempre que parezca contradictorio con Prisma 6.

- **Manejo de errores en el parser de imports.** Las funciones del script (`getFilePathFromArgs`, `selectDataSheet`, etc.) terminan el proceso con `process.exit(1)` cuando algo falla. Esto está bien para un script CLI standalone, pero **rompería un servidor** si lo invocáramos desde un Server Action o Route Handler de Next: mataría el proceso entero, tirando todos los usuarios conectados. Cuando integremos el parser a una UI, refactorizar a `throw new Error(...)` y manejar los errores en la capa de orquestación (la API/Action), no en las funciones internas.

- **Productos no-zapato con tallas categóricas (descubierto 2026-05-15).**
  El legacy contiene ~209 productos no-zapato — cremas, esponjas,
  cabestrillos, andaderas, sillas de ruedas, plantillas, férulas,
  collarines — de marcas tipo ARFAT, DAONSA, SUPER CONFORT, MEDI PAR,
  LE ROY. Estos productos usan headers de talla categóricos (no numéricos):
  `PZA` para pieza única, `XCHI|CHIC|MEDI|GRAN|EXTR` para ortopedia,
  `CH00|MD00|GR00|XG00|JM00` para vendas/calcetas, etc. El parser
  actual los detecta (genera la fila "Producto N: ...") pero ignora
  todas sus celdas de cantidad porque sus headers no caen en el rango
  numérico `500-4000`.

  Decisión actual: **diferido**. El operador confirma que SÍ los quiere
  en Sentinel "preferiblemente", pero no son prioridad para el MVP
  (los zapatos son la sección principal de la tienda, después ropa,
  después accesorios/ortopedia).

  Cuando se aborde (probablemente Fase N futura), requiere decisiones
  de diseño no triviales:
  - ¿`size` cambia de string numérico (`"17.0"`) a string libre que
    acepta categorías (`"CHIC"`, `"PZA"`)? ¿O se agrega un campo
    aparte tipo `sizeCategory`?
  - ¿Product gana un campo `productCategory` (zapato | ortopedia |
    accesorio | limpieza)? ¿O se infiere del header de tallas que
    usa el producto?
  - ¿Cómo se valida el campo `size` con Zod? Hoy el regex es `/^\d+\.\d$/`.
    Si se acepta texto libre, hay que pensar enums o sets de valores
    permitidos por categoría.
  - Investigar antes de codear: ¿cuántos tipos distintos de header
    categórico aparecen en los archivos del legacy? Hoy vimos 3-4
    pero el catálogo completo puede ser más grande.

  Mientras tanto, el verificador de TOT (ver sección 10) sigue
  reportando estos productos como `parser=0, archivo=N` warnings,
  lo cual sirve de recordatorio visible en cada import.

---

## 12. Principios de código acordados

- **Idempotencia** donde sea razonable (seeds, configs, scripts de admin).
- **TODOs explícitos** para trabajo pendiente, borrados cuando se completan.
- **Nada de `any` en TypeScript** salvo justificación explícita.
- **Validación con Zod** en fronteras (imports, API inputs, parsers).
- **Imports honestos**: si un archivo no usa algo, no lo importa.
- **Comentarios `///` (triple slash)** en Prisma para documentar modelos — aparecen en el cliente generado.
- **Logs autodescriptivos**: nunca imprimir valores sueltos sin contexto.
- **Nombres en camelCase**, sin typos, descriptivos.

---

## 13. Notas operativas

- `pnpm prisma generate` después de cambios al schema.
- Si VS Code marca tipos inexistentes después de cambiar schema: **reiniciar TS Server** (Ctrl+Shift+P → "TypeScript: Restart TS Server").
- `pnpm prisma studio` para inspeccionar DB visualmente (corre en localhost:5555 o similar).
- `pnpm prisma db seed` corre `prisma/seed.ts`.
- `pnpm tsx prisma/reset.ts` corre el script de reset (no hay comando Prisma built-in para esto).
- **Repo en GitHub:** https://github.com/CarlosAdrianLabra/sentinel (privado).
  Remoto configurado como `origin`, rama `main`. Flujo: `git add . && git status && git commit -m "..." && git push`.
  Convención de mensajes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` + scope opcional.
  Pasar a público cuando el proyecto esté presentable (README para reclutadores).
