// Bitmap da arte para as leituras de pixel (medição, mapear folha). O canvas da tela é
// redimensionado e perderia as bordas finas, então a imagem é lida de novo da data URL.
// Só browser: usa Image e canvas.

/**
 * Largura máxima lida (px). A 1600 px uma A4 dá ~0,13 mm por pixel — folga para a
 * precisão da medição — e uma arte de 600 DPI (5000+ px) não vira 150 MB de ImageData.
 */
const LARGURA_MAX = 1600;

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("imagem inválida"));
    img.src = src;
  });
}

export async function lerBitmap(src: string, larguraMax = LARGURA_MAX): Promise<ImageData | null> {
  const img = await carregarImagem(src);
  const escala = Math.min(1, larguraMax / img.naturalWidth);
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.naturalWidth * escala);
  cv.height = Math.round(img.naturalHeight * escala);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return ctx.getImageData(0, 0, cv.width, cv.height);
}
