import { cn } from "@/lib/utils";

/**
 * Elemento assinatura do produto (seção 8.3). Progresso do pacote não é uma
 * barra contínua: são N segmentos, preenchidos como quem conta repetições
 * de um exercício.
 *
 * Preenchido = sessão consumida (realizada). Contornado = agendada.
 * Vazio = disponível. Riscado = cancelada e contada.
 *
 * Acima de 20 sessões os segmentos ficam ilegíveis — cai para uma barra
 * contínua com o mesmo esquema de cores e o texto "18/30".
 */
export function PackageProgress({
  totalSessions,
  completed,
  canceledCounted,
  reservadas,
  className,
}: {
  totalSessions: number;
  completed: number;
  canceledCounted: number;
  reservadas: number;
  className?: string;
}) {
  const consumidas = completed + canceledCounted;
  const usedFraction = Math.min(1, (consumidas + reservadas) / Math.max(totalSessions, 1));
  const consumedFraction = Math.min(1, consumidas / Math.max(totalSessions, 1));

  if (totalSessions > 20) {
    return (
      <div className={cn("space-y-1", className)}>
        <div className="h-2 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-primary-soft" style={{ width: `${usedFraction * 100}%` }} />
          <div
            className="-mt-2 h-full rounded-full bg-primary"
            style={{ width: `${consumedFraction * 100}%` }}
          />
        </div>
        <p className="font-mono text-xs text-ink-muted">
          {consumidas + reservadas}/{totalSessions}
        </p>
      </div>
    );
  }

  const segments = Array.from({ length: totalSessions }, (_, i) => {
    if (i < completed) return "completed" as const;
    if (i < completed + canceledCounted) return "canceled" as const;
    if (i < completed + canceledCounted + reservadas) return "reserved" as const;
    return "empty" as const;
  });

  return (
    <div className={cn("flex flex-wrap gap-1", className)} role="img" aria-label={`${consumidas + reservadas} de ${totalSessions} sessões usadas`}>
      {segments.map((state, i) => (
        <span
          key={i}
          className={cn(
            "size-3 rounded-full border-2",
            state === "completed" && "border-primary bg-primary",
            state === "canceled" && "border-ink-muted bg-surface [background-image:linear-gradient(to_top_left,transparent_calc(50%-1px),var(--ink-muted),transparent_calc(50%+1px))]",
            state === "reserved" && "border-primary bg-transparent",
            state === "empty" && "border-line bg-transparent",
          )}
        />
      ))}
    </div>
  );
}
