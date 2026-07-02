"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Datos: cada grupo tiene un título y un array de ítems
const grupos = [
  {
    titulo: "Acciones",
    items: [
      { label: "Subir ventas", href: "/imports/ventas" },
      { label: "Subir existencias", href: "/imports/existencias" },
    ],
  },
  {
    titulo: "Consultas",
    items: [
      // TODO Carlos: 3 ítems → /sales, /inventory, /movements
      // (movements todavía no existe como página; el link igual va, lo construimos después)
      { label: "Consultar ventas", href: "/sales" },
      { label: "Consultar inventario", href: "/inventory" },
      { label: "Consultar movimientos", href: "/movements" },
    ],
  },
  {
    titulo: "Resumen",
    items: [{ label: "Dashboard", href: "/" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar p-3 flex flex-col gap-6">
      <div className="flex items-center gap-3 px-2 py-1">
        {/* Ojo Centinela: sensor hexagonal con brillo */}
        <div
          className="relative grid h-9 w-9 place-items-center"
          style={{
            clipPath:
              "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            background:
              "linear-gradient(135deg, var(--primary), var(--accent))",
            boxShadow:
              "0 0 16px color-mix(in oklch, var(--primary) 55%, transparent)",
          }}
        >
          <span
            className="h-2 w-2 rounded-full bg-white"
            style={{
              boxShadow: "0 0 8px white, 0 0 14px var(--accent)",
            }}
          ></span>
        </div>

        <span className="font-display text-lg text-sidebar-foreground">
          SENTINEL
        </span>
      </div>
      {grupos.map((grupo) => (
        <nav key={grupo.titulo} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-hud uppercase tracking-wider text-muted-foreground">
            {grupo.titulo}
          </p>

          {grupo.items.map((item) => {
            const activo = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2 py-2 text-sm font-ui ${
                  activo
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ))}
    </aside>
  );
}
