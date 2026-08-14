import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { updatePatientSchema } from "@/server/validation/patient";
import { getPatientOr404, updatePatient } from "@/server/services/patient.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const patient = await getPatientOr404(id);
    return NextResponse.json({ patient });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = updatePatientSchema.parse(body);
    const patient = await updatePatient(id, input);
    return NextResponse.json({ patient });
  } catch (err) {
    return handleRouteError(err);
  }
}
