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

## 6. Schema del dominio — 6 entidades

### `Branch` — sucursales

Tres formas de identificar:

- `id` (Int) — identidad técnica interna.
- `code` (String, @unique) — identidad operativa estable ("ABRYL", "TEZONCO", "ECOMM").
- `legacyStoreId` (String, @unique) — puente con INVENSHOES ("1", "2", "5").
- `legacyStoreName` (String?, opcional) — nombre como aparece en el legacy.

### `Product` — SKUs

- **Llave de negocio:** `fullDescription` (@unique) — ejemplo: `"CHARLY-79340-NIÑO-SINTETICO-BLANCO"`.
- **Campos descompuestos opcionales:** `brand`, `modelNumber`, `gender`, `material`, `color`.
- **`isActive`:** false cuando el legacy marca el producto con `*`.

### `InventoryPosition`

- Tupla única: `(branchId, productId, size)`.
- `size` es **String** (ej. `"17.5"`, `"27.0"`) — el parser normaliza desde el entero del legacy (ej. `1750` → `"17.5"`).

### `InventoryMovement`

- Append-only (nunca se edita ni borra; errores se compensan con movimientos inversos).
- `movementType` como String validado por Zod: `IN | OUT | ADJUSTMENT | IMPORT_SET`.
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
| `"5"`     | Sport Tenis               | `ECOMM`        | e-commerce       |

Las sucursales viven en `lib/constants/branches.ts` como constante y se siembran con `prisma/seed.ts`.

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

---

## 9. Fases completadas

- **Fase 1** — Entorno local (Node, pnpm, git, VS Code).
- **Fase 2** — Proyecto Next.js 16 creado y corriendo en localhost:3000.
- **Fase 3** — Prisma instalado, adapter configurado, primera migración (HealthCheck) validada.
- **Fase 4** — Schema del dominio aplicado (6 entidades). SQL leído y entendido.
- **Fase 5** — Seed de sucursales funcional e idempotente. Reto extra: script reset.ts escrito por Carlos.
- **Fase 6** — Servicio `lib/services/branches.ts` + endpoint `GET /api/branches` funcionando. Separación servicio/handler validada. Respuesta envuelta en `{ branches: [...] }`. Manejo de errores con try/catch en el handler, log autodescriptivo, status 500 con mensaje sanitizado. Verificado en navegador en localhost:3000/api/branches.

## 10. Fase actual

**Fase 7 — Primera UI: página que lista sucursales**

Arquitectura prevista:

- `app/branches/page.tsx` — Server Component que renderiza las sucursales.
- Estilado con Tailwind (shadcn/ui aún no instalado, decisión pendiente).

Decisión abierta de entrada en Fase 7: ¿la página consume `/api/branches` vía fetch, o llama directo al servicio `listBranches()`? Trade-offs de performance y arquitectura por discutir.

Siguiente fase después: Fase 8 — por definir (posiblemente parser de imports desde Excel legacy, o detalle de sucursal).

## 11. Decisiones pendientes / preguntas abiertas

- Formato de archivo de import (CSV vs XLSX): no decidido. Primer import real aún no ocurre.
- Estrategia de conflicto entre legacy y Sentinel: ¿legacy gana, Sentinel gana, o se marca conflicto? Decidir antes del primer import real.
- Si Prisma 7 tendrá un comportamiento distinto en algún aspecto: verificar contra la documentación siempre que parezca contradictorio con Prisma 6.

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
