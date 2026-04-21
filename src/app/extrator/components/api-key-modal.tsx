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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md p-6 space-y-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-violet-400" />
            API Key
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-400">
          A chave é salva localmente no navegador e nunca é enviada para nosso
          servidor — apenas diretamente para a API do provedor selecionado.
        </p>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">
            Chave da API
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza... ou sk-..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
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
          <p className="text-gray-500">Onde obter sua chave:</p>
          <div className="flex flex-col gap-1.5">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Google AI Studio (Gemini — gratuito)
            </a>
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              OpenAI API Keys (pago)
            </a>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            className="flex-1 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 font-medium text-sm transition-colors"
          >
            Salvar
          </button>
          <button
            onClick={clear}
            className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors"
          >
            Limpar
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
