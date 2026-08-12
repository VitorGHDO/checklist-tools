"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  FileText,
  Sparkles,
  ArrowLeft,
  Key,
  Truck,
  ShoppingBag,
  Construction,
  FolderOpen,
  ClipboardList,
  Package,
  Search,
  ClipboardCheck,
  CalendarCheck,
} from "lucide-react";
import Link from "next/link";
import { FilesUploadStep } from "./components/files-upload-step";
import { AiCorrectionStep } from "./components/ai-correction-step";
import { ApiKeyModal } from "./components/api-key-modal";
import { ToastContainer } from "@/components/ui/toast";
import { ChecklistNameStep } from "./components/checklist-name-step";
import { useDraftStorage, createEmptyDados } from "@/hooks/useDraftStorage";
import type { UploadedImage, ChecklistType, ChecklistDraft, DraftDados } from "@/lib/types";

type Project = "entrega-impecavel" | "pos-venda";

interface TipoCard {
  id: ChecklistType | string;
  name: string;
  description: string;
  icon: React.ElementType;
  available: boolean;
}

const CHECKLIST_TYPES: TipoCard[] = [
  {
    id: "pos-recebimento",
    name: "Pós Recebimento",
    description: "Checklist de verificação após recebimento do veículo",
    icon: Package,
    available: false,
  },
  {
    id: "revisao-entrega" as ChecklistType,
    name: "Revisão de Entrega",
    description: "Revisão dos itens antes da entrega ao cliente",
    icon: ClipboardCheck,
    available: true,
  },
  {
    id: "inspecao-pre-entrega" as ChecklistType,
    name: "Inspeção Pré-Entrega",
    description: "Inspeção técnica completa antes da entrega",
    icon: Search,
    available: true,
  },
  {
    id: "roteiro-entrega-tecnica" as ChecklistType,
    name: "Roteiro para Entrega Técnica",
    description: "Fluxo completo de entrega técnica ao cliente",
    icon: ClipboardList,
    available: true,
  },
];

/** Tipos do Pós Venda. O plano não gera migration e o banco sai por página — por isso
 *  fica fora da lista de Entrega Impecável, não porque seja outro projeto. */
const POS_VENDA_TYPES: TipoCard[] = [
  {
    id: "plano-manutencao" as ChecklistType,
    name: "Plano de Manutenção Programada",
    description: "Revisões por km/meses — sem migration, banco por página",
    icon: CalendarCheck,
    available: true,
  },
];

const PROJECTS = [
  {
    id: "entrega-impecavel" as Project,
    name: "Entrega Impecável",
    description: "Extração de perguntas de PDFs do projeto Entrega Impecável",
    icon: Truck,
    available: true,
  },
  {
    id: "pos-venda" as Project,
    name: "Pós Venda",
    description: "Planos de manutenção programada e demais checklists de Pós Venda",
    icon: ShoppingBag,
    available: true,
  },
];

/** Tipos de checklist oferecidos em cada projeto. */
const TYPES_BY_PROJECT: Record<Project, TipoCard[]> = {
  "entrega-impecavel": CHECKLIST_TYPES,
  "pos-venda": POS_VENDA_TYPES,
};

/** Projeto a que um tipo pertence — o rascunho guarda só o tipo, e retomar precisa
 *  abrir o projeto certo (senão o plano cairia na lista de Entrega Impecável). */
function projetoDoTipo(tipo: ChecklistType): Project {
  const encontrado = (Object.keys(TYPES_BY_PROJECT) as Project[]).find((p) =>
    TYPES_BY_PROJECT[p].some((t) => t.id === tipo),
  );
  return encontrado ?? "entrega-impecavel";
}

