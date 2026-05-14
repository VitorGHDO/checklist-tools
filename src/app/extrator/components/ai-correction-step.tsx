"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Sparkles,
  Layers,
  Copy,
  Download,
  ArrowLeftRight,
  Loader2,
  Table2,
  RefreshCw,
  FileCode,
  List,
  Tag,
  ChevronUp,
  ChevronDown,
  Plus,
  Pencil,
} from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { AI_MODELS, type UploadedImage } from "@/lib/types";
import type { MigrationField } from "@/app/api/generate-fields/route";

interface WorkingGroup {
  id: string;
  baseLabel: string;
  questions: string[];
}

type Project = "entrega-impecavel" | "pos-venda";

interface Props {
  pdfFile: File | null;
  images: UploadedImage[];
  project: Project;
  onOpenApiKeyModal: () => void;
}

type ProcessingStep = "extracting" | "correcting" | null;
type ResultTab = "corrected" | "fields" | "sections";

export function AiCorrectionStep({
  pdfFile,
  images,
  project,
  onOpenApiKeyModal,
}: Props) {
  const [model, setModel] = useState("gemini-2.5-flash");
  const [keepFormat, setKeepFormat] = useState(true);
  const [fixOrtho, setFixOrtho] = useState(true);
  const [matchImage, setMatchImage] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [correctedText, setCorrectedText] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [extractedPages, setExtractedPages] = useState<string[]>([]);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [migrationFields, setMigrationFields] = useState<MigrationField[]>([]);
  const [activeTab, setActiveTab] = useState<ResultTab>("corrected");
  const [migrationTableName, setMigrationTableName] = useState("tabela_generica");
  const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>([]);
  const [maxQPerSection, setMaxQPerSection] = useState<number>(0);
  const [checklistId, setChecklistId] = useState("217");
  const [isGeneratingFields, setIsGeneratingFields] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showSql, setShowSql] = useState(false);

  const isProcessing = processingStep !== null || isGeneratingFields;

  const getApiKey = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("checklist_tools_api_key");
    if (!stored) return null;
    try {
      return atob(stored);
    } catch {
      return null;
    }
  }, []);

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

  const generateFields = useCallback(
    async (text: string, apiKey: string) => {
      setIsGeneratingFields(true);
      try {
        const res = await fetch("/api/generate-fields", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, model, apiKey }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.fields)) {
          setMigrationFields(data.fields);
          setActiveTab("fields");
          showToast(`${data.fields.length} campos de migration gerados!`, "success");
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
    [model]
  );

  const correctText = useCallback(
    async (perPage: boolean) => {
      const apiKey = getApiKey();
      if (!apiKey) {
        showToast("Configure sua API Key primeiro.", "error");
        onOpenApiKeyModal();
        return;
      }
      if (!pdfFile) {
        showToast("Selecione um PDF na etapa anterior.", "error");
        return;
      }
      if (images.length === 0) {
        showToast("Envie pelo menos uma imagem de referência.", "error");
        return;
      }

      try {
        const extracted = await extractPdf();
        if (!extracted) return;

        setProcessingStep("correcting");
        const { text, pages } = extracted;

        let finalText = "";

        if (perPage && pages.length > 1) {
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
          showToast("Correção por página concluída!", "success");
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
            showToast("Texto corrigido com sucesso!", "success");
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
        showToast("Erro ao processar", "error");
      } finally {
        setProcessingStep(null);
      }
    },
    [pdfFile, images, model, keepFormat, fixOrtho, matchImage, instructions, getApiKey, onOpenApiKeyModal, extractPdf, project, generateFields]
  );

  function buildFormData(text: string, apiKey: string, pageNumber?: number): FormData {
    const fd = new FormData();
    fd.append("text", text);
    fd.append("model", model);
    fd.append("apiKey", apiKey);
    fd.append("keepFormat", keepFormat ? "1" : "0");
    fd.append("fixOrtho", fixOrtho ? "1" : "0");
    fd.append("matchImage", matchImage ? "1" : "0");
    fd.append("additionalInstructions", instructions);
    fd.append("project", project);
    if (pageNumber) fd.append("pageNumber", String(pageNumber));
    return fd;
  }

  function parseSectionsFromText(text: string): { id: string; name: string; questions: string[] }[] {
    const sectionRegex = /^\d+\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇÀÈÌÒÙÄËÏÖÜ]/;
    const lines = text.split("\n");
    const sections: { id: string; name: string; questions: string[] }[] = [];
    let current: { id: string; name: string; questions: string[] } | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("---")) continue;
      if (sectionRegex.test(line)) {
        if (current) sections.push(current);
        const name = line
          .replace(/^\d+\s+/, "")
          .replace(/\s+STATUS\s*$/i, "")
          .trim();
        current = { id: `sec-${sections.length}`, name, questions: [] };
      } else if (current) {
        current.questions.push(line);
      }
    }
    if (current) sections.push(current);
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
    const secs = parseSectionsFromText(correctedText);
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

  function handleAddGroup() {
    setWorkingGroups((prev) => [
      ...prev,
      { id: `manual-${Date.now()}`, baseLabel: "Nova Seção", questions: [] },
    ]);
  }

  useEffect(() => {
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

  function buildMigrationCode(tableName: string, fields: MigrationField[]): string {
    const safeTable = tableName.trim() || "tabela_generica";
    const cols = fields
      .map((f) => `            $table->integer('${f.campo}')->nullable();`)
      .join("\n");
    return `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('${safeTable}', function (Blueprint $table) {
${cols}
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('${safeTable}');
    }
};`;
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
  const canRun = !!pdfFile && images.length > 0 && !isProcessing;
  const hasPages = extractedPages.length > 1;

  return (
    <div className="space-y-6">
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

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer text-[#464E5F]">
          <input
            type="checkbox"
            checked={keepFormat}
            onChange={(e) => setKeepFormat(e.target.checked)}
            className="rounded border-[#d0d0d0] text-[#ED3237] focus:ring-[#ED3237]/30"
          />
          Preservar formatação
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer text-[#464E5F]">
          <input
            type="checkbox"
            checked={fixOrtho}
            onChange={(e) => setFixOrtho(e.target.checked)}
            className="rounded border-[#d0d0d0] text-[#ED3237] focus:ring-[#ED3237]/30"
          />
          Corrigir ortografia
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer text-[#464E5F]">
          <input
            type="checkbox"
            checked={matchImage}
            onChange={(e) => setMatchImage(e.target.checked)}
            className="rounded border-[#d0d0d0] text-[#ED3237] focus:ring-[#ED3237]/30"
          />
          Coincidir com imagens
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => correctText(false)}
          disabled={!canRun}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ED3237] hover:bg-[#A5232D] disabled:bg-[#d0d0d0] disabled:text-[#80808F] text-white font-medium transition-all"
        >
          {processingStep !== null ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {processingStep === "extracting"
            ? "Extraindo PDF..."
            : processingStep === "correcting"
            ? "Corrigindo com IA..."
            : "Corrigir com IA"}
        </button>

        {hasPages && (
          <button
            onClick={() => correctText(true)}
            disabled={!canRun}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] disabled:opacity-50 text-[#464E5F] text-sm transition-colors"
          >
            <Layers className="w-4 h-4" />
            Corrigir por Página
          </button>
        )}

        {correctedText && !isProcessing && (
          <button
            onClick={() => {
              const apiKey = getApiKey();
              if (!apiKey) {
                showToast("Configure sua API Key primeiro.", "error");
                onOpenApiKeyModal();
                return;
              }
              generateFields(correctedText, apiKey);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0BB783]/10 hover:bg-[#0BB783]/20 text-[#0BB783] text-sm font-medium transition-colors border border-[#0BB783]/30"
          >
            {isGeneratingFields ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Table2 className="w-4 h-4" />
            )}
            {isGeneratingFields ? "Gerando campos..." : "Gerar Campos"}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-[#80808F]">
            {[
              { label: "Extrair PDF", active: processingStep === "extracting" },
              { label: "Corrigir texto", active: processingStep === "correcting" },
              { label: "Gerar campos", active: isGeneratingFields },
            ].map((s) => (
              <span key={s.label} className={s.active ? "text-[#ED3237] font-medium" : ""}>
                {s.label}
              </span>
            ))}
          </div>
          <div className="w-full bg-[#e8e8e8] rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-[#ED3237] rounded-full transition-all duration-700 ease-in-out"
              style={{
                width: isGeneratingFields
                  ? "90%"
                  : processingStep === "correcting"
                  ? "60%"
                  : "25%",
              }}
            />
          </div>
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
              Campos de Migration
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
          </div>

          {/* Tab: Perguntas Completas */}
          {activeTab === "corrected" && correctedText && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#0BB783] flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Texto Corrigido
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

          {/* Tab: Campos de Migration */}
          {activeTab === "fields" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#0BB783] flex items-center gap-2">
                  <Table2 className="w-4 h-4" />
                  Campos de Migration
                </h3>
                <div className="flex gap-2">
                  {correctedText && (
                    <button
                      onClick={() => {
                        const apiKey = getApiKey();
                        if (!apiKey) {
                          showToast("Configure sua API Key primeiro.", "error");
                          onOpenApiKeyModal();
                          return;
                        }
                        generateFields(correctedText, apiKey);
                      }}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] disabled:opacity-50 text-[#464E5F] text-sm transition-colors"
                    >
                      {isGeneratingFields ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
                <div className="flex items-center justify-center gap-3 py-12 text-[#80808F]">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Gerando campos com IA...</span>
                </div>
              ) : migrationFields.length > 0 ? (
                <div className="space-y-6">
                  {/* Tabela campo + pergunta */}
                  <div className="overflow-auto rounded-lg border border-[#e0e0e0]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F9F9F9] border-b border-[#e0e0e0]">
                          <th className="text-left px-4 py-3 text-[#0BB783] font-semibold w-56">
                            campo
                          </th>
                          <th className="text-left px-4 py-3 text-[#464E5F] font-semibold">
                            pergunta
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {migrationFields.map((field, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-[#e8e8e8] hover:bg-[#F9F9F9] transition-colors"
                          >
                            <td className="px-4 py-3 font-mono text-[#0BB783] whitespace-nowrap">
                              {field.campo}
                            </td>
                            <td className="px-4 py-3 text-[#464E5F]">
                              {field.pergunta}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Estrutura da Migration */}
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
                  </div>
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

              {/* Formato DB + SQL */}
              {workingGroups.length > 0 && (
                <>
                  {/* Formato DB */}
                  <div className="space-y-3 pt-3 border-t border-[#e8e8e8]">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-[#22B9FF]">
                        Formato DB (checklist_status)
                      </h4>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[#80808F]">ID do checklist:</label>
                        <input
                          type="text"
                          value={checklistId}
                          onChange={(e) => setChecklistId(e.target.value)}
                          className="w-20 bg-white border border-[#d0d0d0] rounded-lg px-2 py-1 text-sm text-center text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#22B9FF]/40 transition-colors"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(buildStatusRows(workingGroups));
                            showToast("Formato DB copiado!", "success");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22B9FF]/10 hover:bg-[#22B9FF]/20 text-[#22B9FF] text-sm transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copiar
                        </button>
                      </div>
                    </div>
                    <pre className="bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg p-3 text-xs text-[#464E5F] overflow-x-auto whitespace-pre">
                      {buildStatusRows(workingGroups)}
                    </pre>
                  </div>

                  {/* SQL INSERTs */}
                  <div className="pt-3 border-t border-[#e8e8e8]">
                    <button
                      onClick={() => setShowSql((v) => !v)}
                      className="flex items-center gap-2 text-sm font-semibold text-[#173872] hover:text-[#143266] transition-colors"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${showSql ? "rotate-180" : ""}`} />
                      SQL INSERT (checklist_status)
                    </button>

                    {showSql && (
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(buildSqlInserts(workingGroups));
                              showToast("SQL copiado!", "success");
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#173872]/10 hover:bg-[#173872]/20 text-[#173872] text-sm transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copiar SQL
                          </button>
                        </div>
                        <pre className="bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg p-3 text-xs text-[#464E5F] overflow-x-auto whitespace-pre">
                          {buildSqlInserts(workingGroups)}
                        </pre>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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
