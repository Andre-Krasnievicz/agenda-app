/**
 * TODA conversão de fuso horário do app vive aqui. Nenhum outro arquivo deve
 * chamar fromZonedTime/toZonedTime ou fazer aritmética de fuso na mão.
 *
 * Por que isso importa mais aqui do que parece: Sorriso fica em Mato Grosso,
 * que observou horário de verão até 2019. O Brasil extinguiu o DST, mas o
 * assunto volta ao debate periodicamente — e se voltar, Mato Grosso adere.
 * Por isso: NUNCA hardcode "-04:00" ou "UTC-4" em lugar nenhum. Usamos sempre
 * o identificador IANA "America/Cuiaba" e deixamos a biblioteca (que usa o
 * Intl/tzdata do runtime) resolver o offset da data em questão. Se o DST
 * voltar, basta atualizar o tzdata do runtime — nada no código muda.
 */
import {
  addDays,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const APP_TZ = "America/Cuiaba"; // Sorriso-MT

/** Interpreta um Date/valores "de parede" (hora local da usuária) como America/Cuiaba e devolve o instante UTC correspondente. */
export const toUtc = (localDate: Date): Date => fromZonedTime(localDate, APP_TZ);

/** Converte um instante UTC (vindo do banco) para a hora de parede em America/Cuiaba. */
export const toLocal = (utcDate: Date | string): Date => toZonedTime(utcDate, APP_TZ);

export type DateRange = { from: Date; to: Date };

/**
 * `day` aqui é uma DATA DE CALENDÁRIO LOCAL, não um instante: seus getters
 * "de parede" (getFullYear/getMonth/getDate) já devem representar o dia
 * desejado em America/Cuiaba. Construa-a com `todayLocal()` (hoje) ou
 * `new Date(ano, mesIndex0, dia)` (dia escolhido pela usuária) — nunca passe
 * aqui um instante UTC cru (ex.: `new Date()` direto, ou o `startsAt` de um
 * agendamento) sem antes convertê-lo com `toLocal()`, senão o dia sai errado
 * perto da virada da meia-noite (a mesma armadilha da seção 6).
 */
export const localDayRange = (day: Date): DateRange => {
  const localStart = startOfDay(day);
  const localEnd = addDays(localStart, 1);
  return { from: toUtc(localStart), to: toUtc(localEnd) };
};

/** Intervalo semiaberto da semana de calendário local (começando na segunda) que contém `day`. Mesma regra do `day` acima. */
export const localWeekRange = (day: Date): DateRange => {
  const localStart = startOfWeek(day, { weekStartsOn: 1 });
  const localEnd = addDays(localStart, 7);
  return { from: toUtc(localStart), to: toUtc(localEnd) };
};

/** "Hoje" como data de calendário local (Y/M/D em America/Cuiaba, hora zerada) — a ponte entre "instante agora" e o espaço de datas de calendário que `localDayRange`/`localWeekRange` esperam. */
export const todayLocal = (): Date => startOfDay(toLocal(new Date()));

/**
 * Minutos desde a meia-noite LOCAL (America/Cuiaba) de um instante UTC.
 * Usado pelo layout do calendário. Note que conta a partir da meia-noite,
 * não a partir de GRID_START_HOUR — quem posiciona o bloco é que subtrai
 * o início da grade.
 */
export const localMinutesFromMidnight = (utcDate: Date | string): number => {
  const local = toLocal(utcDate);
  return local.getHours() * 60 + local.getMinutes();
};

/** Combina uma data local (Y/M/D) com um "HH:mm" local e devolve o instante UTC. Nunca soma milissegundos para gerar séries — sempre passa por aqui. */
export const localDateTimeToUtc = (localDay: Date, hhmm: string): Date => {
  const [h, m] = hhmm.split(":").map(Number);
  const local = new Date(
    localDay.getFullYear(),
    localDay.getMonth(),
    localDay.getDate(),
    h,
    m,
    0,
    0,
  );
  return toUtc(local);
};

/** "HH:mm" local a partir de um instante UTC — para preencher inputs type="time". */
export const toLocalHHmm = (utcDate: Date | string): string => {
  const local = toLocal(utcDate);
  const hh = String(local.getHours()).padStart(2, "0");
  const mm = String(local.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

/** Chave "YYYY-MM-DD" do dia LOCAL de um instante UTC — nunca use toISOString().slice(0,10) para isso. */
export const toLocalDateKey = (utcDate: Date | string): string => {
  const local = toLocal(utcDate);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Soma dias em cima de uma data LOCAL (hora de parede), preservando HH:mm — nunca some 24h*60*60*1000 em UTC para gerar recorrência. */
export const addLocalDays = (localDate: Date, days: number): Date => addDays(localDate, days);
