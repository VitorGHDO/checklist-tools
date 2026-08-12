// Linhas de referência do roteiro: no PDF, um rótulo como "1. MÓDULO ADAS:" tem uma
// linha (e uma marcação impressa) mas não tem campo próprio no banco — as respostas
// vêm nos itens "a.", "b.", "c." abaixo dele. Uma linha de referência é uma marcação
// EXTRA, inserida na linha do rótulo, que imprime a marcação do item seguinte; ao
// inserir, esse item e todos os de baixo descem um incremento, para as marcações
// voltarem a coincidir com as linhas impressas na folha.
//
// Aqui ficam a resolução (pura) e as operações de inserir/remover a linha. Quem emite
// o código PHP, quem desenha o preview e a sidebar consomem estas funções.

import { clamp01, makeMarker } from "./geometry";
import { DEFAULT_INC } from "./paging";
import type { DesignerGroup, DesignerPage, Marker } from "./types";

/** Só o roteiro tem rótulos de referência intercalados com as perguntas. */
export function supportsMirror(group: Pick<DesignerGroup, "docType">): boolean {
  return group.docType === "roteiro";
}

const incOf = (g: Pick<DesignerGroup, "increment">) => g.increment || DEFAULT_INC;

/**
 * Índice do marcador de quem `markers[i]` empresta a marcação. Rótulos em sequência
 * ("1. MÓDULO:" seguido de "1.1 SUBMÓDULO:") apontam todos para o primeiro item com
 * resposta própria. Retorna -1 quando não há item seguinte (rótulo no fim do grupo) e
 * o próprio i quando o marcador não é um rótulo.
 */
export function mirrorTargetIndex(markers: Marker[], i: number): number {
  if (!markers[i]?.mirrorNext) return i;
  let j = i + 1;
  while (j < markers.length && markers[j].mirrorNext) j++;
  return j < markers.length ? j : -1;
}

/**
 * Campo efetivo de cada marcador, na ordem do grupo. Percorrer de trás para frente
 * resolve as sequências de rótulos numa passada. Um rótulo sem item seguinte mantém o
 * próprio campo — sem alvo não há o que espelhar, e emitir o campo original preserva
 * o comportamento antigo em vez de sumir com a marcação.
 */
export function resolveMarkerFields(
  group: Pick<DesignerGroup, "docType" | "markers">,
): string[] {
  const markers = group.markers;
  const fields = markers.map((m) => m.label);
  if (!supportsMirror(group)) return fields;
  for (let i = markers.length - 2; i >= 0; i--) {
    if (markers[i].mirrorNext) fields[i] = fields[i + 1];
  }
  return fields;
}

/** true quando o marcador é um rótulo COM alvo válido (portanto duplica uma marcação). */
export function isMirrored(
  group: Pick<DesignerGroup, "docType" | "markers">,
  i: number,
): boolean {
  if (!supportsMirror(group)) return false;
  return !!group.markers[i]?.mirrorNext && mirrorTargetIndex(group.markers, i) >= 0;
}

/** Quantos rótulos de referência com alvo válido o grupo tem. */
export function countMirrored(group: Pick<DesignerGroup, "docType" | "markers">): number {
  let n = 0;
  for (let i = 0; i < group.markers.length; i++) if (isMirrored(group, i)) n++;
  return n;
}

/**
 * Fila reconstruída a partir das marcações. As linhas de referência ficam de fora:
 * elas repetem o campo do item seguinte e não são campos da fila — mantê-las geraria
 * um nome duplicado que o "Gerar" transformaria em marcação de verdade.
 */
export function queueFromMarkers(group: Pick<DesignerGroup, "markers">): string {
  return group.markers
    .filter((m) => !m.mirrorNext)
    .map((m) => m.label)
    .join("\n");
}

// ─── inserir / remover a linha do rótulo ──────────────────────────────────────

/**
 * Insere uma marcação extra na linha de `markers[index]` (o rótulo) e empurra esse
 * item e todos os de baixo um incremento. A linha nasce com o campo e a coluna do
 * item seguinte, que é justamente a marcação que ela vai imprimir.
 *
 * O deslocamento é relativo (soma o incremento ao Y atual), não um reempilhamento a
 * partir do yStart: um grupo com item arrastado à mão continua com o ajuste dele.
 */
export function insertMirrorRow(
  group: DesignerGroup,
  page: DesignerPage,
  index: number,
): Marker | null {
  if (!supportsMirror(group)) return null;
  const target = group.markers[index];
  if (!target) return null;

  const inc = incOf(group);
  const row = makeMarker(group, page, target.label, target.fy * page.heightMm);
  row.mirrorNext = true;
  if (target.fx !== undefined) row.fx = target.fx;
  if (target.type !== undefined) row.type = target.type;

  for (let k = index; k < group.markers.length; k++) {
    const m = group.markers[k];
    m.fy = clamp01((m.fy * page.heightMm + inc) / page.heightMm);
  }
  group.markers.splice(index, 0, row);
  return row;
}

/** Desfaz a inserção: remove a linha do rótulo e sobe um incremento o que está abaixo. */
export function removeMirrorRow(
  group: DesignerGroup,
  page: DesignerPage,
  index: number,
): boolean {
  if (!group.markers[index]?.mirrorNext) return false;
  const inc = incOf(group);
  group.markers.splice(index, 1);
  for (let k = index; k < group.markers.length; k++) {
    const m = group.markers[k];
    m.fy = clamp01((m.fy * page.heightMm - inc) / page.heightMm);
  }
  return true;
}

// ─── preservar as linhas ao regerar da fila ───────────────────────────────────

/** Quantas linhas de referência antecedem cada campo, na ordem do grupo. */
export interface MirrorPlanEntry {
  targetLabel: string;
  count: number;
}

/**
 * Fotografa onde estão as linhas de referência antes de uma operação que recria as
 * marcações a partir da fila. Sem isso, cada "Gerar" desfaria a marcação manual — as
 * linhas não estão na fila, porque não são campos.
 */
export function captureMirrorPlan(
  group: Pick<DesignerGroup, "docType" | "markers">,
): MirrorPlanEntry[] {
  const out: MirrorPlanEntry[] = [];
  const markers = group.markers;
  for (let i = 0; i < markers.length; i++) {
    if (!isMirrored(group, i)) continue;
    const targetLabel = markers[mirrorTargetIndex(markers, i)].label;
    const last = out[out.length - 1];
    if (last && last.targetLabel === targetLabel) last.count++;
    else out.push({ targetLabel, count: 1 });
  }
  return out;
}

/** Reinsere as linhas fotografadas por `captureMirrorPlan`. Retorna quantas voltaram. */
export function applyMirrorPlan(
  group: DesignerGroup,
  page: DesignerPage,
  plan: MirrorPlanEntry[],
): number {
  let restored = 0;
  for (const entry of plan) {
    for (let k = 0; k < entry.count; k++) {
      // o alvo desce a cada inserção, então o índice é reprocurado; rótulos já
      // inseridos são ignorados para as linhas ficarem todas acima do item
      const idx = group.markers.findIndex((m) => !m.mirrorNext && m.label === entry.targetLabel);
      if (idx < 0) break; // campo saiu da fila — nada a espelhar
      if (insertMirrorRow(group, page, idx)) restored++;
    }
  }
  return restored;
}
