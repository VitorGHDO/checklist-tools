# -*- coding: utf-8 -*-
"""
Converte centros medidos na arte nos $x,$y do writeHTMLCell.

writeHTMLCell NAO centraliza: o 'C' do argumento alinha o texto dentro da
celula, que por sua vez comeca em $x,$y. Quem centraliza e esta conta, a mesma
de printMarcacaoCentralizadaChecklist em toyota/v4:

    larguraTexto  = GetStringWidth(texto)            # mm
    alturaTexto   = 0.717 * pt * 25.4/72             # altura da maiuscula, mm
    alturaBaseline= 0.3569 * pt - 0.1035             # mm
    x = centroX - 1 - larguraTexto/2
    y = centroY + alturaTexto/2 - alturaBaseline

O "-1" e o padding horizontal que o TCPDF aplica dentro da celula.

    python posicoes.py --colunas 62.1,72.4,83.0 --linhas 91.2,99.5 --fonte 10
    python posicoes.py --colunas ... --linhas ... --php --nome layoutEntrada
    python posicoes.py --conferir 60.84,92.07 --fonte 10

--conferir faz o caminho inverso: devolve o centro que aquele $x,$y produz. E
o primeiro passo do fluxo - rodar numa marcacao que ja sai certa e comparar com
o centro medido na arte (tem que bater em +-0.3 mm).
"""

import argparse
import json
import sys

PT_PARA_MM = 25.4 / 72.0

# Larguras AFM do Core 14 (unidades de 1/1000 em). E o que o GetStringWidth do
# TCPDF usa para Helvetica, entao reproduzir a tabela evita ter de chamar PHP
# so para medir a largura de um "X".
_HELVETICA = {
    " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191,
    "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
    ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
    "A": 667, "B": 667, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778, "H": 722,
    "I": 278, "J": 500, "K": 667, "L": 556, "M": 833, "N": 722, "O": 778, "P": 667,
    "Q": 778, "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944, "X": 667,
    "Y": 667, "Z": 611, "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333,
    "a": 556, "b": 556, "c": 500, "d": 556, "e": 556, "f": 278, "g": 556, "h": 556,
    "i": 222, "j": 222, "k": 500, "l": 222, "m": 833, "n": 556, "o": 556, "p": 556,
    "q": 556, "r": 333, "s": 500, "t": 278, "u": 556, "v": 500, "w": 722, "x": 500,
    "y": 500, "z": 500, "{": 334, "|": 260, "}": 334, "~": 584,
}
_HELVETICA_BOLD = {
    " ": 278, "!": 333, '"': 474, "#": 556, "$": 556, "%": 889, "&": 722, "'": 238,
    "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
    ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
    "A": 722, "B": 722, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778, "H": 722,
    "I": 278, "J": 556, "K": 722, "L": 611, "M": 833, "N": 722, "O": 778, "P": 667,
    "Q": 778, "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944, "X": 667,
    "Y": 667, "Z": 611, "[": 333, "\\": 278, "]": 333, "^": 584, "_": 556, "`": 333,
    "a": 556, "b": 611, "c": 556, "d": 611, "e": 556, "f": 333, "g": 611, "h": 611,
    "i": 278, "j": 278, "k": 556, "l": 278, "m": 889, "n": 611, "o": 611, "p": 611,
    "q": 611, "r": 389, "s": 556, "t": 333, "u": 611, "v": 556, "w": 778, "x": 556,
    "y": 556, "z": 500, "{": 389, "|": 280, "}": 389, "~": 584,
}

for _d in (_HELVETICA, _HELVETICA_BOLD):
    for _c in "0123456789":
        _d[_c] = 556


def tirar_tags(texto):
    """Equivalente do strip_tags para o <b>X</b> que as funcoes do repo passam."""
    fora = []
    dentro = False
    for c in texto:
        if c == "<":
            dentro = True
        elif c == ">":
            dentro = False
        elif not dentro:
            fora.append(c)
    return "".join(fora)


def tem_negrito(texto):
    return "<b>" in texto.lower()


def largura_texto_mm(texto, pt, negrito):
    tabela = _HELVETICA_BOLD if negrito else _HELVETICA
    total = 0
    for c in texto:
        if c not in tabela:
            sys.exit("ERRO: caractere %r fora da tabela Helvetica. Use --largura para informar a mao." % c)
        total += tabela[c]
    return (total / 1000.0) * pt * PT_PARA_MM


def altura_texto_mm(pt):
    return 0.717 * pt * PT_PARA_MM


def altura_baseline_mm(pt):
    return (0.3569 * pt) - 0.1035


