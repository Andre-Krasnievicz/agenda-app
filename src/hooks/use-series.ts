"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppointmentDTO } from "@/lib/types";

export type SeriesPayload = {
  patientId: string;
  packageId?: string | null;
  weekdays: number[];
  time: string;
  durationMinutes: number;
  startDate: string; // "YYYY-MM-DD"
  count?: number;
  untilDate?: string; // "YYYY-MM-DD"
  notes?: string | null;
  allowOverlap?: boolean;
};

export type SeriesPreviewItem = { startsAt: string; endsAt: string; conflict: boolean };
export type SeriesPreviewResult = {
  dates: SeriesPreviewItem[];
  cappedByPackage: boolean;
  packageDisponiveis: number | null;
};

export function useSeriesPreviewMutation() {
  return useMutation({
    mutationFn: (payload: SeriesPayload) =>
      api.post<SeriesPreviewResult>("/api/appointments/series?dryRun=true", payload),
  });
}

export function useCreateSeriesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SeriesPayload) =>
      api.post<{ seriesId: string; created: AppointmentDTO[]; skipped: { startsAt: string; reason: string }[] }>(
        "/api/appointments/series",
        payload,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments"] }),
  });
}
