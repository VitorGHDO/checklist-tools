"use client";

import { useState } from "react";
import { X, FileText } from "lucide-react";
import { useDraftStorage } from "@/hooks/useDraftStorage";
import type { ChecklistDraft } from "@/lib/types";

interface Props {
  onClose: () => void;
  onPick: (draft: ChecklistDraft) => void;
}

export function ImportFromExtractorModal({ onClose, onPick }: Props) {
  const { listDrafts } = useDraftStorage();
  const [drafts] = useState<ChecklistDraft[]>(() =>
    listDrafts().filter((d) => (d.dados?.campos_gerados?.length ?? 0) > 0)
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white border border-[#e8e8e8] rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        style={{ boxShadow: "0px 20px 60px 0px rgba(76,87,125,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8e8]">
          <div>
            <h2 className="font-semibold text-[#464E5F] text-sm">Importar campos do Extrator</h2>
            <p className="mt-1 text-xs text-[#80808F]">
              Escolha um checklist já extraído — os campos (agrupados por seção) viram grupos aqui.
            </p>
          </div>
          <button onClick={onClose} className="text-[#80808F] hover:text-[#464E5F] ml-4 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-auto">
          {drafts.length === 0 ? (
            <p className="text-sm text-[#80808F] py-6 text-center">
              Nenhum rascunho do Extrator com campos gerados. Gere os campos no Extrator primeiro.
            </p>
          ) : (
            <div className="space-y-2">
              {drafts.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    onPick(d);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#e8e8e8] hover:border-[#173872]/40 hover:bg-[#F9F9F9] transition-colors text-left"
                >
                  <FileText className="w-4 h-4 text-[#173872] shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-[#464E5F] truncate">{d.nome}</span>
                    <span className="block text-xs text-[#80808F]">
                      {d.dados.campos_gerados.length} campos
                      {d.tipo ? ` · ${d.tipo}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
