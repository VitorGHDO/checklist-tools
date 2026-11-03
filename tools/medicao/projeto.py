# -*- coding: utf-8 -*-
"""
Ponte entre a medicao da arte e o Designer de PDF (checklist-tools/designer).

O Designer abre um JSON { pages: [...] } e completa sozinho o que faltar
(normalizeLoadedPage). Este script monta esse JSON a partir das medidas, para o
fluxo sair do terminal sem clicar item a item: mede-se com medir_linhas.py,
grava-se aqui, importa-se no Designer, confere-se na tela e exporta-se o PHP por
la - o gerador de PHP do Designer ja e o validado.

    python projeto.py novo proj.json --doc roteiro --arte folha_1.jpg --arte folha_2.jpg
    python projeto.py grupo proj.json --folha 1 --titulo "1 DOCUMENTOS" \\
        --campos nota_fiscal,manual --centros 64.97,71.06 --x 189.5
    python projeto.py grupo proj.json --folha 2 --titulo SOLO --fila campos.txt --centros-de medida.txt
    python projeto.py resumo proj.json

--centros sao os CENTROS das celulas (a saida de medir_linhas.py). A conversao
para o Y que cada docType guarda e feita aqui, igual ao Designer: roteiro,
posvenda e revisao guardam o centro; manutencao e formulario guardam o topo da
caixa (centro - caixa/2).
"""

import argparse
import base64
import json
import os
import random
import string
import sys

from PIL import Image

DOCS = ("roteiro", "revisao", "posvenda", "manutencao", "formulario")

# Altura da caixa da marcacao quando o docType guarda o topo: o padrao do
# Designer (iconMm do plano, celulaH do formulario).
CAIXA_PADRAO = {"manutencao": 3.0, "formulario": 5.0}

MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


def gen_id(prefixo):
    return prefixo + "_" + "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(8))


def ler(caminho):
    try:
        with open(caminho, encoding="utf-8") as fp:
            dados = json.load(fp)
    except (OSError, ValueError) as e:
        sys.exit("ERRO: nao consegui ler %s (%s)" % (caminho, e))
    if not isinstance(dados, dict) or not isinstance(dados.get("pages"), list):
        sys.exit("ERRO: %s nao e um projeto do Designer (falta 'pages')" % caminho)
    return dados


def gravar(caminho, dados):
    with open(caminho, "w", encoding="utf-8") as fp:
        json.dump(dados, fp, ensure_ascii=False)


def lista_num(valor, rotulo):
    try:
        return [float(v) for v in valor.replace(";", ",").replace("\n", ",").split(",") if v.strip()]
    except ValueError:
        sys.exit("ERRO: %s aceita numeros separados por virgula" % rotulo)


def centros_do_arquivo(caminho):
    """Aceita a saida crua do medir_linhas.py: usa a linha 'centros = [...]'."""
    with open(caminho, encoding="utf-8") as fp:
        texto = fp.read()
    for linha in texto.splitlines():
        if linha.strip().startswith("centros"):
            return lista_num(linha.split("[", 1)[1].rsplit("]", 1)[0], "centros")
    return lista_num(texto, "centros")


def nomes_do_arquivo(caminho):
    """Um campo por linha; aceita direto a migration ($table->integer('campo'))."""
    nomes = []
    with open(caminho, encoding="utf-8") as fp:
        for linha in fp:
            linha = linha.strip()
            if not linha or linha.startswith("//") or linha.startswith("#"):
                continue
            if "('" in linha:
                linha = linha.split("('", 1)[1].split("'", 1)[0]
            nomes.append(linha)
    return nomes


def folhas_checklist(dados):
    return [p for p in dados["pages"] if p.get("kind", "checklist") == "checklist"]


def cmd_novo(args):
    if os.path.exists(args.projeto) and not args.sobrescrever:
        sys.exit("ERRO: %s ja existe (use --sobrescrever)" % args.projeto)
    paginas = []
    for i, arte in enumerate(args.arte, 1):
        ext = os.path.splitext(arte)[1].lower()
        if ext not in MIME:
            sys.exit("ERRO: arte %s nao e JPG/PNG" % arte)
        with Image.open(arte) as im:
            largura, altura = im.size
        with open(arte, "rb") as fp:
            src = "data:%s;base64,%s" % (MIME[ext], base64.b64encode(fp.read()).decode("ascii"))
        paisagem = largura > altura
        paginas.append({
            "id": gen_id("p"),
            "name": "Folha %d" % i,
            "kind": "checklist",
            "docType": args.doc,
            "widthMm": 297 if paisagem else 210,
            "heightMm": 210 if paisagem else 297,
            "imageSrc": src,
            "naturalW": largura,
            "naturalH": altura,
            "groups": [],
            "headerFields": [],
        })
    gravar(args.projeto, {"pages": paginas})
    print("%s  %d folha(s) %s" % (args.projeto, len(paginas), args.doc))


