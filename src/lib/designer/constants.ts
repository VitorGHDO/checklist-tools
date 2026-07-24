// Constantes do Designer de PDF — portadas verbatim do checklist_construtor.html
// para preservar a calibração TCPDF (não alterar sem revalidar contra o standalone).

/** Ajuste relativo (mm, eixo Y) de cada símbolo em relação ao "✓". */
export const DEFAULT_TYPE_OFFSETS = { check: 0, x: 0.45, na: 0.74 };

/** Raio do marcador relativo à largura do canvas. */
export const MARKER_R_FRAC = 0.0065;

// Compensação fixa do TCPDF na Revisão de Entrega (baseada no PDF real):
// o X das colunas sai ~0.34mm à direita do ideal e o Y ~0.6mm acima.
// Aplicada automaticamente só no código exportado (não no canvas).
export const REVISAO_X_OFFSET = -0.34;
export const REVISAO_Y_OFFSET = 0.6;

/** Largura fixa (mm) da célula exportada no pós-venda (independe da caixa visual). */
export const POSVENDA_EXPORT_W = 30;
export const POSVENDA_EXPORT_H = 5;
