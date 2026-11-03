// "Mapear folha" do pós-venda: a folha não tem padrão — tabelas lado a lado com ENTRADA e
// SAÍDA, quadradinhos C / NC / N/A dentro da coluna, blocos de acessórios SIM/NÃO soltos,
// pneus B/M/R. O que todas têm em comum são os QUADRADINHOS. Então a leitura parte deles:
//
//   1. caixas — componentes conexos de tinta com contorno quadrado, oco, de 2 a 12 mm e os
//      quatro lados fechados (o "C" do rótulo tem o lado direito aberto e cai fora);
//   2. linhas — caixas com o mesmo Y;
//   3. conjuntos — as caixas de uma linha partidas pelas bordas verticais da tabela (a
//      coluna ENTRADA e a SAÍDA) ou por um vão largo (o texto do item entre elas);
//   4. pilhas — conjuntos com o mesmo X empilhados: a coluna de uma etapa numa tabela;
//   5. tabelas — pilhas vizinhas com as mesmas linhas (ENTRADA | SAÍDA da mesma tabela).
//
// A ordem dos campos vem dos grupos do extrator ("Entrada > DIANTEIRA"): seção que se
// repete nas etapas vai para a tabela, na pilha da sua etapa; seção de uma etapa só
// (acessórios, pneus) vai para as caixas avulsas. Duas pilhas avulsas lado a lado com as
// mesmas linhas são lidas linha a linha — é a ordem em que o formulário as grava.
//
// Módulo puro: recebe o bitmap pronto, não toca no DOM.

import type { BitmapLike } from "./leitura-grade";
import { baseTitleOf, contTitleFor } from "./paging";
import { parseQueueNames } from "./migration-parse";
import type { CampoDaFolha, Distribuicao, GrupoPlanejado } from "./mapear-folha";
import type { DesignerGroup, DesignerPage } from "./types";

/** Lado da caixa (mm). Retângulo também vale: os de acessórios e pneus da Parvi têm ~9 × 5,5. */
const CAIXA_MIN_MM = 2;
const CAIXA_MAX_MM = 12;
/** Lado maior sobre o menor: acima disto já é traço ou célula de tabela. */
const PROPORCAO_MAX = 2.2;
/** Tom abaixo do qual o pixel é contorno. Alto de propósito: há folhas com caixa em cinza
 *  quase branco (~217, acessórios da Parvi); quem separa caixa de texto é a forma. */
const TINTA = 232;
/** Cada lado precisa estar pintado nesta fração do comprimento. */
const LADO_FECHADO = 0.7;
/** Fração máxima de tinta no miolo — a caixa é oca. */
const MIOLO_MAX = 0.15;
/** Caixas com Y até esta distância são da mesma linha (mm). */
const MESMA_LINHA_MM = 1.2;
/** Mesma coluna entre linhas (mm). */
const MESMO_X_MM = 1.5;
/** Vão entre caixas que separa conjuntos sem borda no meio (mm). */
const VAO_CONJUNTO_MM = 25;

export interface Caixa {
  x: number;
  y: number;
  lado: number;
}

/** Uma coluna de conjuntos alinhados: as caixas de uma etapa numa tabela. */
export interface Pilha {
  /** X do centro de cada caixa do conjunto (mm), da esquerda para a direita. */
  xs: number[];
  /** Y do centro de cada linha (mm), de cima para baixo. */
  ys: number[];
  page: DesignerPage;
}

/** Pilhas vizinhas com as mesmas linhas: uma tabela, uma pilha por etapa. */
export interface TabelaDeCaixas {
  pilhas: Pilha[];
}

function lum(img: BitmapLike, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
}

