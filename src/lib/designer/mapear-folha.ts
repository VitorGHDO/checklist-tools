// "Mapear folha": lê a tabela inteira da arte, sem retângulo nenhum, e devolve as colunas
// de marcação e os blocos (grupos) com o centro de cada célula.
//
// Três leituras sobre o mesmo bitmap, todas por projeção (a mesma ideia do medir_linhas):
//   1. colunas — bordas verticais longas: uma borda de tabela atravessa a folha quase toda,
//      texto nenhum faz isso. As N+1 bordas mais à direita delimitam as N colunas de
//      marcação (✓ ✗ N.A.).
//   2. divisórias — dentro dessas colunas, linha com a largura quase toda pintada. Grossa é
//      a tarja de cabeçalho de grupo; fina é a borda entre itens.
//   3. células válidas — o vão branco entre o último item e o próximo cabeçalho também fica
//      entre duas divisórias, mas não tem as bordas verticais da tabela. Só conta como
//      célula o que tem as bordas das colunas na altura do meio.
//
// Tudo antes da primeira tarja (a tabela de dados do documento) é ignorado.
// Módulo puro: recebe o bitmap pronto, não toca no DOM.

import type { BitmapLike } from "./leitura-grade";
import { agruparConsecutivos, LIMIAR_TINTA, yDoCentro } from "./medicao";
import { clamp01, makeMarker } from "./geometry";
import { newGroup } from "./model";
import { inheritGroupConfig } from "./actions";
import { baseTitleOf, contTitleFor, isContTitle } from "./paging";
import { parseQueueNames } from "./migration-parse";
import { DEFAULT_ICON_MM } from "./manutencao";
import type { DesignerGroup, DesignerPage, ManutencaoConfig, Marker } from "./types";

/**
 * Trecho CONTÍNUO (mm) que um traço vertical precisa ter para ser borda de tabela. É a
 * continuidade, e não a quantidade de tinta, que separa borda de texto: numa folha de 4
 * itens a borda da coluna STATUS tem menos pixels que uma coluna de texto qualquer (as
 * hastes das letras somam), mas só a borda forma um traço de vários mm sem quebra.
 */
const TRECHO_CONTINUO_MM = 10;
/** Falha tolerada dentro do trecho (px): o cruzamento com uma divisória, ruído do JPEG. */
const FALHA_TOLERADA_PX = 2;
/** Traços verticais mais próximos que isto (mm) são a mesma borda. */
const MESMA_BORDA_MM = 1.2;
/** Distância (px) em que um traço de borda já tem papel branco dos lados. */
const TRACO_FINO_PX = 4;
/** Fração da largura das colunas que uma divisória horizontal precisa cobrir. */
const COBERTURA_HORIZONTAL = 0.6;
/** Divisória mais grossa que isto é tarja de cabeçalho de grupo. */
const TARJA_MIN_MM = 1.5;
/** Célula mais baixa que isto é o vão de uma borda dupla. */
const CELULA_MIN_MM = 2;
/** Recuo (mm) das bordas verticais ao varrer as divisórias. */
const RECUO_MM = 0.6;

export interface BlocoDetectado {
  /** Y (mm) da tarja de cabeçalho que abre o bloco. */
  tarja: number;
  /** Centro de cada célula do bloco, de cima para baixo (mm). */
  centros: number[];
}

export interface MapaDaFolha {
  /** Bordas verticais das colunas de marcação, da esquerda para a direita (mm). */
  bordas: number[];
  /** Centro de cada coluna de marcação (mm). */
  centrosColunas: number[];
  blocos: BlocoDetectado[];
}

/** Coluna de marcação mais larga que isto já é a coluna do texto dos itens. */
const COLUNA_MAX_MM = 25;

function lum(img: BitmapLike, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
}

export interface OpcoesMapa {
  /** Quantas colunas de marcação a tabela tem. Ausente = detecta: a partir da direita,
   *  toda coluna estreita é de marcação; a primeira larga (o texto) encerra. */
  nColunas?: number;
  /** Tom abaixo do qual a divisória horizontal conta como traço. */
  limiarLinha?: number;
  /**
   * "tarjas" (padrão): os blocos começam nas tarjas escuras de cabeçalho de grupo.
   * "linhas": tabela sem tarja entre blocos e com células hachuradas (o plano). A
   * divisória é lida por contraste local — o traço é mais escuro que o que está logo acima
   * e logo abaixo, sobre branco ou sobre cinza — e a célula cinza uniforme não conta. A
   * tabela inteira vira um bloco só, a partir da primeira célula clara.
   */
  modo?: "tarjas" | "linhas";
}

