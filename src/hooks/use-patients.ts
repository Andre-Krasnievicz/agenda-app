"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PatientDTO, PackageDTO } from "@/lib/types";

export function usePatientsSearchQuery(q: string, opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false;
  return useQuery({
    queryKey: ["patients", "search", q, includeArchived],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (includeArchived) params.set("includeArchived", "true");
      const { patients } = await api.get<{ patients: PatientDTO[] }>(`/api/patients?${params.toString()}`);
      return patients;
    },
    // Mantém o resultado anterior visível enquanto a nova busca carrega (sem "piscar").
    placeholderData: (prev) => prev,
  });
}

export function usePatientPackagesQuery(patientId: string | null) {
  return useQuery({
    queryKey: ["patients", patientId, "packages"],
    enabled: !!patientId,
    queryFn: async () => {
      const { packages } = await api.get<{ packages: PackageDTO[] }>(`/api/patients/${patientId}/packages`);
      return packages;
    },
  });
}

export type CreatePatientPayload = {
  name: string;
  phone?: string | null;
  notes?: string | null;
  package?: { totalSessions: number; priceCents: number; label?: string | null };
};

export function useCreatePatientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePatientPayload) => api.post<{ patient: PatientDTO }>("/api/patients", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useUpdatePatientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      name?: string;
      phone?: string | null;
      notes?: string | null;
      active?: boolean;
    }) => api.patch<{ patient: PatientDTO }>(`/api/patients/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useUpdatePackageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      label?: string | null;
      totalSessions?: number;
      priceCents?: number;
      notes?: string | null;
      status?: "ACTIVE" | "COMPLETED" | "CANCELED";
    }) => api.patch<{ package: PackageDTO }>(`/api/packages/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useCreatePackageMutation(patientId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { totalSessions: number; priceCents: number; label?: string | null }) =>
      api.post<{ package: PackageDTO }>(`/api/patients/${patientId}/packages`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}