/** Quadradinhos de marcação da folha (mm). */
export function acharCaixas(img: BitmapLike, larguraMm: number, alturaMm: number): Caixa[] {
  const W = img.width;
  const H = img.height;
  const kx = W / larguraMm;
  const ky = H / alturaMm;
  const tinta = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lum(img, x, y) < TINTA) tinta[y * W + x] = 1;

  const visto = new Uint8Array(W * H);
  const pilha: number[] = [];
  const caixas: Caixa[] = [];
  const min = CAIXA_MIN_MM * kx;
  const max = CAIXA_MAX_MM * kx;

  for (let i = 0; i < W * H; i++) {
    if (!tinta[i] || visto[i]) continue;
    // componente conexo (8 vizinhos), com a caixa envolvente
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    pilha.push(i);
    visto[i] = 1;
    while (pilha.length) {
      const p = pilha.pop()!;
      const px = p % W;
      const py = (p - px) / W;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx;
          if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx;
          if (tinta[q] && !visto[q]) {
            visto[q] = 1;
            pilha.push(q);
          }
        }
      }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w < min || w > max || h < min || h > max) continue;
    if (Math.max(w, h) / Math.min(w, h) > PROPORCAO_MAX) continue;
    // oca: pouca tinta no miolo
    const mx0 = x0 + Math.round(w * 0.25), mx1 = x1 - Math.round(w * 0.25);
    const my0 = y0 + Math.round(h * 0.25), my1 = y1 - Math.round(h * 0.25);
    let miolo = 0, area = 0;
    for (let y = my0; y <= my1; y++) for (let x = mx0; x <= mx1; x++) { area++; miolo += tinta[y * W + x]; }
    if (area === 0 || miolo / area > MIOLO_MAX) continue;
    // os quatro lados fechados (com 2 px de folga para dentro)
    const lado = (fixo: number, de: number, ate: number, vertical: boolean): boolean => {
      let pint = 0;
      for (let t = de; t <= ate; t++) {
        let ok = false;
        for (let d = 0; d <= 2 && !ok; d++) {
          const f = fixo + (fixo === (vertical ? x0 : y0) ? d : -d);
          const idx = vertical ? t * W + f : f * W + t;
          if (tinta[idx]) ok = true;
        }
        if (ok) pint++;
      }
      return pint >= LADO_FECHADO * (ate - de + 1);
    };
    if (!lado(x0, y0, y1, true) || !lado(x1, y0, y1, true) || !lado(y0, x0, x1, false) || !lado(y1, x0, x1, false)) continue;
    caixas.push({ x: (x0 + x1 + 1) / 2 / kx, y: (y0 + y1 + 1) / 2 / ky, lado: w / kx });
  }
  return caixas;
}

/** Há uma borda vertical entre xa e xb (mm) atravessando a linha y (mm)? */
function bordaEntre(img: BitmapLike, larguraMm: number, alturaMm: number, xa: number, xb: number, y: number, lado: number): boolean {
  const kx = img.width / larguraMm;
  const ky = img.height / alturaMm;
  const ya = Math.round((y - lado) * ky);
  const yb = Math.round((y + lado) * ky);
  for (let x = Math.ceil((xa + lado / 2 + 0.3) * kx); x <= Math.floor((xb - lado / 2 - 0.3) * kx); x++) {
    let n = 0;
    for (let yy = ya; yy <= yb; yy++) if (yy >= 0 && yy < img.height && lum(img, x, yy) < 200) n++;
    if (n >= 0.9 * (yb - ya + 1)) return true;
  }
  return false;
}

