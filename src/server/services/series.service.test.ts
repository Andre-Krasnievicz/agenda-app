import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { toUtc } from "@/lib/time";
import { generateSeriesLocalDates, createSeries, previewSeries } from "./series.service";

describe("generateSeriesLocalDates", () => {
  it("gera terças e quintas a partir de uma segunda, respeitando `count`", () => {
    // 2032-01-05 é uma segunda-feira.
    const dates = generateSeriesLocalDates({
      startDate: new Date(2032, 0, 5),
      weekdays: [2, 4], // terça, quinta
      count: 4,
    });
    expect(dates).toHaveLength(4);
    const labels = dates.map((d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} (${d.getDay()})`);
    expect(labels).toEqual([
      "2032-1-6 (2)", // terça
      "2032-1-8 (4)", // quinta
      "2032-1-13 (2)",
      "2032-1-15 (4)",
    ]);
  });

  it("respeita `untilDate` inclusive", () => {
    const dates = generateSeriesLocalDates({
      startDate: new Date(2032, 0, 5),
      weekdays: [2, 4],
      untilDate: new Date(2032, 0, 13), // a própria 2ª terça, incluída
    });
    // 6/jan (terça), 8/jan (quinta), 13/jan (terça) — 15/jan (quinta) já passa do limite.
    expect(dates).toHaveLength(3);
  });

  it("não gera nada se a data inicial já passou de `untilDate`", () => {
    const dates = generateSeriesLocalDates({
      startDate: new Date(2032, 0, 20),
      weekdays: [2, 4],
      untilDate: new Date(2032, 0, 5),
    });
    expect(dates).toHaveLength(0);
  });
});

describe("series.service (integração)", () => {
  let patientId: string;

  beforeAll(async () => {
    const patient = await prisma.patient.create({
      data: { ownerId: "owner-default", name: "Paciente Teste Série" },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { patientId } });
    await prisma.package.deleteMany({ where: { patientId } });
    await prisma.patient.delete({ where: { id: patientId } });
    await prisma.$disconnect();
  });

  it("gera exatamente `count` ocorrências e para de gerar ao esgotar o pacote", async () => {
    const pkg = await prisma.package.create({
      data: { ownerId: "owner-default", patientId, totalSessions: 3, priceCents: 30000 },
    });

    // Pede 10 terças e quintas, mas o pacote só tem 3 sessões disponíveis.
    const result = await createSeries({
      patientId,
      packageId: pkg.id,
      weekdays: [2, 4],
      time: "14:00",
      durationMinutes: 60,
      startDate: "2033-02-07", // uma segunda-feira
      count: 10,
      allowOverlap: false,
    });

    expect(result.created).toHaveLength(3);

    const updatedPkg = await prisma.package.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(updatedPkg.status).toBe("ACTIVE"); // 3 reservadas, 0 consumidas — ainda não completou

    const all = result.created.every((a) => a.seriesId === result.seriesId);
    expect(all).toBe(true);
  });

  it("a prévia (dryRun) sinaliza conflitos sem criar nada", async () => {
    // 2034-05-01 é uma segunda-feira; a série pede segundas às 18:00.
    const conflictLocalDay = new Date(2034, 4, 1);
    const existing = await prisma.appointment.create({
      data: {
        ownerId: "owner-default",
        patientId,
        startsAt: toUtc(new Date(2034, 4, 1, 18, 0)),
        endsAt: toUtc(new Date(2034, 4, 1, 19, 0)),
        status: "SCHEDULED",
      },
    });

    const preview = await previewSeries({
      patientId,
      weekdays: [conflictLocalDay.getDay()],
      time: "18:00",
      durationMinutes: 60,
      startDate: "2034-05-01",
      count: 1,
      allowOverlap: false,
    });

    expect(preview.dates).toHaveLength(1);
    expect(preview.dates[0].conflict).toBe(true);

    const countBefore = await prisma.appointment.count({
      where: { patientId, startsAt: { gte: new Date(2034, 0, 1), lt: new Date(2035, 0, 1) } },
    });
    expect(countBefore).toBe(1); // só o `existing`, dryRun não criou nada

    await prisma.appointment.delete({ where: { id: existing.id } });
  });
});
