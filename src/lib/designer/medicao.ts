// Medição da grade da folha a partir do JPG de fundo — porta para o Designer do
// medir_linhas.py (tools/checklist do acampa-checklist e skill checklist-pdf-marcacoes).
//
// Existe para substituir o passo fixo. Linha com texto em duas linhas é mais alta que as
// vizinhas: yStart + i * incremento acumula erro e a marcação cai na célula de baixo. Aqui
// as divisórias horizontais são lidas da própria arte e cada item vai para o CENTRO
// medido da sua célula.
//
// Como funciona: dentro de uma faixa que cobre SÓ as colunas de marcação, uma divisória
// atravessa a largura inteira e o texto do item não. A linha de pixels com a maior parte
// da largura pintada é borda; grupos de linhas vizinhas viram uma divisória só (com
// início e fim, porque tarja de cabeçalho tem vários mm e o meio dela erraria a 1ª célula).
//
// Módulo puro: recebe o bitmap pronto, não toca no DOM — dá para testar fora do browser.

import type { BitmapLike } from "./leitura-grade";
import type { DesignerDocType } from "./types";

/** Abaixo disso o pixel conta como tinta. As artes são traço sobre branco. */
export const LIMIAR_TINTA = 200;
/** Fração da largura da faixa que precisa estar pintada para a linha ser divisória. */
export const COBERTURA_PADRAO = 0.6;
/** Célula mais baixa que isto é o vão entre as duas linhas de uma borda dupla. */
export const ALTURA_MIN_PADRAO = 2;
/** Acima desta variação entre alturas, passo fixo já erraria a marcação. */
export const VARIACAO_TOLERADA = 0.5;

