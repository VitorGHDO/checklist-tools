// Empilhamento das folhas + operações explícitas de folha/grupo.
//
// REGRA CENTRAL: nenhum grupo muda de folha sozinho. O sistema não tem como saber
// que dois campos de um grupo continuam na folha seguinte — só quem olha o PDF sabe.
// Tentativas anteriores (quebra por altura, alvo de folhas, casamento do texto do
// Extrator, transbordo automático) erravam de formas difíceis de perceber, o que é
// pior do que não automatizar. Aqui:
//
//   - restackSheets: dentro de CADA folha, empilha os grupos em sequência. Se o
//     conteúdo passa da faixa útil, REPORTA — não empurra nada para a folha seguinte.
//   - splitGroupToNextSheet: você escolhe o ponto de corte; os itens de lá para baixo
//     viram "Grupo (cont.)" no topo da folha seguinte.
//   - moveGroupsToSheet: move grupos inteiros entre folhas, preservando a ordem.
//
// Grupo com `yManual` (arrastado no canvas) fica na posição onde foi solto; os
// seguintes empilham a partir dele.

import { clamp01 } from "./geometry";
import { newGroup } from "./model";
import { inheritGroupConfig, newSiblingChecklistPage } from "./actions";
import { queueFromMarkers } from "./mirror";
import { DEFAULT_INC, GROUP_GAP_INCS, baseTitleOf, contTitleFor, isContTitle, renumberSheets } from "./paging";
import type { DesignerDocType, DesignerGroup, DesignerPage } from "./types";

export interface StackOptions {
  /** Início da faixa útil padrão da 1ª folha. */
  yTop: number;
  /** Início da faixa útil padrão das folhas 2..N. */
  yTopNext: number;
  /** Fim da faixa útil padrão. */
  yLimit: number;
  /** Espaço (mm) entre o último item de um grupo e o 1º do seguinte. */
  groupGapMm?: number;
}

export interface SheetStatus {
  page: DesignerPage;
  index: number;
  top: number;
  bottom: number;
  /** Y da última marcação da folha. */
  endY: number;
  /** true quando endY passou do fim da faixa útil — precisa de ação sua. */
  overflow: boolean;
  groups: number;
  markers: number;
}

export interface StackResult {
  sheets: SheetStatus[];
  /** Nomes das folhas cujo conteúdo passou da faixa útil. */
  overflowSheets: string[];
  totalMarkers: number;
}

export function checklistSheets(pages: DesignerPage[], docType: DesignerDocType): DesignerPage[] {
  return pages.filter((p) => p.kind === "checklist" && p.docType === docType);
}

/** Faixa útil efetiva de uma folha: a dela, ou o padrão das opções. */
export function rangeOf(page: DesignerPage, index: number, opts: StackOptions): { top: number; bottom: number } {
  return {
    top: page.flowTop !== undefined ? page.flowTop : index === 0 ? opts.yTop : opts.yTopNext,
    bottom: page.flowBottom !== undefined ? page.flowBottom : opts.yLimit,
  };
}

const incOf = (g: DesignerGroup) => g.increment || DEFAULT_INC;

/**
 * Empilha os grupos dentro de cada folha, na ordem em que estão. Não move nada entre
 * folhas: devolve o estado de cada uma para a UI avisar sobre o que passou do limite.
 */