/** Contraste mínimo do traço sobre o que está 3 px acima e abaixo (modo "linhas"). */
const CONTRASTE_TRACO = 12;
/** Fração da altura da célula que a borda vertical precisa atravessar. */
const BORDA_CONTINUA = 0.85;
const PASSO_TRACO_PX = 3;
/** Mais claro que isto é papel: não há traço para achar ali. */
const PAPEL = 245;
/** Mais escuro que a hachura cinza (~130): tinta de verdade — cabeçalho e bordas. */
const LIMIAR_ESCURO = 110;
/** Fração do meio da célula que não pode ser tinta, para ela contar (modo "linhas").
 *  Branco ou hachura servem: linha toda cinza (item que não sai em quase nenhuma
 *  revisão) continua sendo célula; o cabeçalho escuro da tabela não. */
const FRACAO_SEM_TINTA = 0.5;

/**
 * Bordas verticais longas na metade direita da folha (px). O mínimo é baixo de propósito:
 * folha com tabela curta (a última de um checklist) não chega perto da altura inteira, e
 * a borda externa — que também atravessa a tabela de dados — é muito mais longa que as
 * internas. Comparar com a maior eliminaria justamente as bordas ✓|✗ e ✗|N.A.
 */
/**
 * O pixel é parte de um TRAÇO vertical fino? A tarja cheia dos cabeçalhos pinta todas as
 * colunas por igual e, contada, juntava a área de marcação inteira numa "borda" só.
 */
function tracoVertical(img: BitmapLike, x: number, y: number): boolean {
  const L = TRACO_FINO_PX;
  const v = lum(img, x, y);
  const ve = x - L >= 0 ? lum(img, x - L, y) : 255;
  const vd = x + L < img.width ? lum(img, x + L, y) : 255;
  // traço claro sobre fundo colorido (borda cinza entre células bege do roteiro): mais
  // escuro que os dois lados
  if (v <= ve - CONTRASTE_TRACO && v <= vd - CONTRASTE_TRACO) return true;
  // traço escuro sobre papel: escuro, com claro de pelo menos um lado
  return v < LIMIAR_TINTA && (ve >= LIMIAR_TINTA || vd >= LIMIAR_TINTA);
}

function bordasVerticais(img: BitmapLike, larguraMm: number, alturaMm: number): number[] {
  const inicio = Math.floor(img.width * 0.4);
  const minimo = TRECHO_CONTINUO_MM * (img.height / alturaMm);
  const colunas: number[] = [];
  const trechoDe = new Map<number, number>();
  for (let x = inicio; x < img.width; x++) {
    let trecho = 0;
    let falha = 0;
    let maior = 0;
    for (let y = 0; y < img.height; y++) {
      if (tracoVertical(img, x, y)) {
        trecho += 1 + falha;
        falha = 0;
        if (trecho > maior) maior = trecho;
      } else if (trecho > 0 && falha < FALHA_TOLERADA_PX) {
        falha++;
      } else {
        trecho = 0;
        falha = 0;
      }
    }
    if (maior >= minimo) {
      colunas.push(x);
      trechoDe.set(x, maior);
    }
  }
  // Traços a menos de 1,2 mm são a mesma borda (a beirada da hachura cinza do plano corre
  // colada na borda real e virava uma "coluna" de meio milímetro). A posição do grupo é a
  // do traço MAIS LONGO, não a média: a média com um traço vizinho tirava a borda do
  // lugar e a checagem de bordas das células falhava.
  const folga = Math.round(MESMA_BORDA_MM * (img.width / larguraMm));
  return agruparConsecutivos(colunas, folga).map(([a, b]) => {
    let melhorX = a;
    for (let x = a; x <= b; x++) {
      if ((trechoDe.get(x) ?? 0) > (trechoDe.get(melhorX) ?? 0)) melhorX = x;
    }
    // traço de 2 px com o mesmo comprimento: o meio dos dois
    const empate = [...Array(b - a + 1).keys()].map((i) => a + i).filter((x) => trechoDe.get(x) === trechoDe.get(melhorX));
    return empate.length > 1 && empate[empate.length - 1] - empate[0] <= 2
      ? (empate[0] + empate[empate.length - 1]) / 2
      : melhorX;
  });
}

