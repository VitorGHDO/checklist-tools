"use client";

import { useState, useCallback } from "react";
import {
  FileText,
  Sparkles,
  ArrowLeft,
  Key,
  Truck,
  ShoppingBag,
  Construction,
  FolderOpen,
} from "lucide-react";
import Link from "next/link";
import { FilesUploadStep } from "./components/files-upload-step";
import { AiCorrectionStep } from "./components/ai-correction-step";
import { ApiKeyModal } from "./components/api-key-modal";
import { ToastContainer } from "@/components/ui/toast";
import type { UploadedImage } from "@/lib/types";

type Project = "entrega-impecavel" | "pos-venda";

const PROJECTS = [
  {
    id: "entrega-impecavel" as Project,
    name: "Entrega Impecável",
    description: "Extração e correção de PDFs do projeto Entrega Impecável",
    icon: Truck,
    available: true,
  },
  {
    id: "pos-venda" as Project,
    name: "Pós Venda",
    description: "Extração e correção de PDFs do projeto Pós Venda",
    icon: ShoppingBag,
    available: false,
  },
];

export default function ExtratorPage() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [showApiModal, setShowApiModal] = useState(false);

  const handleSelectProject = useCallback((project: Project) => {
    setSelectedProject(project);
    setPdfFile(null);
    setImages([]);
  }, []);

  const selectedProjectData = PROJECTS.find((p) => p.id === selectedProject);

  return (
    <div className="min-h-screen bg-[#e6e6e6] text-[#464E5F]">
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
            <div className="grid sm:grid-cols-2 gap-4">
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

        {selectedProject === "entrega-impecavel" && (
          <>
            {/* Step 2 — PDF + Imagens */}
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
                  {pdfFile && images.length > 0 ? "✓" : "2"}
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

            {/* Step 3 — IA */}
            <section
              className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden"
              style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
            >
              <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e8e8e8]">
                <span className="w-8 h-8 rounded-full bg-[#ED3237] flex items-center justify-center text-sm font-bold text-white">
                  3
                </span>
                <h2 className="text-base font-semibold text-[#464E5F] flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#173872]" />
                  Corrigir com IA
                </h2>
              </div>
              <div className="p-6">
                <AiCorrectionStep
                  pdfFile={pdfFile}
                  images={images}
                  project="entrega-impecavel"
                  onOpenApiKeyModal={() => setShowApiModal(true)}
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
