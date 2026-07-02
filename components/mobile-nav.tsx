"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";

export function MobileNav() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="md:hidden fixed top-4 left-4 z-50 grid h-10 w-10 place-items-center rounded-md border border-sidebar-border bg-sidebar"
        aria-label="Abrir menú"
      >
        <div className="space-y-1.5">
          <span className="block h-0.5 w-5 bg-sidebar-foreground"></span>
          <span className="block h-0.5 w-5 bg-sidebar-foreground"></span>
          <span className="block h-0.5 w-5 bg-sidebar-foreground"></span>
        </div>
      </button>

      {/* Overlay — solo cuando abierto, cierra al tocar */}
      {abierto && (
        <div
          onClick={() => setAbierto(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/60"
        />
      )}

      <div
        className={`md:hidden fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar />
      </div>
    </>
  );
}
