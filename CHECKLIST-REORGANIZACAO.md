# Checklist: Unificar o projeto num repositório só (v2 — corrigido)

Correções em relação à v1, depois do retorno do Claude Code:
- Não existe pasta `lib/` — é só um `parse.js` solto mesmo. Copiar só esse.
- Não existe serviço do Windows instalado ainda — o vigia hoje roda pelo Agendador
  de Tarefas antigo (ou terminal aberto manualmente). Então não tem o que
  "desinstalar" no Passo 1 — em vez disso, remove-se a tarefa antiga do Agendador.
- Aproveitamos essa reorganização pra já instalar o serviço de verdade pela
  primeira vez, no lugar novo (junta duas tarefas pendentes numa só).
- Os arquivos `install-service.js` e `uninstall-service.js` foram reenviados
  junto com este checklist — salve os dois na pasta do vigia antes de começar.

Estrutura final:
```
IASD-Curicica/          (pasta do painel, renomeada — já tem Git + GitHub)
├── etl/                 ← watcher.js, parse.js, package.json, .env,
│                            install-service.js, uninstall-service.js
├── docs/                 ← index.html (GitHub Pages só publica de "/docs" ou raiz)
├── supabase/
│   └── 01_supabase_schema.sql
├── .gitignore
└── README.md
```

## Quem faz o quê
- **Claude Code (na pasta conectada)**: mover/copiar arquivos, criar `.gitignore`,
  criar/ajustar `README.md`
- **Você (terminal no Windows)**: parar o vigia, mexer no Agendador de Tarefas,
  `npm install`, instalar o serviço, `git add/commit/push`, conferir `services.msc`

---

## Passo 0 — Confirmar caminhos
- [ ] Confirme o caminho exato de `IASD - Curicica_Projeto` (vigia) e
      `IASD - Curicica_painel` (painel) — o Claude Code já tem acesso às duas
- [ ] A pasta unificada `IASD-Curicica` vai ser a própria pasta do painel, renomeada

## Passo 1 — Parar o vigia (você, manualmente)
- [ ] Se tiver um terminal aberto rodando `npm start`, aperte **Ctrl+C** pra parar
- [ ] Abra o Agendador de Tarefas: `Win + R` → `taskschd.msc` → Enter
- [ ] Procure a tarefa que criamos há um tempo (algo como "Vigia Tesouraria IASD")
- [ ] Clique com botão direito → **Excluir** (ela aponta pro caminho antigo, que vai
      deixar de existir — não tem por que manter)

## Passo 2 — `.gitignore` (Claude Code faz)
Na pasta do painel (raiz nova), criar/editar `.gitignore` com pelo menos:
```
etl/.env
etl/node_modules/
etl/daemon/
node_modules/
*.log
```
- [ ] Confirmar que `etl/.env` está listado — é o passo mais importante de
      segurança desse checklist inteiro

## Passo 3 — Mover os arquivos (Claude Code faz)
- [ ] Criar `docs/` e mover `index.html` pra lá
- [ ] Criar `etl/` e copiar: `watcher.js`, `parse.js` (só esse, sem `lib/`),
      `package.json`, `package-lock.json`, `.env`, `install-service.js`,
      `uninstall-service.js`
- [ ] Criar `supabase/` e mover `01_supabase_schema.sql` pra lá
- [ ] Renomear a pasta raiz de `IASD - Curicica_painel` para `IASD-Curicica`

## Passo 4 — Instalar o serviço de verdade, no lugar novo (você, terminal como Administrador)
- [ ] `cd` até `IASD-Curicica/etl/`
- [ ] `npm install`
- [ ] `node install-service.js`
- [ ] Confirme em `services.msc` que "IASD Curicica - Vigia Tesouraria" aparece e
      está **Em execução**
- [ ] É normal ver as mensagens de sincronização de novo no log (ele reprocessa o
      que já está na pasta do ACMS)

## Passo 5 — Atualizar o GitHub Pages (você, no navegador)
- [ ] Repositório `dclaus23/IASD---Curicica_painel` → **Settings → Pages**
- [ ] **Branch**: trocar de "/ (root)" para **"/docs"** → Save
- [ ] Espere 1-2 min, confirme que o painel continua abrindo normal

## Passo 6 — Commit e push (você, terminal)
- [ ] `git add .`
- [ ] Rode `git status` e **confirme que `etl/.env` NÃO aparece** na lista — se
      aparecer, pare e me chama antes de continuar
- [ ] `git commit -m "Reorganiza projeto: etl/, docs/, supabase/ num repositório só"`
- [ ] `git push`

## Passo 7 — Limpeza (você, só depois de confirmar que tudo funciona)
- [ ] Painel abrindo normal + serviço rodando + dados sincronizando → aí sim apague
      a pasta antiga `IASD - Curicica_Projeto`

## Passo 8 — Atualizar o PROJETO-CONTEXTO.md (Claude Code faz)
- [ ] Ajustar os caminhos descritos nele pra `etl/`, `docs/`, `supabase/`, refletindo
      a estrutura nova, pra sessões futuras já começarem certas