export function restackSheets(
  pages: DesignerPage[],
  docType: DesignerDocType,
  opts: StackOptions
): StackResult {
  const sheets = checklistSheets(pages, docType);
  const gap = (inc: number) => (opts.groupGapMm !== undefined ? opts.groupGapMm : GROUP_GAP_INCS * inc);
  const out: SheetStatus[] = [];
  let totalMarkers = 0;

  sheets.forEach((page, index) => {
    const range = rangeOf(page, index, opts);
    let cursorY = range.top;
    let endY = range.top;
    let markers = 0;

    page.groups.forEach((g) => {
      const inc = incOf(g);
      const antes = g.yStart;
      // arrastado no canvas: respeita a posição onde foi solto
      if (g.yManual) cursorY = g.yStart;
      else g.yStart = +cursorY.toFixed(2);
      if (g.markersManual) {
        // Espaçamento medido na arte (ou ajustado à mão): anda em bloco, nunca é
        // reescrito pelo incremento — era isso que desfazia o "mapear folha" ao mover
        // um grupo de folha.
        const dFy = (g.yStart - antes) / page.heightMm;
        if (dFy) g.markers.forEach((m) => (m.fy = clamp01(m.fy + dFy)));
      } else {
        g.markers.forEach((m, k) => {
          m.fy = clamp01((g.yStart + k * inc) / page.heightMm);
        });
      }
      const ultimo = g.markers[g.markers.length - 1];
      const last = g.markersManual && ultimo
        ? ultimo.fy * page.heightMm
        : g.yStart + Math.max(0, g.markers.length - 1) * inc;
      if (g.markers.length) endY = Math.max(endY, last);
      markers += g.markers.length;
      cursorY = last + gap(inc);
    });

    totalMarkers += markers;
    out.push({
      page,
      index,
      top: range.top,
      bottom: range.bottom,
      endY: +endY.toFixed(2),
      overflow: endY > range.bottom + 0.01,
      groups: page.groups.length,
      markers,
    });
  });

  return {
    sheets: out,
    overflowSheets: out.filter((s) => s.overflow).map((s) => s.page.name),
    totalMarkers,
  };
}

/** Quantas continuações o título base já tem, para numerar "(cont. 2)", "(cont. 3)". */
function nextContIndex(pages: DesignerPage[], docType: DesignerDocType, base: string): number {
  let n = 0;
  for (const p of checklistSheets(pages, docType)) {
    for (const g of p.groups) if (isContTitle(g.title) && baseTitleOf(g.title) === base) n++;
  }
  return n + 1;
}

export interface SplitResult {
  target: DesignerPage;
  created: DesignerGroup;
  movedCount: number;
  sheetCreated: boolean;
}

/**
 * Move os itens de `fromIndex` (0-based) até o fim para o TOPO da folha seguinte, num
 * grupo que herda o nome e a calibração do original. É a operação que resolve
 * "o grupo 3 continua na folha 2 com dois campos" — explicitamente, quando você manda.
 */
export function splitGroupToNextSheet(
  pages: DesignerPage[],
  page: DesignerPage,
  group: DesignerGroup,
  fromIndex: number
): SplitResult | null {
  if (fromIndex <= 0 || fromIndex >= group.markers.length) return null; // nada a mover
  // O corte não separa um rótulo do item que ele espelha: a linha de referência iria
  // junto de nada, e o item ficaria sem o rótulo na folha seguinte.
  while (fromIndex > 0 && group.markers[fromIndex - 1].mirrorNext) fromIndex--;
  if (fromIndex <= 0) return null;
  const sheets = checklistSheets(pages, page.docType);
  const pi = sheets.indexOf(page);
  if (pi < 0) return null;

  let target = sheets[pi + 1];
  const sheetCreated = !target;
  if (!target) target = newSiblingChecklistPage(pages, page);

  const base = baseTitleOf(group.title);
  const rest = newGroup(contTitleFor(base, nextContIndex(pages, page.docType, base)), group.docType);
  inheritGroupConfig(rest, group, group.docType);
  rest.markers = group.markers.slice(fromIndex);
  group.markers = group.markers.slice(0, fromIndex);
  rest.queue = queueFromMarkers(rest);
  group.queue = queueFromMarkers(group);
  rest.yManual = false;

  target.groups.unshift(rest);
  target.activeGroupId = rest.id;
  renumberSheets(pages, page.docType);
  return { target, created: rest, movedCount: rest.markers.length, sheetCreated };
}

