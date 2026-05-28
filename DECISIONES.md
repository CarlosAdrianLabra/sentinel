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
- **Claude mantiene DECISIONES.md actualizado al cierre de cada sesión.**
  Carlos hace review y commitea.

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

Análisis de archivos reales (MARZOVENTAS.xlsx, CHARLYEXISTENCIA.xlsx, VENTACHARLY79340.xlsx, COMPRASMARZO.xlsx, rptNewVentasGlobal.xlsx, rptNewInvetarioGlobalSinVenta.xlsx, Converse.xlsx).

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

### 8.1. Reportes de existencias

**Formato block-per-product (observado en CHARLYEXISTENCIA.xlsx):**

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

**Qué reporte exporta este formato:**

- `Converse.xlsx` (Fase 8) — confirmado multi-sucursal (3 sucursales en
  filas separadas dentro de cada bloque). Reporte exacto desconocido,
  pendiente de averiguar con Jesus.
- `rptNewInvetarioGlobalSinVenta.xlsx` (verificado 2026-05-27) — single-
  sucursal a pesar del nombre "Global". Header dice `Sucursal: 1] TIENDAS
  ADRIAN GRANADOS`. "Global" en INVENSHOES significa "todas las
  marcas/productos/líneas", **no** "todas las sucursales".
- `CHARLYEXISTENCIA.xlsx` — single-sucursal, filtrado por marca CHARLY.

### 8.2. Reportes de ventas

**Existen dos formatos completamente distintos**, no la misma data en dos vistas.

**Formato A — Reporte Sumarizado de Ventas (summary).**
Observado en MARZOVENTAS.xlsx y rptNewVentasGlobal.xlsx:

- Tabular plano. Una fila por producto con totales del período.
- Columnas: `DESCRIPCION | CANTIDAD | DESCUENTO | TOTAL`.
- **Sin tallas. Sin desglose por sucursal. Sin fechas dentro del período.**
- rptNewVentasGlobal.xlsx tiene filtro `Sucursal: TODAS` pero **agrega
  todas las sucursales en una sola fila por producto** — no las separa
  en secciones tipo "SUCURSAL 1, SUCURSAL 2, ...". El desglose por
  sucursal se pierde completamente.
- Negativos existen (devoluciones).
- Filas con cantidad 0 pero descuento/total ≠ 0 existen (probablemente
  cambios sin movimiento neto).
- Footer: `Abonos`, `Dif. Cambios`, `N.C. Recibidas`.
- GRAN TOTAL al final.

**Decisión:** este formato es **descartado** como fuente para
`InventoryMovement`. Pierde toda la granularidad que el modelo necesita
(talla y sucursal). Sirve a lo sumo como sanity-check agregado.

**Formato B — Ventas por corrida completa (detail).**
Observado en VENTACHARLY79340.xlsx:

- Bloque-por-producto, **mismo formato que existencias**. Header de
  producto → header de tallas (centésimas, idénticas a existencias) →
  filas de datos por qualifier → TOT.
- Columnas adicionales: `TOTAL$`, `PRE1`, `PRE2`.
- **Tiene tallas por columna**, como existencias.
- **La columna SUC. usa "qualifiers" — no solo un número de sucursal.**
  Observado: `1` (venta directa desde sucursal 1) y `1-M-` (venta de
  sucursal 1 que pasó por el flujo de apartado/MARISOL). En el sample
  de CHARLY-79340-NIÑO-SINTETICO-BLANCO: 4 pares con qualifier `1`, 16
  pares con qualifier `1-M-`. La fila `TOT.` (=20) coincide con la
  CANTIDAD que reporta el formato summary para el mismo producto.
- El sample disponible está filtrado a `Sucursal: 1` + `Modelo: 79340`.
  No tenemos sample multi-sucursal. **Pendiente confirmar:** ¿el
  legacy permite exportar este reporte sin filtros? ¿Existen qualifiers
  para ECOMM (`1-E-`?), para traspasos entre sucursales (`1-2-`?), etc.?

**Decisión:** este formato es la **fuente correcta** para movements OUT.
El parser de existencias es ~80% reutilizable.

### 8.3. Reportes de compras

**Formato observado (COMPRASMARZO.xlsx) — Resumen de operaciones de compras:**

- Jerárquico: `Proveedor → Sucursal → Referencia (folio + fecha) → Articulos`.
- Cada artículo: `CORRIDA` (rango de tallas tipo `"DEL 22 AL 26.5"`),
  `CANTIDAD` (agregada sobre el rango), `COSTO`, `IMP. BRUTO`,
  `IMP. FACTURA`, `IMP. PAGO`.
