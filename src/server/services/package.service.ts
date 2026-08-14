import { Prisma, type Package } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/server/errors";
import type { CreatePackageInput, UpdatePackageInput } from "@/server/validation/package";

// Sem `disponiveis` aqui de propósito: esse número depende de `totalSessions`,
// que só o Package conhece. Calculá-lo neste tipo já convidou a um bug (ver
// git blame) — quem quiser o pacote completo usa `withDisponiveis`/`attachCounters`.
// `completed`/`canceledCounted` são o detalhamento de `consumidas` (soma dos
// dois) — existem só para o PackageProgress (seção 8.3) distinguir visualmente
// "realizada" de "cancelada e contada"; o contrato da API (seção 5) continua
// expondo apenas consumidas/reservadas/disponiveis.
export type PackageCounters = {
  consumidas: number;
  reservadas: number;
  completed: number;
  canceledCounted: number;
};

export type PackageWithCounters = Package & PackageCounters & { disponiveis: number };

/**
 * Contadores do pacote — regra 4.1. Único lugar que calcula isso; se
 * precisar em outro service, importe daqui, nunca reimplemente.
 */
export async function getPackageCounters(
  packageId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<PackageCounters> {
  const [completed, canceledCounted, reservadas] = await Promise.all([
    tx.appointment.count({ where: { packageId, status: "COMPLETED" } }),
    tx.appointment.count({ where: { packageId, status: "CANCELED_COUNTED" } }),
    tx.appointment.count({ where: { packageId, status: "SCHEDULED" } }),
  ]);
  return { consumidas: completed + canceledCounted, reservadas, completed, canceledCounted };
}

export function withDisponiveis(pkg: Package, counters: PackageCounters): PackageWithCounters {
  const disponiveis = pkg.totalSessions - counters.consumidas - counters.reservadas;
  return { ...pkg, ...counters, disponiveis };
}

export async function attachCounters(
  pkg: Package,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<PackageWithCounters> {
  const counters = await getPackageCounters(pkg.id, tx);
  return withDisponiveis(pkg, counters);
}

export async function getPackageOr404(id: string): Promise<PackageWithCounters> {
  const pkg = await prisma.package.findUnique({ where: { id } });
  if (!pkg) throw new AppError("NOT_FOUND", "Pacote não encontrado.");
  return attachCounters(pkg);
}

export async function createPackageForPatient(
  patientId: string,
  input: CreatePackageInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Package> {
  const patient = await tx.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new AppError("NOT_FOUND", "Paciente não encontrado.");

  return tx.package.create({
    data: {
      ownerId: patient.ownerId,
      patientId,
      label: input.label ?? null,
      totalSessions: input.totalSessions,
      priceCents: input.priceCents,
      notes: input.notes ?? null,
    },
  });
}

export async function listPackagesByPatient(patientId: string): Promise<PackageWithCounters[]> {
  const packages = await prisma.package.findMany({
    where: { patientId },
    orderBy: { purchasedAt: "desc" },
  });
  return Promise.all(packages.map((p) => attachCounters(p)));
}

export async function updatePackage(id: string, input: UpdatePackageInput): Promise<PackageWithCounters> {
  const pkg = await prisma.package.findUnique({ where: { id } });
  if (!pkg) throw new AppError("NOT_FOUND", "Pacote não encontrado.");

  if (input.totalSessions !== undefined) {
    const counters = await getPackageCounters(id);
    if (input.totalSessions < counters.consumidas) {
      throw new AppError(
        "PACKAGE_TOO_SMALL",
        `Este pacote já tem ${counters.consumidas} sessões usadas.`,
        { consumidas: counters.consumidas },
      );
    }
  }

  const updated = await prisma.package.update({
    where: { id },
    data: {
      label: input.label,
      totalSessions: input.totalSessions,
      priceCents: input.priceCents,
      notes: input.notes,
      status: input.status,
    },
  });
  return attachCounters(updated);
}
