// Regras do Plano de Manutenção. Módulo puro: sem React, sem DOM.
//
// O que difere dos outros docTypes: a tabela do plano tem uma coluna por revisão
// (1ª..10ª) e o item impresso NÃO escolhe o X — ele é o da revisão que está sendo
// emitida. Cada item define o Y e a CONDIÇÃO: em quais revisões ele aparece.
// As condições são nomeadas e reutilizadas entre itens; cada uma vira um
// `$is_<slug>` no PHP e um `if()` em volta dos itens que a usam.

import { genId } from "./model";
import type {
  DesignerGroup,
  DesignerPage,
  ManutencaoColuna,
  ManutencaoCondicao,
  ManutencaoConfig,
  Marker,
} from "./types";

/** Condição implícita "todas as revisões": o item sai sem `if()` em volta. */
export const COND_TODAS = "";

export const DEFAULT_ICON_MM = 3;

/** Nome do objeto de respostas dentro da função de desenho, como no modelo. */
export const VAR_RESPOSTA_PADRAO = "resposta";

/** Ordinal do rótulo da coluna ("1ª", "2ª"...). */
export function colunaLabel(index: number): string {
  return `${index + 1}ª`;
}

export interface GerarColunasOpts {
  /** Quantidade de revisões da tabela. */
  quantidade: number;
  /** km da 1ª revisão; as seguintes são múltiplos dele. 0 = colunas sem km. */
  kmBase: number;
  /** Meses da 1ª revisão; as seguintes são múltiplos. 0 = colunas sem meses. */
  mesesBase: number;
  /** X (mm) da 1ª coluna. */
  xInicial: number;
  /** Distância (mm) entre colunas. O ajuste fino fica por conta da captura. */
  passoX: number;
}

/** Gera as colunas por progressão. Os X saem aproximados de propósito — a folha
 *  real quase nunca é perfeitamente equidistante, então cada um é ajustável. */
export function gerarColunas(opts: GerarColunasOpts): ManutencaoColuna[] {
  const out: ManutencaoColuna[] = [];
  for (let i = 0; i < Math.max(0, opts.quantidade); i++) {
    out.push({
      id: genId("mc"),
      label: colunaLabel(i),
      km: opts.kmBase > 0 ? String(opts.kmBase * (i + 1)) : "",
      meses: opts.mesesBase > 0 ? String(opts.mesesBase * (i + 1)) : "",
      x: +(opts.xInicial + i * opts.passoX).toFixed(2),
    });
  }
  return out;
}

/** O que o Extrator já sabe sobre as revisões — a mesma progressão do seletor do formulário. */
export interface RevisoesDoExtrator {
  revisoes: number;
  kmBase: number;
  mesesBase: number;
}

/**
 * Traz para o plano do Designer as revisões definidas no Extrator: quantidade, km e
 * meses de cada coluna. O X NÃO vem de lá (o Extrator não conhece a folha) — cada
 * coluna que já existia mantém o X calibrado, e as novas seguem o passo atual. O id da
 * coluna também é preservado, então as condições continuam apontando para as mesmas
 * revisões. Devolve quantas colunas o plano passou a ter, ou 0 quando não há o que aplicar.
 */
export function aplicarRevisoesDoExtrator(
  pages: DesignerPage[],
  cfg: ManutencaoConfig,
  plano: RevisoesDoExtrator,
): number {
  const quantidade = Math.floor(plano.revisoes);
  if (!quantidade || quantidade < 1) return 0;
  const antigas = cfg.colunas;
  const passo = antigas.length > 1 ? antigas[1].x - antigas[0].x : 8.2;
  const x0 = antigas[0]?.x ?? 112;

  const novas: ManutencaoColuna[] = [];
  for (let i = 0; i < quantidade; i++) {
    const antiga = antigas[i];
    novas.push({
      id: antiga?.id ?? genId("mc"),
      label: antiga?.label || colunaLabel(i),
      km: plano.kmBase > 0 ? String(plano.kmBase * (i + 1)) : "",
      meses: plano.mesesBase > 0 ? String(plano.mesesBase * (i + 1)) : "",
      x: antiga ? antiga.x : +(x0 + i * passo).toFixed(2),
    });
  }

  // Sobrou coluna do plano anterior: sai dos presets e das máscaras que a citavam.
  const removidas = new Set(antigas.slice(quantidade).map((c) => c.id));
  if (removidas.size) {
    cfg.condicoes.forEach((cond) => {
      cond.colunas = cond.colunas.filter((id) => !removidas.has(id));
    });
    itensDoPlano(pages).forEach(({ marker }) => {
      if (marker.revisoes) marker.revisoes = marker.revisoes.filter((id) => !removidas.has(id));
    });
  }

  cfg.colunas = novas;
  if (!novas.some((c) => c.id === cfg.previewColunaId)) {
    cfg.previewColunaId = novas[0]?.id ?? null;
  }
  return novas.length;
}

