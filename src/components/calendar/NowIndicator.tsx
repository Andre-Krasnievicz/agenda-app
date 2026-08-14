"use client";

import { useEffect, useState } from "react";
import { localMinutesFromMidnight } from "@/lib/time";

/** Linha do agora — só aparece no dia de hoje; atualiza a cada 60s (seção 7.2). */
export function NowIndicator({
  isToday,
  gridStartHour,
  hourHeight,
}: {
  isToday: boolean;
  gridStartHour: number;
  hourHeight: number;
}) {
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!isToday) return;
    const update = () => setNowMinutes(localMinutesFromMidnight(new Date()));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  if (!isToday || nowMinutes === null) return null;

  const top = ((nowMinutes - gridStartHour * 60) / 60) * hourHeight;
  if (top < 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
      style={{ top }}
      aria-hidden="true"
    >
      <span className="-ml-1 size-2 rounded-full bg-accent" />
      <span className="h-px flex-1 bg-accent" />
    </div>
  );
}