- **Sin desglose por talla individual.** El rango (CORRIDA) es lo más
  granular disponible.
- Sí tiene fecha por folio.
- Jerarquía de totales: TOTALREFERENCIA → TOTAL SUCURSAL → TOTAL
  PROVEEDOR → TOTAL.

**Decisión (sesión 2026-05-27):** compras **descartadas del scope MVP**.
Justificación: Jesus mantiene el legacy actualizado al recibir cada
lote (etiquetado físico + captura), por lo que el siguiente snapshot
de existencias ya refleja el +N de las compras. Importar COMPRASMARZO
solo aportaría información financiera (cuánto se gastó), que no es lo
que Sentinel resuelve. Eventualmente puede reconsiderarse si se quiere
auditoría financiera, pero requiere export con talla individual (no
existe hoy).

### 8.4. Detalles técnicos del parser xlsx

**Detalles observados al parsear con `xlsx` (SheetJS):**

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
- **Fase 8** — Parser de existencias desde Excel legacy. Cerrada el
  2026-05-15. CHARLY (898/898), rptNew (15166/15166 para productos
  zapato). Verificador de TOT permanente, ImportJob persistido con
  snapshotDate, manejo de errores con markImportJobFailed.
- **Fase 9** — UI `/imports`. Página Server Component que llama a
  `getImportsPageData()` (en `lib/services/imports.ts`). Muestra:
  card de freshness arriba (semáforo con 5 niveles: AL_DIA, PENDIENTE,
  DESACTUALIZADO, FALLO, SIN_DATOS) + tabla shadcn abajo con historial
  completo. Lógica del semáforo en función pura `calculateFreshnessLevel`
  con parámetro `now` inyectado (testeable). shadcn/ui instalado con
  preset Nova + Radix; componentes en uso: Card, Table, Badge. Mapas
  declarativos `FRESHNESS_STYLES` y `STATUS_STYLES` con tipos `Record<>`
  para forzar exhaustividad en niveles conocidos. Estilo mínimo a
  propósito — polish diferido a fase futura.
- **Fase 10** — UI `/inventory`. Cerrada el 2026-05-26. Página de
  búsqueda de inventario con tres archivos: servicio
  `lib/services/inventory.ts` con `searchInventory(query)` y
  `countTotalPairs()`, Server Component `app/inventory/page.tsx`, y
  Client Component `app/inventory/search-input.tsx` con debounce de
  300ms. Decisiones de producto: Camino 3 (UI de "estado actual"
  ahora, columna "rotación" diferida a Fase 11 cuando haya
  movements); Forma A (una fila por `InventoryPosition`, granular
  al modelo); opción (i) mejorada (página vacía con buscador +
  contador total como mensaje guía). Decisiones técnicas:
  URL-as-state (no API route — el input cambia `?q=`, el Server
  Component re-renderiza con el nuevo param); búsqueda case-
  insensitive vía `.toUpperCase()` en el query del servicio
  (SQLite no soporta `mode: "insensitive"` en Prisma 7, y los
  productos del legacy están todos en mayúsculas); límite de 100
  resultados por búsqueda. Stack agregado: componente shadcn
  `Input`. Verificado en navegador con los 6 casos (vacío, match,
  borrar, mayúsculas/minúsculas, sin resultados, refrescar con
  `?q=` en URL).

---

## 10. Fase actual

**Fase 11 — Importer de ventas detail multi-sucursal.**

**Scope confirmado (sesión 2026-05-27):**

- Solo ventas. Compras descartadas del scope MVP (ver sección 8.3).
- Solo Formato B (`Ventas por corrida completa` con tallas y qualifiers).
  Formato A (summary) descartado.
- `OUT` desde MARISOL para qualifier `1-M-` (apartado). Ver sección 12
  para el principio guía detrás de esta decisión.

**Trabajo de Fase 11 ya completado:**

- **Refactor `process.exit(1) → throw`** del parser de existencias
  (`scripts/import-existencias.ts`). Cerrado el 2026-05-27. Las tres
  funciones internas (`getFilePathFromArgs`, `selectDataSheet`,
  `extractSnapshotDate`) ahora lanzan `throw new Error(...)`. El catch
  interno de `main()` re-lanza con `throw error;` después de ejecutar
  su limpieza (logs + `markImportJobFailed` si corresponde). El
  `.catch()` externo en `main().catch(...)` conserva el `process.exit(1)`
  porque es la capa CLI y necesita propagar exit codes correctos al
  shell. Verificado: archivo válido → exit 0, archivo inexistente →
  exit 1, ImportJob no se crea como huérfano cuando el error ocurre
  antes de `createImportJob`. Habilita exponer el parser desde Server
  Actions sin matar el proceso de Next en errores.

