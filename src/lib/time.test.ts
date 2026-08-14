import { describe, expect, it } from "vitest";
import { localDayRange, toLocalDateKey, toUtc } from "./time";

describe("localDayRange / fuso America/Cuiaba", () => {
  it("um atendimento às 21:00 local aparece no intervalo do dia certo (armadilha 8)", () => {
    // 10/jun/2031, 21:00 em America/Cuiaba (UTC-4) = 11/jun 01:00 UTC.
    // Um bug clássico (slice(0,10) em ISO, ou range cortado em UTC) faria
    // esse agendamento "sumir" do dia 10 e aparecer errado no dia 11.
    const localDay = new Date(2031, 5, 10); // calendário local: 10/jun/2031
    const startsAt = toUtc(new Date(2031, 5, 10, 21, 0, 0, 0));

    const { from, to } = localDayRange(localDay);

    expect(startsAt.getTime()).toBeGreaterThanOrEqual(from.getTime());
    expect(startsAt.getTime()).toBeLessThan(to.getTime());

    // E não deveria vazar para o range do dia seguinte.
    const nextDayRange = localDayRange(new Date(2031, 5, 11));
    expect(startsAt.getTime()).toBeLessThan(nextDayRange.from.getTime());
  });

  it("toLocalDateKey extrai o dia local correto, nunca o dia UTC", () => {
    const startsAt = toUtc(new Date(2031, 5, 10, 21, 0, 0, 0));
    expect(toLocalDateKey(startsAt)).toBe("2031-06-10");
  });

  it("o intervalo é semiaberto: um agendamento em 23:59:30 local não desaparece", () => {
    const localDay = new Date(2031, 5, 10);
    const lateNight = toUtc(new Date(2031, 5, 10, 23, 59, 30));
    const { from, to } = localDayRange(localDay);
    expect(lateNight.getTime()).toBeGreaterThanOrEqual(from.getTime());
    expect(lateNight.getTime()).toBeLessThan(to.getTime());
  });
});
