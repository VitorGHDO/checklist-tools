// Operações manuais sobre folhas e grupos. O motor de distribuição é o flow.ts
// (fluxo contínuo); aqui ficam as ações pontuais que o usuário dispara na sidebar:
//   - restackPage: recalcula os Y de uma folha em sequência
//   - moveGroupWithinPage / moveGroupToAdjacentPage / mergeGroupIntoPrevious
//   - clearGroups / resetToSingleSheet

import { clamp01 } from "./geometry";
import { newGroup } from "./model";
import { newSiblingChecklistPage } from "./actions";
import { DEFAULT_INC, GROUP_GAP_INCS, mergeQueues, renumberSheets } from "./paging";
import type { DesignerDocType, DesignerGroup, DesignerPage } from "./types";

export function checklistPagesOf(pages: DesignerPage[], docType: DesignerDocType): DesignerPage[] {
  return pages.filter((p) => p.kind === "checklist" && p.docType === docType);
}

const incOf = (g: DesignerGroup) => g.increment || DEFAULT_INC;

/** Reposiciona as marcações de um grupo a partir do seu yStart, com passo constante. */
function layoutGroup(g: DesignerGroup, page: DesignerPage): void {
  const inc = incOf(g);
  g.markers.forEach((m, k) => {
    m.fy = clamp01((g.yStart + k * inc) / page.heightMm);
  });
}

/** Y (mm) da última marcação do grupo — ou do próprio yStart quando está vazio. */
function endYOf(g: DesignerGroup): number {
  return g.yStart + Math.max(0, g.markers.length - 1) * incOf(g);
}

/**
 * Recalcula os Y de todos os grupos da folha em sequência. O primeiro grupo mantém
 * o seu yStart (calibrado pelo usuário) salvo se `yTop` for informado.
 */
export function restackPage(page: DesignerPage, yTop?: number): void {
  if (!page.groups.length) return;
  let cursorY = yTop !== undefined ? yTop : page.groups[0].yStart;
  page.groups.forEach((g, gi) => {
    g.yStart = +cursorY.toFixed(2);
    if (gi > 0) g.yManual = false; // volta ao encadeamento automático
    layoutGroup(g, page);
    cursorY = endYOf(g) + GROUP_GAP_INCS * incOf(g);
  });
}

// ─── limpeza / recomeço ───────────────────────────────────────────────────────

export interface ClearResult {
  groups: number;
  markers: number;
  sheetsRemoved: number;
}

/**
 * Remove os grupos das folhas do docType. A primeira folha fica com um único grupo
 * vazio de propósito: ele carrega a calibração (xFixed, incremento, colunas) que a
 * próxima importação herda — zerar isso obrigaria a recalibrar tudo.
 */
export function clearGroups(pages: DesignerPage[], docType: DesignerDocType): ClearResult {
  const sheets = checklistPagesOf(pages, docType);
  let groups = 0;
  let markers = 0;
  sheets.forEach((p, i) => {
    groups += p.groups.length;
    markers += p.groups.reduce((a, g) => a + g.markers.length, 0);
    if (i === 0) {
      const keep = p.groups[0];
      if (keep) {
        keep.title = "Grupo 1";
        keep.markers = [];
        keep.queue = "";
        keep.yManual = false;
        p.groups = [keep];
        groups -= 1; // o grupo preservado não conta como removido
      } else {
        p.groups = [newGroup("Grupo 1", docType)];
      }
      p.activeGroupId = p.groups[0].id;
    } else {
      p.groups = [];
      p.activeGroupId = null;
    }
  });
  return { groups, markers, sheetsRemoved: 0 };
}

/**
 * Volta o docType a uma única folha: limpa os grupos e descarta as folhas extras.
 * `keepImage` conserva o JPG de fundo da 1ª folha (útil para repetir testes sem
 * precisar carregar a imagem outra vez).
 */
export function resetToSingleSheet(
  pages: DesignerPage[],
  docType: DesignerDocType,
  keepImage: boolean
): ClearResult {
  const sheets = checklistPagesOf(pages, docType);
  const first = sheets[0];
  const sheetsRemoved = Math.max(0, sheets.length - 1);
  for (let i = pages.length - 1; i >= 0; i--) {
    const p = pages[i];
    if (p.kind === "checklist" && p.docType === docType && p !== first) pages.splice(i, 1);
  }
  const cleared = clearGroups(pages, docType);
  if (first && !keepImage) {
    first.imageSrc = null;
    first.naturalW = 0;
    first.naturalH = 0;
  }
  renumberSheets(pages, docType);
  return { ...cleared, sheetsRemoved };
}

/** Troca o grupo de posição dentro da folha. Retorna false quando já está na ponta. */
export function moveGroupWithinPage(page: DesignerPage, group: DesignerGroup, dir: -1 | 1): boolean {
  const i = page.groups.indexOf(group);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= page.groups.length) return false;
  const arr = page.groups;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  restackPage(page);
  return true;
}

/**
 * Move o grupo para a folha anterior (entra no fim) ou seguinte (entra no topo).
 * Indo para frente sem folha seguinte, cria uma. Retorna a folha destino ou null.
 */
