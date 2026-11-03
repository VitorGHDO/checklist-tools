import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { expandirEstrutura, parseEstrutura } from "@/lib/extrator/pos-venda";
import { renderizarPaginas } from "@/lib/extrator/render-paginas";
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
- O texto pode trazer a escala do item entre colchetes no fim da linha. Remova o
  marcador da pergunta e gere os campos conforme ele:
  "[por km e por tempo]" → dois campos, "<campo>_km" e "<campo>_tempo", como acima
  "[por km]" → UM campo "<campo>_km", pergunta com o sufixo " (KM)"
  "[por tempo]" → UM campo "<campo>_tempo", pergunta com o sufixo " (Tempo)"
- Itens com uma única linha e sem marcador continuam gerando UM campo só, sem sufixo
- As seções são os rótulos em MAIÚSCULAS da posição do veículo (ex.: "SOLO", "MEIA
  ALTURA", "ALTURA MÁXIMA"). O mesmo rótulo pode aparecer duas vezes: mantenha as duas
  seções separadas, na ordem do texto — não junte os itens do segundo bloco no primeiro
- IGNORE por completo o bloco "NOTAS" do rodapé da folha e tudo que vem depois dele: são
  observações do plano ("(1) Itens que devem ser substituídos...", "(2) Para veículos..."),
  não itens do checklist. Não gere campo nem seção para nada desse bloco.`;

/**
 * Pós-venda tem prompt PRÓPRIO, não regras extras: a saída não é a lista plana de seções
 * dos outros tipos, e sim {colunas, secoes} — a IA declara as colunas de etapa uma vez e
 * o servidor expande. Ver lib/extrator/pos-venda.ts.
 */
const POSVENDA_PROMPT_BODY = `Você receberá a IMAGEM de uma folha de checklist de pós-venda (inspeção/conferência de veículo) e, como apoio, o texto extraído dela.

A ESTRUTURA VEM DA IMAGEM, NÃO DO TEXTO.
O texto extraído destas folhas é inconfiável e você não deve se guiar por ele:
- os rótulos dos blocos são impressos na VERTICAL (girados 90 graus) e o OCR os quebra em fragmentos soltos no meio das linhas (um "É", um "Q |", um "3 |" perdidos antes do nome do item);
- a folha costuma ter DUAS tabelas lado a lado, e o OCR funde a linha da esquerda com a da direita numa linha só;
- as caixas de marcação viram lixo ("C[) NC N/A", "CLINC[])NA[]").
Use o texto apenas para conferir a grafia dos itens. Todo o resto — quais blocos existem, que itens pertencem a cada bloco, quantas colunas de marcação há — você lê na imagem.

COLUNAS DE ETAPA:
Nestas folhas o MESMO item é cobrado em mais de uma coluna da tabela (ex.: "ENTRADA" e "SAÍDA"; ou "RECEPÇÃO", "MECÂNICO" e "ENTREGA"), cada uma com a sua marcação na linha.
NÃO repita o item uma vez por coluna. Declare as colunas UMA ÚNICA VEZ em "colunas" e marque a seção com "repete": true — o sistema expande sozinho, na ordem em que você declarar. Declare as colunas na ordem de preenchimento impressa na folha.

SEÇÕES:
São os blocos da tabela, identificados pelo rótulo ao lado de cada um (quase sempre na vertical). Exemplos reais: DIANTEIRA, TRASEIRA, LATERAL LE, LATERAL LD, INTERIOR DO VEÍCULO, ITENS ESPECÍFICOS. Copie o rótulo como ele aparece na imagem.

SEÇÃO QUE NÃO SE REPETE:
Blocos que TÊM marcação própria mas são cobrados uma vez só (acessórios/equipamentos com SIM-NÃO, estado dos pneus com B-M-R) levam "repete": false. Quando o bloco pertence claramente a uma das etapas, informe "coluna" com o sufixo dela; se não pertencer a nenhuma em especial, use "coluna": null.

NOME DO CAMPO (snake_case):
- apenas letras minúsculas, números e underscore
- no máximo 4 palavras, resumindo a essência do item
- NÃO inclua o sufixo da etapa: quem acrescenta é o sistema
- ITEM QUE APARECE EM DUAS SEÇÕES: quando o mesmo texto existe em dois blocos (ex.: "Retrovisores" em LATERAL LE e em LATERAL LD), diferencie pelo sufixo do bloco — "retrovisores_le" e "retrovisores_ld". Nome repetido vira coluna duplicada e derruba a migration.

REGRA DE CORTE — SÓ ENTRA O QUE TEM CAIXA DE MARCAÇÃO:
Item de checklist tem uma CAIXA para marcar: o quadradinho de C/NC/N-A, de SIM/NÃO, de B/M/R. Campo de preenchimento tem uma LINHA para escrever em cima, e NÃO é item de checklist.
NÃO gere campo para nada que se preencha escrevendo, mesmo quando o bloco tem título próprio e parece uma seção:
- cabeçalho do documento: Usuário, Telefone, Placa, Modelo, E-mail, Veículo, Tag, Km, Motorista, Data da retirada, Oficina, Hr, Local de retirada, Local de entrega
- blocos de dados no meio ou no rodapé da folha, ainda que tenham título em caixa alta: Km, Data, Hora, Titular da placa, Matrícula, Observações, Relato resumido do serviço realizado
- assinaturas, matrículas e responsáveis
Também ignore:
- legendas e instruções ("Legenda - ( C ) Conforme...", "Em caso de não conforme, informar...")
- o croqui de avarias e os medidores de combustível: são desenhos, não itens de lista
Na dúvida, olhe a imagem: linha sem quadradinho não vira campo.`;

const POSVENDA_FORMATO = `

FORMATO DE SAÍDA:
Retorne APENAS um JSON válido, sem explicações e sem markdown:
{
  "colunas": [
    {"sufixo": "entrada", "label": "Entrada"},
    {"sufixo": "saida", "label": "Saída"}
  ],
  "secoes": [
    {"secao": "DIANTEIRA", "repete": true, "coluna": null, "itens": [
      {"campo": "farois_faroletes_setas", "pergunta": "Faróis / faroletes / setas"}
    ]},
    {"secao": "ACESSÓRIOS / EQUIPAMENTOS EXISTENTES", "repete": false, "coluna": "entrada", "itens": [
      {"campo": "engate_reboque", "pergunta": "Engate Reboque"}
    ]}
  ]
}`;

/** Folha de pós-venda: estrutura lida da imagem, com colunas de etapa. */
function isPosVenda(checklistType?: string): boolean {
  return checklistType === "pos-venda-inspecao";
}

function extraRules(checklistType?: string): string {
  if (checklistType === "inspecao-pre-entrega") return IPE_EXTRA_RULES;
  if (checklistType === "plano-manutencao") return PLANO_EXTRA_RULES;
  return "";
}

function buildSystemPrompt(checklistType?: string): string {
  if (isPosVenda(checklistType)) return POSVENDA_PROMPT_BODY + POSVENDA_FORMATO;
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
  // O formato do pós-venda já é um objeto no topo, que é o que o response_format pede.
  if (isPosVenda(checklistType)) return POSVENDA_PROMPT_BODY + POSVENDA_FORMATO;
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

/** Página da folha enviada como contexto visual. */
interface ImagemRef {
  mimeType: string;
  base64: string;
}

/**
 * No pós-venda o texto é só apoio para a grafia dos itens — dizer isso no corpo da
 * mensagem evita que o modelo tente reconstruir a tabela a partir do OCR embaralhado.
 */
function rotuloDoTexto(checklistType?: string): string {
  return isPosVenda(checklistType)
    ? "Texto extraído da folha (APOIO, pode estar corrompido — a estrutura vem da imagem):"
    : "Texto do checklist corrigido:";
}

async function callGemini(
  apiKey: string,
  model: string,
  text: string,
  checklistType?: string,
  images: ImagemRef[] = [],
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel(
    { model },
    { apiVersion: "v1beta" }
  );

  const prompt = `${buildSystemPrompt(checklistType)}\n\n${rotuloDoTexto(checklistType)}\n\n${text}\n\nRetorne o JSON agora:`;
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }

  const result = await genModel.generateContent({
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: 65536 },
  });
  return result.response.text();
}

async function callOpenAI(
  apiKey: string,
  model: string,
  text: string,
  checklistType?: string,
  images: ImagemRef[] = [],
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `${rotuloDoTexto(checklistType)}\n\n${text}\n\nRetorne o objeto JSON agora:`,
    },
  ];
  for (const img of images) {
    contentParts.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" },
    });
  }

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildOpenAISystemPrompt(checklistType) },
      { role: "user", content: contentParts },
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
  images: ImagemRef[] = [],
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text: `${rotuloDoTexto(checklistType)}\n\n${text}\n\nRetorne o JSON agora:`,
    },
  ];
  for (const img of images) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.base64,
      },
    });
  }

  // Streaming é obrigatório quando max_tokens é alto o bastante para a requisição
  // poder passar de 10 min sem stream. Acumulamos e devolvemos o texto completo.
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 32000,
    temperature: 0.1,
    system: buildSystemPrompt(checklistType),
    messages: [{ role: "user", content }],
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

/** JSON da resposta, tolerando cerca de markdown e corte no meio por limite de tokens. */
function parseJsonTolerante(raw: string): { parsed: unknown; truncated: boolean } {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return { parsed: JSON.parse(cleaned), truncated: false };
  } catch {
    console.warn("JSON truncado — recuperação parcial aplicada");
    try {
      return { parsed: JSON.parse(repairTruncatedJson(cleaned)), truncated: true };
    } catch {
      return { parsed: [], truncated: true };
    }
  }
}

function parseFields(raw: string): { fields: MigrationField[]; truncated: boolean } {
  const { parsed, truncated } = parseJsonTolerante(raw);
  const fields: MigrationField[] = [];
  flattenToFields(parsed, "", fields);
  return { fields, truncated };
}

interface PosVendaResult {
  fields: MigrationField[];
  truncated: boolean;
  /** Campos renomeados por colisão de nome — a UI avisa para o usuário conferir. */
  colisoes: { original: string; final: string }[];
  /** Rótulos das colunas de etapa, na ordem declarada: viram os status do checklist. */
  etapas: string[];
}

/**
 * Pós-venda: a IA devolve {colunas, secoes} e quem multiplica os itens pelas etapas é o
 * servidor. Estrutura irreconhecível cai no parser plano — devolver os campos sem a
 * hierarquia ainda é melhor que devolver nada, e a UI deixa reagrupar à mão.
 */
function parseFieldsPosVenda(raw: string): PosVendaResult {
  const { parsed, truncated } = parseJsonTolerante(raw);
  const estrutura = parseEstrutura(parsed);
  if (!estrutura) {
    const fields: MigrationField[] = [];
    flattenToFields(parsed, "", fields);
    return { fields, truncated, colisoes: [], etapas: [] };
  }
  const { fields, colisoes } = expandirEstrutura(estrutura);
  return { fields, truncated, colisoes, etapas: estrutura.colunas.map((c) => c.label) };
}

interface EntradaGerarCampos {
  text: string;
  model: string;
  apiKey: string;
  checklistType?: string;
  images: ImagemRef[];
}

const MIMES_IMAGEM = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

/**
 * A requisição chega como multipart quando traz as páginas renderizadas (pós-venda) e
 * como JSON nos tipos que só mandam texto. Aceitar as duas evita migrar de uma vez todos
 * os chamadores que já funcionam.
 */
async function lerEntrada(request: NextRequest): Promise<EntradaGerarCampos> {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    const body = (await request.json()) as Partial<EntradaGerarCampos>;
    return {
      text: body.text ?? "",
      model: body.model || "gemini-2.5-flash",
      apiKey: body.apiKey ?? "",
      checklistType: body.checklistType,
      images: [],
    };
  }

  const fd = await request.formData();
  const images: ImagemRef[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("images") || !(value instanceof File)) continue;
    if (!MIMES_IMAGEM.includes(value.type)) continue;
    const buffer = Buffer.from(await value.arrayBuffer());
    images.push({
      mimeType: value.type === "image/jpg" ? "image/jpeg" : value.type,
      base64: buffer.toString("base64"),
    });
  }

  // PDF no lugar das imagens: as páginas são renderizadas aqui mesmo. Imagem explícita
  // tem precedência — é a saída para quando existe um scan melhor que o render do PDF.
  if (images.length === 0) {
    const pdf = fd.get("pdf");
    if (pdf instanceof File && pdf.size > 0) {
      const buffer = Buffer.from(await pdf.arrayBuffer());
      const { paginas } = await renderizarPaginas(buffer);
      for (const p of paginas) {
        images.push({ mimeType: p.mimeType, base64: p.base64 });
      }
    }
  }

  return {
    text: (fd.get("text") as string) ?? "",
    model: (fd.get("model") as string) || "gemini-2.5-flash",
    apiKey: (fd.get("apiKey") as string) ?? "",
    checklistType: (fd.get("checklistType") as string) || undefined,
    images,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { text, model, apiKey, checklistType, images } = await lerEntrada(request);

    // Pós-venda lê a estrutura da imagem; sem ela o resultado sairia do OCR embaralhado,
    // que é exatamente o que este tipo existe para não fazer.
    if (isPosVenda(checklistType) && images.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Checklist de pós-venda precisa da folha em imagem: envie o PDF (as páginas são renderizadas aqui) ou as imagens. A estrutura é lida da imagem, não do texto.",
        },
        { status: 400 }
      );
    }

    if (!text?.trim() && images.length === 0) {
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
      raw = await withRetry(() => callGemini(apiKey, model, text, checklistType, images));
    } else if (provider === "anthropic") {
      raw = await withRetry(() => callClaude(apiKey, model, text, checklistType, images));
    } else {
      raw = await withRetry(() => callOpenAI(apiKey, model, text, checklistType, images));
    }

    if (isPosVenda(checklistType)) {
      const { fields, truncated, colisoes, etapas } = parseFieldsPosVenda(raw);
      return NextResponse.json({
        success: true,
        fields,
        truncated,
        colisoes,
        etapas,
        model,
        provider,
      });
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
