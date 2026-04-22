import { NextResponse } from "next/server";
import { listBranches } from "@/lib/services/branches";

export async function GET(request: Request) {
  try {
    const branches = await listBranches();
    return NextResponse.json({ branches });
  } catch (error) {
    console.error("GET /api/branches failed:", error);
    return NextResponse.json(
      { error: "Failed to list branches" },
      { status: 500 },
    );
  }
}
