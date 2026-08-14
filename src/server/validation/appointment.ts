import { z } from "zod";
import { MAX_DURATION_MINUTES } from "@/config/calendar";

const durationSchema = z
  .number()
  .int()
  .positive("Duração deve ser maior que zero.")
  .max(MAX_DURATION_MINUTES, "Duração não pode passar de 8 horas.");

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  packageId: z.string().min(1).optional().nullable(),
  startsAt: z.coerce.date(),
  durationMinutes: durationSchema,
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  startsAt: z.coerce.date().optional(),
  durationMinutes: durationSchema.optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
  mode: z.enum(["COUNT", "FREE"]),
  scope: z.enum(["ONE", "FOLLOWING"]).optional().default("ONE"),
});
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

export const rescheduleAppointmentSchema = z.object({
  startsAt: z.coerce.date(),
  durationMinutes: durationSchema.optional(),
});
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export const listAppointmentsQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  includeCanceled: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export const allowOverlapQuerySchema = z
  .union([z.literal("true"), z.literal("false")])
  .optional()
  .transform((v) => v === "true");

// `startDate`/`untilDate` chegam como "YYYY-MM-DD" (data de calendário local, não instante) e
// são parseadas manualmente no service via `new Date(y, m-1, d)` — nunca `z.coerce.date()` aqui:
// `new Date("2026-03-12")` vira meia-noite UTC, a armadilha #1 da seção 12 do plano.
const localDateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const seriesSchema = z
  .object({
    patientId: z.string().min(1),
    packageId: z.string().min(1).optional().nullable(),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido."),
    durationMinutes: durationSchema,
    startDate: localDateKeySchema,
    count: z.number().int().positive().max(200).optional(),
    untilDate: localDateKeySchema.optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
    allowOverlap: z.boolean().optional().default(false),
  })
  .refine((v) => v.count !== undefined || v.untilDate !== undefined, {
    message: "Informe `count` ou `untilDate`.",
  });
export type SeriesInput = z.infer<typeof seriesSchema>;

/** "YYYY-MM-DD" -> data de calendário local (Y/M/D via getters de sistema, hora zerada). */
export function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
