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
- Crea `InventoryPosition` con `quantity` incluso cuando es 0
  (decisión: mantener posiciones esparsas para simplificar updates futuros).
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

Refactor: el script está dividido en funciones puras
(`getFilePathFromArgs`, `readWorkbook`, `selectDataSheet`,
`extractSnapshotDate`, `parseProducts`) orquestadas por `main()`.

Verificación: probado con Converse.xlsx (multi-branch, multi-rango),
CHARLYEXISTENCIA.xlsx (single-branch, 2,246 productos),
rptNewInvetarioGlobalSinVenta.xlsx (single-branch, 25,052 productos,
113K filas). En Converse: suma de quantity en tuplas = 514, igual al
total reportado por el legacy.

**Dónde retomar:** validación con Zod del array de tuplas, después
persistencia con Prisma (transacción única, ImportJob + InventoryPosition

- InventoryMovement).

## 11. Decisiones pendientes / preguntas abiertas

- Estrategia de conflicto entre legacy y Sentinel: ¿legacy gana, Sentinel gana, o se marca conflicto? Decidir antes del primer import real.
- Si Prisma 7 tendrá un comportamiento distinto en algún aspecto: verificar contra la documentación siempre que parezca contradictorio con Prisma 6.

- **Manejo de errores en el parser de imports.** Las funciones del script (`getFilePathFromArgs`, `selectDataSheet`, etc.) terminan el proceso con `process.exit(1)` cuando algo falla. Esto está bien para un script CLI standalone, pero **rompería un servidor** si lo invocáramos desde un Server Action o Route Handler de Next: mataría el proceso entero, tirando todos los usuarios conectados. Cuando integremos el parser a una UI, refactorizar a `throw new Error(...)` y manejar los errores en la capa de orquestación (la API/Action), no en las funciones internas.

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
