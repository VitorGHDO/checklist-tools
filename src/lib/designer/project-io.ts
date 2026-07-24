// Serialização/normalização do projeto (compatível com o JSON do checklist_construtor.html).
// normalizeLoadedPage é portado do standalone para abrir projetos antigos (inclui o caso
// legado de page.markers sem grupos).

import { DEFAULT_TYPE_OFFSETS } from "./constants";
import { newGroup } from "./model";
import { ensureChecklistPage, ensureHeaderFooterPages } from "./geometry";
import type { DesignerGroup, DesignerPage, Marker } from "./types";

type LoosePage = DesignerPage & { markers?: Marker[] };

export function normalizeLoadedPage(p: LoosePage): DesignerPage {
  if (!p.kind) p.kind = "checklist";
  if (!p.docType) p.docType = "roteiro";
  if (!p.headerFields) p.headerFields = [];
  if (!p.typeOffsets) p.typeOffsets = { ...DEFAULT_TYPE_OFFSETS };
  if (p.offsetX === undefined) p.offsetX = 0;
  if (p.offsetY === undefined) p.offsetY = 0;
  if (p.cellW === undefined) p.cellW = 14.5;
  if (p.cellH === undefined) p.cellH = 5;
  if (p.markScale === undefined) p.markScale = 1;
  if (p.footerLike === undefined) p.footerLike = !!(p.name && p.name.toLowerCase().indexOf("footer") !== -1);
  if (!p.widthMm) p.widthMm = 210;
  if (!p.heightMm) p.heightMm = 297;
  if (!p.groups) p.groups = [];
  if (p.syncCols === undefined) p.syncCols = true;
  if (p.pushCols === undefined) p.pushCols = true;
  if (p.chainY === undefined) p.chainY = true;

  if (p.kind === "checklist") {
    if (p.groups.length === 0 && !p.markers) {
      p.groups = [newGroup("Grupo 1", p.docType)];
    } else if (p.markers) {
      const g = newGroup(p.name || "Grupo 1", p.docType);
      g.markers = (p.markers || []).map((m) => ({ ...m, type: m.type || "check" }));
      if (g.markers.length) {
        g.xFixed = +((g.markers[0].fx ?? 0) * p.widthMm).toFixed(2);
        g.yStart = +(g.markers[0].fy * p.heightMm).toFixed(2);
      }
      p.groups = [g];
      delete p.markers;
    }
    p.groups.forEach((g: DesignerGroup) => {
      if (!g.docType) g.docType = p.docType;
      if (!g.markers) g.markers = [];
      if (g.docType === "revisao") {
        g.markers.forEach((m) => {
          if (!m.tipo) m.tipo = "opcoes";
          if (!m.resposta) m.resposta = "1";
        });
        if (g.colX1 === undefined) g.colX1 = 181.75;
        if (g.colX2 === undefined) g.colX2 = 189.2;
        if (g.colX3 === undefined) g.colX3 = 196.5;
        if (g.colW === undefined) g.colW = 7;
        if (g.colH === undefined) g.colH = 6.3;
        if (g.textX === undefined) g.textX = 184;
        if (g.textW === undefined) g.textW = 19;
        if (g.textH === undefined) g.textH = 5;
        if (g.textYOffset === undefined) g.textYOffset = -0.9;
        if (g.dadosVar === undefined) g.dadosVar = "dados";
      } else if (g.docType === "posvenda") {
        if (!g.posvendaOpts)
          g.posvendaOpts = [
            { valor: "1", label: "OK" },
            { valor: "3", label: "N/OK" },
            { valor: "0", label: "NA" },
          ];
        if (!g.posvendaXMode) g.posvendaXMode = "same";
        if (!g.optX) g.optX = { "1": 156.5, "3": 161, "0": 165.5 };
        if (g.optW === undefined) g.optW = 4.3;
        if (g.optH === undefined) g.optH = 5;
        g.markers.forEach((m) => {
          if (!m.type) m.type = g.posvendaOpts![0].valor;
        });
      } else {
        g.markers.forEach((m) => {
          if (!m.type) m.type = "check";
        });
      }
      if (g.queue === undefined) g.queue = "";
      if (g.useQueueOnClick === undefined) g.useQueueOnClick = true;
      if (g.xFixed === undefined) g.xFixed = 189.5;
      if (g.yStart === undefined) g.yStart = 60;
      if (g.increment === undefined) g.increment = 6.13;
    });
    if (!p.activeGroupId || !p.groups.find((g) => g.id === p.activeGroupId)) {
      p.activeGroupId = p.groups[0] ? p.groups[0].id : null;
    }
  }
  return p;
}

export function serializeProject(pages: DesignerPage[]): string {
  return JSON.stringify({ pages }, null, 0);
}

/** Lê um JSON de projeto ({ pages }); normaliza e garante folhas/cabeçalho de roteiro e revisão. */
export function parseProjectJson(text: string): DesignerPage[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const obj = data as { pages?: unknown };
  if (!obj || !Array.isArray(obj.pages)) return null;
  const pages = (obj.pages as LoosePage[]).map(normalizeLoadedPage);
  (["roteiro", "revisao"] as const).forEach((dt) => {
    ensureChecklistPage(pages, dt);
    ensureHeaderFooterPages(pages, dt);
  });
  return pages;
}
