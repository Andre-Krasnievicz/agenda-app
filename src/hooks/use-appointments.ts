"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppointmentDTO } from "@/lib/types";

export function appointmentsQueryKey(fromISO: string, toISO: string, includeCanceled = false) {
  return ["appointments", fromISO, toISO, includeCanceled] as const;
}

export function useAppointmentsQuery(range: { from: Date; to: Date }, includeCanceled = false) {
  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  return useQuery({
    queryKey: appointmentsQueryKey(fromISO, toISO, includeCanceled),
    queryFn: async () => {
      const params = new URLSearchParams({ from: fromISO, to: toISO });
      if (includeCanceled) params.set("includeCanceled", "true");
      const { appointments } = await api.get<{ appointments: AppointmentDTO[] }>(
        `/api/appointments?${params.toString()}`,
      );
      return appointments;
    },
  });
}