/**
 * Move grupos inteiros para a folha `sheetNumber` (1-based), preservando a ordem em que
 * aparecem na lista. Entram no fim da folha destino — use as setas de ordem para
 * ajustar a posição depois.
 */
export function moveGroupsToSheet(
  pages: DesignerPage[],
  docType: DesignerDocType,
  groupIds: string[],
  sheetNumber: number
): { moved: number; target: DesignerPage | null } {
  const sheets = checklistSheets(pages, docType);
  const target = sheets[sheetNumber - 1];
  if (!target) return { moved: 0, target: null };

  // coleta na ordem global atual (folha por folha), para não inverter a sequência
  const picked: DesignerGroup[] = [];
  const jaNaDestino = new Set<DesignerGroup>();
  for (const p of sheets) {
    for (const g of p.groups) {
      if (!groupIds.includes(g.id)) continue;
      picked.push(g);
      if (p === target) jaNaDestino.add(g);
    }
  }
  if (!picked.length) return { moved: 0, target };

  for (const p of sheets) {
    p.groups = p.groups.filter((g) => !picked.includes(g));
    if (p.activeGroupId && !p.groups.some((g) => g.id === p.activeGroupId)) {
      p.activeGroupId = p.groups[0]?.id ?? null;
    }
  }
  picked.forEach((g) => {
    if (jaNaDestino.has(g)) return;
    g.yManual = false; // volta a empilhar na sequência da folha destino
    // O que foi medido valia para a folha de origem; na destino o grupo ainda não tem
    // medida, então volta ao passo regular até ser mapeado lá.
    delete g.markersManual;
  });
  // Continuação ("… (cont.)") é o começo da folha seguinte: vai para o topo, na
  // ordem; o resto entra no fim.
  const continuacoes = picked.filter((g) => isContTitle(g.title));
  const demais = picked.filter((g) => !isContTitle(g.title));
  target.groups = [...continuacoes, ...target.groups, ...demais];
  target.activeGroupId = picked[0].id;
  return { moved: picked.length, target };
}

/**
 * Arrastar e soltar na sidebar: põe o grupo na posição `indice` da folha `destino`
 * (índice contado depois de tirá-lo da origem). Trocando de folha, a medida da origem
 * deixa de valer; na mesma folha, só muda a ordem e a medida fica.
 */
export function moverGrupoPara(
  pages: DesignerPage[],
  docType: DesignerDocType,
  groupId: string,
  destino: DesignerPage,
  indice: number,
): { origem: DesignerPage; trocouFolha: boolean } | null {
  const origem = checklistSheets(pages, docType).find((p) => p.groups.some((g) => g.id === groupId));
  const grupo = origem?.groups.find((g) => g.id === groupId);
  if (!origem || !grupo) return null;
  origem.groups = origem.groups.filter((g) => g !== grupo);
  const pos = Math.max(0, Math.min(indice, destino.groups.length));
  destino.groups = [...destino.groups.slice(0, pos), grupo, ...destino.groups.slice(pos)];
  const trocouFolha = origem !== destino;
  if (trocouFolha) {
    grupo.yManual = false;
    delete grupo.markersManual;
    if (origem.activeGroupId === grupo.id) origem.activeGroupId = origem.groups[0]?.id ?? null;
  }
  destino.activeGroupId = grupo.id;
  return { origem, trocouFolha };
}

/** Junta o grupo com o anterior da MESMA folha (desfaz uma partição feita ali). */
export function mergeWithPreviousInSheet(page: DesignerPage, group: DesignerGroup): boolean {
  const gi = page.groups.indexOf(group);
  if (gi <= 0) return false;
  const prev = page.groups[gi - 1];
  prev.markers = prev.markers.concat(group.markers);
  prev.queue = queueFromMarkers(prev);
  page.groups = page.groups.filter((g) => g !== group);
  if (page.activeGroupId === group.id) page.activeGroupId = prev.id;
  return true;
}
