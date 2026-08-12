"use client";

import { useState } from "react";
import { X, Eraser, FileStack, AlertTriangle } from "lucide-react";
import type { DesignerDocType, DesignerPage } from "@/lib/designer/types";

export type ResetScope = "groups" | "sheets" | "all";

interface Props {
  pages: DesignerPage[];
  docType: DesignerDocType;
  docTypeLabel: string;
  onClose: () => void;
  onApply: (scope: ResetScope, keepImage: boolean) => void;
}

export function ResetModal({ pages, docType, docTypeLabel, onClose, onApply }: Props) {
  const [scope, setScope] = useState<ResetScope>("sheets");
  const [keepImage, setKeepImage] = useState(true);

  const sheets = pages.filter((p) => p.kind === "checklist" && p.docType === docType);
  const groups = sheets.reduce((a, p) => a + p.groups.length, 0);
  const markers = sheets.reduce((a, p) => a + p.groups.reduce((b, g) => b + g.markers.length, 0), 0);
  const allSheets = pages.filter((p) => p.kind === "checklist").length;
  const allHeaderFields = pages.reduce((a, p) => a + p.headerFields.length, 0);

  const OPTIONS: { id: ResetScope; label: string; desc: string }[] = [
    {
      id: "groups",
      label: "Limpar os grupos",
      desc: `Apaga ${groups} grupo(s) e ${markers} marcação(ões) das ${sheets.length} folha(s) de ${docTypeLabel}. Mantém as folhas, as imagens e a calibração (x fixo / incremento) para a próxima importação.`,
    },
    {
      id: "sheets",
      label: "Voltar a uma folha só",
      desc: `O acima e ainda descarta ${Math.max(0, sheets.length - 1)} folha(s) extra(s), renumerando a que sobrar como "Folha 1".`,
    },
    {
      id: "all",
      label: "Recomeçar o projeto do zero",
      desc: `Descarta TUDO: ${allSheets} folha(s) de todos os tipos de documento, ${allHeaderFields} campo(s) de cabeçalho/footer, as imagens e o autosave do navegador.`,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white border border-[#e8e8e8] rounded-xl w-full max-w-lg max-h-[88vh] flex flex-col"
        style={{ boxShadow: "0px 20px 60px 0px rgba(76,87,125,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#e8e8e8]">
          <div>
            <h2 className="font-semibold text-[#464E5F] text-sm flex items-center gap-2">
              <Eraser className="w-4 h-4 text-[#F64E60]" />
              Limpar / recomeçar
            </h2>
            <p className="mt-1.5 text-xs text-[#80808F] leading-relaxed max-w-md">
              Escolha o quanto descartar. A ação não tem desfazer — se quiser guardar o estado atual, cancele e use
              <b> Salvar arquivo</b> antes.
            </p>
          </div>
          <button onClick={onClose} className="text-[#80808F] hover:text-[#464E5F] ml-4 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-auto space-y-2">
          {OPTIONS.map((o) => (
            <label
              key={o.id}
              className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                scope === o.id ? "border-[#173872]/40 bg-[#173872]/5" : "border-[#e8e8e8] hover:bg-[#F9F9F9]"
              }`}
            >
              <input
                type="radio"
                name="reset-scope"
                checked={scope === o.id}
                onChange={() => setScope(o.id)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-xs font-semibold text-[#464E5F]">{o.label}</span>
                <span className="block mt-0.5 text-[10.5px] text-[#80808F] leading-snug">{o.desc}</span>
              </span>
            </label>
          ))}

          {scope === "sheets" && (
            <label className="flex items-center gap-2 text-xs text-[#464E5F] cursor-pointer select-none pl-1 pt-1">
              <input type="checkbox" checked={keepImage} onChange={(e) => setKeepImage(e.target.checked)} />
              <FileStack className="w-3.5 h-3.5 text-[#173872]" />
              manter o JPG de fundo da Folha 1
            </label>
          )}

          {scope === "all" && (
            <p className="flex items-start gap-1.5 text-[11px] text-[#F64E60] leading-snug pt-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Isso também apaga o rascunho salvo automaticamente no navegador. Projetos exportados em arquivo não são
              afetados.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-[#e8e8e8]">
          <button
            onClick={onClose}
            className="ml-auto px-3 py-1.5 rounded-lg border border-[#e8e8e8] bg-[#F9F9F9] hover:bg-[#efefef] text-[#464E5F] text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onApply(scope, keepImage);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-[#F64E60] hover:bg-[#e04455] text-white text-sm font-medium"
          >
            {scope === "all" ? "Recomeçar do zero" : "Limpar"}
          </button>
        </div>
      </div>
    </div>
  );
}
