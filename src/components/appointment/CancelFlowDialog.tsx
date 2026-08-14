"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localDateTimeToUtc, toLocalHHmm } from "@/lib/time";
import { useCancelAppointmentMutation, useRescheduleAppointmentMutation } from "@/hooks/use-appointment-mutations";
import { ApiClientError } from "@/lib/api-client";
import type { AppointmentDTO } from "@/lib/types";

/** Os três caminhos do cancelamento — regra 4.3 / seção 7.3.C. */
export function CancelFlowDialog({
  appointment,
  open,
  onOpenChange,
  onDone,
}: {
  appointment: AppointmentDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"menu" | "reschedule">("menu");
  const [scope, setScope] = useState<"ONE" | "FOLLOWING">("ONE");
  const [date, setDate] = useState(format(new Date(appointment.startsAt), "yyyy-MM-dd"));
  const [time, setTime] = useState(toLocalHHmm(appointment.startsAt));
  const [conflict, setConflict] = useState<{ patientName: string; startsAt: string; endsAt: string } | null>(null);

  const cancelMutation = useCancelAppointmentMutation();
  const rescheduleMutation = useRescheduleAppointmentMutation();

  const sessionLabel =
    appointment.sessionNumber && appointment.package
      ? `${appointment.sessionNumber} de ${appointment.package.totalSessions}`
      : null;

  function handleCancel(mode: "COUNT" | "FREE") {
    cancelMutation.mutate(
      { id: appointment.id, mode, scope: mode === "FREE" ? scope : "ONE" },
      {
        onSuccess: () => {
          toast.success(mode === "COUNT" ? "Sessão cancelada e contada." : "Sessão cancelada e devolvida ao pacote.");
          onDone();
        },
        onError: (err) => {
          toast.error(err instanceof ApiClientError ? err.message : "Não foi possível cancelar.");
        },
      },
    );
  }

  function handleReschedule(allowOverlap = false) {
    const startsAt = localDateTimeToUtc(new Date(`${date}T00:00:00`), time);
    rescheduleMutation.mutate(
      { id: appointment.id, startsAt: startsAt.toISOString(), allowOverlap },
      {
        onSuccess: () => {
          toast.success("Agendamento reagendado.");
          onDone();
        },
        onError: (err) => {
          if (err instanceof ApiClientError && err.code === "SLOT_CONFLICT") {
            const details = err.details as { conflict?: { patientName: string; startsAt: string; endsAt: string } };
            if (details?.conflict) {
              setConflict(details.conflict);
              return;
            }
          }
          toast.error(err instanceof ApiClientError ? err.message : "Não foi possível reagendar.");
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setStep("menu");
          setConflict(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        {step === "menu" ? (
          <>
            <DialogHeader>
              <DialogTitle>Cancelar agendamento</DialogTitle>
              <DialogDescription>{appointment.patient.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleCancel("COUNT")}
                disabled={cancelMutation.isPending}
                className="w-full rounded-lg border border-line p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/40"
              >
                <p className="font-medium text-ink">Cancelar e contar a sessão</p>
                <p className="text-xs text-ink-muted">
                  {sessionLabel ? `A sessão ${sessionLabel} será considerada usada.` : "A sessão será considerada usada."}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setStep("reschedule")}
                className="w-full rounded-lg border border-line p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/40"
              >
                <p className="font-medium text-ink">Reagendar para outra data</p>
                <p className="text-xs text-ink-muted">Move esta sessão para um novo horário.</p>
              </button>

              <button
                type="button"
                onClick={() => handleCancel("FREE")}
                disabled={cancelMutation.isPending}
                className="w-full rounded-lg border border-line p-3 text-left transition-colors hover:border-danger hover:bg-danger/5"
              >
                <p className="font-medium text-ink">Cancelar e devolver a sessão</p>
                <p className="text-xs text-ink-muted">
                  {appointment.package
                    ? `O pacote volta a ter ${appointment.package.disponiveis + 1} sessões disponíveis.`
                    : "A sessão é liberada."}
                </p>
              </button>

              {appointment.seriesId && (
                <label className="flex items-center gap-2 pt-1 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={scope === "FOLLOWING"}
                    onChange={(e) => setScope(e.target.checked ? "FOLLOWING" : "ONE")}
                  />
                  Aplicar também às próximas sessões desta série (só no cancelamento com devolução)
                </label>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reagendar</DialogTitle>
              <DialogDescription>{appointment.patient.name}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reschedule-date">Nova data</Label>
                <Input id="reschedule-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reschedule-time">Novo horário</Label>
                <Input id="reschedule-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            {conflict && (
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
                <p className="text-ink">
                  Já existe <strong>{conflict.patientName}</strong> das {toLocalHHmm(conflict.startsAt)} às{" "}
                  {toLocalHHmm(conflict.endsAt)}. Reagendar mesmo assim?
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConflict(null)}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => handleReschedule(true)}>
                    Reagendar mesmo assim
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep("menu")}>
                Voltar
              </Button>
              <Button type="button" onClick={() => handleReschedule(false)} disabled={rescheduleMutation.isPending}>
                {rescheduleMutation.isPending ? "Reagendando…" : "Confirmar"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
