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
