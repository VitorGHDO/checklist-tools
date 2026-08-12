import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "@/lib/types";

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

export interface MigrationField {
  campo: string;
  pergunta: string;
  secao?: string;
}

function detectProvider(model: string): AIProvider {
  if (GEMINI_MODELS.includes(model)) return "gemini";
  if (OPENAI_MODELS.includes(model)) return "openai";
  if (ANTHROPIC_MODELS.includes(model)) return "anthropic";
  return "gemini";
}

const BASE_PROMPT_BODY = `Você receberá uma lista de itens/perguntas de um checklist de entrega de veículos.

SUA TAREFA:
Para cada item de checklist (NÃO para títulos de seção), gere um nome de campo no formato snake_case.

REGRAS OBRIGATÓRIAS para o nome do campo (coluna "campo"):
- Usar apenas letras minúsculas, números e underscores (_)
- Resume a essência do item em NO MÁXIMO 4 palavras (partes separadas por _)
- NUNCA repita o mesmo nome de campo
- Seja objetivo e direto: capture a ação ou item principal
- Siga a lógica destes exemplos:
  "NOTA FISCAL: entregar as notas fiscais do veículo..." → "nota_fiscal"
  "DOCUMENTO: entregar o documento do veículo..." → "documento"
  "Convidar o cliente para retirar a capa de proteção..." → "retirar_capa"
  "Explicar o funcionamento do botão de travamento à distância..." → "botao_travamento_distancia"

O QUE IGNORAR (não gerar campo para):
- Linhas que são títulos de seção (ex: "1 INFORMAÇÃO TÉCNICA | DOCUMENTOS E MANUAIS STATUS")
- Linhas vazias
- Separadores como "--- Página ---"

ESTRUTURA DE SAÍDA (AGRUPAR POR SEÇÃO):
- Agrupe os itens por seção. Para CADA seção, crie um objeto com "secao" (o TÍTULO da seção, copiado EXATAMENTE como aparece no cabeçalho, sem inventar nem resumir) e "itens" (a lista de campos daquela seção).
- O título da seção aparece UMA ÚNICA VEZ por seção — NÃO repita em cada item.
- Mantenha as seções e os itens na MESMA ORDEM em que aparecem no texto.`;

const IPE_EXTRA_RULES = `
- O texto contém seções identificadas por letras (A, B, C, D, E) no formato "X - TÍTULO DA SEÇÃO"
- Cada campo DEVE ser prefixado com a letra da seção em minúsculo + underscore
- Exemplos: item da seção A → "a_verificar_checklists", seção B → "b_verificar_dados", seção C → "c_verificar_lataria"
- Use a letra da seção mais próxima acima do item para determinar o prefixo
- NUNCA repita o mesmo nome de campo`;

const PLANO_EXTRA_RULES = `
- PLANO DE MANUTENÇÃO — ITENS COBRADOS POR KM E POR TEMPO: algumas operações têm duas
  sub-linhas na folha, "Km" e "Meses"/"Tempo", cada uma com sua própria marcação. Para
  esses itens gere DOIS campos, na ordem km primeiro e tempo depois:
  "Fluido de freio" com sub-linhas Km e Meses → "fluido_de_freio_km" e "fluido_de_freio_tempo"
- A pergunta de cada um repete o texto do item com o sufixo " (KM)" e " (Tempo)"
- Itens com uma única linha continuam gerando UM campo só, sem sufixo`;

function extraRules(checklistType?: string): string {
  if (checklistType === "inspecao-pre-entrega") return IPE_EXTRA_RULES;
  if (checklistType === "plano-manutencao") return PLANO_EXTRA_RULES;
  return "";
}

function buildSystemPrompt(checklistType?: string): string {
  const extra = extraRules(checklistType);
  return BASE_PROMPT_BODY + extra + `

FORMATO DE SAÍDA:
Retorne APENAS um JSON válido (array), sem explicações, sem markdown, sem código de bloco:
[
  {"secao": "Título exato da seção", "itens": [
    {"campo": "nome_do_campo", "pergunta": "Texto completo do item de checklist"}
  ]},
  ...
]`;
}

function buildOpenAISystemPrompt(checklistType?: string): string {
  const extra = extraRules(checklistType);
  return BASE_PROMPT_BODY + extra + `

FORMATO DE SAÍDA OBRIGATÓRIO:
Retorne APENAS um objeto JSON no formato {"secoes": [...]}, sem explicações ou markdown:
{"secoes": [
  {"secao": "Título exato da seção", "itens": [
    {"campo": "nome_do_campo", "pergunta": "Texto completo do item de checklist"}
  ]},
  ...
]}`;
}

