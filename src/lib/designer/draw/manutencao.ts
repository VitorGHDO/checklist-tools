// Desenho das marcações do docType "manutencao".
//
// Diferença essencial para os outros: o X vem da revisão selecionada (a coluna), não
// do marcador; e o TCPDF imprime a marcação com `$pdf->Image($img, $x, $y, 3, 3)`, que
// ancora a imagem pelo canto SUPERIOR ESQUERDO. Por isso o marcador é desenhado como
// um quadrado de `iconMm` começando em (colunaX, markerY) — é o que sai na folha.

import { colunaPreview, colunasVisiveis, itemNaColuna } from "../manutencao";
import type { DesignerGroup, DesignerPage, ManutencaoConfig } from "../types";

const COR_BOLA = "#0BB783";
const COR_TRIANGULO = "#FFB822";
const COR_X = "#F64E60";

export function corDoTipo(type: string | undefined): string {
  if (type === "2") return COR_TRIANGULO;
  if (type === "3") return COR_X;
  return COR_BOLA;
}

function desenharIcone(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.lineWidth = Math.max(1.5, w * 0.14);
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = corDoTipo(type);
  if (type === "2") {
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  } else if (type === "3") {
    ctx.strokeStyle = corDoTipo(type);
    ctx.lineWidth = Math.max(2, w * 0.22);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
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
      desenharIcone(ctx, m.type || "1", cx, y, iconW, iconH);
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
    desenharIcone(ctx, m.type || "1", x, y, iconW, iconH);
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