/** Lê a folha: as pilhas de caixas, agrupadas em tabelas, na ordem de leitura. */
export function mapearCaixas(img: BitmapLike, page: DesignerPage): TabelaDeCaixas[] {
  const { widthMm: L, heightMm: A } = page;
  const caixas = acharCaixas(img, L, A).sort((a, b) => a.y - b.y || a.x - b.x);

  // linhas
  const linhas: Caixa[][] = [];
  for (const c of caixas) {
    const ult = linhas[linhas.length - 1];
    if (ult && Math.abs(ult[0].y - c.y) <= MESMA_LINHA_MM) ult.push(c);
    else linhas.push([c]);
  }

  // conjuntos: a linha partida por borda vertical ou vão largo
  const conjuntos: { xs: number[]; y: number }[] = [];
  for (const linha of linhas) {
    linha.sort((a, b) => a.x - b.x);
    const y = linha.reduce((s, c) => s + c.y, 0) / linha.length;
    let atual: number[] = [linha[0].x];
    for (let i = 1; i < linha.length; i++) {
      const a = linha[i - 1], b = linha[i];
      const corta = b.x - a.x > VAO_CONJUNTO_MM || bordaEntre(img, L, A, a.x, b.x, y, a.lado);
      if (corta) {
        conjuntos.push({ xs: atual, y });
        atual = [];
      }
      atual.push(b.x);
    }
    conjuntos.push({ xs: atual, y });
  }

  // pilhas: conjuntos com os mesmos X
  const pilhas: Pilha[] = [];
  for (const cj of conjuntos) {
    const p = pilhas.find(
      (pp) => pp.xs.length === cj.xs.length && pp.xs.every((x, i) => Math.abs(x - cj.xs[i]) <= MESMO_X_MM),
    );
    if (p) p.ys.push(cj.y);
    else pilhas.push({ xs: cj.xs, ys: [cj.y], page });
  }
  // X da pilha: a média das linhas, que aguenta um JPEG torto melhor que a 1ª linha só
  pilhas.forEach((p) => {
    const todos = conjuntos.filter(
      (cj) => cj.xs.length === p.xs.length && cj.xs.every((x, i) => Math.abs(x - p.xs[i]) <= MESMO_X_MM),
    );
    p.xs = p.xs.map((_, i) => todos.reduce((s, cj) => s + cj.xs[i], 0) / todos.length);
  });
  // Linha solta (uma caixa perdida no texto) não é pilha de marcação.
  const validas = pilhas.filter((p) => p.ys.length >= 2 || p.xs.length >= 2);

  // tabelas: pilhas vizinhas (sem texto entre elas) com as mesmas linhas
  validas.sort((a, b) => a.ys[0] - b.ys[0] || a.xs[0] - b.xs[0]);
  const mesmasLinhas = (a: Pilha, b: Pilha) =>
    a.ys.length === b.ys.length && a.ys.every((y, i) => Math.abs(y - b.ys[i]) <= MESMA_LINHA_MM);
  const tabelas: TabelaDeCaixas[] = [];
  for (const p of validas) {
    const t = tabelas.find((tt) => {
      const ult = tt.pilhas[tt.pilhas.length - 1];
      return mesmasLinhas(ult, p) && p.xs[0] - ult.xs[ult.xs.length - 1] < VAO_CONJUNTO_MM;
    });
    if (t) t.pilhas.push(p);
    else tabelas.push({ pilhas: [p] });
  }
  tabelas.forEach((t) => t.pilhas.sort((a, b) => a.xs[0] - b.xs[0]));
  // ordem de leitura: de cima para baixo; lado a lado (mesmo topo), da esquerda para a direita
  tabelas.sort((a, b) => {
    const ya = a.pilhas[0].ys[0], yb = b.pilhas[0].ys[0];
    if (Math.abs(ya - yb) > 5) return ya - yb;
    return a.pilhas[0].xs[0] - b.pilhas[0].xs[0];
  });
  return tabelas;
}

// ─── distribuição ─────────────────────────────────────────────────────────────

const SEP = " > ";

/** Etapa e seção do título "Entrada > DIANTEIRA" (sem etapa = ""). */
function partes(titulo: string): { etapa: string; secao: string } {
  const t = baseTitleOf(titulo);
  const i = t.indexOf(SEP);
  return i < 0 ? { etapa: "", secao: t.trim() } : { etapa: t.slice(0, i).trim(), secao: t.slice(i + SEP.length).trim() };
}

/** Uma fila de células (Y + conjunto de X) que os campos de um tipo de grupo consomem. */
interface Fila {
  celulas: { y: number; xs: number[]; page: DesignerPage }[];
  usadas: number;
}

/**
 * Distribui os campos de todos os grupos de pós-venda pelas caixas das folhas lidas.
 * `lidas` traz uma entrada por folha com as tabelas dela (via `tabelasPorFolha`).
 */
