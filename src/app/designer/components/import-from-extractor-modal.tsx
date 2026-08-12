"use client";

import { useState } from "react";
import { X, FileText, Trash2 } from "lucide-react";
import { useDraftStorage } from "@/hooks/useDraftStorage";
import { draftFieldsToMigrationRaw, planPagedImport, resolveImportStartPage } from "@/lib/designer/actions";
import { PagingControls, defaultPagingValue, isPagingValid, type PagingValue } from "./paging-controls";
import type { DesignerPage } from "@/lib/designer/types";
import type { ChecklistDraft } from "@/lib/types";

interface Props {
  pages: DesignerPage[];
  page: DesignerPage;
  onClose: () => void;
  onPick: (
    draft: ChecklistDraft,
    paging: PagingValue | null,
    replaceExisting: boolean,
    targetSheets?: number
  ) => void;
}

export function ImportFromExtractorModal({ pages, page, onClose, onPick }: Props) {
  const { listDrafts, deleteDraft } = useDraftStorage();
  const [drafts, setDrafts] = useState<ChecklistDraft[]>(() =>
    listDrafts().filter((d) => (d.dados?.campos_gerados?.length ?? 0) > 0)
  );
  /** Rascunho aguardando confirmação de exclusão (apagar é definitivo). */
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [paged, setPaged] = useState(true);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [useTarget, setUseTarget] = useState(true);
  const [paging, setPaging] = useState<PagingValue>(() => defaultPagingValue(page, pages));

  /** Apaga o rascunho do Extrator — some também do Histórico, não só desta lista. */
  function handleDelete(id: string) {
    deleteDraft(id);
    setDrafts(listDrafts().filter((d) => (d.dados?.campos_gerados?.length ?? 0) > 0));
    setDeleteConfirm(null);
  }
  /** Algum rascunho traz a contagem de folhas medida pelas imagens de referência? */
  const anyTarget = drafts.some((d) => (d.dados.paginas_referencia ?? 0) > 0);

  const pagingOk = !paged || isPagingValid(paging);
  const existingGroups = pages
    .filter((p) => p.kind === "checklist" && p.docType === page.docType)
    .reduce((a, p) => a + p.groups.filter((g) => g.markers.length > 0).length, 0);

  /** Folhas registradas no Extrator (uma imagem de referência por folha). */
  const targetOf = (d: ChecklistDraft) => (useTarget ? d.dados.paginas_referencia || undefined : undefined);

  /** Quantas folhas este rascunho ocuparia, e a sobra de cada uma (para diagnóstico). */
  function sheetsFor(d: ChecklistDraft): { count: number; detail: string; target?: number } | null {
    if (!paged || !pagingOk) return null;
    const basePage = resolveImportStartPage(pages, page, replaceExisting);
    const target = targetOf(d);
    const plan = planPagedImport(basePage, draftFieldsToMigrationRaw(d.dados.campos_gerados), {
      ...paging,
      targetSheets: target,
      replaceExisting,
    });
    if (!plan) return null;
    const detail = plan.sheets
      .map((s, i) => {
        const items = s.reduce((a, g) => a + g.names.length, 0);
        const endY = s.length ? s[s.length - 1].yStart + (s[s.length - 1].names.length - 1) * plan.increment : 0;
        return `folha ${i + 1}: ${items} itens, sobra ${(paging.yLimit - endY).toFixed(0)}mm`;
      })
      .join("\n");
    return { count: plan.sheets.length, detail, target };
  }

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
              {drafts.map((d) => {
                const sheets = sheetsFor(d);
                const confirming = deleteConfirm === d.id;
                return (
                  <div
                    key={d.id}
                    className={`flex items-center rounded-lg border transition-colors ${
                      confirming
                        ? "border-[#ED3237]/50 bg-[#ED3237]/5"
                        : "border-[#e8e8e8] hover:border-[#173872]/40 hover:bg-[#F9F9F9]"
                    }`}
                  >
                    <button
                      disabled={!pagingOk || confirming}
                      onClick={() => {
                        onPick(d, paged ? paging : null, replaceExisting, targetOf(d));
                        onClose();
                      }}
                      className="flex-1 min-w-0 flex items-center gap-3 p-3 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                      title={
                        !pagingOk
                          ? "Ajuste a área útil da folha antes de importar"
                          : sheets
                          ? `Distribuição prevista:\n${sheets.detail}`
                          : undefined
                      }
                    >
                      <FileText className="w-4 h-4 text-[#173872] shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-[#464E5F] truncate">{d.nome}</span>
                        <span className="block text-xs text-[#80808F]">
                          {d.dados.campos_gerados.length} campos
                          {d.tipo ? ` · ${d.tipo}` : ""}
                          {page.docType === "manutencao" && d.dados.plano_manutencao ? (
                            <>
                              {" · "}
                              <span
                                className="text-[#173872]"
                                title="Quantidade, km e meses das revisões vêm deste rascunho para o Gerar por progressão"
                              >
                                {d.dados.plano_manutencao.revisoes} revisões
                              </span>
                            </>
                          ) : null}
                          {d.dados.paginas_referencia ? (
                            <>
                              {" · "}
                              <span className="text-[#173872]">{d.dados.paginas_referencia} folhas no extrator</span>
                            </>
                          ) : null}
                          {sheets && (
                            <>
                              {" · "}
                              <b className={sheets.target && sheets.count !== sheets.target ? "text-[#FFB822]" : "text-[#0BB783]"}>
                                {sheets.count}
                              </b>{" "}
                              folha{sheets.count === 1 ? "" : "s"}
                              {sheets.target && sheets.count !== sheets.target ? " (alvo não atingido)" : ""}
                            </>
                          )}
                        </span>
                      </span>
                    </button>

                    {confirming ? (
                      <span className="flex items-center gap-1 pr-2 shrink-0">
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="px-2 py-1 rounded-md bg-[#ED3237] hover:bg-[#c8272b] text-white text-[11px] font-medium transition-colors"
                        >
                          Excluir
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 rounded-md border border-[#e0e0e0] bg-white hover:bg-[#F9F9F9] text-[#80808F] text-[11px] transition-colors"
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(d.id)}
                        title="Excluir este checklist — apaga o rascunho do Extrator, não só desta lista"
                        className="shrink-0 p-2 mr-1 rounded-lg text-[#b0b0bf] hover:text-[#ED3237] hover:bg-[#ED3237]/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 space-y-2">
            {anyTarget && paged && (
              <label className="flex items-start gap-2 text-xs text-[#464E5F] cursor-pointer select-none border border-[#173872]/25 bg-[#173872]/5 rounded-lg p-2.5">
                <input
                  type="checkbox"
                  checked={useTarget}
                  onChange={(e) => setUseTarget(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <b>usar a quantidade de folhas do extrator</b>
                  <span className="block text-[10.5px] text-[#80808F] leading-snug">
                    Distribui os campos igualmente nas folhas que você enviou como imagem de referência, em vez de
                    estimar pela altura. A área útil continua sendo o teto — se o alvo não couber, saem mais folhas e o
                    aviso aparece.
                  </span>
                </span>
              </label>
            )}
            <PagingControls
              enabled={paged}
              onEnabledChange={setPaged}
              value={paging}
              onChange={setPaging}
              replaceExisting={replaceExisting}
              onReplaceExistingChange={setReplaceExisting}
              existingGroups={existingGroups}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
