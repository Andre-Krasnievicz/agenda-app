"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDays, format } from "date-fns";
import { CalendarHeader } from "./CalendarHeader";
import { DayGrid } from "./DayGrid";
import { useAppointmentsQuery } from "@/hooks/use-appointments";
import { localDayRange, todayLocal } from "@/lib/time";

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

  const today = useMemo(() => todayLocal(), []);
  const selected = useMemo(() => parseDateKey(searchParams.get("date")) ?? today, [searchParams, today]);

  const navigate = useCallback(
    (next: Date) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", format(next, "yyyy-MM-dd"));
      if (!params.get("view")) params.set("view", "day");
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const range = useMemo(() => localDayRange(selected), [selected]);
  const { data: appointments, isError, refetch } = useAppointmentsQuery(range);

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col bg-bg">
      <CalendarHeader
        date={selected}
        view="day"
        onPrev={() => navigate(addDays(selected, -1))}
        onNext={() => navigate(addDays(selected, 1))}
        onToday={() => navigate(today)}
        rightSlot={rightSlot}
      />
      {isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-ink-muted">Não foi possível carregar a agenda.</p>
          <button
            onClick={() => refetch()}
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <DayGrid localDay={selected} appointments={appointments ?? []} isToday={isSameLocalDay(selected, today)} />
      )}
    </div>
  );
}
