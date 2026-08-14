"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Archive, ArchiveRestore, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PackageProgress } from "@/components/patient/PackageProgress";
import { NewPatientInlineForm } from "@/components/patient/NewPatientInlineForm";
import {
  usePatientsSearchQuery,
  usePatientPackagesQuery,
  useUpdatePatientMutation,
  useUpdatePackageMutation,
  useCreatePackageMutation,
} from "@/hooks/use-patients";
import { formatCents } from "@/lib/format";
import { ApiClientError } from "@/lib/api-client";
import type { PatientDTO } from "@/lib/types";

export default function PacientesPage() {
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: patients, isLoading } = usePatientsSearchQuery(query, { includeArchived });

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <Link href="/agenda" className="text-ink-muted hover:text-ink" aria-label="Voltar para a agenda">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-heading text-xl font-semibold text-ink">Pacientes</h1>
        <div className="ml-auto flex gap-2">
          {/* Link de verdade (não navegação via JS): a rota devolve Content-Disposition: attachment. */}
          <Button variant="outline" size="sm" asChild>
            <a href="/api/export">
              <Download className="size-4" />
              Baixar meus dados
            </a>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Novo paciente
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-3">
        <Input placeholder="Buscar por nome…" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1" />
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink-muted">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Mostrar arquivados
        </label>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Carregando…</p>}

      {!isLoading && (patients?.length ?? 0) === 0 && (
        <p className="py-12 text-center text-sm text-ink-muted">
          {query ? "Nenhum paciente encontrado." : "Nenhum paciente cadastrado ainda."}
        </p>
      )}

      <ul className="space-y-2">
        {patients?.map((patient) => (
          <PatientRow
            key={patient.id}
            patient={patient}
            expanded={expandedId === patient.id}
            onToggle={() => setExpandedId((id) => (id === patient.id ? null : patient.id))}
          />
        ))}
      </ul>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo paciente</DialogTitle>
          </DialogHeader>
          <NewPatientInlineForm initialName="" onCreated={() => setCreateOpen(false)} onCancel={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PatientRow({
  patient,
  expanded,
  onToggle,
}: {
  patient: PatientDTO;
  expanded: boolean;
  onToggle: () => void;
}) {
  const updatePatient = useUpdatePatientMutation();

  function toggleArchive() {
    updatePatient.mutate(
      { id: patient.id, active: !patient.active },
      {
        onSuccess: () => toast.success(patient.active ? "Paciente arquivada." : "Paciente reativada."),
        onError: (err) => toast.error(err instanceof ApiClientError ? err.message : "Não foi possível atualizar."),
      },
    );
  }

  return (
    <li className="rounded-lg border border-line bg-surface">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-medium text-ink">
            {patient.name}
            {!patient.active && (
              <Badge variant="secondary" className="font-normal">
                Arquivada
              </Badge>
            )}
          </p>
          {patient.phone && <p className="truncate text-xs text-ink-muted">{patient.phone}</p>}
        </div>
        {patient.activePackage ? (
          <div className="w-32 shrink-0 text-right">
            <PackageProgress
              totalSessions={patient.activePackage.totalSessions}
              completed={patient.activePackage.completed ?? 0}
              canceledCounted={patient.activePackage.canceledCounted ?? 0}
              reservadas={patient.activePackage.reservadas}
              className="justify-end"
            />
          </div>
        ) : (
          <span className="shrink-0 text-xs text-ink-muted">Sem pacote ativo</span>
        )}
      </button>

      {expanded && <PatientDetails patient={patient} onToggleArchive={toggleArchive} isPending={updatePatient.isPending} />}
    </li>
  );
}

function PatientDetails({
  patient,
  onToggleArchive,
  isPending,
}: {
  patient: PatientDTO;
  onToggleArchive: () => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState(patient.notes ?? "");
  const [showNewPackage, setShowNewPackage] = useState(false);
  const [sessions, setSessions] = useState("10");
  const [price, setPrice] = useState("");

  const packagesQuery = usePatientPackagesQuery(patient.id);
  const updatePatient = useUpdatePatientMutation();
  const createPackage = useCreatePackageMutation(patient.id);

  function saveNotes() {
    updatePatient.mutate(
      { id: patient.id, notes },
      { onSuccess: () => toast.success("Observações salvas.") },
    );
  }

  function handleCreatePackage() {
    const totalSessions = Number(sessions);
    const priceCents = Math.round((Number(price.replace(",", ".")) || 0) * 100);
    if (!totalSessions || totalSessions <= 0) {
      toast.error("Informe o número de sessões.");
      return;
    }
    createPackage.mutate(
      { totalSessions, priceCents },
      {
        onSuccess: () => {
          toast.success("Pacote criado.");
          setShowNewPackage(false);
          setSessions("10");
          setPrice("");
        },
      },
    );
  }

  return (
    <div className="space-y-4 border-t border-line p-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-ink-muted">Observações</p>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {notes !== (patient.notes ?? "") && (
          <Button size="sm" variant="outline" onClick={saveNotes} disabled={updatePatient.isPending}>
            Salvar
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Histórico de pacotes</p>
        {packagesQuery.data?.map((pkg) => <PackageRow key={pkg.id} pkg={pkg} />)}

        {showNewPackage ? (
          <div className="space-y-2 rounded-lg border border-line bg-bg p-3">
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min={1} value={sessions} onChange={(e) => setSessions(e.target.value)} placeholder="Sessões" />
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Valor (R$)" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreatePackage} disabled={createPackage.isPending}>
                Criar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewPackage(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowNewPackage(true)}>
            <Plus className="size-4" />
            Novo pacote
          </Button>
        )}
      </div>

      <Button size="sm" variant="ghost" onClick={onToggleArchive} disabled={isPending} className="text-ink-muted">
        {patient.active ? (
          <>
            <Archive className="size-4" />
            Arquivar paciente
          </>
        ) : (
          <>
            <ArchiveRestore className="size-4" />
            Reativar paciente
          </>
        )}
      </Button>
    </div>
  );
}

function PackageRow({ pkg }: { pkg: NonNullable<ReturnType<typeof usePatientPackagesQuery>["data"]>[number] }) {
  const updatePackage = useUpdatePackageMutation();

  return (
    <div className="rounded-lg border border-line p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{pkg.label ?? "Pacote"}</p>
        <Badge variant={pkg.status === "ACTIVE" ? "default" : "secondary"} className="font-normal">
          {pkg.status === "ACTIVE" ? "Ativo" : pkg.status === "COMPLETED" ? "Concluído" : "Cancelado"}
        </Badge>
      </div>
      <p className="text-xs text-ink-muted">
        {formatCents(pkg.priceCents)} · {pkg.consumidas + pkg.reservadas} de {pkg.totalSessions} usadas
      </p>
      <PackageProgress
        totalSessions={pkg.totalSessions}
        completed={pkg.completed ?? 0}
        canceledCounted={pkg.canceledCounted ?? 0}
        reservadas={pkg.reservadas}
        className="mt-1.5"
      />
      {pkg.status === "ACTIVE" && (
        <button
          type="button"
          onClick={() =>
            updatePackage.mutate(
              { id: pkg.id, status: "CANCELED" },
              { onSuccess: () => toast.success("Pacote cancelado.") },
            )
          }
          className="mt-1.5 text-xs text-danger hover:underline"
        >
          Cancelar pacote
        </button>
      )}
    </div>
  );
}
