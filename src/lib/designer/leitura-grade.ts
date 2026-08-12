// Leitura da hachura da folha: descobre, olhando o JPG de fundo, em quais revisões cada
// item é impresso. A tabela do plano só tem dois tons no miolo — célula branca (a
// marcação cai ali) e célula cinza (aquela revisão não cobre o item) —, então basta
// amostrar o cruzamento de cada linha com cada coluna e separar os dois grupos.
//
// O que torna isso viável aqui: o X de cada revisão e o Y de cada item já estão
// calibrados no projeto, e o fundo é uma data URL (canvas não fica "tainted", getImageData
// funciona). Módulo puro: recebe o bitmap pronto, não toca no DOM.

import { mascaraDoItem } from "./manutencao";
import type { DesignerGroup, DesignerPage, ManutencaoConfig, Marker } from "./types";

/** O suficiente do ImageData para amostrar — permite testar sem DOM. */
export interface BitmapLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | number[];
}

export interface AmostraCelula {
  markerId: string;
  colunaId: string;
  /** Luminância mediana (0..255) do miolo da célula. */
  valor: number;
}

export interface ItemDaFolha {
  group: DesignerGroup;
  marker: Marker;
}

/** Fração da célula ignorada de cada lado — as bordas da tabela moram aí. */
const MARGEM = 0.22;
/** Fração do contraste da folha abaixo da qual a célula é "não sei dizer". Proporcional,
 *  e não um número fixo: entre branco (255) e o cinza da hachura (~217) sobram menos de
 *  40 níveis, e uma margem fixa marcaria a folha inteira como duvidosa. */
const FRACAO_DUVIDA = 0.15;
const MARGEM_DUVIDA_MINIMA = 4;
/** Separação mínima entre os dois tons para a folha ser considerada legível. */
const CONTRASTE_MINIMO = 25;

function luminancia(data: BitmapLike["data"], i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/**
 * Mediana da luminância no retângulo (em pixels). Mediana e não média porque uma linha
 * preta da tabela cruzando a janela puxaria a média para baixo e transformaria uma
 * célula branca em cinza — a mediana ignora essa minoria escura.
 */
export function medianaRetangulo(
  img: BitmapLike,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number | null {
  const xa = Math.max(0, Math.floor(Math.min(x0, x1)));
  const xb = Math.min(img.width - 1, Math.ceil(Math.max(x0, x1)));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1)));
  const yb = Math.min(img.height - 1, Math.ceil(Math.max(y0, y1)));
  if (xb < xa || yb < ya) return null;

  // Amostragem esparsa: em folha de 300dpi a célula tem milhares de pixels e a mediana
  // de ~200 já é estável.
  const passoX = Math.max(1, Math.floor((xb - xa + 1) / 16));
  const passoY = Math.max(1, Math.floor((yb - ya + 1) / 16));
  const vals: number[] = [];
  for (let y = ya; y <= yb; y += passoY) {
    for (let x = xa; x <= xb; x += passoX) {
      vals.push(luminancia(img.data, (y * img.width + x) * 4));
    }
  }
  if (vals.length === 0) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

/**
 * Uma amostra por cruzamento item × revisão desta folha.
 *
 * O ponto amostrado é o MIOLO da célula, não o `fy` do marcador: o Y do marcador é onde
 * o glifo começa a ser escrito (canto superior), então o centro da linha fica meio
 * incremento abaixo. Na horizontal, a célula vai do X da revisão até o X da seguinte.
 */
export function amostrasDaFolha(
  img: BitmapLike,
  page: DesignerPage,
  cfg: ManutencaoConfig,
  itens: ItemDaFolha[],
): AmostraCelula[] {
  const pxPorMmX = img.width / page.widthMm;
  const pxPorMmY = img.height / page.heightMm;
  const passos = cfg.colunas.map((c, i) =>
    i + 1 < cfg.colunas.length ? cfg.colunas[i + 1].x - c.x : NaN,
  );
  const passoMedio =
    passos.filter((p) => !isNaN(p) && p > 0).reduce((a, b) => a + b, 0) /
      Math.max(1, passos.filter((p) => !isNaN(p) && p > 0).length) || 8;

  const out: AmostraCelula[] = [];
  itens.forEach(({ group, marker }) => {
    const alturaMm = group.increment > 0 ? Math.min(group.increment, 8) : 5.4;
    const yTopoMm = marker.fy * page.heightMm + (page.offsetY || 0);
    const yCentro = (yTopoMm + alturaMm / 2) * pxPorMmY;
    const meiaAltura = (alturaMm * (0.5 - MARGEM)) * pxPorMmY;

    cfg.colunas.forEach((col, i) => {
      const larguraMm = !isNaN(passos[i]) && passos[i] > 0 ? passos[i] : passoMedio;
      const xCentro = (col.x + larguraMm / 2) * pxPorMmX;
      const meiaLargura = (larguraMm * (0.5 - MARGEM)) * pxPorMmX;
      const valor = medianaRetangulo(
        img,
        xCentro - meiaLargura,
        yCentro - meiaAltura,
        xCentro + meiaLargura,
        yCentro + meiaAltura,
      );
      if (valor === null) return;
      out.push({ markerId: marker.id, colunaId: col.id, valor });
    });
  });
  return out;
}

