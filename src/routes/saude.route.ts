import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { extrairEntidades, gerarResposta } from "../services/llm.service.js";
import {
  buscarMedicosPorCobertura,
  verificarCobertura,
} from "../services/neo4j.service.js";
import {
  salvarConsulta,
  salvarFeedback,
  buscarHistorico,
} from "../services/mongo.service.js";
import type { GrafoVisualizacao, RespostaAPI } from "../types/index.js";

export const router = Router();

// ─── Validação de entrada ─────────────────────────────────────────────────────

const PerguntaSchema = z.object({
  cpf: z.string().min(11).max(14),
  pergunta: z.string().min(3).max(500),
});

const FeedbackSchema = z.object({
  consulta_id: z.string().uuid(),
  util: z.boolean(),
  comentario: z.string().max(300).optional(),
});

// ─── POST /api/perguntar ──────────────────────────────────────────────────────
// Endpoint principal: recebe pergunta em linguagem natural, orquestra IA +
// Neo4j, persiste no Mongo e retorna resposta + grafo para o frontend.

router.post("/perguntar", async (req: Request, res: Response) => {
  const parsed = PerguntaSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ erro: "Dados inválidos", detalhes: parsed.error.flatten() });
    return;
  }

  const { cpf, pergunta } = parsed.data;

  try {
    // 1. IA extrai intenção e entidades da pergunta
    const entidades = await extrairEntidades(pergunta);

    // 2. Neo4j: roteamento por intenção
    let dados = null;
    let grafo: GrafoVisualizacao = { nos: [], arestas: [] };

    if (entidades.intencao === "buscar_medico") {
      const resultado = await buscarMedicosPorCobertura(cpf, entidades);
      dados = resultado.medicos;
      grafo = resultado.grafo;
    } else if (entidades.intencao === "verificar_cobertura") {
      const resultado = await verificarCobertura(cpf, entidades);
      dados = resultado.resultado;
      grafo = resultado.grafo;
    }

    // 3. IA gera resposta humanizada em PT-BR com os dados do grafo
    const resposta_texto = await gerarResposta(pergunta, entidades, dados);

    const resposta: RespostaAPI = {
      resposta: resposta_texto,
      entidades,
      dados,
      grafo,
      consulta_id: randomUUID(),
    };

    // 4. MongoDB persiste a consulta para histórico e análise
    await salvarConsulta(cpf, pergunta, entidades, resposta);

    res.json(resposta);
  } catch (err) {
    console.error("[/perguntar]", err);
    res.status(500).json({ erro: "Erro interno ao processar sua pergunta." });
  }
});

// ─── POST /api/feedback ───────────────────────────────────────────────────────

router.post("/feedback", async (req: Request, res: Response) => {
  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos" });
    return;
  }

  const { consulta_id, util, comentario } = parsed.data;

  try {
    await salvarFeedback(consulta_id, util, comentario);
    res.json({ ok: true });
  } catch (err) {
    console.error("[/feedback]", err);
    res.status(500).json({ erro: "Erro ao salvar feedback." });
  }
});

// ─── GET /api/historico/:cpf ──────────────────────────────────────────────────

router.get("/historico/:cpf", async (req: Request, res: Response) => {
  const { cpf } = req.params;

  try {
    const historico = await buscarHistorico(cpf);
    res.json({ historico });
  } catch (err) {
    console.error("[/historico]", err);
    res.status(500).json({ erro: "Erro ao buscar histórico." });
  }
});
