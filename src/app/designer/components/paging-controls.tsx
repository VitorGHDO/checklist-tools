"use client";

import { Layers, Trash2 } from "lucide-react";
import type { DesignerPage } from "@/lib/designer/types";

/** Área útil da folha (mm) usada para decidir onde quebrar. null = não distribuir. */
export interface PagingValue {
  /** Y da 1ª marcação da folha 1 (que costuma ter o cabeçalho do documento). */
  yTop: number;
  /** Y da 1ª marcação das folhas 2..N — geralmente bem menor que o da folha 1. */
  yTopNext: number;
  yLimit: number;
  /** Espaço (mm) reservado entre o fim de uma seção e o início da próxima. */
  groupGapMm: number;
}

/**
 * Defaults derivados do projeto: o y inicial é o topo REAL do conteúdo — o menor
 * yStart entre os grupos das folhas deste docType. Usar o groups[0] da folha atual
 * era frágil: numa folha cuja 1ª seção está no meio da página, o default virava algo
 * como 170mm e a área útil calculada ficava pequena demais (folhas demais).
 */
const FALLBACK_Y_TOP = 60;

export function defaultPagingValue(page: DesignerPage | undefined, pages?: DesignerPage[]): PagingValue {
  const scope = pages?.filter((p) => p.kind === "checklist" && p.docType === page?.docType) ?? [];
  const sheets = scope.length ? scope : page ? [page] : [];

  // 1) o que o usuário já ajustou vence sempre
  const saved = sheets.find((p) => p.paging)?.paging;
  if (saved) return { ...saved };

  // 2) topo real do conteúdo: menor yStart entre os grupos QUE TÊM conteúdo.
  //    Grupos vazios ficam de fora de propósito — o grupo de calibração que sobra
  //    depois de "Limpar" costuma estar parado no meio da página, e usar o yStart
  //    dele fazia o y inicial nascer em ~170mm (área útil minúscula, folhas demais).
  const candidates: number[] = [];
  for (const p of sheets) {
    for (const g of p.groups) if (g.markers.length || (g.queue || "").trim()) candidates.push(g.yStart);
  }
  const yTop = candidates.length ? Math.min(...candidates) : FALLBACK_Y_TOP;
  const inc = page?.groups[0]?.increment ?? 6.13;
  const yLimit = +((page?.heightMm ?? 297) - 17).toFixed(1);
  return {
    yTop: +yTop.toFixed(1),
    yTopNext: +yTop.toFixed(1), // ajuste conforme o topo real das folhas 2..N do PDF
    yLimit: Math.max(yLimit, +(yTop + 20).toFixed(1)),
    groupGapMm: +(2 * inc).toFixed(2),
  };
}

/** Área útil mínima (mm) para a distribuição fazer sentido — ~3 linhas de checklist. */
const MIN_USABLE_MM = 20;

/** Área útil invertida/minúscula geraria uma folha por item; a UI bloqueia antes disso. */
export function isPagingValid(v: PagingValue): boolean {
  return v.yLimit - v.yTop >= MIN_USABLE_MM && v.yLimit - v.yTopNext >= MIN_USABLE_MM;
}

interface Props {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  value: PagingValue;
  onChange: (v: PagingValue) => void;
  /** Prévia: uma entrada por folha, mais os totais. */
  preview?: { pages: number; split: number; sheets?: { groups: number; items: number; endY: number }[] } | null;
  replaceExisting: boolean;
  onReplaceExistingChange: (v: boolean) => void;
  /** Quantos grupos já existem nas folhas deste docType (contexto para o aviso). */
  existingGroups?: number;
}

const num = "w-16 bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono";

