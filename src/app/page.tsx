import Link from "next/link";
import {
  FileText,
  Sparkles,
  PenTool,
  ArrowRight,
  Lock,
} from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
            Checklist Tools
          </h1>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-3xl w-full text-center space-y-6 mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Ferramentas inteligentes para{" "}
            <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              checklists automotivos
            </span>
          </h2>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            Extraia textos de PDFs, corrija com IA e monte checklists
            profissionais — tudo em um só lugar.
          </p>
        </div>

        {/* Tool Cards */}
        <div className="max-w-3xl w-full grid sm:grid-cols-2 gap-6">
          {/* Extrator */}
          <Link
            href="/extrator"
            className="group relative overflow-hidden rounded-xl border border-gray-800 bg-gray-900 p-6 transition-all hover:border-violet-600/50 hover:shadow-lg hover:shadow-violet-600/10"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-lg bg-violet-600/10 text-violet-400">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">Extrator de PDF</h3>
                <p className="text-sm text-gray-400">
                  Extraia texto de PDFs e corrija com IA usando imagens de
                  referência.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-0.5 rounded-full bg-violet-600/10 text-violet-300 text-xs">
                pdf-parse
              </span>
              <span className="px-2 py-0.5 rounded-full bg-violet-600/10 text-violet-300 text-xs">
                Gemini
              </span>
              <span className="px-2 py-0.5 rounded-full bg-violet-600/10 text-violet-300 text-xs">
                OpenAI
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm text-violet-400 group-hover:gap-2 transition-all">
              Acessar <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Designer — Em breve */}
          <div className="relative overflow-hidden rounded-xl border border-gray-800 bg-gray-900/50 p-6 opacity-60 cursor-not-allowed">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-lg bg-gray-700/30 text-gray-500">
                <PenTool className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                  Designer de PDF
                  <span className="px-2 py-0.5 rounded-full bg-gray-800 text-xs text-gray-500 font-normal">
                    Em breve
                  </span>
                </h3>
                <p className="text-sm text-gray-500">
                  Monte checklists visuais com drag & drop e exporte em PDF.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-600 text-xs">
                Drag & Drop
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-600 text-xs">
                Canvas
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-600 text-xs">
                jsPDF
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <Lock className="w-3.5 h-3.5" />
              Fase 2
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-4 text-center text-sm text-gray-600">
        Checklist Tools &mdash; Ferramentas internas Acampa
      </footer>
    </div>
  );
}