export function distribuirPosVenda(
  grupos: DesignerGroup[],
  tabelasPorFolha: { page: DesignerPage; tabelas: TabelaDeCaixas[] }[],
): Distribuicao {
  const campos: CampoDaFolha[] = grupos.flatMap((g) => {
    const itens = g.markers.filter((m) => !m.mirrorNext);
    const fila = parseQueueNames(g.queue);
    if (fila.length === 0) return itens.map((m) => ({ label: m.label, marker: m, origem: g }));
    const porNome = new Map(itens.map((m) => [m.label, m]));
    return fila.map((label) => ({ label, marker: porNome.get(label), origem: g }));
  });

  // etapas na ordem em que aparecem; seção que aparece em mais de uma etapa se repete
  const etapas: string[] = [];
  const etapasDaSecao = new Map<string, Set<string>>();
  grupos.forEach((g) => {
    const { etapa, secao } = partes(g.title);
    if (etapa && !etapas.includes(etapa)) etapas.push(etapa);
    if (!etapasDaSecao.has(secao)) etapasDaSecao.set(secao, new Set());
    etapasDaSecao.get(secao)!.add(etapa);
  });
  const repete = (g: DesignerGroup) => (etapasDaSecao.get(partes(g.title).secao)?.size ?? 0) > 1;

  // filas: uma por etapa nas tabelas de várias pilhas (lidas tabela a tabela, coluna da
  // etapa); uma para as caixas avulsas (pilha única), com pilhas gêmeas intercaladas.
  const filaEtapa = etapas.map<Fila>(() => ({ celulas: [], usadas: 0 }));
  const filaAvulsa: Fila = { celulas: [], usadas: 0 };
  const filaTudo: Fila = { celulas: [], usadas: 0 };
  tabelasPorFolha.forEach(({ page, tabelas }) => {
    let i = 0;
    while (i < tabelas.length) {
      const t = tabelas[i];
      if (t.pilhas.length > 1) {
        t.pilhas.forEach((p, e) => {
          const fila = filaEtapa[Math.min(e, filaEtapa.length - 1)];
          p.ys.forEach((y) => fila?.celulas.push({ y, xs: p.xs, page }));
        });
        t.pilhas.forEach((p) => p.ys.forEach((y) => filaTudo.celulas.push({ y, xs: p.xs, page })));
        i++;
        continue;
      }
      // pilhas avulsas gêmeas (mesmas linhas, lado a lado): linha a linha, alternando
      const gemeas = [t.pilhas[0]];
      let j = i + 1;
      while (
        j < tabelas.length &&
        tabelas[j].pilhas.length === 1 &&
        tabelas[j].pilhas[0].ys.length === gemeas[0].ys.length &&
        tabelas[j].pilhas[0].ys.every((y, k) => Math.abs(y - gemeas[0].ys[k]) <= MESMA_LINHA_MM)
      ) {
        gemeas.push(tabelas[j].pilhas[0]);
        j++;
      }
      gemeas[0].ys.forEach((y, k) =>
        gemeas.forEach((p) => {
          const c = { y: p.ys[k], xs: p.xs, page };
          filaAvulsa.celulas.push(c);
          filaTudo.celulas.push(c);
        }),
      );
      i = j;
    }
  });

  const semEtapas = etapas.length === 0;
  const filaDo = (g: DesignerGroup): Fila => {
    if (semEtapas) return filaTudo;
    if (!repete(g)) return filaAvulsa;
    return filaEtapa[Math.max(0, etapas.indexOf(partes(g.title).etapa))];
  };

  // cada grupo consome a sua fila; um grupo vira um grupo por conjunto de X diferente
  // (o Designer guarda um X por opção por grupo: acessórios esquerda/direita viram dois)
  const usados = new Set<DesignerGroup>();
  const porPagina = new Map<DesignerPage, GrupoPlanejado[]>();
  const sobra: GrupoPlanejado[] = [];
  const contagem = new Map<DesignerGroup, number>();
  campos.forEach((c) => contagem.set(c.origem, (contagem.get(c.origem) ?? 0) + 1));

  const novoPlano = (origem: DesignerGroup, colunas?: number[]): GrupoPlanejado => {
    const primeira = !usados.has(origem);
    usados.add(origem);
    return {
      titulo: primeira ? origem.title : contTitleFor(baseTitleOf(origem.title), 1),
      reaproveita: primeira ? origem : null,
      modelo: origem,
      campos: [],
      centros: [],
      camposAntes: contagem.get(origem) ?? 0,
      colunas,
    };
  };

  let totalCampos = 0;
  grupos.forEach((g) => {
    const meus = campos.filter((c) => c.origem === g);
    const fila = filaDo(g);
    const planos = new Map<string, { plano: GrupoPlanejado; page: DesignerPage }>();
    let semCelula: GrupoPlanejado | null = null;
    meus.forEach((c) => {
      totalCampos++;
      const cel = fila.celulas[fila.usadas];
      if (!cel) {
        if (!semCelula) {
          semCelula = novoPlano(g);
          sobra.push(semCelula);
        }
        semCelula.campos.push(c);
        return;
      }
      fila.usadas++;
      const chave = `${cel.page.id}|${cel.xs.map((x) => x.toFixed(1)).join(",")}`;
      let alvo = planos.get(chave);
      if (!alvo) {
        alvo = { plano: novoPlano(g, cel.xs), page: cel.page };
        planos.set(chave, alvo);
        const lista = porPagina.get(cel.page) ?? [];
        lista.push(alvo.plano);
        porPagina.set(cel.page, lista);
      }
      alvo.plano.campos.push(c);
      alvo.plano.centros.push(cel.y);
    });
  });

  const totalCelulas = semEtapas
    ? filaTudo.celulas.length
    : filaEtapa.reduce((s, f) => s + f.celulas.length, 0) + filaAvulsa.celulas.length;
  return {
    porFolha: tabelasPorFolha.map(({ page }) => ({ page, grupos: porPagina.get(page) ?? [] })),
    sobra,
    destinoSobra: null,
    totalCelulas,
    totalCampos,
    pulos: 0,
  };
}
