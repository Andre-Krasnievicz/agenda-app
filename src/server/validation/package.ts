import { z } from "zod";
import { packageInputSchema } from "./patient";

export const createPackageSchema = packageInputSchema;
export type CreatePackageInput = z.infer<typeof createPackageSchema>;

export const updatePackageSchema = z.object({
  label: z.string().trim().max(120).optional().nullable(),
  totalSessions: z.number().int().positive().max(200).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELED"]).optional(),
});
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
