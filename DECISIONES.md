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
- shadcn/ui (preset Nova + Radix)

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
├── app/ # Next.js App Router
├── generated/prisma/ # Cliente Prisma autogenerado (NO EDITAR)
├── lib/
│ ├── constants/
│ │ └── branches.ts # BRANCHES (array de sucursales)
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

## 6. Schema del dominio

### `Branch` — sucursales

- `id` (Int) — identidad técnica interna.
- `code` (String, @unique) — identidad operativa estable ("ABRYL", "TEZONCO", "ECOMM", "MIRASOL").
- `name` (String) — nombre operativo corto para UI ("Abryl", "Tezonco", "e-commerce", "Mirasol"). Distinto de `legacyStoreName`.
- `legacyStoreId` (String, @unique) — puente con INVENSHOES ("1", "2", "4", "5").
- `legacyStoreName` (String?, opcional) — nombre como aparece en el legacy (ej. "ADRIAN GRANADOS DEL LLANO").
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
- `movementType` como String validado por Zod: `IN | OUT | ADJUSTMENT | IMPORT_SET`. Los traspasos entre sucursales se modelan como dos movimientos con el mismo `referenceId`: un `OUT` en la sucursal origen + un `IN` en la sucursal destino.
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

**Catálogo completo verificado con Jesus el 2026-05-28** (captura del dropdown de selección de sucursal del legacy):

| ID legacy | Nombre en INVENSHOES                         | Code operativo | Nombre operativo | Estado en Sentinel                              |
| --------- | -------------------------------------------- | -------------- | ---------------- | ----------------------------------------------- |
| `"1"`     | ADRIAN GRANADOS DEL LLANO                    | `ABRYL`        | Abryl            | activa, física                                  |
| `"2"`     | CARLOS DEL LLANO ROBLES                      | `TEZONCO`      | Tezonco          | activa, física                                  |
| `"3"`     | LUIS REY                                     | —              | —                | muerta, NO se siembra                           |
| `"4"`     | MIRASOL                                      | `MIRASOL`      | Mirasol          | virtual (apartados)                             |
| `"5"`     | SPORT TENIS                                  | `ECOMM`        | e-commerce       | virtual (canal externo)                         |
| `"9"`     | TIENDAS DE ROPA Y CALZADO ABRIL S.A. DE C.V. | —              | —                | TBD según archivo de existencias multi-sucursal |

Las sucursales activas viven en `lib/constants/branches.ts` como constante y se siembran con `prisma/seed.ts`.

**ATENCIÓN — corrección crítica de nombres (2026-05-28):** versiones anteriores de DECISIONES escribían **MARISOL** (con A). El nombre real en el legacy es **MIRASOL** (con I) — verificado en la captura del 2026-05-28. El `code` de Branch debe ser `MIRASOL`. Pendiente verificar la ortografía exacta cuando llegue el archivo de existencias multi-sucursal (header de sucursal 4).

**Historia operativa (contada por Jesus el 2026-05-28):** antes de la pandemia había sucursales físicas Abryl, Tezonco, Luis Rey, Mirasol, más Sport Tenis y Supercalza. Las dos más pequeñas (Mirasol y Supercalza) cerraron por números rojos durante la pandemia. El programador del legacy cobraba por borrar registros, así que los "cascarones" de sucursal quedaron en el sistema. Algunos se reutilizaron como sucursales virtuales:

- **MIRASOL (4)** → apartados. Cuando un cliente aparta un par, el legacy hace traspaso `ABRYL → MIRASOL` o `TEZONCO → MIRASOL`. El zapato físicamente sigue en la sucursal de origen, pero el reporte de existencias lo cuenta en MIRASOL.
- **SPORT TENIS (5)** → e-commerce. Distribuidor externo que acepta vales de despensa y entrega al cliente final. Las ventas de e-commerce se registran como movimientos hacia esta sucursal.

**Sucursales muertas pero presentes en el catálogo:**

- **Luis Rey (3):** confirmado por Jesus, "no aparece en reportes". No se siembra en Sentinel. Si apareciera por sorpresa en algún archivo, el parser abortaría con `throw` y nos enteraríamos. Defensa por error explícito.
- **Abril S.A. (9):** Jesus dijo inicialmente "no se ocupa", **pero Carlos descubrió el 2026-05-28 que sí tiene stock real** — específicamente ropa que nunca se movió de registro. La 9 quedó como cascarón legal de una razón social vieja del grupo (de donde viene el nombre operativo "ABRYL", derivado de "ABRIL" — coincidencia verificada y aclarada). Decisión sobre cómo manejarla en Sentinel: **diferida hasta abrir el archivo de existencias multi-sucursal real** y ver si trae filas con sucursal 9 y qué productos. Si solo trae ropa (no zapato), probablemente la sembramos `isActive: false` por defensa pero la ignoramos en flows operativos.

**Lección operativa registrada el 2026-05-28:** "no se ocupa" según el operador NO es lo mismo que "no aparece en los datos". Nadie tiene el mapa completo del legacy en la cabeza. Verificar siempre contra los archivos reales antes de cablear suposiciones.

---

## 8. Formato del legacy INVENSHOES

Análisis de archivos reales (MARZOVENTAS.xlsx, CHARLYEXISTENCIA.xlsx, VENTACHARLY79340.xlsx, COMPRASMARZO.xlsx, rptNewVentasGlobal.xlsx, rptNewInvetarioGlobalSinVenta.xlsx, Converse.xlsx, rptNewVentasCorrdiaCompleta.xlsx [Abryl y Tezonco samples], rptNewVentasDetalle.xlsx [ECOMM sample], rptNewVentasDetallegeneral.xlsx).

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
- Dos hojas: "Mapa del documento" (TOC auto-generado, se ignora) y la hoja de datos real (nombre tipo `rptNewInventarioGlobal...`).
- Header del archivo (~14 filas): metadatos como `Sucursal:`, filtros aplicados (Marca, Proveedor, etc.), fecha de impresión, cantidad total, importe total.
- Después del header, bloques repetitivos de ~4 filas por producto:
  1. Fila con `fullDescription` del producto (en columna 1).
  2. Header de tallas: `SUC. CANT. COSTO IMPORTE` + columnas de tallas.
  3. Fila(s) de datos: sucursal, cantidad, costo, importe, cantidades por talla.
  4. Fila `TOT.` con totales.
- Las columnas de tallas **varían por producto** (niños 11.0-21.0, adultos 25.0-31.0). El parser debe leer la fila header de cada producto para mapear columna → talla.
- Timestamp "Impresión: DD/MM/YYYY HH:MM" en el header indica el momento del snapshot. El parser debe capturarlo en el `ImportJob`, no usar `new Date()` al importar.

**Qué reporte exporta este formato (estado al 2026-05-28):**

- `Converse.xlsx` (Fase 8) — confirmado multi-sucursal (3 sucursales en filas separadas dentro de cada bloque). **Reporte exacto sigue sin identificarse** — pendiente con Jesus.
- `rptNewInvetarioGlobalSinVenta.xlsx` (verificado 2026-05-27) — single-sucursal a pesar del nombre "Global". Header dice `Sucursal: 1] TIENDAS ADRIAN GRANADOS`. "Global" en INVENSHOES significa "todas las marcas/productos/líneas", **no** "todas las sucursales".
- `CHARLYEXISTENCIA.xlsx` — single-sucursal, filtrado por marca CHARLY.
- **Reporte de existencias por criterio (GLOBAL)** del menú del legacy — identificado en captura del 2026-05-28, permite filtrar por sucursal `--TODAS--`. Jesus arrancó la generación pero estaba tardando >3 horas al cierre de sesión. **Pendiente verificar formato cuando termine.** Si truena o tarda demasiado, plan B es exportar single-sucursal × 4 archivos (1, 2, 4, 5) y que Sentinel los combine en un solo ImportJob.

### 8.2. Reportes de ventas

**Existen MÚLTIPLES formatos en INVENSHOES**, no la misma data en distintas vistas. Análisis completo del 2026-05-28:

**Formato A — Reporte Sumarizado de Ventas (summary).**
Observado en MARZOVENTAS.xlsx y rptNewVentasGlobal.xlsx:

- Tabular plano. Una fila por producto con totales del período.
- Columnas: `DESCRIPCION | CANTIDAD | DESCUENTO | TOTAL`.
- **Sin tallas. Sin desglose por sucursal. Sin fechas dentro del período.**
- rptNewVentasGlobal.xlsx tiene filtro `Sucursal: TODAS` pero agrega todas las sucursales en una sola fila por producto.

**Decisión:** **descartado** como fuente para Sentinel.

**Formato B — Ventas por corrida completa (detail con tallas).**
Observado en VENTACHARLY79340.xlsx, rptNewVentasCorrdiaCompleta.xlsx (Abryl), rptNewVentasCorrdiaCompletatezonco.xlsx:

- Bloque-por-producto, mismo formato que existencias. Header de producto → header de tallas (centésimas) → filas de datos por qualifier → TOT.
- Columnas: `TOTAL`, `TOTAL$`, `PRE1`, `PRE2` + tallas.
- Single-sucursal por archivo. **Multi-sucursal NO se puede generar** — el legacy lo cancela con error "Cancelado por el usuario" aunque nadie cancele (probablemente timeout interno o falta de memoria en el servidor viejo).

**Decisión:** **descartado** como fuente primaria porque no se puede sacar multi-sucursal. Queda como referencia histórica.

**Formato C — Detalle de Ventas (FORMATO OFICIAL ELEGIDO).**
Observado en rptNewVentasDetalle.xlsx (ECOMM single-sucursal) y **rptNewVentasDetallegeneral.xlsx** (multi-sucursal, header `Sucursal: TODAS`):

- Bloque-por-producto, mismo formato que existencias y que Formato B.
- **Columnas más ricas que Formato B:** `CANT.`, `COSTO/U`, `PRECIO/U`, `CAMB.` (cambios), `DEV.` + `IMP. DEV.` (devoluciones), `DESC <=10`, `DESC>10`, `DESC. TOT.`, `TOTAL`, `UTILIDAD`, `UTILIDAD %`, `ROTACION`, más las columnas de talla.
- **Devoluciones vienen en columnas separadas**, no como cantidades negativas. Un cambio (cliente devuelve un par y compra otro) aparece como fila con `CANT.=0` + columna `DEV.` con valor 1 en el `TOT.`.
- **Se saca rápido (2-5 minutos)** según Jesus, incluso multi-sucursal. Cadencia diaria confirmada como factible.
- **Multi-sucursal funciona:** un mismo bloque puede tener filas con qualifiers de distintas sucursales antes del `TOT.`.

**Decisión (2026-05-28):** **`Detalle de Ventas` con `Sucursal: TODAS` es el reporte oficial de ventas para Sentinel.** Es el que vamos a parsear en Fase 11.

### 8.3. Qualifiers en la columna SUC. de los reportes de ventas

Catálogo completo verificado en rptNewVentasDetallegeneral.xlsx (2026-05-28, sample multi-sucursal de 113 filas):

| Qualifier    | Branch destino | Comentario                                                 |
| ------------ | -------------- | ---------------------------------------------------------- |
| `1`          | ABRYL (1)      | poco frecuente (5 de 113 filas)                            |
| `1-M-`       | ABRYL (1)      | el caso común (57 de 113)                                  |
| `2`          | TEZONCO (2)    | poco frecuente (1 de 113)                                  |
| `2-M-`       | TEZONCO (2)    | el caso común (26 de 113)                                  |
| `5`          | ECOMM (5)      | único qualifier para ECOMM (24 de 113), sin variante `-M-` |
| `4` o `4-M-` | **No existe**  | MIRASOL nunca aparece en ventas                            |

**Interpretación del sufijo `-M-`:** Jesus dice que es para distinguir "turno mañana vs tarde" o quizás "tarjeta vs efectivo" (su explicación fue tentativa). Los datos no cuadran con la interpretación literal de turno — un día normal a las 2 PM tiene 17 ventas `1-M-` vs 1 sola `1`. **Para Sentinel esto no importa**: ambos qualifiers van al mismo branch físico operativo. El parser **descarta el sufijo** al normalizar.

**Regla del parser de ventas:**

```
qualifier "X" o "X-M-"  →  branch X (legacyStoreId)
qualifier "4" o "4-M-"  →  ERROR (no debería existir en este reporte)
cualquier otro          →  throw (catálogo desconocido)
```

**Flujo de apartados (explicado por Jesus el 2026-05-28):**

1. Cliente **aparta** un par en ABRYL → legacy hace traspaso `ABRYL → MIRASOL`. Stock virtual se mueve, zapato físicamente sigue en ABRYL.
2. Cliente **termina de pagar** → legacy hace **traspaso reverso `MIRASOL → ABRYL`** + **registra la venta como cualquier venta normal de ABRYL** (qualifier `1` o `1-M-`).

Implicaciones:

- **Cierre de apartado y venta directa son INDISTINGUIBLES en el archivo de ventas.** Ambos se ven igual: venta normal de la sucursal física. Sentinel no puede separarlos. Por suerte no lo necesita.
- **MIRASOL solo se mueve por traspasos**, que NO aparecen en el archivo de ventas. Solo se ven en diff entre snapshots de existencias.
- Si en el futuro se quiere auditoría fina ("qué apartados se cerraron y cuándo"), habría que pedir export de traspasos al legacy si existe. **Fuera del MVP.**

**Decisión revertida (2026-05-28):** la regla anterior "OUT desde MARISOL para qualifier `1-M-`" queda **anulada**. Era hipótesis basada en interpretar mal el qualifier — pensábamos que `1-M-` marcaba ventas vía apartado/MARISOL, pero en realidad ambos `1` y `1-M-` son ventas regulares de la sucursal 1. La explicación correcta del flujo está arriba.

### 8.4. Reportes de compras

**Formato observado (COMPRASMARZO.xlsx):**

- Jerárquico: `Proveedor → Sucursal → Referencia (folio + fecha) → Articulos`.
- Cada artículo: `CORRIDA` (rango de tallas tipo `"DEL 22 AL 26.5"`), `CANTIDAD` (agregada sobre el rango), costos varios.
- **Sin desglose por talla individual.** El rango (CORRIDA) es lo más granular disponible.

**Decisión (2026-05-27, confirmada 2026-05-28):** compras **descartadas del scope MVP**. Justificación: Jesus mantiene el legacy actualizado al recibir cada lote (etiquetado físico + captura), por lo que el siguiente snapshot de existencias ya refleja el +N de las compras. Importar COMPRASMARZO solo aportaría información financiera (cuánto se gastó), que no es lo que Sentinel resuelve.

### 8.5. Cardex (pendiente de investigar)

Jesus mencionó el 2026-05-28 que existe un reporte tipo "cardex" en el legacy. Cardex en contabilidad tradicional es el libro mayor de movimientos por producto (transaccional, con fechas y tipos de movimiento explícitos). **Si el cardex del legacy es transaccional**, podría ser incluso mejor fuente que `Detalle de Ventas` para algunos casos.

**Pendiente:** pedirle a Jesus un sample de cardex de un solo producto para inspeccionar el formato. No urgente — el plan actual con Detalle de Ventas funciona — pero vale la pena conocer.

### 8.6. Detalles técnicos del parser xlsx

**Detalles observados al parsear con `xlsx` (SheetJS):**

- Al convertir la hoja con `sheet_to_json(sheet, { header: 1 })`:
  - En existencias: columna 0 vacía, datos arrancan en columna 1.
  - **En reportes de ventas (Formato C) la convención cambia:** datos arrancan en columna 0 (qualifier de sucursal está en col 0, no col 1). El parser debe detectar esto al inicio del archivo o tener dos modos.
  - Las tallas en la fila header vienen como **strings con padding de espacios** (ej. `"1700      "`), no como números. El parser debe hacer `.trim()` antes de convertir a número.
  - Celdas vacías aparecen en tres formas: `undefined`, `""`, `null`. Los tres casos deben normalizarse con un helper `isEmpty(cell)`.
  - **Ceros vs vacíos en filas de datos.** El legacy distingue:
    - Filas de **SUC.** (datos por sucursal): celda **vacía** cuando no hay stock/venta para esa talla. Nunca emite 0 explícito.
    - Filas de **TOT.** (totales de bloque): emite **0 explícito** cuando el total es cero.
- Un bloque de producto puede tener múltiples filas de datos (una por sucursal o por qualifier) antes del `TOT.` de cierre. El parser itera todas las filas entre header y TOT.
- La fila `TOT.` es redundante para extracción de movements (los totales ya los calculamos desde las filas de datos). Se usa solo como marca de "fin de bloque" y validador.

---

## 9. Fases completadas

- **Fase 1** — Entorno local (Node, pnpm, git, VS Code).
- **Fase 2** — Proyecto Next.js 16 creado y corriendo en localhost:3000.
- **Fase 3** — Prisma instalado, adapter configurado, primera migración (HealthCheck) validada.
- **Fase 4** — Schema del dominio aplicado (6 entidades). SQL leído y entendido.
- **Fase 5** — Seed de sucursales funcional e idempotente. Reto extra: script reset.ts escrito por Carlos.
- **Fase 6** — Servicio `lib/services/branches.ts` + endpoint `GET /api/branches`. Separación servicio/handler validada.
- **Fase 7** — Primera UI: `app/branches/page.tsx` como Server Component. Decisión arquitectónica: Server Components consumen servicios internos; la API route queda para consumidores externos.
- **Fase 8** — Parser de existencias desde Excel legacy. Cerrada el 2026-05-15.
- **Fase 9** — UI `/imports` con card de freshness + tabla de historial. shadcn/ui instalado.
- **Fase 10** — UI `/inventory` con búsqueda. URL-as-state + debounce + límite de 100 resultados.

---

## 10. Fase actual

**Fase 11 — Importer de ventas multi-sucursal usando `Detalle de Ventas`.**

**Scope confirmado (sesiones 2026-05-27 y 2026-05-28):**

- Solo ventas. Compras descartadas (ver 8.4).
- Formato oficial: **`rptNewVentasDetallegeneral` (Detalle de Ventas multi-sucursal)**. Formatos A (summary) y B (Corrida completa) descartados.
- Parser colapsa el sufijo `-M-` al normalizar; qualifier → branch directo según tabla en 8.3.
- MIRASOL NO recibe movements desde el parser de ventas (los apartados cerrados se ven como ventas regulares de la sucursal física).
- Idempotencia: **opción 3** — rechazo si ya existe ImportJob COMPLETED con mismo `source + sucursal + fecha_inicio + fecha_fin`, con override consciente (mecanismo concreto: TBD al codear, opciones flag `--force` en CLI, botón en UI, borrar ImportJob a mano, o combinación).

**Trabajo de Fase 11 ya completado (2026-05-27):**

- **Refactor `process.exit(1) → throw`** del parser de existencias. Funciones internas (`getFilePathFromArgs`, `selectDataSheet`, `extractSnapshotDate`) ahora lanzan `throw new Error(...)`. Catch interno de `main()` re-lanza con `throw error;` después de su limpieza. El `.catch()` externo conserva `process.exit(1)` como capa CLI. Verificado con archivo válido → exit 0, archivo inexistente → exit 1. Habilita exponer el parser desde Server Actions sin matar Next.