**Bloqueante operativo:** confirmar con Jesus dos exports del legacy.
Carlos pregunta el 2026-05-28. Sin estas confirmaciones, no podemos
escribir el parser de ventas porque no sabemos el formato real
multi-sucursal. Ver sección 11.

**Pendientes técnicos (a resolver una vez confirmados los exports):**

- **Idempotencia del re-import.** Movements append-only +
  re-importación del mismo archivo = duplicados. Mecanismo de defensa
  por definir (¿hash de archivo? ¿folio único por período? ¿chequeo
  contra ImportJob previo del mismo snapshotDate?).
- **Fecha del movement.** Los archivos agregan ventas sobre un período.
  ¿Qué `createdAt` o equivalente le ponemos a cada movement? Opciones:
  Fecha Final del rango, Fecha de Impresión, snapshotDate del
  ImportJob, sumar todos al último día del período. Elegir una y
  documentar.
- **Catálogo de qualifiers.** Solo confirmamos `1` y `1-M-` en
  Sucursal 1. ¿Aparecen `1-E-` (ECOMM), `1-2-` o `2-1-` (traspasos
  entre sucursales), `1-CAN-` (cancelaciones)? Solo se sabrá al ver
  un export multi-sucursal real.

---

## 11. Decisiones pendientes / preguntas abiertas

- Estrategia de conflicto entre legacy y Sentinel: ¿legacy gana, Sentinel gana, o se marca conflicto? Decidir antes del primer import real.
- Si Prisma 7 tendrá un comportamiento distinto en algún aspecto: verificar contra la documentación siempre que parezca contradictorio con Prisma 6.

- **~~Manejo de errores en el parser de imports.~~** ✅ Resuelto el
  2026-05-27 (ver sección 10). El parser ahora propaga errores con
  `throw` en las funciones internas y reserva `process.exit(1)` para
  la capa CLI externa.

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

- **Validador "archivo no regresivo" en parser de imports.** Al
  importar un .xlsx, comparar su `snapshotDate` con el del último
  ImportJob COMPLETED. Si el archivo nuevo es más viejo, rechazar
  con error claro. Defiende contra subir por error un archivo
  obsoleto de una carpeta de backups o un export antiguo. Pendiente
  hasta tener UI de import (Fase 9+).

- **Preguntas para Jesus (2026-05-28).** Bloquean Fase 11:
  1. **Reporte de existencias multi-sucursal.** Converse.xlsx (Fase 8)
     era multi-sucursal real (3 sucursales en filas separadas dentro
     de cada bloque). ¿Qué opción de menú o reporte exacto genera ese
     formato? Confirmado el 2026-05-27: `rptNewInvetarioGlobalSinVenta`
     **NO** es ese reporte (single-sucursal a pesar del nombre).
  2. **Reporte de ventas multi-sucursal.** El formato
     `Ventas por corrida completa` (sample: VENTACHARLY79340.xlsx)
     tiene la granularidad correcta (tallas + qualifiers tipo `1-M-`).
     ¿Existe versión sin filtros de modelo y de sucursal? ¿Se puede
     pedir por rango de fechas arbitrario (semanal idealmente)?
  3. **Cadencia de export.** ¿Qué tan fácil/frecuente es generar estos
     dos reportes? Diario ideal, semanal aceptable, mensual mínimo.

- **Convención operativa: siempre archivo global multi-sucursal.**
  Para evitar sucursales desfasadas en Sentinel, el operador debe
  exportar siempre el reporte multi-sucursal del legacy, no archivos
  filtrados por sucursal individual. Confirmación pendiente con
  Jesus (ver punto anterior).

- **Validador "archivo es multi-sucursal" en parser de imports.**
  Cuando se confirme el formato multi-branch real (deuda anterior),
  el parser debe rechazar archivos single-branch para mantener la
  convención. Depende de la deuda anterior.

- **Polish de UI diferido hasta MVP completo.** La página /imports
  (Fase 9) usa estilos mínimos a propósito. Decisión consciente:
  primero tener todas las páginas del MVP funcionando, después
  iterar UX/UI con visión completa del sistema. Evita rediseñar
  varias veces.

