"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type View = "day" | "week";

export function CalendarHeader({
  date,
  onPrev,
  onNext,
  onToday,
  view,
  onViewChange,
  rightSlot,
  isCurrentPeriod = false,
}: {
  date: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  view: View;
  onViewChange?: (view: View) => void;
  rightSlot?: React.ReactNode;
  /** Se o período exibido (dia ou semana) contém hoje — destaca o botão "Hoje" (critério de aceite). */
  isCurrentPeriod?: boolean;
}) {
  const raw = format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  // Sentence case (seção 8.2) — só a primeira letra maiúscula, nunca Title Case.
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:px-6">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNext} aria-label="Próximo">
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant={isCurrentPeriod ? "secondary" : "outline"}
          size="sm"
          onClick={onToday}
          disabled={isCurrentPeriod}
          className="ml-1"
        >
          Hoje
        </Button>
      </div>

      <h1 className="flex items-center gap-2 font-heading text-base font-semibold text-ink sm:text-lg">
        {label}
        {isCurrentPeriod && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
      </h1>

      {onViewChange && (
        <div className="ml-auto hidden items-center gap-1 rounded-md border border-line bg-bg p-0.5 sm:flex">
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={cn(
                "rounded-[6px] px-3 py-1 text-sm font-medium transition-colors",
                view === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              {v === "day" ? "Dia" : "Semana"}
            </button>
          ))}
        </div>
      )}

      {rightSlot && <div className={cn("flex items-center", !onViewChange && "ml-auto")}>{rightSlot}</div>}
    </header>
  );
}
