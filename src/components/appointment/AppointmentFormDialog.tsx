"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PatientCombobox } from "@/components/patient/PatientCombobox";
import { NewPatientInlineForm } from "@/components/patient/NewPatientInlineForm";
import { RecurrenceFields } from "./RecurrenceFields";
import { DURATION_CHIPS, DEFAULT_DURATION_MINUTES, MAX_DURATION_MINUTES } from "@/config/calendar";
import { localDateTimeToUtc, toLocalHHmm } from "@/lib/time";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePatientPackagesQuery, useCreatePackageMutation } from "@/hooks/use-patients";
import { useCreateAppointmentMutation, useUpdateAppointmentMutation } from "@/hooks/use-appointment-mutations";
import { ApiClientError } from "@/lib/api-client";
import type { AppointmentDTO, PatientDTO } from "@/lib/types";

const formSchema = z.object({
  date: z.string().min(1, "Selecione a data."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Selecione o horário."),
  durationMinutes: z.number().int().positive().max(MAX_DURATION_MINUTES),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const NO_PACKAGE = "__none__";

export function AppointmentFormDialog({
  open,
  onOpenChange,
  initialStartsAt,
  defaultLocalDay,
  editingAppointment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Instante UTC pré-preenchido (data + hora), quando aberto a partir de um clique na grade. */
  initialStartsAt?: Date;
  /** Dia local pré-preenchido (só a data), quando aberto pelo botão "Novo agendamento". */
  defaultLocalDay?: Date;
  /** Quando presente, o diálogo abre em modo edição (PATCH) em vez de criação. */
  editingAppointment?: AppointmentDTO;
}) {
  // "Adjusting state when a prop changes" (https://react.dev/learn/you-might-not-need-an-effect) —
  // calculado durante o render, não em efeito: a cada transição fechado->aberto, o formKey muda e
  // remonta o AppointmentFormBody com estado zerado, sem precisar de setState dentro de useEffect.
  const [wasOpen, setWasOpen] = useState(open);
  const [formKey, setFormKey] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFormKey((k) => k + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingAppointment ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
          <DialogDescription>
            {editingAppointment
              ? "Ajuste data, horário, duração ou observações."
              : "Marque uma sessão para uma paciente já cadastrada ou cadastre agora."}
          </DialogDescription>
        </DialogHeader>
        <AppointmentFormBody
          key={formKey}
          initialStartsAt={initialStartsAt}
          defaultLocalDay={defaultLocalDay}
          editingAppointment={editingAppointment}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AppointmentFormBody({
  initialStartsAt,
  defaultLocalDay,
  editingAppointment,
  onDone,
}: {
  initialStartsAt?: Date;
  defaultLocalDay?: Date;
  editingAppointment?: AppointmentDTO;
  onDone: () => void;
}) {
  const [selectedPatient, setSelectedPatient] = useState<PatientDTO | null>(null);
  const [creatingPatientName, setCreatingPatientName] = useState<string | null>(null);
  const [packageOverride, setPackageOverride] = useState<{ patientId: string; packageId: string } | null>(null);
  const [conflict, setConflict] = useState<{ patientName: string; startsAt: string; endsAt: string } | null>(null);
  const [showNewPackage, setShowNewPackage] = useState(false);
  const [newPackageSessions, setNewPackageSessions] = useState("10");
  const [newPackagePrice, setNewPackagePrice] = useState("");
  const [repeat, setRepeat] = useState(false);

  const editStart = editingAppointment ? new Date(editingAppointment.startsAt) : undefined;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: format(editStart ?? initialStartsAt ?? defaultLocalDay ?? new Date(), "yyyy-MM-dd"),
      time: editStart
        ? toLocalHHmm(editStart.toISOString())
        : initialStartsAt
          ? toLocalHHmm(initialStartsAt.toISOString())
          : "",
      durationMinutes: editingAppointment?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
      notes: editingAppointment?.notes ?? "",
    },
  });

  const packagesQuery = usePatientPackagesQuery(selectedPatient?.id ?? null);
  const createAppointment = useCreateAppointmentMutation();
  const updateAppointment = useUpdateAppointmentMutation();
  const createPackage = useCreatePackageMutation(selectedPatient?.id ?? null);

  const activePackages = (packagesQuery.data ?? []).filter((p) => p.status !== "CANCELED");
  // Pacote efetivo: o que a usuária escolheu manualmente para ESTE paciente, ou o pacote
  // ativo dele por padrão — derivado durante o render, sem efeito nem estado duplicado.
  // Usa `selectedPatient.activePackage` (já vem embutido na busca/criação do paciente,
  // disponível no mesmo instante em que ela é selecionada) em vez de esperar a lista de
  // pacotes carregar — senão um "Agendar" rápido demais some com o vínculo do pacote.
  const defaultPackageId = selectedPatient?.activePackage?.id ?? NO_PACKAGE;
  const packageId =
    packageOverride && selectedPatient && packageOverride.patientId === selectedPatient.id
      ? packageOverride.packageId
      : defaultPackageId;
  // Garante que o pacote ativo apareça como opção mesmo no instante antes da lista
  // completa (histórico) terminar de carregar — é ele que decide o `packageId` acima.
  const packageOptions =
    selectedPatient?.activePackage && !activePackages.some((p) => p.id === selectedPatient.activePackage!.id)
      ? [selectedPatient.activePackage, ...activePackages]
      : activePackages;

  // useWatch (não o método watch()) — é a forma compatível com o React Compiler,
  // sem cair no aviso "incompatible library" e sem re-render fora do controle do React.
  const [watchedDate, watchedTime, watchedDuration, watchedNotes] = useWatch({
    control,
    name: ["date", "time", "durationMinutes", "notes"],
  });

  function submit(values: FormValues, allowOverlap = false) {
    const startsAt = localDateTimeToUtc(new Date(`${values.date}T00:00:00`), values.time);

    if (editingAppointment) {
      updateAppointment.mutate(
        {
          id: editingAppointment.id,
          startsAt: startsAt.toISOString(),
          durationMinutes: values.durationMinutes,
          notes: values.notes || null,
        },
        {
          onSuccess: () => {
            toast.success("Agendamento atualizado.");
            onDone();
          },
          onError: (err) => {
            if (err instanceof ApiClientError && err.code === "SLOT_CONFLICT") {
              const details = err.details as { conflict?: { patientName: string; startsAt: string; endsAt: string } };
              if (details?.conflict) setConflict(details.conflict);
              else toast.error(err.message);
              return;
            }
            toast.error(err instanceof ApiClientError ? err.message : "Não foi possível salvar as alterações.");
          },
        },
      );
      return;
    }

    if (!selectedPatient) {
      toast.error("Selecione um paciente.");
      return;
    }
    createAppointment.mutate(
      {
        patientId: selectedPatient.id,
        packageId: packageId === NO_PACKAGE ? null : packageId,
        startsAt: startsAt.toISOString(),
        durationMinutes: values.durationMinutes,
        notes: values.notes || null,
        allowOverlap,
      },
      {
        onSuccess: () => {
          toast.success(`Agendamento de ${selectedPatient.name} criado.`);
          onDone();
        },
        onError: (err) => {
          if (err instanceof ApiClientError && err.code === "SLOT_CONFLICT") {
            const details = err.details as { conflict?: { patientName: string; startsAt: string; endsAt: string } };
            if (details?.conflict) setConflict(details.conflict);
            else toast.error(err.message);
            return;
          }
          if (err instanceof ApiClientError && err.code === "PACKAGE_EXHAUSTED") {
            toast.error(err.message);
            setShowNewPackage(true);
            return;
          }
          toast.error(err instanceof ApiClientError ? err.message : "Não foi possível criar o agendamento.");
        },
      },
    );
  }

  function handleCreateNewPackage() {
    if (!selectedPatient) return;
    const totalSessions = Number(newPackageSessions);
    const priceCents = Math.round((Number(newPackagePrice.replace(",", ".")) || 0) * 100);
    if (!totalSessions || totalSessions <= 0) {
      toast.error("Informe o número de sessões do novo pacote.");
      return;
    }
    createPackage.mutate(
      { totalSessions, priceCents },
      {
        onSuccess: (data) => {
          toast.success("Novo pacote criado.");
          setPackageOverride({ patientId: selectedPatient.id, packageId: data.package.id });
          setShowNewPackage(false);
          packagesQuery.refetch();
        },
        onError: (err) => {
          toast.error(err instanceof ApiClientError ? err.message : "Não foi possível criar o pacote.");
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit((v) => submit(v))} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Paciente</Label>
        {editingAppointment ? (
          <p className="rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink">
            {editingAppointment.patient.name}
            {editingAppointment.package && (
              <span className="ml-1 text-ink-muted">
                · {editingAppointment.package.label ?? "Pacote"} ({editingAppointment.package.consumidas +
                  editingAppointment.package.reservadas}{" "}
                de {editingAppointment.package.totalSessions})
              </span>
            )}
          </p>
        ) : creatingPatientName !== null ? (
          <NewPatientInlineForm
            initialName={creatingPatientName}
            onCreated={(patient) => {
              setSelectedPatient(patient);
              setCreatingPatientName(null);
            }}
            onCancel={() => setCreatingPatientName(null)}
          />
        ) : (
          <PatientCombobox selected={selectedPatient} onSelect={setSelectedPatient} onCreateNew={setCreatingPatientName} />
        )}
      </div>

      {!editingAppointment && selectedPatient && (
        <div className="space-y-1.5">
          <Label>Pacote</Label>
          <Select
            value={packageId}
            onValueChange={(value) => setPackageOverride({ patientId: selectedPatient.id, packageId: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PACKAGE}>Sessão avulsa (sem pacote)</SelectItem>
              {packageOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label ?? "Pacote"} — {p.consumidas + p.reservadas} de {p.totalSessions} usadas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showNewPackage && (
            <div className="space-y-2 rounded-lg border border-line bg-bg p-3">
              <p className="text-xs text-ink-muted">Pacote esgotado — crie um novo para continuar.</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min={1}
                  value={newPackageSessions}
                  onChange={(e) => setNewPackageSessions(e.target.value)}
                  placeholder="Sessões"
                />
                <Input
                  inputMode="decimal"
                  value={newPackagePrice}
                  onChange={(e) => setNewPackagePrice(e.target.value)}
                  placeholder="Valor (R$)"
                />
              </div>
              <Button type="button" size="sm" onClick={handleCreateNewPackage} disabled={createPackage.isPending}>
                Criar pacote
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="appt-date">Data</Label>
          <Input id="appt-date" type="date" {...register("date")} />
          {errors.date && <p className="text-xs text-danger">{errors.date.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appt-time">Horário</Label>
          <Input id="appt-time" type="time" {...register("time")} />
          {errors.time && <p className="text-xs text-danger">{errors.time.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Duração</Label>
        <Controller
          control={control}
          name="durationMinutes"
          render={({ field }) => (
            <div className="flex flex-wrap items-center gap-2">
              {DURATION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => field.onChange(chip)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    field.value === chip
                      ? "border-primary bg-primary-soft text-ink"
                      : "border-line bg-surface text-ink-muted hover:text-ink",
                  )}
                >
                  {chip} min
                </button>
              ))}
              <Input
                type="number"
                min={1}
                max={MAX_DURATION_MINUTES}
                value={field.value}
                onChange={(e) => field.onChange(Number(e.target.value))}
                className="w-20"
              />
            </div>
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appt-notes">Observações da sessão</Label>
        <Textarea id="appt-notes" rows={2} {...register("notes")} />
      </div>

      {!editingAppointment && selectedPatient && (
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink">Repetir</span>
            <Switch checked={repeat} onCheckedChange={setRepeat} />
          </label>
          {repeat && (
            <RecurrenceFields
              patientId={selectedPatient.id}
              packageId={packageId === NO_PACKAGE ? null : packageId}
              packageDisponiveis={
                packageId !== NO_PACKAGE ? (packageOptions.find((p) => p.id === packageId)?.disponiveis ?? null) : null
              }
              date={watchedDate}
              time={watchedTime}
              durationMinutes={watchedDuration}
              notes={watchedNotes}
              onDone={onDone}
            />
          )}
        </div>
      )}

      {conflict && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
          <p className="text-ink">
            Já existe <strong>{conflict.patientName}</strong> das {toLocalHHmm(conflict.startsAt)} às{" "}
            {toLocalHHmm(conflict.endsAt)}. Agendar mesmo assim?
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConflict(null)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={handleSubmit((v) => submit(v, true))}>
              Agendar mesmo assim
            </Button>
          </div>
        </div>
      )}

      {!repeat && (
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={editingAppointment ? updateAppointment.isPending : createAppointment.isPending || !selectedPatient}
          >
            {editingAppointment
              ? updateAppointment.isPending
                ? "Salvando…"
                : "Salvar alterações"
              : createAppointment.isPending
                ? "Salvando…"
                : "Agendar"}
          </Button>
        </DialogFooter>
      )}
      {repeat && (
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Fechar
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}
