import { describe, expect, it } from "vitest";
import {
  assignColumns,
  computeBlockPosition,
  computeSnappedMinutes,
  getEffectiveHourRange,
} from "./calendar-layout";

describe("computeBlockPosition", () => {
  it("um agendamento de 08:00 às 09:30 ocupa exatamente uma linha e meia", () => {
    const opts = { gridStartHour: 6, hourHeight: 64 };
    // 08:00 = 480min, grade começa às 06:00 (360min) -> offset 120min = 2h
    const pos = computeBlockPosition(8 * 60, 90, opts);
    expect(pos.top).toBe(2 * 64); // 2h abaixo do início da grade
    expect(pos.height).toBe(1.5 * 64); // 90min = 1.5h
  });

  it("respeita a altura mínima do bloco", () => {
    const pos = computeBlockPosition(8 * 60, 5, { gridStartHour: 6, hourHeight: 64, minBlockPx: 22 });
    expect(pos.height).toBe(22);
  });
});

describe("computeSnappedMinutes", () => {
  it("arredonda o clique para o snap mais próximo", () => {
    const opts = { gridStartHour: 6, hourHeight: 64, snapMinutes: 15 };
    // y=64 -> 1h depois das 06:00 -> 07:00 = 420min
    expect(computeSnappedMinutes(64, opts)).toBe(7 * 60);
    // y=70 -> ~07:06 -> snapa para 07:00 (mais próximo de 15 em 15)
    expect(computeSnappedMinutes(70, opts)).toBe(7 * 60);
    // y=80 -> ~07:15 -> snapa para 07:15
    expect(computeSnappedMinutes(80, opts)).toBe(7 * 60 + 15);
  });
});

describe("getEffectiveHourRange", () => {
  it("mantém o range padrão quando nada extrapola", () => {
    const range = getEffectiveHourRange([{ startMinutes: 8 * 60, endMinutes: 9 * 60 }], 6, 22);
    expect(range).toEqual({ startHour: 6, endHour: 22 });
  });

  it("expande para conter um agendamento fora do range (05:00) sem escondê-lo", () => {
    const range = getEffectiveHourRange([{ startMinutes: 5 * 60, endMinutes: 5 * 60 + 45 }], 6, 22);
    expect(range.startHour).toBe(5);
  });

  it("expande o fim quando um agendamento termina depois de GRID_END_HOUR", () => {
    // 20:30 + 90min = 22:00
    const range = getEffectiveHourRange([{ startMinutes: 20 * 60 + 30, endMinutes: 22 * 60 }], 6, 22);
    expect(range.endHour).toBe(22);

    const range2 = getEffectiveHourRange([{ startMinutes: 21 * 60, endMinutes: 22 * 60 + 30 }], 6, 22);
    expect(range2.endHour).toBe(23);
  });
});

describe("assignColumns", () => {
  it("nenhum overlap: todos os blocos ficam sozinhos em 1 coluna", () => {
    const result = assignColumns([
      { id: "a", startMinutes: 0, endMinutes: 60 },
      { id: "b", startMinutes: 60, endMinutes: 120 },
      { id: "c", startMinutes: 120, endMinutes: 180 },
    ]);
    for (const id of ["a", "b", "c"]) {
      expect(result.get(id)).toEqual({ column: 0, columns: 1 });
    }
  });

  it("dois blocos sobrepostos dividem em 2 colunas", () => {
    const result = assignColumns([
      { id: "a", startMinutes: 0, endMinutes: 60 },
      { id: "b", startMinutes: 30, endMinutes: 90 },
    ]);
    expect(result.get("a")).toEqual({ column: 0, columns: 2 });
    expect(result.get("b")).toEqual({ column: 1, columns: 2 });
  });

  it("três em cadeia (A cruza B, B cruza C, A não cruza C): 1 grupo, 2 colunas, A e C reaproveitam coluna", () => {
    const result = assignColumns([
      { id: "a", startMinutes: 0, endMinutes: 60 },
      { id: "b", startMinutes: 30, endMinutes: 90 },
      { id: "c", startMinutes: 80, endMinutes: 140 },
    ]);
    expect(result.get("a")).toEqual({ column: 0, columns: 2 });
    expect(result.get("b")).toEqual({ column: 1, columns: 2 });
    expect(result.get("c")).toEqual({ column: 0, columns: 2 });
  });

  it("grupos independentes (sem overlap entre eles) não compartilham contagem de colunas", () => {
    const result = assignColumns([
      { id: "a", startMinutes: 0, endMinutes: 60 },
      { id: "b", startMinutes: 30, endMinutes: 90 },
      { id: "c", startMinutes: 200, endMinutes: 260 },
    ]);
    expect(result.get("a")?.columns).toBe(2);
    expect(result.get("b")?.columns).toBe(2);
    expect(result.get("c")).toEqual({ column: 0, columns: 1 });
  });
});
