"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePatientsSearchQuery } from "@/hooks/use-patients";
import type { PatientDTO } from "@/lib/types";

export function PatientCombobox({
  selected,
  onSelect,
  onCreateNew,
}: {
  selected: PatientDTO | null;
  onSelect: (patient: PatientDTO) => void;
  onCreateNew: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(id);
  }, [query]);

  const { data: patients, isFetching } = usePatientsSearchQuery(debouncedQuery);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? selected.name : "Buscar paciente…"}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Digite o nome…" value={query} onValueChange={setQuery} />
          <CommandList>
            {!isFetching && (!patients || patients.length === 0) && (
              <CommandEmpty>Nenhum paciente encontrado.</CommandEmpty>
            )}
            <CommandGroup>
              {patients?.map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={patient.id}
                  onSelect={() => {
                    onSelect(patient);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", selected?.id === patient.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">{patient.name}</span>
                  {patient.activePackage && (
                    <span className="font-mono text-xs text-ink-muted">
                      {patient.activePackage.consumidas + patient.activePackage.reservadas}/
                      {patient.activePackage.totalSessions}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {query.trim() && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${query}`}
                  onSelect={() => {
                    onCreateNew(query.trim());
                    setOpen(false);
                  }}
                  className="text-primary"
                >
                  <UserPlus className="size-4" />
                  Criar paciente &quot;{query.trim()}&quot;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
