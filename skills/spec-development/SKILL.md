---
name: spec-development
description: Full spec-first pipeline. Auto-triggered for any feature request. PRD → spec → architect → dev ↔ QA loop (max 10x, code-blind) → security → doc.
---

# Workflow de Desenvolvimento de Features

## Comando de Uso
```
/spec-development <nome-da-feature>
```

Auto-ativado para qualquer feature request — não precisa invocar manualmente.

## Estrutura de Diretórios
```
specs/
└── <nome-da-feature>/
    ├── prd.md                — User Stories, ACs testáveis, edge cases, escopo
    ├── spec.md               — Especificação técnica
    ├── architecture.md       — Decisões arquiteturais, arquivos a criar/modificar
    ├── tasks.md              — [ ] Tarefas atômicas ordenadas
    ├── qa-report-N.md        — Resultado QA iteração N (cada AC: PASS/FAIL)
    ├── qa-findings-N.md      — Falhas com seletores/fluxos/errors para dev
    ├── security-report.md    — Gate de segurança (Crítico=0, Alto<=1)
    ├── loop-state.json       — {"iteration": N, "status": "dev|qa|security|done|halted"}
    └── DONE.md               — Sumário de conclusão
```

## Fluxo de Execução

### 1. PRD (specifier) — OBRIGATÓRIO ANTES DE QUALQUER CÓDIGO
- Criar `specs/<nome-da-feature>/prd.md`
- Conteúdo: User Stories, Critérios de Aceitação testáveis via browser, Edge Cases, Escopo in/out

### 2. Spec + Arquitetura (architect — roda explore primeiro)
- `spec.md` — detalhamento técnico
- `architecture.md` — arquivos, patterns, decisões
- `tasks.md` — `[ ]` tarefas atômicas ordenadas

### 3. Dev → QA Loop (MAX 10 iterações)

**Dev:**
- Implementa seguindo `tasks.md`
- Atualiza `[ ]` → `[x]` por task
- Escreve testes unitários

**QA (code-blind — ABSOLUTO):**
- ✅ PERMITIDO: Playwright, Chrome DevTools, `npm run dev`/start
- ❌ PROIBIDO: Read/Grep/Glob em código, Edit, Write em código
- Lê apenas `prd.md` para conhecer os ACs
- Testa cada AC via browser real
- Gera `qa-report-N.md` (todos ACs com evidências)
- Se fail → gera `qa-findings-N.md` (seletor exato, erro de console, network fail)

**Condições de saída:**
- ✅ Todos ACs passam → Fase 4 (Security)
- 🔁 Algum falha e N < 10 → dev recebe findings → corrige → N+1
- 🛑 N == 10 → PARAR. Exibir ao usuário:
  ```
  ⚠️ 10 iterações QA atingidas para: <feature-slug>
  ACs passando: X/Y
  Falhas: [lista]

  A) Continuar (+5 iterações)
  B) Cancelar feature
  C) Reescrever PRD/abordagem
  D) Intervenção manual
  ```

### 4. Security Review
- `security-report.md`: injection, secrets, auth, CVEs
- Gate: **Crítico=0, Alto<=1**

### 5. Documentação Final
- `DONE.md`: o que foi implementado, ACs, links, rollback
- Atualizar `README.md`, `AGENTS.md` do projeto

### Critérios de Sucesso
- [ ] prd.md criado antes de qualquer código
- [ ] Todos ACs do prd.md passando no browser
- [ ] security-report.md aprovado (Crítico=0)
- [ ] DONE.md e docs do projeto atualizados

## Migração para Agentes em Código (Sem CrewAI)

CrewAI 0.11.x **requer** `langchain<0.2.0` e `langchain-openai<0.0.6`. **Não funciona** com Python 3.14 ou LangChain 1.x. Sintoma: `ModuleNotFoundError: No module named 'langchain.agents'`.

### Alternativa: Pipeline com ChatOpenAI + ThreadPoolExecutor

