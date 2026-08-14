import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { createPackageSchema } from "@/server/validation/package";
import { createPackageForPatient, listPackagesByPatient, attachCounters } from "@/server/services/package.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const packages = await listPackagesByPatient(id);
    return NextResponse.json({ packages });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = createPackageSchema.parse(body);
    const pkg = await createPackageForPatient(id, input);
    return NextResponse.json({ package: await attachCounters(pkg) }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
