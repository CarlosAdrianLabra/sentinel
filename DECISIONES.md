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

| ID legacy | Nombre en INVENSHOES                              | Code operativo | Nombre operativo | Estado en Sentinel |
| --------- | ------------------------------------------------- | -------------- | ---------------- | ------------------ |
| `"1"`     | ADRIAN GRANADOS DEL LLANO                         | `ABRYL`        | Abryl            | activa, física     |
| `"2"`     | CARLOS DEL LLANO ROBLES                           | `TEZONCO`      | Tezonco          | activa, física     |
| `"3"`     | LUIS REY                                          | —              | —                | muerta, NO se siembra |
| `"4"`     | MIRASOL                                           | `MIRASOL`      | Mirasol          | virtual (apartados) |
| `"5"`     | SPORT TENIS                                       | `ECOMM`        | e-commerce       | virtual (canal externo) |
| `"9"`     | TIENDAS DE ROPA Y CALZADO ABRIL S.A. DE C.V.      | —              | —                | TBD según archivo de existencias multi-sucursal |

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

| Qualifier | Branch destino | Comentario |
|-----------|---------------|-----|
| `1`       | ABRYL (1)     | poco frecuente (5 de 113 filas) |
| `1-M-`    | ABRYL (1)     | el caso común (57 de 113) |
| `2`       | TEZONCO (2)   | poco frecuente (1 de 113) |
| `2-M-`    | TEZONCO (2)   | el caso común (26 de 113) |
| `5`       | ECOMM (5)     | único qualifier para ECOMM (24 de 113), sin variante `-M-` |
| `4` o `4-M-` | **No existe** | MIRASOL nunca aparece en ventas |

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

| Suc | Pares zapato | Pares no-zapato | Estado |
|-----|-----|-----|-----|
| 1 ABRYL | 9,870 | 731 | activa |
| 2 TEZONCO | 5,382 | 1,301 | activa |
| 3 LUIS REY | 0 | 0 | VACÍA |
| 4 MIRASOL | 3 | 3 | apartados |
| 5 ECOMM | 22 | 0 | activa |
| 9 ABRIL | 0 | 0 | VACÍA |

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

| Reporte | Fecha | Suc | Producto | Talla | Tipo mov | Folio | Masivo |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Sumarizado (A) | no | no | sí | no | no | no | sí |
| Corrida (B) | no | sí | sí | sí | no | no | NO (truena) |
| Detalle (C) | no | sí | sí | sí | no | no | sí (diario rápido) |
| Ejecutivo | sí/día | sí | no | no | no | no | sí |
| Kardex por Talla | sí | sí | sí | sí | sí | sí | NO (1x1) |

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
