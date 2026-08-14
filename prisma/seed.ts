import { PrismaClient, AppointmentStatus } from "@prisma/client";
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds, startOfWeek } from "date-fns";
import { toUtc } from "../src/lib/time";

const prisma = new PrismaClient();

const OWNER = "owner-default";

/** Constrói um instante local (America/Cuiaba) na semana atual e converte para UTC. */
function localAt(dayOffsetFromMonday: number, hour: number, minute = 0): Date {
  const mondayThisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  let d = addDays(mondayThisWeek, dayOffsetFromMonday);
  d = setHours(d, hour);
  d = setMinutes(d, minute);
  d = setSeconds(d, 0);
  d = setMilliseconds(d, 0);
  return toUtc(d);
}

async function main() {
  console.log("Limpando dados existentes...");
  await prisma.appointment.deleteMany();
  await prisma.package.deleteMany();
  await prisma.patient.deleteMany();

  console.log("Criando pacientes e pacotes...");

  const patientsData = [
    { name: "Ana Costa", phone: "+55 66 99911-2233", notes: "Reabilitação de joelho direito (LCA)." },
    { name: "Bruno Alves", phone: "+55 66 99822-1144", notes: "Lombalgia crônica, evitar carga axial." },
    { name: "Carla Nunes", phone: "+55 66 99733-5566", notes: "Pós-operatório de ombro esquerdo." },
    { name: "Diego Ramos", phone: "+55 66 99644-7788", notes: null },
  ];

  const patients = [];
  for (const p of patientsData) {
    const patient = await prisma.patient.create({ data: { ownerId: OWNER, ...p } });
    patients.push(patient);
  }

  const [ana, bruno, carla, diego] = patients;

  // Dois pacotes por paciente: um ativo (o mais recente) e um já concluído/histórico.
  const packagesByPatient = new Map<string, { active: string; old: string }>();

  for (const patient of patients) {
    const oldPkg = await prisma.package.create({
      data: {
        ownerId: OWNER,
        patientId: patient.id,
        label: "Pacote 10 sessões - avaliação inicial",
        totalSessions: 10,
        priceCents: 120000,
        status: "COMPLETED",
        purchasedAt: addDays(new Date(), -90),
      },
    });
    const activePkg = await prisma.package.create({
      data: {
        ownerId: OWNER,
        patientId: patient.id,
        label: "Pacote 10 sessões - manutenção",
        totalSessions: 10,
        priceCents: 130000,
        status: "ACTIVE",
        purchasedAt: addDays(new Date(), -10),
      },
    });
    packagesByPatient.set(patient.id, { active: activePkg.id, old: oldPkg.id });
  }

  console.log("Criando agendamentos da semana atual...");

  type Seed = {
    patient: (typeof patients)[number];
    dayOffset: number; // 0 = segunda
    hour: number;
    minute?: number;
    durationMinutes?: number;
    status?: AppointmentStatus;
    notes?: string;
  };

  const seeds: Seed[] = [
    // Ana Costa — terças e quintas às 14h (padrão de recorrência)
    { patient: ana, dayOffset: 0, hour: 8 },
    { patient: ana, dayOffset: 1, hour: 14 },
    { patient: ana, dayOffset: 3, hour: 14 },
    { patient: ana, dayOffset: 3, hour: 9, durationMinutes: 90, notes: "Avaliação de amplitude de movimento." },

    // Bruno Alves
    { patient: bruno, dayOffset: 0, hour: 10 },
    { patient: bruno, dayOffset: 2, hour: 10 },
    { patient: bruno, dayOffset: 4, hour: 10 },
    { patient: bruno, dayOffset: 1, hour: 16, status: "CANCELED_COUNTED", notes: "Faltou, avisou em cima da hora." },

    // Carla Nunes
    { patient: carla, dayOffset: 1, hour: 8 },
    { patient: carla, dayOffset: 4, hour: 8 },
    { patient: carla, dayOffset: 2, hour: 15 },

    // Diego Ramos
    { patient: diego, dayOffset: 0, hour: 17 },
    { patient: diego, dayOffset: 2, hour: 17 },
    { patient: diego, dayOffset: 4, hour: 17 },
  ];

  for (const s of seeds) {
    const pkgs = packagesByPatient.get(s.patient.id)!;
    const startsAt = localAt(s.dayOffset, s.hour, s.minute ?? 0);
    const durationMinutes = s.durationMinutes ?? 60;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const status = s.status ?? "SCHEDULED";
    const consumesSession = status !== "CANCELED_FREE" && status !== "RESCHEDULED";

    await prisma.appointment.create({
      data: {
        ownerId: OWNER,
        patientId: s.patient.id,
        packageId: pkgs.active,
        startsAt,
        endsAt,
        status,
        consumesSession,
        notes: s.notes,
        canceledAt: status === "CANCELED_COUNTED" || status === "CANCELED_FREE" ? new Date() : null,
      },
    });
  }

  // Um caso de reagendamento: sessão de Carla na quarta às 11h foi movida para sexta às 13h.
  const original = await prisma.appointment.create({
    data: {
      ownerId: OWNER,
      patientId: carla.id,
      packageId: packagesByPatient.get(carla.id)!.active,
      startsAt: localAt(2, 11),
      endsAt: new Date(localAt(2, 11).getTime() + 60 * 60_000),
      status: "RESCHEDULED",
      consumesSession: false,
      canceledAt: new Date(),
    },
  });
  await prisma.appointment.create({
    data: {
      ownerId: OWNER,
      patientId: carla.id,
      packageId: packagesByPatient.get(carla.id)!.active,
      startsAt: localAt(4, 13),
      endsAt: new Date(localAt(4, 13).getTime() + 60 * 60_000),
      status: "SCHEDULED",
      consumesSession: true,
      rescheduledFromId: original.id,
    },
  });

  const count = await prisma.appointment.count();
  console.log(`Seed concluído: ${patients.length} pacientes, ${patients.length * 2} pacotes, ${count} agendamentos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
