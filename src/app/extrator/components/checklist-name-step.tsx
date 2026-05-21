"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

interface Props {
  onIniciar: (nome: string, descricao: string) => void;
}

export function ChecklistNameStep({ onIniciar }: Props) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    onIniciar(nome.trim(), descricao.trim());
  };

  return (
    <div className="min-h-screen bg-[#e6e6e6] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden"
          style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.06)" }}
        >
          {/* Card header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e8e8e8]">
            <div className="w-8 h-8 rounded-full bg-[#ED3237] flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#464E5F]">Novo Checklist</h2>
              <p className="text-xs text-[#80808F]">
                Dê um nome para identificar este trabalho no histórico.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#464E5F] mb-1.5">
                Nome do checklist <span className="text-[#ED3237]">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Ram 1500 — Stellantis — Mai/2025"
                autoFocus
                maxLength={120}
                className="w-full bg-[#F9F9F9] border border-[#e8e8e8] rounded-lg px-4 py-2.5 text-sm text-[#464E5F] placeholder-[#b0b0b0] focus:outline-none focus:border-[#173872] focus:ring-1 focus:ring-[#173872]/30 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#464E5F] mb-1.5">
                Descrição / observação{" "}
                <span className="text-[#80808F] font-normal">(opcional)</span>
              </label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: versão com 85 perguntas, sem seção de recall"
                rows={3}
                className="w-full bg-[#F9F9F9] border border-[#e8e8e8] rounded-lg px-4 py-2.5 text-sm text-[#464E5F] placeholder-[#b0b0b0] focus:outline-none focus:border-[#173872] focus:ring-1 focus:ring-[#173872]/30 transition-colors resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={!nome.trim()}
              className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-[#ED3237] hover:bg-[#c8272b] active:bg-[#b02226] text-white"
            >
              Iniciar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
