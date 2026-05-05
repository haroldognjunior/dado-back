# Saúde Grafo

Sistema de navegação de cobertura de plano de saúde com IA e grafos.

## Stack

- **Frontend**: React + TypeScript + D3.js (visualização do grafo)
- **Backend**: Node.js + TypeScript + Express
- **LLM**: Groq — extração de entidades + resposta humanizada
- **Grafo**: Neo4j — relações entre plano, cobertura, médicos, procedimentos
- **Documentos**: MongoDB — histórico de consultas e feedback

## Por que Neo4j aqui?

O domínio de saúde é naturalmente um grafo:

```
(Beneficiário)-[:POSSUI]->(Plano)-[:COBRE]->(Procedimento)<-[:REALIZA]-(Médico)
(Médico)-[:TEM_ESPECIALIDADE]->(Especialidade)
(Médico)-[:ATENDE_EM]->(Cidade)
```

Em SQL, a query "cardiologistas cobertos pelo meu plano em SP" exige 4 JOINs
e tabelas intermediárias de relacionamento. Em Neo4j é um traversal natural
de 3 linhas em Cypher, executado em milissegundos mesmo com milhões de nós.

## Por que MongoDB além do Neo4j?

MongoDB e Neo4j têm responsabilidades distintas e complementares:

| | Neo4j | MongoDB |
|---|---|---|
| O que armazena | Relações estruturais do domínio | Histórico de uso e feedback |
| Padrão de acesso | Traversal de grafos (Cypher) | Busca por CPF + sort por data |
| Por que não o outro | Histórico não é grafo | Relações de cobertura não são documentos |

## Como rodar

```bash
cp .env.example .env
# preencher ANTHROPIC_API_KEY, NEO4J_*, MONGODB_URI

npm install
npm run seed      # popula Neo4j com dados de exemplo
npm run dev       # inicia o servidor
```

## Endpoints

### `POST /api/perguntar`
Recebe pergunta em linguagem natural, retorna resposta + grafo.

```json
{
  "cpf": "123.456.789-00",
  "pergunta": "quais cardiologistas têm em São Paulo?"
}
```

Resposta:
```json
{
  "resposta": "Encontrei 1 cardiologista coberto pelo seu plano em São Paulo...",
  "entidades": { "intencao": "buscar_medico", "especialidade": "Cardiologia", "cidade": "São Paulo" },
  "dados": [{ "nome": "Dr. Ricardo Alves", "crm": "SP-123456", ... }],
  "grafo": { "nos": [...], "arestas": [...] },
  "consulta_id": "uuid"
}
```

### `POST /api/feedback`
Salva avaliação do beneficiário sobre a resposta.

### `GET /api/historico/:cpf`
Retorna últimas consultas do beneficiário.

## Fluxo do endpoint principal

```
Pergunta (PT-BR)
    │
    ▼
Groq → extrai { intencao, especialidade, cidade, procedimento }
    │
    ▼
Neo4j (Cypher) → traversal do grafo de cobertura
    │
    ▼
Groq → gera resposta humanizada com os dados reais
    │
    ▼
MongoDB → persiste para histórico e análise
    │
    ▼
Resposta { texto, dados, grafo } → frontend React
```
