// ==================== PDF Extraction ====================

export interface ExtractResult {
  success: boolean;
  text?: string;
  pages?: string[];
  pageCount?: number;
  method?: "pdf-parse" | "fallback";
  error?: string;
}

// ==================== AI Correction ====================

export type AIProvider = "gemini" | "openai";

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  free: boolean;
}

export const AI_MODELS: AIModel[] = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (recomendado)", provider: "gemini", free: true },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (mais preciso)", provider: "gemini", free: true },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", free: true },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", free: false },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", free: false },
];

export interface CorrectionOptions {
  text: string;
  model: string;
  apiKey: string;
  keepFormat: boolean;
  fixOrtho: boolean;
  matchImage: boolean;
  additionalInstructions?: string;
  pageNumber?: number;
}

export interface CorrectionResult {
  success: boolean;
  correctedText?: string;
  model?: string;
  error?: string;
}

// ==================== Upload / Image ====================

export interface UploadedImage {
  id: string;
  file: File;
  dataUrl: string;
  name: string;
  size: number;
}

// ==================== Designer (future) ====================

export interface DesignerElement {
  id: string;
  type: "text" | "checkbox" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  textAlign?: "left" | "center" | "right";
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  conditionalDisplay?: string;
  variableName?: string;
  imagePath?: string;
}

export interface PageData {
  id: number;
  elements: DesignerElement[];
  backgroundImage?: string;
}
