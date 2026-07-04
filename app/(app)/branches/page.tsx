import { listBranches } from "@/lib/services/branches";

export const dynamic = "force-dynamic";
export default async function BranchesPage() {
  const branches = await listBranches();
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Lista de branches</h1>
      <div className="space-y-4">
        {branches.map((branch) => (
          <div key={branch.id} className="border rounded-lg p-4">
            <h2 className="text-xl font-semibold">{branch.code}</h2>
            <p className="text-sm text-gray-400">{branch.legacyStoreName}</p>
            <p className="text-sm text-gray-400">{branch.legacyStoreId}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
