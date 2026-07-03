import {
  getDashboardKpis,
  getTopSellers,
  getRestockAlerts,
} from "@/lib/services/dashboard";

export default async function DashboardPage() {
  const kpis = await getDashboardKpis();
  const topSellers = await getTopSellers();
  const restock = await getRestockAlerts();

  return (
    <div className="p-8 space-y-6">
      <h1 className="font-display text-3xl">Resumen</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            Ventas último día
          </p>
          <p className="font-display text-3xl mt-2">{kpis.ventasUltimoDia}</p>
        </div>
        <div className="rounded-lg border border-accent bg-card p-5">
          <p className="font-hud text-xs uppercase text-muted-foreground">
            Alertas de resurtido
          </p>
          <p className="font-display text-3xl mt-2">{restock.totalAlertas}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-display text-lg mb-4">Más vendidos</h2>
        <div className="space-y-2">
          {topSellers.map((s) => (
            <div
              key={s.id}
              className="flex flex-col md:flex-row md:justify-between font-ui text-sm"
            >
              <span>{s.nombre}</span>
              <span className="font-hud">{s.unidades}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative rounded-lg border border-accent bg-card p-5">
        <span className="pointer-events-none absolute top-2 left-2 h-4 w-4 border-t-2 border-l-2 border-accent" />
        <span className="pointer-events-none absolute top-2 right-2 h-4 w-4 border-t-2 border-r-2 border-accent" />
        <span className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-accent" />
        <span className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-accent" />

        <h2 className="font-display text-lg mb-1">Cuándo resurtir</h2>
        <p className="font-hud text-xs uppercase text-muted-foreground mb-4">
          estimación · mejora con más días de ventas
        </p>
        <div className="space-y-2">
          {restock.lista.map((r, i) => {
            const bloqueado = i === 0; // la primera = la más urgente = en la mira
            return (
              <div
                key={r.id}
                className={`flex flex-col md:flex-row md:justify-between font-ui text-sm rounded-md px-3 py-2 ${
                  bloqueado ? "bg-accent/10 border border-accent/40" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  {bloqueado && (
                    <span className="font-hud text-xs text-accent">
                      ● EN MIRA
                    </span>
                  )}
                  {r.nombre}
                </span>
                <span className={`font-hud ${bloqueado ? "text-accent" : ""}`}>
                  {r.dias === 0 ? "< 1 día" : `${r.dias} días`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
