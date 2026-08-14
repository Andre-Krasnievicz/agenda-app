"use client";

import { toLocalHHmm } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { AppointmentDTO } from "@/lib/types";
import { Check } from "lucide-react";

/** Bloco de agendamento na grade — seção 8.4/8.5. Sempre um <button> de verdade. */
export function AppointmentBlock({
  appointment,
  style,
  onClick,
  variant = "normal",
}: {
  appointment: AppointmentDTO;
  style: React.CSSProperties;
  onClick?: () => void;
  /** "canceled" = renderizado atrás, largura reduzida, fora do algoritmo de colunas (seção 7.2). */
  variant?: "normal" | "canceled";
}) {
  const startLabel = toLocalHHmm(appointment.startsAt);
  const endLabel = toLocalHHmm(appointment.endsAt);
  const heightPx = typeof style.height === "number" ? style.height : parseFloat(String(style.height ?? "0"));
  const showSessionLine = heightPx >= 44 && appointment.sessionNumber != null && appointment.package;

  const ariaLabel = `${appointment.patient.name}, ${startLabel} às ${endLabel}${
    appointment.sessionNumber && appointment.package
      ? `, sessão ${appointment.sessionNumber} de ${appointment.package.totalSessions}`
      : ""
  }`;

  const isCanceled = appointment.status === "CANCELED_COUNTED";
  const isCompleted = appointment.status === "COMPLETED";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={style}
      className={cn(
        "absolute flex min-h-[32px] flex-col overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        variant === "canceled" &&
          "z-0 border-l-[var(--ink-muted)] bg-[repeating-linear-gradient(135deg,var(--line),var(--line)_4px,transparent_4px,transparent_8px)] text-ink-muted opacity-80",
        variant === "normal" &&
          !isCompleted &&
          !isCanceled &&
          "z-[1] border-l-primary bg-primary-soft text-ink hover:brightness-[0.97]",
        variant === "normal" &&
          isCompleted &&
          "z-[1] border-l-ink-muted bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:brightness-[0.98]",
      )}
    >
      <span
        className={cn(
          "truncate font-sans text-[13px] font-medium leading-tight",
          isCanceled && "line-through",
        )}
      >
        {isCompleted && <Check className="mr-1 inline size-3 align-[-1px] text-ink-muted" />}
        {appointment.patient.name} · {startLabel}–{endLabel}
      </span>
      {showSessionLine && (
        <span className="truncate font-mono text-[11px] text-ink-muted">
          Sessão {appointment.sessionNumber} de {appointment.package!.totalSessions}
        </span>
      )}
    </button>
  );
}