def cmd_grupo(args):
    dados = ler(args.projeto)
    folhas = folhas_checklist(dados)
    if not 1 <= args.folha <= len(folhas):
        sys.exit("ERRO: folha %d nao existe (o projeto tem %d)" % (args.folha, len(folhas)))
    pagina = folhas[args.folha - 1]
    doc = pagina.get("docType", "roteiro")
    altura_mm = pagina.get("heightMm", 297)
    largura_mm = pagina.get("widthMm", 210)

    centros = centros_do_arquivo(args.centros_de) if args.centros_de else lista_num(args.centros or "", "--centros")
    nomes = nomes_do_arquivo(args.fila) if args.fila else [n.strip() for n in (args.campos or "").split(",") if n.strip()]
    if not centros:
        sys.exit("ERRO: informe --centros ou --centros-de")
    if not nomes:
        sys.exit("ERRO: informe --campos ou --fila")

    caixa = args.caixa if args.caixa is not None else CAIXA_PADRAO.get(doc, 0.0)
    ys = [c - caixa / 2.0 if doc in CAIXA_PADRAO else c for c in centros]

    if len(nomes) != len(ys):
        # Nao corrige sozinho: contagem diferente quase sempre e faixa errada ou campo
        # que nao tem caixa na folha. O que sobra fica de fora e o aviso diz quanto.
        print("# ATENCAO: %d campo(s) e %d celula(s) - usando os %d primeiros"
              % (len(nomes), len(ys), min(len(nomes), len(ys))), file=sys.stderr)

    marcadores = []
    for nome, y in zip(nomes, ys):
        m = {"id": gen_id("m"), "label": nome, "fy": round(y / altura_mm, 6)}
        if doc in ("roteiro", "posvenda"):
            m["fx"] = round(args.x / largura_mm, 6)
            m["type"] = "check" if doc == "roteiro" else "1"
        elif doc == "revisao":
            m["tipo"] = "opcoes"
            m["resposta"] = "1"
        else:
            m["type"] = "1"
        marcadores.append(m)

    grupo = {
        "id": gen_id("g"),
        "title": args.titulo,
        "docType": doc,
        "xFixed": args.x,
        "yStart": round(ys[0], 2),
        "increment": args.incremento,
        "queue": "\n".join(nomes),
        "useQueueOnClick": True,
        "markers": marcadores,
        "yManual": True,
        # Espacamento medido, nao regular: o Designer move o bloco sem reescreve-lo.
        "markersManual": True,
    }
    existentes = pagina.setdefault("groups", [])
    substituido = False
    for i, g in enumerate(existentes):
        if g.get("title") == args.titulo:
            grupo["id"] = g.get("id", grupo["id"])
            existentes[i] = {**g, **grupo}
            substituido = True
            break
    if not substituido:
        existentes.append(grupo)
    pagina["activeGroupId"] = grupo["id"]
    gravar(args.projeto, dados)
    print("folha %d  %s  %d item(ns) %s" % (args.folha, args.titulo, len(marcadores),
                                             "substituido" if substituido else "novo"))


def cmd_resumo(args):
    dados = ler(args.projeto)
    for i, p in enumerate(dados["pages"], 1):
        tipo = p.get("kind", "checklist")
        imagem = "com arte" if p.get("imageSrc") else "SEM arte"
        print("%d. %s [%s/%s] %s" % (i, p.get("name", "?"), tipo, p.get("docType", "?"), imagem))
        altura = p.get("heightMm", 297)
        for g in p.get("groups", []):
            ms = g.get("markers", [])
            faixa = ""
            if ms:
                faixa = "  y %.2f..%.2f" % (ms[0]["fy"] * altura, ms[-1]["fy"] * altura)
            print("   - %s: %d item(ns)%s" % (g.get("title", "?"), len(ms), faixa))
        if p.get("headerFields"):
            print("   - cabecalho: %s" % ", ".join(f.get("campo", "?") for f in p["headerFields"]))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    n = sub.add_parser("novo", help="projeto novo com uma folha por arte")
    n.add_argument("projeto")
    n.add_argument("--doc", choices=DOCS, required=True)
    n.add_argument("--arte", action="append", required=True, help="JPG/PNG de cada folha, na ordem")
    n.add_argument("--sobrescrever", action="store_true")
    n.set_defaults(func=cmd_novo)

    g = sub.add_parser("grupo", help="cria ou substitui (pelo titulo) um grupo com itens nos centros medidos")
    g.add_argument("projeto")
    g.add_argument("--folha", type=int, required=True, help="folha de checklist, 1-based")
    g.add_argument("--titulo", required=True)
    g.add_argument("--campos", help="nomes separados por virgula, na ordem da folha")
    g.add_argument("--fila", help="arquivo com um campo por linha (aceita a migration)")
    g.add_argument("--centros", help="centros das celulas em mm, separados por virgula")
    g.add_argument("--centros-de", help="arquivo com a saida do medir_linhas.py")
    g.add_argument("--x", type=float, default=189.5, help="X da marcacao em mm (roteiro/posvenda)")
    g.add_argument("--incremento", type=float, default=6.13, help="so informativo: o Y vem dos centros")
    g.add_argument("--caixa", type=float, help="altura da caixa (mm) em manutencao/formulario")
    g.set_defaults(func=cmd_grupo)

    r = sub.add_parser("resumo", help="lista folhas, grupos e faixa de Y - sem despejar o JSON")
    r.add_argument("projeto")
    r.set_defaults(func=cmd_resumo)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
