import type { Patient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/lib/auth";
import { AppError } from "@/server/errors";
import type { CreatePatientInput, UpdatePatientInput } from "@/server/validation/patient";
import { attachCounters, createPackageForPatient, type PackageWithCounters } from "./package.service";

export type PatientWithActivePackage = Patient & {
  activePackage: PackageWithCounters | null;
};

async function attachActivePackage(patient: Patient): Promise<PatientWithActivePackage> {
  const pkg = await prisma.package.findFirst({
    where: { patientId: patient.id, status: "ACTIVE" },
    orderBy: { purchasedAt: "desc" },
  });
  return { ...patient, activePackage: pkg ? await attachCounters(pkg) : null };
}

export async function listPatients(opts: {
  q?: string;
  includeArchived?: boolean;
}): Promise<PatientWithActivePackage[]> {
  const ownerId = await getCurrentOwnerId();
  const patients = await prisma.patient.findMany({
    where: {
      ownerId,
      active: opts.includeArchived ? undefined : true,
      name: opts.q ? { contains: opts.q, mode: "insensitive" } : undefined,
    },
    orderBy: { name: "asc" },
    take: 50,
  });
  return Promise.all(patients.map(attachActivePackage));
}

export async function getPatientOr404(id: string): Promise<PatientWithActivePackage> {
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw new AppError("NOT_FOUND", "Paciente não encontrado.");
  return attachActivePackage(patient);
}

export async function createPatient(input: CreatePatientInput): Promise<PatientWithActivePackage> {
  const ownerId = await getCurrentOwnerId();

  const patient = await prisma.$transaction(async (tx) => {
    const created = await tx.patient.create({
      data: {
        ownerId,
        name: input.name,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      },
    });
    if (input.package) {
      await createPackageForPatient(created.id, input.package, tx);
    }
    return created;
  });

  return attachActivePackage(patient);
}

export async function updatePatient(id: string, input: UpdatePatientInput): Promise<PatientWithActivePackage> {
  const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Paciente não encontrado.");

  const updated = await prisma.patient.update({
    where: { id },
    data: {
      name: input.name,
      phone: input.phone,
      notes: input.notes,
      active: input.active,
    },
  });
  return attachActivePackage(updated);
}