export interface FaixaMm {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Divisoria {
  /** Topo e base da divisória (mm). */
  inicio: number;
  fim: number;
  espessura: number;
}

export interface MedicaoLinhas {
  divisorias: Divisoria[];
  /** Centro de cada célula, de cima para baixo (mm). */
  centros: number[];
  alturas: number[];
  /** Alturas parecidas o bastante para um passo fixo funcionar. */
  uniforme: boolean;
  /** Mediana dos passos entre centros (mm) — o "incremento" que a faixa sugere. */
  passo: number | null;
}

export interface OpcoesMedicao {
  limiar?: number;
  cobertura?: number;
  alturaMin?: number;
}

function luminancia(data: BitmapLike["data"], i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** Índices vizinhos (até `folga` de distância) viram um achado só: [início, fim]. */
export function agruparConsecutivos(indices: number[], folga = 1): [number, number][] {
  const grupos: [number, number][] = [];
  for (const i of indices) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && i - ultimo[1] <= folga) ultimo[1] = i;
    else grupos.push([i, i]);
  }
  return grupos;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Faixa em mm → pixels, já limitada à imagem e com os cantos em qualquer ordem. */
function faixaPx(img: BitmapLike, faixa: FaixaMm, larguraMm: number, alturaMm: number) {
  const kx = img.width / larguraMm;
  const ky = img.height / alturaMm;
  const x0 = Math.max(0, Math.round(Math.min(faixa.x0, faixa.x1) * kx));
  const x1 = Math.min(img.width, Math.round(Math.max(faixa.x0, faixa.x1) * kx));
  const y0 = Math.max(0, Math.round(Math.min(faixa.y0, faixa.y1) * ky));
  const y1 = Math.min(img.height, Math.round(Math.max(faixa.y0, faixa.y1) * ky));
  return { x0, x1, y0, y1, ky };
}

/**
 * Divisórias horizontais da faixa e o centro de cada célula entre elas. A faixa deve
 * cobrir só as colunas de marcação: com o texto dos itens dentro, a projeção deixa de
 * separar borda de conteúdo.
 */
export function medirLinhas(
  img: BitmapLike,
  faixa: FaixaMm,
  larguraMm: number,
  alturaMm: number,
  opts: OpcoesMedicao = {},
): MedicaoLinhas {
  const limiar = opts.limiar ?? LIMIAR_TINTA;
  const cobertura = opts.cobertura ?? COBERTURA_PADRAO;
  const alturaMin = opts.alturaMin ?? ALTURA_MIN_PADRAO;
  const { x0, x1, y0, y1, ky } = faixaPx(img, faixa, larguraMm, alturaMm);
  const vazio: MedicaoLinhas = { divisorias: [], centros: [], alturas: [], uniforme: true, passo: null };
  const largura = x1 - x0;
  if (largura <= 0 || y1 <= y0) return vazio;

  const minimo = cobertura * largura;
  const linhas: number[] = [];
  for (let y = y0; y < y1; y++) {
    let pintados = 0;
    const base = y * img.width * 4;
    for (let x = x0; x < x1; x++) {
      if (luminancia(img.data, base + x * 4) < limiar) pintados++;
    }
    if (pintados >= minimo) linhas.push(y);
  }

  const mm = (px: number) => px / ky;
  const divisorias: Divisoria[] = agruparConsecutivos(linhas).map(([a, b]) => ({
    inicio: mm(a),
    fim: mm(b + 1),
    espessura: mm(b - a + 1),
  }));

  const centros: number[] = [];
  const alturas: number[] = [];
  for (let i = 0; i < divisorias.length - 1; i++) {
    // A célula útil vai do FIM da divisória de cima ao INÍCIO da de baixo.
    const altura = divisorias[i + 1].inicio - divisorias[i].fim;
    if (altura < alturaMin) continue;
    centros.push((divisorias[i].fim + divisorias[i + 1].inicio) / 2);
    alturas.push(altura);
  }

  const passos = centros.slice(1).map((c, i) => c - centros[i]);
  const uniforme =
    alturas.length === 0 || Math.max(...alturas) - Math.min(...alturas) <= VARIACAO_TOLERADA;
  return { divisorias, centros, alturas, uniforme, passo: mediana(passos) };
}

// ─── colunas ──────────────────────────────────────────────────────────────────
// Porte do medir_colunas.py: o centro de cada coluna de marcação lido pelos RÓTULOS do
// cabeçalho ("C", "NC", "N/A", "1ª"...) ou pelas caixinhas de uma linha de item. A faixa Y
// deve pegar só essa linha.

/** Borda de tabela atravessa a faixa de cima a baixo; um glifo tem respiro. */
const COBERTURA_BORDA = 0.9;
/** Acima disto já não é risco de tabela. */
const BORDA_MAX_MM = 0.6;
/** Distância que ainda une dois glifos no mesmo rótulo ("N/A" são três). */
export const FOLGA_GLIFOS_MM = 1.2;
const LARGURA_MIN_MM = 0.3;

export interface ColunaMedida {
  centro: number;
  largura: number;
}

export function medirColunas(
  img: BitmapLike,
  faixa: FaixaMm,
  larguraMm: number,
  alturaMm: number,
  opts: { limiar?: number; folgaMm?: number; larguraMaxMm?: number; invertido?: boolean } = {},
): ColunaMedida[] {
  const limiar = opts.limiar ?? LIMIAR_TINTA;
  const folgaMm = opts.folgaMm ?? FOLGA_GLIFOS_MM;
  const { x0, x1, y0, y1 } = faixaPx(img, faixa, larguraMm, alturaMm);
  const kx = img.width / larguraMm;
  const altura = y1 - y0;
  if (altura <= 0 || x1 <= x0) return [];

  // Cabeçalho em tarja escura com texto branco (o plano da Avenger): sem inverter, a
  // tarja inteira vira um blob só. Ausente = decide pelo tom médio da faixa.
  let soma = 0;
  for (let y = y0; y < y1; y++) {
    const base = y * img.width * 4;
    for (let x = x0; x < x1; x++) soma += luminancia(img.data, base + x * 4);
  }
  const invertido = opts.invertido ?? soma / (altura * (x1 - x0)) < 128;

  const perfil = new Array<number>(x1 - x0).fill(0);
  for (let y = y0; y < y1; y++) {
    const base = y * img.width * 4;
    for (let x = x0; x < x1; x++) {
      const l = luminancia(img.data, base + x * 4);
      if (invertido ? l > limiar : l < limiar) perfil[x - x0]++;
    }
  }
  const comTinta = perfil.flatMap((v, i) => (v > 0 ? [i] : []));
  const folgaPx = Math.max(1, Math.round(folgaMm * kx));

  const achados: ColunaMedida[] = [];
  for (const [a, b] of agruparConsecutivos(comTinta, folgaPx)) {
    const largura = (b - a + 1) / kx;
    const cobertura = Math.max(...perfil.slice(a, b + 1)) / altura;
    // Quem decide se é borda é a COBERTURA, não a largura: rótulo de um glifo só ("C")
    // também é estreito e não pode cair junto com a borda.
    if (cobertura >= COBERTURA_BORDA && largura <= BORDA_MAX_MM) continue;
    if (largura < LARGURA_MIN_MM) continue;
    if (opts.larguraMaxMm !== undefined && largura > opts.larguraMaxMm) continue;
    achados.push({ centro: (x0 + (a + b) / 2) / kx, largura });
  }
  return achados;
}

/**
 * Y gravado no marcador a partir do centro medido. Cada docType ancora a marcação de um
 * jeito: roteiro, pós-venda e revisão guardam o CENTRO (o export desconta meia célula);
 * plano e formulário guardam o TOPO da caixa do writeHTMLCell.
 */
export function yDoCentro(docType: DesignerDocType, centroMm: number, alturaCaixaMm: number): number {
  if (docType === "manutencao" || docType === "formulario") return centroMm - alturaCaixaMm / 2;
  return centroMm;
}
