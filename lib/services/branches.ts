import { prisma } from "@/lib/db/prisma";

export async function listBranches() {
  const branches = await prisma.branch.findMany({ orderBy: { id: "asc" } });
  return branches;
}
