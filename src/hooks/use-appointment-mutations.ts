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

function useInvalidateAppointments() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["appointments"] });
}

export function useCreateAppointmentMutation() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: ({ allowOverlap, ...payload }: CreateAppointmentPayload & { allowOverlap?: boolean }) =>
      api.post<{ appointment: AppointmentDTO }>(
        `/api/appointments${allowOverlap ? "?allowOverlap=true" : ""}`,
        payload,
      ),
    // Invalida qualquer range de agendamentos visível — simples e correto para o volume de dados do MVP.
    onSuccess: invalidate,
  });
}

export function useUpdateAppointmentMutation() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      startsAt?: string;
      durationMinutes?: number;
      notes?: string | null;
    }) => api.patch<{ appointment: AppointmentDTO }>(`/api/appointments/${id}`, payload),
    onSuccess: invalidate,
  });
}

export function useCompleteAppointmentMutation() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: (id: string) => api.post<{ appointment: AppointmentDTO }>(`/api/appointments/${id}/complete`),
    onSuccess: invalidate,
  });
}

export function useCancelAppointmentMutation() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: ({ id, mode, scope }: { id: string; mode: "COUNT" | "FREE"; scope?: "ONE" | "FOLLOWING" }) =>
      api.post<{ appointment: AppointmentDTO }>(`/api/appointments/${id}/cancel`, { mode, scope }),
    onSuccess: invalidate,
  });
}

export function useRescheduleAppointmentMutation() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: ({
      id,
      allowOverlap,
      ...payload
    }: {
      id: string;
      startsAt: string;
      durationMinutes?: number;
      allowOverlap?: boolean;
    }) =>
      api.post<{ appointment: AppointmentDTO }>(
        `/api/appointments/${id}/reschedule${allowOverlap ? "?allowOverlap=true" : ""}`,
        payload,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteAppointmentMutation() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/appointments/${id}`),
    onSuccess: invalidate,
  });
}
