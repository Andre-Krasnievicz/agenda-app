"use client";

import { useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
          },
        },
        // Uma atualização em segundo plano (ex.: refetch ao voltar o foco na janela)
        // que falha NUNCA deve apagar dados já carregados na tela — o TanStack Query
        // marca `isError: true` mesmo com `data` ainda válido em cache, e um componente
        // que troca a tela inteira por uma mensagem de erro nesse caso "pisca" a UI a
        // cada soluço de rede. Aqui só avisamos discretamente por toast; quem decide
        // bloquear a tela é cada componente, e só quando não há dado nenhum para mostrar.
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (query.state.data !== undefined) {
              toast.error("Não foi possível atualizar agora. Tentando de novo…", {
                id: "query-refetch-error",
              });
            }
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster position="top-center" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