/**
 * Valores que o `switch ($resposta_formulario->quilometragem)` aceita para a coluna.
 * São dois por revisão (km e meses) porque o formulário grava um ou outro conforme o
 * que ocorrer primeiro — "48000" e "48M" caem na mesma coluna.
 */
export function valoresDaColuna(col: ManutencaoColuna): string[] {
  const out: string[] = [];
  if (col.km.trim()) out.push(col.km.trim());
  if (col.meses.trim()) out.push(`${col.meses.trim()}M`);
  return out;
}

/** Condições padrão de um plano novo — as três que todo plano acaba usando. */
export function condicoesPadrao(colunas: ManutencaoColuna[]): ManutencaoCondicao[] {
  const impares = colunas.filter((_, i) => i % 2 === 0).map((c) => c.id);
  const pares = colunas.filter((_, i) => i % 2 === 1).map((c) => c.id);
  return [
    { id: genId("cd"), nome: "ímpares", colunas: impares },
    { id: genId("cd"), nome: "pares", colunas: pares },
  ];
}

export function novaConfig(): ManutencaoConfig {
  const colunas = gerarColunas({
    quantidade: 10,
    kmBase: 15000,
    mesesBase: 12,
    xInicial: 112,
    passoX: 8.2,
  });
  return {
    colunas,
    condicoes: condicoesPadrao(colunas),
    sufixoFuncao: "PlanoManutencao",
    codFormulario: "",
    campoRevisao: "quilometragem",
    fundoPath: "",
    // Como no modelo: o arquivo traz só as duas funções, e os $fundoBg chegam por
    // parâmetro, declarados pela página do PDF.
    formatoArquivo: "funcao",
    varResposta: VAR_RESPOSTA_PADRAO,
    buscarNomeFantasia: true,
    iconMm: DEFAULT_ICON_MM,
    previewColunaId: colunas[0]?.id ?? null,
  };
}

/** Folha que guarda a configuração: a 1ª folha de checklist do docType. */
export function manutencaoHostPage(pages: DesignerPage[]): DesignerPage | undefined {
  return pages.find((p) => p.kind === "checklist" && p.docType === "manutencao");
}

/** Config do plano, criando a padrão na 1ª folha quando ainda não existe. */
export function ensureManutencaoConfig(pages: DesignerPage[]): ManutencaoConfig | null {
  const host = manutencaoHostPage(pages);
  if (!host) return null;
  if (!host.manutencao) host.manutencao = novaConfig();
  // Projeto salvo antes destes campos existirem ganha o padrão.
  const cfg = host.manutencao;
  if (cfg.varResposta === undefined) cfg.varResposta = VAR_RESPOSTA_PADRAO;
  if (cfg.formatoArquivo === undefined) cfg.formatoArquivo = "funcao";
  // Itens do modelo antigo (ponteiro para condição) passam a ter máscara própria, e o
  // antigo "sem máscara = todas" é gravado como máscara cheia antes de o padrão virar.
  migrarCondicoesParaMascaras(pages, cfg);
  migrarMascaraPadrao(pages, cfg);
  return cfg;
}

/** Config do plano sem criar nada (para leitura em render/export). */
export function getManutencaoConfig(pages: DesignerPage[]): ManutencaoConfig | null {
  return manutencaoHostPage(pages)?.manutencao ?? null;
}

export function findCondicao(
  cfg: ManutencaoConfig | null,
  id: string | undefined,
): ManutencaoCondicao | null {
  if (!cfg || !id) return null;
  return cfg.condicoes.find((c) => c.id === id) ?? null;
}

