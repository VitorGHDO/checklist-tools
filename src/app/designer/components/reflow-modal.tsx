"use client";

import { useState } from "react";
import { X, Layers, AlertTriangle } from "lucide-react";
import { restackSheets } from "@/lib/designer/flow";
import { defaultPagingValue, isPagingValid, type PagingValue } from "./paging-controls";
import type { DesignerPage } from "@/lib/designer/types";

interface Props {
  pages: DesignerPage[];
  page: DesignerPage;
  onClose: () => void;
  onApply: (paging: PagingValue) => void;
}

const num = "w-16 bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono";

export function ReflowModal({ pages, page, onClose, onApply }: Props) {
  const [paging, setPaging] = useState<PagingValue>(() => defaultPagingValue(page, pages));
  const valid = isPagingValid(paging);
  // prévia sobre uma cópia (sem imagens) — não toca nas folhas reais
  const preview = valid
    ? restackSheets(
        pages
          .filter((p) => p.kind === "checklist" && p.docType === page.docType)
          .map((p) => ({
            ...p,
            imageSrc: null,
            groups: p.groups.map((g) => ({ ...g, markers: g.markers.map((m) => ({ ...m })) })),
          })),
        page.docType,
        { yTop: paging.yTop, yTopNext: paging.yTopNext, yLimit: paging.yLimit, groupGapMm: paging.groupGapMm }
      )
    : null;

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
              <Layers className="w-4 h-4 text-[#173872]" />
              Padrões do fluxo
            </h2>
            <p className="mt-1.5 text-xs text-[#80808F] leading-relaxed max-w-md">
              Faixa útil padrão das folhas que não têm a sua própria (a faixa individual, calibrada no painel
              <b> Página</b>, sempre vence) e o espaço entre seções. Ao aplicar, os grupos são alinhados dentro de
              cada folha — nenhum muda de folha.
            </p>
          </div>
          <button onClick={onClose} className="text-[#80808F] hover:text-[#464E5F] ml-4 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-auto space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <label className="text-[#80808F]">y folha 1</label>
            <input
              type="number"
              step="0.1"
              value={paging.yTop}
              onChange={(e) => setPaging({ ...paging, yTop: parseFloat(e.target.value) || 0 })}
              className={num}
              title="Y (mm) da 1ª marcação na folha 1"
            />
            <label className="text-[#80808F]">y folhas 2+</label>
            <input
              type="number"
              step="0.1"
              value={paging.yTopNext}
              onChange={(e) => setPaging({ ...paging, yTopNext: parseFloat(e.target.value) || 0 })}
              className={num}
              title="Y (mm) da 1ª marcação nas folhas seguintes"
            />
            <label className="text-[#80808F]">y limite</label>
            <input
              type="number"
              step="0.1"
              value={paging.yLimit}
              onChange={(e) => setPaging({ ...paging, yLimit: parseFloat(e.target.value) || 0 })}
              className={num}
              title="Y (mm) máximo utilizável"
            />
            <label className="text-[#80808F]">gap entre seções</label>
            <input
              type="number"
              step="0.1"
              value={paging.groupGapMm}
              onChange={(e) => setPaging({ ...paging, groupGapMm: parseFloat(e.target.value) || 0 })}
              className={num}
              title="Espaço (mm) entre o fim de uma seção e o início da próxima — é o que mais muda a contagem de folhas"
            />
            <span className={`text-[10px] ${valid ? "text-[#b0b0bf]" : "text-[#F64E60] font-semibold"}`}>
              faixa padrão: folha 1 {+(paging.yLimit - paging.yTop).toFixed(1)}mm · folhas 2+{" "}
              {+(paging.yLimit - paging.yTopNext).toFixed(1)}mm
            </span>
          </div>

          {!valid ? (
            <p className="text-xs text-[#F64E60] leading-snug">
              Área útil insuficiente — aumente o <b>y limite</b>.
            </p>
          ) : preview ? (
            <div className="border border-[#e0e0e0] rounded-lg bg-[#F9F9F9] p-3 space-y-1.5 text-[11px] text-[#464E5F]">
              <div className="text-[10px] uppercase tracking-wide text-[#80808F] font-semibold">
                Com esta faixa padrão
              </div>
              <div>
                {preview.sheets.length} folha(s) · {preview.totalMarkers} marcação(ões)
              </div>
              <div className="flex flex-wrap gap-1">
                {preview.sheets.map((s2) => (
                  <span
                    key={s2.page.id}
                    className={`px-1.5 py-0.5 rounded border text-[9.5px] font-mono ${
                      s2.overflow
                        ? "border-[#FFB822] bg-[#FFB822]/10 text-[#FFB822]"
                        : "border-[#e0e0e0] bg-white text-[#80808F]"
                    }`}
                    title={`${s2.page.name}: ${s2.groups} grupo(s), ${s2.markers} item(ns), faixa ${s2.top}–${s2.bottom}mm, fim em ${s2.endY}mm`}
                  >
                    f{s2.index + 1}: {s2.endY}mm
                  </span>
                ))}
              </div>
              {preview.overflowSheets.length > 0 && (
                <div className="flex items-start gap-1.5 text-[#FFB822]">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                  {preview.overflowSheets.join(", ")} passa(m) da faixa. Nada é movido automaticamente — distribua os
                  grupos ou parta um deles.
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-[#F64E60]">Faixa útil inválida para acomodar o conteúdo.</p>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-[#e8e8e8]">
          <span className="mr-auto text-[10.5px] text-[#80808F]">A faixa individual de cada folha tem prioridade.</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[#e8e8e8] bg-[#F9F9F9] hover:bg-[#efefef] text-[#464E5F] text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={!valid || !preview}
            onClick={() => {
              onApply(paging);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-[#173872] hover:bg-[#122d5e] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#173872]"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
