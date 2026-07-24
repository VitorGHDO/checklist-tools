"use client";

import { useState } from "react";
import { Copy, Download, FileCode, Files } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { generateAllPagesCode, generateCodeForPage, type ExportFmt } from "@/lib/designer/export-php";
import type { DesignerPage, EditorState } from "@/lib/designer/types";

interface Props {
  st: EditorState;
  page: DesignerPage;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ st, page }: Props) {
  const [fmt, setFmt] = useState<ExportFmt>("campos");
  const [prec, setPrec] = useState(2);
  const [includeFunc, setIncludeFunc] = useState(true);

  const code = generateCodeForPage(st.pages, page, fmt, prec, includeFunc);
  const isHeader = page.kind === "header";

  return (
    <div className="border-t border-[#e8e8e8] p-4 space-y-2.5">
      <h2 className="text-[10.5px] uppercase tracking-wider text-[#80808F] font-semibold flex items-center gap-1.5">
        <FileCode className="w-3.5 h-3.5 text-[#FFB822]" />
        Exportar PHP
      </h2>

      {!isHeader && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={fmt}
            onChange={(e) => setFmt(e.target.value as ExportFmt)}
            className="bg-white border border-[#d0d0d0] rounded px-2 py-1 text-[11px] flex-1 min-w-0"
          >
            <option value="campos">$campos + $posY += incremento (original)</option>
            <option value="y">nome → y (array explícito)</option>
            <option value="xy">nome → x, y (posição completa)</option>
          </select>
          <select
            value={prec}
            onChange={(e) => setPrec(parseInt(e.target.value, 10))}
            className="bg-white border border-[#d0d0d0] rounded px-2 py-1 text-[11px]"
          >
            <option value={1}>1 casa</option>
            <option value={2}>2 casas</option>
            <option value={3}>3 casas</option>
          </select>
        </div>
      )}

      {!isHeader && (
        <label className="flex items-center gap-2 text-[11px] text-[#80808F] cursor-pointer">
          <input type="checkbox" checked={includeFunc} onChange={(e) => setIncludeFunc(e.target.checked)} />
          incluir a definição da função de marcação (só na 1ª folha)
        </label>
      )}

      <pre className="bg-[#0a0d11] text-[#c9d6c0] border border-[#e0e0e0] rounded-lg p-3 text-[10.5px] font-mono leading-relaxed overflow-auto max-h-72 whitespace-pre">
        {code}
      </pre>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            showToast("Código copiado!", "success");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#173872] hover:bg-[#122d5e] text-white text-xs font-medium"
        >
          <Copy className="w-3.5 h-3.5" />
          Copiar
        </button>
        <button
          onClick={() => downloadText(page.name.replace(/\s+/g, "_") + "_posicoes.php", "<?php\n" + code + "\n")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          Baixar .php
        </button>
        <button
          onClick={() => {
            const all = generateAllPagesCode(st.pages, page.docType, fmt, prec, includeFunc);
            downloadText("todas_as_paginas_posicoes.php", "<?php\n\n" + all + "\n");
            showToast("Gerado o PHP de todas as páginas.", "success");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-xs"
          title="Gera o PHP de todas as páginas deste tipo de documento"
        >
          <Files className="w-3.5 h-3.5" />
          Gerar tudo
        </button>
      </div>
    </div>
  );
}
