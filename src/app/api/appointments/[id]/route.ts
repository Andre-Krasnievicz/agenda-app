import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { updateAppointmentSchema } from "@/server/validation/appointment";
import { deleteAppointment, getAppointmentDTO, updateAppointment } from "@/server/services/appointment.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const appointment = await getAppointmentDTO(id);
    return NextResponse.json({ appointment });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = updateAppointmentSchema.parse(body);
    const appointment = await updateAppointment(id, input);
    return NextResponse.json({ appointment });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteAppointment(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
