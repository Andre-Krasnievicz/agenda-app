import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { completeAppointment } from "@/server/services/appointment.service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const appointment = await completeAppointment(id);
    return NextResponse.json({ appointment });
  } catch (err) {
    return handleRouteError(err);
  }
}
