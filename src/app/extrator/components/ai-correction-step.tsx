"use client";

import { useState, useCallback, useEffect, useRef, Fragment } from "react";
import {
  Sparkles,
  Layers,
  Copy,
  Download,
  ArrowLeftRight,
  Table2,
  RefreshCw,
  FileCode,
  List,
  Tag,
  ChevronUp,
  ChevronDown,
  Plus,
  Pencil,
  Database,
  Trash2,
  Send,
  GripVertical,
} from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { CampoRepositorio } from "@/components/ui/campo-repositorio";
import { EnviarPosVendaModal } from "./enviar-posvenda-modal";
import { AI_MODELS, type UploadedImage, type ChecklistType, type DraftDados, type PerguntaAssociada } from "@/lib/types";
import { getApiKey as getProviderApiKey } from "@/lib/api-keys";
import {
  aplicarModoKmTempo,
  modoKmTempo,
  parKmTempo,
  secaoIgnorada,
  type ModoKmTempo,
  type PlanoManutencaoConfig,
} from "@/lib/extrator/plano-manutencao";
import { gruposDasSecoes } from "@/lib/extrator/pos-venda";
import { paraMysql } from "@/lib/extrator/formato-db";
import { camposEssenciais, colunasEssenciais, temCamposEssenciais } from "@/lib/extrator/campos-essenciais";
import {
  REPOSITORIOS,
  caminhoDoRepositorio,
  gravarNoRepositorio,
  prefixoMigration,
  type ChaveRepositorio,
} from "@/lib/repositorio";
import type { MigrationField } from "@/app/api/generate-fields/route";
import Image from "next/image";
import { PerguntasStatusTab } from "./perguntas-status-tab";
import { ScrollButtons } from "@/components/ui/scroll-buttons";
import { AirtonBadge } from "@/components/ui/airton-badge";

interface WorkingGroup {
  id: string;
  baseLabel: string;
  questions: string[];
}

type Project = "entrega-impecavel" | "pos-venda";

/**
 * Move o bloco [inicio, inicio + tamanho) para antes/depois de `alvo`, adotando a seção
 * do alvo. É a correção manual de quando a IA põe um campo na seção vizinha: a seção é
 * o que decide o status do campo na aba Perguntas, então mudar só a ordem não bastaria.
 */
function moverCampos(
  fields: MigrationField[],
  inicio: number,
  tamanho: number,
  alvo: number,
  antes: boolean,
): MigrationField[] {
  if (alvo >= inicio && alvo < inicio + tamanho) return fields;
  const secao = fields[alvo]?.secao;
  const bloco = fields.slice(inicio, inicio + tamanho).map((f) => ({ ...f, secao }));
  const resto = [...fields.slice(0, inicio), ...fields.slice(inicio + tamanho)];
  const alvoNoResto = alvo < inicio ? alvo : alvo - tamanho;
  const pos = antes ? alvoNoResto : alvoNoResto + 1;
  return [...resto.slice(0, pos), ...bloco, ...resto.slice(pos)];
}

/** Rótulo de bloco do plano: "SOLO", "MEIA ALTURA", "VEÍCULO EM ALTURA MÁXIMA"... */
const RE_POSICAO_ELEVADOR =
  /^(ve[ií]culo\s+(no|a|à|em)\s+)?(solo|meia\s+altura|altura\s+m[aá]xima)\s*:?$/i;

interface Props {
  pdfFile: File | null;
  images: UploadedImage[];
  project: Project;
  checklistType: ChecklistType | null;
  onOpenApiKeyModal: () => void;
  initialData?: DraftDados;
  onDataChange?: (data: Partial<DraftDados>) => void;
}

type ProcessingStep = "extracting" | "correcting" | null;
type ResultTab = "corrected" | "fields" | "sections" | "perguntas";

