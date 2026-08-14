import { randomUUID } from "crypto";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/lib/auth";
import { AppError } from "@/server/errors";
import { localDateTimeToUtc } from "@/lib/time";
import { parseLocalDateKey, type SeriesInput } from "@/server/validation/appointment";
import { getPackageCounters } from "./package.service";
import { computeEndsAt, findConflict, getAppointmentDTO, type AppointmentDTO } from "./appointment.service";

/**
 * Datas de calendário LOCAL (não instantes) em que a série cai. Função pura —
 * regra 4.4: "geração sempre em hora local, nunca somando milissegundos".
 * Itera dia a dia sobre a data local com `addDays`, nunca soma
 * `7 * 24 * 60 * 60 * 1000` em UTC (isso é o que quebraria se o horário de
 * verão voltasse em Mato Grosso no meio de uma série longa).
 */
export function generateSeriesLocalDates(opts: {
  startDate: Date;
  weekdays: number[];
  count?: number;
  untilDate?: Date;
}): Date[] {
  const weekdaySet = new Set(opts.weekdays);
  const dates: Date[] = [];
  let cursor = opts.startDate;
  // Teto de segurança: nunca itere mais que ~2 anos, mesmo com entrada estranha.
  const MAX_ITERATIONS = 366 * 2;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (opts.untilDate && cursor.getTime() > opts.untilDate.getTime()) break;
    if (weekdaySet.has(cursor.getDay())) {
      dates.push(cursor);
      if (opts.count && dates.length >= opts.count) break;
    }
    cursor = addDays(cursor, 1);
  }
  return dates;
}

async function resolveCandidateDates(input: SeriesInput): Promise<{
  ownerId: string;
  localDates: Date[];
  cappedByPackage: boolean;
  packageDisponiveis: number | null;
}> {
  const ownerId = await getCurrentOwnerId();

  const patient = await prisma.patient.findUnique({ where: { id: input.patientId } });
  if (!patient || patient.ownerId !== ownerId) {
    throw new AppError("NOT_FOUND", "Paciente não encontrado.");
  }

  let packageDisponiveis: number | null = null;
  if (input.packageId) {
    const pkg = await prisma.package.findUnique({ where: { id: input.packageId } });
    if (!pkg || pkg.patientId !== input.patientId) {
      throw new AppError("NOT_FOUND", "Pacote não encontrado para este paciente.");
    }
    if (pkg.status !== "ACTIVE") {
      throw new AppError("VALIDATION_ERROR", "Este pacote não está ativo.");
    }
    const counters = await getPackageCounters(pkg.id);
    packageDisponiveis = pkg.totalSessions - counters.consumidas - counters.reservadas;
  }

  const allDates = generateSeriesLocalDates({
    startDate: parseLocalDateKey(input.startDate),
    weekdays: input.weekdays,
    count: input.count,
    untilDate: input.untilDate ? parseLocalDateKey(input.untilDate) : undefined,
  });

  const cappedByPackage = packageDisponiveis !== null && allDates.length > packageDisponiveis;
  const localDates = packageDisponiveis !== null ? allDates.slice(0, packageDisponiveis) : allDates;

  return { ownerId, localDates, cappedByPackage, packageDisponiveis };
}

export type SeriesPreviewItem = { startsAt: string; endsAt: string; conflict: boolean };

export async function previewSeries(input: SeriesInput): Promise<{
  dates: SeriesPreviewItem[];
  cappedByPackage: boolean;
  packageDisponiveis: number | null;
}> {
  const { ownerId, localDates, cappedByPackage, packageDisponiveis } = await resolveCandidateDates(input);

  const dates: SeriesPreviewItem[] = [];
  for (const localDate of localDates) {
    const startsAt = localDateTimeToUtc(localDate, input.time);
    const endsAt = computeEndsAt(startsAt, input.durationMinutes);
    const conflict = await findConflict(ownerId, startsAt, endsAt, undefined);
    dates.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), conflict: !!conflict });
  }

  return { dates, cappedByPackage, packageDisponiveis };
}

export async function createSeries(
  input: SeriesInput,
): Promise<{ seriesId: string; created: AppointmentDTO[]; skipped: { startsAt: string; reason: string }[] }> {
  const { ownerId, localDates } = await resolveCandidateDates(input);
  const seriesId = randomUUID();
  const skipped: { startsAt: string; reason: string }[] = [];
  const createdIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const localDate of localDates) {
      const startsAt = localDateTimeToUtc(localDate, input.time);
      const endsAt = computeEndsAt(startsAt, input.durationMinutes);

      if (!input.allowOverlap) {
        const conflict = await findConflict(ownerId, startsAt, endsAt, undefined, tx);
        if (conflict) {
          skipped.push({ startsAt: startsAt.toISOString(), reason: "SLOT_CONFLICT" });
          continue;
        }
      }

      const created = await tx.appointment.create({
        data: {
          ownerId,
          patientId: input.patientId,
          packageId: input.packageId ?? null,
          startsAt,
          endsAt,
          notes: input.notes ?? null,
          status: "SCHEDULED",
          consumesSession: true,
          seriesId,
        },
      });
      createdIds.push(created.id);
    }
  });

  const created = await Promise.all(createdIds.map((id) => getAppointmentDTO(id)));
  return { seriesId, created, skipped };
}
