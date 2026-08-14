"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { Plus, Users } from "lucide-react";
import { CalendarHeader } from "./CalendarHeader";
import { DayGrid } from "./DayGrid";
import { WeekGrid } from "./WeekGrid";
import { Button } from "@/components/ui/button";
import { AppointmentFormDialog } from "@/components/appointment/AppointmentFormDialog";
import { AppointmentDetailsDialog } from "@/components/appointment/AppointmentDetailsDialog";
import { useAppointmentsQuery } from "@/hooks/use-appointments";
import { useMediaQuery } from "@/hooks/use-media-query";
import { localDayRange, localWeekRange, todayLocal } from "@/lib/time";
import { WEEK_STARTS_ON } from "@/config/calendar";

type View = "day" | "week";

function parseDateKey(key: string | null): Date | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarShell({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // No mobile o toggle some e a visão Dia é forçada (seção 7.1) — nunca renderiza
  // a semana inteira espremida numa tela de 360px.
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const today = useMemo(() => todayLocal(), []);
  const selected = useMemo(() => parseDateKey(searchParams.get("date")) ?? today, [searchParams, today]);
  const requestedView: View = searchParams.get("view") === "week" ? "week" : "day";
  const view: View = isDesktop ? requestedView : "day";

  const navigate = useCallback(
    (next: Date, nextView: View = view) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", format(next, "yyyy-MM-dd"));
      params.set("view", nextView);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams, view],
  );

  const weekStart = useMemo(() => startOfWeek(selected, { weekStartsOn: WEEK_STARTS_ON }), [selected]);
  const isCurrentPeriod =
    view === "week" ? isSameLocalDay(weekStart, startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON })) : isSameLocalDay(selected, today);
  const range = useMemo(
    () => (view === "week" ? localWeekRange(selected) : localDayRange(selected)),
    [selected, view],
  );
  const { data: appointments, isError, refetch } = useAppointmentsQuery(range);

  const [formOpen, setFormOpen] = useState(false);
  const [slotStartsAt, setSlotStartsAt] = useState<Date | undefined>(undefined);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  function openNewAppointment(startsAt?: Date) {
    setSlotStartsAt(startsAt);
    setFormOpen(true);
  }

  const detailsAppointment = appointments?.find((a) => a.id === detailsId) ?? null;
  const anyDialogOpen = formOpen || detailsId !== null;

  // Atalhos de teclado (seção 7.5) — Esc já é tratado pelo próprio Radix Dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (anyDialogOpen) return;
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "t":
          navigate(today);
          break;
        case "arrowleft":
          navigate(view === "week" ? addWeeks(selected, -1) : addDays(selected, -1));
          break;
        case "arrowright":
          navigate(view === "week" ? addWeeks(selected, 1) : addDays(selected, 1));
          break;
        case "d":
          if (isDesktop) navigate(selected, "day");
          break;
        case "s":
          if (isDesktop) navigate(selected, "week");
          break;
        case "n":
          openNewAppointment();
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyDialogOpen, navigate, today, selected, view, isDesktop]);

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col bg-bg">
      <CalendarHeader
        date={selected}
        view={view}
        isCurrentPeriod={isCurrentPeriod}
        onViewChange={isDesktop ? (v) => navigate(selected, v) : undefined}
        onPrev={() => navigate(view === "week" ? addWeeks(selected, -1) : addDays(selected, -1))}
        onNext={() => navigate(view === "week" ? addWeeks(selected, 1) : addDays(selected, 1))}
        onToday={() => navigate(today)}
        rightSlot={
          rightSlot ?? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild aria-label="Pacientes">
                <Link href="/pacientes">
                  <Users className="size-4" />
                </Link>
              </Button>
              <Button size="sm" onClick={() => openNewAppointment()}>
                <Plus className="size-4" />
                Novo agendamento
              </Button>
            </div>
          )
        }
      />
      {isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-ink-muted">Não foi possível carregar a agenda.</p>
          <button onClick={() => refetch()} className="text-sm font-medium text-primary underline underline-offset-4">
            Tentar de novo
          </button>
        </div>
      ) : view === "week" ? (
        <WeekGrid
          weekStart={weekStart}
          appointments={appointments ?? []}
          today={today}
          onAppointmentClick={setDetailsId}
        />
      ) : (
        <DayGrid
          localDay={selected}
          appointments={appointments ?? []}
          isToday={isSameLocalDay(selected, today)}
          onSlotClick={openNewAppointment}
          onAppointmentClick={setDetailsId}
        />
      )}

      <AppointmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialStartsAt={slotStartsAt}
        defaultLocalDay={selected}
      />

      <AppointmentDetailsDialog
        appointment={detailsAppointment}
        open={detailsId !== null}
        onOpenChange={(v) => {
          if (!v) setDetailsId(null);
        }}
      />
    </div>
  );
}