async function callGemini(
  apiKey: string,
  model: string,
  text: string,
  checklistType?: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel(
    { model },
    { apiVersion: "v1beta" }
  );

  const prompt = `${buildSystemPrompt(checklistType)}\n\nTexto do checklist corrigido:\n\n${text}\n\nRetorne o JSON agora:`;
  const result = await genModel.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 65536 },
  });
  return result.response.text();
}

async function callOpenAI(
  apiKey: string,
  model: string,
  text: string,
  checklistType?: string,
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildOpenAISystemPrompt(checklistType) },
      {
        role: "user",
        content: `Texto do checklist corrigido:\n\n${text}\n\nRetorne o objeto JSON {"fields": [...]} agora:`,
      },
    ],
    max_tokens: 16384,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  return response.choices[0]?.message?.content ?? "{\"fields\": []}";
}

async function callClaude(
  apiKey: string,
  model: string,
  text: string,
  checklistType?: string,
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  // Streaming é obrigatório quando max_tokens é alto o bastante para a requisição
  // poder passar de 10 min sem stream. Acumulamos e devolvemos o texto completo.
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 32000,
    temperature: 0.1,
    system: buildSystemPrompt(checklistType),
    messages: [
      {
        role: "user",
        content: `Texto do checklist corrigido:\n\n${text}\n\nRetorne o JSON agora:`,
      },
    ],
  });

  return await stream.finalText();
}

function repairTruncatedJson(raw: string): string {
  // Mantém até o último objeto completo e fecha, na ordem correta, todos os
  // colchetes/chaves ainda abertos (funciona com estrutura agrupada aninhada).
  const lastBrace = raw.lastIndexOf("}");
  if (lastBrace === -1) return "[]";
  const partial = raw.slice(0, lastBrace + 1);
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < partial.length; i++) {
    const c = partial[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") stack.push(c);
    else if (c === "]" || c === "}") stack.pop();
  }
  let out = partial;
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === "[" ? "]" : "}";
  return out;
}

// Achata a resposta (agrupada por seção, plana, ou com wrapper) em MigrationField[],
// herdando o "secao" do grupo quando o item não o traz.
function flattenToFields(node: unknown, inheritedSecao: string, out: MigrationField[]): void {
  if (Array.isArray(node)) {
    for (const el of node) flattenToFields(el, inheritedSecao, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const isItem = typeof obj.campo === "string" && typeof obj.pergunta === "string";
  if (isItem) {
    const secao = typeof obj.secao === "string" ? obj.secao : inheritedSecao;
    out.push({
      campo: (obj.campo as string).trim(),
      pergunta: (obj.pergunta as string).trim(),
      secao: secao.trim(),
    });
    return;
  }
  // Grupo/wrapper: adota o "secao" deste nível e desce nos filhos array/objeto.
  const secao = typeof obj.secao === "string" ? obj.secao : inheritedSecao;
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") flattenToFields(v, secao, out);
  }
}

function parseFields(raw: string): { fields: MigrationField[]; truncated: boolean } {
  // Remove markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  let truncated = false;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Recuperação para respostas truncadas
    truncated = true;
    console.warn("JSON truncado — recuperação parcial aplicada");
    try {
      parsed = JSON.parse(repairTruncatedJson(cleaned));
    } catch {
      parsed = [];
    }
  }

  const fields: MigrationField[] = [];
  flattenToFields(parsed, "", fields);
  return { fields, truncated };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { text, model = "gemini-2.5-flash", apiKey, checklistType } = body as {
      text: string;
      model: string;
      apiKey: string;
      checklistType?: string;
    };

    if (!text?.trim()) {
      return NextResponse.json(
        { success: false, error: "Texto não fornecido" },
        { status: 400 }
      );
    }
    if (!apiKey?.trim()) {
      return NextResponse.json(
        { success: false, error: "API Key não fornecida" },
        { status: 400 }
      );
    }

    const provider = detectProvider(model);

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

    let raw: string;
    if (provider === "gemini") {
      raw = await withRetry(() => callGemini(apiKey, model, text, checklistType));
    } else if (provider === "anthropic") {
      raw = await withRetry(() => callClaude(apiKey, model, text, checklistType));
    } else {
      raw = await withRetry(() => callOpenAI(apiKey, model, text, checklistType));
    }

    const { fields, truncated } = parseFields(raw);

    return NextResponse.json({ success: true, fields, truncated, model, provider });
  } catch (error) {
    console.error("Erro ao gerar campos de migration:", error);
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
