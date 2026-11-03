# -*- coding: utf-8 -*-
"""
Preview ao vivo das artes e dos PDFs de teste, no navegador.

Serve uma pagina que recarrega sozinha quando um arquivo muda. Deixe aberta num
monitor enquanto a medicao acontece no terminal: cada overlay.py ou validar.php
aparece ali em um ou dois segundos, sem precisar abrir o arquivo na mao.

    python preview.py ../../parvi_frota/v1/checklist_modelos
    python preview.py /caminho/da/pasta --porta 8765 --dpi 130

PDF e renderizado pagina a pagina; JPG e PNG sao servidos direto. A pagina so
troca a imagem que realmente mudou, entao nada pisca enquanto o resto fica
parado.

Nada disso entra em producao: e bancada, como o resto do tools/checklist.
"""

import argparse
import html
import http.server
import json
import os
import socketserver
import threading
import time
import urllib.parse
import webbrowser

import fitz  # pymupdf

EXTENSOES = (".png", ".jpg", ".jpeg", ".pdf")

# Onde os arquivos de trabalho ficam quando nao se informa a pasta. Fora do
# repositorio de proposito: overlay e PDF de teste sao descartaveis.
PASTA_PADRAO = os.path.join(os.path.expanduser("~"), "checklist-preview")

# Render de PDF custa caro para refazer a cada atualizacao da pagina. A chave
# inclui o mtime, entao arquivo novo invalida o cache sozinho.
_cache = {}
_cache_lock = threading.Lock()


def listar(pasta):
    """Arquivos visiveis, do mais recente para o mais antigo."""
    itens = []
    try:
        nomes = os.listdir(pasta)
    except OSError:
        return itens

    for nome in nomes:
        if not nome.lower().endswith(EXTENSOES):
            continue
        caminho = os.path.join(pasta, nome)
        try:
            st = os.stat(caminho)
        except OSError:
            continue
        if not os.path.isfile(caminho):
            continue

        paginas = 1
        if nome.lower().endswith(".pdf"):
            paginas = contar_paginas(caminho, st.st_mtime)
            if paginas == 0:
                continue  # PDF ainda sendo escrito

        itens.append({
            "nome": nome,
            "mtime": int(st.st_mtime),
            "tamanho": st.st_size,
            "paginas": paginas,
            "pdf": nome.lower().endswith(".pdf"),
        })

    itens.sort(key=lambda i: i["mtime"], reverse=True)
    return itens


def contar_paginas(caminho, mtime):
    chave = ("n", caminho, mtime)
    with _cache_lock:
        if chave in _cache:
            return _cache[chave]
    try:
        doc = fitz.open(caminho)
        n = doc.page_count
        doc.close()
    except Exception:
        # Arquivo a meio da escrita: some desta rodada e volta na seguinte.
        n = 0
    with _cache_lock:
        _cache[chave] = n
    return n


def render_pdf(caminho, mtime, pagina, dpi):
    chave = ("r", caminho, mtime, pagina, dpi)
    with _cache_lock:
        if chave in _cache:
            return _cache[chave]
    try:
        doc = fitz.open(caminho)
        escala = dpi / 72.0
        pix = doc[pagina].get_pixmap(matrix=fitz.Matrix(escala, escala))
        dados = pix.tobytes("png")
        doc.close()
    except Exception:
        return None
    with _cache_lock:
        # Mantem o cache pequeno: as medicoes geram arquivo novo o tempo todo.
        if len(_cache) > 60:
            _cache.clear()
        _cache[chave] = dados
    return dados


