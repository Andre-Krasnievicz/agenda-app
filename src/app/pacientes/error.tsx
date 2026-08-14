"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg text-center">
      <p className="text-ink-muted">Algo deu errado ao carregar os pacientes.</p>
      <button onClick={reset} className="text-sm font-medium text-primary underline underline-offset-4">
        Tentar de novo
      </button>
    </div>
  );
}
