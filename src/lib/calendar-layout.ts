/**
 * Posicionamento e colisão dos blocos do calendário. Módulo puro: só
 * trabalha com minutos-desde-a-meia-noite-local, nunca com Date/fuso —
 * quem converte é sempre `lib/time.ts` (ver seção 6 do plano).
 */

export type BlockPosition = { top: number; height: number };

/** Posição vertical de um bloco na grade (topo e altura em px). Seção 7.2. */
export function computeBlockPosition(
  startMinutes: number,
  durationMinutes: number,
  opts: { gridStartHour: number; hourHeight: number; minBlockPx?: number },
): BlockPosition {
  const offsetMin = startMinutes - opts.gridStartHour * 60;
  const top = (offsetMin / 60) * opts.hourHeight;
  const height = Math.max((durationMinutes / 60) * opts.hourHeight, opts.minBlockPx ?? 0);
  return { top, height };
}

/** Minuto (snapado) correspondente a um clique na grade, em minutos-desde-a-meia-noite-local. */
export function computeSnappedMinutes(
  clickY: number,
  opts: { gridStartHour: number; hourHeight: number; snapMinutes: number },
): number {
  const rawMin = opts.gridStartHour * 60 + (clickY / opts.hourHeight) * 60;
  return Math.round(rawMin / opts.snapMinutes) * opts.snapMinutes;
}

/**
 * A grade nunca esconde um agendamento por causa da constante (seção 7.2,
 * armadilha 5): se algo cair fora de [defaultStartHour, defaultEndHour),
 * a grade expande para conter o mais cedo e o mais tarde do dia.
 */
export function getEffectiveHourRange(
  items: { startMinutes: number; endMinutes: number }[],
  defaultStartHour: number,
  defaultEndHour: number,
): { startHour: number; endHour: number } {
  let startHour = defaultStartHour;
  let endHour = defaultEndHour;
  for (const it of items) {
    startHour = Math.min(startHour, Math.floor(it.startMinutes / 60));
    endHour = Math.max(endHour, Math.ceil(it.endMinutes / 60));
  }
  return { startHour, endHour };
}

export type ColumnAssignment = { column: number; columns: number };

/**
 * Agrupa blocos que se cruzam (em cadeia: A cruza B, B cruza C, mesmo que A
 * não cruze C, os três formam um único grupo) e, dentro de cada grupo,
 * atribui colunas gulosamente: a primeira coluna cujo último bloco já
 * terminou. `columns` é o total de colunas usadas naquele grupo — quem
 * renderiza faz `width = 100% / columns`.
 *
 * Cancelados não entram aqui (seção 7.2): filtre-os antes de chamar.
 */
export function assignColumns(
  blocks: { id: string; startMinutes: number; endMinutes: number }[],
): Map<string, ColumnAssignment> {
  const result = new Map<string, ColumnAssignment>();
  const sorted = [...blocks].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  );

  let clusterItems: typeof sorted = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (clusterItems.length === 0) return;
    const columnEnds: number[] = [];
    const columnOf = new Map<string, number>();
    for (const item of clusterItems) {
      let col = columnEnds.findIndex((end) => end <= item.startMinutes);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(item.endMinutes);
      } else {
        columnEnds[col] = item.endMinutes;
      }
      columnOf.set(item.id, col);
    }
    const columns = columnEnds.length;
    for (const item of clusterItems) {
      result.set(item.id, { column: columnOf.get(item.id)!, columns });
    }
  };

  for (const item of sorted) {
    if (clusterItems.length === 0 || item.startMinutes < clusterEnd) {
      clusterItems.push(item);
      clusterEnd = Math.max(clusterEnd, item.endMinutes);
    } else {
      flushCluster();
      clusterItems = [item];
      clusterEnd = item.endMinutes;
    }
  }
  flushCluster();

  return result;
}
