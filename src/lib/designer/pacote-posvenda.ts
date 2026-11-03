// Pacote do pós-venda para o Claude Code: o que o Designer já sabe do checklist, gravado
// na pasta dele no acampa-checklist (pos_venda.json + as artes). A skill
// `checklist-pos-venda` daquele repositório parte daqui.
//
// Pós-venda não tem padrão de folha: o mapear do Designer acerta as caixas, mas o layout
// de cada cliente pede decisões que a skill toma melhor no repositório. O pacote existe
// para ela não gastar tokens redescobrindo o que o Designer já tem — campos na ordem do
// formulário, etapas, opções e, quando o grupo foi mapeado, as posições medidas.
//
// Módulo puro: monta o objeto; quem grava é /api/gravar-repositorio (lib/repositorio.ts).

import { parseQueueNames } from "./migration-parse";
import { baseTitleOf } from "./paging";
import type { DesignerGroup, DesignerPage } from "./types";

const SEP = " > ";

export interface GrupoDoPacote {
  /** Folha (1-based) em que o grupo está no Designer; null = veio do extrator e a skill
   *  localiza o bloco na arte pelo título da seção. */
  folha: number | null;
  titulo: string;
  etapa: string;
  secao: string;
  opcoes: { valor: string; rotulo: string }[];
  /**
   * false = as opções são só o padrão do Designer (OK / N-OK / NA = 1, 3, 0), que ninguém
   * ajustou — o Designer nem tem valor "2" (B/M/R). Aí a skill lê as opções na legenda da
   * arte em vez de confiar nelas.
   */
  opcoesConfirmadas: boolean;
  /** Campos na ordem do formulário. "-" marca linha impressa sem pergunta. */
  campos: string[];
  /** Só nos grupos mapeados: centro (mm) de cada opção e Y (mm) de cada item. */
  posicoes?: { x: Record<string, number>; ys: number[] };
}

export interface PacotePosVenda {
  versao: 1;
  gerado: string;
  checklist: string;
  pasta: string;
  folhas: { arquivo: string; larguraMm: number; alturaMm: number }[];
  etapas: string[];
  grupos: GrupoDoPacote[];
}

function partes(titulo: string): { etapa: string; secao: string } {
  const t = baseTitleOf(titulo);
  const i = t.indexOf(SEP);
  return i < 0 ? { etapa: "", secao: t.trim() } : { etapa: t.slice(0, i).trim(), secao: t.slice(i + SEP.length).trim() };
}

/** Opções do pós-venda que o Designer cria sozinho — sem ajuste, não dizem nada da folha. */
const OPCOES_PADRAO = [
  { valor: "1", rotulo: "OK" },
  { valor: "3", rotulo: "N/OK" },
  { valor: "0", rotulo: "NA" },
];

function ehOpcaoPadrao(opcoes: { valor: string; rotulo: string }[]): boolean {
  return opcoes.every((o, i) => o.valor === OPCOES_PADRAO[i]?.valor && o.rotulo === OPCOES_PADRAO[i]?.rotulo);
}

/**
 * Pacote direto do extrator, sem passar pelo Designer: os campos já vêm na ordem do
 * formulário e com "Etapa > SEÇÃO" no `secao` (é assim que o pós-venda os expande). Não há
 * folha nem opções — a skill localiza cada bloco na arte e lê as opções na legenda.
 */
export function montarPacoteDoExtrator(
  campos: { campo: string; secao?: string }[],
  checklist: string,
  pasta: string,
  artes: { arquivo: string }[],
): PacotePosVenda {
  const grupos: GrupoDoPacote[] = [];
  const etapas: string[] = [];
  for (const c of campos) {
    const titulo = (c.secao ?? "").trim() || "SEM SEÇÃO";
    let g = grupos[grupos.length - 1];
    if (!g || g.titulo !== titulo) {
      const { etapa, secao } = partes(titulo);
      if (etapa && !etapas.includes(etapa)) etapas.push(etapa);
      g = { folha: null, titulo, etapa, secao, opcoes: [], opcoesConfirmadas: false, campos: [] };
      grupos.push(g);
    }
    g.campos.push(c.campo);
  }
  return {
    versao: 1,
    gerado: new Date().toISOString(),
    checklist,
    pasta,
    folhas: artes.map((a) => ({ arquivo: a.arquivo, larguraMm: 210, alturaMm: 297 })),
    etapas,
    grupos,
  };
}

