import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import type { CorrectionOptions, AIProvider } from "@/lib/types";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"];

function detectProvider(model: string): AIProvider {
  if (GEMINI_MODELS.includes(model)) return "gemini";
  if (OPENAI_MODELS.includes(model)) return "openai";
  return "gemini";
}

function buildSystemPrompt(options: CorrectionOptions, project?: string): string {
  // Prompt específico para o projeto Entrega Impecável
  if (project === "entrega-impecavel") {
    return (
      "Você recebeu um texto extraído por OCR de um checklist de entrega de veículos (Entrega Impecável).\n" +
      "O texto bruto contém cabeçalhos de metadados do veículo/cliente, símbolos de marcação e separadores que devem ser ignorados.\n\n" +
      "SUA TAREFA:\n" +
      "Retorne APENAS os títulos de seção e os itens do checklist, limpos e organizados.\n\n" +
      "REGRAS OBRIGATÓRIAS:\n" +
      "- IGNORE completamente: cabeçalhos como 'CHECKLIST ROTEIRO DE ENTREGA', nome do modelo do veículo, 'DADOS DA ENTREGA', 'CHASSI', 'PLACA', 'CLIENTE', 'MODELO', 'ANO', 'DATA', 'LEGENDA', 'TIPO DE ENTREGA', 'LOCAL DA ENTREGA', placeholders de data (ex: '/ / :'), linhas com '( ) Completa', '( ) Compacta' e similares.\n" +
      "- MANTENHA os títulos de seção numerados que terminam com STATUS. Exemplo: '1 INFORMAÇÃO TÉCNICA | DOCUMENTOS E MANUAIS STATUS'\n" +
      "- MANTENHA todos os itens do checklist (frases que descrevem ações a serem realizadas).\n" +
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

function buildUserPrompt(text: string, project?: string, pageNumber?: number): string {
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

export async function POST(request: NextRequest) {
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

    const systemPrompt = buildSystemPrompt(options, project);
    const userPrompt = buildUserPrompt(text, project, pageNumber);

    let correctedText: string;

    if (provider === "gemini") {
      correctedText = await callGemini(
        apiKey, model, systemPrompt, userPrompt, images
      );
    } else {
      correctedText = await callOpenAI(
        apiKey, model, systemPrompt, userPrompt, images
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
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
