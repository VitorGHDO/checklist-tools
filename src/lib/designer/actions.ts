// Operações de grupo (mutam page/group) — portadas de checklist_construtor.html
// (regenerateGroup/appendMissingFromQueue/reflowFromSelected/addNewGroup/importMigrationGroups).
// Retornam contagens/resultados; os toasts ficam a cargo dos componentes.

import { makeMarker, nextGenBaseMm, clamp01 } from "./geometry";
import { newGroup } from "./model";
import { parseMigrationGroups, parseQueueNames } from "./migration-parse";
import type { DesignerGroup, DesignerPage } from "./types";

/** Recria as marcações do grupo a partir da fila. Retorna a quantidade gerada (0 = fila vazia). */
export function regenerateGroup(group: DesignerGroup, page: DesignerPage): number {
  const names = parseQueueNames(group.queue);
  if (names.length === 0) return 0;
  group.markers = names.map((label, i) => makeMarker(group, page, label, group.yStart + i * group.increment));
  return names.length;
}

/** Adiciona só os nomes da fila que ainda não viraram marcação. Retorna quantos foram adicionados. */
export function appendMissingFromQueue(group: DesignerGroup, page: DesignerPage): number {
  const names = parseQueueNames(group.queue);
  const used = new Set(group.markers.map((m) => m.label));
  const missing = names.filter((n) => !used.has(n));
  if (missing.length === 0) return 0;
  const baseMm = nextGenBaseMm(group, page);
  missing.forEach((label, k) => group.markers.push(makeMarker(group, page, label, baseMm + k * group.increment)));
  return missing.length;
}

/** Reindexa (reempilha) do marcador selecionado para baixo com o incremento do grupo. */
export function reflowFromSelected(group: DesignerGroup, page: DesignerPage, selectedMarkerId: string | null): boolean {
  const idx = group.markers.findIndex((m) => m.id === selectedMarkerId);
  if (idx === -1) return false;
  const baseMm = group.markers[idx].fy * page.heightMm;
  for (let k = idx; k < group.markers.length; k++) {
    const mm_ = baseMm + (k - idx) * group.increment;
    group.markers[k].fy = clamp01(mm_ / page.heightMm);
  }
  return true;
}

function inheritGroupConfig(g: DesignerGroup, src: DesignerGroup, docType: DesignerPage["docType"]): void {
  g.xFixed = src.xFixed;
  g.increment = src.increment;
  if (docType === "revisao") {
    g.colX1 = src.colX1;
    g.colX2 = src.colX2;
    g.colX3 = src.colX3;
    g.colW = src.colW;
    g.colH = src.colH;
    g.textX = src.textX;
    g.textW = src.textW;
    g.textH = src.textH;
    g.textYOffset = src.textYOffset;
    g.dadosVar = src.dadosVar;
  }
  if (docType === "posvenda") {
    if (src.posvendaOpts) g.posvendaOpts = src.posvendaOpts.map((o) => ({ valor: o.valor, label: o.label }));
    if (src.posvendaXMode) g.posvendaXMode = src.posvendaXMode;
    if (src.optX) g.optX = Object.assign({}, src.optX);
    if (src.optW !== undefined) g.optW = src.optW;
    if (src.optH !== undefined) g.optH = src.optH;
    if (src.yFine !== undefined) g.yFine = src.yFine;
  }
}

/** Cria um novo grupo herdando a geometria do último e o empilha após ele. Retorna o grupo criado. */
export function addNewGroup(page: DesignerPage): DesignerGroup {
  const prev = page.groups[page.groups.length - 1];
  const g = newGroup("Grupo " + (page.groups.length + 1), page.docType);
  if (prev) {
    inheritGroupConfig(g, prev, page.docType);
    if (prev.markers.length) {
      const last = prev.markers[prev.markers.length - 1];
      g.yStart = +(last.fy * page.heightMm + prev.increment + 6).toFixed(2);
    } else {
      g.yStart = prev.yStart;
    }
  }
  page.groups.push(g);
  page.activeGroupId = g.id;
  return g;
}

/**
 * Importa campos com títulos em comentário → grupos empilhados.
 * Preserva grupos já posicionados; retorna os grupos criados (ou null se nada reconhecido).
 */
export function importMigrationGroups(
  page: DesignerPage,
  raw: string,
  generateMarkers: boolean
): DesignerGroup[] | null {
  const blocks = parseMigrationGroups(raw);
  if (!blocks.length) return null;
  const kept = page.groups.filter((g) => g.markers.length > 0); // preserva grupos já posicionados
  let anchor: DesignerGroup | null = kept.length ? kept[kept.length - 1] : page.groups[0] || null;
  const inc0 = anchor && anchor.increment ? anchor.increment : 6.13;
  let cursorY: number;
  if (anchor && anchor.markers && anchor.markers.length) {
    cursorY = anchor.markers[anchor.markers.length - 1].fy * page.heightMm + inc0 + 6;
  } else if (anchor) {
    cursorY = anchor.yStart;
  } else {
    cursorY = 60;
  }
  const created: DesignerGroup[] = [];
  blocks.forEach((block) => {
    const g = newGroup(block.title || "Grupo " + (kept.length + created.length + 1), page.docType);
    if (anchor) inheritGroupConfig(g, anchor, page.docType);
    const incG = g.increment || inc0;
    g.yStart = +cursorY.toFixed(2);
    g.queue = block.names.join("\n");
    if (generateMarkers) {
      g.markers = block.names.map((label, i) => makeMarker(g, page, label, g.yStart + i * incG));
    }
    cursorY = g.yStart + Math.max(0, block.names.length - 1) * incG + incG + 6;
    created.push(g);
    anchor = g;
  });
  page.groups = kept.concat(created);
  page.activeGroupId = created[0].id;
  return created;
}
