import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/server/errors";
import { seriesSchema } from "@/server/validation/appointment";
import { createSeries, previewSeries } from "@/server/services/series.service";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get("dryRun") === "true";
    const body = await req.json();
    const input = seriesSchema.parse(body);

    if (dryRun) {
      const preview = await previewSeries(input);
      return NextResponse.json(preview);
    }

    const result = await createSeries(input);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
