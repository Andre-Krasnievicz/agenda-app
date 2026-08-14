import { Prisma, type Appointment, type AppointmentStatus, type Package, type Patient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/lib/auth";
import { AppError } from "@/server/errors";
import { getPackageCounters, type PackageCounters } from "./package.service";
import type {
  CancelAppointmentInput,
  CreateAppointmentInput,
  RescheduleAppointmentInput,
  UpdateAppointmentInput,
} from "@/server/validation/appointment";
import type { AppointmentDTO } from "@/lib/types";

export type { AppointmentDTO };

type TxOrClient = Prisma.TransactionClient | typeof prisma;

/**
 * `consumesSession` é derivado do status em UM único lugar (regra 4.1).
 * Nunca atribua esse campo manualmente fora daqui.
 */
export function statusConsumesSession(status: AppointmentStatus): boolean {
  switch (status) {
    case "SCHEDULED":
    case "COMPLETED":
    case "CANCELED_COUNTED":
      return true;
    case "CANCELED_FREE":
    case "RESCHEDULED":
      return false;
  }
}

const ACTIVE_STATUSES: AppointmentStatus[] = ["SCHEDULED", "COMPLETED"];
const DEFAULT_LIST_STATUSES: AppointmentStatus[] = ["SCHEDULED", "COMPLETED", "CANCELED_COUNTED"];
const ALL_STATUSES: AppointmentStatus[] = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELED_COUNTED",
  "CANCELED_FREE",
  "RESCHEDULED",
];

export function computeEndsAt(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

export type ConflictInfo = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  patientName: string;
};

/** Regra 4.2 — sobreposição de horário, ignorando o próprio registro e agendamentos cancelados. */
export async function findConflict(
  ownerId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId: string | undefined,
  tx: TxOrClient = prisma,
): Promise<ConflictInfo | null> {
  const conflict = await tx.appointment.findFirst({
    where: {
      ownerId,
      status: { in: ACTIVE_STATUSES },
      id: excludeId ? { not: excludeId } : undefined,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    include: { patient: true },
    orderBy: { startsAt: "asc" },
  });
  if (!conflict) return null;
  return {
    id: conflict.id,
    startsAt: conflict.startsAt,
    endsAt: conflict.endsAt,
    patientName: conflict.patient.name,
  };
}

function throwConflict(conflict: ConflictInfo): never {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Cuiaba" });
  throw new AppError(
    "SLOT_CONFLICT",
    `Já existe ${conflict.patientName} das ${fmt(conflict.startsAt)} às ${fmt(conflict.endsAt)}.`,
    { conflict },
  );
}

/** Numeração de sessão (regra 3.1): calculada na leitura, nunca persistida. */
async function computeSessionNumbers(
  packageIds: string[],
  tx: TxOrClient = prisma,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (packageIds.length === 0) return map;
  const appts = await tx.appointment.findMany({
    where: { packageId: { in: packageIds }, consumesSession: true },
    orderBy: { startsAt: "asc" },
    select: { id: true, packageId: true },
  });
  const running = new Map<string, number>();
  for (const a of appts) {
    const pkgId = a.packageId!;
    const next = (running.get(pkgId) ?? 0) + 1;
    running.set(pkgId, next);
    map.set(a.id, next);
  }
  return map;
}

function toDTO(
  appt: Appointment,
  patient: Patient,
  pkg: Package | null,
  counters: PackageCounters | null,
  sessionNumber: number | null,
  rescheduledFrom: { id: string; startsAt: Date } | null,
): AppointmentDTO {
  return {
    id: appt.id,
    startsAt: appt.startsAt.toISOString(),
    endsAt: appt.endsAt.toISOString(),
    durationMinutes: Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000),
    status: appt.status,
    notes: appt.notes,
    seriesId: appt.seriesId,
    rescheduledFrom: rescheduledFrom
      ? { id: rescheduledFrom.id, startsAt: rescheduledFrom.startsAt.toISOString() }
      : null,
    patient: { id: patient.id, name: patient.name, phone: patient.phone, notes: patient.notes },
    package:
      pkg && counters
        ? {
            id: pkg.id,
            label: pkg.label,
            totalSessions: pkg.totalSessions,
            priceCents: pkg.priceCents,
            consumidas: counters.consumidas,
            reservadas: counters.reservadas,
            completed: counters.completed,
            canceledCounted: counters.canceledCounted,
            // getPackageCounters devolve um `disponiveis` placeholder — o real
            // depende de totalSessions, que só o pacote (não o contador) conhece.
            disponiveis: pkg.totalSessions - counters.consumidas - counters.reservadas,
          }
        : null,
    sessionNumber,
  };
}

