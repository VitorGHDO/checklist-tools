"use client";

import { useState, useEffect } from "react";
import { X, Eye, EyeOff, KeyRound, ExternalLink } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "checklist_tools_api_key";

export function ApiKeyModal({ isOpen, onClose }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          setApiKey(atob(stored));
        } catch {
          setApiKey("");
        }
      }
    }
  }, [isOpen]);

  function save() {
    if (!apiKey.trim()) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, btoa(apiKey.trim()));
    }
    onClose();
  }

  function clear() {
    setApiKey("");
    localStorage.removeItem(STORAGE_KEY);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#173872]/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl border border-[#e8e8e8] w-full max-w-md p-6 space-y-5 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#464E5F] flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#173872]" />
            API Key
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F9F9F9] transition-colors text-[#80808F]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-[#80808F]">
          A chave é salva localmente no navegador e nunca é enviada para nosso
          servidor — apenas diretamente para a API do provedor selecionado.
        </p>

        <div>
          <label className="block text-sm font-medium text-[#464E5F] mb-1.5">
            Chave da API
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza... ou sk-..."
              className="w-full bg-white border border-[#d0d0d0] rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#173872]/30 focus:border-[#173872]/50 transition-colors"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#80808F] hover:text-[#464E5F] transition-colors"
              type="button"
            >
              {showKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-[#80808F]">Onde obter sua chave:</p>
          <div className="flex flex-col gap-1.5">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[#173872] hover:text-[#143266] transition-colors font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Google AI Studio (Gemini — gratuito)
            </a>
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[#173872] hover:text-[#143266] transition-colors font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              OpenAI API Keys (pago)
            </a>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#ED3237] hover:bg-[#A5232D] text-white font-medium text-sm transition-colors"
          >
            Salvar
          </button>
          <button
            onClick={clear}
            className="px-4 py-2.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
          >
            Limpar
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
