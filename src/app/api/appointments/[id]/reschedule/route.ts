import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { allowOverlapQuerySchema, rescheduleAppointmentSchema } from "@/server/validation/appointment";
import { rescheduleAppointment } from "@/server/services/appointment.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const allowOverlap = allowOverlapQuerySchema.parse(searchParams.get("allowOverlap") ?? undefined);
    const body = await req.json();
    const input = rescheduleAppointmentSchema.parse(body);
    const appointment = await rescheduleAppointment(id, input, { allowOverlap });
    return NextResponse.json({ appointment });
  } catch (err) {
    return handleRouteError(err);
  }
}
