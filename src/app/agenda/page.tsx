import { Suspense } from "react";
import { CalendarShell } from "@/components/calendar/CalendarShell";

export default function AgendaPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-ink-muted">Carregando…</div>}>
      <CalendarShell />
    </Suspense>
  );
}
