import { prisma } from "@/lib/prisma";
import { getCurrentOwnerId } from "@/lib/auth";

/**
 * Backup manual — rede de segurança enquanto o app é um MVP sem
 * autenticação de verdade (seção 7 e 11.1 do plano). Devolve tudo que
 * pertence à dona da agenda, sem paginação: o volume de dados de uma
 * fisioterapeuta autônoma nunca justifica isso.
 */
export async function exportAllData() {
  const ownerId = await getCurrentOwnerId();

  const [patients, packages, appointments] = await Promise.all([
    prisma.patient.findMany({ where: { ownerId }, orderBy: { name: "asc" } }),
    prisma.package.findMany({ where: { ownerId }, orderBy: { purchasedAt: "asc" } }),
    prisma.appointment.findMany({ where: { ownerId }, orderBy: { startsAt: "asc" } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    patients,
    packages,
    appointments,
  };
}
