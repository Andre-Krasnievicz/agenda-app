"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toLocalHHmm } from "@/lib/time";
import { useCreateSeriesMutation, useSeriesPreviewMutation, type SeriesPayload } from "@/hooks/use-series";
import { ApiClientError } from "@/lib/api-client";

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function RecurrenceFields({
  patientId,
  packageId,
  packageDisponiveis,
  date,
  time,
  durationMinutes,
  notes,
  onDone,
}: {
  patientId: string;
  packageId: string | null;
  packageDisponiveis: number | null;
  date: string; // "YYYY-MM-DD"
  time: string;
  durationMinutes: number;
  notes?: string;
  onDone: () => void;
}) {
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [mode, setMode] = useState<"count" | "until">("count");
  const [count, setCount] = useState("10");
  const [untilDate, setUntilDate] = useState("");

  const previewMutation = useSeriesPreviewMutation();
  const createSeriesMutation = useCreateSeriesMutation();

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  function buildPayload(allowOverlap: boolean): SeriesPayload | null {
    if (weekdays.length === 0) {
      toast.error("Selecione ao menos um dia da semana.");
      return null;
    }
    if (!time) {
      toast.error("Selecione o horário.");
      return null;
    }
    return {
      patientId,
      packageId: packageId ?? null,
      weekdays,
      time,
      durationMinutes,
      startDate: date,
      count: mode === "count" ? Number(count) : undefined,
      untilDate: mode === "until" ? untilDate || undefined : undefined,
      notes: notes || null,
      allowOverlap,
    };
  }

  function handlePreview() {
    const payload = buildPayload(false);
    if (!payload) return;
    previewMutation.mutate(payload, {
      onError: (err) => toast.error(err instanceof ApiClientError ? err.message : "Não foi possível gerar a prévia."),
    });
  }

  function handleConfirm(allowOverlap: boolean) {
    const payload = buildPayload(allowOverlap);
    if (!payload) return;
    createSeriesMutation.mutate(payload, {
      onSuccess: (data) => {
        toast.success(`${data.created.length} sessões agendadas.`);
        onDone();
      },
      onError: (err) => toast.error(err instanceof ApiClientError ? err.message : "Não foi possível criar a série."),
    });
  }

  const preview = previewMutation.data;
  const hasConflicts = preview?.dates.some((d) => d.conflict) ?? false;

  return (
    <div className="space-y-3 rounded-lg border border-line bg-bg p-3">
      <div className="space-y-1.5">
        <Label>Dias da semana</Label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleWeekday(i)}
              className={cn(
                "size-9 rounded-full border text-xs font-medium capitalize transition-colors",
                weekdays.includes(i)
                  ? "border-primary bg-primary-soft text-ink"
                  : "border-line bg-surface text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === "count"} onChange={() => setMode("count")} />
            Nº de sessões
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === "until"} onChange={() => setMode("until")} />
            Até uma data
          </label>
        </div>
        {mode === "count" ? (
          <>
            <Input
              type="number"
              min={1}
              max={packageDisponiveis ?? 200}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-24"
            />
            {packageDisponiveis !== null && <p className="text-xs text-accent">Restam {packageDisponiveis} sessões neste pacote.</p>}
          </>
        ) : (
          <Input type="date" value={untilDate} onChange={(e) => setUntilDate(e.target.value)} className="w-40" />
        )}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={previewMutation.isPending}>
        {previewMutation.isPending ? "Gerando prévia…" : "Ver prévia"}
      </Button>

      {preview && (
        <div className="space-y-2">
          {preview.cappedByPackage && (
            <p className="text-xs text-accent">Limitado às sessões disponíveis do pacote.</p>
          )}
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {preview.dates.map((d, i) => (
              <li key={i} className="flex items-center justify-between rounded border border-line px-2 py-1">
                <span className="font-mono text-xs text-ink">
                  {new Date(d.startsAt).toLocaleString("pt-BR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    timeZone: "America/Cuiaba",
                  })}{" "}
                  {toLocalHHmm(d.startsAt)}
                </span>
                {d.conflict && (
                  <Badge variant="destructive" className="font-normal">
                    Conflito
                  </Badge>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">{preview.dates.length} ocorrência(s) geradas.</p>
            <div className="flex gap-2">
              {hasConflicts && (
                <Button type="button" size="sm" variant="destructive" onClick={() => handleConfirm(true)}>
                  Agendar mesmo com conflitos
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => handleConfirm(false)}
                disabled={createSeriesMutation.isPending}
              >
                {createSeriesMutation.isPending ? "Criando…" : `Confirmar ${preview.dates.length} sessões`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
