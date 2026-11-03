# -*- coding: utf-8 -*-
"""
Centro de cada coluna de marcacao, lido pelos ROTULOS do cabecalho.

O centro de uma coluna nao se mede pela caixinha (ela some quando a arte usa
campo de formulario em vez de desenho) e sim pelo rotulo impresso acima dela:
"C", "NC", "N/A", "SIM", "NAO", "B", "M", "R". Passe em --y0/--y1 apenas a faixa
da linha de rotulos.

    python medir_colunas.py ARTE --y0 870 --y1 900
    python medir_colunas.py ARTE --y0 147 --y1 152 --em-mm --x0 40 --x1 120

Bordas verticais da tabela sao descartadas sozinhas: sao estreitas e cobrem a
altura inteira da faixa, enquanto um rotulo tem respiro entre as letras.
"""

import sys

import numpy as np

from _comum import abrir, agrupar_consecutivos, argumentos_base, centro_do_grupo, para_mm

# Uma borda de tabela vai de cima a baixo da faixa; um glifo tem respiro acima e
# abaixo. 0.9 separa os dois com folga para o antialiasing.
COBERTURA_BORDA = 0.9
# Acima disto ja nao e risco de tabela, e sim marca que interessa.
BORDA_MAX_MM = 0.6


def medir(arte, x0_mm, x1_mm, y0_mm, y1_mm, limiar, folga_mm, largura_min_mm, largura_max_mm,
          invertido=False):
    x0, x1, y0, y1 = arte.faixa_px(x0_mm, x1_mm, y0_mm, y1_mm)
    faixa = arte.tinta(limiar, invertido)[y0:y1, x0:x1]
    altura = y1 - y0

    perfil = faixa.sum(axis=0)
    colunas = np.where(perfil > 0)[0]

    # Letras do mesmo rotulo tem espaco branco entre elas ("N/A" sao tres
    # glifos): agrupar com folga junta o rotulo inteiro num achado so.
    folga_px = max(1, int(round(arte.x_px(folga_mm))))
    grupos = agrupar_consecutivos(colunas, folga=folga_px)

    achados = []
    for g in grupos:
        largura_mm = arte.x_mm(g[1] - g[0] + 1)
        cobertura = perfil[g[0]:g[1] + 1].max() / float(altura)
        # Borda da tabela: risco fino que atravessa a faixa de cima a baixo. O
        # criterio que decide e a COBERTURA, nao a largura - um rotulo de um
        # glifo so ("C", "S", "N") tambem e estreito e nao pode cair junto com
        # a borda. Foi assim que a coluna "C" da Omoda sumia da medicao.
        if cobertura >= COBERTURA_BORDA and largura_mm <= BORDA_MAX_MM:
            continue
        if largura_mm < largura_min_mm:
            continue
        # Com --largura-max se mede a caixinha e nao o rotulo ao lado dela: num
        # layout "Rotulo: [ ]" o texto e largo e a caixa tem poucos milimetros.
        if largura_max_mm is not None and largura_mm > largura_max_mm:
            continue
        achados.append({
            "centro": arte.x_mm(x0 + centro_do_grupo(g)),
            "largura": largura_mm,
            "esquerda": arte.x_mm(x0 + g[0]),
            "direita": arte.x_mm(x0 + g[1]),
        })
    return achados, len(grupos)


def main():
    p = argumentos_base(__doc__)
    p.add_argument("--y0", required=True, help="topo da linha de rotulos")
    p.add_argument("--y1", required=True, help="base da linha de rotulos")
    p.add_argument("--x0", help="limita a busca a partir deste x")
    p.add_argument("--x1", help="limita a busca ate este x")
    p.add_argument(
        "--folga",
        type=float,
        default=1.2,
        help="distancia em mm que ainda une dois glifos no mesmo rotulo (padrao 1.2)",
    )
    p.add_argument(
        "--largura-max",
        type=float,
        help="descarta achados mais largos que isto em mm (util para pegar so as caixinhas)",
    )
    p.add_argument(
        "--largura-min",
        type=float,
        default=0.3,
        help="descarta achados mais estreitos que isto em mm (padrao 0.3)",
    )
    args = p.parse_args()

    arte = abrir(args)
    x0_mm = para_mm(arte, args.x0, "x", args.em_mm)
    x1_mm = para_mm(arte, args.x1, "x", args.em_mm)
    y0_mm = para_mm(arte, args.y0, "y", args.em_mm)
    y1_mm = para_mm(arte, args.y1, "y", args.em_mm)

    achados, brutos = medir(
        arte, x0_mm, x1_mm, y0_mm, y1_mm, args.limiar, args.folga,
        args.largura_min, args.largura_max, args.invertido
    )

    print("# %s" % arte.descricao())
    print("# faixa y: %.2f..%.2f mm | folga entre glifos: %.2f mm" % (y0_mm, y1_mm, args.folga))
    print("# %d achado(s) brutos -> %d coluna(s) apos descartar bordas" % (brutos, len(achados)))

    if not achados:
        print("#")
        print("# NADA ENCONTRADO. A faixa y provavelmente nao cobre a linha de rotulos.")
        print("# Abra a arte, localize a linha com 'C  NC  N/A' e use o y dela.")
        sys.exit(1)

    print("#")
    print("# %-4s %-10s %-10s %-10s %s" % ("n", "centro", "largura", "esquerda", "direita"))
    for i, a in enumerate(achados, 1):
        print("# %-4d %-10.2f %-10.2f %-10.2f %.2f"
              % (i, a["centro"], a["largura"], a["esquerda"], a["direita"]))

    if len(achados) > 1:
        passos = [achados[i + 1]["centro"] - achados[i]["centro"] for i in range(len(achados) - 1)]
        print("#")
        print("# passo entre colunas: %s mm" % ", ".join("%.2f" % s for s in passos))

    print()
    print("colunas = [%s]" % ", ".join("%.2f" % a["centro"] for a in achados))


if __name__ == "__main__":
    main()