/**
 * O que o pacote tem de suspeito, para o modal avisar antes de gravar: grupos todos numa
 * folha só quando há várias, e grupos com as opções padrão.
 */
export function avisosDoPacote(pacote: PacotePosVenda): string[] {
  const avisos: string[] = [];
  const folhasUsadas = new Set(pacote.grupos.flatMap((g) => (g.folha === null ? [] : [g.folha])));
  if (pacote.folhas.length > 1 && folhasUsadas.size === 1) {
    avisos.push(
      `Todos os grupos estão na Folha ${[...folhasUsadas][0]}, e há ${pacote.folhas.length} folhas. Ponha cada grupo na folha da arte em que ele aparece.`,
    );
  }
  const padrao = pacote.grupos.filter((g) => !g.opcoesConfirmadas).length;
  if (padrao) {
    avisos.push(
      `${padrao} grupo(s) com as opções padrão (OK/N-OK/NA). Ajuste no grupo, ou a skill lê as opções na legenda da arte.`,
    );
  }
  return avisos;
}

function camposDo(g: DesignerGroup): string[] {
  const fila = parseQueueNames(g.queue);
  return fila.length ? fila : g.markers.filter((m) => !m.mirrorNext).map((m) => m.label);
}

/** Extensão do arquivo a partir da data URL da arte. */
export function extensaoDaArte(dataUrl: string): "jpg" | "png" {
  return /^data:image\/png/i.test(dataUrl) ? "png" : "jpg";
}

export function folhasDoPosVenda(pages: DesignerPage[]): DesignerPage[] {
  return pages.filter((p) => p.kind === "checklist" && p.docType === "posvenda");
}

export function montarPacotePosVenda(pages: DesignerPage[], checklist: string, pasta: string): PacotePosVenda {
  const folhas = folhasDoPosVenda(pages);
  const etapas: string[] = [];
  const grupos: GrupoDoPacote[] = [];
  folhas.forEach((page, i) => {
    page.groups.forEach((g) => {
      const { etapa, secao } = partes(g.title);
      if (etapa && !etapas.includes(etapa)) etapas.push(etapa);
      const opcoes = (g.posvendaOpts ?? []).map((o) => ({ valor: o.valor, rotulo: o.label }));
      const grupo: GrupoDoPacote = {
        folha: i + 1,
        titulo: g.title,
        etapa,
        secao,
        opcoes,
        opcoesConfirmadas: !ehOpcaoPadrao(opcoes),
        campos: camposDo(g),
      };
      // Posição só vai quando foi medida (mapear/medir linhas): a do passo regular é
      // chute e levaria a skill a confiar num número errado.
      if (g.markersManual && g.markers.length) {
        const x: Record<string, number> = {};
        opcoes.forEach((o) => {
          const v = g.posvendaXMode === "diff" ? g.optX?.[o.valor] : g.xFixed;
          if (v !== undefined) x[o.valor] = +v.toFixed(2);
        });
        grupo.posicoes = { x, ys: g.markers.filter((m) => !m.mirrorNext).map((m) => +(m.fy * page.heightMm).toFixed(2)) };
      }
      grupos.push(grupo);
    });
  });
  return {
    versao: 1,
    gerado: new Date().toISOString(),
    checklist,
    pasta,
    folhas: folhas.map((p, i) => ({
      arquivo: `checklist_modelos/folha_mod_1_${i + 1}.${p.imageSrc ? extensaoDaArte(p.imageSrc) : "jpg"}`,
      larguraMm: p.widthMm,
      alturaMm: p.heightMm,
    })),
    etapas,
    grupos,
  };
}
