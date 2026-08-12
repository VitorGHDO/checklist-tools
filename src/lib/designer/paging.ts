// Primitivas de paginação compartilhadas pela importação (actions.ts) e pelo
// re-fluxo/reagrupamento (reflow.ts). Puras.

import type { DesignerDocType, DesignerPage } from "./types";

/** Nome gerado automaticamente para folha ("Folha 3") — o único que pode ser renumerado. */
const AUTO_SHEET_NAME = /^folha\s*\d+$/i;

/**
 * Renumera as folhas do docType para "Folha 1..N" na ordem em que aparecem. Nomes
 * personalizados pelo usuário são preservados. Necessário depois de remover/criar
 * folhas: sem isso, apagar a "Folha 1" deixa a "Folha 2" como primeira aba e nomes
 * duplicados aparecem na criação seguinte.
 */
export function renumberSheets(pages: DesignerPage[], docType: DesignerDocType): void {
  const sheets = pages.filter((p) => p.kind === "checklist" && p.docType === docType);
  sheets.forEach((p, i) => {
    if (AUTO_SHEET_NAME.test((p.name || "").trim())) p.name = `Folha ${i + 1}`;
  });
}

/** Gap entre o último item de um grupo e o 1º do seguinte, em múltiplos do incremento.
 *  Alinhado a reflowGroupChainY para que o chainY não desloque o que foi paginado. */
export const GROUP_GAP_INCS = 2;

/** Incremento padrão (mm) quando o grupo não define um. */
export const DEFAULT_INC = 6.13;

/** Quantas marcações de passo `inc` cabem a partir de `y` sem passar de `yLimit`. */
export function fitCount(y: number, inc: number, yLimit: number): number {
  if (inc <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor((yLimit - y) / inc) + 1);
}

const CONT_RE = /\s*\(cont\.(?:\s+\d+)?\)\s*$/i;

/** O título marca um grupo que é continuação de outro na folha anterior? */
export function isContTitle(title: string): boolean {
  return CONT_RE.test(title || "");
}

/** Remove todos os sufixos "(cont.)" acumulados, devolvendo o título de origem. */
export function baseTitleOf(title: string): string {
  let t = String(title || "").trim();
  while (CONT_RE.test(t)) t = t.replace(CONT_RE, "").trim();
  return t;
}

export function contTitleFor(base: string, idx: number): string {
  return idx > 1 ? `${base} (cont. ${idx})` : `${base} (cont.)`;
}

/** Junta duas filas preservando a ordem e descartando nomes repetidos. */
export function mergeQueues(a: string, b: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [a, b]) {
    for (const line of String(raw || "").split("\n")) {
      const v = line.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out.join("\n");
}
