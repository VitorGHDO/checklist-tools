import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}


/**
 * Limpa o texto extraído do PDF do projeto "Entrega Impecável".
 * Descarta o cabeçalho com dados do veículo/cliente e mantém apenas os
 * títulos de seção e os itens do checklist.
 */
export function cleanEntregaImpecavelText(raw: string): string {
  const lines = raw.split("\n");

  // Localiza o índice da primeira seção do checklist
  // Ex: "1 INFORMAÇÃO TÉCNICA | DOCUMENTOS E MANUAIS STATUS"
  const firstSectionIdx = lines.findIndex((l) =>
    /^\d+\s+\S.+STATUS\s*$/i.test(l.trim())
  );

  // Se não achou nenhuma seção, devolve o texto sem alteração
  if (firstSectionIdx === -1) return raw.trim();

  const result: string[] = [];

  for (const rawLine of lines.slice(firstSectionIdx)) {
    const line = rawLine.trim();

    // Ignora linhas vazias ou apenas com traços/underscores/espaços
    if (!line || /^[-_=\s]+$/.test(line)) continue;

    // Título de seção — mantém como está
    if (/^\d+\s+\S.+STATUS\s*$/i.test(line)) {
      result.push(line);
      continue;
    }

    // Remove todos os símbolos não alfanuméricos do início da linha
    // (●, ★, •, ■, ▪, -, * etc.) e qualquer espaço residual
    const stripped = line.replace(/^[^\p{L}\p{N}"(]+/u, "").trim();

    if (stripped.length > 3) {
      result.push(stripped);
    }
  }

  return result.join("\n");
}
