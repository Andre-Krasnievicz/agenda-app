import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { updatePackageSchema } from "@/server/validation/package";
import { getPackageOr404, updatePackage } from "@/server/services/package.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const pkg = await getPackageOr404(id);
    return NextResponse.json({ package: pkg });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = updatePackageSchema.parse(body);
    const pkg = await updatePackage(id, input);
    return NextResponse.json({ package: pkg });
  } catch (err) {
    return handleRouteError(err);
  }
}
