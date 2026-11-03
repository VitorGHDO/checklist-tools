# -*- coding: utf-8 -*-
"""
Divisorias horizontais de um bloco da arte e o centro de cada celula.

Existe para substituir a altura acumulada com passo fixo. Linha de tabela com
texto em duas linhas ("Luzes internas / Marcadores do painel") e mais alta que
as vizinhas: somar um incremento unico acumula erro e a marcacao cai na celula
de baixo. A lista explicita de y sai daqui, medida na propria arte.

    python medir_linhas.py ARTE --x0 300 --x1 420
    python medir_linhas.py ARTE --x0 51 --x1 71 --em-mm --y0 90 --y1 180

--x0/--x1 delimitam SO a faixa das colunas de marcacao. Passar a folha inteira
faz o texto dos itens entrar na projecao e some com as divisorias.
"""

import sys

import numpy as np

from _comum import abrir, agrupar_consecutivos, argumentos_base, centro_do_grupo, para_mm


def medir(arte, x0_mm, x1_mm, y0_mm, y1_mm, limiar, cobertura, invertido=False):
    x0, x1, y0, y1 = arte.faixa_px(x0_mm, x1_mm, y0_mm, y1_mm)
    faixa = arte.tinta(limiar, invertido)[y0:y1, x0:x1]

    # Uma divisoria atravessa a faixa inteira; o texto do item nao. Exigir que a
    # maior parte da largura esteja pintada e o que separa os dois.
    largura = x1 - x0
    perfil = faixa.sum(axis=1)
    linhas = np.where(perfil >= cobertura * largura)[0]

    grupos = agrupar_consecutivos(linhas)
    # Guarda o inicio e o fim de cada divisoria, nao so o meio: a celula util vai
    # do FIM da divisoria de cima ao INICIO da de baixo. Em linha fina da no
    # mesmo, mas quando a divisoria e uma tarja de cabecalho (3.86 mm na folha da
    # Parvi) o meio joga o centro da primeira celula quase 1 mm para cima.
    divisorias = [
        {
            "centro": arte.y_mm(y0 + centro_do_grupo(g)),
            "inicio": arte.y_mm(y0 + g[0]),
            "fim": arte.y_mm(y0 + g[1] + 1),
            "espessura": arte.y_mm(g[1] - g[0] + 1),
        }
        for g in grupos
    ]
    return divisorias, perfil, largura


def main():
    p = argumentos_base(__doc__)
    p.add_argument("--x0", required=True, help="inicio da faixa de colunas de marcacao")
    p.add_argument("--x1", required=True, help="fim da faixa de colunas de marcacao")
    p.add_argument("--y0", help="limita a busca a partir deste y")
    p.add_argument("--y1", help="limita a busca ate este y")
    p.add_argument(
        "--cobertura",
        type=float,
        default=0.6,
        help="fracao da largura que precisa estar pintada para ser divisoria (padrao 0.6)",
    )
    p.add_argument(
        "--altura-min",
        type=float,
        default=0.0,
        help="descarta celulas mais baixas que isto em mm (padrao 0 = nenhuma)",
    )
    args = p.parse_args()

    arte = abrir(args)
    x0_mm = para_mm(arte, args.x0, "x", args.em_mm)
    x1_mm = para_mm(arte, args.x1, "x", args.em_mm)
    y0_mm = para_mm(arte, args.y0, "y", args.em_mm)
    y1_mm = para_mm(arte, args.y1, "y", args.em_mm)

    divisorias, perfil, largura = medir(
        arte, x0_mm, x1_mm, y0_mm, y1_mm, args.limiar, args.cobertura, args.invertido
    )

    print("# %s" % arte.descricao())
    print("# faixa x: %.2f..%.2f mm | cobertura minima: %.0f%% de %d px"
          % (x0_mm, x1_mm, args.cobertura * 100, largura))

    if len(divisorias) < 2:
        print("#")
        print("# ACHEI %d divisoria(s) - insuficiente para formar celula." % len(divisorias))
        print("# O pico mais forte da faixa cobre %.0f%% da largura."
              % (100.0 * perfil.max() / largura if largura else 0))
        print("# Tente --cobertura menor, ou confira se --x0/--x1 pegam so as colunas.")
        sys.exit(1)

    print("#")
    print("# %d divisorias -> %d celulas" % (len(divisorias), len(divisorias) - 1))
    print("#")
    print("# %-4s %-10s %-10s %-10s %s" % ("n", "divisoria", "espessura", "centro", "altura"))

    centros = []
    alturas = []
    for i in range(len(divisorias) - 1):
        topo = divisorias[i]
        base = divisorias[i + 1]
        altura = base["inicio"] - topo["fim"]
        if altura < args.altura_min:
            continue
        centro = (topo["fim"] + base["inicio"]) / 2.0
        centros.append(centro)
        alturas.append(altura)
        print("# %-4d %-10.2f %-10.2f %-10.2f %.2f"
              % (i + 1, topo["centro"], topo["espessura"], centro, altura))

    print("# %-4s %-10.2f %-10.2f" % ("", divisorias[-1]["centro"], divisorias[-1]["espessura"]))

    if alturas:
        menor, maior = min(alturas), max(alturas)
        print("#")
        print("# altura das celulas: %.2f a %.2f mm (variacao %.2f mm)" % (menor, maior, maior - menor))
        if maior - menor > 0.5:
            print("# ATENCAO: alturas desiguais. Use a lista de centros abaixo, NAO um incremento.")
        else:
            print("# alturas uniformes: passo medio %.3f mm" % (sum(alturas) / len(alturas)))

    print()
    print("centros = [%s]" % ", ".join("%.2f" % c for c in centros))


if __name__ == "__main__":
    main()