PAGINA = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>preview - %(pasta)s</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #15171c; color: #d8dbe2;
    font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  header {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 10px 16px; background: #1c1f26; border-bottom: 1px solid #2a2e37;
  }
  header b { color: #fff; font-weight: 600; }
  .pasta { color: #7f8696; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46vw; }
  .pulso { width: 8px; height: 8px; border-radius: 50%%; background: #35c07a; transition: background .2s; }
  .pulso.off { background: #c0503a; }
  label { color: #9aa1b1; display: flex; align-items: center; gap: 6px; }
  input[type=range] { width: 130px; }
  main { padding: 16px; display: flex; flex-direction: column; gap: 18px; }
  .card { background: #1c1f26; border: 1px solid #2a2e37; border-radius: 10px; overflow: hidden; }
  .card.novo { border-color: #35c07a; }
  .barra {
    display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
    padding: 8px 12px; border-bottom: 1px solid #2a2e37; background: #20242c;
  }
  .nome { color: #fff; font-weight: 600; }
  .meta { color: #7f8696; font-size: 11.5px; }
  .novo .meta.hora { color: #35c07a; }
  .img { background: #0f1115; padding: 12px; text-align: center; }
  .img img {
    max-width: 100%%; height: auto; border-radius: 4px;
    background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.4);
  }
  .vazio { color: #7f8696; padding: 40px 16px; text-align: center; }
</style>
</head>
<body>
<header>
  <span class="pulso" id="pulso"></span>
  <b>preview</b>
  <span class="pasta">%(pasta)s</span>
  <label>largura <input type="range" id="zoom" min="20" max="100" value="62"></label>
  <span class="meta" id="status">iniciando...</span>
</header>
<main id="lista"><div class="vazio">procurando arquivos...</div></main>
<script>
const lista = document.getElementById('lista');
const pulso = document.getElementById('pulso');
const status = document.getElementById('status');
const zoom = document.getElementById('zoom');
let estado = {};      // chave -> mtime ja exibido
let recentes = {};    // chave -> quando mudou (para destacar)

zoom.oninput = () => {
  document.querySelectorAll('.img img').forEach(i => i.style.width = zoom.value + '%%');
  localStorage.setItem('preview_zoom', zoom.value);
};
const salvo = localStorage.getItem('preview_zoom');
if (salvo) { zoom.value = salvo; }

function horaDe(ts) {
  return new Date(ts * 1000).toLocaleTimeString('pt-BR');
}
function tamanhoDe(b) {
  return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
}

async function atualizar() {
  let itens;
  try {
    const r = await fetch('/lista', { cache: 'no-store' });
    itens = await r.json();
    pulso.classList.remove('off');
  } catch (e) {
    pulso.classList.add('off');
    status.textContent = 'servidor fora do ar';
    return;
  }

  // Monta a lista de quadros: um por pagina de PDF, um por imagem.
  const quadros = [];
  for (const it of itens) {
    for (let p = 0; p < it.paginas; p++) {
      const chave = it.nome + '#' + p;
      quadros.push({
        chave, nome: it.nome, mtime: it.mtime, tamanho: it.tamanho,
        rotulo: it.pdf && it.paginas > 1 ? ' pag. ' + (p + 1) + '/' + it.paginas : '',
        src: '/img?' + new URLSearchParams({ nome: it.nome, pagina: p, t: it.mtime }),
      });
    }
  }

  const agora = Date.now();
  const chavesAgora = new Set(quadros.map(q => q.chave));
  let mudou = quadros.some(q => estado[q.chave] !== q.mtime)
           || Object.keys(estado).some(k => !chavesAgora.has(k));

  if (mudou) {
    for (const q of quadros) {
      if (estado[q.chave] !== q.mtime) { recentes[q.chave] = agora; }
    }
    lista.innerHTML = quadros.length ? '' : '<div class="vazio">nenhuma imagem ou PDF nesta pasta</div>';
    for (const q of quadros) {
      const novo = (agora - (recentes[q.chave] || 0)) < 6000;
      const card = document.createElement('div');
      card.className = 'card' + (novo ? ' novo' : '');
      card.innerHTML =
        '<div class="barra">' +
          '<span class="nome">' + q.nome + '</span>' +
          '<span class="meta">' + q.rotulo + '</span>' +
          '<span class="meta hora">' + horaDe(q.mtime) + '</span>' +
          '<span class="meta">' + tamanhoDe(q.tamanho) + '</span>' +
        '</div>' +
        '<div class="img"><img style="width:' + zoom.value + '%%" src="' + q.src + '"></div>';
      lista.appendChild(card);
    }
    estado = {};
    for (const q of quadros) { estado[q.chave] = q.mtime; }
  }

  status.textContent = quadros.length + ' quadro(s) - ultima checagem ' +
    new Date().toLocaleTimeString('pt-BR');
}

atualizar();
setInterval(atualizar, %(intervalo)d);
</script>
</body>
</html>
"""


def criar_handler(pasta, dpi, intervalo_ms):
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # o terminal e para a medicao, nao para o log do servidor

        def _enviar(self, codigo, tipo, corpo, cache=False):
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(corpo)))
            if cache:
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            else:
                self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(corpo)
            except (BrokenPipeError, ConnectionAbortedError):
                pass

        def do_GET(self):
            partes = urllib.parse.urlparse(self.path)
            rota = partes.path
            q = urllib.parse.parse_qs(partes.query)

            if rota == "/":
                corpo = PAGINA % {
                    "pasta": html.escape(os.path.abspath(pasta)),
                    "intervalo": intervalo_ms,
                }
                self._enviar(200, "text/html; charset=utf-8", corpo.encode("utf-8"))
                return

            if rota == "/lista":
                corpo = json.dumps(listar(pasta)).encode("utf-8")
                self._enviar(200, "application/json; charset=utf-8", corpo)
                return

            if rota == "/img":
                nome = (q.get("nome") or [""])[0]
                # So serve o que esta na pasta vigiada.
                if not nome or os.path.basename(nome) != nome:
                    self._enviar(400, "text/plain; charset=utf-8", b"nome invalido")
                    return
                caminho = os.path.join(pasta, nome)
                if not os.path.isfile(caminho) or not nome.lower().endswith(EXTENSOES):
                    self._enviar(404, "text/plain; charset=utf-8", b"nao encontrado")
                    return

                mtime = int(os.stat(caminho).st_mtime)
                if nome.lower().endswith(".pdf"):
                    try:
                        pagina = int((q.get("pagina") or ["0"])[0])
                    except ValueError:
                        pagina = 0
                    dados = render_pdf(caminho, mtime, pagina, dpi)
                    if dados is None:
                        self._enviar(503, "text/plain; charset=utf-8", b"renderizando")
                        return
                    self._enviar(200, "image/png", dados, cache=True)
                    return

                with open(caminho, "rb") as fp:
                    dados = fp.read()
                tipo = "image/png" if nome.lower().endswith(".png") else "image/jpeg"
                self._enviar(200, tipo, dados, cache=True)
                return

            self._enviar(404, "text/plain; charset=utf-8", b"nao encontrado")

    return Handler


class Servidor(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def ja_rodando(porta):
    """True quando a porta ja responde como um preview (e nao outro servico)."""
    import urllib.request
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/lista" % porta, timeout=1) as r:
            json.loads(r.read().decode("utf-8"))
        return True
    except Exception:
        return False


def subir(handler, porta_inicial, tentativas=10):
    """
    Abre na primeira porta livre a partir da pedida. Rodar o preview duas vezes
    e o erro mais comum do dia a dia; achar outra porta evita o traceback.
    """
    ultimo = None
    for porta in range(porta_inicial, porta_inicial + tentativas):
        try:
            return Servidor(("127.0.0.1", porta), handler), porta
        except OSError as e:
            ultimo = e
    raise SystemExit("ERRO: nenhuma porta livre entre %d e %d (%s)"
                     % (porta_inicial, porta_inicial + tentativas - 1, ultimo))


def main():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("pasta", nargs="?", default=None,
                   help="pasta a vigiar (padrao: ~/checklist-preview, criada se faltar)")
    p.add_argument("--porta", type=int, default=8765, help="porta HTTP (padrao 8765)")
    p.add_argument("--dpi", type=int, default=130, help="resolucao do render de PDF (padrao 130)")
    p.add_argument("--intervalo", type=float, default=1.5,
                   help="segundos entre as checagens na pagina (padrao 1.5)")
    p.add_argument("--sem-abrir", action="store_true",
                   help="nao abre o navegador sozinho")
    args = p.parse_args()

    pasta = args.pasta or PASTA_PADRAO
    # Criar sozinho e o que permite rodar sem argumento nenhum no primeiro dia.
    try:
        os.makedirs(pasta, exist_ok=True)
    except OSError as e:
        raise SystemExit("ERRO: nao consegui criar a pasta %s (%s)" % (pasta, e))

    # Preview ja aberto noutro terminal: reaproveita em vez de subir um segundo.
    if ja_rodando(args.porta):
        url = "http://localhost:%d" % args.porta
        print("# ja ha um preview no ar em %s - reaproveitando" % url)
        if not args.sem_abrir:
            webbrowser.open(url)
        return

    handler = criar_handler(pasta, args.dpi, int(args.intervalo * 1000))
    servidor, porta = subir(handler, args.porta)
    url = "http://localhost:%d" % porta

    with servidor:
        print("# vigiando : %s" % os.path.abspath(pasta))
        print("# render   : PDF a %d DPI | checagem a cada %.1fs" % (args.dpi, args.intervalo))
        if porta != args.porta:
            print("# porta    : %d estava ocupada, subi na %d" % (args.porta, porta))
        print("#")
        print("   %s" % url)
        print("#")
        print("# O navegador abre sozinho. Deixe este terminal aberto; Ctrl+C encerra.")
        if not args.sem_abrir:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            print("\n# encerrado")


if __name__ == "__main__":
    main()
