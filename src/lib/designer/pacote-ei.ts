// Pacote do Entrega Impecável (roteiro, revisão) para o Claude Code: o que o Designer
// mapeou, gravado na pasta da versão do checklist no stellantis-ei-checklist. A skill
// `checklist-designer` daquele repositório encaixa isso no imprimir.php.
//
// Por que a skill e não o Designer escrevendo o imprimir.php: cada imprimir.php tem uma
// estrutura própria (funções antes ou depois dos fundos, printChecklistMark já definido) e
// encaixar o trecho às cegas quebra o arquivo. As posições, porém, já estão resolvidas
// aqui — a skill só copia a versão anterior e troca as coordenadas, sem medir a arte.
//
// Os Y são o CENTRO da linha (mm na folha), sem os descontos do export do Designer: a
// fórmula de cada imprimir.php é dele (ex.: posY = centroY − 1.5 na revisão).
//
// Módulo puro: monta o objeto; quem grava é /api/gravar-repositorio (lib/repositorio.ts).

import { parseQueueNames } from "./migration-parse";
import type { DesignerDocType, DesignerGroup, DesignerPage, HeaderField } from "./types";

export interface GrupoEI {
  folha: number;
  titulo: string;
  /** Saiu do mapear/medir (Y lido na arte) ou do passo regular (chute). */
  medido: boolean;
  itens: { campo: string; y: number; tipo?: string }[];
  /** Colunas de marcação, centro (mm): revisão = ✓ ✗ N.A.; roteiro = a coluna única. A
   *  largura da célula não vai: a do Designer é padrão, não medida — vale a do imprimir.php. */
  colunas: number[];
}

export interface PacoteEI {
  versao: 1;
  gerado: string;
  docType: DesignerDocType;
  /** Pasta do checklist (ex.: stellantis/ram/roteiro_entrega_tecnica_1500). */
  checklist: string;
  /** Subpasta da versão onde vai o imprimir.php (ex.: v3). */
  pastaVersao: string;
  folhas: { arquivo: string; larguraMm: number; alturaMm: number }[];
  grupos: GrupoEI[];
  /** Campos de cabeçalho/rodapé posicionados no Designer, como estão no projeto. */
  cabecalho: { folha: "cabecalho" | "rodape"; campos: HeaderField[] }[];
}

/** Docs que vão por este pacote. */
export function usaPacoteEI(docType: DesignerDocType): boolean {
  return docType === "roteiro" || docType === "revisao";
}

function colunasDo(g: DesignerGroup): number[] {
  if (g.docType === "revisao") {
    return [g.colX1, g.colX2, g.colX3].filter((x): x is number => x !== undefined).map((x) => +x.toFixed(2));
  }
  return [+g.xFixed.toFixed(2)];
}

export function montarPacoteEI(
  pages: DesignerPage[],
  docType: DesignerDocType,
  checklist: string,
  pastaVersao: string,
  prefixoArte: string,
): PacoteEI {
  const folhas = pages.filter((p) => p.kind === "checklist" && p.docType === docType);
  const cabecalhos = pages.filter((p) => p.kind === "header" && p.docType === docType && p.headerFields.length);
  const grupos: GrupoEI[] = [];
  folhas.forEach((page, i) => {
    page.groups.forEach((g) => {
      const fila = parseQueueNames(g.queue);
      grupos.push({
        folha: i + 1,
        titulo: g.title,
        medido: !!g.markersManual,
        itens: g.markers
          .filter((m) => !m.mirrorNext)
          .map((m, k) => ({
            campo: m.label || fila[k] || `campo_${k + 1}`,
            y: +(m.fy * page.heightMm).toFixed(2),
            ...(m.tipo === "texto" ? { tipo: "texto" } : {}),
          })),
        colunas: colunasDo(g),
      });
    });
  });
  return {
    versao: 1,
    gerado: new Date().toISOString(),
    docType,
    checklist,
    pastaVersao,
    folhas: folhas.map((p, i) => ({
      arquivo: `checklist_modelos/${prefixoArte}_${i + 1}.${/^data:image\/png/i.test(p.imageSrc ?? "") ? "png" : "jpg"}`,
      larguraMm: p.widthMm,
      alturaMm: p.heightMm,
    })),
    grupos,
    cabecalho: cabecalhos.map((p) => ({ folha: p.footerLike ? "rodape" : "cabecalho", campos: p.headerFields })),
  };
}
