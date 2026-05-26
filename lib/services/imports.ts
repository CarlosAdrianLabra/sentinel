import { prisma } from "@/lib/db/prisma";

type FreshnessLevel =
  | "SIN_DATOS"
  | "FALLO"
  | "AL_DIA"
  | "PENDIENTE"
  | "DESACTUALIZADO";

function calculateFreshnessLevel(
  lastSuccessful: { snapshotDate: Date | null } | null,
  lastAttempt: { status: string } | null,
  now: Date,
): FreshnessLevel {
  // Caso 1: nunca hubo un import.
  if (!lastAttempt) return "SIN_DATOS";

  // Caso 2: el último intento falló (sin importar si hay COMPLETED previo).
  if (lastAttempt.status === "FAILED") return "FALLO";

  // Caso 3: hay último intento pero no es COMPLETED y no es FAILED
  // (ej. RUNNING zombie). Lo ignoramos del semáforo — tratamos como
  // si no hubiera COMPLETED reciente.
  if (!lastSuccessful || !lastSuccessful.snapshotDate) return "SIN_DATOS";

  // A partir de acá: hay un COMPLETED con snapshotDate.
  const snapshot = lastSuccessful.snapshotDate;
  // Caso 4: snapshot de hoy → al día.
  if (sameDay(snapshot, now)) return "AL_DIA";

  // Caso 5: snapshot de ayer y todavía es temprano hoy (antes 10:30 AM)
  // → pendiente, el import del día está por llegar.
  if (sameDay(snapshot, yesterday(now)) && now.getHours() < 10) {
    return "PENDIENTE";
  }
  if (
    sameDay(snapshot, yesterday(now)) &&
    now.getHours() === 10 &&
    now.getMinutes() < 30
  ) {
    return "PENDIENTE";
  }

  // Caso 6: cualquier otra cosa → desactualizado.
  return "DESACTUALIZADO";
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function yesterday(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - 1);
  return result;
}

export async function getImportsPageData() {
  const history = await prisma.importJob.findMany({
    orderBy: { createdAt: "desc" },
  });
  const lastSuccessful = await prisma.importJob.findFirst({
    where: { status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });
  const lastAttempt = await prisma.importJob.findFirst({
    orderBy: { createdAt: "desc" },
  });
  const level = calculateFreshnessLevel(
    lastSuccessful,
    lastAttempt,
    new Date(),
  );
  return {
    freshness: {
      level,
      lastSuccessful: lastSuccessful
        ? {
            snapshotDate: lastSuccessful.snapshotDate,
            createdAt: lastSuccessful.createdAt,
          }
        : null,
      lastAttempt: lastAttempt
        ? {
            status: lastAttempt.status,
            createdAt: lastAttempt.createdAt,
          }
        : null,
    },
    history,
  };
}