// ─── máscara de revisões do item ──────────────────────────────────────────────
// Cada item carrega a própria lista de revisões — a linha da tabela do plano. Antes
// isso era um ponteiro para uma condição compartilhada, mas na folha real quase todo
// item tem a sua combinação: eram 12 condições para 12 itens. As condições continuam,
// agora como PRESET aplicável na grade, e o gerador é quem reaproveita o que se repete.

type MarkerMascara = Pick<Marker, "revisoes" | "condicaoId">;

/**
 * Revisões em que o item é impresso, na ordem das colunas. Lista vazia = nenhuma: o
 * item nasce sem nada marcado e cada clique na grade acrescenta uma revisão. Quando a
 * lista cobre todas as colunas o item é impresso sempre — e sai sem `if` no PHP.
 */
export function mascaraDoItem(cfg: ManutencaoConfig | null, marker: MarkerMascara): string[] {
  if (marker.revisoes) return ordenarPorColuna(cfg, marker.revisoes);
  // Projeto ainda não migrado: a condição antiga vale como máscara.
  const cond = findCondicao(cfg, marker.condicaoId);
  return cond ? ordenarPorColuna(cfg, cond.colunas) : [];
}

/** A máscara cobre o plano inteiro? Então o item é impresso em toda revisão. */
export function cobreTodasAsRevisoes(cfg: ManutencaoConfig, mascara: string[]): boolean {
  return cfg.colunas.length > 0 && mascara.length >= cfg.colunas.length;
}

/** Mantém a máscara na ordem das colunas, sem ids órfãos e sem repetição. */
export function ordenarPorColuna(cfg: ManutencaoConfig | null, ids: string[]): string[] {
  if (!cfg) return [...new Set(ids)];
  const dentro = new Set(ids);
  return cfg.colunas.filter((c) => dentro.has(c.id)).map((c) => c.id);
}

/** Grava a máscara no item. `null` limpa (nenhuma revisão). */
export function definirMascara(
  cfg: ManutencaoConfig,
  marker: Marker,
  ids: string[] | null,
): void {
  delete marker.condicaoId; // a partir daqui quem manda é a máscara
  if (ids === null || ids.length === 0) {
    delete marker.revisoes;
    return;
  }
  marker.revisoes = ordenarPorColuna(cfg, ids);
}

/** Chave de comparação entre máscaras — é o que permite reaproveitar a variável PHP. */
export function assinaturaMascara(mascara: string[]): string {
  return mascara.join("|");
}

/**
 * Passa os itens que ainda usam `condicaoId` para máscara própria. Roda ao abrir o
 * projeto; devolve quantos itens foram convertidos.
 */
export function migrarCondicoesParaMascaras(pages: DesignerPage[], cfg: ManutencaoConfig): number {
  let n = 0;
  for (const p of pages) {
    if (p.kind !== "checklist" || p.docType !== "manutencao") continue;
    for (const g of p.groups) {
      for (const m of g.markers) {
        if (!m.condicaoId) continue;
        const cond = findCondicao(cfg, m.condicaoId);
        definirMascara(cfg, m, cond ? cond.colunas : cfg.colunas.map((c) => c.id));
        n += 1;
      }
    }
  }
  return n;
}

/**
 * Antes, item sem máscara queria dizer "impresso em todas"; agora quer dizer "nenhuma
 * revisão marcada". Esta conversão roda UMA vez por plano (o flag fica no cfg) e grava
 * todas as colunas nesses itens, para que um projeto já montado continue imprimindo o
 * mesmo. Depois dela, item vazio é vazio de verdade — e é assim que os novos nascem.
 */
export function migrarMascaraPadrao(pages: DesignerPage[], cfg: ManutencaoConfig): number {
  if (cfg.mascarasMigradas) return 0;
  cfg.mascarasMigradas = true;
  if (cfg.colunas.length === 0) return 0;
  const todas = cfg.colunas.map((c) => c.id);
  let n = 0;
  itensDoPlano(pages).forEach(({ marker }) => {
    if (marker.revisoes || marker.condicaoId) return;
    marker.revisoes = [...todas];
    n += 1;
  });
  return n;
}

