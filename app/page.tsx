// app/page.tsx
import { getDashboardKpis } from "@/lib/services/dashboard";

export default async function DashboardPage() {
  const kpis = await getDashboardKpis();

  return (
    <div className="p-8 space-y-6">
      <h1 className="font-display text-3xl">Resumen</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="font-hud text-xs uppercase text-muted-foreground">
            Pares en piso
          </p>
          <p className="font-display text-3xl mt-2">{kpis.paresEnPiso}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="font-hud text-xs uppercase text-muted-foreground">
            Modelos distintos
          </p>
          <p className="font-display text-3xl mt-2">{kpis.modelosDistintos}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="font-hud text-xs uppercase text-muted-foreground">
            Ventas ultimo día
          </p>
          <p className="font-display text-3xl mt-2">{kpis.ventasUltimoDia}</p>
        </div>

        {/* TODO Carlos: 2 cards más, para modelosDistintos y ventasUltimoDia
            (copiá la de arriba, cambiá el label y el valor) */}
      </div>
    </div>
  );
}