export default function ExtratorPage() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [checklistType, setChecklistType] = useState<ChecklistType | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [showApiModal, setShowApiModal] = useState(false);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [showNameStep, setShowNameStep] = useState(true);
  const [inProgressDraft, setInProgressDraft] = useState<ChecklistDraft | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "idle">("idle");
  const [quotaError, setQuotaError] = useState(false);
  const [currentDraftData, setCurrentDraftData] = useState<DraftDados>(createEmptyDados());
  const [showReuploadWarning, setShowReuploadWarning] = useState(false);
  const { createDraft, updateDraft, getDraft, getInProgressDrafts } = useDraftStorage();

  const handleSelectProject = useCallback((project: Project) => {
    setSelectedProject(project);
    setChecklistType(null);
    setPdfFile(null);
    setImages([]);
  }, []);

  const handleIniciar = useCallback(
    (nome: string, descricao: string) => {
      const draft = createDraft(nome, descricao, null);
      setDraftId(draft.id);
      setShowNameStep(false);
      setInProgressDraft(null);
    },
    [createDraft]
  );

  const handleRetomar = useCallback(
    (draft: ChecklistDraft) => {
      setDraftId(draft.id);
      setInProgressDraft(null);
      setShowNameStep(false);
      setCurrentDraftData(draft.dados);
      if (draft.tipo) {
        setSelectedProject(projetoDoTipo(draft.tipo));
        setChecklistType(draft.tipo);
      }
      if (draft.etapa_atual >= 3 && draft.dados.texto_extraido) {
        setShowReuploadWarning(true);
      }
    },
    []
  );

  const handleDataChange = useCallback(
    (data: Partial<DraftDados>) => {
      setCurrentDraftData((prev) => ({ ...prev, ...data }));
    },
    []
  );

  useEffect(() => {
    const resumeId = sessionStorage.getItem("checklist_resume_id");
    if (resumeId) {
      sessionStorage.removeItem("checklist_resume_id");
      const draft = getDraft(resumeId);
      if (draft) {
        handleRetomar(draft);
        return;
      }
    }
    const inProgress = getInProgressDrafts();
    if (inProgress.length > 0) {
      setInProgressDraft(inProgress[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftId) return;
    const etapaAtual = !selectedProject ? 1 : !checklistType ? 2 : !pdfFile ? 3 : 4;
    const result = updateDraft(draftId, {
      tipo: checklistType,
      etapa_atual: etapaAtual,
      dados: currentDraftData,
    });
    if (!result.ok && result.error === "quota") {
      setQuotaError(true);
      return;
    }
    setSaveStatus("saved");
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [draftId, selectedProject, checklistType, pdfFile, currentDraftData, updateDraft]);

  const selectedProjectData = PROJECTS.find((p) => p.id === selectedProject);
  const tiposDoProjeto = selectedProject ? TYPES_BY_PROJECT[selectedProject] : [];

  if (showNameStep) {
    return (
      <>
        {inProgressDraft && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#e8e8e8] px-6 py-3 flex items-center gap-3"
            style={{ boxShadow: "0px 4px 16px 0px rgba(76,87,125,0.08)" }}
          >
            <span className="w-2 h-2 rounded-full bg-[#FFB822] shrink-0" />
            <span className="text-sm text-[#464E5F] flex-1 truncate">
              Rascunho em progresso:{" "}
              <strong className="text-[#173872]">{inProgressDraft.nome}</strong>
              <span className="text-[#80808F]"> — Etapa {inProgressDraft.etapa_atual} de 4</span>
            </span>
            <button
              onClick={() => handleRetomar(inProgressDraft)}
              className="px-3 py-1.5 rounded-lg bg-[#173872] hover:bg-[#122d5e] text-white text-xs font-medium transition-colors shrink-0"
            >
              Continuar
            </button>
            <a
              href="/historico"
              className="px-3 py-1.5 rounded-lg border border-[#e8e8e8] bg-[#F9F9F9] hover:bg-[#efefef] text-[#464E5F] text-xs font-medium transition-colors shrink-0"
            >
              Ver histórico
            </a>
            <button
              onClick={() => setInProgressDraft(null)}
              className="text-[#80808F] hover:text-[#464E5F] text-xs transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        )}
        <div className={inProgressDraft ? "pt-14" : ""}>
          <ChecklistNameStep onIniciar={handleIniciar} />
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#e6e6e6] text-[#464E5F]">
      {/* "Salvo" indicator */}
      {draftId && saveStatus === "saved" && (
        <div className="fixed bottom-4 right-4 z-50 bg-white text-[#0BB783] text-xs px-3 py-1.5 rounded-full border border-[#0BB783]/30 pointer-events-none select-none"
          style={{ boxShadow: "0px 4px 12px 0px rgba(76,87,125,0.10)" }}
        >
          ✓ Salvo
        </div>
      )}
      {/* Quota error alert */}
      {quotaError && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-white border border-[#ED3237]/30 text-[#464E5F] text-sm px-4 py-3 rounded-xl flex items-start gap-3"
          style={{ boxShadow: "0px 8px 24px 0px rgba(76,87,125,0.12)" }}
        >
          <span className="text-[#ED3237] font-bold shrink-0 mt-0.5">!</span>
          <span className="flex-1">
            <strong className="text-[#ED3237]">Limite de armazenamento atingido.</strong>
            {" "}Acesse o{" "}
            <a href="/historico" className="underline text-[#173872] hover:text-[#ED3237]">
              histórico
            </a>{" "}
            e apague rascunhos antigos para liberar espaço.
          </span>
          <button
            onClick={() => setQuotaError(false)}
            className="text-[#80808F] hover:text-[#464E5F] shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>
      )}
      {/* Re-upload warning */}
      {showReuploadWarning && (
        <div className="fixed top-[72px] left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
          <div className="bg-white border border-[#FFB822]/40 text-[#464E5F] text-sm px-5 py-3 rounded-xl pointer-events-auto max-w-md flex items-center gap-3"
            style={{ boxShadow: "0px 8px 24px 0px rgba(76,87,125,0.12)" }}
          >
            <span className="text-[#FFB822] font-bold shrink-0">⚠</span>
            <span className="flex-1">
              Esta etapa requer o <strong>upload do PDF</strong> novamente. Os dados anteriores foram restaurados.
            </span>
            <button
              onClick={() => setShowReuploadWarning(false)}
              className="text-[#80808F] hover:text-[#464E5F] shrink-0 transition-colors ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header
        className="sticky top-0 z-40 bg-white border-b border-[#e8e8e8]"
        style={{ boxShadow: "0px 10px 30px 0px rgba(82,63,105,0.05)" }}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-lg hover:bg-[#F9F9F9] transition-colors text-[#80808F] hover:text-[#464E5F]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-7 h-7 bg-[#173872] rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base font-semibold text-[#173872]">
              Extrator e Corretor de Texto
            </h1>
            {selectedProjectData && (
              <>
                <span className="text-[#d0d0d0]">/</span>
                <span className="text-sm text-[#ED3237] font-medium">
                  {selectedProjectData.name}
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => setShowApiModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#173872]/30 hover:border-[#173872] text-[#173872] hover:bg-[#173872]/5 transition-all text-sm font-medium"
          >
            <Key className="w-4 h-4" />
            API Key
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Step 1 — Selecionar Projeto */}
        <section
          className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden"
          style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
        >
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e8e8e8]">
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                selectedProject ? "bg-[#0BB783]" : "bg-[#ED3237]"
              }`}
            >
              {selectedProject ? "✓" : "1"}
            </span>
            <h2 className="text-base font-semibold text-[#464E5F]">
              Selecionar Projeto
            </h2>
          </div>
          <div className="p-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PROJECTS.map((project) => {
                const Icon = project.icon;
                const isSelected = selectedProject === project.id;
                return (
                  <button
                    key={project.id}
                    onClick={() =>
                      project.available && handleSelectProject(project.id)
                    }
                    disabled={!project.available}
                    className={`relative text-left p-5 rounded-xl border-2 transition-all ${
                      !project.available
                        ? "border-[#e8e8e8] bg-[#F9F9F9] opacity-50 cursor-not-allowed"
                        : isSelected
                        ? "border-[#ED3237] bg-[#ED3237]/5"
                        : "border-[#e8e8e8] hover:border-[#ED3237]/40 hover:bg-[#F9F9F9] cursor-pointer"
                    }`}
                  >
                    {!project.available && (
                      <span className="absolute top-3 right-3 flex items-center gap-1 text-xs text-[#FFB822] bg-[#FFB822]/10 px-2 py-0.5 rounded-full border border-[#FFB822]/30">
                        <Construction className="w-3 h-3" />
                        Em desenvolvimento
                      </span>
                    )}
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`p-2 rounded-lg ${
                          isSelected
                            ? "bg-[#ED3237] text-white"
                            : "bg-[#F9F9F9] text-[#80808F]"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-semibold text-sm text-[#464E5F]">
                        {project.name}
                      </span>
                    </div>
                    <p className="text-sm text-[#80808F]">
                      {project.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {tiposDoProjeto.length > 0 && (
          <>
            {/* Step 2 — Tipo de Checklist */}
            <section
              className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden"
              style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
            >
              <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e8e8e8]">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                    checklistType ? "bg-[#0BB783]" : "bg-[#ED3237]"
                  }`}
                >
                  {checklistType ? "✓" : "2"}
                </span>
                <h2 className="text-base font-semibold text-[#464E5F]">
                  Selecionar Tipo de Checklist
                </h2>
              </div>
              <div className="p-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  {tiposDoProjeto.map((ct) => {
                    const Icon = ct.icon;
                    const isSelected = checklistType === ct.id;
                    return (
                      <button
                        key={ct.id}
                        onClick={() =>
                          ct.available &&
                          setChecklistType(ct.id as ChecklistType)
                        }
                        disabled={!ct.available}
                        className={`relative text-left p-5 rounded-xl border-2 transition-all ${
                          !ct.available
                            ? "border-[#e8e8e8] bg-[#F9F9F9] opacity-50 cursor-not-allowed"
                            : isSelected
                            ? "border-[#ED3237] bg-[#ED3237]/5"
                            : "border-[#e8e8e8] hover:border-[#ED3237]/40 hover:bg-[#F9F9F9] cursor-pointer"
                        }`}
                      >
                        {!ct.available && (
                          <span className="absolute top-3 right-3 flex items-center gap-1 text-xs text-[#FFB822] bg-[#FFB822]/10 px-2 py-0.5 rounded-full border border-[#FFB822]/30">
                            <Construction className="w-3 h-3" />
                            Em breve
                          </span>
                        )}
                        <div className="flex items-center gap-3 mb-2">
                          <div
                            className={`p-2 rounded-lg ${
                              isSelected
                                ? "bg-[#ED3237] text-white"
                                : "bg-[#F9F9F9] text-[#80808F]"
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="font-semibold text-sm text-[#464E5F]">
                            {ct.name}
                          </span>
                        </div>
                        <p className="text-sm text-[#80808F]">{ct.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        )}

        {tiposDoProjeto.length > 0 && checklistType && (
          <>
            {/* Step 3 — PDF + Imagens */}
            <section
              className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden"
              style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
            >
              <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e8e8e8]">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                    pdfFile && images.length > 0
                      ? "bg-[#0BB783]"
                      : "bg-[#ED3237]"
                  }`}
                >
                  {pdfFile && images.length > 0 ? "✓" : "3"}
                </span>
                <h2 className="text-base font-semibold text-[#464E5F] flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-[#173872]" />
                  Arquivos do Projeto
                </h2>
              </div>
              <div className="p-6">
                <FilesUploadStep
                  pdfFile={pdfFile}
                  onPdfChange={setPdfFile}
                  images={images}
                  onImagesChange={setImages}
                />
              </div>
            </section>

            {/* Step 4 — IA */}
            <section
              className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden"
              style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
            >
              <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e8e8e8]">
                <span className="w-8 h-8 rounded-full bg-[#ED3237] flex items-center justify-center text-sm font-bold text-white">
                  4
                </span>
                <h2 className="text-base font-semibold text-[#464E5F] flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#173872]" />
                  Extrair Perguntas com o Airton
                </h2>
              </div>
              <div className="p-6">
                <AiCorrectionStep
                  pdfFile={pdfFile}
                  images={images}
                  project="entrega-impecavel"
                  checklistType={checklistType}
                  onOpenApiKeyModal={() => setShowApiModal(true)}
                  initialData={currentDraftData}
                  onDataChange={handleDataChange}
                />
              </div>
            </section>
          </>
        )}
      </main>

      <ApiKeyModal
        isOpen={showApiModal}
        onClose={() => setShowApiModal(false)}
      />
      <ToastContainer />
    </div>
  );
}
