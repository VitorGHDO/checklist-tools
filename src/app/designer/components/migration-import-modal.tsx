"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { parseMigrationGroups } from "@/lib/designer/migration-parse";
import { planPagedImport, resolveImportStartPage } from "@/lib/designer/actions";
import { PagingControls, defaultPagingValue, isPagingValid, type PagingValue } from "./paging-controls";
import type { DesignerPage } from "@/lib/designer/types";

interface Props {
  pages: DesignerPage[];
  page: DesignerPage;
  onClose: () => void;
  onImport: (raw: string, generate: boolean, paging: PagingValue | null, replaceExisting: boolean) => boolean;
}

export function MigrationImportModal({ pages, page, onClose, onImport }: Props) {
  const [text, setText] = useState("");
  const [generate, setGenerate] = useState(true);
  const [paged, setPaged] = useState(true);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [paging, setPaging] = useState<PagingValue>(() => defaultPagingValue(page, pages));

  const blocks = parseMigrationGroups(text);
  const total = blocks.reduce((s, b) => s + b.names.length, 0);
  const pagingOk = !paged || isPagingValid(paging);
  const basePage = resolveImportStartPage(pages, page, replaceExisting);
  const plan =
    paged && pagingOk && blocks.length ? planPagedImport(basePage, text, { ...paging, replaceExisting }) : null;
  const existingGroups = pages
    .filter((p) => p.kind === "checklist" && p.docType === page.docType)
    .reduce((a, p) => a + p.groups.filter((g) => g.markers.length > 0).length, 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white border border-[#e8e8e8] rounded-xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        style={{ boxShadow: "0px 20px 60px 0px rgba(76,87,125,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#e8e8e8]">
          <div>
            <h2 className="font-semibold text-[#464E5F] text-sm">Importar migration com grupos</h2>
            <p className="mt-1.5 text-xs text-[#80808F] leading-relaxed max-w-xl">
              Cole os campos com os títulos em comentário. Cada linha tipo{" "}
              <code className="font-mono text-[#173872]">{"//TÍTULO //"}</code> (ou <code className="font-mono">#</code> /{" "}
              <code className="font-mono">{"/* */"}</code>) vira um <strong>grupo</strong>, e as linhas de migration abaixo
              dela viram os <strong>campos</strong> daquele grupo.
            </p>
          </div>
          <button onClick={onClose} className="text-[#80808F] hover:text-[#464E5F] ml-4 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-auto">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={12}
            placeholder={"//PREPARAÇÃO INICIAL //\n$table->integer('campo1');\n$table->integer('campo2');\n\n//LATERAL DIANTEIRA ESQUERDA //\n$table->integer('campo1_lateral');"}
            className="w-full bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg p-3 text-xs font-mono text-[#464E5F] resize-y focus:outline-none focus:ring-2 focus:ring-[#173872]/30"
          />
          <p className="mt-2 text-xs text-[#80808F]">
            {blocks.length === 0 ? (
              "Nenhum grupo reconhecido ainda."
            ) : (
              <>
                <b className="text-[#0BB783]">{blocks.length}</b> grupo(s), <b className="text-[#0BB783]">{total}</b>{" "}
                campo(s):{" "}
                {blocks.map((b, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    {b.title || "(sem título)"} <span className="text-[#b0b0bf]">({b.names.length})</span>
                  </span>
                ))}
              </>
            )}
          </p>

          <div className="mt-3">
            <PagingControls
              enabled={paged}
              onEnabledChange={setPaged}
              value={paging}
              onChange={setPaging}
              preview={
                plan
                  ? {
                      pages: plan.sheets.length,
                      split: plan.splitCount,
                      sheets: plan.sheets.map((s) => ({
                        groups: s.length,
                        items: s.reduce((a, g) => a + g.names.length, 0),
                        endY: s.length
                          ? s[s.length - 1].yStart + (s[s.length - 1].names.length - 1) * plan.increment
                          : 0,
                      })),
                    }
                  : null
              }
              replaceExisting={replaceExisting}
              onReplaceExistingChange={setReplaceExisting}
              existingGroups={existingGroups}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-[#e8e8e8]">
          <label className="mr-auto flex items-center gap-2 text-xs text-[#80808F] cursor-pointer select-none">
            <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} />
            já gerar marcações empilhadas
          </label>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[#e8e8e8] bg-[#F9F9F9] hover:bg-[#efefef] text-[#464E5F] text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={!pagingOk}
            onClick={() => {
              if (onImport(text, generate, paged ? paging : null, replaceExisting)) onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-[#173872] hover:bg-[#122d5e] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#173872]"
            title={pagingOk ? undefined : "Ajuste a área útil da folha antes de importar"}
          >
            Importar
          </button>
        </div>
      </div>
    </div>
  );
}
