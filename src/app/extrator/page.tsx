"use client";

import { useState, useCallback } from "react";
import { FileText, Sparkles, ArrowLeft, Key, Truck, ShoppingBag, Construction, FolderOpen } from "lucide-react";
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
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="sticky top-0 z-40 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <FileText className="w-5 h-5 text-violet-400" />
            <h1 className="text-lg font-semibold">
              Extrator e Corretor de Texto
            </h1>
            {selectedProjectData && (
              <>
                <span className="text-gray-600">/</span>
                <span className="text-sm text-violet-300 font-medium">
                  {selectedProjectData.name}
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => setShowApiModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-sm"
          >
            <Key className="w-4 h-4" />
            API Key
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Step 1 — Selecionar Projeto */}
        <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800">
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                selectedProject ? "bg-green-600" : "bg-violet-600"
              }`}
            >
              {selectedProject ? "✓" : "1"}
            </span>
            <h2 className="text-lg font-semibold">Selecionar Projeto</h2>
          </div>
          <div className="p-6">
            <div className="grid sm:grid-cols-2 gap-4">
              {PROJECTS.map((project) => {
                const Icon = project.icon;
                const isSelected = selectedProject === project.id;
                return (
                  <button
                    key={project.id}
                    onClick={() => project.available && handleSelectProject(project.id)}
                    disabled={!project.available}
                    className={`relative text-left p-5 rounded-xl border-2 transition-all ${
                      !project.available
                        ? "border-gray-700 opacity-50 cursor-not-allowed"
                        : isSelected
                        ? "border-violet-500 bg-violet-500/10"
                        : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/50 cursor-pointer"
                    }`}
                  >
                    {!project.available && (
                      <span className="absolute top-3 right-3 flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">
                        <Construction className="w-3 h-3" />
                        Em desenvolvimento
                      </span>
                    )}
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${isSelected ? "bg-violet-600" : "bg-gray-800"}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-semibold">{project.name}</span>
                    </div>
                    <p className="text-sm text-gray-400">{project.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {selectedProject === "entrega-impecavel" && (
          <>
            {/* Step 2 — PDF + Imagens */}
            <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    pdfFile && images.length > 0 ? "bg-green-600" : "bg-violet-600"
                  }`}
                >
                  {pdfFile && images.length > 0 ? "✓" : "2"}
                </span>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-violet-400" />
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
            <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800">
                <span className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-bold">
                  3
                </span>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-400" />
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