/**
 * Limiar de Otsu: acha o corte que melhor separa dois grupos de tons. Usar o histograma
 * da própria folha, em vez de um número fixo, é o que faz a leitura funcionar tanto num
 * JPG mais claro quanto num mais escuro.
 */
export function otsu(valores: number[]): number {
  const hist = new Array(256).fill(0);
  valores.forEach((v) => hist[Math.max(0, Math.min(255, Math.round(v)))]++);
  const total = valores.length;
  if (total === 0) return 128;

  let somaTotal = 0;
  for (let t = 0; t < 256; t++) somaTotal += t * hist[t];

  let somaFundo = 0;
  let pesoFundo = 0;
  let melhorVar = -1;
  // Com dois tons bem separados, TODO limiar entre eles empata na variância. Guardar o
  // trecho empatado e ficar com o meio dele afasta o corte dos dois tons — é isso que
  // impede as células de nascerem todas "duvidosas".
  let inicio = 128;
  let fim = 128;
  for (let t = 0; t < 256; t++) {
    pesoFundo += hist[t];
    if (pesoFundo === 0) continue;
    const pesoFrente = total - pesoFundo;
    if (pesoFrente === 0) break;
    somaFundo += t * hist[t];
    const mediaFundo = somaFundo / pesoFundo;
    const mediaFrente = (somaTotal - somaFundo) / pesoFrente;
    const entre = pesoFundo * pesoFrente * (mediaFundo - mediaFrente) ** 2;
    if (entre > melhorVar) {
      melhorVar = entre;
      inicio = t;
      fim = t;
    } else if (entre === melhorVar) {
      fim = t;
    }
  }
  return Math.round((inicio + fim) / 2);
}

export interface LeituraItem {
  /** Revisões lidas como célula clara — o item é impresso nelas. */
  claras: string[];
  /** Células cujo tom ficou colado no limiar: valem conferência. */
  duvidosas: string[];
  /** A leitura diverge do que já está marcado na grade? */
  diferente: boolean;
}

export interface LeituraGrade {
  porItem: Map<string, LeituraItem>;
  limiar: number;
  total: number;
  duvidosas: number;
  itensDiferentes: number;
  /** Folha sem dois tons distintos — leitura não confiável, nada a propor. */
  semContraste: boolean;
}

/** Separa as amostras em claro/escuro e monta a proposta por item. */
export function classificarAmostras(
  amostras: AmostraCelula[],
  cfg: ManutencaoConfig,
  markerPorId: Map<string, Marker>,
): LeituraGrade {
  const vazio: LeituraGrade = {
    porItem: new Map(),
    limiar: 0,
    total: 0,
    duvidosas: 0,
    itensDiferentes: 0,
    semContraste: true,
  };
  if (amostras.length === 0) return vazio;

  const valores = amostras.map((a) => a.valor);
  const limiar = otsu(valores);
  const claros = valores.filter((v) => v > limiar);
  const escuros = valores.filter((v) => v <= limiar);
  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  // Folha inteira do mesmo tom (nenhuma hachura, ou fundo ilegível): não há o que propor.
  if (claros.length === 0 || escuros.length === 0 || media(claros) - media(escuros) < CONTRASTE_MINIMO) {
    return { ...vazio, limiar, total: amostras.length };
  }

  const margemDuvida = Math.max(
    MARGEM_DUVIDA_MINIMA,
    (media(claros) - media(escuros)) * FRACAO_DUVIDA,
  );
  const porItem = new Map<string, LeituraItem>();
  let duvidosas = 0;
  amostras.forEach((a) => {
    const atual = porItem.get(a.markerId) ?? { claras: [], duvidosas: [], diferente: false };
    if (a.valor > limiar) atual.claras.push(a.colunaId);
    if (Math.abs(a.valor - limiar) < margemDuvida) {
      atual.duvidosas.push(a.colunaId);
      duvidosas += 1;
    }
    porItem.set(a.markerId, atual);
  });

  let itensDiferentes = 0;
  porItem.forEach((leitura, markerId) => {
    const marker = markerPorId.get(markerId);
    if (!marker) return;
    const antes = mascaraDoItem(cfg, marker).join("|");
    // A leitura sai na ordem das colunas, então basta comparar as chaves.
    const depois = cfg.colunas
      .filter((c) => leitura.claras.includes(c.id))
      .map((c) => c.id)
      .join("|");
    leitura.diferente = antes !== depois;
    if (leitura.diferente) itensDiferentes += 1;
  });

  return {
    porItem,
    limiar,
    total: amostras.length,
    duvidosas,
    itensDiferentes,
    semContraste: false,
  };
}
