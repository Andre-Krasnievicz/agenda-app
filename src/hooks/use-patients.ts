"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PatientDTO, PackageDTO } from "@/lib/types";

export function usePatientsSearchQuery(q: string) {
  return useQuery({
    queryKey: ["patients", "search", q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
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
