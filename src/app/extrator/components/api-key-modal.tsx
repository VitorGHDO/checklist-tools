"use client";

import { useState, useEffect } from "react";
import { X, Eye, EyeOff, KeyRound, ExternalLink } from "lucide-react";
import type { AIProvider } from "@/lib/types";
import {
  getApiKey,
  saveApiKey,
  removeApiKey,
  hasApiKey,
  migrateLegacyKey,
} from "@/lib/api-keys";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ProviderConfig {
  provider: AIProvider;
  label: string;
  placeholder: string;
  linkHref: string;
  linkLabel: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "gemini",
    label: "Google Gemini",
    placeholder: "AIza...",
    linkHref: "https://aistudio.google.com/apikey",
    linkLabel: "Google AI Studio (gratuito)",
  },
  {
    provider: "openai",
    label: "OpenAI",
    placeholder: "sk-...",
    linkHref: "https://platform.openai.com/api-keys",
    linkLabel: "OpenAI API Keys (pago)",
  },
  {
    provider: "anthropic",
    label: "Anthropic Claude",
    placeholder: "sk-ant-...",
    linkHref: "https://console.anthropic.com/settings/keys",
    linkLabel: "Anthropic Console (pago)",
  },
];

export function ApiKeyModal({ isOpen, onClose }: Props) {
  const [keys, setKeys] = useState<Record<AIProvider, string>>({
    gemini: "",
    openai: "",
    anthropic: "",
  });
  const [show, setShow] = useState<Record<AIProvider, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
  });
  const [configured, setConfigured] = useState<Record<AIProvider, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    migrateLegacyKey();
    setKeys({
      gemini: getApiKey("gemini") ?? "",
      openai: getApiKey("openai") ?? "",
      anthropic: getApiKey("anthropic") ?? "",
    });
    setConfigured({
      gemini: hasApiKey("gemini"),
      openai: hasApiKey("openai"),
      anthropic: hasApiKey("anthropic"),
    });
  }, [isOpen]);

  function handleSave(provider: AIProvider) {
    const key = keys[provider].trim();
    if (!key) {
      removeApiKey(provider);
    } else {
      saveApiKey(provider, key);
    }
    setConfigured((prev) => ({ ...prev, [provider]: !!key }));
  }

  function handleRemove(provider: AIProvider) {
    removeApiKey(provider);
    setKeys((prev) => ({ ...prev, [provider]: "" }));
    setConfigured((prev) => ({ ...prev, [provider]: false }));
  }

  function toggleShow(provider: AIProvider) {
    setShow((prev) => ({ ...prev, [provider]: !prev[provider] }));
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#173872]/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl border border-[#e8e8e8] w-full max-w-md shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8e8]">
          <h2 className="text-base font-semibold text-[#464E5F] flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#173872]" />
            Chaves de API
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F9F9F9] transition-colors text-[#80808F]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="px-5 py-3 text-xs text-[#80808F] border-b border-[#e8e8e8] bg-[#F9F9F9]">
          Chaves salvas localmente no navegador — nunca enviadas para nosso servidor.
        </p>

        {/* Provider sections */}
        <div className="divide-y divide-[#e8e8e8]">
          {PROVIDERS.map(({ provider, label, placeholder, linkHref, linkLabel }) => (
            <div key={provider} className="px-5 py-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#464E5F]">{label}</span>
                {configured[provider] ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#0BB783]/10 text-[#0BB783] border border-[#0BB783]/30">
                    Configurada
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#F9F9F9] text-[#80808F] border border-[#e8e8e8]">
                    Não configurada
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type={show[provider] ? "text" : "password"}
                  value={keys[provider]}
                  onChange={(e) =>
                    setKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                  }
                  placeholder={placeholder}
                  className="w-full bg-white border border-[#d0d0d0] rounded-lg px-3 py-2 pr-10 text-sm font-mono text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#173872]/30 focus:border-[#173872]/50 transition-colors"
                />
                <button
                  onClick={() => toggleShow(provider)}
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#80808F] hover:text-[#464E5F] transition-colors"
                >
                  {show[provider] ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSave(provider)}
                  className="px-3 py-1.5 rounded-lg bg-[#ED3237] hover:bg-[#A5232D] text-white text-xs font-medium transition-colors"
                >
                  Salvar
                </button>
                {configured[provider] && (
                  <button
                    onClick={() => handleRemove(provider)}
                    className="px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#80808F] text-xs transition-colors"
                  >
                    Remover
                  </button>
                )}
                <a
                  href={linkHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-[#173872] hover:text-[#ED3237] transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {linkLabel}
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#e8e8e8] bg-[#F9F9F9] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
