"use client";

import { useEffect, useMemo, useRef } from "react";
import { assignColumns, computeBlockPosition, computeSnappedMinutes, getEffectiveHourRange } from "@/lib/calendar-layout";
import { localMinutesFromMidnight, toUtc } from "@/lib/time";
import { GRID_END_HOUR, GRID_START_HOUR, HOUR_HEIGHT_DAY, INITIAL_SCROLL_HOUR, MIN_BLOCK_PX, SNAP_MINUTES } from "@/config/calendar";
import { TimeGutter } from "./TimeGutter";
import { NowIndicator } from "./NowIndicator";
import { AppointmentBlock } from "./AppointmentBlock";
import type { AppointmentDTO } from "@/lib/types";

export function DayGrid({
  localDay,
  appointments,
  isToday,
  hourHeight = HOUR_HEIGHT_DAY,
  onSlotClick,
  onAppointmentClick,
}: {
  /** Data de calendário local (Y/M/D em America/Cuiaba) do dia sendo exibido. */
  localDay: Date;
  appointments: AppointmentDTO[];
  isToday: boolean;
  hourHeight?: number;
  onSlotClick?: (startsAt: Date) => void;
  onAppointmentClick?: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const items = useMemo(
    () =>
      appointments.map((a) => ({
        appointment: a,
        startMinutes: localMinutesFromMidnight(a.startsAt),
        endMinutes: localMinutesFromMidnight(a.startsAt) + a.durationMinutes,
      })),
    [appointments],
  );

  const { startHour, endHour } = useMemo(
    () => getEffectiveHourRange(items, GRID_START_HOUR, GRID_END_HOUR),
    [items],
  );

  const activeItems = items.filter((i) => i.appointment.status !== "CANCELED_COUNTED");
  const canceledItems = items.filter((i) => i.appointment.status === "CANCELED_COUNTED");

  const columns = useMemo(
    () =>
      assignColumns(
        activeItems.map((i) => ({ id: i.appointment.id, startMinutes: i.startMinutes, endMinutes: i.endMinutes })),
      ),
    [activeItems],
  );

  const totalHeight = (endHour - startHour) * hourHeight;

  // Scroll inicial: INITIAL_SCROLL_HOUR, ou "agora menos 1h" se o dia é hoje.
  // Roda só uma vez — trocar de dia preserva a posição (o nó do DOM não é recriado).
  useEffect(() => {
    if (hasScrolledRef.current || !scrollRef.current) return;
    hasScrolledRef.current = true;
    const targetHour = isToday
      ? Math.max(startHour, localMinutesFromMidnight(new Date()) / 60 - 1)
      : INITIAL_SCROLL_HOUR;
    scrollRef.current.scrollTop = Math.max(0, (targetHour - startHour) * hourHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGridClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSlotClick || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const snappedMinutes = computeSnappedMinutes(y, { gridStartHour: startHour, hourHeight, snapMinutes: SNAP_MINUTES });
    const local = new Date(localDay);
    local.setHours(0, snappedMinutes, 0, 0);
    onSlotClick(toUtc(local));
  }

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="flex" style={{ height: totalHeight }}>
        <TimeGutter startHour={startHour} endHour={endHour} hourHeight={hourHeight} />
        <div
          className="relative flex-1 border-l border-line"
          onClick={handleGridClick}
          role={onSlotClick ? "button" : undefined}
        >
          {hours.map((h) => (
            <div
              key={h}
              className="absolute inset-x-0 border-t border-line"
              style={{ top: (h - startHour) * hourHeight }}
            />
          ))}

          <NowIndicator isToday={isToday} gridStartHour={startHour} hourHeight={hourHeight} />

          {items.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-2 px-4 text-center">
              <p className="text-sm text-ink-muted">Nenhum atendimento neste dia.</p>
              {onSlotClick && (
                <button
                  type="button"
                  onClick={() => {
                    const local = new Date(localDay);
                    local.setHours(8, 0, 0, 0);
                    onSlotClick(toUtc(local));
                  }}
                  className="pointer-events-auto text-sm font-medium text-primary underline underline-offset-4"
                >
                  Agendar às 08:00
                </button>
              )}
            </div>
          )}

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
                style={{ top: pos.top, height: pos.height, right: 2, width: 24 }}
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
                  left: `calc(${col.column * widthPct}% + 2px)`,
                  width: `calc(${widthPct}% - 4px)`,
                }}
                onClick={onAppointmentClick ? () => onAppointmentClick(appointment.id) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