/**
 * Lê a folha: colunas de marcação, blocos e o centro de cada célula. Devolve null quando
 * não acha a tabela — folha sem tabela, ou que não chega à metade direita.
 */
export function mapearFolha(
  img: BitmapLike,
  larguraMm: number,
  alturaMm: number,
  opts: OpcoesMapa = {},
): MapaDaFolha | null {
  const kx = img.width / larguraMm;
  const verticais = bordasVerticais(img, larguraMm, alturaMm);
  // Nem toda borda da ponta direita é da tabela de marcação: a tabela de dados do
  // documento tem bordas no mesmo trecho (KM INICIAL | KM FINAL) e às vezes vai além da
  // tabela do checklist. Testa cada janela de bordas consecutivas perto da direita, de
  // colunas estreitas, e fica com a que achou mais células (no empate, a de mais colunas):
  // uma borda que não atravessa as linhas do checklist derruba as células da janela.
  let melhor: MapaDaFolha | null = null;
  let melhorCelulas = 0;
  const celulas = (m: MapaDaFolha | null) => m?.blocos.reduce((s, b) => s + b.centros.length, 0) ?? 0;
  const n = verticais.length;
  for (let fim = n - 1; fim >= Math.max(1, n - 3); fim--) {
    for (let ini = fim - 1; ini >= 0; ini--) {
      if ((verticais[ini + 1] - verticais[ini]) / kx > COLUNA_MAX_MM) break;
      const nColunas = fim - ini;
      if (opts.nColunas !== undefined && nColunas !== opts.nColunas) continue;
      const lido = lerTabela(img, larguraMm, alturaMm, verticais.slice(ini, fim + 1), opts);
      const c = celulas(lido);
      if (c > melhorCelulas || (c === melhorCelulas && c > 0 && lido!.centrosColunas.length > melhor!.centrosColunas.length)) {
        melhor = lido;
        melhorCelulas = c;
      }
    }
  }
  return melhor;
}

