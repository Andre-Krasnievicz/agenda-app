import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { createPatientSchema, listPatientsQuerySchema } from "@/server/validation/patient";
import { createPatient, listPatients } from "@/server/services/patient.service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = listPatientsQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      includeArchived: searchParams.get("includeArchived") ?? undefined,
    });
    const patients = await listPatients(query);
    return NextResponse.json({ patients });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = createPatientSchema.parse(body);
    const patient = await createPatient(input);
    return NextResponse.json({ patient }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
