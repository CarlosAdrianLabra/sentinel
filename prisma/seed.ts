import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { BRANCHES } from "../lib/constants/branches";

// Cliente Prisma dedicado para este script.
// No reutilizamos el singleton de lib/db/prisma.ts porque este script
// corre como proceso aparte, sin hot reload, y conviene cerrar la conexión
// explícitamente al final.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting seed...");
  for (const branch of BRANCHES) {
    await prisma.branch.upsert({
      where: { legacyStoreId: branch.legacyStoreId },
      update: {
        code: branch.code,
        name: branch.name,
        legacyStoreName: branch.legacyStoreName,
        isActive: branch.isActive ?? true,
      },
      create: {
        code: branch.code,
        name: branch.name,
        legacyStoreId: branch.legacyStoreId,
        legacyStoreName: branch.legacyStoreName,
        isActive: branch.isActive ?? true,
      },
    });
    console.log(
      `Branch ${branch.code} ready (active: ${branch.isActive ?? true})`,
    );
  }

  console.log("🎉 Seed completed");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
