"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, ArrowLeft, Clock, CheckCircle2 } from "lucide-react";
import type { ChecklistDraft } from "@/lib/types";
import { useDraftStorage } from "@/hooks/useDraftStorage";

const STEP_LABELS: Record<number, string> = {
  1: "Seleção de projeto",
  2: "Tipo de checklist",
  3: "Upload de arquivos",
  4: "Processamento / edição IA",
};

const TIPO_LABELS: Record<string, string> = {
  "roteiro-entrega-tecnica": "Roteiro para Entrega Técnica",
  "revisao-entrega": "Revisão de Entrega",
  "inspecao-pre-entrega": "Inspeção Pré-Entrega",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoricoPage() {
  const router = useRouter();
  const { listDrafts, deleteDraft } = useDraftStorage();
  const [drafts, setDrafts] = useState<ChecklistDraft[]>([]);
  const [sqlModal, setSqlModal] = useState<{ nome: string; sql: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(listDrafts());
  }, [listDrafts]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteDraft(id);
      setDrafts(listDrafts());
      setDeleteConfirm(null);
    },
    [deleteDraft, listDrafts]
  );

  const handleContinuar = useCallback(
    (draft: ChecklistDraft) => {
      sessionStorage.setItem("checklist_resume_id", draft.id);
      router.push("/extrator");
    },
    [router]
  );

  return (
    <div className="min-h-screen bg-[#e6e6e6] text-[#464E5F]">
      {/* Header */}
      <header
        className="sticky top-0 z-40 bg-white border-b border-[#e8e8e8]"
        style={{ boxShadow: "0px 10px 30px 0px rgba(82,63,105,0.05)" }}
      >
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/extrator"
              className="p-2 rounded-lg hover:bg-[#F9F9F9] transition-colors text-[#80808F] hover:text-[#464E5F]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-7 h-7 bg-[#173872] rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base font-semibold text-[#173872]">
              Histórico de Checklists
            </h1>
          </div>
          <Link
            href="/"
            className="text-sm text-[#80808F] hover:text-[#173872] transition-colors"
          >
            Início
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {drafts.length === 0 ? (
          <div
            className="bg-white rounded-xl border border-[#e8e8e8] p-16 text-center"
            style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
          >
            <div className="w-12 h-12 rounded-full bg-[#F9F9F9] border border-[#e8e8e8] flex items-center justify-center mx-auto mb-4">
              <Clock className="w-5 h-5 text-[#80808F]" />
            </div>
            <p className="text-base font-medium text-[#464E5F] mb-1">
              Nenhum checklist salvo ainda.
            </p>
            <p className="text-sm text-[#80808F]">
              Os rascunhos aparecem aqui automaticamente ao criar um novo checklist.
            </p>
            <Link
              href="/extrator"
              className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-lg bg-[#ED3237] hover:bg-[#c8272b] text-white text-sm font-medium transition-colors"
            >
              Criar novo checklist
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-white rounded-xl border border-[#e8e8e8] p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                    <span className="font-semibold text-[#464E5F] truncate">
                      {draft.nome}
                    </span>
                    {draft.finalizado ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#0BB783]/10 text-[#0BB783] border border-[#0BB783]/30 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        Finalizado
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-[#FFB822]/10 text-[#b07d00] border border-[#FFB822]/30 font-medium">
                        Em progresso
                      </span>
                    )}
                  </div>
                  {draft.descricao && (
                    <p className="text-sm text-[#80808F] mb-1.5 truncate">
                      {draft.descricao}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[#80808F]">
                    {draft.tipo && (
                      <span>
                        Tipo:{" "}
                        <span className="text-[#464E5F]">
                          {TIPO_LABELS[draft.tipo] ?? draft.tipo}
                        </span>
                      </span>
                    )}
                    <span>
                      Etapa:{" "}
                      <span className="text-[#464E5F]">
                        {STEP_LABELS[draft.etapa_atual] ?? `${draft.etapa_atual} de 4`}
                      </span>
                    </span>
                    <span>Criado: {formatDate(draft.criado_em)}</span>
                    <span>Atualizado: {formatDate(draft.atualizado_em)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {!draft.finalizado && (
                    <button
                      onClick={() => handleContinuar(draft)}
                      className="px-4 py-1.5 rounded-lg bg-[#173872] hover:bg-[#122d5e] text-white text-sm font-medium transition-colors"
                    >
                      Continuar
                    </button>
                  )}
                  {(draft.dados.status_sql || draft.dados.perguntas_sql) && (
                    <button
                      onClick={() =>
                        setSqlModal({
                          nome: draft.nome,
                          sql: draft.dados.perguntas_sql || draft.dados.status_sql,
                        })
                      }
                      className="px-4 py-1.5 rounded-lg border border-[#e8e8e8] bg-[#F9F9F9] hover:bg-[#efefef] text-[#464E5F] text-sm font-medium transition-colors"
                    >
                      Ver SQL
                    </button>
                  )}
                  {deleteConfirm === draft.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(draft.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#ED3237] hover:bg-[#c8272b] text-white text-sm font-medium transition-colors"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-1.5 rounded-lg border border-[#e8e8e8] bg-[#F9F9F9] hover:bg-[#efefef] text-[#464E5F] text-sm transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(draft.id)}
                      className="px-3 py-1.5 rounded-lg border border-[#e8e8e8] hover:border-[#ED3237]/40 hover:text-[#ED3237] text-[#80808F] text-sm transition-colors"
                    >
                      Apagar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Ver SQL */}
      {sqlModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
          onClick={() => setSqlModal(null)}
        >
          <div
            className="bg-white border border-[#e8e8e8] rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            style={{ boxShadow: "0px 20px 60px 0px rgba(76,87,125,0.15)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8e8]">
              <h2 className="font-semibold text-[#464E5F] text-sm truncate">
                {sqlModal.nome}
              </h2>
              <button
                onClick={() => setSqlModal(null)}
                className="text-[#80808F] hover:text-[#464E5F] ml-4 transition-colors"
              >
                ✕
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-xs text-[#173872] font-mono whitespace-pre-wrap bg-[#F9F9F9] rounded-b-xl">
              {sqlModal.sql}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
