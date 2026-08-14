"use client";

import { useSyncExternalStore } from "react";

/**
 * Usa useSyncExternalStore em vez de useState+useEffect: evita o padrão
 * "setState dentro de efeito" e fica correto sob concorrência do React 19.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false, // snapshot do servidor: mobile-first por padrão
  );
}
