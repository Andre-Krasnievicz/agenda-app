import { NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { exportAllData } from "@/server/services/export.service";

export async function GET() {
  try {
    const data = await exportAllData();
    return NextResponse.json(data, {
      headers: {
        "Content-Disposition": `attachment; filename="agenda-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
