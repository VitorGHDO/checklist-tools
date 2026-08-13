// Desenho das marcações do docType "manutencao".
//
// Diferença essencial para os outros: o X vem da revisão selecionada (a coluna), não do
// marcador; e o TCPDF escreve o glifo com `writeHTMLCell(..., $largura_itens, $y, ...)`,
// que ancora pelo canto SUPERIOR ESQUERDO. Por isso a marcação é desenhada dentro de uma
// caixa de `iconMm` começando em (colunaX, markerY) — é onde o símbolo cai na folha.
//
// Os símbolos são os mesmos do PDF: ✓ (resposta 1) e X (resposta 3).

import { colunaPreview, colunasVisiveis, itemNaColuna } from "../manutencao";
import type { DesignerGroup, DesignerPage, ManutencaoConfig } from "../types";

const COR_CHECK = "#0BB783";
const COR_TRIANGULO = "#FFB822";
const COR_X = "#F64E60";
/** Tinta do glifo no canvas: o PDF imprime em preto, e a prévia segue a folha. */
const COR_GLIFO = "#111318";

/** Cor de apoio do tipo — usada no marcador de índice, não no glifo. */
export function corDoTipo(type: string | undefined): string {
  if (type === "2") return COR_TRIANGULO;
  if (type === "3") return COR_X;
  return COR_CHECK;
}

/** O mesmo símbolo que o PHP escreve: ✓ para 1, X para 3 (▲ sobrou de planos antigos). */
function glifoDoTipo(type: string | undefined): string {
  if (type === "3") return "✕";
  if (type === "2") return "▲";
  return "✓";
}

/**
 * Desenha a marcação como o PDF a imprime — glifo, não ícone. O halo branco por baixo é
 * o que mantém o símbolo legível quando ele cai em cima de uma linha da tabela.
 */
function desenharGlifo(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const corpo = Math.min(w, h);
  ctx.save();
  ctx.font = `700 ${Math.round(corpo * 1.1)}px ui-sans-serif, system-ui, "Segoe UI Symbol", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glifo = glifoDoTipo(type);
  ctx.lineWidth = Math.max(2, corpo * 0.22);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineJoin = "round";
  ctx.strokeText(glifo, cx, cy);
  ctx.fillStyle = COR_GLIFO;
  ctx.fillText(glifo, cx, cy);
  ctx.restore();
}

export function drawManutencaoGroupMarkers(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  page: DesignerPage,
  group: DesignerGroup,
  r: number,
  cfg: ManutencaoConfig,
  selectedMarkerId: string | null,
): void {
  const coluna = colunaPreview(cfg);
  const visiveis = colunasVisiveis(cfg);
  const iconW = (cfg.iconMm / page.widthMm) * cv.width;
  const iconH = (cfg.iconMm / page.heightMm) * cv.height;
  const x = coluna ? (coluna.x / page.widthMm) * cv.width : cv.width / 2;

  group.markers.forEach((m, idx) => {
    const y = m.fy * cv.height;
    const isSel = m.id === selectedMarkerId;
    // Item fora desta revisão continua visível, apagado: a linha existe na folha, o
    // que não existe é a marcação — é essa diferença que se confere aqui.
    const impresso = itemNaColuna(cfg, m, coluna?.id ?? null);

    // Linha da altura do item (só horizontal): é a referência para casar a marcação
    // com a linha impressa. Guia vertical de coluna não existe de propósito — cortava
    // a tabela inteira e atrapalhava mais do que ajudava.
    ctx.save();
    ctx.strokeStyle = isSel ? "rgba(242,169,74,0.9)" : "rgba(23,56,114,0.14)";
    ctx.lineWidth = Math.max(1, cv.width * 0.0009);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cv.width, y);
    ctx.stroke();
    ctx.restore();

    // Demais revisões (modo "ver todas"): mesma linha, X de cada coluna, esmaecidas
    // para não competir com a revisão em foco. Só a de foco leva número e seleção.
    visiveis.forEach((c) => {
      if (c.id === coluna?.id) return;
      const cx = (c.x / page.widthMm) * cv.width;
      const nesta = itemNaColuna(cfg, m, c.id);
      ctx.save();
      ctx.globalAlpha = nesta ? 0.45 : 0.12;
      desenharGlifo(ctx, m.type || "1", cx, y, iconW, iconH);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.setLineDash(nesta ? [] : [iconW * 0.3, iconW * 0.3]);
      ctx.strokeStyle = "rgba(70,78,95,0.35)";
      ctx.lineWidth = Math.max(1, cv.width * 0.0008);
      ctx.strokeRect(cx, y, iconW, iconH);
      ctx.restore();
    });

    ctx.save();
    if (!impresso) ctx.globalAlpha = 0.22;
    desenharGlifo(ctx, m.type || "1", x, y, iconW, iconH);
    ctx.restore();

    ctx.save();
    ctx.setLineDash(impresso ? [] : [iconW * 0.3, iconW * 0.3]);
    ctx.strokeStyle = isSel ? "rgba(242,169,74,0.95)" : "rgba(70,78,95,0.35)";
    ctx.lineWidth = Math.max(1, cv.width * (isSel ? 0.0016 : 0.0008));
    ctx.strokeRect(x, y, iconW, iconH);
    ctx.restore();

    const bx = x - r * 1.4;
    const by = y + iconH / 2;
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? "#f2a94a" : impresso ? corDoTipo(m.type) : "#c9c9d2";
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = `600 ${Math.round(r * 1.0)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(idx + 1), bx, by + 0.5);
  });
}