/** Lê os blocos e as células entre as bordas `bordasPx` das colunas de marcação. */
function lerTabela(
  img: BitmapLike,
  larguraMm: number,
  alturaMm: number,
  bordasPx: number[],
  opts: OpcoesMapa,
): MapaDaFolha | null {
  const kx = img.width / larguraMm;
  const ky = img.height / alturaMm;
  const limiarLinha = opts.limiarLinha ?? LIMIAR_TINTA;

  // divisórias horizontais dentro das colunas de marcação
  const x0 = Math.ceil(bordasPx[0] + RECUO_MM * kx);
  const x1 = Math.floor(bordasPx[bordasPx.length - 1] - RECUO_MM * kx);
  const largura = x1 - x0;
  if (largura <= 0) return null;
  const porContraste = opts.modo === "linhas";
  const P = PASSO_TRACO_PX;
  // Traço horizontal: tinta (tarja, borda preta) ou linha mais escura que o que está logo
  // acima e abaixo — a divisória cinza-clara sobre célula bege do roteiro só aparece
  // assim. No modo "linhas" a "tinta" é mais escura que a hachura cinza do plano, senão
  // a célula hachurada inteira viraria divisória.
  const tinta = porContraste ? LIMIAR_ESCURO : limiarLinha;
  const ehTraco = (x: number, y: number): boolean => {
    const v = lum(img, x, y);
    if (v < tinta) return true;
    if (v > PAPEL) return false;
    const cima = y - P >= 0 ? lum(img, x, y - P) : 255;
    const baixo = y + P < img.height ? lum(img, x, y + P) : 255;
    return v <= cima - CONTRASTE_TRACO && v <= baixo - CONTRASTE_TRACO;
  };
  const linhas: number[] = [];
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) if (ehTraco(x, y)) n++;
    if (n >= COBERTURA_HORIZONTAL * largura) linhas.push(y);
  }
  const divisorias = agruparConsecutivos(linhas).map(([a, b]) => ({
    inicio: a / ky,
    fim: (b + 1) / ky,
    tarja: (b - a + 1) / ky >= TARJA_MIN_MM,
  }));

  // a célula vale se as bordas das colunas passam pela altura do meio dela
  /**
   * As bordas das colunas atravessam a célula de cima a baixo? Todas, inclusive as internas
   * (✓|✗, ✗|N.A.): a tabela de dados do documento tem as de fora no mesmo X, mas não as
   * de dentro. E atravessando a célula inteira, não só no meio: o "/ / | :" da data cai
   * no X das bordas internas e enganava a checagem de uma altura só.
   */
  const temBordas = (topoMm: number, baseMm: number): boolean => {
    const y0c = Math.ceil((topoMm + 0.4) * ky);
    const y1c = Math.floor((baseMm - 0.4) * ky);
    if (y1c <= y0c) return false;
    return bordasPx.every((bx) => {
      let linhasComBorda = 0;
      for (let y = y0c; y <= y1c; y++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = Math.round(bx) + dx;
          if (x >= 0 && x < img.width && tracoVertical(img, x, y)) {
            linhasComBorda++;
            break;
          }
        }
      }
      return linhasComBorda >= BORDA_CONTINUA * (y1c - y0c + 1);
    });
  };

  // modo "linhas": o meio da célula de verdade é papel ou hachura, não tinta — o
  // cabeçalho escuro da tabela (1ª 2ª…, km, meses) fica de fora sem precisar de tarja.
  const temPapel = (yMm: number): boolean => {
    const y = Math.round(yMm * ky);
    let semTinta = 0;
    for (let x = x0; x < x1; x++) if (lum(img, x, y) >= LIMIAR_ESCURO) semTinta++;
    return semTinta >= FRACAO_SEM_TINTA * largura;
  };

  const blocos: BlocoDetectado[] = [];
  let atual: BlocoDetectado | null = null;
  for (let i = 0; i < divisorias.length; i++) {
    const d = divisorias[i];
    if (d.tarja && !porContraste) {
      atual = { tarja: (d.inicio + d.fim) / 2, centros: [] };
      blocos.push(atual);
    }
    // A célula colada na tarja seguinte também vale (no roteiro o último item encosta no
    // próximo cabeçalho); o vão branco entre grupos da revisão cai no teste de bordas.
    const prox = divisorias[i + 1];
    if (!prox) continue;
    const altura = prox.inicio - d.fim;
    if (altura < CELULA_MIN_MM) continue;
    const centro = (d.fim + prox.inicio) / 2;
    if (porContraste) {
      if (!temBordas(d.fim, prox.inicio) || !temPapel(centro)) {
        atual = null;
        continue;
      }
      if (!atual) {
        atual = { tarja: d.fim, centros: [] };
        blocos.push(atual);
      }
    } else if (!atual) {
      // Item sem tarja acima: continuação do grupo da folha anterior, que começa direto
      // nos itens (folha 2 do roteiro). O vão entre grupos e a tabela de dados do
      // documento não entram — não têm as bordas internas das colunas.
      if (!temBordas(d.fim, prox.inicio)) continue;
      atual = { tarja: d.fim, centros: [] };
      blocos.push(atual);
    } else if (!temBordas(d.fim, prox.inicio)) {
      // Vão fora da tabela encerra o bloco até a próxima tarja.
      atual = null;
      continue;
    }
    atual.centros.push(centro);
  }

  const bordas = bordasPx.map((b) => b / kx);
  return {
    bordas,
    centrosColunas: bordas.slice(1).map((b, i) => (bordas[i] + b) / 2),
    blocos: blocos.filter((b) => b.centros.length > 0),
  };
}

// ─── distribuição dos campos ──────────────────────────────────────────────────
// "A folha manda": os campos seguem na ordem e cada bloco detectado recebe tantos campos
// quantas células tem. É o que conserta a divisão errada vinda do extrator (GRUPO 2 com 3
// campos quando a folha tem 4 itens).
//
// O bloco herda o grupo do SEU PRIMEIRO CAMPO. Na primeira vez que um grupo aparece, o
// próprio grupo é reaproveitado (id, título e calibração); se ele já recebeu um bloco
// antes, este é a continuação dele e vira "<título> (cont.)".
//
// Linha impressa que não é pergunta (a "tensão da bateria ___V") desloca tudo abaixo dela;
// por isso a prévia compara os totais e a fila aceita "-" para pular a célula.