export function moveGroupToAdjacentPage(
  pages: DesignerPage[],
  page: DesignerPage,
  group: DesignerGroup,
  dir: -1 | 1
): DesignerPage | null {
  const sheets = checklistPagesOf(pages, page.docType);
  const pi = sheets.indexOf(page);
  if (pi < 0) return null;
  let target = sheets[pi + dir];
  if (!target) {
    if (dir < 0) return null; // não existe folha antes da primeira
    target = newSiblingChecklistPage(pages, page);
  }
  page.groups = page.groups.filter((g) => g !== group);
  if (dir > 0) target.groups.unshift(group);
  else target.groups.push(group);

  group.yManual = false;
  if (page.activeGroupId === group.id) page.activeGroupId = page.groups[0]?.id ?? null;
  target.activeGroupId = group.id;
  restackPage(page);
  restackPage(target);
  return target;
}

/** Grupo imediatamente anterior a `group`: na mesma folha, ou o último de uma folha
 *  anterior que tenha grupos. Retorna null quando `group` é o primeiro de todos. */
function grupoAnterior(
  pages: DesignerPage[],
  page: DesignerPage,
  group: DesignerGroup,
): { page: DesignerPage; group: DesignerGroup } | null {
  const gi = page.groups.indexOf(group);
  if (gi < 0) return null;
  if (gi > 0) return { page, group: page.groups[gi - 1] };
  const sheets = checklistPagesOf(pages, page.docType);
  for (let k = sheets.indexOf(page) - 1; k >= 0; k--) {
    if (sheets[k].groups.length) {
      return { page: sheets[k], group: sheets[k].groups[sheets[k].groups.length - 1] };
    }
  }
  return null;
}

/** Remove da fila as linhas com estes nomes, preservando o resto do texto. */
function removerDaFila(queue: string, labels: string[]): string {
  const fora = new Set(labels);
  return String(queue || "")
    .split("\n")
    .filter((l) => !fora.has(l.trim()))
    .join("\n");
}

export interface MoverItemResult {
  /** Grupo que recebeu o item. */
  destino: DesignerGroup;
  /** Folha do grupo destino — pode ser a anterior. */
  destinoPage: DesignerPage;
  /** Quantos marcadores foram junto (rótulos de referência acompanham o item). */
  movidos: number;
}

/**
 * Move UM item para o fim do grupo anterior. Os rótulos de referência imediatamente
 * acima dele vão junto: separá-los do item que espelham deixaria os dois sem sentido.
 * Retorna null quando não existe grupo anterior.
 */
export function moveMarkerToPreviousGroup(
  pages: DesignerPage[],
  page: DesignerPage,
  group: DesignerGroup,
  index: number,
): MoverItemResult | null {
  const alvo = group.markers[index];
  if (!alvo) return null;
  const anterior = grupoAnterior(pages, page, group);
  if (!anterior) return null;

  // arrasta para trás os rótulos de referência que precedem o item
  let inicio = index;
  while (inicio > 0 && group.markers[inicio - 1].mirrorNext) inicio--;

  const movidos = group.markers.slice(inicio, index + 1);
  group.markers = group.markers.filter((m) => !movidos.includes(m));
  anterior.group.markers = anterior.group.markers.concat(movidos);

  const labels = movidos.filter((m) => !m.mirrorNext).map((m) => m.label);
  if (labels.length) {
    anterior.group.queue = mergeQueues(anterior.group.queue, labels.join("\n"));
    group.queue = removerDaFila(group.queue, labels);
  }

  restackPage(anterior.page);
  if (anterior.page !== page) restackPage(page);
  return { destino: anterior.group, destinoPage: anterior.page, movidos: movidos.length };
}

/**
 * Junta o grupo no antecessor imediato (mesma folha ou última posição da folha
 * anterior), desfazendo uma partição. Retorna a folha do antecessor ou null.
 */
export function mergeGroupIntoPrevious(
  pages: DesignerPage[],
  page: DesignerPage,
  group: DesignerGroup
): DesignerPage | null {
  const gi = page.groups.indexOf(group);
  if (gi < 0) return null;

  let prevPage: DesignerPage | null = null;
  let prevGroup: DesignerGroup | null = null;
  if (gi > 0) {
    prevPage = page;
    prevGroup = page.groups[gi - 1];
  } else {
    const sheets = checklistPagesOf(pages, page.docType);
    for (let k = sheets.indexOf(page) - 1; k >= 0; k--) {
      if (sheets[k].groups.length) {
        prevPage = sheets[k];
        prevGroup = sheets[k].groups[sheets[k].groups.length - 1];
        break;
      }
    }
  }
  if (!prevPage || !prevGroup) return null;

  prevGroup.markers = prevGroup.markers.concat(group.markers);
  prevGroup.queue = mergeQueues(prevGroup.queue, group.queue);
  page.groups = page.groups.filter((g) => g !== group);
  if (page.activeGroupId === group.id) page.activeGroupId = page.groups[0]?.id ?? null;
  restackPage(prevPage);
  if (prevPage !== page) restackPage(page);
  return prevPage;
}
