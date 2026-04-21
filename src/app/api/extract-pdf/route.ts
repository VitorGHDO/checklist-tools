import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

const pdfWorkerSrc = pathToFileURL(
  path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
).href;

PDFParse.setWorker(pdfWorkerSrc);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Nenhum arquivo PDF enviado" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "O arquivo enviado não é um PDF válido" },
        { status: 400 }
      );
    }

    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "Arquivo muito grande. Máximo: 50MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const textResult = await parser.getText();

      // Build per-page text array
      let pages: string[] = [];
      if (textResult.pages && textResult.pages.length > 0) {
        pages = textResult.pages
          .map((p) => p.text.trim())
          .filter((p) => p.length > 0);
      }

      const fullText = textResult.text?.trim() || pages.join("\n\n");
      const hasText = fullText.length > 30;

      let info;
      try {
        const infoResult = await parser.getInfo();
        info = {
          numPages: infoResult.pages,
          title: infoResult.info?.Title,
          author: infoResult.info?.Author,
        };
      } catch {
        info = { numPages: pages.length };
      }

      return NextResponse.json({
        success: true,
        text: fullText,
        pages,
        pageCount: pages.length,
        method: "pdf-parse",
        hasText,
        info,
      });
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    console.error("Erro ao extrair texto do PDF:", error);
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      { success: false, error: `Erro na extração: ${message}` },
      { status: 500 }
    );
  }
}