/** Como cada docType é lido e distribuído. */
export interface PerfilDoMapa {
  /** Como a detecção acha os blocos (ver OpcoesMapa.modo). "caixas" = pós-venda, lido
   *  pelos quadradinhos de marcação (mapear-posvenda.ts), não por tabela. */
  modo: "tarjas" | "linhas" | "caixas";
  /**
   * "bloco": a folha manda — cada bloco detectado é um grupo (revisão, roteiro).
   * "origem": a tabela não separa os blocos (o plano não tem tarja entre SOLO, MEIA
   * ALTURA…); os grupos continuam os do extrator e só ganham as posições.
   */
  agrupamento: "bloco" | "origem";
}

/** Perfil de leitura do docType, ou null quando o mapear ainda não o suporta. */
export function perfilDoMapa(docType: DesignerPage["docType"]): PerfilDoMapa | null {
  if (docType === "revisao" || docType === "roteiro") return { modo: "tarjas", agrupamento: "bloco" };
  if (docType === "manutencao") return { modo: "linhas", agrupamento: "origem" };
  if (docType === "posvenda") return { modo: "caixas", agrupamento: "origem" };
  return null;
}

/** Linha da fila que ocupa uma célula sem virar marcação. */
export const PULAR_CELULA = "-";

export interface CampoDaFolha {
  label: string;
  /** Marcador original, reaproveitado para não perder tipo/resposta já escolhidos. */
  marker?: Marker;
  /** Grupo de onde o campo veio — decide o título do bloco que ele abre. */
  origem: DesignerGroup;
}

/**
 * Campos dos grupos, na ordem. A fila manda (é onde o "-" entra); as marcações que já
 * existem são reaproveitadas pelo nome. Grupo sem fila usa as marcações como estão.
 */
function camposDosGrupos(groups: DesignerGroup[]): CampoDaFolha[] {
  return groups.flatMap((g) => {
    const itens = g.markers.filter((m) => !m.mirrorNext);
    const fila = parseQueueNames(g.queue);
    if (fila.length === 0) return itens.map((m) => ({ label: m.label, marker: m, origem: g }));
    const porNome = new Map(itens.map((m) => [m.label, m]));
    return fila.map((label) => ({ label, marker: porNome.get(label), origem: g }));
  });
}

const reais = (cs: CampoDaFolha[]) => cs.filter((c) => c.label !== PULAR_CELULA);

/** Uma folha lida: a página e o que a detecção achou nela. */
export interface FolhaLida {
  page: DesignerPage;
  mapa: MapaDaFolha;
}

export interface GrupoPlanejado {
  titulo: string;
  /** Grupo existente reaproveitado, ou null para criar (continuação). */
  reaproveita: DesignerGroup | null;
  /** Grupo de onde herda a calibração quando é criado. */
  modelo: DesignerGroup;
  campos: CampoDaFolha[];
  /** Centro de cada célula (mm), alinhado com `campos`; vazio na sobra. */
  centros: number[];
  /** Quantos campos o grupo de origem tinha antes — para a prévia. */
  camposAntes: number;
  colunas?: number[];
}

/** O resultado da distribuição, ainda não aplicado — é dele que sai a prévia. */
export interface Distribuicao {
  /** Grupos de cada folha mapeada, na ordem. */
  porFolha: { page: DesignerPage; grupos: GrupoPlanejado[] }[];
  /** Campos que não couberam: viram continuação no topo da folha seguinte. */
  sobra: GrupoPlanejado[];
  /** Folha que recebe a sobra (null = não existe; fica no fim da última mapeada). */
  destinoSobra: DesignerPage | null;
  totalCelulas: number;
  totalCampos: number;
  pulos: number;
}

/**
 * Distribui `campos` pelos blocos das `folhas`, na ordem. Mesma rotina para uma folha só
 * e para o mapear tudo: o que muda é a lista de folhas e de campos.
 */
