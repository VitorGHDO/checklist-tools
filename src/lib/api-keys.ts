import type { AIProvider } from "@/lib/types";

const KEY_MAP: Record<AIProvider, string> = {
  gemini: "checklist_tools_api_key_gemini",
  openai: "checklist_tools_api_key_openai",
  anthropic: "checklist_tools_api_key_anthropic",
};

const LEGACY_KEY = "checklist_tools_api_key";

function detectLegacyProvider(key: string): AIProvider {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-")) return "openai";
  return "gemini";
}

/** Migra a chave legada (única) para a chave do provedor correto e remove a antiga. */
export function migrateLegacyKey(): void {
  if (typeof window === "undefined") return;
  const stored = localStorage.getItem(LEGACY_KEY);
  if (!stored) return;
  try {
    const decoded = atob(stored);
    const provider = detectLegacyProvider(decoded);
    if (!localStorage.getItem(KEY_MAP[provider])) {
      localStorage.setItem(KEY_MAP[provider], stored);
    }
  } catch {
    // chave legada corrompida — apenas remover
  }
  localStorage.removeItem(LEGACY_KEY);
}

/** Retorna a chave decodificada para o provedor, ou null se não estiver configurada. */
export function getApiKey(provider: AIProvider): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(KEY_MAP[provider]);
  if (!stored) return null;
  try {
    return atob(stored);
  } catch {
    return null;
  }
}

/** Salva a chave (base64) para o provedor. */
export function saveApiKey(provider: AIProvider, key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_MAP[provider], btoa(key.trim()));
}

/** Remove a chave do provedor. */
export function removeApiKey(provider: AIProvider): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_MAP[provider]);
}

/** Retorna true se o provedor tem chave configurada. */
export function hasApiKey(provider: AIProvider): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(KEY_MAP[provider]);
}
