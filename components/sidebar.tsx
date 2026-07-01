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
      <div className="px-2 py-1 font-display text-lg text-sidebar-foreground">
        SENTINEL
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
