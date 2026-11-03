// Render das páginas do PDF em PNG, no servidor.
//
// Usa o mesmo pdfjs que o pdf-parse já carrega para extrair texto, então não entra
// dependência nova: nada de canvas nativo no servidor nem de worker no bundle do cliente.
//
// O render mora no servidor de propósito. O caminho natural seria renderizar no navegador
// e subir as imagens, mas o PDF é pequeno e as imagens não: mandar PNG de folha inteira
// para o cliente e de volta só gastaria banda. O PDF sobe uma vez e as páginas vão daqui
// direto para a API de visão.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

/** ~150 DPI em A4 (1240x1754): legível numa tabela densa sem estourar o payload. */
export const LARGURA_PADRAO_PX = 1240;

/** Teto de segurança: folha de pós-venda tem 1 a 3 páginas; dezenas seria engano. */
export const MAX_PAGINAS = 10;

let workerConfigurado = false;

function configurarWorker(): void {
  if (workerConfigurado) return;
  PDFParse.setWorker(
    pathToFileURL(
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
    ).href
  );
  workerConfigurado = true;
}

export interface PaginaRenderizada {
  pageNumber: number;
  mimeType: string;
  base64: string;
  width: number;
  height: number;
}

export interface RenderResult {
  paginas: PaginaRenderizada[];
  /** Total de páginas do PDF — maior que `paginas.length` quando o teto cortou. */
  total: number;
}

/**
 * Renderiza as páginas do PDF. `paginas` seleciona quais (1-based); ausente, vai até o
 * teto. A largura manda na escala: a altura sai pela proporção da página.
 */
export async function renderizarPaginas(
  buffer: Buffer,
  opts: { larguraPx?: number; paginas?: number[] } = {}
): Promise<RenderResult> {
  configurarWorker();

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const selecionadas = opts.paginas?.length
      ? opts.paginas.slice(0, MAX_PAGINAS)
      : Array.from({ length: MAX_PAGINAS }, (_, i) => i + 1);

    const res = await parser.getScreenshot({
      desiredWidth: opts.larguraPx ?? LARGURA_PADRAO_PX,
      imageDataUrl: false,
      partial: selecionadas,
    });

    return {
      total: res.total,
      paginas: res.pages.map((p) => ({
        pageNumber: p.pageNumber,
        mimeType: "image/png",
        base64: Buffer.from(p.data).toString("base64"),
        width: Math.round(p.width),
        height: Math.round(p.height),
      })),
    };
  } finally {
    await parser.destroy();
  }
}
