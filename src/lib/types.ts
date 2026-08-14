/**
 * Tipos de DTO compartilhados entre front e back. Ficam aqui (não em
 * `server/`) para que componentes de cliente possam importá-los sem puxar
 * nada do Prisma/servidor para o bundle.
 */
import type { AppointmentStatus, PackageStatus } from "@prisma/client";

export type { AppointmentStatus, PackageStatus };

export type AppointmentDTO = {
  id: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string | null;
  seriesId: string | null;
  rescheduledFrom: { id: string; startsAt: string } | null;
  patient: { id: string; name: string; phone: string | null; notes: string | null };
  package: {
    id: string;
    label: string | null;
    totalSessions: number;
    priceCents: number;
    consumidas: number;
    reservadas: number;
    disponiveis: number;
  } | null;
  sessionNumber: number | null;
};