async function buildDTOs(
  appts: (Appointment & { patient: Patient; package: Package | null })[],
  tx: TxOrClient = prisma,
): Promise<AppointmentDTO[]> {
  const packageIds = [...new Set(appts.map((a) => a.packageId).filter((id): id is string => !!id))];

  const [countersEntries, sessionNumbers, rescheduledFroms] = await Promise.all([
    Promise.all(packageIds.map(async (id) => [id, await getPackageCounters(id, tx)] as const)),
    computeSessionNumbers(packageIds, tx),
    (async () => {
      const ids = appts.map((a) => a.rescheduledFromId).filter((id): id is string => !!id);
      if (ids.length === 0) return new Map<string, { id: string; startsAt: Date }>();
      const rows = await tx.appointment.findMany({
        where: { id: { in: ids } },
        select: { id: true, startsAt: true },
      });
      return new Map(rows.map((r) => [r.id, r]));
    })(),
  ]);
  const countersByPackage = new Map(countersEntries);

  return appts.map((a) =>
    toDTO(
      a,
      a.patient,
      a.package,
      a.packageId ? countersByPackage.get(a.packageId) ?? null : null,
      sessionNumbers.get(a.id) ?? null,
      a.rescheduledFromId ? rescheduledFroms.get(a.rescheduledFromId) ?? null : null,
    ),
  );
}

export async function getAppointmentDTO(id: string, tx: TxOrClient = prisma): Promise<AppointmentDTO> {
  const appt = await tx.appointment.findUnique({
    where: { id },
    include: { patient: true, package: true },
  });
  if (!appt) throw new AppError("NOT_FOUND", "Agendamento não encontrado.");
  const [dto] = await buildDTOs([appt], tx);
  return dto;
}

export async function listAppointments(opts: {
  from: Date;
  to: Date;
  includeCanceled?: boolean;
}): Promise<AppointmentDTO[]> {
  const ownerId = await getCurrentOwnerId();
  const statuses = opts.includeCanceled ? ALL_STATUSES : DEFAULT_LIST_STATUSES;
  const appts = await prisma.appointment.findMany({
    where: {
      ownerId,
      startsAt: { gte: opts.from, lt: opts.to },
      status: { in: statuses },
    },
    include: { patient: true, package: true },
    orderBy: { startsAt: "asc" },
  });
  return buildDTOs(appts);
}

async function validatePackageForCreate(
  patientId: string,
  packageId: string,
  tx: TxOrClient,
): Promise<Package> {
  const pkg = await tx.package.findUnique({ where: { id: packageId } });
  if (!pkg || pkg.patientId !== patientId) {
    throw new AppError("NOT_FOUND", "Pacote não encontrado para este paciente.");
  }
  if (pkg.status !== "ACTIVE") {
    throw new AppError("VALIDATION_ERROR", "Este pacote não está ativo.");
  }
  const counters = await getPackageCounters(pkg.id, tx);
  const disponiveis = pkg.totalSessions - counters.consumidas - counters.reservadas;
  if (disponiveis <= 0) {
    throw new AppError(
      "PACKAGE_EXHAUSTED",
      `Este pacote já tem todas as ${pkg.totalSessions} sessões agendadas.`,
      { packageId: pkg.id },
    );
  }
  return pkg;
}

export async function createAppointment(
  input: CreateAppointmentInput,
  opts: { allowOverlap?: boolean } = {},
): Promise<AppointmentDTO> {
  const ownerId = await getCurrentOwnerId();

  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({ where: { id: input.patientId } });
    if (!patient || patient.ownerId !== ownerId) {
      throw new AppError("NOT_FOUND", "Paciente não encontrado.");
    }

    if (input.packageId) {
      await validatePackageForCreate(input.patientId, input.packageId, tx);
    }

    const endsAt = computeEndsAt(input.startsAt, input.durationMinutes);

    // 4.6: duplo clique — se já existe um agendamento ativo idêntico, devolve-o em vez de duplicar.
    const duplicate = await tx.appointment.findFirst({
      where: {
        patientId: input.patientId,
        startsAt: input.startsAt,
        status: { in: ACTIVE_STATUSES },
      },
    });
    if (duplicate) {
      return getAppointmentDTO(duplicate.id, tx);
    }

    if (!opts.allowOverlap) {
      const conflict = await findConflict(ownerId, input.startsAt, endsAt, undefined, tx);
      if (conflict) throwConflict(conflict);
    }

    const created = await tx.appointment.create({
      data: {
        ownerId,
        patientId: input.patientId,
        packageId: input.packageId ?? null,
        startsAt: input.startsAt,
        endsAt,
        notes: input.notes ?? null,
        status: "SCHEDULED",
        consumesSession: true,
      },
    });

    return getAppointmentDTO(created.id, tx);
  });
}

export async function updateAppointment(id: string, input: UpdateAppointmentInput): Promise<AppointmentDTO> {
  const ownerId = await getCurrentOwnerId();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "Agendamento não encontrado.");

    const startsAt = input.startsAt ?? existing.startsAt;
    const durationMinutes =
      input.durationMinutes ?? Math.round((existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000);
    const endsAt = computeEndsAt(startsAt, durationMinutes);

    if (input.startsAt || input.durationMinutes) {
      const conflict = await findConflict(ownerId, startsAt, endsAt, id, tx);
      if (conflict) throwConflict(conflict);
    }

    await tx.appointment.update({
      where: { id },
      data: {
        startsAt,
        endsAt,
        notes: input.notes === undefined ? undefined : input.notes,
      },
    });

    return getAppointmentDTO(id, tx);
  });
}