- **Columna "rotación" en `/inventory` diferida a Fase 11+.** Fase 10
  cerró con Camino 3: la UI muestra estado actual sin rotación. La
  columna queda reservada para cuando haya `InventoryMovement` con
  ventas reales (depende del importer de ventas de Fase 11). Honestidad
  explícita al usuario: hoy no hay datos suficientes para "qué se
  mueve poco". Decisión de UI cuando exista: ¿mostrar columna
  desde ya con "—" hasta tener datos, o agregarla cuando aparezca?
  Pendiente.

- **Búsqueda en `/inventory` solo por `fullDescription`.** Hoy
  `searchInventory(query)` matchea solo contra `fullDescription`
  con `contains`. No usa los campos descompuestos (`brand`,
  `modelNumber`, `gender`, `material`, `color`) ni `code` de Branch.
  Suficiente para el MVP porque `fullDescription` contiene toda
  la info concatenada — buscar "CHARLY" matchea por marca, "79340"
  por modelo, "BLANCO" por color. Si en el futuro se quiere búsqueda
  más estructurada (filtros separados por marca/género), refactorizar.

- **Sin paginación en `/inventory`.** Límite duro de 100 resultados
  por búsqueda. Si tu tío busca algo muy genérico ("NIÑO") y hay
  más de 100 matches, ve solo los primeros 100 sin advertencia.
  Aceptable para MVP — el usuario refina la búsqueda. Cuando
  agreguemos paginación o se quiera advertir "hay más resultados,
  refiná", iterar.

---

## 12. Principios de código y diseño acordados

**De código:**

- **Idempotencia** donde sea razonable (seeds, configs, scripts de admin).
- **TODOs explícitos** para trabajo pendiente, borrados cuando se completan.
- **Nada de `any` en TypeScript** salvo justificación explícita.
- **Validación con Zod** en fronteras (imports, API inputs, parsers).
- **Imports honestos**: si un archivo no usa algo, no lo importa.
- **Comentarios `///` (triple slash)** en Prisma para documentar modelos — aparecen en el cliente generado.
- **Logs autodescriptivos**: nunca imprimir valores sueltos sin contexto.
- **Nombres en camelCase**, sin typos, descriptivos.

**De manejo de errores:**

- **Funciones internas (library) lanzan `throw new Error(...)`.** Nunca
  llaman a `process.exit`. Esto permite que el mismo código viva en
  CLI y en Server Action sin matar el proceso de Next.
- **Capa CLI externa** (típicamente `main().catch(...)`) es la única
  que conoce de exit codes y llama a `process.exit(1)`. Es el contrato
  con el shell/cron/wrapper.
- **Catch intermedio** que necesita hacer limpieza (e.g. marcar un
  ImportJob como FAILED) hace su trabajo y re-lanza con `throw error;`
  para que la capa externa decida cómo terminar. Un catch que no
  re-lanza oculta el error al mundo exterior.

**Arquitectónicos:**

- **Snapshots son la verdad operacional.** El modelo de
  `InventoryMovement` respeta los snapshots de existencias. Cuando un
  movimiento puede registrarse contra distintas Branches (e.g. apartado
  vía MARISOL), se elige la que mantiene los snapshots consistentes,
  no necesariamente la que refleja la verdad física. Razón:
  reconciliación `snapshot(t) + movements = snapshot(t+1)` debe
  cuadrar; si no cuadra, todo Sentinel pierde credibilidad. La verdad
  física se puede recuperar por otros caminos (diffs de snapshots
  entre branches físicas y MARISOL).

---

## 13. Notas operativas

- `pnpm prisma generate` después de cambios al schema.
- Si VS Code marca tipos inexistentes después de cambiar schema: **reiniciar TS Server** (Ctrl+Shift+P → "TypeScript: Restart TS Server").
- `pnpm prisma studio` para inspeccionar DB visualmente (corre en localhost:5555 o similar).
- `pnpm prisma db seed` corre `prisma/seed.ts`.
- `pnpm tsx prisma/reset.ts` corre el script de reset (no hay comando Prisma built-in para esto).
- **Exit codes en Windows CMD:** `echo %ERRORLEVEL%` (no `echo $?`,
  que es sintaxis de bash). En PowerShell: `echo $LASTEXITCODE`.
  Útil para verificar que scripts CLI propagan errores correctamente.
- **Repo en GitHub:** https://github.com/CarlosAdrianLabra/sentinel (privado).
  Remoto configurado como `origin`, rama `main`. Flujo: `git add . && git status && git commit -m "..." && git push`.
  Convención de mensajes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` + scope opcional.
  Pasar a público cuando el proyecto esté presentable (README para reclutadores).
