"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppointmentDTO } from "@/lib/types";

export type CreateAppointmentPayload = {
  patientId: string;
  packageId?: string | null;
  startsAt: string; // ISO UTC
  durationMinutes: number;
  notes?: string | null;
};

export function useCreateAppointmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ allowOverlap, ...payload }: CreateAppointmentPayload & { allowOverlap?: boolean }) =>
      api.post<{ appointment: AppointmentDTO }>(
        `/api/appointments${allowOverlap ? "?allowOverlap=true" : ""}`,
        payload,
      ),
    onSuccess: () => {
      // Invalida qualquer range de agendamentos visível — simples e correto para o volume de dados do MVP.
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}