export function distribuir(
  folhas: FolhaLida[],
  campos: CampoDaFolha[],
  destinoSobra: DesignerPage | null,
  agrupamento: PerfilDoMapa["agrupamento"] = "bloco",
): Distribuicao {
  const usados = new Set<DesignerGroup>();
  const contagemOrigem = new Map<DesignerGroup, number>();
  campos.forEach((c) => contagemOrigem.set(c.origem, (contagemOrigem.get(c.origem) ?? 0) + 1));

  const planeja = (fatia: CampoDaFolha[], centros: number[], colunas?: number[]): GrupoPlanejado => {
    const origem = fatia[0].origem;
    const primeiraVez = !usados.has(origem);
    usados.add(origem);
    return {
      titulo: primeiraVez ? origem.title : contTitleFor(baseTitleOf(origem.title), 1),
      reaproveita: primeiraVez ? origem : null,
      modelo: origem,
      campos: fatia,
      centros,
      camposAntes: contagemOrigem.get(origem) ?? 0,
      colunas,
    };
  };

  let k = 0;
  const porFolha = folhas.map(({ page, mapa }) => {
    const grupos: GrupoPlanejado[] = [];
    for (const b of mapa.blocos) {
      if (k >= campos.length) break;
      const fatia = campos.slice(k, k + b.centros.length);
      k += fatia.length;
      if (agrupamento === "bloco") {
        grupos.push(planeja(fatia, b.centros, mapa.centrosColunas));
        continue;
      }
      // "origem": o bloco é repartido nos grupos de onde os campos vieram, na ordem.
      let i = 0;
      while (i < fatia.length) {
        let j = i;
        while (j < fatia.length && fatia[j].origem === fatia[i].origem) j++;
        grupos.push(planeja(fatia.slice(i, j), b.centros.slice(i, j), mapa.centrosColunas));
        i = j;
      }
    }
    return { page, grupos };
  });

  // Sobra: um grupo por origem, na ordem — continuação de quem já começou numa folha.
  const sobra: GrupoPlanejado[] = [];
  const resto = campos.slice(k);
  let i = 0;
  while (i < resto.length) {
    let j = i;
    while (j < resto.length && resto[j].origem === resto[i].origem) j++;
    sobra.push(planeja(resto.slice(i, j), []));
    i = j;
  }

  return {
    porFolha,
    sobra,
    destinoSobra,
    totalCelulas: folhas.reduce((a, f) => a + f.mapa.blocos.reduce((s, b) => s + b.centros.length, 0), 0),
    totalCampos: campos.length,
    pulos: campos.length - reais(campos).length,
  };
}

/** Folhas de checklist do docType, na ordem. */
function folhasDoDoc(pages: DesignerPage[], docType: DesignerPage["docType"]): DesignerPage[] {
  return pages.filter((p) => p.kind === "checklist" && p.docType === docType);
}

/** Uma folha só: os campos dela, e a sobra vai para o topo da folha seguinte. */
export function distribuirFolha(pages: DesignerPage[], page: DesignerPage, mapa: MapaDaFolha): Distribuicao {
  const folhas = folhasDoDoc(pages, page.docType);
  const seguinte = folhas[folhas.indexOf(page) + 1] ?? null;
  const agrupamento = perfilDoMapa(page.docType)?.agrupamento ?? "bloco";
  return distribuir([{ page, mapa }], camposDosGrupos(page.groups), seguinte, agrupamento);
}

/**
 * Mapear tudo: os campos de TODAS as folhas do docType, na ordem, distribuídos pelos
 * blocos de todas as folhas lidas. A divisão entre folhas sai da própria arte — o grupo
 * que não cabe numa folha continua no topo da seguinte.
 */
export function distribuirTudo(pages: DesignerPage[], lidas: FolhaLida[]): Distribuicao {
  const docType = lidas[0]?.page.docType ?? "revisao";
  const folhas = folhasDoDoc(pages, docType);
  const agrupamento = perfilDoMapa(docType)?.agrupamento ?? "bloco";
  return distribuir(lidas, camposDosGrupos(folhas.flatMap((p) => p.groups)), null, agrupamento);
}