export function AiCorrectionStep({
  pdfFile,
  images,
  project,
  checklistType,
  onOpenApiKeyModal,
  initialData,
  onDataChange,
}: Props) {
  const [model, setModel] = useState("gemini-2.5-flash");
  const [instructions, setInstructions] = useState("");
  const [correctedText, setCorrectedText] = useState(initialData?.texto_corrigido ?? "");
  const [extractedText, setExtractedText] = useState(initialData?.texto_extraido ?? "");
  const [extractedPages, setExtractedPages] = useState<string[]>([]);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [migrationFields, setMigrationFields] = useState<MigrationField[]>(
    initialData?.campos_gerados ?? []
  );
  const [activeTab, setActiveTab] = useState<ResultTab>("corrected");
  const [migrationTableName, setMigrationTableName] = useState(
    initialData?.migration_table_name ?? "tabela_generica"
  );
  const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>(
    initialData?.working_groups ?? []
  );
  const [maxQPerSection, setMaxQPerSection] = useState<number>(0);
  const [checklistId, setChecklistId] = useState(initialData?.checklist_id ?? "217");
  const [isGeneratingFields, setIsGeneratingFields] = useState(false);
  // Arrasto de campos na aba Campos: o bloco sendo levado (o par km/tempo vai inteiro)
  // e onde ele cairia, para desenhar a linha-guia.
  const [arrasto, setArrasto] = useState<{ inicio: number; tamanho: number } | null>(null);
  const [alvoArrasto, setAlvoArrasto] = useState<{ idx: number; antes: boolean } | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showStatusDb, setShowStatusDb] = useState(false);
  const [statusDbOutput, setStatusDbOutput] = useState(initialData?.status_db ?? "");
  const [statusDbFormato, setStatusDbFormato] = useState<"planilha" | "mysql">("planilha");
  // Bloco fixo da migration (status 0). Ligado por padrão: tabela sem ele não funciona no app.
  const [incluirEssenciais, setIncluirEssenciais] = useState(true);
  const [enviarAberto, setEnviarAberto] = useState(false);
  // Repositório da API onde a migration é gravada: EI ou acampa, conforme o projeto, com o
  // caminho lembrado no navegador (esta etapa do assistente só monta no cliente).
  const repoMigrationChave: ChaveRepositorio = project === "pos-venda" ? "acampaApi" : "eiApi";
  const [repoMigration, setRepoMigration] = useState<string>(() => caminhoDoRepositorio(repoMigrationChave));
  const [showStatusSql, setShowStatusSql] = useState(false);
  const [statusSqlOutput, setStatusSqlOutput] = useState(initialData?.status_sql ?? "");

  const skipWorkingGroupsParseRef = useRef(
    !!(initialData?.working_groups && initialData.working_groups.length > 0)
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const isProcessing = processingStep !== null || isGeneratingFields;

  const getApiKey = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    const provider = AI_MODELS.find((m) => m.id === model)?.provider ?? "gemini";
    return getProviderApiKey(provider);
  }, [model]);

  const extractPdf = useCallback(async (): Promise<{ text: string; pages: string[] } | null> => {
    if (!pdfFile) return null;
    setProcessingStep("extracting");

    const formData = new FormData();
    formData.append("pdf", pdfFile);

    const res = await fetch("/api/extract-pdf", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!data.success) {
      showToast("Erro ao extrair PDF: " + data.error, "error");
      return null;
    }

    const text: string = data.text || "";
    const pages: string[] = data.pages || [];

    setExtractedText(text);
    setExtractedPages(pages);
    return { text, pages };
  }, [pdfFile]);

  /**
   * Multipart do pós-venda: o PDF sobe junto para o servidor rasterizar as folhas. A
   * estrutura desse tipo de checklist é lida da imagem — no texto do OCR os rótulos
   * verticais viram fragmentos e as duas tabelas da folha colapsam na mesma linha.
   */
  const buildPosVendaForm = useCallback(
    (text: string, apiKey: string): FormData => {
      const fd = new FormData();
      fd.append("text", text);
      fd.append("model", model);
      fd.append("apiKey", apiKey);
      if (checklistType) fd.append("checklistType", checklistType);
      if (pdfFile) fd.append("pdf", pdfFile);
      // Imagem enviada à mão tem precedência no servidor: quando o próprio PDF já é um
      // escaneamento, o scan do usuário costuma ler melhor que o render.
      images.forEach((img, i) => fd.append(`images[${i}]`, img.file));
      return fd;
    },
    [model, checklistType, pdfFile, images]
  );

  const generateFields = useCallback(
    async (text: string, apiKey: string) => {
      setIsGeneratingFields(true);
      try {
        const isPosVenda = checklistType === "pos-venda-inspecao";
        const res = await (isPosVenda
          ? fetch("/api/generate-fields", {
              method: "POST",
              body: buildPosVendaForm(text, apiKey),
            })
          : fetch("/api/generate-fields", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text, model, apiKey, checklistType }),
            }));
        const data = await res.json();
        if (data.success && Array.isArray(data.fields)) {
          // A IA pode gerar campo para as notas de rodapé mesmo instruída a pular: o
          // descarte por seção é o que garante que nenhum vire pergunta.
          const campos: MigrationField[] = (data.fields as MigrationField[]).filter(
            (f) => !(checklistType === "plano-manutencao" && secaoIgnorada(f.secao)),
          );
          const descartados = data.fields.length - campos.length;
          const etapas: string[] = Array.isArray(data.etapas) ? data.etapas : [];
          const colisoes: { original: string; final: string }[] = Array.isArray(data.colisoes)
            ? data.colisoes
            : [];
          setMigrationFields(campos);
          // Pós-venda: cada seção lida da folha vira um status. Os grupos NÃO podem vir
          // do texto — o OCR dessas folhas não tem cabeçalho reconhecível, e tudo
          // acabava caindo num status só. Quem sabe onde cada bloco começa é a leitura
          // da imagem, que já chegou resolvida no `secao` de cada campo.
          if (isPosVenda) {
            const secs = gruposDasSecoes(campos);
            if (secs.length > 0) {
              skipWorkingGroupsParseRef.current = true;
              setWorkingGroups(
                secs.map((s) => ({ id: s.id, baseLabel: s.name, questions: s.questions })),
              );
            }
          }
          if (data.truncated) {
            showToast(
              `Resposta truncada: ${campos.length} campos gerados, mas alguns itens podem ter ficado de fora. Gere novamente ou divida o checklist.`,
              "error",
            );
          } else {
            showToast(
              etapas.length > 0
                ? `Airton leu ${campos.length} campos em ${etapas.length} etapa(s): ${etapas.join(" · ")}.`
                : descartados > 0
                ? `Airton gerou ${campos.length} campos (${descartados} do bloco NOTAS foram descartados).`
                : `Airton gerou ${campos.length} campos!`,
              "success",
            );
          }
          // Nome repetido viraria coluna duplicada na migration. O servidor renomeia para
          // não derrubar a geração, mas quem decide o nome certo é quem está conferindo.
          if (colisoes.length > 0) {
            showToast(
              `${colisoes.length} nome(s) de campo vieram repetidos e foram renomeados (${colisoes
                .slice(0, 3)
                .map((c) => c.final)
                .join(", ")}${colisoes.length > 3 ? "..." : ""}). Confira na aba do banco.`,
              "info",
            );
          }
        } else {
          console.error("[generate-fields] Erro da API:", data.error);
          showToast("Erro ao gerar campos: " + data.error, "error");
        }
      } catch (err) {
        console.error("[generate-fields] Erro inesperado:", err);
        showToast("Erro ao gerar campos de migration", "error");
      } finally {
        setIsGeneratingFields(false);
      }
    },
    [model, checklistType, buildPosVendaForm]
  );

  const correctText = useCallback(
    async (perPage: boolean) => {
      const apiKey = getApiKey();
      if (!apiKey) {
        showToast("Configura a API Key primeiro.", "error");
        onOpenApiKeyModal();
        return;
      }
      if (!pdfFile) {
        showToast("Selecione um PDF na etapa anterior.", "error");
        return;
      }
      // Pós-venda dispensa a imagem de referência: o servidor rasteriza as folhas do
      // próprio PDF na hora de gerar os campos.
      const isPosVenda = checklistType === "pos-venda-inspecao";
      if (images.length === 0 && !isPosVenda) {
        showToast("Envie pelo menos uma imagem de referência.", "error");
        return;
      }

      try {
        const extracted = await extractPdf();
        if (!extracted) return;

        setProcessingStep("correcting");
        const { text, pages } = extracted;

        let finalText = "";

        if (isPosVenda && images.length === 0) {
          // Sem imagem não há contra o que corrigir, e corrigir não ajudaria: neste tipo
          // o texto é só apoio para a grafia dos itens. Entra cru.
          finalText = text;
          setCorrectedText(finalText);
          setActiveTab("corrected");
          showToast(
            "Texto extraído. A estrutura será lida das folhas ao gerar os campos.",
            "info",
          );
        } else if (perPage && pages.length > 1) {
          const results: string[] = [];
          for (let i = 0; i < pages.length; i++) {
            const pageText = pages[i];
            if (!pageText.trim()) continue;

            const formData = buildFormData(pageText, apiKey, i + 1);

            if (images[i]) {
              formData.append("images[0]", images[i].file);
            } else {
              formData.append("images[0]", images[images.length - 1].file);
            }

            const res = await fetch("/api/correct-text", {
              method: "POST",
              body: formData,
            });
            const data = await res.json();

            if (data.success) {
              results.push(data.correctedText);
            } else {
              results.push(`[ERRO pág. ${i + 1}: ${data.error}]\n${pageText}`);
            }
          }
          finalText = results.join("\n\n--- Página ---\n\n");
          setCorrectedText(finalText);
          setActiveTab("corrected");
          showToast("Airton extraiu as perguntas!", "success");
        } else {
          const formData = buildFormData(text, apiKey);
          images.forEach((img, idx) => {
            formData.append(`images[${idx}]`, img.file);
          });

          const res = await fetch("/api/correct-text", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();

          if (data.success) {
            finalText = data.correctedText;
            setCorrectedText(finalText);
            setActiveTab("corrected");
            showToast("Airton extraiu as perguntas!", "success");
          } else {
            showToast("Erro da IA: " + data.error, "error");
            return;
          }
        }

        if (finalText && project === "entrega-impecavel") {
          await generateFields(finalText, apiKey);
        }
      } catch (err) {
        console.error(err);
        showToast("Tive um probleminha. Tente novamente.", "error");
      } finally {
        setProcessingStep(null);
      }
    },
    [
      pdfFile,
      images,
      model,
      instructions,
      getApiKey,
      onOpenApiKeyModal,
      extractPdf,
      project,
      generateFields,
      checklistType,
    ]
  );

  function buildFormData(text: string, apiKey: string, pageNumber?: number): FormData {
    const fd = new FormData();
    fd.append("text", text);
    fd.append("model", model);
    fd.append("apiKey", apiKey);
    fd.append("keepFormat", "1");
    fd.append("fixOrtho", "1");
    fd.append("matchImage", "1");
    fd.append("additionalInstructions", instructions);
    fd.append("project", project);
    if (pageNumber) fd.append("pageNumber", String(pageNumber));
    if (checklistType) fd.append("checklistType", checklistType);
    return fd;
  }

  function parseSectionsFromText(text: string): { id: string; name: string; questions: string[] }[] {
    const isRevisao = checklistType === "revisao-entrega";
    const isIPE = checklistType === "inspecao-pre-entrega";
    const isPlano = checklistType === "plano-manutencao";

    // IPE: headers match "A - TITLE" pattern (letter + dash)
    // revisao-entrega e plano-manutencao: ALL-CAPS lines (no lowercase letters) —
    //   no plano são as posições do veículo ("VEICULO NO SOLO", "MEIA ALTURA")
    // roteiro-entrega-tecnica: lines starting with a digit followed by an uppercase letter
    const semMinuscula = (line: string) =>
      line.length > 2 && !/[a-záéíóúâêîôûãõçàèìòùäëïöü]/.test(line);
    const isSectionHeader = isIPE
      ? (line: string) => /^[A-E]\s*-\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]/i.test(line)
      : isPlano
      ? // no plano as notas de rodapé ("(1)", "12.000") também não têm minúscula —
        // a seção precisa ter pelo menos uma letra. As posições do elevador valem em
        // qualquer caixa: a IA de correção às vezes devolve "Solo" / "Meia altura", e
        // aí a folha inteira caía num grupo só.
        (line: string) =>
          RE_POSICAO_ELEVADOR.test(line) ||
          (semMinuscula(line) && /[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]/.test(line))
      : isRevisao
      ? semMinuscula
      : (line: string) => /^\d+\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇÀÈÌÒÙÄËÏÖÜ]/.test(line);

    const lines = text.split("\n");
    const sections: { id: string; name: string; questions: string[] }[] = [];
    let current: { id: string; name: string; questions: string[] } | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("---")) continue;
      if (isSectionHeader(line)) {
        if (current) sections.push(current);
        const name = isIPE
          ? line.trim().toUpperCase()
          : isRevisao || isPlano
          ? line.trim()
          : line.replace(/^\d+\s+/, "").replace(/\s+STATUS\s*$/i, "").trim();
        current = { id: `sec-${sections.length}`, name, questions: [] };
      } else if (current) {
        current.questions.push(line);
      }
    }
    if (current) sections.push(current);

    // O rodapé de observações do plano casa com a heurística de cabeçalho (é ALL-CAPS) e
    // arrastaria as notas junto como itens. Fora daqui ele não some sozinho: as linhas
    // continuam no texto corrigido, só não viram grupo nem campo.
    const uteis = isPlano ? sections.filter((s) => !secaoIgnorada(s.name)) : sections;
    if (uteis.length !== sections.length) return uteis;

    // Sem nenhum cabeçalho reconhecido o fluxo travava: a aba do banco só aparece
    // com grupos, e sem grupos não havia como criar nenhum. Um grupo único com tudo
    // deixa o usuário seguir e reagrupar à mão na aba Status / Seções.
    if (sections.length === 0) {
      const linhas = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("---"));
      if (linhas.length) return [{ id: "sec-0", name: "Geral", questions: linhas }];
    }
    return sections;
  }

  function getDisplayLabel(groups: WorkingGroup[], group: WorkingGroup): string {
    const peers = groups.filter((g) => g.baseLabel === group.baseLabel);
    if (peers.length <= 1) return group.baseLabel;
    const idx = peers.findIndex((g) => g.id === group.id) + 1;
    return `${group.baseLabel} [${idx}/${peers.length}]`;
  }

  function handleJoin(idx: number) {
    setWorkingGroups((prev) => {
      const a = prev[idx], b = prev[idx + 1];
      const cleanA = a.baseLabel;
      const cleanB = b.baseLabel;
      const newLabel = cleanA === cleanB ? cleanA : `${cleanA} & ${cleanB}`;
      const merged: WorkingGroup = {
        id: `${a.id}+${b.id}`,
        baseLabel: newLabel,
        questions: [...a.questions, ...b.questions],
      };
      return [...prev.slice(0, idx), merged, ...prev.slice(idx + 2)];
    });
  }

  function handleSplit(idx: number) {
    setWorkingGroups((prev) => {
      const g = prev[idx];
      if (g.questions.length < 2) return prev;
      const mid = Math.ceil(g.questions.length / 2);
      const part1: WorkingGroup = { id: `${g.id}-a`, baseLabel: g.baseLabel, questions: g.questions.slice(0, mid) };
      const part2: WorkingGroup = { id: `${g.id}-b`, baseLabel: g.baseLabel, questions: g.questions.slice(mid) };
      return [...prev.slice(0, idx), part1, part2, ...prev.slice(idx + 1)];
    });
  }

  function handleAutoSplit(maxQ: number) {
    if (!maxQ || maxQ < 1) return;
    setWorkingGroups((prev) => {
      let result = [...prev];
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < result.length; i++) {
          if (result[i].questions.length > maxQ) {
            const g = result[i];
            const mid = Math.ceil(g.questions.length / 2);
            const p1: WorkingGroup = { id: `${g.id}-a`, baseLabel: g.baseLabel, questions: g.questions.slice(0, mid) };
            const p2: WorkingGroup = { id: `${g.id}-b`, baseLabel: g.baseLabel, questions: g.questions.slice(mid) };
            result = [...result.slice(0, i), p1, p2, ...result.slice(i + 1)];
            changed = true;
            break;
          }
        }
      }
      return result;
    });
  }

  function handleResetSections() {
    const secs =
      checklistType === "pos-venda-inspecao" && migrationFields.length > 0
        ? gruposDasSecoes(migrationFields)
        : parseSectionsFromText(correctedText);
    setWorkingGroups(secs.map((s) => ({ id: s.id, baseLabel: s.name, questions: s.questions })));
  }

  function handleRenameGroup(idx: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setWorkingGroups((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, baseLabel: trimmed } : g))
    );
  }

  function handleMoveUp(idx: number) {
    if (idx === 0) return;
    setWorkingGroups((prev) => {
      const result = [...prev];
      [result[idx - 1], result[idx]] = [result[idx], result[idx - 1]];
      return result;
    });
  }

  function handleMoveDown(idx: number) {
    setWorkingGroups((prev) => {
      if (idx >= prev.length - 1) return prev;
      const result = [...prev];
      [result[idx], result[idx + 1]] = [result[idx + 1], result[idx]];
      return result;
    });
  }

  // Remove a seção. Serve para os cabeçalhos que não são seção de verdade — no plano
  // de manutenção o bloco "NOTAS" do rodapé casa com a heurística de ALL-CAPS e vira
  // uma página vazia. Os campos que apontavam para ela caem em "Não Associadas" na aba
  // Perguntas, e não somem sem aviso.
  function handleDeleteGroup(idx: number) {
    const group = workingGroups[idx];
    if (!group) return;
    const qCount = group.questions.length;
    if (
      qCount > 0 &&
      !confirm(
        `Remover a seção "${group.baseLabel}" e suas ${qCount} pergunta${qCount !== 1 ? "s" : ""}?`
      )
    )
      return;
    setWorkingGroups((prev) => prev.filter((_, i) => i !== idx));
    showToast("Seção removida!", "success");
  }

  function handleAddGroup() {
    setWorkingGroups((prev) => [
      ...prev,
      { id: `manual-${Date.now()}`, baseLabel: "Nova Seção", questions: [] },
    ]);
  }

  useEffect(() => {
    if (skipWorkingGroupsParseRef.current) {
      skipWorkingGroupsParseRef.current = false;
      return;
    }
    // Pós-venda monta os grupos a partir dos campos (ver generateFields); reparsear o
    // texto aqui desfaria isso a cada mudança do texto corrigido.
    if (checklistType === "pos-venda-inspecao") return;
    if (!correctedText) { setWorkingGroups([]); return; }
    const secs = parseSectionsFromText(correctedText);
    setWorkingGroups(secs.map((s) => ({ id: s.id, baseLabel: s.name, questions: s.questions })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctedText]);

  useEffect(() => {
    const step = isGeneratingFields ? "generating" : processingStep;
    if (step === "extracting") document.title = "⏳ Extraindo PDF...";
    else if (step === "correcting") document.title = "⏳ Corrigindo texto...";
    else if (step === "generating") document.title = "⏳ Gerando campos...";
    else if (correctedText) document.title = "✅ Pronto! — Checklist Tools";
    else document.title = "Checklist Tools";
    return () => { document.title = "Checklist Tools"; };
  }, [processingStep, isGeneratingFields, correctedText]);

  useEffect(() => {
    onDataChange?.({
      texto_extraido: extractedText,
      texto_corrigido: correctedText,
      // uma imagem de referência por folha do checklist — o Designer usa como alvo
      paginas_referencia: images.length || extractedPages.length || undefined,
      campos_gerados: migrationFields,
      working_groups: workingGroups,
      migration_table_name: migrationTableName,
      checklist_id: checklistId,
      status_sql: statusSqlOutput,
      status_db: statusDbOutput,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedText, correctedText, images.length, extractedPages.length, migrationFields, workingGroups, migrationTableName, checklistId, statusSqlOutput, statusDbOutput]);

  const handlePerguntasChange = useCallback(
    (perguntasData: {
      perguntas: PerguntaAssociada[];
      sqlOutput: string;
      dbOutput: string;
      plano?: PlanoManutencaoConfig;
    }) => {
      onDataChange?.({
        perguntas: perguntasData.perguntas,
        perguntas_sql: perguntasData.sqlOutput,
        perguntas_db: perguntasData.dbOutput,
        plano_manutencao: perguntasData.plano,
      });
    },
    [onDataChange]
  );

  function buildMigrationCode(tableName: string, fields: MigrationField[]): string {
    const safeTable = tableName.trim() || "tabela_generica";
    // Os títulos de seção entram como comentários "//SEÇÃO //" — além de identificar os
    // blocos, é o formato que o Designer de PDF reconhece ao colar esta migration nele.
    const lines: string[] = [];
    // Campos essenciais (status 0): o bloco fixo do tipo vem antes dos itens. Item com o
    // mesmo nome de uma coluna do bloco não é repetido — coluna duplicada derruba a migration.
    const essenciais = incluirEssenciais ? camposEssenciais(checklistType) : [];
    const jaNoBloco = incluirEssenciais ? colunasEssenciais(checklistType) : new Set<string>();
    essenciais.forEach((l) => lines.push(`            ${l}`));
    let lastSecao: string | null = null;
    fields.forEach((f) => {
      if (jaNoBloco.has(f.campo)) return;
      const secao = (f.secao || "").trim();
      if (secao !== lastSecao) {
        if (secao) {
          if (lines.length) lines.push("");
          lines.push(`            //${secao} //`);
        }
        lastSecao = secao;
      }
      lines.push(`            $table->integer('${f.campo}')->nullable();`);
    });
    const cols = lines.join("\n");
    const extraCols =
      checklistType === "revisao-entrega" || checklistType === "inspecao-pre-entrega"
        ? "\n            $table->json('observacoes')->nullable();"
        : "";
    return `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('${safeTable}', function (Blueprint $table) {
${cols}${extraCols}
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('${safeTable}');
    }
};`;
  }

  /**
   * Grava a migration em database/migrations do repositório da API, com o nome datado do
   * Laravel no padrão de cada repositório (o acampa usa "create_table_<tabela>").
   */
  async function gravarMigration() {
    const tabela = migrationTableName.trim();
    if (!tabela || tabela === "tabela_generica" || !/^[a-z0-9_]+$/.test(tabela)) {
      showToast("Dê um nome de tabela válido (minúsculas, números e _) antes de gravar.", "error");
      return;
    }
    const nome =
      repoMigrationChave === "acampaApi"
        ? `${prefixoMigration()}_create_table_${tabela}.php`
        : `${prefixoMigration()}_create_${tabela}_table.php`;
    try {
      const r = await gravarNoRepositorio(repoMigrationChave, repoMigration, [
        { caminho: `database/migrations/${nome}`, texto: buildMigrationCode(tabela, migrationFields) + "\n" },
      ]);
      if (r) showToast(`Migration gravada: ${r.arquivos[0]}. Rode o migrate quando revisar.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Não consegui gravar a migration.", "error");
    }
  }

  function buildStatusRows(groups: WorkingGroup[]): string {
    const q = (val: string) => `"${val}"`;
    const row = (vals: string[]) => vals.map(q).join("\t");
    const id = checklistId.trim() || "217";

    const dados = row([
      id, "0", "[NULL]", "Dados do Veiculo e Cliente",
      "warning", "sempagina.php", "sempagina.php", "sempagina.php",
      "1", "Salvar e Continuar", "insert", "[NULL]",
      "0", "0", "1", "", "0", "0", "0", "0;1", "Checklist", "", "0", "0",
    ]);

    const sectionRows = groups.map((g, i) => {
      const etapa = i + 1;
      const isLast = i === groups.length - 1;
      const http = etapa === 1 ? "post" : "put";
      const btn = isLast ? "Salvar e Finalizar" : "Salvar e Continuar";
      const fin2 = isLast ? "[NULL]" : "0";
      return row([
        id, String(etapa), "[NULL]", getDisplayLabel(groups, g),
        "warning", "sempagina.php", "sempagina.php", "sempagina.php",
        "1", btn, "update", http,
        "0", fin2, "1", "", "0", "0", "0", "0;1", "Checklist", "", "0", "0",
      ]);
    });

    const next = groups.length + 1;

    const assinaturaConsultor = row([
      id, String(next), "[NULL]", "Assinatura Consultor",
      "warning", "sempagina.php", "sempagina.php", "sempagina.php",
      "1", "Salvar e Finalizar", "update", "put",
      "0", "[NULL]", "1", "", "0", "0", "0", "0;1", "Checklist", "", "0", "0",
    ]);

    const assinaturaCliente = row([
      id, String(next + 1), "[NULL]", "Assinatura Cliente",
      "warning", "sempagina.php", "sempagina.php", "sempagina.php",
      "1", "Salvar e Finalizar", "update", "put",
      "1", "1", "1", "", "0", "0", "0", "0;1", "Checklist", "", "0", "0",
    ]);

    const finalizado = row([
      id, String(next + 2), "[NULL]", "Finalizado",
      "end", "", "", "", "0", "", "", "",
      "0", "0", "1", "", "0", "0", "0", "0;1;2", "Checklist", "", "0", "0",
    ]);

    return [dados, ...sectionRows, assinaturaConsultor, assinaturaCliente, finalizado].join("\n");
  }

  /**
   * Linhas do `checklist_status`. "mysql" são as MESMAS colunas do Formato DB na escrita
   * do INSERT, como sai no checklist_perguntas: aspas simples, vírgula e NULL sem aspas,
   * com '' na frente para o id auto_increment. Sem blob e sem coluna extra no fim.
   */
  function gerarStatusDb(formato: "planilha" | "mysql") {
    const planilha = buildStatusRows(workingGroups);
    setStatusDbOutput(
      formato === "mysql" ? paraMysql(planilha, { idVazio: true, indiceExtra: -1, sufixo: [] }) : planilha,
    );
    setStatusDbFormato(formato);
    setShowStatusDb(true);
  }

  function buildSqlInserts(groups: WorkingGroup[]): string {
    const id = parseInt(checklistId.trim() || "217");
    const esc = (s: string) => s.replace(/'/g, "''");

    const colsBase = "checklist,status,setor,setorCor,link,linksalvar,linkproximo,nivel,botao,acao";
    const colsTail = "perguntaAplicavel,oficinaDigital,inicioMecanico,inicioOutros,acesso,tituloPagina,informacaoAdicional,todasAssinaturas,validaFormularios";

    const valBase = (etapa: number, name: string, btn: string, acao: string) =>
      `${id},${etapa},'${esc(name)}','warning','sempagina.php','sempagina.php','sempagina.php','1','${btn}','${acao}'`;

    const lines: string[] = [];

    // Dados do Veiculo e Cliente — sem acaoApi
    lines.push(
      `INSERT INTO checklist_status (${colsBase},exibePdf,enviaEmail,header,${colsTail})\n` +
      `  VALUES (${valBase(0, "Dados do Veiculo e Cliente", "Salvar e Continuar", "insert")},0,0,1,'',0,0,0,'0;1','Checklist','',0,0);`
    );

    // Section rows
    groups.forEach((g, i) => {
      const etapa = i + 1;
      const isLast = i === groups.length - 1;
      const http = etapa === 1 ? "post" : "put";
      const btn = isLast ? "Salvar e Finalizar" : "Salvar e Continuar";
      const name = getDisplayLabel(groups, g);
      if (!isLast) {
        lines.push(
          `INSERT INTO checklist_status (${colsBase},acaoApi,exibePdf,enviaEmail,header,${colsTail})\n` +
          `  VALUES (${valBase(etapa, name, btn, "update")},'${http}',0,0,1,'',0,0,0,'0;1','Checklist','',0,0);`
        );
      } else {
        lines.push(
          `INSERT INTO checklist_status (${colsBase},acaoApi,exibePdf,header,${colsTail})\n` +
          `  VALUES (${valBase(etapa, name, btn, "update")},'${http}',0,1,'',0,0,0,'0;1','Checklist','',0,0);`
        );
      }
    });

    const next = groups.length + 1;

    // Assinatura Consultor — sem enviaEmail
    lines.push(
      `INSERT INTO checklist_status (${colsBase},acaoApi,exibePdf,header,${colsTail})\n` +
      `  VALUES (${valBase(next, "Assinatura Consultor", "Salvar e Finalizar", "update")},'put',0,1,'',0,0,0,'0;1','Checklist','',0,0);`
    );

    // Assinatura Cliente — exibePdf=1, enviaEmail=1
    lines.push(
      `INSERT INTO checklist_status (${colsBase},acaoApi,exibePdf,enviaEmail,header,${colsTail})\n` +
      `  VALUES (${valBase(next + 1, "Assinatura Cliente", "Salvar e Finalizar", "update")},'put',1,1,1,'',0,0,0,'0;1','Checklist','',0,0);`
    );

    // Finalizado
    lines.push(
      `INSERT INTO checklist_status (${colsBase},acaoApi,exibePdf,enviaEmail,header,${colsTail})\n` +
      `  VALUES (${id},${next + 2},'Finalizado','end','','','','0','','','',0,0,1,'',0,0,0,'0;1;2','Checklist','',0,0);`
    );

    return lines.join("\n\n");
  }

  const geminiModels = AI_MODELS.filter((m) => m.provider === "gemini");
  const openaiModels = AI_MODELS.filter((m) => m.provider === "openai");
  const anthropicModels = AI_MODELS.filter((m) => m.provider === "anthropic");
  const canRun = !!pdfFile && images.length > 0 && !isProcessing;
  const hasPages = extractedPages.length > 1;
  const isPlanoManutencao = checklistType === "plano-manutencao";
  // No plano não existe migration: os campos são a coluna `campo` das perguntas e as
  // propriedades lidas no PHP do PDF. Chamar a aba de "migration" ali confunde.
  const rotuloCampos = isPlanoManutencao ? "Campos do Formulário" : "Campos de Migration";

  /** Bloco que se move junto com o campo `idx`: no plano, o par km/tempo não se separa. */
  const blocoDoCampo = (idx: number): { inicio: number; tamanho: number } => {
    const par = isPlanoManutencao ? parKmTempo(migrationFields, idx) : null;
    return par ? { inicio: par.inicio, tamanho: 2 } : { inicio: idx, tamanho: 1 };
  };

  /** Alvo do arrasto sobre a linha `idx`; soltar no meio de um par vai para a borda dele. */
  const marcarAlvo = (idx: number, antes: boolean) => {
    const b = blocoDoCampo(idx);
    const alvo = { idx: antes ? b.inicio : b.inicio + b.tamanho - 1, antes };
    setAlvoArrasto((prev) =>
      prev && prev.idx === alvo.idx && prev.antes === alvo.antes ? prev : alvo,
    );
  };

  const soltarArrasto = () => {
    if (arrasto && alvoArrasto) {
      setMigrationFields((prev) =>
        moverCampos(prev, arrasto.inicio, arrasto.tamanho, alvoArrasto.idx, alvoArrasto.antes),
      );
    }
    setArrasto(null);
    setAlvoArrasto(null);
  };

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Options */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[#464E5F] mb-1.5">
            Modelo
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-white border border-[#d0d0d0] rounded-lg px-3 py-2 text-sm text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#173872]/30 focus:border-[#173872]/50 transition-colors"
          >
            <optgroup label="Google Gemini (gratuito)">
              {geminiModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="OpenAI (pago)">
              {openaiModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Anthropic Claude (pago)">
              {anthropicModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#464E5F] mb-1.5">
            Instruções adicionais
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="Ex: Manter formatação de tabela, preservar números..."
            className="w-full bg-white border border-[#d0d0d0] rounded-lg px-3 py-2 text-sm text-[#464E5F] resize-none focus:outline-none focus:ring-2 focus:ring-[#173872]/30 focus:border-[#173872]/50 transition-colors"
          />
        </div>
      </div>


      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => correctText(false)}
          disabled={!canRun}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ED3237] hover:bg-[#A5232D] disabled:bg-[#d0d0d0] disabled:text-[#80808F] text-white font-medium transition-all"
        >
          {processingStep !== null ? (
            <Image src="/loading-airton.gif" alt="" width={20} height={20} className="rounded-full" unoptimized />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {processingStep === "extracting"
            ? "Extraindo PDF..."
            : processingStep === "correcting"
            ? "Airton está extraindo as perguntas..."
            : "Extrair Perguntas com o Airton"}
        </button>

        {hasPages && (
          <button
            onClick={() => correctText(true)}
            disabled={!canRun}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] disabled:opacity-50 text-[#464E5F] text-sm transition-colors"
          >
            <Layers className="w-4 h-4" />
            Extrair por Página
          </button>
        )}

        {correctedText && !isProcessing && (
          <button
            onClick={() => {
              const apiKey = getApiKey();
              if (!apiKey) {
                showToast("Configura a API Key primeiro.", "error");
                onOpenApiKeyModal();
                return;
              }
              generateFields(correctedText, apiKey);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0BB783]/10 hover:bg-[#0BB783]/20 text-[#0BB783] text-sm font-medium transition-colors border border-[#0BB783]/30"
          >
            {isGeneratingFields ? (
              <Image src="/loading-airton.gif" alt="" width={20} height={20} className="rounded-full" unoptimized />
            ) : (
              <Table2 className="w-4 h-4" />
            )}
            {isGeneratingFields ? "Airton está gerando os campos..." : "Gerar Campos"}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {processingStep !== null && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Image src="/loading-airton.gif" alt="Airton trabalhando..." width={64} height={64} className="rounded-full" unoptimized />
          <span className="text-sm font-medium text-[#ED3237]">
            {isGeneratingFields
              ? "Airton está gerando os campos..."
              : processingStep === "correcting"
              ? "Airton está extraindo as perguntas..."
              : "Extraindo PDF..."}
          </span>
        </div>
      )}

      {/* Result Tabs */}
      {(correctedText || migrationFields.length > 0) && (
        <div className="pt-4 border-t border-[#e8e8e8] space-y-4">
          {/* Tab Bar */}
          <div className="flex items-center gap-1 bg-[#F9F9F9] border border-[#e8e8e8] rounded-xl p-1 w-fit flex-wrap">
            <button
              onClick={() => setActiveTab("corrected")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "corrected"
                  ? "bg-[#ED3237] text-white shadow-sm"
                  : "text-[#80808F] hover:text-[#464E5F]"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Perguntas Completas
              {correctedText && (
                <span className="ml-1 text-xs opacity-70">
                  ({correctedText.split("\n").filter((l) => l.trim()).length} linhas)
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("fields")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "fields"
                  ? "bg-[#0BB783] text-white shadow-sm"
                  : "text-[#80808F] hover:text-[#464E5F]"
              }`}
            >
              <Table2 className="w-4 h-4" />
              {rotuloCampos}
              {migrationFields.length > 0 && (
                <span className="ml-1 text-xs opacity-70">
                  ({migrationFields.length})
                </span>
              )}
            </button>
            {correctedText && (
              <button
                onClick={() => setActiveTab("sections")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "sections"
                    ? "bg-[#22B9FF] text-white shadow-sm"
                    : "text-[#80808F] hover:text-[#464E5F]"
                }`}
              >
                <Tag className="w-4 h-4" />
                Status / Seções
                {workingGroups.length > 0 && (
                  <span className="ml-1 text-xs opacity-70">({workingGroups.length})</span>
                )}
              </button>
            )}
            {migrationFields.length > 0 && workingGroups.length > 0 && (
              <button
                onClick={() => setActiveTab("perguntas")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "perguntas"
                    ? "bg-[#8950FC] text-white shadow-sm"
                    : "text-[#80808F] hover:text-[#464E5F]"
                }`}
              >
                <Database className="w-4 h-4" />
                {isPlanoManutencao ? "Perguntas por Página" : "Perguntas por Status"}
                <span className="ml-1 text-xs opacity-70">({migrationFields.length})</span>
              </button>
            )}
          </div>

          {/* Tab: Perguntas Completas */}
          {activeTab === "corrected" && correctedText && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#0BB783] flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Texto Corrigido
                  <AirtonBadge />
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(correctedText);
                      showToast("Texto corrigido copiado!", "success");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([correctedText], {
                        type: "text/plain;charset=utf-8",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "texto_corrigido.txt";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar
                  </button>
                  <button
                    onClick={() => setShowDiff(!showDiff)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Comparar
                  </button>
                </div>
              </div>

              <textarea
                value={correctedText}
                onChange={(e) => setCorrectedText(e.target.value)}
                rows={12}
                className="w-full bg-white border border-[#0BB783]/40 rounded-lg p-4 text-sm font-mono text-[#464E5F] resize-y focus:outline-none focus:ring-2 focus:ring-[#0BB783]/30 transition-colors"
              />

              {showDiff && (
                <DiffView original={extractedText} corrected={correctedText} />
              )}
            </div>
          )}

          {/* Tab: Campos (migration ou, no plano, campos do formulário) */}
          {activeTab === "fields" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#0BB783] flex items-center gap-2">
                  <Table2 className="w-4 h-4" />
                  {rotuloCampos}
                  <AirtonBadge />
                </h3>
                <div className="flex gap-2">
                  {/* Pós-venda: os campos já saem na ordem do formulário, com etapa e seção —
                      a skill do acampa-checklist monta o imprimir.php a partir deles. */}
                  {checklistType === "pos-venda-inspecao" && migrationFields.length > 0 && (
                    <button
                      onClick={() => setEnviarAberto(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#173872] hover:bg-[#122d5e] text-white text-sm font-medium transition-colors"
                      title="Grava as folhas e os campos (pos_venda.json) no acampa-checklist e gera o comando da skill checklist-pos-venda."
                    >
                      <Send className="w-3.5 h-3.5" />
                      Enviar para o Claude Code
                    </button>
                  )}
                  {correctedText && (
                    <button
                      onClick={() => {
                        const apiKey = getApiKey();
                        if (!apiKey) {
                          showToast("Configura a API Key primeiro.", "error");
                          onOpenApiKeyModal();
                          return;
                        }
                        generateFields(correctedText, apiKey);
                      }}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] disabled:opacity-50 text-[#464E5F] text-sm transition-colors"
                    >
                      {isGeneratingFields ? (
                        <Image src="/loading-airton.gif" alt="" width={16} height={16} className="rounded-full" unoptimized />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Regenerar
                    </button>
                  )}
                  {migrationFields.length > 0 && (
                    <>
                      <button
                        onClick={() => {
                          const campos = migrationFields
                            .map((f) => f.campo)
                            .join("\n");
                          navigator.clipboard.writeText(campos);
                          showToast("Campos copiados!", "success");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                      >
                        <List className="w-3.5 h-3.5" />
                        Copiar campos
                      </button>
                      <button
                        onClick={() => {
                          const csv =
                            "campo\tpergunta\n" +
                            migrationFields
                              .map(
                                (f) =>
                                  `"${f.campo}"\t"${f.pergunta.replace(/"/g, '""')}"`
                              )
                              .join("\n");
                          navigator.clipboard.writeText(csv);
                          showToast("Tabela copiada (TSV)!", "success");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar TSV
                      </button>
                      <button
                        onClick={() => {
                          const json = JSON.stringify(migrationFields, null, 2);
                          const blob = new Blob([json], {
                            type: "application/json;charset=utf-8",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "campos_migration.json";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Baixar JSON
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isGeneratingFields ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <Image src="/loading-airton.gif" alt="" width={72} height={72} className="rounded-full" unoptimized />
                  <span className="text-sm font-medium text-[#ED3237]">Airton está gerando os campos...</span>
                </div>
              ) : migrationFields.length > 0 ? (
                <div className="space-y-6">
                  {/* Tabela campo + pergunta — editável */}
                  <div className="rounded-lg border border-[#e0e0e0] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F9F9F9] border-b border-[#e0e0e0]">
                          <th className="w-6" />
                          <th className="text-left px-4 py-3 text-[#0BB783] font-semibold w-52">campo</th>
                          <th className="text-left px-4 py-3 text-[#464E5F] font-semibold">pergunta</th>
                          <th
                            className={`text-left px-2 py-3 text-[#80808F] font-medium text-xs ${
                              isPlanoManutencao ? "w-40" : "w-10"
                            }`}
                          >
                            {isPlanoManutencao ? "escala" : ""}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {migrationFields.map((field, idx) => {
                          const modo: ModoKmTempo = isPlanoManutencao
                            ? modoKmTempo(migrationFields, idx)
                            : "nenhum";
                          // A seção vem da IA junto com o campo. Repetir o título em cada
                          // linha polui; ele entra uma vez, quando muda — é o que situa o
                          // campo na folha ("VEÍCULO A MEIA ALTURA").
                          const secao = (field.secao ?? "").trim();
                          const secaoAnterior = (migrationFields[idx - 1]?.secao ?? "").trim();
                          const abreSecao = !!secao && secao !== secaoAnterior;
                          const emArrasto =
                            !!arrasto && idx >= arrasto.inicio && idx < arrasto.inicio + arrasto.tamanho;
                          // Linha-guia: acima da linha (soltar antes) ou abaixo (soltar depois).
                          const guia =
                            arrasto && alvoArrasto?.idx === idx && !emArrasto
                              ? alvoArrasto.antes
                                ? "shadow-[inset_0_2px_0_#22B9FF]"
                                : "shadow-[inset_0_-2px_0_#22B9FF]"
                              : "";
                          return (
                          <Fragment key={idx}>
                          {abreSecao && (
                            <tr
                              className="bg-[#22B9FF]/5 border-b border-[#22B9FF]/20"
                              // Soltar no título da seção = virar o 1º campo dela.
                              onDragOver={(e) => {
                                if (!arrasto) return;
                                e.preventDefault();
                                marcarAlvo(idx, true);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                soltarArrasto();
                              }}
                            >
                              <td
                                colSpan={4}
                                className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#22B9FF]"
                              >
                                {secao}
                              </td>
                            </tr>
                          )}
                          <tr
                            className={`border-b border-[#e8e8e8] hover:bg-[#FAFAFA] transition-colors ${
                              modo === "ambos" ? "bg-[#22B9FF]/5" : ""
                            } ${emArrasto ? "opacity-40" : ""} ${guia}`}
                            onDragOver={(e) => {
                              if (!arrasto) return;
                              e.preventDefault();
                              const r = e.currentTarget.getBoundingClientRect();
                              marcarAlvo(idx, e.clientY < r.top + r.height / 2);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              soltarArrasto();
                            }}
                          >
                            <td className="pl-2 py-2 w-6">
                              {/* Só a alça é arrastável: a linha inteira arrastável roubaria
                                  a seleção de texto dos inputs. */}
                              <span
                                draggable
                                onDragStart={(e) => {
                                  const tr = e.currentTarget.closest("tr");
                                  if (tr) e.dataTransfer.setDragImage(tr, 16, 16);
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", String(idx));
                                  setArrasto(blocoDoCampo(idx));
                                }}
                                onDragEnd={() => {
                                  setArrasto(null);
                                  setAlvoArrasto(null);
                                }}
                                className="flex cursor-grab active:cursor-grabbing text-[#b0b0bf] hover:text-[#22B9FF]"
                                title="Arraste para mudar o campo de posição ou de seção"
                              >
                                <GripVertical className="w-4 h-4" />
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={field.campo}
                                onChange={(e) =>
                                  setMigrationFields((prev) =>
                                    prev.map((f, i) => i === idx ? { ...f, campo: e.target.value } : f)
                                  )
                                }
                                className="w-full bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono text-[#0BB783] focus:outline-none focus:ring-1 focus:ring-[#0BB783]/40 transition-colors"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={field.pergunta}
                                onChange={(e) =>
                                  setMigrationFields((prev) =>
                                    prev.map((f, i) => i === idx ? { ...f, pergunta: e.target.value } : f)
                                  )
                                }
                                className="w-full bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs text-[#464E5F] focus:outline-none focus:ring-1 focus:ring-[#0BB783]/40 transition-colors"
                              />
                            </td>
                            <td className="px-2 py-2 text-center whitespace-nowrap">
                              {isPlanoManutencao && (
                                <select
                                  value={modo}
                                  onChange={(e) =>
                                    setMigrationFields((prev) =>
                                      aplicarModoKmTempo(prev, idx, e.target.value as ModoKmTempo)
                                    )
                                  }
                                  className={`mr-1 rounded border px-1 py-1 text-[11px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-[#22B9FF]/40 ${
                                    modo === "nenhum"
                                      ? "bg-white text-[#b0b0bf] border-[#e0e0e0]"
                                      : "bg-[#22B9FF]/10 text-[#22B9FF] border-[#22B9FF]/40"
                                  }`}
                                  title="Escala do item na folha: só Km, só Tempo, ou os dois (aí vira dois campos)"
                                >
                                  <option value="nenhum">sem escala</option>
                                  <option value="km">só Km</option>
                                  <option value="tempo">só Tempo</option>
                                  <option value="ambos">Km + Tempo</option>
                                </select>
                              )}
                              <button
                                onClick={() =>
                                  setMigrationFields((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="p-1 rounded hover:bg-[#F64E60]/10 text-[#b0b0bf] hover:text-[#F64E60] transition-colors"
                                title="Remover campo"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                          </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="px-3 py-2 bg-[#F9F9F9] border-t border-[#e0e0e0]">
                      <button
                        onClick={() =>
                          setMigrationFields((prev) => [...prev, { campo: "", pergunta: "" }])
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0BB783]/10 hover:bg-[#0BB783]/20 text-[#0BB783] text-sm transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar campo
                      </button>
                    </div>
                  </div>

                  {/* Estrutura da Migration — o plano de manutenção não tem migration:
                      os campos existem só como coluna `campo` das perguntas e como
                      propriedade lida no PHP do PDF. */}
                  {isPlanoManutencao ? (
                    <div className="rounded-lg border border-[#e0e0e0] bg-[#F9F9F9] px-4 py-3">
                      <p className="text-xs text-[#80808F] leading-relaxed">
                        <strong className="text-[#464E5F]">Sem migration.</strong> No plano de
                        manutenção os campos não viram colunas de tabela — eles são a coluna{" "}
                        <code className="font-mono">campo</code> em{" "}
                        <code className="font-mono">formulario_perguntas</code> e as propriedades que
                        o PHP do PDF lê (<code className="font-mono">$resposta_formulario-&gt;campo</code>).
                        O banco sai na aba <strong>Perguntas por Status</strong>.
                      </p>
                    </div>
                  ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[#464E5F] flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-[#FFB822]" />
                        Estrutura da Migration (Laravel)
                      </h4>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            buildMigrationCode(migrationTableName, migrationFields)
                          );
                          showToast("Migration copiada!", "success");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar
                      </button>
                    </div>
                    {temCamposEssenciais(checklistType) && (
                      <label className="flex items-start gap-2 text-xs text-[#464E5F] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={incluirEssenciais}
                          onChange={(e) => setIncluirEssenciais(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          Incluir os campos essenciais (status 0) deste modelo — chave, concessionária,
                          consultor, veículo, cliente, datas ({camposEssenciais(checklistType).length} colunas).
                          Não vêm da folha; o bloco foi copiado da migration mais recente do tipo.
                        </span>
                      </label>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[#80808F] whitespace-nowrap">
                        Nome da tabela:
                      </label>
                      <input
                        type="text"
                        value={migrationTableName}
                        onChange={(e) => setMigrationTableName(e.target.value)}
                        placeholder="tabela_generica"
                        className="flex-1 max-w-xs bg-white border border-[#d0d0d0] rounded-lg px-3 py-1.5 text-sm font-mono text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#FFB822]/40 focus:border-[#FFB822]/50 transition-colors"
                      />
                    </div>
                    <pre className="bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg p-4 text-xs font-mono text-[#464E5F] overflow-auto max-h-96 whitespace-pre">
                      {buildMigrationCode(migrationTableName, migrationFields)}
                    </pre>
                    {/* Grava o arquivo da migration no repositório da API. Rodar o migrate
                        continua com o usuário. */}
                    <div className="flex flex-wrap items-start gap-2 rounded-lg border border-[#e0e0e0] bg-[#F9F9F9] px-3 py-2">
                      <div className="flex-1 min-w-[260px] space-y-1">
                        <span className="text-xs text-[#80808F]">
                          {REPOSITORIOS[repoMigrationChave].rotulo} (onde está na sua máquina):
                        </span>
                        <CampoRepositorio chave={repoMigrationChave} valor={repoMigration} onChange={setRepoMigration} />
                      </div>
                      <button
                        onClick={() => void gravarMigration()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFB822] hover:bg-[#f0a800] text-white text-xs font-semibold transition-colors"
                        title="Grava database/migrations/<data>_create_..._table.php no repositório. O migrate você roda."
                      >
                        <Download className="w-3.5 h-3.5" />
                        Gravar no repositório
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-[#80808F]">
                  <Table2 className="w-8 h-8 opacity-40" />
                  <p className="text-sm">
                    Nenhum campo gerado. Corrija o texto primeiro.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab: Status / Seções */}
          {activeTab === "sections" && correctedText && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#80808F] whitespace-nowrap">
                    Máx. perguntas por seção:
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxQPerSection || ""}
                    onChange={(e) => setMaxQPerSection(Number(e.target.value))}
                    placeholder="manual"
                    className="w-20 bg-white border border-[#d0d0d0] rounded-lg px-2 py-1 text-sm text-center text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#22B9FF]/40 transition-colors"
                  />
                  <button
                    onClick={() => handleAutoSplit(maxQPerSection)}
                    disabled={!maxQPerSection}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22B9FF]/10 hover:bg-[#22B9FF]/20 disabled:opacity-40 disabled:cursor-not-allowed text-[#22B9FF] text-sm transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Auto-dividir
                  </button>
                  <button
                    onClick={handleAddGroup}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22B9FF]/10 hover:bg-[#22B9FF]/20 text-[#22B9FF] text-sm transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nova Seção
                  </button>
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={handleResetSections}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Resetar
                  </button>
                  {workingGroups.length > 0 && (
                    <>
                      <button
                        onClick={() => {
                          const list = workingGroups
                            .map((g) => getDisplayLabel(workingGroups, g))
                            .join("\n");
                          navigator.clipboard.writeText(list);
                          showToast("Seções copiadas!", "success");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar lista
                      </button>
                      <button
                        onClick={() => {
                          const numbered = workingGroups
                            .map((g, i) => `${i + 1}. ${getDisplayLabel(workingGroups, g)}`)
                            .join("\n");
                          navigator.clipboard.writeText(numbered);
                          showToast("Lista numerada copiada!", "success");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
                      >
                        <List className="w-3.5 h-3.5" />
                        Copiar numerado
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Section list */}
              {workingGroups.length > 0 ? (
                <div className="space-y-1.5">
                  {workingGroups.map((group, idx) => {
                    const label = getDisplayLabel(workingGroups, group);
                    const qCount = group.questions.length;
                    const isOver = maxQPerSection > 0 && qCount > maxQPerSection;
                    const isEditing = editingIdx === idx;
                    return (
                      <div
                        key={group.id}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                          isOver
                            ? "bg-[#F64E60]/5 border-[#F64E60]/30"
                            : "bg-[#F9F9F9] border-[#e8e8e8]"
                        }`}
                      >
                        {/* Número */}
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#22B9FF]/15 text-[#22B9FF] text-xs flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>

                        {/* Label / Input de edição */}
                        {isEditing ? (
                          <input
                            autoFocus
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleRenameGroup(idx, editingName);
                                setEditingIdx(null);
                              } else if (e.key === "Escape") {
                                setEditingIdx(null);
                              }
                            }}
                            onBlur={() => {
                              handleRenameGroup(idx, editingName);
                              setEditingIdx(null);
                            }}
                            className="flex-1 bg-white border border-[#22B9FF]/50 rounded px-2 py-0.5 text-sm text-[#464E5F] focus:outline-none focus:ring-1 focus:ring-[#22B9FF]/40"
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingIdx(idx);
                              setEditingName(group.baseLabel);
                            }}
                            className={`text-sm font-medium flex-1 cursor-pointer transition-colors group flex items-center gap-1 ${
                              isOver ? "text-[#F64E60]" : "text-[#464E5F] hover:text-[#173872]"
                            }`}
                            title="Clique para editar o nome"
                          >
                            {label}
                            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                          </span>
                        )}

                        {/* Contagem de perguntas */}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-mono flex-shrink-0 ${
                          isOver
                            ? "bg-[#F64E60]/10 text-[#F64E60]"
                            : "bg-[#e8e8e8] text-[#80808F]"
                        }`}>
                          {qCount} {qCount === 1 ? "pergunta" : "perguntas"}
                        </span>

                        {/* Botões de ação */}
                        <div className="flex gap-1 flex-shrink-0 items-center">
                          <button
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            className="p-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] disabled:opacity-25 disabled:cursor-not-allowed text-[#80808F] transition-colors"
                            title="Mover para cima"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === workingGroups.length - 1}
                            className="p-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] disabled:opacity-25 disabled:cursor-not-allowed text-[#80808F] transition-colors"
                            title="Mover para baixo"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>

                          {qCount >= 2 && (
                            <button
                              onClick={() => handleSplit(idx)}
                              className="px-2 py-1 rounded bg-[#FFB822]/10 hover:bg-[#FFB822]/20 text-[#FFB822] text-xs transition-colors"
                              title="Dividir ao meio"
                            >
                              ÷ Dividir
                            </button>
                          )}
                          {idx < workingGroups.length - 1 && (
                            <button
                              onClick={() => handleJoin(idx)}
                              className="px-2 py-1 rounded bg-[#22B9FF]/10 hover:bg-[#22B9FF]/20 text-[#22B9FF] text-xs transition-colors"
                              title="Unir com a próxima seção"
                            >
                              + Unir
                            </button>
                          )}

                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(label);
                              showToast("Copiado!", "success");
                            }}
                            className="p-1.5 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#80808F] transition-colors"
                            title="Copiar nome"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(idx)}
                            className="p-1.5 rounded bg-[#F9F9F9] hover:bg-[#F64E60]/10 border border-[#e0e0e0] hover:border-[#F64E60]/30 text-[#80808F] hover:text-[#F64E60] transition-colors"
                            title="Remover seção"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-[#80808F]">
                  <Tag className="w-8 h-8 opacity-40" />
                  <p className="text-sm">Nenhuma seção detectada no texto corrigido.</p>
                  <p className="text-xs text-[#80808F]/70 text-center max-w-xs">
                    As seções são detectadas automaticamente quando o texto contém títulos numerados em maiúsculas, como &quot;1 NOME DA SEÇÃO&quot;.
                  </p>
                </div>
              )}

              {/* Formato DB + SQL toolbar */}
              {workingGroups.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#e8e8e8]">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[#80808F]">ID do checklist:</label>
                    <input
                      type="text"
                      value={checklistId}
                      onChange={(e) => setChecklistId(e.target.value)}
                      className="w-20 bg-white border border-[#d0d0d0] rounded-lg px-2 py-1 text-sm text-center text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#22B9FF]/40 transition-colors"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => gerarStatusDb("planilha")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22B9FF]/10 hover:bg-[#22B9FF]/20 text-[#22B9FF] text-sm font-medium transition-colors border border-[#22B9FF]/30"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Formato DB
                    </button>
                    <button
                      onClick={() => gerarStatusDb("mysql")}
                      title="As mesmas colunas, na escrita do MySQL: aspas simples, vírgula e NULL sem aspas"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0BB783]/10 hover:bg-[#0BB783]/20 text-[#0BB783] text-sm font-medium transition-colors border border-[#0BB783]/30"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Formato MySQL
                    </button>
                    <button
                      onClick={() => {
                        setStatusSqlOutput(buildSqlInserts(workingGroups));
                        setShowStatusSql(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8950FC]/10 hover:bg-[#8950FC]/20 text-[#8950FC] text-sm font-medium transition-colors border border-[#8950FC]/30"
                    >
                      <Database className="w-3.5 h-3.5" />
                      Gerar SQL
                    </button>
                  </div>
                </div>
              )}

              {/* Formato DB output */}
              {showStatusDb && statusDbOutput && (
                <div className="space-y-2 pt-3 border-t border-[#e8e8e8]">
                  <div className="flex items-center justify-between">
                    <h4
                      className={`text-sm font-semibold ${
                        statusDbFormato === "mysql" ? "text-[#0BB783]" : "text-[#22B9FF]"
                      }`}
                    >
                      {statusDbFormato === "mysql"
                        ? "Formato MySQL (checklist_status)"
                        : "Formato DB (checklist_status)"}
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(statusDbOutput);
                          showToast(
                            statusDbFormato === "mysql" ? "Formato MySQL copiado!" : "Formato DB copiado!",
                            "success",
                          );
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22B9FF]/10 hover:bg-[#22B9FF]/20 text-[#22B9FF] text-sm transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar
                      </button>
                      <button
                        onClick={() => setShowStatusDb(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#80808F] text-sm transition-colors"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                  <pre className="bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg p-3 text-xs text-[#464E5F] overflow-x-auto whitespace-pre max-h-96">
                    {statusDbOutput}
                  </pre>
                </div>
              )}

              {/* SQL output */}
              {showStatusSql && statusSqlOutput && (
                <div className="space-y-2 pt-3 border-t border-[#e8e8e8]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[#8950FC] flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      SQL INSERT (checklist_status)
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(statusSqlOutput);
                          showToast("SQL copiado!", "success");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8950FC]/10 hover:bg-[#8950FC]/20 text-[#8950FC] text-sm transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar
                      </button>
                      <button
                        onClick={() => setShowStatusSql(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#80808F] text-sm transition-colors"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                  <pre className="bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg p-3 text-xs text-[#464E5F] overflow-x-auto whitespace-pre max-h-96">
                    {statusSqlOutput}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Tab: Perguntas por Status */}
          {activeTab === "perguntas" && migrationFields.length > 0 && workingGroups.length > 0 && (
            <PerguntasStatusTab
              groups={workingGroups}
              fields={migrationFields}
              checklistId={checklistId}
              onChecklistIdChange={setChecklistId}
              checklistType={checklistType ?? "roteiro-entrega-tecnica"}
              initialPerguntas={initialData?.perguntas}
              initialPlano={initialData?.plano_manutencao}
              onPerguntasChange={handlePerguntasChange}
            />
          )}
        </div>
      )}
      <ScrollButtons containerRef={containerRef} />
      {enviarAberto && (
        <EnviarPosVendaModal
          campos={migrationFields}
          pdfFile={pdfFile}
          images={images}
          onClose={() => setEnviarAberto(false)}
        />
      )}
    </div>
  );
}

function DiffView({
  original,
  corrected,
}: {
  original: string;
  corrected: string;
}) {
  const oldWords = original.split(/(\s+)/);
  const newWords = corrected.split(/(\s+)/);

  const maxLen = Math.max(oldWords.length, newWords.length);
  if (maxLen > 5000) {
    return (
      <div className="p-4 bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg text-sm text-[#80808F]">
        Texto muito longo para comparação visual.
      </div>
    );
  }

  const dp: number[][] = Array.from({ length: oldWords.length + 1 }, () =>
    Array(newWords.length + 1).fill(0)
  );

  for (let i = 0; i <= oldWords.length; i++) dp[i][0] = i;
  for (let j = 0; j <= newWords.length; j++) dp[0][j] = j;

  for (let i = 1; i <= oldWords.length; i++) {
    for (let j = 1; j <= newWords.length; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] =
          1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  const ops: { type: "equal" | "added" | "removed"; value: string }[] = [];
  let i = oldWords.length,
    j = newWords.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      ops.unshift({ type: "equal", value: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] <= dp[i - 1][j])) {
      ops.unshift({ type: "added", value: newWords[j - 1] });
      j--;
    } else {
      ops.unshift({ type: "removed", value: oldWords[i - 1] });
      i--;
    }
  }

  return (
    <div className="p-4 bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg text-sm font-mono whitespace-pre-wrap max-h-80 overflow-auto">
      {ops.map((op, idx) => (
        <span
          key={idx}
          className={
            op.type === "added"
              ? "bg-[#0BB783]/20 text-[#0BB783]"
              : op.type === "removed"
              ? "bg-[#F64E60]/20 text-[#F64E60] line-through"
              : "text-[#464E5F]"
          }
        >
          {op.value}
        </span>
      ))}
      <div className="mt-3 pt-3 border-t border-[#e8e8e8] flex gap-4 text-xs text-[#80808F]">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-[#0BB783]/20 rounded" /> Adicionado
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-[#F64E60]/20 rounded" /> Removido
        </span>
      </div>
    </div>
  );
}