**Bloqueante operativo al cierre de sesión 2026-05-28:**

- Archivo de **existencias multi-sucursal**. Jesus arrancó la generación el 2026-05-28 ~10:30am, al cierre de sesión (~3pm) seguía procesando. Sin este archivo no podemos:
  - Verificar el formato real (¿cómo se ven los bloques con varias sucursales? ¿qué ortografía exacta usa para MIRASOL?).
  - Confirmar si la sucursal 9 aparece y con qué productos.
  - Sembrar el catálogo final de branches.
- Si el archivo nunca termina o trona, plan B: exportar 4 archivos single-sucursal (1, 2, 4, 5) y que Sentinel los combine en un solo ImportJob.

**Pendientes técnicos para arrancar a codear:**

- **Fecha del evento del movement.** Distinto de `createdAt` (que es cuándo se guardó en la DB). La fecha del evento es cuándo ocurrió la venta en el mundo real. Como el archivo agrega ventas sobre un rango, voto provisional: **fecha del evento = Fecha Final del rango**, con convención operativa de pedirle a Jesus cadencia diaria (ya confirmó factible para Detalle de Ventas: 2-5 min generar).
- **Mecanismo de override de idempotencia.** ¿Flag `--force` en CLI? ¿Botón en UI? ¿Borrar el ImportJob anterior a mano? ¿Combinación?
- **Refactor del parser de existencias** para aceptar formato multi-sucursal real (bloques con varias filas SUC. por bloque). Tiene que esperar a ver el archivo.

---

## 11. Decisiones pendientes / preguntas abiertas

- Estrategia de conflicto entre legacy y Sentinel: ¿legacy gana, Sentinel gana, o se marca conflicto? Decidir antes del primer import real.
- Si Prisma 7 tendrá un comportamiento distinto en algún aspecto: verificar contra la documentación siempre que parezca contradictorio con Prisma 6.

- **~~Manejo de errores en el parser de imports.~~** ✅ Resuelto el 2026-05-27 (ver sección 10).

- **Productos no-zapato con tallas categóricas (descubierto 2026-05-15).** El legacy contiene ~209 productos no-zapato — cremas, esponjas, cabestrillos, andaderas, sillas de ruedas, plantillas, férulas, collarines — con headers de talla categóricos (PZA, XCHI|CHIC|MEDI|GRAN|EXTR, etc.). El parser actual los detecta pero ignora sus celdas.

  Decisión: **diferido**. El operador los quiere "preferiblemente" pero no son prioridad MVP. Cuando se aborde, requiere decisiones de diseño no triviales en `size` (string numérico vs categórico) y `Product` (¿agregar `productCategory`?).

  **Nuevo dato (2026-05-28):** la sucursal 9 (Abril S.A.) tiene stock real de **ropa**. Si el archivo de existencias multi-sucursal la trae, habrá que decidir cómo manejarla — posiblemente la misma política que productos no-zapato (skip + warning), o ignorar la sucursal 9 entera si solo trae no-zapato.

- **Devoluciones explícitas en `Detalle de Ventas` (nuevo, 2026-05-28).** El formato C trae devoluciones en columnas separadas (`DEV.`, `IMP. DEV.`) y cambios como filas con `CANT.=0` + DEV en TOT. Sentinel MVP procesa solo `cantidad > 0` como `OUT`. Las devoluciones quedan como deuda: eventualmente modelarlas como movements `IN` que compensen ventas anteriores. Diferido hasta tener el OUT funcionando primero.

- **Validador "archivo no regresivo" en parser de imports.** Al importar un .xlsx, comparar su `snapshotDate` con el del último ImportJob COMPLETED. Si el archivo nuevo es más viejo, rechazar con error claro.

- **Preguntas pendientes para Jesus (próxima sesión):**
  1. ¿La generación del reporte de existencias multi-sucursal terminó? ¿Cuánto tardó al final? Si truena recurrentemente, plan B.
  2. **Cardex** — pedirle un sample de cardex de un solo producto para ver formato. ¿Es transaccional?
  3. ¿Qué significa realmente el sufijo `-M-` en los qualifiers de ventas? Curiosidad menor, no bloqueante — los datos no cuadraron con "turno mañana vs tarde". Operador de caja sabría.

- **Polish de UI diferido hasta MVP completo.** Las páginas `/imports` (Fase 9) y `/inventory` (Fase 10) usan estilos mínimos a propósito. Decisión consciente.

- **Columna "rotación" en `/inventory` (diferida desde Fase 10).** La UI muestra estado actual sin rotación. **Bonus descubierto el 2026-05-28:** el formato `Detalle de Ventas` trae una columna `ROTACION` propia del legacy — investigar qué significa antes de cablearla a Sentinel.

- **Búsqueda en `/inventory` solo por `fullDescription`.** Suficiente para MVP.

- **Sin paginación en `/inventory`.** Límite duro de 100 resultados. Aceptable para MVP.

- **Columnas huérfanas en existencias multi-sucursal (deuda C, 2026-06-01).**
  16 pares en 8 productos zapato se pierden porque una fila de datos trae
  stock en una columna que el header SUC. no etiquetó (dos sucursales con
  rangos de talla distintos comparten un header que no cubre la unión).
  Ej. DECHRIS-210: header llega a col 16 (talla 26.0), pero la fila de suc 1
  tiene 1 par en col 17 sin etiqueta de talla. Resolverlo exige inferir la
  talla de una columna sin header (arriesgado: podría meter datos mal en las
  18,500 buenas). Decisión: NO se arregla. 16 pares (0.08%) de ruido legacy
  no justifican lógica de inferencia. Registrado como conocido.

---

## 12. Principios de código y diseño acordados

**De código:**

- **Idempotencia** donde sea razonable (seeds, configs, scripts de admin).
- **TODOs explícitos** para trabajo pendiente, borrados cuando se completan.
- **Nada de `any` en TypeScript** salvo justificación explícita.
- **Validación con Zod** en fronteras (imports, API inputs, parsers).
- **Imports honestos**: si un archivo no usa algo, no lo importa.
- **Comentarios `///` (triple slash)** en Prisma para documentar modelos.
- **Logs autodescriptivos**: nunca imprimir valores sueltos sin contexto.
- **Nombres en camelCase**, sin typos, descriptivos.
- **Upsert nunca se keyea por la columna que se va a mutar.** El `where`
  de un upsert debe apuntar a una llave estable (en Branch:
  `legacyStoreId`, el ID de INVENSHOES que nunca cambia), no a un campo
  que el propio upsert modifica (como `code`). Si se keyea por la columna
  mutada, el `where` no encuentra la fila vieja, cae al `create`, y choca
  contra otra constraint `@unique` (o crea un duplicado huérfano).
  Descubierto al corregir MARISOL→MIRASOL en el seed (2026-06-01): keyear
  por `code` habría dejado MARISOL viva + MIRASOL nueva = 7 filas en vez
  de 6. Aplica a cualquier upsert futuro (ej. ImportJob: keyear por algo
  inmutable, no por un status que va a cambiar).

**De manejo de errores:**

- **Funciones internas (library) lanzan `throw new Error(...)`.** Nunca llaman a `process.exit`. Esto permite que el mismo código viva en CLI y en Server Action sin matar el proceso de Next.
- **Capa CLI externa** (típicamente `main().catch(...)`) es la única que conoce de exit codes y llama a `process.exit(1)`. Es el contrato con el shell/cron/wrapper.
- **Catch intermedio** que necesita hacer limpieza (e.g. marcar un ImportJob como FAILED) hace su trabajo y re-lanza con `throw error;` para que la capa externa decida cómo terminar.

**Arquitectónicos:**

- **Snapshots son la verdad operacional.** El modelo de `InventoryMovement` respeta los snapshots de existencias. Cuando un movimiento puede registrarse contra distintas Branches, se elige la que mantiene los snapshots consistentes.
- **`createdAt` ≠ fecha del evento.** El primero lo pone Prisma cuando se guarda el registro; el segundo es cuándo ocurrió la cosa en el mundo real. Modelar como campos separados en entidades con dimensión temporal (como movements).
- **Verificar contra datos reales antes de cablear suposiciones.** El legacy es desmadre histórico — lo que el operador "sabe" no siempre matchea con lo que está en los archivos. Mirar el dato siempre vence a preguntar.
- **Defensa explícita contra lo conocido, alarma ruidosa contra lo desconocido.** Sembrar branches conocidas inactivas si son potencialmente esperables (defensa); dejar que el parser explote con `throw` ante cualquier cosa no catalogada (alarma).

---

## 13. Notas operativas

- `pnpm prisma generate` después de cambios al schema.
- Si VS Code marca tipos inexistentes después de cambiar schema: **reiniciar TS Server** (Ctrl+Shift+P → "TypeScript: Restart TS Server").
- `pnpm prisma studio` para inspeccionar DB visualmente (corre en localhost:5555 o similar).
- `pnpm prisma db seed` corre `prisma/seed.ts`.
- `pnpm tsx prisma/reset.ts` corre el script de reset (no hay comando Prisma built-in para esto).
- **Exit codes en Windows CMD:** `echo %ERRORLEVEL%` (no `echo $?`, que es sintaxis de bash). En PowerShell: `echo $LASTEXITCODE`.
- **Repo en GitHub:** https://github.com/CarlosAdrianLabra/sentinel (privado). Remoto configurado como `origin`, rama `main`. Flujo: `git add . && git status && git commit -m "..." && git push`. Convención de mensajes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` + scope opcional. Pasar a público cuando el proyecto esté presentable.
- **Servidor del legacy es lento.** Reportes multi-sucursal pesados pueden tardar horas o tronar con "Cancelado por el usuario". Para diseño operativo de Sentinel, asumir que los exports son por sucursal o que los multi-sucursal son lentos. El reporte `Detalle de Ventas` es la excepción favorable (2-5 min multi-sucursal).

---

## ACTUALIZACIÓN SESIÓN 2026-05-29

### Archivo de existencias multi-sucursal: OBTENIDO Y VALIDADO

`rptNewInvetarioGlobalSinVentaSENTINEL.xlsx` (Reporte de Existencias Por
Criterio (GLOBAL), opción `Sucursal: --TODAS--`). Confirmado el reporte
correcto del menú: `Reportes → Existencias → Por Criterio (Global)`.

- Multi-sucursal real: bloques con varias filas SUC. por producto.
- 20,571 pares, $6.5M importe, 4,594 productos. Snapshot 29/05/2026 12:02pm.
- Integridad 100%: suma de filas de datos = suma de TOT = header (20571).
- **Salió en ~10 minutos.** La lentitud de >3h del 2026-05-28 era contención
  del servidor (Jesus u otros corriendo cosas en paralelo), no del reporte.
  Conclusión operativa: el multi-sucursal de existencias ES viable, correr
  en horas de baja carga.

### Sucursales 3 y 9: VACÍAS, decisión sellada

Conteo por sucursal en el snapshot:

| Suc        | Pares zapato | Pares no-zapato | Estado    |
| ---------- | ------------ | --------------- | --------- |
| 1 ABRYL    | 9,870        | 731             | activa    |
| 2 TEZONCO  | 5,382        | 1,301           | activa    |
| 3 LUIS REY | 0            | 0               | VACÍA     |
| 4 MIRASOL  | 3            | 3               | apartados |
| 5 ECOMM    | 22           | 0               | activa    |
| 9 ABRIL    | 0            | 0               | VACÍA     |

- Las sucursales 3 y 9 aparecen en TODOS los bloques pero siempre con CANT=0.
  Los 485 SKUs de la 9 están todos también en la 1 (0 exclusivos) → el
  reporte lista catálogo completo como placeholder, no inventario propio.
- Contradice lo que dijo Jesus el 2026-05-28 ("la 9 tiene ropa"). El dato
  manda: en este snapshot la 9 está en 0. Refuerza la lección: el dato vence
  a la palabra del operador.
- **El Reporte Ejecutivo de Ventas cubre los 29 días de mayo y SOLO aparecen
  qualifiers 1, 1-M-, 2, 2-M-, 5.** Las sucursales 3, 4 y 9 NUNCA venden.
  (La 4/MIRASOL no vende porque los apartados se cierran como venta de la
  sucursal física, consistente con sección 8.3.)