/** Texto da prévia, para o confirm antes de aplicar. */
export function textoDaDistribuicao(d: Distribuicao): string {
  const L: string[] = [];
  const pulos = d.pulos ? ` (${d.pulos} célula(s) pulada(s) com "-")` : "";
  L.push(`${d.porFolha.length} folha(s), ${d.totalCelulas} célula(s), ${d.totalCampos - d.pulos} campo(s)${pulos}.`);
  // Quanto cada grupo de origem recebeu no total, somando as continuações: grupo só
  // partido entre folhas não mudou de tamanho e não merece o aviso "tinha N".
  const totalPorOrigem = new Map<DesignerGroup, number>();
  [...d.porFolha.flatMap((f) => f.grupos), ...d.sobra].forEach((g) => {
    if (!isContTitle(g.titulo)) totalPorOrigem.set(g.modelo, (totalPorOrigem.get(g.modelo) ?? 0) + g.campos.length);
    else {
      const dono = [...totalPorOrigem.keys()].find((m) => baseTitleOf(m.title) === baseTitleOf(g.titulo));
      if (dono) totalPorOrigem.set(dono, (totalPorOrigem.get(dono) ?? 0) + g.campos.length);
    }
  });
  d.porFolha.forEach(({ page, grupos }) => {
    L.push("");
    L.push(`${page.name}:`);
    if (grupos.length === 0) L.push("   (nenhum bloco recebeu campo)");
    grupos.forEach((g) => {
      const r = reais(g.campos);
      const nPulos = g.campos.length - r.length;
      const recebeu = totalPorOrigem.get(g.modelo) ?? g.campos.length;
      const tinha =
        !isContTitle(g.titulo) && g.camposAntes !== recebeu ? `  ← tinha ${g.camposAntes}, fica com ${recebeu}` : "";
      L.push(`   ${g.campos.length} célula(s)${nPulos ? `, ${nPulos} pulada(s)` : ""} → ${g.titulo}${tinha}`);
      L.push(`      ${r[0]?.label ?? "—"} … ${r[r.length - 1]?.label ?? "—"}`);
    });
  });
  L.push("");
  const dif = d.totalCampos - d.totalCelulas;
  if (d.sobra.length > 0) {
    const n = d.sobra.reduce((a, g) => a + reais(g.campos).length, 0);
    const onde = d.destinoSobra
      ? `vão para o topo da ${d.destinoSobra.name}`
      : "ficam no fim da última folha (não há folha seguinte)";
    L.push(`Continuam ${n} campo(s), que ${onde}: ${d.sobra.map((g) => g.titulo).join(", ")}.`);
  } else if (dif < 0) {
    L.push(`ATENÇÃO: há ${-dif} célula(s) a mais que campos — linha impressa que não é pergunta`);
    L.push(`(ex.: "tensão da bateria ___V") ou campo faltando. Os campos depois dela ficam deslocados.`);
    L.push(`Para corrigir: cancele, ponha uma linha só com "-" na fila do grupo, na posição`);
    L.push("dessa linha, e mapeie de novo.");
  } else {
    L.push("Células e campos batem.");
  }
  L.push("");
  L.push("Aplicar? Os grupos são refeitos pela folha.");
  return L.join("\n");
}

export interface ResultadoMapa {
  posicionados: number;
  continuam: number;
  destinoSobra: DesignerPage | null;
}

/** O que a aplicação precisa saber do documento além da folha. */
export interface ContextoMapa {
  /** Plano: as revisões recebem o X medido e o Y vai para o topo da caixa da marca. */
  manutencao?: ManutencaoConfig | null;
}

