import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { cancelAppointmentSchema } from "@/server/validation/appointment";
import { cancelAppointment } from "@/server/services/appointment.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = cancelAppointmentSchema.parse(body);
    const appointment = await cancelAppointment(id, input);
    return NextResponse.json({ appointment });
  } catch (err) {
    return handleRouteError(err);
  }
}
