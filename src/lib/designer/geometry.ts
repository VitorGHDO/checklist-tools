// Geometria e automações entre grupos — portadas verbatim de checklist_construtor.html.
// Funções mutam os objetos recebidos (mesma semântica do standalone); o store do editor
// clona antes de aplicar quando precisa de imutabilidade para o React.

import { DEFAULT_TYPE_OFFSETS } from "./constants";
import { genId, newPage } from "./model";
import type { DesignerGroup, DesignerPage, Marker, ViewMode, DesignerDocType } from "./types";

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function contextKey(dt: DesignerDocType, mode: ViewMode): string {
  return dt + "|" + mode;
}

export function makeMarker(group: DesignerGroup, page: DesignerPage, label: string, fyMm: number): Marker {
  const base: Marker = {
    id: genId("m"),
    label,
    fy: clamp01(fyMm / page.heightMm),
  };
  if (group.docType === "revisao") {
    base.tipo = "opcoes";
    base.resposta = "1";
  } else if (group.docType === "posvenda") {
    base.type = group.posvendaOpts && group.posvendaOpts[0] ? group.posvendaOpts[0].valor : "1";
    base.fx = clamp01(group.xFixed / page.widthMm);
  } else {
    base.type = "check";
    base.fx = clamp01(group.xFixed / page.widthMm);
  }
  return base;
}

// Ao mover o 1º item de um grupo, ele vira a âncora do grupo (posicionamento manual).
export function syncGroupStartIfFirst(group: DesignerGroup, page: DesignerPage, marker: Marker): void {
  if (group.markers[0] === marker) {
    group.yStart = +(marker.fy * page.heightMm).toFixed(2);
    group.yManual = true;
    if (marker.fx !== undefined) group.xFixed = +(marker.fx * page.widthMm).toFixed(2);
  }
}

export function nextGenBaseMm(group: DesignerGroup, page: DesignerPage): number {
  if (group.markers.length > 0) {
    const last = group.markers[group.markers.length - 1];
    return last.fy * page.heightMm + group.increment;
  }
  return group.yStart;
}

// copia as colunas X de 'src' para todos os outros grupos do mesmo tipo
export function syncColumnsToAll(page: DesignerPage, src: DesignerGroup | undefined): void {
  if (!src) return;
  page.groups.forEach((g) => {
    if (g === src || g.docType !== src.docType) return;
    if (src.docType === "revisao") {
      g.colX1 = src.colX1;
      g.colX2 = src.colX2;
      g.colX3 = src.colX3;
    } else if (src.docType === "posvenda" && src.posvendaXMode === "diff") {
      g.optX = Object.assign({}, src.optX);
    } else {
      g.xFixed = src.xFixed;
    }
  });
}

export function syncColumnsFromMaster(page: DesignerPage): void {
  if (page.groups.length) syncColumnsToAll(page, page.groups[0]);
}

export function reflowGroupChainY(page: DesignerPage): void {
  const groups = page.groups;
  for (let i = 1; i < groups.length; i++) {
    const prev = groups[i - 1];
    const g = groups[i];
    const inc = g.increment || prev.increment || 6.13;
    // grupo com Y ajustado manualmente (yManual) fica onde está; os automáticos encadeiam do anterior
    if (!g.yManual) {
      const baseY = prev.markers.length ? prev.markers[prev.markers.length - 1].fy * page.heightMm : prev.yStart;
      g.yStart = +(baseY + 2 * inc).toFixed(2); // +1 incremento normal + 1 linha extra fixa p/ cabeçalho do grupo
    }
    g.markers.forEach((m, k) => {
      m.fy = clamp01((g.yStart + k * inc) / page.heightMm);
    });
  }
}

export function applyGroupAutomation(page: DesignerPage | undefined): void {
  if (!page || page.kind !== "checklist") return;
  if (page.syncCols === undefined) page.syncCols = true;
  if (page.pushCols === undefined) page.pushCols = true;
  if (page.chainY === undefined) page.chainY = true;
  if (page.chainY) reflowGroupChainY(page);
}

export function ensureHeaderFooterPages(pages: DesignerPage[], dt: DesignerDocType): void {
  const headerPages = pages.filter((p) => p.kind === "header" && p.docType === dt);
  if (headerPages.length === 0) {
    pages.push(newPage("Cabeçalho", "header", dt));
    const footer = newPage("Footer", "header", dt);
    footer.footerLike = true;
    pages.push(footer);
  } else if (headerPages.length === 1) {
    const footer = newPage("Footer", "header", dt);
    footer.footerLike = true;
    pages.push(footer);
  }
}

export function ensureChecklistPage(pages: DesignerPage[], dt: DesignerDocType): void {
  const has = pages.some((p) => p.kind === "checklist" && p.docType === dt);
  if (!has) pages.push(newPage("Folha 1", "checklist", dt));
}

export function resolveBackgroundPage(pages: DesignerPage[], page: DesignerPage): DesignerPage {
  if (page.kind === "checklist") return page;
  if (page.imageSrc) return page; // imagem própria já foi definida manualmente
  const checklistPages = pages.filter((p) => p.kind === "checklist" && p.docType === page.docType && p.imageSrc);
  if (checklistPages.length === 0) return page;
  const isFooter = page.footerLike || !!(page.name && page.name.toLowerCase().indexOf("footer") !== -1);
  return isFooter ? checklistPages[checklistPages.length - 1] : checklistPages[0];
}

// Também usado ao normalizar/garantir defaults de automação (Object.assign de typeOffsets etc.)
export function ensureTypeOffsets(page: DesignerPage): void {
  if (!page.typeOffsets) page.typeOffsets = { ...DEFAULT_TYPE_OFFSETS };
}
