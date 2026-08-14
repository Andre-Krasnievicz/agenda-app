/** Coluna de horas — seção 7.1/7.2. Fonte mono, alinhada ao topo de cada linha. */
export function TimeGutter({
  startHour,
  endHour,
  hourHeight,
}: {
  startHour: number;
  endHour: number;
  hourHeight: number;
}) {
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  return (
    <div className="relative w-14 shrink-0 sm:w-16" style={{ height: hourHeight * hours.length }}>
      {hours.map((h) => (
        <div
          key={h}
          className="absolute left-0 right-2 text-right font-mono text-xs text-ink-muted"
          style={{ top: (h - startHour) * hourHeight }}
        >
          <span className="relative -top-2 inline-block">{String(h).padStart(2, "0")}:00</span>
        </div>
      ))}
    </div>
  );
}
