# -*- coding: utf-8 -*-
"""
PDF -> PNG, para olhar o resultado do validar.php.

Serve tambem para tirar a arte de um PDF novo: quando a folha chega em PDF e
nao em JPG, renderize em 150 DPI (o que as artes do repositorio usam) e salve
em <marca>/<versao>/checklist_modelos/.

    python render.py teste.pdf teste.png
    python render.py teste.pdf recorte.png --recorte 40,85,75,135
    python render.py folha.pdf arte.png --dpi 150 --pagina 2

--recorte e em MILIMETROS na folha, igual ao resto das ferramentas: o pedaco
da tabela que interessa, nao a folha inteira reduzida.
"""

import argparse
import sys

import fitz  # pymupdf

# As artes do repositorio estao em 150 DPI (1240x1755 em A4 retrato). Gerar
# arte nova no mesmo DPI mantem as medidas comparaveis entre folhas.
DPI_ARTE = 150


def main():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("pdf")
    p.add_argument("saida", help="PNG a gerar")
    p.add_argument("--dpi", type=int, default=DPI_ARTE, help="resolucao (padrao %d)" % DPI_ARTE)
    p.add_argument("--pagina", type=int, default=1, help="pagina, 1-based (padrao 1)")
    p.add_argument("--recorte", help="x0,y0,x1,y1 em mm")
    p.add_argument("--todas", action="store_true", help="salva todas as paginas (saida vira prefixo)")
    args = p.parse_args()

    documento = fitz.open(args.pdf)
    if documento.page_count == 0:
        sys.exit("ERRO: PDF sem paginas")

    escala = args.dpi / 72.0
    matriz = fitz.Matrix(escala, escala)

    if args.todas:
        base = args.saida[:-4] if args.saida.lower().endswith(".png") else args.saida
        for i in range(documento.page_count):
            pix = documento[i].get_pixmap(matrix=matriz)
            nome = "%s_p%d.png" % (base, i + 1)
            pix.save(nome)
            print("%s  %dx%d px" % (nome, pix.width, pix.height))
        return

    indice = args.pagina - 1
    if indice < 0 or indice >= documento.page_count:
        sys.exit("ERRO: pagina %d fora do PDF (tem %d)" % (args.pagina, documento.page_count))

    pagina = documento[indice]
    recorte = None
    if args.recorte:
        try:
            r = [float(v) for v in args.recorte.replace(";", ",").split(",")]
        except ValueError:
            sys.exit("ERRO: --recorte espera x0,y0,x1,y1 em mm")
        if len(r) != 4:
            sys.exit("ERRO: --recorte espera x0,y0,x1,y1 em mm")
        # mm -> pontos do PDF (1 pt = 1/72", 1 mm = 72/25.4 pt)
        k = 72.0 / 25.4
        recorte = fitz.Rect(r[0] * k, r[1] * k, r[2] * k, r[3] * k)

    pix = pagina.get_pixmap(matrix=matriz, clip=recorte)
    pix.save(args.saida)

    largura_mm = pagina.rect.width * 25.4 / 72.0
    altura_mm = pagina.rect.height * 25.4 / 72.0
    print("# %s  pagina %d de %d  %.1fx%.1f mm  %d DPI"
          % (args.pdf, args.pagina, documento.page_count, largura_mm, altura_mm, args.dpi))
    if recorte:
        print("# recorte: %s mm" % args.recorte)
    print("%s  %dx%d px" % (args.saida, pix.width, pix.height))


if __name__ == "__main__":
    main()