export async function deleteAppointment(id: string): Promise<void> {
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Agendamento não encontrado.");
  await prisma.appointment.delete({ where: { id } });
}

/** Marca o pacote como COMPLETED se todas as sessões contratadas já foram consumidas (regra 4.1). */
async function maybeCompletePackage(packageId: string | null, tx: Prisma.TransactionClient): Promise<void> {
  if (!packageId) return;
  const pkg = await tx.package.findUnique({ where: { id: packageId } });
  if (!pkg || pkg.status !== "ACTIVE") return;
  const counters = await getPackageCounters(packageId, tx);
  if (counters.consumidas >= pkg.totalSessions) {
    await tx.package.update({ where: { id: packageId }, data: { status: "COMPLETED" } });
  }
}

export async function completeAppointment(id: string): Promise<AppointmentDTO> {
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({ where: { id } });
    if (!appt) throw new AppError("NOT_FOUND", "Agendamento não encontrado.");
    if (appt.status !== "SCHEDULED") {
      throw new AppError("VALIDATION_ERROR", "Só é possível marcar como realizada uma sessão agendada.");
    }

    await tx.appointment.update({
      where: { id },
      data: { status: "COMPLETED", consumesSession: true },
    });
    await maybeCompletePackage(appt.packageId, tx);

    return getAppointmentDTO(id, tx);
  });
}

/** Regra 4.3 — cancelamento (fluxo central do produto). */
export async function cancelAppointment(
  id: string,
  input: Pick<CancelAppointmentInput, "mode"> & Partial<Pick<CancelAppointmentInput, "scope">>,
): Promise<AppointmentDTO> {
  const scope = input.scope ?? "ONE";
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({ where: { id } });
    if (!appt) throw new AppError("NOT_FOUND", "Agendamento não encontrado.");
    if (!ACTIVE_STATUSES.includes(appt.status)) {
      throw new AppError("VALIDATION_ERROR", "Este agendamento já não está mais ativo.");
    }

    if (input.mode === "COUNT") {
      await tx.appointment.update({
        where: { id },
        data: { status: "CANCELED_COUNTED", consumesSession: true, canceledAt: new Date() },
      });
      await maybeCompletePackage(appt.packageId, tx);
      return getAppointmentDTO(id, tx);
    }

    // mode === "FREE": devolve a sessão ao pacote.
    await tx.appointment.update({
      where: { id },
      data: { status: "CANCELED_FREE", consumesSession: false, canceledAt: new Date() },
    });

    // "Este e os próximos" só se aplica ao cancelamento livre (nota da regra 4.3).
    if (scope === "FOLLOWING" && appt.seriesId) {
      const following = await tx.appointment.findMany({
        where: {
          seriesId: appt.seriesId,
          status: "SCHEDULED",
          startsAt: { gt: appt.startsAt },
        },
      });
      for (const f of following) {
        await tx.appointment.update({
          where: { id: f.id },
          data: { status: "CANCELED_FREE", consumesSession: false, canceledAt: new Date() },
        });
      }
    }

    return getAppointmentDTO(id, tx);
  });
}

/** Regra 4.3, caminho 2 — reagendar: original vira RESCHEDULED, cria-se um novo registro. */
export async function rescheduleAppointment(
  id: string,
  input: RescheduleAppointmentInput,
  opts: { allowOverlap?: boolean } = {},
): Promise<AppointmentDTO> {
  const ownerId = await getCurrentOwnerId();

  return prisma.$transaction(async (tx) => {
    const original = await tx.appointment.findUnique({ where: { id } });
    if (!original) throw new AppError("NOT_FOUND", "Agendamento não encontrado.");
    if (!ACTIVE_STATUSES.includes(original.status)) {
      throw new AppError("VALIDATION_ERROR", "Só é possível reagendar um agendamento ativo.");
    }

    const durationMinutes =
      input.durationMinutes ?? Math.round((original.endsAt.getTime() - original.startsAt.getTime()) / 60_000);
    const endsAt = computeEndsAt(input.startsAt, durationMinutes);

    if (!opts.allowOverlap) {
      const conflict = await findConflict(ownerId, input.startsAt, endsAt, original.id, tx);
      if (conflict) throwConflict(conflict);
    }

    await tx.appointment.update({
      where: { id: original.id },
      data: { status: "RESCHEDULED", consumesSession: false, canceledAt: new Date() },
    });

    const created = await tx.appointment.create({
      data: {
        ownerId,
        patientId: original.patientId,
        packageId: original.packageId,
        startsAt: input.startsAt,
        endsAt,
        notes: original.notes,
        status: "SCHEDULED",
        consumesSession: true,
        seriesId: original.seriesId,
        rescheduledFromId: original.id,
      },
    });

    return getAppointmentDTO(created.id, tx);
  });
}
