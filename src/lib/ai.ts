// Infra compartilhada dos endpoints de IA (provedor único: Anthropic / Claude).

const RETRYABLE_CODES = [503, 529];
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000;

/** Reexecuta `fn` com backoff linear para erros transitórios (503/529). */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = RETRYABLE_CODES.some((code) => msg.includes(`[${code}`));
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      const delay = BASE_DELAY_MS * attempt;
      console.warn(`Tentativa ${attempt} falhou (retryable). Aguardando ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/** Valida a chave Anthropic. Retorna a mensagem de erro, ou null se estiver ok. */
export function assertAnthropicKey(apiKey: string): string | null {
  if (!apiKey) return "API Key não fornecida";
  if (!apiKey.startsWith("sk-ant-")) {
    return "Formato de API Key Anthropic inválido (deve começar com sk-ant-)";
  }
  return null;
}

/** Extrai o status HTTP de um erro do SDK Anthropic (expõe `.status`). */
function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/**
 * Converte erros crípticos do provedor em mensagens claras, preservando o
 * status HTTP real (ex.: a Anthropic pode reportar apenas "401 terminated"
 * ao rejeitar a chave durante um upload grande de imagem).
 */
export function friendlyErrorMessage(error: unknown): { message: string; status: number } {
  const rawMessage = error instanceof Error ? error.message : "Erro desconhecido";
  const status = getErrorStatus(error);
  const label = "Anthropic (Claude)";

  if (status === 401) {
    return {
      message: `Chave de API da ${label} inválida, expirada ou sem créditos/billing habilitado. Verifique a chave configurada e tente novamente.`,
      status: 401,
    };
  }
  if (status === 403) {
    return {
      message: `Acesso negado pela ${label} (403). A chave pode não ter permissão para este modelo, ou a conta/região não é suportada.`,
      status: 403,
    };
  }
  if (status === 429) {
    return {
      message: `Limite de requisições/cota excedido na ${label} (429). Aguarde alguns instantes ou verifique sua cota/billing.`,
      status: 429,
    };
  }
  if (status === 404) {
    return {
      message: `Modelo não encontrado na ${label} (404). Verifique se o modelo selecionado está disponível para sua conta.`,
      status: 404,
    };
  }
  return { message: rawMessage, status: 500 };
}