**DECISIÓN: sembrar las 6 sucursales, marcar 3 y 9 con isActive:false.**
Razón: defensa contra el día que tengan stock (si el parser genera una tupla
con branchLegacyId 3 o 9 y no está en branchMap, explota con "Sucursal
desconocida" y aborta el import). Sembrarlas inactivas es barato y robusto.
1, 2, 4, 5 activas; 3, 9 inactivas.

**NO fusionar la 9 en la 1.** La intuición de Carlos (9 = misma tienda física
que 1, razón social vieja) es razonable, pero fusionar en import rompe la
reconciliación (el legacy siempre las separa) y es irreversible/lossy. Si
algún día se confirma 9=1, sumar en query/vista (como MIRASOL), nunca en
escritura. Diferido — hoy la 9 está vacía, no hay nada que fusionar.

### Descubrimiento técnico: CANT=0 explícito en multi-sucursal

El reporte multi-sucursal emite **CANT=0 explícito** en la columna CANT (col 3)
para sucursales sin stock — CONTRADICE la sección 8.6, que documentaba (del
archivo single-sucursal de Fase 8) que las filas SUC. nunca emiten 0, dejan
vacío. Las columnas de TALLA sí siguen vacías cuando no hay stock.

**No rompe el parser actual** porque genera tuplas solo cuando hay cantidad>0
en una columna de talla; las filas con CANT=0 no tienen tallas pobladas, así
que se ignoran solas. PERO es fragilidad latente: el día que 3 o 9 tengan
stock real, el parser intentaría crear tuplas con branchLegacyId 3/9 → explota
si no están sembradas. (De ahí la decisión de sembrar las 6.)

### Mapa completo de fuentes de ventas del legacy

| Reporte          | Fecha  | Suc | Producto | Talla | Tipo mov | Folio |       Masivo       |
| ---------------- | :----: | :-: | :------: | :---: | :------: | :---: | :----------------: |
| Sumarizado (A)   |   no   | no  |    sí    |  no   |    no    |  no   |         sí         |
| Corrida (B)      |   no   | sí  |    sí    |  sí   |    no    |  no   |    NO (truena)     |
| Detalle (C)      |   no   | sí  |    sí    |  sí   |    no    |  no   | sí (diario rápido) |
| Ejecutivo        | sí/día | sí  |    no    |  no   |    no    |  no   |         sí         |
| Kardex por Talla |   sí   | sí  |    sí    |  sí   |    sí    |  sí   |      NO (1x1)      |

Ningún reporte masivo da las 4 dimensiones (fecha+suc+producto+talla) juntas.

**Reporte Ejecutivo de Ventas** (`rptNewVentasEjecutivoDrill`): resumen diario
por sucursal con toda la info financiera (costo, IVA, ganancia, notas de
crédito, dif. en cambios, venta neta). Por FECHA (día) × sucursal qualifier.
Sin producto/talla. Candidato a dashboard de ventas diarias. No esencial
(derivable de movements si importamos Detalle diario).

**Kardex por Talla** (`rptNewMovimientosTalla`): TRANSACCIONAL puro. Columnas
FECHA | TIPO (ENTRADA/SALIDA) | MOVIMIENTO (VENTAS/ENTRADAS PEDIDOS/
TRASPASOS (S)/etc.) | CANTIDAD | NO. OPERACION (folio único). Por
artículo+talla+sucursal, UNO A LA VEZ. Inviable como import masivo (decenas
de miles de archivos para todo el catálogo). **Queda como fuente de
auditoría/drill-down puntual** ("historial completo de este SKU") — capacidad
futura, no import. El NO. OPERACION daría idempotencia perfecta si algún día
se usa. Confirmó que los traspasos existen como tipo de movimiento (apartados
a MIRASOL = traspasos).

El **Kardex Global** (`rptNewMovimientos`, sin "Talla") es intermedio: por
producto, agrupa por fecha+tipo con cantidades por talla en columnas. Menos
útil que el por-talla (no tiene NO. OPERACION ni tipo detallado).

### DECISIÓN de arquitectura de ventas (Fase 11)

- **Import masivo de ventas → Detalle de Ventas (C), exportado DIARIO.**
  Confirmado 2026-05-29: el Detalle de UN DÍA sale rápido; el de una semana/mes
  tarda muchísimo (mismo ahogo del servidor que Corrida). El límite técnico y
  el diseño correcto coinciden: queremos diario igual (fecha exacta del
  movement sin inventar convención de rango).
- **Convención operativa: un Detalle de Ventas por día, importado diario.**
  Cada archivo = un día = una fecha de movement. Resuelve el pendiente de
  "fecha del movement" — ya no hay que elegir Fecha Final del rango.
- Kardex por Talla = drill-down futuro. Ejecutivo = dashboard opcional.

### Pendientes para próxima sesión (a codear)

1. Sembrar las 6 sucursales en `lib/constants/branches.ts` + seed (3 y 9 con
   isActive:false). Corrección de MARISOL→MIRASOL en el code/name.
2. Refactor del parser de existencias para formato multi-sucursal real:
   varias filas SUC. por bloque, manejar CANT=0 explícito.
3. Empezar parser de ventas sobre Detalle de Ventas (C), reusando lógica del
   de existencias. Idempotencia opción 3 (ver sección 10).

### Notas operativas nuevas

- Reporte de existencias multi-sucursal correcto: menú `Reportes → Existencias
→ Por Criterio (Global)`, filtro `Sucursal: --TODAS--`. Tarda ~10 min en
  servidor descargado, horas si está bajo contención.
- Reportes pesados multi-sucursal con rango largo (Corrida, Detalle de semana/
  mes) tienden a ahogar el servidor. Preferir siempre el rango más corto
  posible (diario para ventas).

---

## ACTUALIZACIÓN SESIÓN 2026-06-01

### Sembrado de las 6 sucursales (pendiente #1: cerrado)

`lib/constants/branches.ts` extendido a 6 entradas. MARISOL→MIRASOL
corregido. Sucursales muertas 3 (Luis Rey) y 9 (Abril) sembradas con
`isActive: false` (defensa: si algún día traen stock, el branchMap ya
las tiene y el parser no explota con "Sucursal desconocida").

- `code`/`name` de las muertas: cortos y estables (`LUISREY`/`Luis Rey`,
  `ABRIL`/`Abril`). El nombre legal largo de la 9 ("TIENDAS DE ROPA Y
  CALZADO ABRIL S.A. DE C.V.") vive en `legacyStoreName`, NO en `code`.
- `code: "ABRIL"` no choca con `ABRYL` (suc 1) — son strings distintos.
- Fix del seed: el upsert keyeaba por `code`, que es justo la columna que
  se renombra (MARISOL→MIRASOL). Cambiado a keyear por `legacyStoreId`
  (estable) y se agregó `code` + `isActive` al update/create. Verificado
  en Studio: 6 filas, legacyStoreId=4 ahora code=MIRASOL (no se duplicó),
  muertas con isActive=0.

### Parser de existencias verificado en multi-sucursal (pendiente #2)

El #2 no resultó ser un refactor: el parser de Fase 8 **ya soporta
multi-sucursal sin cambios estructurales**. Verificado corriendo el
parser real sobre `rptNewInvetarioGlobalSinVentaSENTINEL.xlsx`
(ImportJob 18 COMPLETED):

- Captura **18,517 pares = 99.88% del zapato** (18,540 reales de zapato).
- Maneja bien bloques con varias filas SUC. por producto y productos
  partidos en varios sub-grupos SUC./TOT. (cuando el rango de tallas no
  cabe en una fila).
- **CANT=0 explícito NO rompe el parser**: genera cero tuplas (confirma
  predicción del 2026-05-29). Solo infla el contador `positionCount` del
  log (cosmético).
- **Sucursales 3 y 9 aparecen en filas de datos** (siempre CANT=0 en este
  snapshot). El branchMap las tiene por el sembrado → no explota. La
  fragilidad latente registrada el 2026-05-29 quedó mitigada.

Faltante vs header (20,571 − 18,517 = 2,054), descompuesto:

- **2,031 pares** = productos no-zapato (talla categórica). Ignorados a
  propósito — es la deuda diferida de Fase 8, no algo nuevo.
- **23 pares** = edge cases legacy en productos zapato (ver abajo).

### Tope de talla 4000 → 4500 (B aplicado)

`parseProducts` filtraba columnas de talla con `num > 4000` (= talla
40.0). Caballero tiene tallas 42/44 (4200/4400) con stock real que se
descartaba. Subido el tope a 4500 (deja pasar hasta talla 45.0, excluye
apparel que usa "tallas" 60/80 = 6000/8000).

- Verificado (ImportJob 19): suma 18,517 → 18,521 (+4 pares), tuplas
  9,658 → 9,660 (+2 posiciones: tallas 42 y 44 de un caballero TEZONCO).
- **Idempotencia confirmada empíricamente**: ImportJob 19 corrió el mismo
  archivo que el 18 y generó SOLO 2 movements (referenceId="19", las 2
  posiciones nuevas con delta≠0). Las otras 9,658 tuplas dieron delta=0
  contra lo ya escrito → cero movements. ImportJob crece (auditoría),
  InventoryMovement solo registra el cambio real.

### Hallazgos menores (deuda chica)

- **Log "Productos/posiciones/movements creados: N" miente.** N es
  `processedCount`, que cuenta tuplas procesadas (incrementa una vez por
  tupla, pase o no por el `if (delta !== 0)`), NO movements creados.
  Viola el principio de logs autodescriptivos. Renombrar a "tuplas
  procesadas" o contar movements de verdad. Diferido.
- **`snapshotDate` se ve desplazado en Studio.** El header dice 12:02 p.m.;
  date-fns parsea en hora local (CDMX, UTC−6) y Studio muestra en UTC →
  18:02. El valor guardado es correcto, solo la vista desfasa. Tenerlo
  presente al renderizar fechas en la UI.

---

## ACTUALIZACIÓN SESIÓN 2026-06-02

### Schema: campo movementDate en InventoryMovement

Migración `add_movement_date` aplicada. Campo `movementDate DateTime?`
(opcional) en `InventoryMovement`.

- **Por qué opcional:** modela que solo ALGUNOS movements tienen fecha de
  evento real. Ventas (`OUT`) sí (cuándo se vendió). Existencias
  (`IMPORT_SET`) no (un ajuste a snapshot no ocurrió un día concreto; su
  tiempo es el del import). Opcional permite NULL para los ~9,660 movements
  de existencias ya existentes sin romper la migración.
- **Opcional en DB ≠ opcional en el parser.** El parser de ventas exige
  movementDate siempre (vía Zod). La tabla permite null; el código de
  ventas no.
- Aplica el principio (sección 12): `createdAt` (cuándo se guardó) ≠ fecha
  del evento (cuándo ocurrió en el mundo real).

### Diseño del parser de ventas (pendiente #3) — DISEÑO CERRADO, código a medias

Archivo nuevo: `scripts/import-ventas.ts` (separado de existencias, no un
`if` adentro — cada parser escribe distinto).

**Decisión central — ventas escribe SOLO en InventoryMovement, NO toca
InventoryPosition.**

- Ventas = la película (eventos `OUT` con fecha). Existencias = la foto
  (estado en `InventoryPosition`). Cada parser dueño de su tabla.
- El legacy ya descuenta el stock solo, así que el próximo snapshot de
  existencias ya trae la posición correcta. Si ventas también bajara la
  posición, el snapshot siguiente aplicaría el descuento dos veces →
  posición rota. Por eso ventas se mantiene lejos de InventoryPosition.
- Cada venta de talla con cantidad>0 → movement `OUT`, `quantityDelta`
  negativo, sin `findUnique`/delta (una venta ES el movimiento, no se
  deduce comparando contra stock previo).

**Por qué importar ventas si el snapshot ya da el stock:** el snapshot no
cuenta CÓMO se llegó de un stock a otro. Ventas da rotación (qué se mueve y
a qué ritmo) y fecha de evento (tendencias, dashboard diario). Es el
historial de movimientos consultable que el legacy no expone masivamente
(sección 1: "no hay forma clara de auditar cambios").

**Formato C verificado contra rptNewVentasDetallegeneral.xlsx:**

- Hoja de datos: `rptNewVentasDetalle`. Header con `Fecha Inicial` y
  `Fecha Final` (en el sample, ambas = 27/05/2026 = un día, convención
  diaria confirmada).
- Etiquetas (producto, SUC., qualifier, TOT.) en **col 0** (en existencias
  era col 1).
- Columnas financieras en 2-27 (CANT col 2, COSTO/U 4, PRECIO/U 5, TOTAL
  22, UTILIDAD 23, ROTACION 27...). **Tallas arrancan en col 29.**
- Cantidad vendida por talla en las columnas de talla (29+), igual modelo
  que existencias (header de tallas en centésimas, varía por producto).

**Constantes de layout decididas:**
`LABEL_COL = 0`, `SIZE_SCAN_START = 29`, `SIZE_SCAN_END = 50` (margen;
sample llega a ~42), filtro talla `[500, 4500]` (igual que existencias).
Arrancar el scan en 29 (no en 4 como existencias) es defensa por
construcción: nunca mira las columnas financieras, que tienen números en
rango [500,4500] (ej. COSTO/U 574.5) que podrían colarse como tallas.

**`normalizeQualifier(raw): string` — HECHA Y VERIFICADA.**
`raw.replace(/[^0-9]/g,"")` colapsa el sufijo `-M-`, luego valida contra
`["1","2","5"]`. `4` (MIRASOL) y desconocidos → throw con mensaje
autodescriptivo. Verificada: `"1-M-"`→`"1"`, `"5"`→`"5"`, `"2-M-"`→`"2"`,
`"4"`→throw, `"7"`→throw.

**`SaleTuple` decidida:** `branchLegacyId` (string, ya normalizado),
`fullDescription`, `size`, `quantity` (`.positive()`, no nonnegative — una
venta de 0 no es venta), `movementDate` (Date, el campo nuevo). SIN
`isActive`: un movement no tiene ese campo, y ventas no debe gobernar el
`isActive` del Product (eso es trabajo de existencias).

**Loop con 4 ramas (esqueleto armado, ramas a llenar):**

1. ¿producto nuevo? (col 0, ≥4 guiones) → arranca bloque.
2. `SUC.` → leer header de tallas, armar sizeByColumn (idéntico a
   existencias salvo rango de scan). [TODO]
3. fila de datos (col 0 tiene dígito, `/\d/.test()`) → normalizeQualifier +
   leer cantidades por talla → push tuplas. [TODO]
4. `TOT.` → fin de bloque / validación opcional.

`parseSales(rows, movementDate)` recibe la fecha como parámetro (leída una
vez del header) y la clava en cada tupla.

### Pendiente para próxima sesión (#3, a construir)

- Llenar ramas 2 y 3 del loop.
- Lectura del header: extraer `Fecha Final` y parsear con date-fns (cuidado
  con el formato y la zona horaria, ver hallazgo TZ del 2026-06-01).
- Persistencia: upsert Product, crear movement `OUT` con quantityDelta
  negativo + movementDate, source `legacy_sales`. NO tocar
  InventoryPosition.
- Idempotencia opción 3 (sección 10): rechazo si ya existe ImportJob
  COMPLETED con mismo source+fecha. Mecanismo de override: TBD.

---

## ACTUALIZACIÓN SESIÓN 2026-06-03

### Parser de ventas (pendiente #3) — COMPLETO, falta correr import real

`scripts/import-ventas.ts` terminado y compilando. Lectura verificada
contra el archivo real (rptNewVentasDetallegeneral.xlsx) replicando la
lógica en Python: 102 tuplas, 102 pares, Fecha Final 27/05/2026, qualifiers
idénticos a la tabla 8.3 (`1`:5, `1-M-`:57, `2`:1, `2-M-`:26, `5`:24),
cero errores de normalización.

**Estructura (reusa el molde de existencias, difiere donde importa):**

- `normalizeQualifier(raw)`: limpia con `replace(/[^0-9]/g,"")` (colapsa
  el sufijo `-M-`), valida contra `["1","2","5"]`. `4` y desconocidos →
  throw. Verificada.
- `parseSales(rows, movementDate)`: loop de 4 ramas. Diferencias clave con
  existencias:
  - Etiquetas en col 0 (no col 1). Constante `LABEL_COL`.
  - Tallas escanean de col 29 a 50 (`SIZE_SCAN_START`/`END`). Arrancar en
    29 evita las columnas financieras (COSTO/U, PRECIO/U, etc.) que tienen
    números en rango [500,4500] y se colarían como tallas.
  - Fila de datos se detecta por "col 0 tiene dígito" (`/\d/.test`), no por
    `typeof === number` como existencias (acá el qualifier es string).
- `extractFechaFinalString` + `parseFechaFinal`: leen `Fecha Final` del
  header (busca la celda en cualquier columna con `.find`, no posición
  fija) y la parsean con `dd/MM/yyyy`. Si no hay fecha → throw (sin fecha,
  un movement de venta no tiene sentido).

**Persistencia — `persistSales`. Decisión central confirmada:**

- Ventas escribe SOLO `InventoryMovement`, NUNCA `InventoryPosition`.
- De las 4 operaciones de `persistTuples` (existencias), sobreviven 2:
  upsert Product + create movement. Se borran: leer posición previa y
  upsert posición (no hay delta que calcular; una venta ES el movimiento).
- Movement: `movementType "OUT"`, `quantityDelta = -tuple.quantity`
  (negativo, sale stock), con `movementDate`. Se crea SIEMPRE (toda tupla
  ya pasó el filtro quantity>0; no hay `if delta!=0`).
- Upsert Product: `update: {}` (no toca nada si existe — ventas no
  gobierna el Product), `create` solo con `fullDescription` (isActive cae
  a true por @default). fullDescription se limpia el `" *"` igual que
  existencias, para que matchee el mismo Product.

**Idempotencia (opción 3) — implementada:**

- Antes de crear el ImportJob, `findFirst` busca un ImportJob `legacy_sales`
  COMPLETED con el mismo `snapshotDate`. Si existe → throw, aborta sin
  duplicar.
- Va ANTES de createImportJob (si no, la query se encontraría a sí misma).
- Necesaria porque ventas NO tiene la red de idempotencia de existencias
  (allá delta=0 → no movement; acá cada corrida crea OUTs nuevos sin
  comparar, así que correr el mismo archivo 2x duplicaría las ventas).

### Deuda chica nueva

- **`snapshotDate` reusado para fecha de venta.** El campo se llama
  `snapshotDate` (nombre de existencias), pero en ventas guarda la Fecha
  Final del archivo. Funciona, pero el nombre miente un poco. Si algún día
  molesta, renombrar a algo neutro tipo `sourceDate`. Diferido.

### Pendiente para próxima sesión

- **Correr el import de ventas real** (`pnpm tsx scripts/import-ventas.ts
rptNewVentasDetallegeneral.xlsx`) con predicción previa: cuántos movements,
  qué movementType, y qué pasa en una segunda corrida (idempotencia).
- Verificar en Studio: ImportJob COMPLETED, movements OUT con quantityDelta
  negativo y movementDate, que NO se hayan tocado posiciones.
- Probar idempotencia: segunda corrida del mismo archivo → debe abortar con
  el error de duplicado.
- TODO opcional en RAMA 4 (validación de TOT) sigue sin hacer — decidir si
  vale o se deja.

---

## ACTUALIZACIÓN SESIÓN 2026-06-08

### Import de ventas: CORRIDO Y VERIFICADO — pendiente #3 cerrado

Primer import de ventas real ejecutado y verificado en DB. Fase 11 completa.

`pnpm tsx scripts/import-ventas.ts rptNewVentasDetallegeneral.xlsx`
→ ImportJob 20, COMPLETED, 102 movements, fecha 27/05/2026.

Verificado en Studio (referenceId="20"):

- **102 movements `OUT`**, todos `quantityDelta = -1` (negativo, sale
  stock), `movementDate = 2026-05-27`, `referenceId = 20`. Coincide con la
  lectura (102 tuplas) y con la predicción.
- branchId 7/8/9 (= ABRYL/TEZONCO/ECOMM, las que venden). Ninguna 13/18/19
  (MIRASOL/LUISREY/ABRIL) — correcto, no venden.
- `InventoryPosition` NO se tocó (decisión central: ventas solo escribe
  movements). Conviven 102 OUT con los ~9,660 IMPORT_SET de existencias en
  la misma tabla — historial completo, correcto.

**Idempotencia (opción 3) PROBADA empíricamente:**

- Segunda corrida del mismo archivo → abortó con
  "Ya existe un import de ventas COMPLETED para 27/05/2026 (ImportJob 20)".
- NO creó movements (total OUT del 27/05 sigue en 102, no 204), NO creó
  ImportJob nuevo (throw antes de createImportJob).
- El catch entró en la rama "antes de crear el ImportJob" (importJobId
  undefined → no marca FAILED), la capa CLI hizo exit 1. Patrón de errores
  en capas (sección 12) funcionando.

### Desfase de hora en movementDate (esperado, no bug)

`27/05/2026` se guarda como `2026-05-27T06:00:00.000Z`. parseFechaFinal
parsea como medianoche LOCAL (CDMX, UTC−6); medianoche local = 06:00 UTC.
El día es correcto. Mismo fenómeno TZ que snapshotDate en existencias.
IMPORTANTE para idempotencia: mientras siempre se parsee igual, el valor es
idéntico y el findFirst matchea. (Verificado: la 2da corrida matcheó.)

### Pendientes (próxima sesión / futuro)

- TODO opcional RAMA 4 (validación de suma contra TOT en ventas) — nunca se
  hizo. Decidir si vale o se descarta como en existencias.
- Deuda chica viva: log "movements creados" en existencias (cuenta tuplas);
  snapshotDate reusado para fecha de venta (nombre); columnas huérfanas
  (deuda C); process.exit→throw ya resuelto.
- UI pendiente: vista de ventas, importer de ventas con botón, columna de
  rotación en /inventory (ahora que hay movimientos de venta, ya hay datos
  para calcularla).
- Operativo: convención de Detalle de Ventas diario con Jesus; validador
  "archivo no regresivo".

## ACTUALIZACIÓN SESIÓN 2026-06-09

### Vista de ventas: COMPLETA Y VERIFICADA — primer pendiente del 2026-06-08 cerrado

Construida la primera UI de ventas, elegida sobre los otros candidatos de scope
(importer con botón, rotación, validación de TOT, validador no-regresivo) por ser
el bloque que hace _visible_ el trabajo de Fase 11 con bajo riesgo, reusando el
patrón de Server Component ya clavado en `/inventory`.

Dos archivos nuevos:

- `lib/services/sales.ts` — servicio `getSalesData()`.
- `app/sales/page.tsx` — Server Component async, route en inglés (`sales`)
  siguiendo el patrón `branches`/`imports`/`inventory`.

Commit de código: `feat(sales): vista de ventas con servicio getSalesData y página /sales`.

### `getSalesData` — patrón de DOS queries (no `include`)

El servicio trae los movements `OUT` que produjeron los imports de ventas y los
aplana a la vista. Es **dos queries encadenadas, no un `include`**, por una razón
estructural del schema:

- `InventoryMovement.referenceId` es `String?` **sin `@relation`** a `ImportJob`
  (es genérico: hoy apunta a un ImportJob, mañana podría apuntar a un folio
  externo — por eso no es un FK tipado).
- `ImportJob` **no tiene** back-relation `movements InventoryMovement[]`.

Sin relación de ningún lado, no se puede "entrar" desde el ImportJob a sus
movements en una sola query con `include`. Entonces:

1. **Query 1:** `importJob.findMany({ where: { source: "legacy_sales" }, select: { id: true } })`.
2. Convertir los ids: `.map((job) => job.id.toString())`.
3. **Query 2:** `inventoryMovement.findMany({ where: { referenceId: { in: [...] } }, include: { branch, product }, orderBy: { movementDate: "desc" } })`.

**Conversión de tipos — dirección confirmada (refuerza sección 12).**
`ImportJob.id` es `Int`; `select: { id: true }` devuelve **objetos** `[{ id: 20 }]`,
no valores sueltos `[20]` (re-confirmado el aprendizaje ya registrado). La columna
`referenceId` contra la que se filtra es `String` y guarda `"20"`. Regla: se doblan
**nuestros** valores para que entren en la columna (`Int → String` vía `.toString()`),
**nunca** la columna. El `.map` saca el `id` del objeto _y después_ lo vuelve string:
`job.id.toString()`.

### Decisión: filtrar ventas por `source`, no por `movementType`

La vista filtra por _de dónde vino_ el movement (qué import lo creó:
`source: "legacy_sales"`), no por _qué tipo es_ (`movementType: "OUT"`). Más honesto:
el modelo permite un `OUT` de traspaso (sección 6) que NO es venta. Hoy todo `OUT`
en la DB es venta (no se importan traspasos), así que `movementType: "OUT"`
alcanzaría — pero filtrar por `source` describe exactamente lo que queremos ver
("lo que produjeron los imports de ventas") y no se rompe el día que exista un OUT
de traspaso. Fichado: si algún día se importan traspasos, esta query ya está blindada.

**Bug evitado en el `where` (contraste predicción/realidad).** Tentación inicial:
meter `quantityDelta: -1` en el `where`. Lo descarta el escenario de una venta de 2
pares (`quantityDelta = -2`), que con ese filtro se caería sin avisar. Lo tramposo:
contra la DB de hoy (102 movements todos `-1`) el filtro **pasaría** y no delataría
el bug. `quantityDelta` NO va en el `where`.

### Aplanado del servicio — trade-off registrado

`getSalesData` devuelve objetos **aplanados** (no el resultado crudo de Prisma):
`{ id, fecha, sucursal, producto, talla, cantidad }`. Decisión correcta **porque el
servicio sirve UNA vista concreta** (esta página). Regla general para servicios futuros:

- **Aplanar** cuando el servicio sirve una vista específica (columnas ya masticadas).
- **Devolver crudo** cuando es genérico y no se sabe quién lo consumirá (aplanar de
  más obliga a tocar el servicio cada vez que una vista nueva quiera un campo recortado).

Consecuencia: si mañana se quiere "ventas por sucursal" o un dashboard que necesite
`quantityDelta` crudo, **no se estira `getSalesData`** — se hace un servicio nuevo.

**Signo de `cantidad`:** `cantidad: -m.quantityDelta`. El movement guarda el delta
negativo (`-1` para venta de un par, por el `-tuple.quantity` del parser); la vista lo
dobla a positivo para que la tabla diga "vendiste 1", no "−1". Se usó `-x` y **no**
`Math.abs(x)` a propósito: si algún día se cuela un delta positivo donde no debería,
`-x` lo mostraría negativo (se ve, se sospecha); `Math.abs` lo taparía. Consistente
con "alarma ruidosa contra lo desconocido" (sección 12). El doblez es correcto pero NO
se pudo _ver_ funcionar hoy: como todo es `-1 → 1`, una venta de 2 daría `2` pero no
hay ninguna en este snapshot — su prueba real espera al día que alguien venda 2 pares
de la misma talla.

### La página — calcada de `/inventory`, dos puntas nuevas

`app/sales/page.tsx` reusa el molde de `/inventory`: Server Component async, `Table`
de shadcn, `default export`. Columnas: **Fecha · Sucursal · Producto · Talla · Cantidad**
(Fecha primera por ser el eje del log). `sucursal` lee `branch.name` (`"Abryl"`,
`"e-commerce"`) por leer mejor que `code` en tabla — preferencia, no regla.

Dos cosas nuevas que TS subrayó antes de correr:

1. **`key={row.id}`** — `getSalesData` no devolvía `id` (se aplanó a 5 columnas
   visibles). Decisión: **agregar `id` al objeto del servicio** (el id del movement,
   estable y único — cada venta de talla es un movement distinto), no keyear por índice
   del `.map` (frágil ante reordenamientos). El servicio ahora devuelve 6 llaves: 5
   visibles + `id` como plumbing para el `key` de React.

2. **`{row.fecha}` no compila** — `fecha` es `Date | null`; React pinta `string`/`number`
   como hijo de `<td>` pero **no** un `Date` (es un objeto, no sabe cómo formatearlo).
   Hay que formatear a string. Se usó `format(row.fecha, "dd/MM/yyyy")` de date-fns — el
   **inverso** de `parse` (que en `import-ventas.ts` va string → Date; `format` va
   Date → string).

   El `| null` del tipo viene de que `movementDate` es `DateTime?` en el schema (los
   `IMPORT_SET` de existencias no lo llenan). **TS razona sobre el tipo de la columna,
   no sobre "qué trae esta query".** En la práctica esta query solo trae ventas, todas
   con fecha, así que la rama `: "sin fecha"` nunca se pinta — es defensa contra un
   **tipo**, no contra un caso real. Se puso igual (barata, calla a TS con honestidad)
   vía narrowing: `row.fecha ? format(...) : "sin fecha"` (dentro del `?`, TS ya sabe
   que `fecha` no es null).

### Deuda chica nueva

- **Orden arbitrario dentro de un mismo día.** Se ordena por `movementDate: "desc"`,
  pero como todas las ventas son del 27/05, el `desc` no tiene nada que desempatar →
  las filas quedan en orden de inserción de la DB (por `id`). Se ve bien hoy. El día
  que se importen varios días, las fechas se agruparán de la más nueva a la más vieja,
  pero _dentro_ de un día el orden seguirá arbitrario. Si se quiere un segundo criterio
  (ej. sucursal dentro de la fecha), se agrega al `orderBy` como en `/inventory`
  (array de tres). No urge.

### Verificación end-to-end

`pnpm dev` → `localhost:3000/sales`. Las tres predicciones pegaron:

- **102 filas** (un movement por tupla del único import, ImportJob 20).
- **Fecha 27/05/2026 en todas** (todas del mismo import, mismo `movementDate`).
- **Cantidad 1 en todas** (las 102 ventas son de 1 par; ninguna de 2 en este snapshot).

La tabla pinta limpia, relaciones jaladas (Tezonco, e-commerce vía `branch.name`),
`format` de fecha funcionando. Primera vista de ventas viva.

### Pendientes (próxima sesión / futuro)

Del bloque de candidatos del 2026-06-08 queda cerrado **UI de ventas**. Siguen abiertos:

- **Importer de ventas con botón** — hoy el import es CLI
  (`pnpm tsx scripts/import-ventas.ts ...`), solo lo corre Carlos. UI de subir archivo +
  Server Action que llame al parser (lo que habilitó el refactor `process.exit→throw`).
  El salto técnico más grande pendiente: Server Actions, mutación desde UI, upload.
- **Validador "archivo no regresivo"** — su red de seguridad: cobra sentido sobre todo
  cuando Jesus suba archivos solo (ahí se cuela un archivo viejo por error). Comparar
  `snapshotDate` del archivo entrante contra el último ImportJob COMPLETED; rechazar si
  es más viejo.
- **Columna de rotación en `/inventory`** — ya hay movements de venta para calcularla.
  Antes de codear: decidir qué significa la columna `ROTACION` propia del legacy (¿se
  espeja o se calcula?) — research corto previo. Territorio nuevo de queries de agregación.
- **TODO opcional RAMA 4** (validación de suma contra TOT en el parser de ventas) — nunca
  se hizo; decidir si vale o se descarta como en existencias.
- **Segundo criterio de orden en `/sales`** (deuda chica de esta sesión, arriba).
- Deuda chica viva de sesiones previas: log "movements creados" en existencias (cuenta
  tuplas, no movements); `snapshotDate` reusado para fecha de venta (nombre); columnas
  huérfanas (deuda C).
- Operativo: convención de Detalle de Ventas diario con Jesus.

## ACTUALIZACIÓN SESIÓN 2026-06-09 (cont. — warm-ups)

Dos warm-ups chicos para cerrar la sesión, ambos sobre la vista de ventas recién
construida. Commits separados por capa:

- `feat(sales): segundo y tercer criterio de orden en la vista de ventas` (`0069f8d`)
- `chore(sales): descarta validación de TOT en el parser con justificación` (`f72aacf`)

### Orden de `/sales` ampliado a tres criterios

`orderBy` pasó de un objeto (`{ movementDate: "desc" }`) a un array de tres, igual que
`/inventory`:

```typescript
orderBy: [
  { movementDate: "desc" }, // eje del log, más nuevo arriba
  { branchId: "asc" }, // agrupa por sucursal
  { quantityDelta: "asc" }, // ventas más grandes arriba (ver nota de signo)
];
```

**Signo de `quantityDelta` en el orden (aprendizaje).** La intención "ventas más grandes
arriba" se escribe `asc`, **no** `desc`, porque la columna guarda el delta **negativo**
(`-2 < -1`): ascendente pone el más negativo (la venta de 2 pares) primero. Hay que leerlo
en voz alta —"ordeno `quantityDelta` de menor a mayor, y como es negativo, la venta más
grande sale primero"— para no equivocar la dirección. Ojo: se ordena por `quantityDelta`
(columna cruda, en SQL), NO por `cantidad` (la llave aplanada, que solo existe en JS
_después_ del `.map`). El `orderBy` corre dentro de la query, antes del aplanado; intentar
ordenar por `sucursal`/`cantidad` lo rechaza TS — buen recordatorio de dónde pasa cada cosa.

**DEUDA CHICA aceptada a propósito — orden de sucursal atado a `branchId`.**
`branchId: "asc"` da ids 7,8,9 → Abryl, Tezonco, e-commerce, que casualmente es el orden
deseado (físicas primero, canal después). PERO funciona por **coincidencia del orden de
siembra del seed**, no porque `branchId` signifique "prioridad de negocio" (significa orden
de inserción). Si algún día se resiembra distinto o se agrega una sucursal, el orden cambia
solo. **Decisión: se deja así a propósito** — el orden global pierde importancia cuando se
agreguen filtros a `/sales`, y modelar prioridad explícita (`displayOrder Int` en Branch,
migración + seed) es una tangente no necesaria hoy. Aceptado conscientemente (distinto a no
haberlo visto). Si algún día molesta: `displayOrder` en Branch, o filtros en la vista.

### Validación de TOT en el parser de ventas: DESCARTADA (decisión cerrada)

El TODO opcional de la RAMA 4 (validar la suma de tuplas de un bloque contra su fila `TOT.`)
**se mató**, no se construyó. Reemplazado por un comentario de decisión cerrada en el código
para que no se reconsidere. Razones:

1. **Verificación end-to-end ya existe y es más fuerte.** El parser se validó contra el
   archivo completo (102 tuplas/pares confirmados vs lectura en Python), red más robusta que
   un check por-bloque.
2. **Existencias nunca tuvo esta validación y no mordió** en 2 imports correctos.
3. **El TOT de ventas es ruidoso:** incluye cambios (`CANT=0` + `DEV`) y devoluciones en
   columnas separadas que este parser ignora a propósito → sumar tuplas vs TOT NO cuadraría
   limpio sin reconstruir qué parte del TOT es venta pura (lógica nueva no trivial para un
   check redundante).

La rama `else if (blockCell === "TOT.")` se **mantiene** como no-op documentado (no se borra):
deja explícito que la fila TOT se reconoce y se ignora a propósito, en vez de confiar en que
el regex de la RAMA 3 la rebote por accidente. Defensa explícita (sección 12).

**Meta-aprendizaje registrado:** parte del oficio es saber qué NO construir. "Está el dato y
se podría validar" no es razón suficiente; la pregunta correcta es "¿qué resuelve?", y cuando
la respuesta es "nada que no esté ya cubierto", se mata. Evita el error común de construir
redes redundantes que se mantienen, confunden, y dan falsa robustez.

### Estado al cierre

Fase 11 visible (`/sales` viva) + warm-ups cerrados. Sin trabajo a medias. Próxima sesión:
**importer de ventas con botón** (Server Actions, upload, mutación desde UI — el salto que
habilitó el refactor `process.exit→throw`). Su pareja: validador "archivo no regresivo".

## ACTUALIZACIÓN SESIÓN 2026-06-15

### Importer de ventas con botón — Server Actions de punta a punta

Primer bloque que toca Server Actions, upload desde navegador y mutación desde
UI (el salto técnico que habilitó el refactor `process.exit→throw`). Atacado en
3 pasos chicos + verificación del happy path. Todo commiteado, código separado
por responsabilidad. Carpeta nueva `app/imports/ventas/` (URL `/imports/ventas`),
sin tocar nada existente.

**Concepto base — Server Component vs Client Component.** No es la extensión
(`.tsx` los dos): es la CLASE de componente. La línea divisoria operativa:
¿la pantalla cambia DESPUÉS de cargar, reaccionando al usuario?

- **Sí → Client Component** (`"use client"`): corre en el navegador, guarda
  estado (`useState`), reacciona a clicks/eventos. Es el form de subir.
- **No → Server Component** (el DEFAULT en App Router): corre en el servidor,
  arma el HTML una vez, no reacciona. Es `/sales`, `/inventory`, etc.
  Una página Server puede montar adentro una "isla" Client (la página monta el
  form) — los dos tipos conviven.

**Concepto base — qué es una Server Action.** Por debajo ES una llamada API (un
`POST`) al servidor — pero Next.js genera el endpoint, el `fetch` y la
serialización del JSON por vos. Escribís UNA función con `"use server"`, la
importás y la llamás como si fuera local; Next arma los dos extremos. (Analogía
para el background no-code: como un backend workflow de Bubble, salvo que el
cuerpo lo escribís vos.)

### Paso 1 — Esqueleto del cable (commit 27b0316)

Probar el cruce navegador→servidor→navegador con un payload de juguete, sin
parser ni DB. Cuatro archivos en `app/imports/ventas/`:

- `types.ts` — `ImportResult` (en Paso 1: `{ fileName, rowCount }`, de juguete).
- `actions.ts` — Server Action `importVentas(formData)`. Saca el `File` del
  `FormData`, guard `if (!(file instanceof File)) throw`, lee los BYTES
  (`file.arrayBuffer()` → `XLSX.read(Buffer.from(bytes), { type: "buffer" })`),
  cuenta filas crudas y devuelve nombre + conteo.
- `import-form.tsx` — Client Component (`"use client"`): `<input type="file">`
  - botón en un `<form action={handleSubmit}>`, `useState` para result/error,
    llama a la action en un `try/catch`.
- `page.tsx` — Server Component que monta el form.

**Aprendizaje (bytes, no ruta):** en el navegador NO hay ruta en disco; el
archivo es un `File` en memoria. Por eso la action lee bytes con `XLSX.read`,
no `XLSX.readFile` (que lee de disco, lo de la CLI). Este es el detalle que
diferencia el lado action del lado CLI.

**Aprendizaje (manejo de `unknown` en catch):** en un `catch`, `e` es `unknown`
(JS puede lanzar cualquier cosa, no solo `Error`). TS no deja tocar `.message`
hasta probar el tipo: `e instanceof Error ? e.message : String(e)`.

**Verificado:** subir el Detalle de Ventas mostró "archivo
rptNewVentasDetallegeneral.xlsx — 464 filas", POST 200. (464 = filas crudas de
la hoja: header del reporte + descripciones + headers de talla + TOT., NO las
102 ventas; eso sale del parseo real.) Primer dato cruzando ida y vuelta.

**Bug cazado por Carlos sin ayuda:** un input de archivo VACÍO igual manda un
`File` (nombre `""`, 0 bytes), así que pasa el guard `instanceof File` (es un
File de verdad) y revienta más abajo cuando SheetJS lee 0 bytes → workbook sin
hojas. El guard chequea el TIPO, no si se eligió algo. (Candidato a la X de
"archivo no válido" más adelante.)

### Paso 2 — Refactor: core reusable (commit 5731309)

Extraído de `main()` un core que trabaja sobre un workbook ya leído, para que lo
llamen los dos: la CLI (disco → workbook) y la Server Action (bytes → workbook).
Refactor puro, sin cambio de comportamiento.

**El corte:** la única línea que "sabe de disco" es `readWorkbook` (=
`XLSX.readFile(path)`). Todo lo que viene DESPUÉS de tener un `workbook` en la
mano no necesita saber de dónde salió. Por eso el core recibe el WORKBOOK (la
primera cosa que ambos lados producen), no la ruta (solo la CLI) ni los bytes
(solo la action).

**Firma decidida (por Carlos):**
`runVentasImport(workbook: XLSX.WorkBook, fileName: string) → Promise<VentasImportResult>`,
con `type VentasImportResult = { importJobId: number; processedCount: number }`.

- Recibe `fileName` (string ya resuelto) en vez de `filePath`: cada llamador lo
  arma a su manera (CLI pasa `filePath`, action pasa `file.name`), pero al core
  le llega un string a secas.
- **Devuelve** un dato en vez de imprimir con `console.log`. Razón: un core que
  imprime está clavado a la terminal (inútil para la action, que necesita el
  dato de vuelta en el navegador). El core entrega información; cada llamador
  decide qué hacer (CLI imprime, action arma `ImportResult`). Mismo principio
  que `throw` vs `process.exit` (sección 12).

**Cambios concretos:** nació `runVentasImport` (cuerpo de trabajo de `main` +
el `catch` con `markImportJobFailed`/`throw`, terminando en
`return { importJobId, processedCount }`). `main` adelgazó a argv → `readWorkbook`
→ llamar al core → imprimir. `createImportJob` renombró su parámetro
`filePath → fileName`.

**Verificado:** la CLI sobre el archivo del 27/05 (ya importado, ImportJob 20)
abortó por idempotencia con exit 1 — IDÉNTICO a antes del refactor. El throw
viajó core → main → `.catch()` del fondo. Comportamiento externo intacto.

### Paso 3 — Conectar la action al core real (commits 73b718f, d00021a)

**Problema A — el `main()` se autoejecuta al importar.** Importar CUALQUIER cosa
de un módulo ejecuta el archivo ENTERO de arriba abajo, una vez. El
`main().catch().finally()` suelto al nivel del archivo correría apenas la action
hiciera `import { runVentasImport }` — y `main` llama a `getFilePathFromArgs`,
que sin `process.argv[2]` (no hay terminal en el servidor) lanza "falta el
argumento". El importer caería por una razón absurda.

**Solución (commit 73b718f):** guardar el `main()` para que corra SOLO si el
archivo se ejecuta directo como script. Concepto: comparar "¿quién es el punto
de entrada?" contra "¿quién soy yo?". En ESM (Prisma 7 obliga `"type": "module"`)
NO existe el `require.main === module` de CommonJS; se usa:

```ts
import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1]).href) { main()... }
```

`import.meta.url` = mi URL (Ruta B); `process.argv[1]` = el archivo que arrancó
(Ruta A, ruta de sistema → `pathToFileURL` la lleva a URL para comparar URL vs
URL; `.href` la vuelve string). Corrés directo → coinciden → corre `main`. Te
importan → no coinciden → no corre nada al cargar el módulo.
Verificado: CLI directa sigue abortando por idempotencia, exit 1, idéntico.

**Dos build errors de Turbopack diagnosticados leyendo el import trace** (sin
solución dada — Carlos los resolvió con guía):

1. **"Module not found: Can't resolve 'fs'"** — el trace mostraba
   `import-ventas.ts [Client Component Browser]`: el código de servidor (Prisma →
   better-sqlite3 → `fs`) se estaba arrastrando al bundle del navegador. Causa:
   a `actions.ts` se le había perdido el `"use server"` de la primera línea.
   `"use server"` es load-bearing — es la marca que le dice a Next "esto se queda
   en el servidor, no lo mandes al navegador". Restaurado → resuelto.
2. **"Export default doesn't exist in target module"** en `import XLSX from "xlsx"`.
   `xlsx` no tiene export default (tiene named: `readFile`, `utils`, `read`).
   `pnpm tsx` es permisivo y lo deja pasar; Turbopack es estricto y truena.
   Fix: `import * as XLSX from "xlsx"` (namespace = todo el módulo como objeto),
   igual que ya estaba en `actions.ts`. **Aprendizaje general:** si un build
   error aparece solo bajo Turbopack pero el script corría con `tsx`, sospechar
   diferencias estricto-vs-permisivo (default imports, etc.).

**Conexión (commit d00021a):** la action dejó el conteo de juguete y ahora hace
`const result = await runVentasImport(workbook, file.name); return result;`.
`ImportResult` redefinido a `{ importJobId, processedCount }` (la forma que
devuelve el core), así `return result` calza directo (mismo objeto, no se
reconstruye campo por campo). **Aprendizaje:** cambiar la FORMA de un tipo
obliga a actualizar TODOS sus consumidores — el `<p>` del form quedó pidiendo
`result.fileName`/`result.rowCount` (campos del juguete viejo) y dio rojo hasta
actualizarlo a `importJobId`/`processedCount`.

**Verificado (camino de error):** subir el archivo del 27/05 desde el navegador
mostró en pantalla la X "Ya existe un import de ventas COMPLETED para 27/05/2026
(ImportJob 20)..." — el throw de idempotencia del core nacido en lo profundo de
la lógica, subiendo hasta el `setError` del form. Cero movements nuevos.

### Happy path verificado — el importer crea movements desde un click

Para ver el camino de ÉXITO (la idempotencia tapaba el 27/05), se liberó la
fecha con borrado manual en Studio:

- Borrados los 102 `InventoryMovement` con `referenceId = "20"` Y el ImportJob 20.
- **Aprendizaje:** borrar el ImportJob NO borra sus movements (no hay
  `onDelete: Cascade`; son tablas separadas ligadas solo por `referenceId`
  string, consistente con que `referenceId` es `String?` sin `@relation`). Si
  se borra solo el job y se reimporta → 204 movements (102 viejos huérfanos +
  102 nuevos). Hay que borrar AMBOS para que quede limpio en 102.

Reimport desde el navegador → pantalla: "Import OK — ImportJob 21, 102 movements
creados". POST 200, terminal limpia, `Fecha de venta: 2026-05-27`.
Verificado en Studio (referenceId 21):

- **102 movements**, todos `OUT`, `quantityDelta = -1`, `movementDate = 27/05`.
- branches **7, 8, 9** (ABRYL/TEZONCO/ECOMM) — ninguna 13/18/19. El parser
  ruteó los qualifiers correctamente.
- ImportJob 21 COMPLETED, `totalRows`/`processedRows` = 102, `fileName` correcto.
- **id 21, no 20:** SQLite no recicla el autoincrement aunque se borre la fila
  (mismo fenómeno ya visto con ImportJobs previos).

El historial de ventas (OUT) y el de existencias (IMPORT_SET, ids ~15.700)
conviven en la misma `InventoryMovement`, distinguidos por `referenceId` y
`movementType`.

### Deuda chica nueva

- **Happy path solo probado con borrado manual del 27/05.** Falta probarlo con
  un archivo de un día NUEVO (lo realista; estrena la convención diaria con
  Jesús). El borrado manual fue para test, no es flujo normal.
- **Texto del `<p>` de éxito mínimo** ("Import OK — ImportJob 21, 102 movements
  creados"). Funcional pero crudo; el polish (estados idle→procesando→✓/X) es el
  Paso 4. Decisión consciente, no se pulió hoy.
- **`main()` pasa `filePath` como `fileName`** a `createImportJob` — la CLI
  guarda la ruta completa como "nombre". Cosmético.

### Estado al cierre

Pasos 1-2-3 del importer de ventas cerrados + happy path verificado de punta a
punta. El salto técnico grande (Server Actions + upload + mutación desde UI)
está hecho y probado en sus DOS caminos (éxito + idempotencia). 4 commits sin
pushear (27b0316, 5731309, 73b718f, d00021a). Sin trabajo a medias.

**Próxima sesión — candidatos:**

- **Paso 4 — estados visuales en el form:** idle → "procesando" → ✓ con conteo /
  X con mensaje. Lo que falta para que se vea pulido y no texto pelón.
- **Paso 5 — refrescar la vista:** tras import exitoso, `revalidatePath("/sales")`
  para que el Server Component relea la DB y la tabla se actualice sola.
- **Paso 6 — validador "archivo no regresivo":** rechazar un archivo con
  `snapshotDate` más viejo que el último ImportJob COMPLETED. Cobra sentido sobre
  todo cuando Jesús suba archivos solo.
- Probar el happy path con un día nuevo de Jesús.

**Deuda viva de antes:** log "movements creados" en existencias (cuenta tuplas);
`snapshotDate` reusado para fecha de venta (nombre); columnas huérfanas (deuda C);
rotación en `/inventory`; convención de Detalle de Ventas diario con Jesús.

## ACTUALIZACIÓN SESIÓN 2026-06-16

### Paso 4 del importer — estados visuales del form con discriminated union

Cerrado el Paso 4: el form de `/imports/ventas` ahora modela sus cuatro
estados visuales (idle → procesando → éxito → error) con un solo `useState`
tipado como **discriminated union**, en vez de flags booleanos sueltos.
Territorio nuevo para Carlos (primera vez escribiendo una unión + narrowing);
escribió la mayor parte del código guiado por preguntas. Un solo commit
(código de una pieza conceptual que toca dos archivos):
`feat(imports): estados visuales del form con discriminated union`.

**El problema de los flags sueltos (por qué NO tres booleanos).**
La tentación era agregar `loading` al lado de `result`/`error` que ya tenía
el form. Tres booleanos independientes = 2×2×2 = **8 combinaciones**, pero la
UI solo tiene **4 estados reales**. Las 4 combinaciones sobrantes son estados
imposibles (cargando Y éxito a la vez, éxito Y error a la vez, etc.) que
NADA en el tipo impide construir — solo se evitan apagando flags a mano
(justo lo que hacían los `setError(null); setResult(null)` del arranque).
Cada flag nuevo agrega más apagados manuales que mantener, y el día que se
olvide uno, la pantalla muestra algo incoherente sin que nadie avise.

**La solución — estados imposibles, irrepresentables.** Un solo valor que
solo puede ser UNO de cuatro objetos, cada uno con su etiqueta (`status`) y
solo los datos que ese caso tiene:

```typescript
// app/imports/ventas/types.ts
export type FormState =
  | { status: "idle" }
  | { status: "procesando" }
  | { status: "exito"; result: ImportResult }
  | { status: "error"; mensaje: string };
```

Principios que cristalizaron:

- **2×2×2, no 2+2+2.** Flags independientes multiplican combinaciones, no
  suman. N booleanos = 2^N estados representables; si el dominio real tiene
  menos, la diferencia son estados basura que hay que tapar a mano.
- **Cada caso carga SOLO su dato.** `idle`/`procesando` van vacíos (no pasó
  nada todavía). `exito` trae el `ImportResult` que devuelve la action.
  `error` trae solo el `mensaje` (cuando falla NO hay job — el throw de
  idempotencia salta antes de `createImportJob`, así que no hay `importJobId`
  que mostrar). Meter todos los campos en todos "por las dudas" es el
  anti-patrón que esto mata.
- **Reusar `ImportResult` adentro del caso `exito`** (`result: ImportResult`),
  no repetir `importJobId`/`processedCount` sueltos. Una fuente de verdad: el
  día que la action devuelva un campo más, se toca SOLO `ImportResult` y el
  caso `exito` lo hereda. (Mismo principio "imports/tipos honestos" sección 12.)
- **Narrowing por el discriminante.** En el JSX, `form.status === "exito"`
  hace que TS sepa, DENTRO de ese bloque, que `form.result` existe — y deja
  leerlo sin queja. Pero `form.result` en el bloque `idle` NO compila
  ("result no existe en ese estado"). El tipo obliga a chequear antes de tocar
  el dato; los typos de etiqueta (`"exitooo"`) y los campos faltantes tampoco
  compilan. La red completa.

**El `handleSubmit` con estado único.** Desaparecieron los dos `setX(null)`
del arranque (ya no hay nada que sincronizar): `setForm({ status: "procesando" })`
antes del `await`, `setForm({ status: "exito", result: res })` si vuelve bien,
`setForm({ status: "error", mensaje })` en el catch. El estado inicial es
`{ status: "idle" }` — el "vacío" vive DENTRO de la unión, sin `| null`
(que habría dado dos formas de decir "nada": `null` y `"idle"`).

### Verificación en vivo — las cuatro ramas

Las cuatro se vieron en pantalla en `localhost:3000/imports/ventas`:

- **idle** → "Selecciona un archivo" al entrar. ✓
- **procesando** → **NO se alcanza a ver** en imports chicos (~102 filas,
  lectura local en decenas de ms): el `setForm({procesando})` y el
  `setForm({exito/error})` que lo apaga ocurren casi al instante → parpadeo
  por debajo del umbral perceptible. Refutó la predicción de Carlos ("la
  alcanzaría a ver"); el cronómetro real manda, no la intuición. ✓ (ver deuda)
- **error** → idempotencia del core (subir el 27/05 ya importado) viajó hasta
  la rama `error` nueva y se pintó con `form.mensaje`. ✓
- **exito** → tras liberar el 27/05, "Import Ok - ImportJob 22, 102 movements
  creados", leído con `form.result.importJobId`/`form.result.processedCount`. ✓

**Liberar el 27/05 (repaso del aprendizaje 06-15):** se borraron en Studio
los 102 `InventoryMovement` con `referenceId="21"` **Y** el ImportJob 21.
Borrar solo el job dejaría 102 movements huérfanos → al reimportar, 204.
Confirmado: no hay `onDelete: Cascade` (tablas ligadas solo por `referenceId`
string, sin `@relation`). **ImportJob 22, no 21:** SQLite no recicla el
autoincrement al borrar la fila (fenómeno ya visto).

### Deuda chica nueva

- **Spinner / feedback de "procesando" para imports lentos.** Hoy el
  "procesando" es un parpadeo invisible en archivos chicos (de un día). El
  código está bien (las 4 ramas funcionan); NO es un bug. Pero el día que un
  import tarde (archivo grande, servidor legacy lento, día de muchas ventas),
  el usuario podría darle "Subir" dos veces creyendo que no pasó nada (la
  idempotencia lo salva de duplicar, pero la UX confunde). Resolverlo con un
  spinner y/o deshabilitar el botón mientras `status === "procesando"`.
  **Diferido al polish visual** ("poner bonita la app"), no urgente.

### Estado al cierre

Paso 4 cerrado, las 4 ramas verificadas en vivo. Discriminated union +
narrowing entendidos y escritos por Carlos (concepto nuevo). Sin trabajo a
medias. 1 commit pusheado.

**Próxima sesión — candidatos (del bloque del importer y deuda viva):**

- **Paso 5 — refrescar la vista tras import:** `revalidatePath("/sales")` en
  la action para que el Server Component relea la DB y la tabla `/sales` se
  actualice sola tras un import exitoso (hoy hay que recargar a mano).
- **Paso 6 — validador "archivo no regresivo":** rechazar un archivo con
  `snapshotDate`/fecha más vieja que el último ImportJob COMPLETED. Cobra
  sentido sobre todo cuando Jesús suba archivos solo.
- **Polish visual** (incluye el spinner de la deuda de hoy): estados
  idle→procesando→✓/X con feedback visible, no texto pelón.
- Probar el happy path con un **día nuevo** de Jesús (estrena la convención
  diaria real; hoy se probó con el 27/05 liberado a mano).
- **Columna de rotación en `/inventory`** (ya hay movements de venta;
  research previo: qué significa la columna `ROTACION` del legacy).

**Deuda viva de antes:** log "movements creados" en existencias (cuenta
tuplas); `snapshotDate` reusado para fecha de venta (nombre); columnas
huérfanas (deuda C); validación de TOT en ventas (descartada, no se reabre);
convención de Detalle de Ventas diario con Jesús.

## ACTUALIZACIÓN SESIÓN 2026-06-16 (cont. — sello de scope del MVP)

Sesión de scope, NO de código. Antes de seguir construyendo, se selló qué
entra al MVP y qué se posterga, partiendo de la pregunta que destraba todo:
**¿qué hace Jesús el día 1 que usa Sentinel sin llamar a Carlos?**

### La pregunta que cierra el scope: el día 1 de Jesús

Caminado paso a paso (no asumido). El día a día operativo de Jesús se reduce
a **dos flujos de subida + dos vistas**, sin intervención de Carlos:

1. **Sube ventas del día** (diario) → importer con botón, ya construido.
2. **Sube existencias** (semanal — confirmado con Jesús esta sesión) →
   importer con botón, POR CONSTRUIR (gemelo del de ventas).
3. **Mira `/sales`** (qué se vendió) y **`/inventory`** (stock actual) → ya viven.

### Tres flujos colapsaron a dos: compras queda fuera (re-confirmado)

Carlos planteó un tercer flujo (entradas/compras, vía archivo COMPRAS o vía
re-sacar existencias). Colapsado a cero flujos nuevos por la razón ya
registrada en 8.4, re-confirmada y todavía cierta:

- Jesús captura cada lote en INVENSHOES al recibirlo → el **próximo snapshot
  de existencias ya trae las entradas adentro**. COMPRAS no aporta nada
  operativo (solo dato financiero, que no es lo que Sentinel resuelve).
- Las dos opciones de Carlos eran en realidad la misma: "sacar existencias
  para ver los nuevos" ES el flujo de existencias recurrente. No hay flujo de
  compras separado.

### Existencias es RECURRENTE, no "una sola vez" (corrección de supuesto)

Supuesto inicial de Carlos: existencias se sube una vez. Refutado caminando
la consecuencia: el parser de ventas escribe SOLO `InventoryMovement`, NUNCA
`InventoryPosition` (decisión central, sesión 2026-06-02). Entonces un día de
ventas NO baja las posiciones; sin re-subir el snapshot, `/inventory` se
desactualiza contra la realidad física de la tienda. Por eso existencias es
semanal, no único. (Y ese mismo snapshot semanal trae las entradas gratis —
de ahí que compras no haga falta.)

### Cadencias selladas

- **Ventas → diario.** Un Detalle de Ventas por día = un día = una fecha de
  movement (convención ya registrada, sesión 2026-05-29).
- **Existencias → semanal.** Confirmado con Jesús esta sesión.

### MVP — qué ENTRA (lista para tachar)

1. **Importer de ventas con botón** — Pasos 1-4 hechos. Falta:
   - **Paso 5:** `revalidatePath("/sales")` tras import exitoso (refrescar la
     vista sola, hoy hay que recargar a mano).
   - **Paso 6:** validador "archivo no regresivo" (rechazar archivo con fecha
     más vieja que el último ImportJob COMPLETED). Diseñar con la cabeza
     puesta en que se reusa para existencias (comparan fechas distintas:
     ventas la fecha de venta, existencias el `snapshotDate`).
2. **Importer de existencias con botón** — POR CONSTRUIR. Gemelo del de
   ventas, semanal. Reusa el molde de Server Action ya clavado (core
   reusable + estados con discriminated union + refresh + validador).
3. **Vistas `/inventory` y `/sales`** — ya viven.

### MVP — qué se POSTERGA

- **COMPRAS / entradas** — fuera. Las entradas viajan en el snapshot de
  existencias.
- **Columna de rotación en `/inventory`** — hay datos de venta, pero requiere
  research previo (qué significa la columna `ROTACION` del legacy) + queries
  de agregación. Post-MVP.
- **Polish visual** — spinner de "procesando" (deuda de hoy), estados bonitos
  idle→procesando→✓/X con feedback visible.
- **Productos no-zapato** (talla categórica) — deuda diferida de Fase 8.
- **Kardex como import masivo** — inviable (1x1); queda como drill-down futuro.
- **Devoluciones explícitas en ventas** (`DEV.`/`IMP. DEV.`) — modelar como
  `IN` compensatorios, post-MVP.
- **Deuda chica viva** — log "movements creados" en existencias (cuenta
  tuplas); `snapshotDate` reusado para fecha de venta (nombre); columnas
  huérfanas (deuda C); validación de TOT en ventas (descartada, no se reabre).

### Orden de ataque acordado (consejo de Claude, aceptado por Carlos)

Cerrar ventas ANTES de clonar a existencias — para no tener dos importers a
medias y diseñar el validador (Paso 6) una sola vez bien antes de duplicar:

1. **Paso 5 (refrescar `/sales`)** — chico, bajo riesgo, cierra el lazo visual.
2. **Paso 6 (validador no-regresivo)** — el de jugo de diseño; la red que
   importa cuando Jesús sube solo. Pensarlo reusable para existencias.
3. **Probar happy path con un DÍA NUEVO de Jesús** — hoy solo se probó
   liberando el 27/05 a mano. El primer archivo real de un día no tocado
   estrena la convención diaria; si algo se rompe, que se rompa en el flujo
   ya conocido, no en el gemelo nuevo.
4. **Importer de existencias con botón** — clonar el molde completo y ajustar
   diferencias. El salto técnico grande (Server Actions + upload + mutación)
   ya está dado en ventas.

### Estado al cierre

Scope del MVP sellado. Próximo bloque de código: **Paso 5 —
`revalidatePath("/sales")` en la action de ventas**.

## ACTUALIZACIÓN SESIÓN 2026-06-18

Sesión de código: cerrados **Paso 5** (refrescar `/sales` tras import) y
**Paso 6** (validador no-regresivo) del importer de ventas, más el happy path
verificado con un día genuinamente nuevo. Dos commits de código separados.

### Paso 5 — `revalidatePath("/sales")` en la action de ventas

`app/imports/ventas/actions.ts`: una línea `revalidatePath("/sales")` después
del `await runVentasImport(...)`, antes del `return`. Commit:
`feat(imports): revalida /sales tras un import de ventas exitoso`.

**Qué hace y qué NO hace (aclarado en sesión, era confusión, no bug):**

- `revalidatePath` NO empuja nada a una pestaña abierta. NO actualiza en vivo
  una pantalla que ya está renderizada y quieta. No es push/websocket/sondeo
  (lo que Carlos llamó "webhook" al principio — descartado, no es eso).
- Lo que hace: **invalida el caché** de `/sales`. La PRÓXIMA vez que alguien
  navegue a `/sales` (clic en link, o llegar a la página de nuevo), Next no
  tiene la versión cacheada → la re-renderiza desde cero → relee la DB →
  aparecen las ventas nuevas. Es "fresco en la próxima navegación", no "se
  actualiza solo en pantalla".
  **Por qué va DESPUÉS del `await`, no antes (aprendizaje del signo/orden):**
  invalidar el caché es decir "la próxima lectura traerá algo mejor" — y eso
  solo es cierto si el algo mejor YA está escrito. Si `revalidatePath` corre
  ANTES de `runVentasImport`, se tira el caché cuando los movements todavía no
  están en la DB; una lectura en ese hueco re-cachea la versión vieja. Regla:
  **se invalida el caché DESPUÉS de que el dato nuevo ya existe, nunca antes.**
  Como va después del `await`, si el import tira (idempotencia/validador), el
  throw corta antes y el revalidate naturalmente NO se ejecuta — no hay nada que
  refrescar, correcto. No hay que excluir el error a mano; el throw ya corta.

**F5 vs navegar (por qué el revalidate vale la pena aunque "igual recarga"):**

- **F5 / recarga dura:** el navegador tira TODA la página y la pide de cero
  (HTML, CSS, JS). Pesado, parpadeo, pantalla en blanco.
- **Navegar (clic en link interno):** Next NO tira todo; mantiene la app
  cargada y pide solo el pedazo que cambió. Con el revalidate, ese pedazo
  viene fresco de la DB. Transición suave, sin parpadeo.
- Sin el revalidate, navegar a `/sales` daría la versión cacheada vieja.
  Con él, navegar trae lo nuevo. Jesús no escribe URLs ni da F5 — clickea
  links; esos clics son navegación, y el revalidate los hace traer datos
  frescos.
  **Lección de proceso (Claude falló, registrado):** el ejemplo que Claude usó
  para presentar el Paso 5 ("Jesús tiene `/sales` en una pestaña, importa en
  otra, vuelve a la primera") apuntaba al ÚNICO caso que el revalidate NO
  resuelve (pestaña abierta y quieta). Eso mandó a Carlos a probar cambiando de
  pestaña, que nunca puede funcionar, y costó media sesión persiguiendo un bug
  inexistente. El código del Paso 5 siempre estuvo bien. Verificación correcta =
  navegar de cero, no cambiar de pestaña. **Para futuras sesiones: marcar
  explícito el cambio de fase ("esto ya es código, editamos tal archivo") antes
  de mandar a tocar nada — Claude lo hizo sin avisar y generó frustración.**

### Paso 6 — Validador "archivo no regresivo"

`scripts/import-ventas.ts`, dentro de `runVentasImport`, JUSTO DESPUÉS del
bloque de idempotencia. Commit:
`feat(imports): validador no-regresivo en el import de ventas`.

**Las cuatro decisiones de diseño (todas razonadas por Carlos):**

1. **Compara contra el último ImportJob COMPLETED del mismo `source`.** No
   contra cualquiera: un FAILED no cuenta (si contara, un import que explotó
   bloquearía el reintento). Solo COMPLETED.
2. **Filtra por `source`** (`legacy_sales`) → cada importer compara contra los
   SUYOS. Reusable para existencias sin cambios: existencias pasará su propio
   source y comparará snapshots de existencias contra snapshots de existencias,
   nunca peras con manzanas. (Mismo campo que usa la idempotencia y `/sales`.)
3. **Sin imports previos → pasa** (arranque vacío; no hay contra qué comparar).
4. **Rechazo con `<` ESTRICTO**, no `<=`. El caso de igualdad (mismo día) se le
   deja a la IDEMPOTENCIA, que ya lo cubre. Razón conceptual: "mismo día" es un
   DUPLICADO (ya lo importaste), no un RETROCESO (ir a un día anterior). Cada
   defensa con una responsabilidad limpia: idempotencia agarra el duplicado, el
   no-regresivo agarra el retroceso. Principio: **no metés una defensa a hacer
   el trabajo de otra solo porque "de paso podría"** — el `<=` funcionaría pero
   ensucia responsabilidades. Primo del meta-aprendizaje de la validación de
   TOT (saber qué NO abarcar).
   **Implementación — `findFirst` + `orderBy desc` = "el más reciente":**

```typescript
const lastSales = await prisma.importJob.findFirst({
  where: { source: "legacy_sales", status: "COMPLETED" },
  orderBy: { snapshotDate: "desc" },
});
const lastSalesDate = lastSales?.snapshotDate;
if (lastSalesDate && movementDate < lastSalesDate) {
  throw new Error(`Este import tiene una fecha de ${movementDate} ...`);
}
```

- SIN `snapshotDate` en el `where` (no se busca una fecha exacta como la
  idempotencia, se busca entre todos). `orderBy snapshotDate desc` + `findFirst`
  = toma el primero de la lista ordenada = el más nuevo. Truco general: para
  "el máximo según un campo" en Prisma, `findFirst` + `orderBy desc`.
- **Bug de signo cazado por Carlos leyendo en voz alta** (igual que el de
  `quantityDelta`): la primera versión decía `lastSalesDate < movementDate`
  ("si el último es menor que el entrante → antiguo"), que es al revés.
  Probado con números (último 27/05, entrante 26/05): `27 < 26` es falso →
  NO rechazaba el viejo. Corregido a `movementDate < lastSalesDate` ("si el
  entrante es menor que el último → antiguo"). El `&&` con `lastSalesDate`
  protege del null (corta antes de comparar si no hay último).
- **Posición libre, elegida por legibilidad:** va después de la idempotencia.
  Los dos chequeos son INDEPENDIENTES (ninguno necesita que el otro corra
  primero; cualquiera que falle aborta antes de escribir nada), así que el
  orden no cambia el resultado — se ponen juntos para que se lean como un
  bloque de abortos. Distinción importante: la elección es de ESTILO, no de
  dependencia.
  **Cómo probar el rechazo sin esperar archivo viejo (truco registrado):**
  para forzar que el VALIDADOR (no la idempotencia) agarre un archivo, se puede
  editar en Prisma Studio el `snapshotDate` de un ImportJob a una fecha
  POSTERIOR — así la idempotencia no lo encuentra por fecha exacta y el
  no-regresivo lo caza. Es data sucia de prueba: revertir después. (No se usó:
  Jesús pasó archivos reales del 24/05 y 28/05.) **Dato nuevo: Prisma Studio
  permite EDITAR celdas sueltas, no solo mirar/borrar.**

### Verificaciones (3 escenarios, todas pegaron a la predicción)

- **Rechazo no-regresivo (24/05 contra 27/05 existente):** el validador agarró
  el 24/05 (no la idempotencia, que no encontró 24/05 exacto). Mensaje nuevo
  en pantalla con las dos fechas. CERO movements del 24/05; `/sales` siguió
  mostrando solo 27/05. El throw cortó antes de `createImportJob`.
- **Idempotencia (mismo 27/05):** ya conocida de sesiones previas; la
  idempotencia corta ANTES de llegar al validador (throw del duplicado). No
  ejercita el código nuevo — por eso no se re-probó, se saltó conscientemente.
- **Happy path con día NUEVO (28/05):** primer éxito con un día genuinamente
  no tocado. ImportJob 26 COMPLETED, **112 movements** (NO 102 — el 28/05 es
  otro día con su propia cantidad de ventas; Carlos predijo bien que el número
  podía diferir). `/sales` mostró 28/05 arriba, 27/05 abajo.
  **Tres cosas verificadas en la prueba del 28/05 de una vez:**

1. Happy path del importer con día nuevo (estrena la convención diaria real).
2. **Paso 5 confirmado en flujo real:** tras el `POST`, el `GET /sales`
   trajo el 28/05 SIN F5 — navegando alcanzó. Ayer no se pudo ver limpio por
   el lío de pestañas; hoy sí. El revalidate hace su trabajo.
3. **`orderBy: movementDate desc` ordenando de verdad por primera vez:** con
   dos días en la tabla (27 y 28), el más nuevo sube. Antes, con todo en
   27/05, el `desc` no tenía nada que desempatar.

### Deuda chica

- **Mensaje del validador imprime `Date` crudo.** `${movementDate}` y
  `${lastSalesDate}` salen como `Sun May 24 2026 00:00:00 GMT-0600 (...)` en
  vez de `dd/MM/yyyy`. Funciona pero es feo para Jesús. Fix: `format(date,
"dd/MM/yyyy")` de date-fns. Carlos lo dejó consciente; visto en vivo en la
  pantalla de error. Va con el polish visual post-MVP.
- **El borrado del `console.log("Fecha de venta")`** (residuo del Paso 5, se
  metió ayer y no se sacó al cerrar) quedó en el commit del validador, no en
  el del Paso 5. Higiene de commits imperfecta, no se separó (ya estaba todo
  junto; separar valía menos que seguir). Notado.

### Estado al cierre

Importer de ventas COMPLETO end-to-end: Pasos 1-6 cerrados + happy path con
día nuevo + ambos caminos de error (idempotencia + no-regresivo) probados con
archivos reales. Sin trabajo a medias. 2 commits de código de esta sesión
(Paso 5, Paso 6) — confirmar si pusheados.

**Del MVP sellado, queda UN bloque grande:**

- **Importer de existencias con botón** — gemelo del de ventas, semanal.
  Reusa el molde completo ya clavado: core reusable (workbook → resultado),
  Server Action + upload, estados con discriminated union (`FormState`),
  `revalidatePath` (de `/inventory` en vez de `/sales`), y el validador
  no-regresivo (que comparará `snapshotDate` de existencias = fecha de
  IMPRESIÓN del reporte, no Fecha Final como ventas). El salto técnico grande
  (Server Actions) ya está dado; esto es clonar y ajustar diferencias.
  Diferencia clave de fecha: ventas guarda Fecha Final (día de la venta);
  existencias guarda la fecha de impresión del header (el reporte de
  existencias no tiene campo de fecha de evento). El validador ya está
  diseñado para esto vía el filtro por `source`.
  **Deuda viva de antes (post-MVP):** columna de rotación en `/inventory`
  (research previo: qué significa `ROTACION` del legacy); log "movements creados"
  en existencias (cuenta tuplas, no movements); `snapshotDate` reusado para fecha
  de venta (nombre); columnas huérfanas (deuda C); spinner de "procesando" para
  imports lentos; productos no-zapato; devoluciones explícitas; segundo criterio
  de orden ya hecho. Validación de TOT en ventas: DESCARTADA, no se reabre.
  Operativo: convención de Detalle de Ventas diario con Jesús (en marcha — ya
  pasó archivos de varios días).

## ACTUALIZACIÓN SESIÓN 2026-06-22

### Importer de existencias con botón — COMPLETO. Último bloque del MVP sellado.

Construido el gemelo del importer de ventas para existencias: Server Action +
upload + estados con discriminated union + `revalidatePath` + validador
no-regresivo. El salto técnico grande (Server Actions) ya estaba dado en
ventas; esto fue clonar el molde y ajustar las diferencias. 4 commits de código
separados por responsabilidad.

### Refactor del parser de existencias a core reusable

`scripts/import-existencias.ts`: extraído `runExistenciasImport(workbook,
fileName): Promise<ExistenciasImportResult>` del `main()`, idéntico molde al
Paso 2 de ventas. El core recibe el **workbook** (lo primero que ambos
llamadores producen), no la ruta (solo CLI) ni los bytes (solo action), y
**devuelve** `{ importJobId, processedCount }` en vez de imprimir. `main()`
adelgazó a argv → `readWorkbook` → core → imprimir. `createImportJob` renombró
`filePath → fileName`.

- **Guard `import.meta.url`** agregado (= Paso 3 de ventas): el
  `main().catch().finally()` estaba suelto al nivel del módulo y se
  autoejecutaría apenas la action hiciera `import` → reventaría con "falta el
  argumento" (no hay `process.argv[2]` en el server). Envuelto en
  `if (import.meta.url === pathToFileURL(process.argv[1]).href)`.

### Bug `XLSX.readFile is not a function` — y el mismo bug latente en ventas

Al correr la CLY tras cambiar a `import * as XLSX` (namespace, por Turbopack),
`readWorkbook` tronó: `XLSX.readFile is not a function`.

- **Causa:** `readFile` lee de **disco** (necesita `fs`), así que el módulo
  "core" de `xlsx` que trae el namespace import —pensado también para
  browser/bundler, donde no hay disco— **no lo incluye** → `undefined`. Lo que
  sí trae siempre es `XLSX.read` (parser en memoria, sobre bytes), el mismo que
  usa la action.
- **Fix:** `readWorkbook` pasa a `readFileSync(filePath)` →
  `XLSX.read(buffer, { type: "buffer" })`. Esto le da coherencia total al
  diseño: **disco → bytes → `XLSX.read`** en CLI, **upload → bytes →
  `XLSX.read`** en action. Los dos lados pasan por bytes; `readFile` era el
  único que leía "mágico" del disco, y ya no está disponible con el namespace.
- **Aprendizaje general:** si un build/runtime error aparece solo bajo el
  namespace import (o solo bajo Turbopack) pero andaba con el default import (o
  con `tsx`), sospechar qué partes del paquete se incluyen en el build de
  browser vs node. `readFile` es node-only; `read`/`utils`/`WorkBook` están en
  ambos.
- **Ventas tenía el MISMO bug latente:** su `readWorkbook` también usaba
  `XLSX.readFile`. No había mordido porque ventas, tras el Paso 3, solo se
  corre por **navegador** (que usa `XLSX.read` sobre bytes y nunca toca
  `readFile`); la CLI de ventas se hubiera roto igual. Emparejado en un commit
  `fix` separado. Los dos parsers quedaron gemelos: namespace import +
  `readFileSync` → `XLSX.read`.

### Validador no-regresivo en existencias

Misma forma EXACTA que el de ventas (`findFirst` + `orderBy: { snapshotDate:
"desc" }`, comparación con `<` estricto, `&&` que protege del null). Slotea
antes de `createImportJob`, así un archivo rechazado no deja un job RUNNING
colgado. Lo único que cambia es el `source` → `legacy_inventory`.

- **Diferencia de fecha vs ventas:** existencias compara la fecha de
  **IMPRESIÓN** del header (`Impresión: DD/MM/YYYY HH:MM`, vía
  `extractSnapshotDate`/`parseSnapshotDate`), no Fecha Final. El reporte de
  existencias no tiene fecha de evento; su tiempo es el de la impresión del
  snapshot. El validador ya estaba diseñado para esto vía el filtro por
  `source` (compara existencias contra existencias, nunca peras con manzanas).
- **Dirección de la comparación (bug de signo, cazado leyendo en voz alta como
  en ventas):** `snapshotDate < lastInventoryDate → throw` ("si el entrante es
  más viejo que el último → rechaza"). Verificado con números: entrante 22/05,
  último 29/05 → `22 < 29` verdadero → tira. Caso bueno: 30/05 → `30 < 29`
  falso → pasa. Mismo día: `29 < 29` falso → pasa (lo deja pasar a propósito,
  el delta 0 lo hace inofensivo).

### Idempotencia explícita: NO en existencias (decisión consciente)

Existencias **no** lleva el chequeo de idempotencia que sí tiene ventas.

- **Razón — idempotencia natural del delta:** en `persistTuples`, re-subir el
  mismo snapshot da `delta = tuple.quantity - previousQuantity` = mismo − mismo
  = **0** en cada tupla, y el `if (delta !== 0)` no crea movement. Cero
  movements; las posiciones se upsertean a los mismos valores. La red ya está
  integrada en el delta. Ventas crea OUTs sin comparar contra nada → por eso
  allá hizo falta el chequeo explícito; acá no.
- **Deuda consciente aceptada (no descuido):** re-subir el mismo snapshot crea
  un ImportJob COMPLETED **redundante** con 0 movements. Una fila de auditoría
  de más, nada roto. El día que moleste, ahí se agrega idempotencia; hoy no
  hace falta.
- El `<` estricto del validador (no `<=`) es coherente: deja pasar igual-o-más-
  nuevo. Un snapshot más nuevo del mismo día (Jesús regeneró el reporte a la
  tarde) DEBE actualizar posiciones; un re-run idéntico es inofensivo. Con
  `<=` se bloquearía el re-run, metiendo el validador a hacer de anti-
  duplicado — justo lo que el 18 se decidió no mezclar.

### Carpeta `app/imports/existencias/` (gemelo de ventas)

Cuatro archivos calcados de `app/imports/ventas/`. Diferencias reales vs
ventas (lo que no se puede copiar a ciegas entre gemelos):

- `actions.ts`: llama `runExistenciasImport`, y `revalidatePath("/inventory")`
  — la vista que **muestra** el stock, no `/sales`.
- `import-form.tsx`: texto de éxito **"Tuplas procesadas"**, no "movements
  creados". En existencias `processedCount` son tuplas, NO movements (mismo
  snapshot → 9660 tuplas, 0 movements). En ventas SÍ son movements (cada tupla
  es un OUT), así que el texto de ventas que dice "movements" está bien. Misma
  mentira del log del parser, evitada en la UI.
- `types.ts`, `page.tsx`: idénticos salvo nombres.
- **Bug evitado — `revalidatePath("/existencias")`:** primera versión apuntaba
  a una ruta que **no existe** (no hay `app/existencias/`; la vista de stock es
  `app/inventory/`). El revalidate **no tira error** con ruta inexistente —
  refrescaría la nada en silencio, y `/inventory` mostraría datos viejos hasta
  un F5 manual sin avisar. Corregido a `/inventory`.
- **Distinción clavada:** `/imports/existencias` = página donde se **sube** el
  archivo (form). `/inventory` = página donde se **ve** el stock (tabla). Rutas
  separadas; el revalidate apunta a la de la vista, no a la del form.

### Deuda matada: log "movements creados" en existencias

La deuda viva "log que cuenta tuplas, no movements" del `main()` viejo de
existencias **dejó de existir** esta sesión: al mover el cuerpo al core (que
devuelve en vez de loguear) y poner la etiqueta honesta `Tuplas procesadas:` en
el `main()` nuevo, el log mentiroso desapareció. Una menos en la lista.

### Límite de body de Server Actions: 1 MB → 10 MB

Al subir existencias por navegador: `Error: Body exceeded 1 MB limit`
(`statusCode: 413`). Las Server Actions de Next tienen tope default de **1 MB**
en el body. El archivo de existencias multi-sucursal pesa **2.25 MB** → se
pasa. Ventas nunca lo pisó (archivo de un día, < 1 MB) — primera vez que se
sube un archivo grande por navegador.

- **No es bug de código** — parser, action y form estaban bien. Es config de
  Next que hay que levantar.
- **Fix (`next.config.ts`):**

```typescript
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};
```

Valor es string con unidad (`"10mb"`, no `10`). Anidado en `experimental` en
Next 16. Puesto en 10mb (no justo en 3) para dar aire al crecimiento del
catálogo sin ser infinito.

- **Requiere reiniciar el dev server** — la config no recarga en caliente.
- **Aprendizaje:** el 413 muere en la capa HTTP de Next **antes** de que corra
  el código → `runExistenciasImport` nunca se ejecuta, `createImportJob` nunca
  se llama, **no quema id de autoincrement**. Distinto del borrado manual de
  ImportJobs (donde el INSERT sí había pasado, por eso el id quedaba quemado).
  El autoincrement de SQLite solo avanza cuando un INSERT realmente ocurre.

### Performance: 41 segundos por import

El import por navegador tardó **41s** (`application-code: 41s`): parseo de 4594
productos + 9660 upserts de posición. Consecuencias:

- El estado `procesando` que en ventas era un parpadeo invisible, en
  existencias **se ve 40 segundos**. Esto le da peso real a la deuda del
  spinner (en ventas era cosmética; acá el usuario se queda mirando). Sigue
  post-MVP, pero ahora importa de verdad.
- **Doble-submit más probable:** 40s es tiempo de sobra para que Jesús piense
  "no pasó nada" y reintente. La idempotencia natural lo salva de romper datos,
  pero refuerza por qué deshabilitar el botón mientras `status ===
"procesando"` pesa más acá que en ventas.
- **Tolerable para el MVP** — 41s una vez por semana está bien. Solo medido.

### Verificaciones

- **CLI** (`pnpm tsx scripts/import-existencias.ts ...`): ImportJob 27
  COMPLETED, 9660 tuplas, **0 movements** (`referenceId="27"` → 0 filas). El
  validador pasó (`29 < 29` falso).
- **Navegador** (`/imports/existencias`): ImportJob 28 COMPLETED, 9660 tuplas,
  **0 movements** (`referenceId="28"` → 0 filas), pantalla en rama `exito`
  ("Import Ok - ImportJob 28, 9660 Tuplas procesadas").
- Ambas corridas sobre el **mismo snapshot ya cargado** → 0 movements
  (idempotencia natural demostrada dos veces). "Éxito" acá = "el import corrió
  completo sin errores", NO "entró stock nuevo" — las dos cosas conviven.
- **Pendiente de verificación:** el importer haciendo algo **visible**
  (movements ≠ 0) requiere un snapshot **más nuevo** con stock distinto, que
  hoy no existe (el legacy tendría que regenerar el reporte otro día). Anotado
  igual que el día-nuevo de ventas en su momento.

### Estado al cierre — MVP sellado COMPLETO en código

El MVP definido en la sesión 2026-06-16 quedó **completo en código**:

- ✓ **Importer de ventas con botón** (Pasos 1-6, sesiones previas).
- ✓ **Importer de existencias con botón** (esta sesión).
- ✓ **Vistas `/inventory` y `/sales`** (ya vivían).

Los dos flujos de subida (ventas diario, existencias semanal) + las dos vistas.
El día 1 de Jesús —sube ventas, sube existencias, mira stock y mira ventas, sin
llamar a Carlos— está cubierto.

**Commits de la sesión (4 de código, pusheados):**

- `fb599b3 feat(imports): core reusable runExistenciasImport + validador no-regresivo`
- `223e1ff fix(imports): readWorkbook de ventas lee bytes en vez de XLSX.readFile`
- `0e63ea7 feat(imports): importer de existencias con boton (carpeta completa)`
- `b3c215d chore(config): sube bodySizeLimit de Server Actions a 10mb para existencias`

**Pendientes post-MVP (deuda viva):**

- **Polish visual / spinner** — ahora con peso real (41s de "procesando"
  visible en existencias). Deshabilitar el botón mientras `status ===
"procesando"`, estados bonitos con feedback.
- **Mensaje del validador imprime `Date` crudo** — en AMBOS parsers
  (`${snapshotDate}`, `${movementDate}`). Fix: `format(date, "dd/MM/yyyy")`.
- **Verificación con dato real:** importer de existencias con un snapshot nuevo
  (movements ≠ 0); happy path de ventas con día nuevo de Jesús (en marcha).
- **Operativo:** convención con Jesús — existencias semanal + ventas diario.
- Deuda chica de antes: columna de rotación en `/inventory` (research previo:
  qué significa `ROTACION` del legacy); `snapshotDate` reusado para fecha de
  venta (nombre); columnas huérfanas (deuda C); productos no-zapato;
  devoluciones explícitas (`DEV.`/`IMP. DEV.`).

## ACTUALIZACIÓN SESIÓN 2026-06-23 (scope — mapa de pantallas y usuarios, pre-navegación)

Sesión de scope/diseño, NO de código. Con el MVP cerrado en código (sesión
2026-06-22), el foco cambió de "tubería" (parsers, imports) a "producto": qué
pantallas hacen a Sentinel usable para sus dos usuarios reales. Se cerró el
**mapa completo de pantallas** y el **reparto por usuario**, como paso previo a
diseñar el esqueleto de navegación. Auth/permisos: diferidos conscientemente.

### El cambio de fase: de tubería a producto

Con la data entrando y guardándose bien (los dos importers + las dos vistas), la
pregunta dejó de ser técnica. Lo que sigue es hacer la app **usable** — UX y
navegación, no parsing. Distinción de método sellada: primero **diseñar el mapa**
(qué pantallas, cómo se agrupan, quién ve qué) — cero código — y recién después
construir layout/menú/rutas. Construir pasillos antes de saber qué cuartos hay es
el error a evitar.

### Los dos usuarios (perfiles afinados esta sesión)

- **Jesús — operador.** Vive en el DETALLE y ALIMENTA el sistema. Sube los
  archivos (ventas diario, existencias semanal) y consulta. Necesita operar el
  inventario y detectar descuadres ("que no se roben nada").
- **Tío — dueño, mobile, SOLO lectura.** Vive en el RESUMEN y solo MIRA. No sube
  nada. Es quien hace los pedidos a proveedores (Charly, Nike, Adidas...).
  Necesita entender el negocio de un vistazo desde el celular. (Confirmado
  hablando con él esta sesión — es el usuario que más va a usar el programa, su
  experiencia pesa.)

Las dos necesidades casi no se pisan: detalle+alimentar vs resumen+mirar. Esa
separación limpia es la que define la navegación.

### Capacidad nueva, la más valiosa del proyecto: "cuándo resurtir"

El tío pidió ver **cuándo un zapato se va a acabar**, para decidir cuándo
resurtir. NO es una pantalla más — es una capacidad que **el legacy NO tiene** y
que hoy el tío resuelve adivinando a mano. Mueve plata real: es lo que le dice
qué pedirle a cada proveedor.

- **El dato ya existe entero:** stock actual (`InventoryPosition`) + ritmo de
  venta (movements `OUT` que ahora se importan). "Se va a acabar" = poco stock +
  sale rápido.
- **Es la columna de ROTACIÓN diferida, con otro nombre.** "Rotación" y "cuándo
  resurtir" son la misma pregunta. Lo fichado como deuda post-MVP resulta ser la
  feature estrella del dashboard del tío.
- Si algo justifica que Sentinel exista más allá de "una vista más linda del
  legacy", es esto.

### Mapa completo de pantallas (cerrado)

**Ya viven:**

- `/imports/ventas` — subir ventas
- `/imports/existencias` — subir existencias
- `/sales` — tabla de ventas
- `/inventory` — tabla de stock actual

**Nuevas (TODAS leen data que ya está en la DB — cero tubería nueva):**

- **Historial de movimientos** — qué entró / qué salió por SKU, filtrable. Vista
  calcada de `/sales` pero mostrando TODOS los movements (ventas `OUT` + ajustes
  `IMPORT_SET`), no solo ventas. Sirve doble: operar Y detectar mermas (vendiste
  3 pero el stock bajó 5 → faltan 2). **Para Jesús.**
- **Dashboard del tío** (mobile-first, lectura). Dos cosas adentro:
  - **Más vendidos / ranking** — `groupBy` producto sobre los `OUT`, suma de
    cantidades, ordenado. Acotado a **histórico total** por ahora (no por
    período, no tendencia — más caros, post-MVP).
  - **Qué se va a acabar / cuándo resurtir** — la estrella (ver arriba).
- **Filtros** en las tablas que ya existen — mejora a `/sales` e `/inventory`
  (por sucursal/fecha/producto), NO una pantalla nueva. Reusa el patrón
  URL-as-state + debounce de la búsqueda de `/inventory`.

### Reparto por usuario

- **Jesús (operador):** subir ventas, subir existencias, ver inventario, ver
  ventas, historial de movimientos.
- **Tío (dueño, mobile):** dashboard de lectura (más vendidos + cuándo resurtir).

### Auth / permisos: DIFERIDOS conscientemente (no descuido)

Decisión: **una sola puerta para todos**, permisos por rol DESPUÉS.

- Auth estaba **explícitamente fuera del MVP** (stack: "no auth compleja").
  Meterlo ahora reabre esa decisión — se reabre y se vuelve a cerrar a
  propósito: sigue fuera de este bloque.
- **Sutileza de secuencia:** "permisos por rol" necesita saber quién es el
  usuario → necesita auth. PERO el esqueleto de navegación y las pantallas NO la
  necesitan. Se construye todo con **todo visible para todos** primero; auth +
  permisos entran como **capa separada después**. El día que se ponga, lo único
  que cambia es QUÉ pantallas le aparecen a quién, no las pantallas en sí.
- Razón de orden: auth es un subsistema entero (login, sesiones, tabla de
  usuarios, middleware). Diferirlo deja avanzar en lo visible/usable sin
  frenarse. ("Ahorita no veo que sea un stopper".)

### Estado al cierre — mapa cerrado, navegación pendiente

Cerrado: el universo de pantallas y a quién sirve cada una. Con auth diferido,
todas cuelgan de una sola puerta.

**Para la PRÓXIMA sesión (conversación aparte):**

1. **Diseñar el árbol de navegación** — cómo se AGRUPAN estas pantallas en un
   menú (¿planas en sidebar? ¿agrupadas por tipo: acciones / consultas /
   dashboard?), cómo se llega de una a otra. Sigue siendo DISEÑO, cero código.
2. **Recién después: construir el layout** en Next (menú, rutas, componente de
   navegación).

Tipos a agrupar: **acciones** (subir archivos), **tablas de consulta** (ventas,
inventario, movimientos), **dashboard** (tío). La primera pregunta de la próxima
sesión es cómo juntarlas para que quien entra encuentre lo que busca.

**Sobre construir el esqueleto:** no toda pantalla candidata tiene que entrar al
primer menú. Puede nacer con las 4 que ya existen + huecos reservados para las
nuevas, llenándolos de a poco. Evitar el menú inflado de pantallas a medio
construir.

## ACTUALIZACIÓN SESIÓN 2026-06-23 (cont. — árbol de navegación cerrado, pre-layout)

Continuación del mismo día. Cerrado el scope de pantallas (entrada anterior),
esta vuelta cerró el **árbol de navegación**: cómo se agrupan las pantallas en
un menú y dónde cae cada usuario. Sigue siendo DISEÑO, cero código. Lo próximo
sí es construir el layout en Next.

### Árbol de navegación (cerrado)

- **Landing (todos):** Dashboard.
- **Acciones:** subir ventas · subir existencias.
- **Consultas:** ventas (`/sales`) · inventario (`/inventory`) · movimientos
  (historial, nuevo).
- **Navegación:** sidebar en PC, hamburguesa en cel (patrones estándar
  responsive; son los correctos para este caso).

### Agrupar por tipo ≈ agrupar por usuario (lo que el reparto destapó)

Los tres grupos son nominalmente "por tipo" (acciones / consultas / dashboard),
pero el reparto en realidad parte por **usuario**:

- **Acciones + Consultas = Jesús.** Escribir (subir archivos) + leer el detalle
  (las tres tablas). Su mundo se parte en dos ramas.
- **Dashboard = tío.** Leer el resumen. Una sola rama.

Casi coinciden los dos criterios; la única asimetría es que el mundo de Jesús se
abre en dos y el del tío es uno solo.

### "Filtros" NO es pantalla (que no se cuele al menú)

Los filtros por sucursal/fecha/producto son una **mejora a las tablas que ya
existen** (mismo patrón URL-as-state + debounce de la búsqueda de `/inventory`),
NO un ítem de menú propio. No va como cuarta consulta. Fichado para no
re-litigarlo.

### Landing única para todos = única opción coherente DADO el no-auth (núcleo)

La decisión "la app siempre abre en el Dashboard" no es el atajo cómodo — es la
**única** opción coherente dada la decisión previa de diferir auth. Razón: sin
login, **la app no sabe quién entró**, no puede distinguir al tío de Jesús. Una
landing personalizada por usuario es literalmente imposible de hacer bien sin
saber quién es, y eso requiere el auth que se difirió. Una sola puerta + una
sola landing no es comodidad: es lo que el no-auth obliga.

Consecuencia conceptual: jubila la pregunta "¿qué ve Jesús al entrar?" como
problema de routing. No hay forma de mandar a uno a un lado y al otro a otro sin
saber cuál es cuál. La pregunta deja de existir hasta que haya auth.

### Routing por dispositivo: considerado y DESCARTADO

Tentación intermedia: como el aparato casi delata al usuario (tío =
mobile/lectura/dashboard; Jesús = PC, porque sube los Excel que exporta del
legacy = trabajo de escritorio), se podría rutear por dispositivo (cel →
dashboard directo, PC → menú). **No se construye.** Agrega lógica frágil para
esquivar algo que igual no se resuelve sin auth, y el peor caso de NO hacerlo es
inofensivo: alguien cae en la pantalla "equivocada" y da un clic, nada se rompe.
Mismo espíritu que "saber qué NO construir".

(Pendiente de confirmar con Carlos: que Jesús opera desde PC — inferido del flujo
de subir archivos, no confirmado explícito.)

### Deuda chica / fichado consciente

- **La acción más frecuente de Jesús —subir el archivo del día— queda a un clic
  de la landing, no ES la landing.** Aceptable: un clic es nada, y el Dashboard
  no es pantalla inútil para él (le da contexto de qué se está moviendo al
  entrar). Decisión consciente, no accidente. Si algún día molesta, se
  reconsidera.

### Estado al cierre — árbol cerrado, layout pendiente

Cerrado: cómo se agrupan las pantallas, dónde cae cada usuario, navegación
responsive. Con auth diferido, todo cuelga de una sola puerta con landing en
Dashboard.

**Pantallas que YA viven:** `/sales`, `/inventory`, `/imports/ventas`,
`/imports/existencias`.
**Faltan construir:** historial de movimientos (consulta nueva para Jesús —
vista calcada de `/sales` pero con TODOS los movements, `OUT` + `IMPORT_SET`, no
solo ventas); dashboard del tío (más vendidos + "cuándo resurtir" = la columna
de rotación con otro nombre, la feature estrella).

**Recordatorio del scope previo:** no toda pantalla candidata entra al primer
menú. El esqueleto puede nacer con las 4 que ya existen + huecos para las
nuevas, llenándolos de a poco. Evitar el menú inflado de pantallas a medio
construir.

**Próximo bloque (ya es código):** construir el layout en Next — componente de
navegación (sidebar PC + hamburguesa cel), rutas, el shell que envuelve las
pantallas. Ahí entra la **skill de frontend-design** (ya disponible en el
entorno, nada que instalar; aplica a la fase visual). Nota de la sesión: esa
skill pesa más en el dashboard del tío (mobile, lectura, el showcase que
justifica el proyecto) que en las tablas utilitarias de Jesús.

## ACTUALIZACIÓN SESIÓN 2026-06-24 (dirección visual elegida — pre-layout)

Sesión de diseño visual, cero código. Con el árbol de navegación cerrado, se
eligió la **dirección visual** del shell antes de construirlo. Claude exploró 4
rumbos como mockups desechables (HTML suelto, NO tocan el repo) — elegir estética
se hace viéndola, no prediciendo; por eso acá Claude produjo todo. El código que
lleve el ganador al Next vuelve al contrato pedagógico de siempre.

### Los 4 rumbos explorados

Mismo contenido en los 4 (mismos KPIs, misma feature estrella "cuándo resurtir") y
el MISMO árbol de navegación — solo cambia la piel. Todos esquivan a propósito los
clichés de diseño autogenerado.

1. **Piso y caja** — claro, cálido, colores de marca (rojo+azul), tarjetas tipo
   etiqueta de caja, corrida de tallas como motivo.
2. **Consola Sentinel** — oscuro, sala de monitoreo, barras de salud de stock +
   franja de vigilancia (frescura del dato + alertas).
3. **Reporte vivo** — claro, editorial, tipografía grande; "cuándo resurtir" como
   número gigante con barra de agotamiento.
4. **Modo Centinela** — homenaje atmosférico al sci-fi de targeting (HUD
   púrpura/magenta, retícula de mira, lenguaje de detección). El centinela escanea
   el inventario y "bloquea" lo que va a agotarse.

### ELEGIDO: Rumbo 4 — "Modo Centinela"

Razón de PRODUCTO, no solo gusto: **el tío (usuario showcase, dueño, mobile) es
fan de los cómics y de X‑Men.** El Easter egg aterriza con el usuario real — para
él lo "cool" ES lo útil; el guiño lo va a disfrutar. Da vuelta la duda previa
("¿más cool que útil para el tío?"): para ESTE tío en concreto, suma.

- **Homenaje por atmósfera, NO por IP.** Sin arte, robots, logos ni nombres de
  Marvel/X‑Men. La referencia es paleta + HUD + lenguaje de detección. El nombre
  "Sentinel" ya era de Carlos (palabra de diccionario, predate el guiño) → el
  nombre mismo hace el wink; quien conoce lo cacha, quien no ve un dashboard de
  vigilancia normal. Eso lo mantiene Easter egg y no copia. Sostener esta línea al
  construir.
- **Tokens del rumbo:** fondo púrpura‑void, acentos púrpura (#9D5CFF) + magenta
  (#FF2E88) + cyan de readout (#39DBFF), estados ok/low/crit. Tipos: Orbitron
  (display/marca/números), Chakra Petch (UI), Share Tech Mono (readouts).
  Animación sutil (pulso + barrido) con `prefers-reduced-motion` respetado.
- **Posible split de piel por zona (ABIERTO, no decidido):** Centinela full en la
  consola del operador (Jesús, PC); evaluar si el dashboard del tío queda Centinela
  completo o una variante más limpia. El árbol es el mismo; la piel puede variar por
  zona. Se decide al ver el mobile real.

### Próximo bloque (ya es código)

Shell de navegación en Next: dónde vive el layout persistente (App Router), sidebar
PC + hamburguesa cel, rutas, tokens del rumbo 4 en los estilos globales. Entra la
skill de frontend-design. Antes de escribir: ver los archivos actuales (root layout,
estilos globales, config de Tailwind/fuentes) — principio de verificar contra la realidad.

## ACTUALIZACIÓN SESIÓN 2026-06-25 (estructura visual + dashboard completo)

Sesión larga de código. Se construyó la piel del Modo Centinela y TODA la
estructura de pantallas que faltaba. Con esto, la estructura del proyecto queda
cerrada: 4 pantallas navegables + 2 importers. Lo que sigue es pulido, no
estructura.

### Paleta y fuentes del Centinela (globals.css + layout.tsx)

- **Fuentes:** Orbitron (display/marca/números), Chakra Petch (UI), Share Tech
  Mono (readouts HUD), vía `next/font/google`. Aprendizaje clave — la cadena de
  3 eslabones para que una fuente se vuelva clase Tailwind usable:
  1. `next/font` la carga y expone como CSS var (`--font-orbitron`), inyectada
     en el `<html>` por className.
  2. `globals.css` → `@theme inline`: registrar `--font-display:
var(--font-orbitron)`. ESTE es el paso que convierte la var en la clase.
     Sin él, la var existe pero la clase `font-display` NO.
  3. JSX: `className="font-display"`.
     Regla Tailwind 4: `--font-*` dentro de `@theme` genera clases `font-*`. El
     nombre después de `--font-` ES el nombre de la clase.
- **Paleta:** el Modo Centinela vive en `:root` (camino 2 de 3 evaluados). NO
  se creó un set de tokens aparte (rompería los componentes shadcn que ya leen
  `--primary`, `--card`, etc.). Se reescribieron los tokens shadcn con la
  paleta Centinela: void púrpura, primary púrpura (#9D5CFF), accent magenta
  (#FF2E88), destructive rojo, + sidebar-\*. Los componentes shadcn heredan la
  piel gratis. Bloque `.dark` BORRADO (la app no tiene switch claro/oscuro —
  nace siempre Centinela; un `.dark` muerto es deuda).
- **Fix del `title`/`lang`:** eran restos del template ("Create Next App",
  lang="en") → "Sentinel — Grupo del Llano", lang="es".

### BUG resuelto: `@import "shadcn/tailwind.css"` pisaba el `:root`

Los tokens de acento (`--primary`, `--accent`) salían GRISES aunque el `:root`
decía púrpura. Diagnóstico correcto (a la segunda — la primera hipótesis, el
`.dark`, se descartó mirando el `<html>` en DevTools: no había clase `dark`).
Causa real: `globals.css` tenía un `@import "shadcn/tailwind.css"` que traía su
PROPIO `:root` con paleta gris. Dos `:root` = misma especificidad → gana el que
carga último → el de shadcn pisaba el nuestro. Fix: quitar ese import. **Primer
conflicto de especificidad CSS por orden de carga.** Método que lo resolvió:
editar el valor en el inspector para aislar "¿es el formato del valor o algo lo
pisa?" — herramienta de debugging CSS, no adivinar.

### Shell de navegación (components/sidebar.tsx + layout.tsx)

- **Sidebar = Client Component** (`"use client"`) porque usa `usePathname()`
  para saber qué link está activo (los hooks solo corren en cliente). El
  **layout sigue Server**; el sidebar es una "isla" Client adentro. Se aísla el
  `"use client"` al pedacito que lo necesita, no se contamina todo el layout.
- **Datos separados del JSX:** los ítems del menú viven en un array de grupos
  (`{ titulo, items: [{ label, href }] }`) y se pintan con `.map()` — un solo
  `<Link>` escrito, no 5 repetidos.
- **Vive en el layout** (al lado de `{children}`) porque el layout no se
  re-renderiza al navegar → el sidebar no parpadea. Grupos: Acciones /
  Consultas / Resumen. Resaltado activo por `pathname === href`.

### Pantalla de movimientos (lib/services/movements.ts + app/movements/page.tsx)

- Calcada de `/sales`, 3 diferencias: (1) SIN filtro por `source` (queremos
  TODOS los movements, OUT + IMPORT_SET); (2) `quantityDelta` CRUDO sin el `-`
  de ventas (el signo ES info: negativo=salió, positivo=entró — mostrar la
  realidad, no disfrazarla); (3) columna nueva `tipo` (movementType) para
  distinguir venta de ajuste (Jesús cazando mermas).
- **Una sola query** (sales hace dos para filtrar por origen; acá no se filtra).
- **Orden por `id: "desc"`, no por fecha:** los IMPORT_SET tienen
  `movementDate` null → con orden por fecha caían al fondo y no se veían. El
  `id` lo tienen TODOS (autoincrement, nunca null) y crece con el tiempo. Da
  "lo cargado más recientemente", no "lo más reciente del mundo real" —
  correcto para auditoría; orden cronológico real = mejora futura.
- **`take: 100`** (como /inventory y /sales). Distinción registrada: el `take`
  es estructura mínima (que la tabla no traiga 9.770 filas), NO una feature.
  Paginación + filtros = mejoras post-estructura, NO se hicieron.
- Deuda: con la DB de prueba (último import = ventas), las 100 filas son puras
  OUT (los IMPORT_SET tienen ids más bajos). No es bug — artefacto del orden de
  carga de la DB de desarrollo.

### Dashboard completo (lib/services/dashboard.ts + app/page.tsx)

La landing del tío. 4 KPIs + más vendidos + el hero. Construido de lo simple a
lo difícil (KPIs → más vendidos → hero), para llegar a lo difícil con la mano
hecha.

**Los 4 KPIs** (`getDashboardKpis`, un servicio, una pantalla):

- Pares en piso: `aggregate _sum quantity` de InventoryPosition.
- Modelos distintos: `product.count()`.
- Ventas del último día: 2 pasos — `findFirst orderBy movementDate desc` para
  hallar el último día, luego `count` de OUT en ese día. Etiqueta "último día",
  NO "hoy" (el último import es del 28/05, no de hoy — no mentir).
- Alertas de resurtido: sale del hero (ver abajo).
- **Descartado:** "Valor de inventario" (no hay costos/precios — fuera del MVP).
  "Sucursales activas" se cambió por "Modelos distintos" (el tío ya sabe cuántas
  sucursales tiene; es número muerto).

**Más vendidos** (`getTopSellers`): primer `groupBy` — por `productId` (groupBy
solo agrupa por campos de la MISMA tabla; el nombre vive en Product → 2ª query
para traducir ids a nombres). Suma `quantityDelta` (negativo), orderBy `asc`
(más negativo = más vendido, arriba), take 5, signo dado vuelta a positivo en el
aplanado.

**Hero "cuándo resurtir"** (`getRestockAlerts`) — la query más difícil del
proyecto. Fórmula (derivada por Carlos): **días hasta agotarse = stock ÷
velocidad**, donde **velocidad = unidades vendidas ÷ días distintos con
ventas**.

- Cruza DOS tablas: stock (InventoryPosition, groupBy productId) + vendido
  (InventoryMovement OUT, groupBy productId), + divisor (días distintos =
  `groupBy movementDate` y contar los grupos, NO `count()` que cuenta filas).
- Divisor = días DISTINTOS CON VENTAS, no días de calendario: si Jesús se
  saltea un día, no se castiga al producto por un hueco que no es suyo. Se mide
  sobre lo observado.
- Se itera sobre los productos VENDIDOS (no los con stock): sin ventas nunca se
  agota, no es alerta.
- Cruce en JS (`.find` por id), `.sort` por días ascendente (urgente arriba),
  `.slice(0,5)` para el hero.
- **KPI de alertas:** conteo de productos con `< 15 días`, calculado sobre TODAS
  las alertas ANTES del slice (después del slice ya se perdieron). El servicio
  devuelve `{ lista, totalAlertas }` (cambio de forma: de array a objeto → rompió
  el `.map` en page.tsx, arreglado a `restock.lista.map`).

**Naturaleza temporal de los datos (aprendizaje de producto):** las ventas son
ACUMULABLES (cada día sube historia, el hero se afina); el stock es solo
snapshot del PRESENTE (el legacy no da stock histórico). El hero NUNCA fue
imposible — el stock de hoy siempre está; lo que madura es la velocidad. Con 1
día de datos, "cuándo resurtir" da números raros (velocidades de un solo día →
"0 días" por `Math.round` de fracciones < 1, o cifras enormes para mucho stock).
NO es bug — es data flaca. Se presenta como "estimación · mejora con más días de
ventas". Al tío: nace útil (KPIs + más vendidos honestos) y se vuelve mejor
consejera con el tiempo.

### Deuda registrada esta sesión

- **"0 días" confusos** en el hero: `Math.round` de fracciones < 1 día. Mostrar
  "< 1 día" o similar. Post-MVP.
- **DB de desarrollo con arrastre:** pares en piso da 23.995 (no 20.571) por
  varias corridas de import de prueba; modelos da 2.684 (no 4.594) porque el
  parser ignora los ~2.000 no-zapato. Correcto para lo que hay en la DB. Para
  demo con números limpios → resetear DB + un snapshot fresco.
- **Bugs de anidamiento JSX** (hero y card de alertas quedaron mal anidados,
  cazados contando `<div>`). Carlos los resolvió. Recordatorio: mover bloques a
  mano y contar llaves es la habilidad, no depender de que Claude pase el bloque.

### Estado al cierre — ESTRUCTURA COMPLETA

Las 4 pantallas navegables (dashboard, ventas, inventario, movimientos) + los 2
importers, todas con la piel Centinela. Todo pusheado, tree limpio.

**Falta (todo post-estructura, para sesión dedicada de pulido):**

- **Pulido visual del Centinela:** el ojo glow del logo, corchetes de mira en el
  hero, glows, retícula, scanlines — la pasada de "poner guapa la app" con la
  skill de frontend-design. Aplica MÁS al dashboard del tío (showcase, mobile).
- **Vista mobile del tío:** el dashboard se pensó para su celular pero solo se
  vio en desktop. Falta mirarlo/ajustarlo en mobile (es SU pantalla).
- **Deuda de datos:** "0 días" → "< 1 día"; reset de DB para demo limpia.
- **Mejoras diferidas:** paginación + filtros en las 3 tablas (una vez, para las
  tres juntas); orden cronológico real en movimientos; mostrar más ítems en el
  hero si el tío lo pide.

## ACTUALIZACIÓN SESIÓN 2026-06-26 (pulido: ojo glow + mobile responsive)

Primera pasada de pulido visual, con la skill de frontend-design. Dos frentes
grandes cerrados: el ojo glow del logo y TODO el responsive mobile. La estructura
ya estaba completa (sesión anterior); esto es "poner guapa" y "que funcione en el
cel del tío". Todo commiteado, tree limpio, sin trabajo a medias.

### Ojo glow del logo (components/sidebar.tsx)

- Sensor hexagonal (clip-path polygon) con gradiente `--primary`→`--accent`
  (púrpura→magenta) y `box-shadow` con `color-mix(in oklch, var(--primary) 55%,
transparent)` — glow que siempre matchea la paleta, no color hardcodeado.
- El "ojo" = span blanco chico con box-shadow de dos capas (blanco cerca +
  `var(--accent)` difuso) → parece sensor encendido, no círculo plano.
- Principio de la skill aplicado: gastar la audacia en UN lugar (el sensor), el
  resto disciplinado. Es el elemento firma del sidebar.

### Responsive mobile — el frente grande

El dashboard se pensó para el cel del tío (usuario showcase) pero solo se había
visto en desktop. En modo dispositivo (DevTools) estaba ROTO: sidebar comiéndose
media pantalla, KPIs cortados. Se arregló en 4 piezas, cada una su commit.

**Mecanismo base — prefijos responsive de Tailwind.** `hidden md:block` = oculto
en mobile, visible desde 768px. `md:hidden` = lo inverso. Con esto se muestra/
oculta según pantalla SIN medir nada en JS. Es el motor de todo el responsive.

**1. Menú hamburguesa (components/mobile-nav.tsx, nuevo).** El trabajo más grande.

- El sidebar del layout pasa a `hidden md:block` (solo desktop). En mobile lo
  maneja `MobileNav`.
- `MobileNav` = Client Component con `useState(abierto)`: botón hamburguesa
  (`md:hidden`, fixed top-left) + overlay oscuro (cierra al tocar) + sidebar
  deslizante. El deslizamiento: sidebar SIEMPRE montado pero `-translate-x-full`
  (fuera de pantalla); al abrir, `translate-x-0` + `transition-transform` → se
  desliza. No aparece de golpe.

**2. Cerrar menú al tocar link (patrón prop-función).** Bug: el menú quedaba
abierto tapando la página nueva. El estado (`abierto`) vive en `MobileNav`, pero
los links viven en `Sidebar` (otro componente). Solución React fundamental: pasar
la función como prop. `Sidebar` recibe prop OPCIONAL `onNavigate?: () => void`
(el `?` la hace opcional — desktop no la pasa, mobile sí); el `<Link>` la llama en
`onClick`. Si llegó (mobile) → cierra; si es undefined (desktop) → React no hace
nada, sin `if`. El hijo no tiene el estado, recibe un "botón para apretarlo".

**3. KPIs responsivos (app/page.tsx).** `grid-cols-4` fijo se cortaba en 375px.
Cambiado a `grid-cols-1 md:grid-cols-4` → una columna apilada en mobile, cuatro en
desktop. Decisión de producto de Carlos: UNA columna (no dos) porque el tío
batalla para leer en el cel; cards grandes, números enormes, cero esfuerzo.

**4. Padding del título + filas apiladas (app/page.tsx, app/layout.tsx).**

- El botón hamburguesa (fixed) tapaba el `<h1>`. Fix: `pt-16 md:pt-0` en el
  `<main>` del LAYOUT (no en el título ni en el `p-8` del dashboard) — porque el
  `<main>` envuelve TODAS las páginas; ponerlo ahí cubre todas de una, no solo el
  dashboard. Lección: el fix va en el punto único por donde pasan todas.
- Filas de "cuándo resurtir" y "más vendidos" se partían feo en mobile (nombre
  largo + número peleando por el ancho). Fix: `flex-col md:flex-row
md:justify-between` → apilado en mobile (nombre completo arriba, "X días"
  abajo), en fila en desktop. Decisión de producto: nombre COMPLETO (no cortar con
  "...") porque el tío necesita saber qué zapato pedir.

### Aprendizaje de proceso

Carlos detectó los 3 problemas mobile (hamburguesa, KPIs, filas) él solo mirando
la pantalla en modo dispositivo, y los clasificó por gravedad. Es la habilidad de
"mirá el diseño con ojo crítico" que la skill de frontend valora. También insistió
en commitear pieza por pieza (Claude reforzó: commits chicos y separados = historia
legible + red de seguridad; no juntar en un commit gigante "cuando esté todo bien").

### Pendientes de pulido (próxima sesión)

- **Glow del hero "cuándo resurtir":** corchetes de mira, objetivo "bloqueado",
  retícula — el subidón visual de la maqueta 4. El frente divertido que queda.
- **Deuda de datos "0 días":** `Math.round` de fracciones < 1 día da "0 días"
  confuso. Mostrar "< 1 día" o similar.
- **Overlay mobile** no cubre del todo con el menú abierto (menor, cosmético).
- **Reset de DB** para demo con números limpios (arrastre de pruebas: 23.995
  pares en vez de 20.571, etc.).
- Deuda vieja: paginación + filtros en las 3 tablas; orden cronológico real en
  movimientos.

## ACTUALIZACIÓN SESIÓN 2026-06-26 bis (pulido visual completo)

Segunda tanda de pulido, continuación del mismo día. El pulido visual quedó
COMPLETO: toda la app tiene la piel Centinela, funciona en mobile y desktop, cada
pantalla cuidada. Lo único que queda del proyecto es DEPLOY (subirla) — tema
aparte, próxima conversación.

### Hero "cuándo resurtir" — completado (app/page.tsx)

- **Corchetes de mira HUD:** 4 esquinas en la card, cada una un `<span>` absolute
  con solo 2 bordes (ej. `border-t-2 border-l-2` = esquina superior-izq),
  `border-accent`, `pointer-events-none`. La card es `relative` para anclarlos.
- **Objetivo "EN MIRA":** la fila más urgente (índice 0 del `.map`, ya viene
  ordenada por urgencia) se resalta. `.map((r, i) => ...)`, `const bloqueado = i
=== 0` decide clases: fondo `bg-accent/10` + `border-accent/40`, tag "● EN MIRA"
  (`{bloqueado && <span>...}`), número en `text-accent`. El resto quietas — el
  contraste ES el efecto. Skill: gastar la audacia en un lugar.
- **"< 1 día":** los "0 días" (Math.round de fracciones <1) confundían ("ya se
  agotó"). Fix de presentación en la VISTA (no el servicio): `{r.dias === 0 ? "< 1
día" : `${r.dias} días`}`.

### Importers vestidos (app/imports/{ventas,existencias}/\*)

De HTML crudo 1995 a pantallas Centinela. Los DOS iguales (Jesús sube igual a
ambos; consistencia > variedad), cambiando solo textos.

- **Página:** `<div p-8 space-y-6>` + `<h1 font-display>` + párrafo explicativo (la
  skill: "pantalla vacía = invitación a actuar"; decirle a Jesús qué subir). Ojo:
  el párrafo de VENTAS no debe decir "snapshot" (eso es vocabulario de
  existencias); ventas registra las ventas como salidas.
- **Input de archivo:** `<input type=file>` es casi inestilable directo. Truco =
  modificador Tailwind `file:` que estiliza el botón INTERNO (`file:bg-secondary
file:rounded-md file:border-0` etc). Las clases sin `file:` estilan el texto de
  al lado.
- **Botón defensivo (idea de Carlos):** deshabilitar "Subir y leer" si no hay
  archivo. Estado nuevo `hayArchivo` (useState bool), input con `onChange={(e) =>
setHayArchivo(e.target.files!.length > 0)}`, botón `disabled={!hayArchivo}` +
  clases `disabled:opacity-40 disabled:cursor-not-allowed`. El `!` = "disabled
  cuando NO hay archivo".
- **4 estados vestidos:** idle (texto tenue), procesando (`text-primary
animate-pulse`), éxito (bloque `border-green-500/40 bg-green-500/10
text-green-400`), error (mismo bloque con token `destructive`). Cada estado se VE
  distinto — la skill: estados son dirección, no mood.
- Carlos vistió el importer de VENTAS él solo (copiando de existencias). Arco
  pedagógico: de "dame el código" a "lo copio y ajusto yo".

### Pulido de navegación (components/sidebar.tsx + mobile-nav.tsx)

Carlos detectó los dos bugs él mirando la pantalla:

- **Sidebar no llegaba hasta abajo** (desktop y mobile): el `<aside>` medía solo
  su contenido. Fix: `h-screen` (alto del viewport) en el `<aside>`. Sirve a
  ambos usos (desktop fijo + mobile deslizante).
- **Hamburguesa tapaba el logo en mobile abierto:** el botón `fixed top-4 left-4`
  se pisaba con el logo del panel. Fix: DOS botones condicionales — hamburguesa
  cuando `!abierto` (izq), X cuando `abierto`. La X primero se probó en `left-52`
  (flotaba raro — Carlos lo notó), se movió a `right-4` (esquina sup-der, donde el
  cerebro busca "cerrar"). Carlos afinó la posición por criterio estético.

### Ojo glow del logo (sesión bis anterior, ya documentado)

Sensor hexagonal (clip-path) púrpura→magenta con glow via color-mix; el "ojo" =
span blanco con box-shadow de dos capas. Elemento firma del sidebar.

### ESTADO: app COMPLETA (código + visual). Falta solo DEPLOY.

Todas las pantallas con piel Centinela, responsive mobile+desktop, todo pusheado,
tree limpio (8c741cf).

### PRÓXIMA CONVERSACIÓN: subir Sentinel (deploy)

Dos temas a resolver antes de compartir la URL con Jesús y el tío:

1. **Reset de DB + snapshot limpio:** la DB de desarrollo tiene arrastre de
   pruebas (23.995 pares en vez de ~20.500; "< 1 día" en casi todo por tener UN
   solo día de ventas cargado). Para demo con números honestos → reset + un
   snapshot fresco + idealmente varios días de ventas (para que el hero "cuándo
   resurtir" dé velocidades creíbles, no de un solo día).
2. **Acceso / auth:** hoy es UNA sola puerta sin candado (decisión previa: auth
   diferido). Cualquiera con la URL ve y usa todo. Decidir CONSCIENTEMENTE si para
   probar en familia está bien así, o si se quiere un candado mínimo antes de
   compartir. Tener presente: sin auth no hay distinción de usuarios (Jesús vs
   tío), todo visible para todos.
3. **Consideración de deploy:** SQLite + `dev.db` local no viaja a un hosting
   serverless tal cual (el archivo no persiste). Va a haber que pensar dónde vive
   la DB en producción (¿Turso/libSQL? ¿otro?). Tema técnico a investigar al
   arrancar el deploy.

### Deuda menor que sigue pendiente (no bloquea deploy)

- Overlay mobile no cubre del todo con menú abierto (cosmético).
- Paginación + filtros en las 3 tablas (una vez, para las tres).
- Orden cronológico real en movimientos (hoy por id).
- Doble borde en esquinas del hero (corchetes sobre el border-accent de la card).