/** O item é impresso nesta revisão? Sem nada marcado, não é impresso em nenhuma. */
export function itemNaColuna(
  cfg: ManutencaoConfig | null,
  marker: MarkerMascara,
  colunaId: string | null | undefined,
): boolean {
  if (!colunaId) return false;
  return mascaraDoItem(cfg, marker).includes(colunaId);
}

/** Coluna usada na prévia do canvas (a escolhida, ou a primeira). */
export function colunaPreview(cfg: ManutencaoConfig | null): ManutencaoColuna | null {
  if (!cfg || cfg.colunas.length === 0) return null;
  return cfg.colunas.find((c) => c.id === cfg.previewColunaId) ?? cfg.colunas[0];
}

/**
 * Colunas desenhadas no canvas: só a escolhida, ou todas quando `previewTodas`. Ver
 * todas de uma vez é o que denuncia o X torto — uma coluna fora do passo salta à vista
 * contra as vizinhas, coisa que a prévia de uma revisão só não mostra.
 */
export function colunasVisiveis(cfg: ManutencaoConfig | null): ManutencaoColuna[] {
  if (!cfg || cfg.colunas.length === 0) return [];
  if (cfg.previewTodas) return cfg.colunas;
  const col = colunaPreview(cfg);
  return col ? [col] : [];
}

/** Passo (mm) entre esta coluna e a anterior; null na primeira. */
export function passoDaColuna(cfg: ManutencaoConfig, index: number): number | null {
  if (index <= 0 || index >= cfg.colunas.length) return null;
  return +(cfg.colunas[index].x - cfg.colunas[index - 1].x).toFixed(2);
}

/**
 * Nome da variável PHP da condição (`$quilometragemValida<Nome>`), único dentro do
 * arquivo. Sem a garantia de unicidade, duas condições de nome parecido
 * ("ímpares"/"impares") colidiriam e uma sobrescreveria o `in_array` da outra.
 */
export function condicaoVarName(cond: ManutencaoCondicao, usados: Set<string>): string {
  // "revisões ímpares" → RevisoesImpares; "24 em 24" → 24Em24
  const partes = cond.nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const base = "quilometragemValida" + (partes.join("") || "Cond");
  let name = base;
  let n = 2;
  while (usados.has(name)) name = `${base}${n++}`;
  usados.add(name);
  return name;
}

/** Todos os itens de manutenção, na ordem em que são impressos. */
export function itensDoPlano(
  pages: DesignerPage[],
): { page: DesignerPage; group: DesignerGroup; marker: Marker }[] {
  const out: { page: DesignerPage; group: DesignerGroup; marker: Marker }[] = [];
  for (const page of pages) {
    if (page.kind !== "checklist" || page.docType !== "manutencao") continue;
    for (const group of page.groups) {
      for (const marker of group.markers) out.push({ page, group, marker });
    }
  }
  return out;
}

/** Quantos itens têm exatamente a máscara deste preset. */
export function contarUsos(pages: DesignerPage[], cfg: ManutencaoConfig, condicaoId: string): number {
  const cond = findCondicao(cfg, condicaoId);
  if (!cond) return 0;
  const alvo = assinaturaMascara(ordenarPorColuna(cfg, cond.colunas));
  return itensDoPlano(pages).filter(
    ({ marker }) => assinaturaMascara(mascaraDoItem(cfg, marker)) === alvo,
  ).length;
}

/**
 * Remove o preset. Os itens não são tocados: cada um já guarda a própria máscara, então
 * apagar um preset não muda nada do que é impresso.
 */
export function removerCondicao(cfg: ManutencaoConfig, id: string): void {
  cfg.condicoes = cfg.condicoes.filter((c) => c.id !== id);
}

/** Tira a coluna removida dos presets e das máscaras dos itens. */
export function removerColuna(pages: DesignerPage[], cfg: ManutencaoConfig, id: string): void {
  cfg.colunas = cfg.colunas.filter((c) => c.id !== id);
  cfg.condicoes.forEach((cond) => {
    cond.colunas = cond.colunas.filter((c) => c !== id);
  });
  itensDoPlano(pages).forEach(({ marker }) => {
    if (marker.revisoes) marker.revisoes = marker.revisoes.filter((c) => c !== id);
  });
  if (cfg.previewColunaId === id) cfg.previewColunaId = cfg.colunas[0]?.id ?? null;
}
