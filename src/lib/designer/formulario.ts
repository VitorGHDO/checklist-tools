// Regras dos Formulários Gerais. Módulo puro: sem React, sem DOM.
//
// A folha é uma lista de perguntas com colunas de resultado já impressas (OK / NOK, às
// vezes com NA). O item não escolhe o X — escolhe a COLUNA, e o X é dela; a marcação é
// sempre o mesmo símbolo. É o oposto do plano de manutenção, onde a coluna vem da revisão
// sendo emitida e o item só decide se aparece.

import { genId } from "./model";
import type { DesignerPage, FormularioColuna, FormularioConfig, Marker } from "./types";

/** Símbolo padrão da marcação — o mesmo que a folha usa à mão. */
export const SIMBOLO_PADRAO = "✓";
export const SIMBOLOS = ["✓", "X"] as const;

/** Nome do objeto de respostas dentro da função de desenho. */
export const VAR_RESPOSTA_PADRAO = "resposta";

/** Quantas colunas de resultado uma folha pode ter. */
export const MIN_COLUNAS = 2;
export const MAX_COLUNAS = 4;

export function novaColuna(label: string, valor: string, x: number): FormularioColuna {
  return { id: genId("fc"), label, valor, x };
}

export function novaConfigFormulario(): FormularioConfig {
  return {
    // OK = 1 e NOK = 3 seguem os valores que o formulário grava nos outros checklists.
    colunas: [novaColuna("OK", "1", 178), novaColuna("NOK", "3", 192)],
    simbolo: SIMBOLO_PADRAO,
    sufixoFuncao: "Formulario",
    codFormulario: "",
    varResposta: VAR_RESPOSTA_PADRAO,
    fundoPath: "",
    formatoArquivo: "funcao",
    buscarNomeFantasia: true,
    celulaW: 8,
    celulaH: 5,
  };
}

/** Folha que guarda a configuração: a 1ª folha de checklist do docType. */
export function formularioHostPage(pages: DesignerPage[]): DesignerPage | undefined {
  return pages.find((p) => p.kind === "checklist" && p.docType === "formulario");
}

/** Config do formulário, criando a padrão na 1ª folha quando ainda não existe. */
export function ensureFormularioConfig(pages: DesignerPage[]): FormularioConfig | null {
  const host = formularioHostPage(pages);
  if (!host) return null;
  if (!host.formulario) host.formulario = novaConfigFormulario();
  return host.formulario;
}

/** Config sem criar nada (para leitura em render/export). */
export function getFormularioConfig(pages: DesignerPage[]): FormularioConfig | null {
  return formularioHostPage(pages)?.formulario ?? null;
}

/** Coluna escolhida pelo item; a primeira quando o marcador ainda não tem resposta. */
export function colunaDoItem(
  cfg: FormularioConfig | null,
  marker: Pick<Marker, "type">,
): FormularioColuna | null {
  if (!cfg || cfg.colunas.length === 0) return null;
  return cfg.colunas.find((c) => c.valor === (marker.type ?? "")) ?? cfg.colunas[0];
}

/**
 * Acrescenta uma coluna, seguindo o passo das que já existem — a folha real costuma ter
 * colunas equidistantes, e o ajuste fino continua sendo por captura.
 */
export function adicionarColuna(cfg: FormularioConfig): FormularioColuna | null {
  if (cfg.colunas.length >= MAX_COLUNAS) return null;
  const n = cfg.colunas.length;
  const passo = n > 1 ? cfg.colunas[n - 1].x - cfg.colunas[n - 2].x : 14;
  const nova = novaColuna(`COL${n + 1}`, String(n + 1), +(cfg.colunas[n - 1].x + passo).toFixed(2));
  cfg.colunas.push(nova);
  return nova;
}

/**
 * Remove a coluna e devolve para a 1ª os itens que a usavam — item apontando para valor
 * inexistente sumiria do PDF sem aviso.
 */
export function removerColuna(pages: DesignerPage[], cfg: FormularioConfig, id: string): number {
  if (cfg.colunas.length <= MIN_COLUNAS) return -1;
  const alvo = cfg.colunas.find((c) => c.id === id);
  if (!alvo) return 0;
  cfg.colunas = cfg.colunas.filter((c) => c.id !== id);
  const padrao = cfg.colunas[0].valor;
  let movidos = 0;
  itensDoFormulario(pages).forEach(({ marker }) => {
    if ((marker.type ?? "") === alvo.valor) {
      marker.type = padrao;
      movidos += 1;
    }
  });
  return movidos;
}

/** Todos os itens do formulário, na ordem em que são impressos. */
export function itensDoFormulario(pages: DesignerPage[]): { page: DesignerPage; marker: Marker }[] {
  const out: { page: DesignerPage; marker: Marker }[] = [];
  for (const page of pages) {
    if (page.kind !== "checklist" || page.docType !== "formulario") continue;
    for (const group of page.groups) for (const marker of group.markers) out.push({ page, marker });
  }
  return out;
}

/** Quantos itens respondem cada coluna — o resumo que o painel mostra. */
export function contarPorColuna(pages: DesignerPage[], cfg: FormularioConfig): Map<string, number> {
  const out = new Map<string, number>(cfg.colunas.map((c) => [c.id, 0]));
  itensDoFormulario(pages).forEach(({ marker }) => {
    const col = colunaDoItem(cfg, marker);
    if (col) out.set(col.id, (out.get(col.id) ?? 0) + 1);
  });
  return out;
}