Usar `ChatOpenAI` direto do `langchain_openai` com chamadas `llm.invoke()` no lugar de agentes CrewAI. Paralelismo via `ThreadPoolExecutor`. Mesma topologia, sem dependência do framework:

```python
from langchain_openai import ChatOpenAI
from concurrent.futures import ThreadPoolExecutor, as_completed

def llm_call(llm, system, user):
    r = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    return r.content

# Provider chain: opencode-go → OpenRouter → Gemini
llm = ChatOpenAI(model="deepseek-v4-flash",
    openai_api_base="https://opencode.ai/zen/go/v1",
    openai_api_key=key)

# Serial: especificador + arquiteto
spec = llm_call(llm, "Sistema: Especificador...", "Analise requisitos...")
tasks = llm_call(llm, "Sistema: Arquiteto...", "Queue em micro-tarefas...")

# Paralelo: Dev workers com ThreadPoolExecutor (default 8, max 20)
with ThreadPoolExecutor(max_workers=8) as ex:
    futures = [ex.submit(run_dev, i, t) for i, t in enumerate(micro_tasks)]
    for f in as_completed(futures):
        results.append(f.result())
```

### Provider Chain (Fallback Automático)

Ordem: **opencode-go/deepseek-v4-flash** → OpenRouter free → Google Gemini.

Keys resolvidas automaticamente de: env var → `~/.local/share/opencode/auth.json` → `~/.config/opencode/.env`.

### Retry Loop

Só `failed` dispara retry. `skipped` e `error` são terminais (não gastar tokens tentando corrigir Docker off).

### Exemplo Funcional

`~/Code/agent-workflow/` contém pipeline completo sem CrewAI:
- `orchestrator.py` — CLI (`--spec`, `--output`, `--workers`, `--max-retries`, `--api-key`)
- `docker-compose.test.yml` — Sandbox Docker para QA Playwright
- `spec.md` — Spec de exemplo (auth API)

```bash
python orchestrator.py --spec spec.md --output ./output --workers 8
```

Ver `master-orchestrator` skill → `references/no-crewai-pipeline.md` para documentação completa.

### Quando Migrar

- Pipeline tem 4+ agentes encadeados
- Precisa de paralelismo real (devs simultâneos)
- Loop de retry com condição programática
- Execução de ferramentas (Docker, Playwright, terminal)

### Alternativa 2: Paperclip Agents (Orquestração via UI)

Se o Paperclip estiver rodando (http://localhost:3100), use agents especializados como orquestradores:

```
Pipeline no Paperclip:
  Issue 1: Especificador (cria spec)
  Issue 2: Dev (implementa codigo)       ← depende da Issue 1
  Issue 3: Revisor (revisao)             ← depende da Issue 2
```

**Setup:**
1. Crie agents no Paperclip via API (ver `paperclip-windows-setup` skill → `references/api-agent-creation.md`). **Atenção ao formato do modelo:** use `"model":"deepseek-v4-flash"` (nome puro) + `"provider":"opencode-go"` separado — NÃO use `"model":"opencode-go:deepseek-v4-flash"`.
2. Crie Issues em sequencia, assignando pro agente certo
3. Cada agente executa `hermes chat -q` localmente com acesso total a arquivos

**Vantagens:** UI pronta, fila de tarefas, heartbeat scheduling, historico de execucao.
**Limitacao:** Encadeamento sequencial e manual (vc cria a prox issue quando a anterior termina). Para automacao, use Hermes `delegate_task` para orquestrar os passos.

## Comandos de Execução
```bash
# Iniciar workflow
/spec-development <nome-da-feature>

# Ver status
/spec-development --status <nome-da-feature>

# Continuar workflow em step específico
/spec-development <nome-da-feature> --from <agente>
```

## Integração com Projeto
- Segue stack definida em `AGENTS.md`
- Respeita padrões de código em `CLAUDE.md`
- Utiliza estrutura de diretórios do projeto
