"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Phone, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PackageProgress } from "@/components/patient/PackageProgress";
import { CancelFlowDialog } from "./CancelFlowDialog";
import { AppointmentFormDialog } from "./AppointmentFormDialog";
import { toLocalHHmm } from "@/lib/time";
import { formatCents } from "@/lib/format";
import {
  useCompleteAppointmentMutation,
  useDeleteAppointmentMutation,
  useUpdateAppointmentMutation,
} from "@/hooks/use-appointment-mutations";
import { ApiClientError } from "@/lib/api-client";
import type { AppointmentDTO } from "@/lib/types";

const STATUS_LABEL: Record<AppointmentDTO["status"], string> = {
  SCHEDULED: "Agendado",
  COMPLETED: "Realizado",
  CANCELED_COUNTED: "Cancelado (contou sessão)",
  CANCELED_FREE: "Cancelado",
  RESCHEDULED: "Reagendado",
};

export function AppointmentDetailsDialog({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: AppointmentDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [notesFor, setNotesFor] = useState(appointment?.id ?? null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const completeMutation = useCompleteAppointmentMutation();
  const updateMutation = useUpdateAppointmentMutation();
  const deleteMutation = useDeleteAppointmentMutation();

  // Estado local dos campos deriva do appointment durante o render (ver AppointmentFormDialog
  // para a justificativa do padrão) — evita useEffect+setState quando a dialog reabre com outro registro.
  if (appointment && appointment.id !== notesFor) {
    setNotesFor(appointment.id);
    setNotes(appointment.notes ?? "");
  }

  if (!appointment) return null;

  const startLocal = new Date(appointment.startsAt);
  const dateLabel = format(startLocal, "EEEE, d 'de' MMMM", { locale: ptBR });
  const dateLabelCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  const timeLabel = `${toLocalHHmm(appointment.startsAt)}–${toLocalHHmm(appointment.endsAt)}`;
  const avgSession = appointment.package ? appointment.package.priceCents / appointment.package.totalSessions : null;

  function saveNotes() {
    if (!appointment) return;
    updateMutation.mutate(
      { id: appointment.id, notes },
      {
        onSuccess: () => toast.success("Observações salvas."),
        onError: (err) => toast.error(err instanceof ApiClientError ? err.message : "Não foi possível salvar."),
      },
    );
  }

  function markCompleted() {
    if (!appointment) return;
    completeMutation.mutate(appointment.id, {
      onSuccess: () => toast.success("Sessão marcada como realizada."),
      onError: (err) => toast.error(err instanceof ApiClientError ? err.message : "Não foi possível confirmar."),
    });
  }

  function handleDelete() {
    if (!appointment) return;
    deleteMutation.mutate(appointment.id, {
      onSuccess: () => {
        toast.success("Agendamento excluído.");
        onOpenChange(false);
      },
      onError: (err) => toast.error(err instanceof ApiClientError ? err.message : "Não foi possível excluir."),
    });
  }

  const isActive = appointment.status === "SCHEDULED" || appointment.status === "COMPLETED";

  return (
    <>
      <Dialog open={open && !cancelOpen && !editOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {appointment.patient.name}
              {appointment.status !== "SCHEDULED" && (
                <Badge variant="secondary" className="font-normal">
                  {STATUS_LABEL[appointment.status]}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {dateLabelCap} · {timeLabel}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {appointment.patient.phone && (
              <a
                href={`tel:${appointment.patient.phone}`}
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Phone className="size-4" />
                {appointment.patient.phone}
              </a>
            )}

            {appointment.rescheduledFrom && (
              <p className="text-xs text-ink-muted">
                Reagendado de {format(new Date(appointment.rescheduledFrom.startsAt), "dd/MM 'às' HH:mm")}
              </p>
            )}

            {appointment.package && (
              <div className="space-y-1.5 rounded-lg border border-line bg-bg p-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium text-ink">
                    {appointment.sessionNumber
                      ? `Sessão ${appointment.sessionNumber} de ${appointment.package.totalSessions}`
                      : appointment.package.label ?? "Pacote"}
                  </p>
                  <p className="font-mono text-xs text-ink-muted">
                    {formatCents(appointment.package.priceCents)} · méd.{" "}
                    {avgSession !== null ? formatCents(avgSession) : "—"}/sessão
                  </p>
                </div>
                <PackageProgress
                  totalSessions={appointment.package.totalSessions}
                  completed={appointment.package.completed ?? 0}
                  canceledCounted={appointment.package.canceledCounted ?? 0}
                  reservadas={appointment.package.reservadas}
                />
              </div>
            )}

            {appointment.patient.notes && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-ink-muted">Observações do paciente</p>
                <p className="text-sm text-ink">{appointment.patient.notes}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-muted">Observações da sessão</p>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              {notes !== (appointment.notes ?? "") && (
                <Button type="button" size="sm" variant="outline" onClick={saveNotes} disabled={updateMutation.isPending}>
                  Salvar observações
                </Button>
              )}
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div className="flex gap-2">
              {isActive && (
                <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  Editar
                </Button>
              )}
              {appointment.status === "SCHEDULED" && (
                <Button type="button" variant="outline" size="sm" onClick={markCompleted} disabled={completeMutation.isPending}>
                  Marcar como realizada
                </Button>
              )}
              {isActive && (
                <Button type="button" variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
                  Cancelar
                </Button>
              )}
            </div>

            {!confirmingDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Mais ações"
                onClick={() => setConfirmingDelete(true)}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-muted">Excluir de vez?</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                  Não
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending}>
                  Excluir
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CancelFlowDialog
        appointment={appointment}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onDone={() => {
          setCancelOpen(false);
          onOpenChange(false);
        }}
      />

      <AppointmentFormDialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) onOpenChange(false);
        }}
        editingAppointment={appointment}
      />
    </>
  );
}
