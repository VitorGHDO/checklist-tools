# -*- coding: utf-8 -*-
"""
Desenha a medicao sobre a arte, para conferir com o olho antes de gerar codigo.

Numero batendo na planilha nao prova nada: o que prova e a linha vermelha caindo
em cima da divisoria impressa e a cruz verde no meio da caixinha. Rode sempre
com --recorte, olhando um pedaco da tabela - a folha inteira reduzida esconde
justamente o erro de meio milimetro que se esta procurando.

    python overlay.py ARTE saida.png --h 85.59,90.45,95.32 --recorte 195,80,210,135
    python overlay.py ARTE saida.png --cx 62.1,72.4 --cy 91.2,99.5 --zoom 2

Cores: vermelho = horizontais, azul = verticais, verde = centros.
"""

import argparse
import sys

from PIL import Image, ImageDraw

from _comum import Arte

VERMELHO = (220, 30, 30)
AZUL = (30, 90, 220)
VERDE = (20, 160, 60)


def lista(valor):
    if not valor:
        return []
    try:
        return [float(v) for v in valor.replace(";", ",").split(",") if v.strip()]
    except ValueError:
        sys.exit("ERRO: esperava numeros em mm separados por virgula")


def main():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("arte")
    p.add_argument("saida", help="PNG a gerar")
    p.add_argument("--h", help="linhas horizontais em mm (y)")
    p.add_argument("--v", help="linhas verticais em mm (x)")
    p.add_argument("--cx", help="centros: coordenadas x em mm")
    p.add_argument("--cy", help="centros: coordenadas y em mm")
    p.add_argument("--recorte", help="x0,y0,x1,y1 em mm")
    p.add_argument("--zoom", type=float, default=1.0, help="amplia a saida (padrao 1)")
    p.add_argument("--paisagem", action="store_true")
    p.add_argument("--retrato", action="store_true")
    args = p.parse_args()

    forcar = "paisagem" if args.paisagem else ("retrato" if args.retrato else None)
    arte = Arte(args.arte, forcar)

    imagem = Image.open(args.arte).convert("RGB")
    desenho = ImageDraw.Draw(imagem)

    horizontais = lista(args.h)
    verticais = lista(args.v)
    cx = lista(args.cx)
    cy = lista(args.cy)

    for y in horizontais:
        py = arte.y_px(y)
        desenho.line([(0, py), (arte.largura_px, py)], fill=VERMELHO, width=1)

    for x in verticais:
        px = arte.x_px(x)
        desenho.line([(px, 0), (px, arte.altura_px)], fill=AZUL, width=1)

    # Sem --cx, as cruzes vao no meio horizontal do recorte: o caso comum e
    # conferir so a altura das linhas.
    if cy and not cx:
        meio = (arte.largura_mm / 2.0,)
        cx = list(meio)
    braco = max(3, int(round(arte.x_px(1.2))))
    for x in cx:
        for y in cy:
            px, py = arte.x_px(x), arte.y_px(y)
            desenho.line([(px - braco, py), (px + braco, py)], fill=VERDE, width=2)
            desenho.line([(px, py - braco), (px, py + braco)], fill=VERDE, width=2)

    if args.recorte:
        r = lista(args.recorte)
        if len(r) != 4:
            sys.exit("ERRO: --recorte espera x0,y0,x1,y1 em mm")
        caixa = (
            max(0, int(arte.x_px(r[0]))),
            max(0, int(arte.y_px(r[1]))),
            min(arte.largura_px, int(arte.x_px(r[2]))),
            min(arte.altura_px, int(arte.y_px(r[3]))),
        )
        imagem = imagem.crop(caixa)

    if args.zoom != 1.0:
        novo = (int(imagem.width * args.zoom), int(imagem.height * args.zoom))
        imagem = imagem.resize(novo, Image.LANCZOS)

    imagem.save(args.saida)
    print("# %s" % arte.descricao())
    print("# %d horizontal(is), %d vertical(is), %d cruz(es)"
          % (len(horizontais), len(verticais), len(cx) * len(cy)))
    print("%s  %dx%d px" % (args.saida, imagem.width, imagem.height))


if __name__ == "__main__":
    main()
