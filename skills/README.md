# Skills distribuídas pela ferramenta

Estas são as skills do Claude Code que o checklist-tools instala nos repositórios de checklist.
O `.claude/` daqueles repositórios não vai para o git, então cada dev ficaria sem elas — por isso
a cópia oficial mora aqui, versionada junto com a ferramenta.

Toda vez que alguém usa **"Enviar para o Claude Code"** (Designer ou extrator), a ferramenta copia a
pasta do repositório de destino para `<repo>/.claude/skills/`, gravando só o que mudou
(`src/app/api/instalar-skills/route.ts`).

| Pasta | Repositório de destino | Skills |
|---|---|---|
| `acampaChecklist/` | acampa-checklist | `checklist-pos-venda` |
| `eiChecklist/` | stellantis-ei-checklist | `checklist-designer`, `checklist-pdf-marcacoes` |

## Para mudar uma skill

Edite **aqui** e faça commit no checklist-tools. Editar direto em `<repo>/.claude/skills/` não adianta:
o próximo envio sobrescreve com a versão daqui.

Sem caminho fixo de máquina nas skills: cada dev guarda os repositórios num lugar. Use caminhos
relativos ao repositório (a skill roda com ele aberto) ou descubra a raiz pela posição do script.
