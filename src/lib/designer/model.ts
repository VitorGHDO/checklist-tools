// Factories e helpers de modelo — portados de checklist_construtor.html (newGroup/newPage/
// newHeaderField/getFieldPoints/setFieldPointXY/tipoLabel). Puros; sem acesso ao DOM.

import { DEFAULT_TYPE_OFFSETS } from "./constants";
import type {
  DesignerDocType,
  DesignerGroup,
  DesignerPage,
  HeaderField,
  HeaderFieldTipo,
  PageKind,
} from "./types";

// id único e estável dentro da sessão (componente é client-only, ssr:false).
let _seq = 0;
export function genId(prefix: string): string {
  _seq += 1;
  return `${prefix}${Date.now().toString(36)}${_seq.toString(36)}`;
}

export function newGroup(title: string, docType: DesignerDocType = "roteiro"): DesignerGroup {
  const g: DesignerGroup = {
    id: genId("g"),
    title: title || "Novo grupo",
    docType,
    xFixed: 189.5,
    yStart: 60,
    increment: 6.13,
    queue: "",
    useQueueOnClick: true,
    markers: [],
  };
  if (docType === "revisao") {
    g.colX1 = 181.75;
    g.colX2 = 189.2;
    g.colX3 = 196.5;
    g.colW = 7;
    g.colH = 6.3;
    g.textX = 184;
    g.textW = 19;
    g.textH = 5;
    g.textYOffset = -0.9;
    g.dadosVar = "dados";
  }
  if (docType === "posvenda") {
    g.posvendaOpts = [
      { valor: "1", label: "OK" },
      { valor: "3", label: "N/OK" },
      { valor: "0", label: "NA" },
    ];
    g.posvendaXMode = "same";
    g.optX = { "1": 156.5, "3": 161, "0": 165.5 };
    g.optW = 4.3;
    g.optH = 5;
  }
  return g;
}

export function newPage(
  name: string,
  kind: PageKind = "checklist",
  docType: DesignerDocType = "roteiro"
): DesignerPage {
  const g = newGroup("Grupo 1", docType);
  const defaultCellW = docType === "posvenda" ? 60 : 14.5;
  const defaultCellH = 5;
  return {
    id: genId("p"),
    name,
    kind,
    docType,
    widthMm: 210,
    heightMm: 297,
    offsetX: 0,
    offsetY: 0,
    cellW: defaultCellW,
    cellH: defaultCellH,
    markScale: 1,
    typeOffsets: { ...DEFAULT_TYPE_OFFSETS },
    imageSrc: null,
    naturalW: 0,
    naturalH: 0,
    groups: kind === "checklist" ? [g] : [],
    activeGroupId: kind === "checklist" ? g.id : null,
    headerFields: [],
    syncCols: true,
    pushCols: true,
    chainY: true,
  };
}

export function newHeaderField(tipo: HeaderFieldTipo): HeaderField {
  const id = genId("h");
  if (tipo === "assinatura") return { id, tipo, campo: "", x: 20, y: 20, w: 50, h: 6 };
  if (tipo === "data")
    return {
      id,
      tipo,
      campo: "",
      separador: "-",
      formato: "ymd",
      anoDigitos: "2",
      x1: 20,
      x2: 32,
      x3: 44,
      y: 20,
      w: 10,
      h: 5,
      fontSizeDentro: "",
      fontSizeDepois: "",
    };
  if (tipo === "hora")
    return { id, tipo, campo: "", separador: ":", x1: 20, x2: 32, y: 20, w: 10, h: 5 };
  if (tipo === "opcoes")
    return {
      id,
      tipo,
      campo: "",
      y: 20,
      w: 10,
      h: 5,
      fontSize: "",
      opcoes: [
        { valor: "1", x: 20 },
        { valor: "2", x: 35 },
      ],
    };
  return { id, tipo: "texto", campo: "", x: 20, y: 20, w: 60, h: 5, fontSize: "", amostra: "", align: "C" };
}

const TIPO_LABELS: Record<HeaderFieldTipo, string> = {
  texto: "Texto",
  assinatura: "Assinatura",
  data: "Data",
  hora: "Hora",
  opcoes: "Opções (X)",
};
export function tipoLabel(tipo: HeaderFieldTipo): string {
  return TIPO_LABELS[tipo] || tipo;
}

export interface FieldPoint {
  key: string;
  label: string;
  x: number;
  y: number;
}

export function getFieldPoints(field: HeaderField): FieldPoint[] {
  if (field.tipo === "texto" || field.tipo === "assinatura") {
    return [{ key: "main", label: "pos", x: field.x, y: field.y }];
  }
  if (field.tipo === "data") {
    return [
      { key: "x1", label: "dia", x: field.x1, y: field.y },
      { key: "x2", label: "mês", x: field.x2, y: field.y },
      { key: "x3", label: "ano", x: field.x3, y: field.y },
    ];
  }
  if (field.tipo === "hora") {
    return [
      { key: "x1", label: "hora", x: field.x1, y: field.y },
      { key: "x2", label: "min", x: field.x2, y: field.y },
    ];
  }
  if (field.tipo === "opcoes") {
    return field.opcoes.map((o, i) => ({ key: "opt" + i, label: o.valor || "#" + i, x: o.x, y: field.y }));
  }
  return [];
}

export function setFieldPointXY(field: HeaderField, key: string, xmm: number, ymm: number): void {
  if (field.tipo === "opcoes") {
    const idx = parseInt(key.slice(3), 10);
    if (field.opcoes[idx]) field.opcoes[idx].x = xmm;
    field.y = ymm;
    return;
  }
  if (key === "main") {
    if (field.tipo === "texto" || field.tipo === "assinatura") {
      field.x = xmm;
      field.y = ymm;
    }
    return;
  }
  // data/hora: key é "x1" | "x2" | "x3"
  if (field.tipo === "data" || field.tipo === "hora") {
    (field as unknown as Record<string, number>)[key] = xmm;
    field.y = ymm;
  }
}
