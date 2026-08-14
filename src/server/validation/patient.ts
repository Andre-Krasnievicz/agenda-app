import { z } from "zod";

export const packageInputSchema = z.object({
  label: z.string().trim().max(120).optional().nullable(),
  totalSessions: z.number().int().positive().max(200),
  priceCents: z.number().int().nonnegative(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type PackageInput = z.infer<typeof packageInputSchema>;

export const createPatientSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório.").max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  // Permite criar o paciente e o primeiro pacote em uma única chamada
  // (ver 7.3.A — a usuária nunca deve sair da agenda para isso).
  package: packageInputSchema.optional(),
});
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const listPatientsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});
