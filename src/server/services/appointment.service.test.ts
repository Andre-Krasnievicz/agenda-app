import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { localDayRange, toUtc } from "@/lib/time";
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  getAppointmentDTO,
  listAppointments,
  rescheduleAppointment,
} from "./appointment.service";

// Datas bem no futuro para nunca colidir com o seed nem com dados reais da agenda.
const BASE = new Date("2031-03-04T12:00:00.000Z"); // uma terça-feira, meio-dia UTC
const at = (hour: number, minute = 0) => {
  const d = new Date(BASE);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
};

describe("appointment.service", () => {
  let patientId: string;

  beforeAll(async () => {
    const patient = await prisma.patient.create({
      data: { ownerId: "owner-default", name: "Paciente Teste Vitest" },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { patientId } });
    await prisma.package.deleteMany({ where: { patientId } });
    await prisma.patient.delete({ where: { id: patientId } });
    await prisma.$disconnect();
  });

  it("detecta conflito de horário e recusa a criação sobreposta", async () => {
    await createAppointment({
      patientId,
      startsAt: at(8, 0),
      durationMinutes: 60,
    });

    await expect(
      createAppointment({
        patientId,
        startsAt: at(8, 30),
        durationMinutes: 60,
      }),
    ).rejects.toMatchObject({ code: "SLOT_CONFLICT" });

    // Fora do horário do primeiro: não deve conflitar.
    const ok = await createAppointment({
      patientId,
      startsAt: at(9, 0),
      durationMinutes: 60,
    });
    expect(ok.status).toBe("SCHEDULED");
  });

  it("recusa criar agendamento quando o pacote está esgotado", async () => {
    const pkg = await prisma.package.create({
      data: { ownerId: "owner-default", patientId, totalSessions: 2, priceCents: 20000 },
    });

    await createAppointment({ patientId, packageId: pkg.id, startsAt: at(11, 0), durationMinutes: 30 });
    await createAppointment({ patientId, packageId: pkg.id, startsAt: at(11, 30), durationMinutes: 30 });

    await expect(
      createAppointment({ patientId, packageId: pkg.id, startsAt: at(12, 0), durationMinutes: 30 }),
    ).rejects.toMatchObject({ code: "PACKAGE_EXHAUSTED" });
  });

  it("pacote vira COMPLETED automaticamente ao consumir a última sessão", async () => {
    const pkg = await prisma.package.create({
      data: { ownerId: "owner-default", patientId, totalSessions: 1, priceCents: 10000 },
    });
    const appt = await createAppointment({ patientId, packageId: pkg.id, startsAt: at(13, 0), durationMinutes: 30 });

    await completeAppointment(appt.id);

    const updated = await prisma.package.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(updated.status).toBe("COMPLETED");
  });

  it("renumera as sessões corretamente depois de um reagendamento", async () => {
    const pkg = await prisma.package.create({
      data: { ownerId: "owner-default", patientId, totalSessions: 10, priceCents: 100000 },
    });

    const s1 = await createAppointment({ patientId, packageId: pkg.id, startsAt: at(14, 0), durationMinutes: 30 });
    const s2 = await createAppointment({ patientId, packageId: pkg.id, startsAt: at(14, 30), durationMinutes: 30 });
    const s3 = await createAppointment({ patientId, packageId: pkg.id, startsAt: at(15, 0), durationMinutes: 30 });

    expect(s1.sessionNumber).toBe(1);
    expect(s2.sessionNumber).toBe(2);
    expect(s3.sessionNumber).toBe(3);

    // Reagenda a sessão 1 (s1) para depois da sessão 3 (s3) -> a numeração deve se corrigir sozinha.
    const rescheduled = await rescheduleAppointment(s1.id, { startsAt: at(15, 30), durationMinutes: 30 });

    const original = await getAppointmentDTO(s1.id);
    expect(original.status).toBe("RESCHEDULED");
    expect(original.sessionNumber).toBeNull(); // não consome sessão, não entra na numeração

    const s2After = await getAppointmentDTO(s2.id);
    const s3After = await getAppointmentDTO(s3.id);

    expect(s2After.sessionNumber).toBe(1);
    expect(s3After.sessionNumber).toBe(2);
    expect(rescheduled.sessionNumber).toBe(3);
    expect(rescheduled.rescheduledFrom?.id).toBe(s1.id);
  });

  it("cancelar contando a sessão mantém consumesSession e libera o horário para conflito", async () => {
    const appt = await createAppointment({ patientId, startsAt: at(18, 0), durationMinutes: 30 });
    const canceled = await cancelAppointment(appt.id, { mode: "COUNT" });
    expect(canceled.status).toBe("CANCELED_COUNTED");

    // O horário cancelado não deve mais gerar conflito (regra 4.2 ignora cancelados).
    const another = await createAppointment({ patientId, startsAt: at(18, 0), durationMinutes: 30 });
    expect(another.status).toBe("SCHEDULED");
  });

  it("cancelar sem contar devolve a sessão ao pacote", async () => {
    const pkg = await prisma.package.create({
      data: { ownerId: "owner-default", patientId, totalSessions: 5, priceCents: 50000 },
    });
    const appt = await createAppointment({ patientId, packageId: pkg.id, startsAt: at(19, 0), durationMinutes: 30 });
    expect(appt.package?.disponiveis).toBe(4);

    const canceled = await cancelAppointment(appt.id, { mode: "FREE" });
    expect(canceled.status).toBe("CANCELED_FREE");
    expect(canceled.package?.disponiveis).toBe(5);
  });

  it("armadilha 8 — atendimento às 21:00 local aparece na listagem do dia certo", async () => {
    // Dia isolado (não usado em nenhum outro teste), bem no futuro.
    const localDay = new Date(2032, 8, 15); // 15/set/2032 — calendário local, ver lib/time.ts
    const startsAt = toUtc(new Date(2032, 8, 15, 21, 0, 0, 0)); // 21:00 em America/Cuiaba

    const created = await createAppointment({ patientId, startsAt, durationMinutes: 30 });

    const { from, to } = localDayRange(localDay);
    const results = await listAppointments({ from, to });

    expect(results.some((a) => a.id === created.id)).toBe(true);
  });
});