function materializar(g: GrupoPlanejado, page: DesignerPage, ctx: ContextoMapa): DesignerGroup {
  const grupo = g.reaproveita ?? newGroup(g.titulo, page.docType);
  if (!g.reaproveita) inheritGroupConfig(grupo, g.modelo, page.docType);
  grupo.title = g.titulo;
  if (g.colunas && page.docType === "revisao" && g.colunas.length >= 3) {
    grupo.colX1 = +g.colunas[0].toFixed(2);
    grupo.colX2 = +g.colunas[1].toFixed(2);
    grupo.colX3 = +g.colunas[2].toFixed(2);
  }
  // roteiro: ✓, X e NA saem na mesma célula — o X do grupo é o centro da 1ª coluna.
  const xRoteiro = page.docType === "roteiro" && g.colunas?.length ? +g.colunas[0].toFixed(2) : null;
  if (xRoteiro !== null) grupo.xFixed = xRoteiro;
  // pós-venda: cada opção (C, NC, N/A…) tem a sua caixa — o X dela é o centro da caixa,
  // na ordem das opções do grupo.
  if (page.docType === "posvenda" && g.colunas?.length) {
    const opts = grupo.posvendaOpts ?? [];
    grupo.optX = { ...(grupo.optX ?? {}) };
    opts.forEach((o, i) => {
      if (g.colunas![i] !== undefined) grupo.optX![o.valor] = +g.colunas![i].toFixed(2);
    });
    grupo.posvendaXMode = g.colunas.length > 1 ? "diff" : "same";
    grupo.xFixed = +g.colunas[0].toFixed(2);
  }
  const xGrupo = xRoteiro ?? (page.docType === "posvenda" && g.colunas?.length ? grupo.xFixed : null);
  const caixa = page.docType === "manutencao" ? ctx.manutencao?.iconMm ?? DEFAULT_ICON_MM : 0;
  grupo.queue = g.campos.map((c) => c.label).join("\n");
  const medido = g.centros.length > 0;
  // "-" consome a célula sem virar marcação; continua na fila para remapear igual.
  grupo.markers = g.campos.flatMap((c, j) => {
    if (c.label === PULAR_CELULA) return [];
    const yMm = medido ? yDoCentro(page.docType, g.centros[j], caixa) : grupo.yStart;
    const m = c.marker ?? makeMarker(grupo, page, c.label, yMm);
    if (medido) m.fy = clamp01(yMm / page.heightMm);
    if (xGrupo !== null) m.fx = clamp01(xGrupo / page.widthMm);
    return [m];
  });
  if (medido) {
    if (grupo.markers.length) grupo.yStart = +(grupo.markers[0].fy * page.heightMm).toFixed(2);
    grupo.yManual = true;
    grupo.markersManual = true;
  } else {
    // Continuação ainda sem medida na folha nova: passo regular até ser mapeada lá.
    grupo.yManual = false;
    delete grupo.markersManual;
  }
  return grupo;
}

/**
 * Aplica a distribuição: as folhas mapeadas ficam só com os grupos planejados (grupo que
 * teve todos os campos absorvidos por outros blocos some); a sobra entra no TOPO da folha
 * seguinte, antes do que já está lá — é a continuação dela.
 */
export function aplicarDistribuicao(d: Distribuicao, ctx: ContextoMapa = {}): ResultadoMapa {
  // Plano: o X de cada revisão é config do documento, não do grupo — vem das colunas
  // medidas na 1ª folha. Âncora = borda esquerda da caixa da marca.
  const cfg = ctx.manutencao;
  const colunas = d.porFolha.flatMap((f) => f.grupos).find((g) => g.colunas?.length)?.colunas;
  if (cfg && colunas) {
    const n = Math.min(cfg.colunas.length, colunas.length);
    for (let i = 0; i < n; i++) cfg.colunas[i].x = +(colunas[i] - (cfg.iconMm || DEFAULT_ICON_MM) / 2).toFixed(2);
  }

  d.porFolha.forEach(({ page, grupos }) => {
    page.groups = grupos.map((g) => materializar(g, page, ctx));
    page.activeGroupId = page.groups[0]?.id ?? null;
  });

  const destino = d.destinoSobra ?? d.porFolha[d.porFolha.length - 1]?.page;
  if (destino && d.sobra.length) {
    const sobra = d.sobra.map((g) => materializar(g, destino, ctx));
    // A folha destino pode já ter estes grupos (sobra de um mapeamento anterior): tira
    // antes de pôr no topo, senão eles dobrariam.
    const resto = destino.groups.filter((g) => !sobra.includes(g));
    destino.groups = d.destinoSobra ? [...sobra, ...resto] : [...resto, ...sobra];
    destino.activeGroupId = destino.groups[0]?.id ?? null;
  }

  const posicionados = d.porFolha.reduce(
    (a, f) => a + f.grupos.reduce((s, g) => s + reais(g.campos).length, 0),
    0,
  );
  const continuam = d.sobra.reduce((a, g) => a + reais(g.campos).length, 0);
  return { posicionados, continuam, destinoSobra: d.destinoSobra };
}
