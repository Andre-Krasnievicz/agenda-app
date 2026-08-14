"use client";

import { useEffect, useMemo, useRef } from "react";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { assignColumns, computeBlockPosition, getEffectiveHourRange } from "@/lib/calendar-layout";
import { localMinutesFromMidnight, toLocal } from "@/lib/time";
import { GRID_END_HOUR, GRID_START_HOUR, HOUR_HEIGHT_WEEK, INITIAL_SCROLL_HOUR, MIN_BLOCK_PX } from "@/config/calendar";
import { TimeGutter } from "./TimeGutter";
import { NowIndicator } from "./NowIndicator";
import { AppointmentBlock } from "./AppointmentBlock";
import { cn } from "@/lib/utils";
import type { AppointmentDTO } from "@/lib/types";

export function WeekGrid({
  weekStart,
  appointments,
  today,
  onAppointmentClick,
}: {
  /** Segunda-feira da semana (data de calendário local). */
  weekStart: Date;
  appointments: AppointmentDTO[];
  today: Date;
  onAppointmentClick?: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const hourHeight = HOUR_HEIGHT_WEEK;

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const withMeta = useMemo(
    () =>
      appointments.map((a) => {
        const local = toLocal(a.startsAt);
        const dayIndex = differenceInCalendarDays(startOfDay(local), weekStart);
        return {
          appointment: a,
          dayIndex,
          startMinutes: localMinutesFromMidnight(a.startsAt),
          endMinutes: localMinutesFromMidnight(a.startsAt) + a.durationMinutes,
        };
      }),
    [appointments, weekStart],
  );

  const inWeek = withMeta.filter((i) => i.dayIndex >= 0 && i.dayIndex < 7);

  const { startHour, endHour } = useMemo(
    () => getEffectiveHourRange(inWeek, GRID_START_HOUR, GRID_END_HOUR),
    [inWeek],
  );

  const totalHeight = (endHour - startHour) * hourHeight;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  useEffect(() => {
    if (hasScrolledRef.current || !scrollRef.current) return;
    hasScrolledRef.current = true;
    const nowMinutes = localMinutesFromMidnight(new Date());
    const target = Math.max(startHour, nowMinutes / 60 - 1, INITIAL_SCROLL_HOUR - 1);
    scrollRef.current.scrollTop = Math.max(0, (target - startHour) * hourHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex border-b border-line">
        <div className="w-14 shrink-0 sm:w-16" />
        {days.map((day) => {
          const isToday = differenceInCalendarDays(day, today) === 0;
          return (
            <div key={day.toISOString()} className={cn("flex-1 border-l border-line py-2 text-center", isToday && "bg-primary-soft/30")}>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                {format(day, "EEEEEE", { locale: ptBR })}
              </p>
              <p
                className={cn(
                  "mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-sm font-medium text-ink",
                  isToday && "bg-primary text-white",
                )}
              >
                {format(day, "d")}
              </p>
            </div>
          );
        })}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: totalHeight }}>
          <TimeGutter startHour={startHour} endHour={endHour} hourHeight={hourHeight} />
          {days.map((day, dayIndex) => {
            const isToday = differenceInCalendarDays(day, today) === 0;
            const dayItems = inWeek.filter((i) => i.dayIndex === dayIndex);
            const activeItems = dayItems.filter((i) => i.appointment.status !== "CANCELED_COUNTED");
            const canceledItems = dayItems.filter((i) => i.appointment.status === "CANCELED_COUNTED");
            const columns = assignColumns(
              activeItems.map((i) => ({ id: i.appointment.id, startMinutes: i.startMinutes, endMinutes: i.endMinutes })),
            );

            return (
              <div key={day.toISOString()} className={cn("relative flex-1 border-l border-line", isToday && "bg-primary-soft/10")}>
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: (h - startHour) * hourHeight }} />
                ))}

                <NowIndicator isToday={isToday} gridStartHour={startHour} hourHeight={hourHeight} />

                {canceledItems.map(({ appointment, startMinutes }) => {
                  const pos = computeBlockPosition(startMinutes, appointment.durationMinutes, {
                    gridStartHour: startHour,
                    hourHeight,
                    minBlockPx: MIN_BLOCK_PX,
                  });
                  return (
                    <AppointmentBlock
                      key={appointment.id}
                      appointment={appointment}
                      variant="canceled"
                      style={{ top: pos.top, height: pos.height, right: 2, width: 18 }}
                      onClick={onAppointmentClick ? () => onAppointmentClick(appointment.id) : undefined}
                    />
                  );
                })}

                {activeItems.map(({ appointment, startMinutes }) => {
                  const pos = computeBlockPosition(startMinutes, appointment.durationMinutes, {
                    gridStartHour: startHour,
                    hourHeight,
                    minBlockPx: MIN_BLOCK_PX,
                  });
                  const col = columns.get(appointment.id) ?? { column: 0, columns: 1 };
                  const widthPct = 100 / col.columns;
                  return (
                    <AppointmentBlock
                      key={appointment.id}
                      appointment={appointment}
                      style={{
                        top: pos.top,
                        height: pos.height,
                        left: `calc(${col.column * widthPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                      }}
                      onClick={onAppointmentClick ? () => onAppointmentClick(appointment.id) : undefined}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
