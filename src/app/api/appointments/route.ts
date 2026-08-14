import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import {
  allowOverlapQuerySchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
} from "@/server/validation/appointment";
import { createAppointment, listAppointments } from "@/server/services/appointment.service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = listAppointmentsQuerySchema.parse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      includeCanceled: searchParams.get("includeCanceled") ?? undefined,
    });
    const appointments = await listAppointments(query);
    return NextResponse.json({ appointments });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const allowOverlap = allowOverlapQuerySchema.parse(searchParams.get("allowOverlap") ?? undefined);
    const body = await req.json();
    const input = createAppointmentSchema.parse(body);
    const appointment = await createAppointment(input, { allowOverlap });
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
