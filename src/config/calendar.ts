// Constantes da grade do calendário. Ver seção 7.2 do plano.
export const GRID_START_HOUR = 6; // primeira linha renderizada
export const GRID_END_HOUR = 22; // última linha (exclusiva) — a grade rola até aqui
export const INITIAL_SCROLL_HOUR = 7; // onde a tela abre posicionada
export const HOUR_HEIGHT_DAY = 64; // px
export const HOUR_HEIGHT_WEEK = 56; // px
export const SNAP_MINUTES = 15;
export const MIN_BLOCK_PX = 22;
export const WEEK_STARTS_ON = 1 as const; // segunda-feira

export const DEFAULT_DURATION_MINUTES = 60;
export const DURATION_CHIPS = [30, 45, 60, 90] as const;
export const MAX_DURATION_MINUTES = 8 * 60;
