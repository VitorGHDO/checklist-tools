"use client";

import { useState, useCallback } from "react";
import { Upload, X, FileText, Copy, Trash2, Loader2 } from "lucide-react";
import { DropZone } from "@/components/ui/drop-zone";
import { showToast } from "@/components/ui/toast";
import { formatFileSize } from "@/lib/utils";

interface Props {
  onTextExtracted: (text: string, pages: string[]) => void;
}

export function PdfUploadStep({ onTextExtracted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  const handleFile = useCallback(
    (files: FileList) => {
      const f = files[0];
      if (!f) return;
      if (f.type !== "application/pdf") {
        showToast("Selecione um arquivo PDF válido.", "error");
        return;
      }
      if (f.size > 50 * 1024 * 1024) {
        showToast("Arquivo muito grande. Máximo: 50MB", "error");
        return;
      }
      setFile(f);
    },
    []
  );

  const clearFile = useCallback(() => {
    setFile(null);
    setExtractedText("");
    setPages([]);
    onTextExtracted("", []);
  }, [onTextExtracted]);

  const extractText = useCallback(async () => {
    if (!file) return;
    setIsExtracting(true);

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const res = await fetch("/api/extract-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setExtractedText(data.text);
        setPages(data.pages || []);
        onTextExtracted(data.text, data.pages || []);
        showToast(
          `Texto extraído! ${data.pageCount} página(s) via ${data.method}`,
          "success"
        );
      } else {
        showToast("Erro: " + data.error, "error");
      }
    } catch (err) {
      showToast("Erro ao comunicar com o servidor", "error");
      console.error(err);
    } finally {
      setIsExtracting(false);
    }
  }, [file, onTextExtracted]);

  const copyText = useCallback(() => {
    navigator.clipboard.writeText(extractedText);
    showToast("Texto copiado!", "success");
  }, [extractedText]);

  const clearText = useCallback(() => {
    setExtractedText("");
    setPages([]);
    onTextExtracted("", []);
  }, [onTextExtracted]);

  const stats = {
    chars: extractedText.length,
    words: extractedText.trim()
      ? extractedText.trim().split(/\s+/).length
      : 0,
    lines: extractedText ? extractedText.split("\n").length : 0,
    pages: pages.length,
  };

  return (
    <div className="space-y-4">
      {!file ? (
        <DropZone
          onFileDrop={handleFile}
          accept=".pdf"
          icon={<Upload className="w-10 h-10" />}
          label="Arraste um PDF aqui ou clique para selecionar"
          hint="Aceita .pdf (máx. 50MB)"
        />
      ) : (
        <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
          <FileText className="w-5 h-5 text-red-400" />
          <span className="flex-1 truncate">{file.name}</span>
          <span className="text-gray-400 text-sm">
            {formatFileSize(file.size)}
          </span>
          <button
            onClick={clearFile}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {file && (
        <button
          onClick={extractText}
          disabled={isExtracting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-400 font-medium transition-colors"
        >
          {isExtracting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          {isExtracting ? "Extraindo..." : "Extrair Texto"}
        </button>
      )}

      {extractedText && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-300">Texto Extraído</h3>
            <div className="flex gap-2">
              <button
                onClick={copyText}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </button>
              <button
                onClick={clearText}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar
              </button>
            </div>
          </div>

          <textarea
            value={extractedText}
            onChange={(e) => {
              setExtractedText(e.target.value);
              onTextExtracted(e.target.value, pages);
            }}
            rows={12}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />

          <div className="flex gap-4 text-xs text-gray-500">
            <span>{stats.chars} caracteres</span>
            <span>{stats.words} palavras</span>
            <span>{stats.lines} linhas</span>
            <span>{stats.pages} páginas</span>
          </div>
        </div>
      )}
    </div>
  );
}
