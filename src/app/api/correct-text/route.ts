import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { CorrectionOptions, AIProvider } from "@/lib/types";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"];
const ANTHROPIC_MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

const RETRYABLE_CODES = [503, 529];
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = RETRYABLE_CODES.some((code) =>
        msg.includes(`[${code}`)
      );
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      const delay = BASE_DELAY_MS * attempt;
      console.warn(`Tentativa ${attempt} falhou (retryable). Aguardando ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function detectProvider(model: string): AIProvider {
  if (GEMINI_MODELS.includes(model)) return "gemini";
  if (OPENAI_MODELS.includes(model)) return "openai";
  if (ANTHROPIC_MODELS.includes(model)) return "anthropic";
  return "gemini";
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
};

/** Extrai o status HTTP de um erro dos SDKs (OpenAI/Anthropic/Gemini expõem `.status`). */
function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/**
 * Converte erros crípticos dos provedores em mensagens claras.
 * Ex.: a Anthropic, ao rejeitar a chave durante um upload grande de imagem,
 * fecha a conexão e o SDK reporta apenas "401 terminated" — aqui traduzimos
 * isso para uma mensagem acionável, preservando o status HTTP real.
 */
function friendlyErrorMessage(
  error: unknown,
  provider: AIProvider | undefined
): { message: string; status: number } {
  const rawMessage = error instanceof Error ? error.message : "Erro desconhecido";
  const label = provider ? PROVIDER_LABELS[provider] : "IA";
  const status = getErrorStatus(error);

  // O SDK do Gemini retorna 400 com "API key not valid" para chave inválida.
  const isGeminiBadKey =
    status === 400 && /api key not valid|API_KEY_INVALID/i.test(rawMessage);

  if (status === 401 || isGeminiBadKey) {
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

function buildSystemPrompt(options: CorrectionOptions, project?: string, checklistType?: string): string {
  if (checklistType === "inspecao-pre-entrega") {
    return (
      "Você recebeu um texto extraído por OCR de um checklist de Inspeção Pré-Entrega de veículos (FML-VEN-09).\n" +
      "O texto bruto contém metadados do veículo/cliente, cabeçalhos de colunas e símbolos que devem ser ignorados.\n\n" +
      "SUA TAREFA:\n" +
      "Retorne APENAS os títulos de seção (A -, B -, C -...) e os itens de verificação, limpos e organizados.\n\n" +
      "REGRAS OBRIGATÓRIAS:\n" +
      "- IGNORE completamente linhas de metadados:\n" +
      "  • Título do documento (ex: 'INSPEÇÃO PRÉ-ENTREGA', 'FML-VEN-09', 'Stellantis')\n" +
      "  • Dados do veículo: chassis, placa, modelo, ano, data, cliente, concessionária, VIN\n" +
      "  • Cabeçalhos de colunas de resposta: 'OK', 'NOK', 'N/A', 'SIM', 'NÃO', 'Anomalia', 'Volts', '%'\n" +
      "  • Rodapés, assinaturas, campos de data e hora\n" +
      "  • Linhas com apenas números, datas ou referências de página\n" +
      "- MANTENHA todos os títulos de seção no formato exato 'X - TÍTULO EM MAIÚSCULAS' onde X é a letra (A, B, C, D, E).\n" +
      "- MANTENHA absolutamente TODOS os itens de verificação (frases curtas que descrevem o que verificar).\n" +
      "- REMOVA símbolos do início de cada item: ●, ★, |, •, -, *, caixas de seleção (□, ☐, ✓, ✗), e similares.\n" +
      "- Cada item deve aparecer em uma linha separada, sem símbolos e sem numeração própria.\n" +
      "- NÃO adicione explicações, comentários, cabeçalhos extras ou formatação markdown.\n" +
      "- Retorne APENAS o texto limpo.\n\n" +
      "EXEMPLO DE SAÍDA ESPERADA:\n" +
      "A - ANTES DE INICIAR O CHECKLIST\n" +
      "Verificar checklists preenchidos\n" +
      "Verificar condições gerais do veículo\n" +
      "...\n\n" +
      "B - DOCUMENTAÇÃO E KIT DE BORDO\n" +
      "Verificar dados da nota fiscal\n" +
      "Verificar documentação do veículo\n"
    );
  }

  if (checklistType === "revisao-entrega") {
    return (
      "Você recebeu um texto extraído por OCR de um checklist de revisão de entrega de veículos.\n" +
      "O texto bruto contém cabeçalhos de metadados do veículo/cliente e símbolos que devem ser ignorados.\n\n" +
      "SUA TAREFA:\n" +
      "Retorne APENAS os títulos de grupo/seção e os itens de verificação do checklist, limpos e organizados.\n\n" +
      "REGRAS OBRIGATÓRIAS:\n" +
      "- IGNORE completamente linhas de metadados:\n" +
      "  • Título do documento (ex: 'REVISÃO DE ENTREGA', 'INSPEÇÃO PRÉ-RECEBIMENTO')\n" +
      "  • Dados do veículo: número do chassis, placa, modelo, ano, data, cliente, concessionária\n" +
      "  • Cabeçalhos de colunas de resposta: 'OK', 'NOK', 'N/A', 'SIM', 'NÃO', 'Anomalia'\n" +
      "  • Rodapés, assinaturas, campos de data\n" +
      "- MANTENHA todos os títulos de grupo/seção (geralmente em caixa alta ou iniciados com número).\n" +
      "- MANTENHA absolutamente TODOS os itens de verificação (frases curtas que descrevem o que verificar).\n" +
      "- REMOVA símbolos do início de cada item: ●, ★, |, •, -, *, caixas de seleção (□, ☐, ✓, ✗), e similares.\n" +
      "- Cada item deve aparecer em uma linha separada, sem símbolos e sem numeração própria.\n" +
      "- NÃO adicione explicações, comentários, cabeçalhos extras ou formatação markdown.\n" +
      "- Retorne APENAS o texto limpo.\n\n" +
      "EXEMPLO DE SAÍDA ESPERADA:\n" +
      "PREPARAÇÃO PARA REVISÃO\n" +
      "Verificar nível de óleo do motor\n" +
      "Verificar nível do fluido de arrefecimento\n" +
      "...\n\n" +
      "INSPEÇÃO VISUAL EXTERNA\n" +
      "Verificar lataria por amassados ou arranhões\n" +
      "Verificar estado dos pneus e pressão\n"
    );
  }

  // Prompt específico para o projeto Entrega Impecável
  if (project === "entrega-impecavel") {
    return (
      "Você recebeu um texto extraído por OCR de um checklist de entrega de veículos (Entrega Impecável).\n" +
      "O texto bruto contém cabeçalhos de metadados do veículo/cliente, símbolos de marcação e separadores que devem ser ignorados.\n\n" +
      "SUA TAREFA:\n" +
      "Retorne APENAS os títulos de seção e os itens do checklist, limpos e organizados.\n\n" +
      "REGRAS OBRIGATÓRIAS:\n" +
      "- IGNORE completamente apenas estas linhas de metadados do documento:\n" +
      "  • Título do documento: 'CHECKLIST ROTEIRO DE ENTREGA'\n" +
      "  • Nome/código do modelo do veículo (ex: 'YARIS SEDAN 1.5 XLS CVT')\n" +
      "  • Cabeçalhos de campos de dados: 'DADOS DA ENTREGA', 'CHASSI:', 'PLACA:', 'CLIENTE:', 'MODELO:', 'ANO/MOD:', 'DATA:'\n" +
      "  • Seção de legenda e seus itens de status (ex: 'LEGENDA', 'A - APLICÁVEL', 'N - NÃO APLICÁVEL')\n" +
      "  • Opções de tipo de checklist: 'TIPO DE ENTREGA:', 'LOCAL DA ENTREGA:', '( ) Completa', '( ) Compacta'\n" +
      "  • Placeholders vazios de data/hora (ex: '/ / :', '__/__/____')\n" +
      "- NUNCA ignore itens que descrevem ações, verificações ou explicações — mesmo que sejam curtos ou simples.\n" +
      "- MANTENHA os títulos de seção numerados que terminam com STATUS. Exemplo: '1 INFORMAÇÃO TÉCNICA | DOCUMENTOS E MANUAIS STATUS'\n" +
      "- MANTENHA absolutamente TODOS os itens do checklist (frases que descrevem ações a serem realizadas).\n" +
      "- REMOVA todos os símbolos do início de cada item: ●, ★, |, •, -, *, e qualquer combinação deles.\n" +
      "- Cada item deve aparecer em uma linha separada, sem símbolos, sem numeração própria.\n" +
      "- NÃO adicione explicações, comentários, cabeçalhos extras ou formatação markdown.\n" +
      "- Retorne APENAS o texto limpo conforme o exemplo abaixo.\n\n" +
      "EXEMPLO DE SAÍDA ESPERADA:\n" +
      "1 INFORMAÇÃO TÉCNICA | DOCUMENTOS E MANUAIS STATUS\n" +
      "Entregar as notas fiscais do veículo, acessórios e demais produtos/serviços adquiridos pelo cliente.\n" +
      "Entregar uma cópia do CRLV do veículo, quando aplicável, e reforçar o seu correto preenchimento.\n" +
      "...\n\n" +
      "2 CAPA DE PROTEÇÃO DO VEÍCULO STATUS\n" +
      "Convidar o cliente e seus acompanhantes para retirarem a capa de proteção do veículo.\n"
    );
  }

  let prompt =
    "Você é um especialista em correção de texto extraído por OCR. " +
    "Sua tarefa é corrigir o texto fornecido comparando-o com as imagens de referência do documento original.\n\n" +
    "REGRAS IMPORTANTES:\n" +
    "- Retorne APENAS o texto corrigido, sem explicações, comentários ou marcações.\n" +
    "- NÃO adicione nenhum texto que não exista no documento original.\n" +
    "- NÃO remova informações que existam no documento.\n";

  if (options.matchImage) {
    prompt +=
      "- Compare CUIDADOSAMENTE cada palavra do texto com o que aparece nas imagens.\n" +
      "- O texto resultante deve ser 100% idêntico ao conteúdo visível nas imagens.\n" +
      "- Se uma palavra nas imagens está diferente do texto OCR, use a versão da imagem.\n" +
      "- Preste atenção especial a: nomes próprios, números, datas, abreviações e termos técnicos.\n";
  }
  if (options.keepFormat) {
    prompt +=
      "- PRESERVE a formatação original: quebras de linha, espaçamentos, tabulações e estrutura de parágrafos.\n" +
      "- Mantenha a mesma estrutura de layout que aparece nas imagens.\n";
  }
  if (options.fixOrtho) {
    prompt +=
      "- Corrija erros ortográficos e gramaticais evidentes.\n" +
      "- Corrija caracteres trocados ou mal reconhecidos pelo OCR (ex: 'l' por '1', 'O' por '0', 'rn' por 'm').\n" +
      "- Corrija acentuação incorreta ou ausente.\n";
  }
  if (options.additionalInstructions) {
    prompt += `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${options.additionalInstructions}\n`;
  }
  return prompt;
}

function buildUserPrompt(text: string, project?: string, pageNumber?: number, checklistType?: string): string {
  if (checklistType === "inspecao-pre-entrega") {
    let prompt = "";
    if (pageNumber && pageNumber > 0) {
      prompt += `PÁGINA ${pageNumber} DO DOCUMENTO\n\n`;
    }
    prompt += "Texto bruto extraído por OCR do checklist de Inspeção Pré-Entrega (com metadados e símbolos a serem ignorados):\n\n";
    prompt += "---INÍCIO DO TEXTO---\n";
    prompt += text;
    prompt += "\n---FIM DO TEXTO---\n\n";
    prompt += "Retorne o texto limpo conforme as regras do sistema, mantendo apenas seções (A -, B -...) e itens de verificação.";
    return prompt;
  }

  if (checklistType === "revisao-entrega") {
    let prompt = "";
    if (pageNumber && pageNumber > 0) {
      prompt += `PÁGINA ${pageNumber} DO DOCUMENTO\n\n`;
    }
    prompt += "Texto bruto extraído por OCR do checklist de revisão (com metadados e símbolos a serem ignorados):\n\n";
    prompt += "---INÍCIO DO TEXTO---\n";
    prompt += text;
    prompt += "\n---FIM DO TEXTO---\n\n";
    prompt += "Retorne o texto limpo conforme as regras do sistema, mantendo apenas grupos e itens de verificação.";
    return prompt;
  }

  let prompt = "";
  if (pageNumber && pageNumber > 0) {
    prompt += `PÁGINA ${pageNumber} DO DOCUMENTO\n\n`;
  }
  if (project === "entrega-impecavel") {
    prompt += "Texto bruto extraído por OCR do checklist (com metadados e símbolos a serem ignorados):\n\n";
  } else {
    prompt += "Texto extraído por OCR que precisa ser corrigido:\n\n";
  }
  prompt += "---INÍCIO DO TEXTO---\n";
  prompt += text;
  prompt += "\n---FIM DO TEXTO---\n\n";
  if (project === "entrega-impecavel") {
    prompt += "Retorne o texto limpo conforme as regras do sistema, mantendo apenas seções e itens do checklist.";
  } else {
    prompt += "Compare este texto com as imagens acima e retorne o texto corrigido.";
  }
  return prompt;
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  images: { mimeType: string; base64: string }[]
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  parts.push({ text: systemPrompt + "\n\n" + userPrompt });

  for (const img of images) {
    parts.push({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    });
  }

  const result = await genModel.generateContent(parts);
  const response = result.response;
  return response.text();
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  images: { mimeType: string; base64: string }[]
) {
  const openai = new OpenAI({ apiKey });

  const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: userPrompt },
  ];

  for (const img of images) {
    contentParts.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high",
      },
    });
  }

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: contentParts },
    ],
    max_tokens: 16384,
    temperature: 0.1,
  });

  return response.choices[0]?.message?.content ?? "";
}

async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  images: { mimeType: string; base64: string }[]
) {
  const anthropic = new Anthropic({ apiKey });

  const contentParts: Anthropic.MessageParam["content"] = [
    { type: "text", text: userPrompt },
  ];

  for (const img of images) {
    contentParts.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.base64,
      },
    });
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: 16000,
    temperature: 0.1,
    system: systemPrompt,
    messages: [{ role: "user", content: contentParts }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

export async function POST(request: NextRequest) {
  let provider: AIProvider | undefined;
  try {
    const formData = await request.formData();

    const text = formData.get("text") as string;
    const model = (formData.get("model") as string) || "gemini-2.5-flash";
    const apiKey = formData.get("apiKey") as string;
    const keepFormat = formData.get("keepFormat") === "1";
    const fixOrtho = formData.get("fixOrtho") === "1";
    const matchImage = formData.get("matchImage") === "1";
    const additionalInstructions =
      (formData.get("additionalInstructions") as string) || "";
    const checklistType = (formData.get("checklistType") as string) || "";
    const pageNumber = parseInt(
      (formData.get("pageNumber") as string) || "0",
      10
    );
    const project = (formData.get("project") as string) || "";

    if (!text) {
      return NextResponse.json(
        { success: false, error: "Texto não fornecido" },
        { status: 400 }
      );
    }
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API Key não fornecida" },
        { status: 400 }
      );
    }

    provider = detectProvider(model);

    if (provider === "openai" && !apiKey.startsWith("sk-")) {
      return NextResponse.json(
        {
          success: false,
          error: "Formato de API Key OpenAI inválido (deve começar com sk-)",
        },
        { status: 400 }
      );
    }
    if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
      return NextResponse.json(
        {
          success: false,
          error: "Formato de API Key Anthropic inválido (deve começar com sk-ant-)",
        },
        { status: 400 }
      );
    }

    // Process images
    const images: { mimeType: string; base64: string }[] = [];
    const entries = Array.from(formData.entries());
    for (const [key, value] of entries) {
      if (key.startsWith("images") && value instanceof File) {
        const validMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
        if (!validMimes.includes(value.type)) continue;
        if (value.size > 20 * 1024 * 1024) continue;

        const buffer = Buffer.from(await value.arrayBuffer());
        images.push({
          mimeType: value.type === "image/jpg" ? "image/jpeg" : value.type,
          base64: buffer.toString("base64"),
        });
      }
    }

    if (images.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhuma imagem de referência enviada" },
        { status: 400 }
      );
    }

    const options: CorrectionOptions = {
      text,
      model,
      apiKey,
      keepFormat,
      fixOrtho,
      matchImage,
      additionalInstructions,
      pageNumber,
    };

    const systemPrompt = buildSystemPrompt(options, project, checklistType);
    const userPrompt = buildUserPrompt(text, project, pageNumber, checklistType);

    let correctedText: string;

    if (provider === "gemini") {
      correctedText = await withRetry(() =>
        callGemini(apiKey, model, systemPrompt, userPrompt, images)
      );
    } else if (provider === "anthropic") {
      correctedText = await withRetry(() =>
        callClaude(apiKey, model, systemPrompt, userPrompt, images)
      );
    } else {
      correctedText = await withRetry(() =>
        callOpenAI(apiKey, model, systemPrompt, userPrompt, images)
      );
    }

    // Clean markdown wrappers
    correctedText = correctedText
      .replace(/^```\w*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    return NextResponse.json({
      success: true,
      correctedText,
      model,
      provider,
    });
  } catch (error) {
    console.error("Erro na correção com IA:", error);
    const { message, status } = friendlyErrorMessage(error, provider);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