export function PagingControls({
  enabled,
  onEnabledChange,
  value,
  onChange,
  preview,
  replaceExisting,
  onReplaceExistingChange,
  existingGroups = 0,
}: Props) {
  const valid = isPagingValid(value);
  return (
    <div className="border border-[#e0e0e0] rounded-lg bg-[#F9F9F9] p-3 space-y-2">
      <label className="flex items-center gap-2 text-xs text-[#464E5F] cursor-pointer select-none">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
        <Layers className="w-3.5 h-3.5 text-[#173872]" />
        distribuir em folhas automaticamente
      </label>

      <label className="flex items-center gap-2 text-xs text-[#464E5F] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={replaceExisting}
          onChange={(e) => onReplaceExistingChange(e.target.checked)}
        />
        <Trash2 className="w-3.5 h-3.5 text-[#F64E60]" />
        substituir os grupos existentes
        {existingGroups > 0 && <span className="text-[10px] text-[#80808F]">({existingGroups} hoje)</span>}
      </label>
      {!replaceExisting && existingGroups > 0 && (
        <p className="text-[10.5px] text-[#FFB822] leading-snug pl-6">
          Desmarcado, os {existingGroups} grupo(s) atuais são mantidos e os novos entram <b>depois</b> deles — o total
          de folhas cresce a cada importação.
        </p>
      )}

      {enabled && (
        <>
          <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-x-2 gap-y-1.5 text-xs pl-6">
            <label className="text-[#80808F] whitespace-nowrap">y folha 1</label>
            <input
              type="number"
              step="0.1"
              value={value.yTop}
              onChange={(e) => onChange({ ...value, yTop: parseFloat(e.target.value) || 0 })}
              className={num}
              title="Y (mm) da 1ª marcação na folha 1 — a que tem o cabeçalho do documento"
            />
            <label className="text-[#80808F] whitespace-nowrap">y folhas 2+</label>
            <input
              type="number"
              step="0.1"
              value={value.yTopNext}
              onChange={(e) => onChange({ ...value, yTopNext: parseFloat(e.target.value) || 0 })}
              className={num}
              title="Y (mm) da 1ª marcação nas folhas seguintes — normalmente bem menor, pois elas não têm o cabeçalho"
            />

            <label className="text-[#80808F] whitespace-nowrap">y limite</label>
            <input
              type="number"
              step="0.1"
              value={value.yLimit}
              onChange={(e) => onChange({ ...value, yLimit: parseFloat(e.target.value) || 0 })}
              className={num}
              title="Y (mm) máximo utilizável — passando disso, o grupo vai para a folha seguinte"
            />
            <label className="text-[#80808F] whitespace-nowrap">gap entre seções</label>
            <input
              type="number"
              step="0.1"
              value={value.groupGapMm}
              onChange={(e) => onChange({ ...value, groupGapMm: parseFloat(e.target.value) || 0 })}
              className={num}
              title="Espaço (mm) reservado entre o fim de uma seção e o início da próxima — é o que mais muda a quantidade de folhas"
            />
          </div>
          <div className="pl-6 text-[10px]">
            <span className={valid ? "text-[#b0b0bf]" : "text-[#F64E60] font-semibold"}>
              área útil: folha 1 {+(value.yLimit - value.yTop).toFixed(1)}mm · folhas 2+{" "}
              {+(value.yLimit - value.yTopNext).toFixed(1)}mm
            </span>
          </div>

          {!valid ? (
            <p className="text-[10.5px] text-[#F64E60] leading-snug pl-6">
              Área útil insuficiente: o <b>y limite</b> precisa ser ao menos {MIN_USABLE_MM}mm maior que o{" "}
              <b>y inicial</b>, senão cada folha receberia quase nada.
            </p>
          ) : (
          <div className="pl-6 space-y-1">
            {preview && (
              <>
                <p className="text-[10.5px] text-[#464E5F]">
                  <b className="text-[#0BB783]">{preview.pages}</b> folha(s)
                  {preview.split > 0 && (
                    <>
                      {" · "}
                      <b className="text-[#FFB822]">{preview.split}</b> partido(s) em &quot;(cont.)&quot;
                    </>
                  )}
                </p>
                {preview.sheets && preview.sheets.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {preview.sheets.map((s, i) => {
                      // sobra = quanto da área útil ficou sem uso naquela folha
                      const limit = value.yLimit;
                      const slack = limit - s.endY;
                      return (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded bg-white border border-[#e0e0e0] text-[9.5px] font-mono text-[#80808F]"
                          title={`Folha ${i + 1}: ${s.groups} grupo(s), ${s.items} item(ns), última marcação em ${s.endY.toFixed(1)}mm (sobra ${slack.toFixed(1)}mm)`}
                        >
                          f{i + 1}: {s.items}i
                          <span className={slack > 25 ? "text-[#FFB822]" : "text-[#b0b0bf]"}>
                            {" "}
                            sobra {slack.toFixed(0)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            <p className="text-[10.5px] text-[#80808F] leading-snug">
              Folhas com <b>sobra</b> grande indicam gap entre seções ou y inicial maiores do que o PDF real. Folhas
              novas nascem <b>sem imagem</b>.
            </p>
          </div>
          )}
        </>
      )}
    </div>
  );
}
