"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCreatePatientMutation } from "@/hooks/use-patients";
import { ApiClientError } from "@/lib/api-client";
import type { PatientDTO } from "@/lib/types";

/**
 * Cadastro de paciente + pacote sem sair do diálogo de agendamento (seção 7.3.A).
 * Ela nunca deve precisar sair da agenda para cadastrar alguém.
 */
export function NewPatientInlineForm({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string;
  onCreated: (patient: PatientDTO) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [totalSessions, setTotalSessions] = useState("10");
  const [priceReais, setPriceReais] = useState("");

  const createPatient = useCreatePatientMutation();

  // Não pode ser um <form> de verdade: este componente é renderizado dentro do
  // <form> do AppointmentFormDialog, e HTML não permite <form> aninhado.
  function handleSubmit() {
    if (!name.trim()) {
      toast.error("Informe o nome do paciente.");
      return;
    }
    const totalSessionsNum = Number(totalSessions);
    const priceCents = Math.round((Number(priceReais.replace(",", ".")) || 0) * 100);

    createPatient.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || null,
        package:
          totalSessionsNum > 0
            ? { totalSessions: totalSessionsNum, priceCents }
            : undefined,
      },
      {
        onSuccess: (data) => {
          toast.success(`${data.patient.name} cadastrada.`);
          onCreated(data.patient);
        },
        onError: (err) => {
          const message = err instanceof ApiClientError ? err.message : "Não foi possível cadastrar.";
          toast.error(message);
        },
      },
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-bg p-3">
      <div className="space-y-1.5">
        <Label htmlFor="new-patient-name">Nome</Label>
        <Input id="new-patient-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-patient-phone">Telefone (opcional)</Label>
        <Input
          id="new-patient-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+55 66 99999-0000"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-patient-sessions">Sessões do pacote</Label>
          <Input
            id="new-patient-sessions"
            type="number"
            min={0}
            value={totalSessions}
            onChange={(e) => setTotalSessions(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-patient-price">Valor do pacote (R$)</Label>
          <Input
            id="new-patient-price"
            inputMode="decimal"
            placeholder="0,00"
            value={priceReais}
            onChange={(e) => setPriceReais(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSubmit} disabled={createPatient.isPending}>
          {createPatient.isPending ? "Cadastrando…" : "Cadastrar paciente"}
        </Button>
      </div>
    </div>
  );
}
