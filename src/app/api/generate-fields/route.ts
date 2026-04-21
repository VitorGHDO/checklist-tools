import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import type { AIProvider } from "@/lib/types";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"];

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
}

function detectProvider(model: string): AIProvider {
  if (GEMINI_MODELS.includes(model)) return "gemini";
  if (OPENAI_MODELS.includes(model)) return "openai";
  return "gemini";
}

const SYSTEM_PROMPT = `Você receberá uma lista de itens/perguntas de um checklist de entrega de veículos.

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

O QUE IGNORAR:
- Linhas que são títulos de seção (ex: "1 INFORMAÇÃO TÉCNICA | DOCUMENTOS E MANUAIS STATUS")
- Linhas vazias
- Separadores como "--- Página ---"

FORMATO DE SAÍDA:
Retorne APENAS um JSON válido (array), sem explicações, sem markdown, sem código de bloco:
[
  {"campo": "nome_do_campo", "pergunta": "Texto completo do item de checklist"},
  ...
]`;

async function callGemini(
  apiKey: string,
  model: string,
  text: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  const prompt = `${SYSTEM_PROMPT}\n\nTexto do checklist corrigido:\n\n${text}\n\nRetorne o JSON agora:`;
  const result = await genModel.generateContent(prompt);
  return result.response.text();
}

async function callOpenAI(
  apiKey: string,
  model: string,
  text: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Texto do checklist corrigido:\n\n${text}\n\nRetorne o JSON agora:`,
      },
    ],
    max_tokens: 8192,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  return response.choices[0]?.message?.content ?? "[]";
}

function parseFields(raw: string): MigrationField[] {
  // Remove markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  // Handle both array and {fields: [...]} shapes
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.fields)
    ? parsed.fields
    : Array.isArray(parsed.items)
    ? parsed.items
    : [];

  return arr
    .filter(
      (item): item is MigrationField =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as MigrationField).campo === "string" &&
        typeof (item as MigrationField).pergunta === "string"
    )
    .map((item) => ({
      campo: item.campo.trim(),
      pergunta: item.pergunta.trim(),
    }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { text, model = "gemini-2.5-flash", apiKey } = body as {
      text: string;
      model: string;
      apiKey: string;
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

    let raw: string;
    if (provider === "gemini") {
      raw = await withRetry(() => callGemini(apiKey, model, text));
    } else {
      raw = await withRetry(() => callOpenAI(apiKey, model, text));
    }

    const fields = parseFields(raw);

    return NextResponse.json({ success: true, fields, model, provider });
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