def centro_para_canto(centro_x, centro_y, largura_mm, pt):
    x = centro_x - 1 - (largura_mm / 2.0)
    y = centro_y + (altura_texto_mm(pt) / 2.0) - altura_baseline_mm(pt)
    return x, y


def canto_para_centro(x, y, largura_mm, pt):
    centro_x = x + 1 + (largura_mm / 2.0)
    centro_y = y - (altura_texto_mm(pt) / 2.0) + altura_baseline_mm(pt)
    return centro_x, centro_y


def lista_mm(valor, rotulo):
    if not valor:
        return []
    try:
        return [float(v) for v in valor.replace(";", ",").split(",") if v.strip()]
    except ValueError:
        sys.exit("ERRO: --%s aceita numeros separados por virgula" % rotulo)


def main():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--colunas", help="centros X em mm, separados por virgula")
    p.add_argument("--linhas", help="centros Y em mm, separados por virgula")
    p.add_argument("--fonte", type=float, default=10.0, help="corpo da fonte em pt (padrao 10)")
    p.add_argument("--texto", default="<b>X</b>", help="o que sera escrito (padrao <b>X</b>)")
    p.add_argument("--largura", type=float, help="largura do texto em mm, no lugar da tabela AFM")
    p.add_argument("--conferir", help="x,y de uma marcacao existente: devolve o centro")
    p.add_argument("--php", action="store_true", help="imprime os arrays PHP para colar")
    p.add_argument("--nome", default="posicoes", help="nome da variavel PHP (padrao posicoes)")
    p.add_argument("--arte", help="so para registrar no JSON de qual arte vieram as medidas")
    args = p.parse_args()

    texto = tirar_tags(args.texto)
    negrito = tem_negrito(args.texto)
    largura = args.largura if args.largura is not None else largura_texto_mm(texto, args.fonte, negrito)

    if args.conferir:
        partes = lista_mm(args.conferir, "conferir")
        if len(partes) != 2:
            sys.exit("ERRO: --conferir espera x,y")
        cx, cy = canto_para_centro(partes[0], partes[1], largura, args.fonte)
        print("# texto %r  fonte %.1f pt  %s" % (texto, args.fonte, "negrito" if negrito else "normal"))
        print("# largura do texto: %.3f mm | altura: %.3f mm | baseline: %.3f mm"
              % (largura, altura_texto_mm(args.fonte), altura_baseline_mm(args.fonte)))
        print("#")
        print("# writeHTMLCell em x=%.2f y=%.2f  ->  centro %.2f , %.2f" % (partes[0], partes[1], cx, cy))
        print("#")
        print("# Compare com o centro medido na arte. Diferenca acima de 0.3 mm quer")
        print("# dizer que a fonte ou o padding nao sao estes - descubra antes de seguir.")
        return

    colunas = lista_mm(args.colunas, "colunas")
    linhas = lista_mm(args.linhas, "linhas")
    if not colunas or not linhas:
        sys.exit("ERRO: informe --colunas e --linhas, ou use --conferir")

    posicoes = []
    for j, cy in enumerate(linhas):
        for i, cx in enumerate(colunas):
            x, y = centro_para_canto(cx, cy, largura, args.fonte)
            posicoes.append({"coluna": i, "linha": j, "centro_x": cx, "centro_y": cy,
                             "x": round(x, 2), "y": round(y, 2)})

    if args.php:
        print("// gerado por tools/checklist/posicoes.py --fonte %g" % args.fonte)
        if args.arte:
            print("// medido em %s" % args.arte)
        print("$%sX = array(%s);" % (args.nome, ", ".join("%.2f" % c for c in colunas)))
        print("$%sY = array(%s);" % (args.nome, ", ".join("%.2f" % l for l in linhas)))
        print("// centro -> canto ja aplicado (texto %r, %g pt):" % (texto, args.fonte))
        print("$%sCanto = array(" % args.nome)
        for j in range(len(linhas)):
            da_linha = [p for p in posicoes if p["linha"] == j]
            print("\tarray(%s)," % ", ".join("array(%.2f, %.2f)" % (p["x"], p["y"]) for p in da_linha))
        print(");")
        return

    print(json.dumps({
        "arte": args.arte,
        "fonte_pt": args.fonte,
        "texto": texto,
        "negrito": negrito,
        "largura_texto_mm": round(largura, 3),
        "altura_texto_mm": round(altura_texto_mm(args.fonte), 3),
        "altura_baseline_mm": round(altura_baseline_mm(args.fonte), 3),
        "colunas": colunas,
        "linhas": linhas,
        "posicoes": posicoes,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
