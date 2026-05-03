import neo4j, { Driver, Session } from "neo4j-driver";
import type {
  EntidadesExtraidas,
  MedicoComCobertura,
  ResultadoCobertura,
  GrafoVisualizacao,
  GrafoNo,
  GrafoAresta,
} from "../types/index.js";

let driver: Driver;

export function conectarNeo4j(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI ?? "bolt://localhost:7687",
      neo4j.auth.basic(
        process.env.NEO4J_USER ?? "neo4j",
        process.env.NEO4J_PASSWORD ?? "password",
      ),
    );
  }
  return driver;
}

export async function fecharNeo4j(): Promise<void> {
  if (driver) await driver.close();
}

// ─── Query principal: médicos por especialidade + cidade + plano ──────────────

export async function buscarMedicosPorCobertura(
  cpf: string,
  entidades: EntidadesExtraidas,
): Promise<{ medicos: MedicoComCobertura[]; grafo: GrafoVisualizacao }> {
  const session: Session = conectarNeo4j().session();

  try {
    const result = await session.run(
      `
      MATCH (b:Beneficiario {cpf: $cpf})-[:POSSUI]->(p:Plano)
      MATCH (p)-[:COBRE]->(proc:Procedimento)<-[:REALIZA]-(m:Medico)
      MATCH (m)-[:TEM_ESPECIALIDADE]->(e:Especialidade)
      MATCH (m)-[:ATENDE_EM]->(c:Cidade)
      WHERE ($especialidade IS NULL OR toLower(e.nome) CONTAINS toLower($especialidade))
        AND ($cidade IS NULL OR toLower(c.nome) CONTAINS toLower($cidade))
      RETURN
        m.crm        AS crm,
        m.nome       AS nome,
        c.nome       AS cidade,
        c.uf         AS uf,
        e.nome       AS especialidade,
        collect(proc.nome) AS procedimentos_cobertos
      ORDER BY m.nome
      LIMIT 20
      `,
      {
        cpf,
        especialidade: entidades.especialidade ?? null,
        cidade: entidades.cidade ?? null,
      },
    );

    const medicos: MedicoComCobertura[] = result.records.map((r) => ({
      crm: r.get("crm"),
      nome: r.get("nome"),
      cidade: r.get("cidade"),
      uf: r.get("uf"),
      especialidade: r.get("especialidade"),
      procedimentos_cobertos: r.get("procedimentos_cobertos"),
    }));

    const grafo = construirGrafoMedicos(cpf, medicos, entidades);
    return { medicos, grafo };
  } finally {
    await session.close();
  }
}

// ─── Query: verificar cobertura de procedimento específico ───────────────────

export async function verificarCobertura(
  cpf: string,
  entidades: EntidadesExtraidas,
): Promise<{ resultado: ResultadoCobertura; grafo: GrafoVisualizacao }> {
  const session: Session = conectarNeo4j().session();

  try {
    const result = await session.run(
      `
      MATCH (b:Beneficiario {cpf: $cpf})-[:POSSUI]->(p:Plano)
      MATCH (p)-[:COBRE]->(proc:Procedimento)
      WHERE toLower(proc.nome) CONTAINS toLower($procedimento)
         OR proc.tuss_codigo = $procedimento
      RETURN proc.nome AS nome, proc.tuss_codigo AS tuss_codigo
      LIMIT 1
      `,
      {
        cpf,
        procedimento: entidades.procedimento ?? "",
      },
    );

    const coberto = result.records.length > 0;
    const resultado: ResultadoCobertura = {
      coberto,
      procedimento: coberto ? result.records[0].get("nome") : undefined,
      tuss_codigo: coberto ? result.records[0].get("tuss_codigo") : undefined,
      observacoes: coberto
        ? "Procedimento coberto pelo seu plano."
        : "Procedimento não encontrado na cobertura do seu plano atual.",
    };

    const grafo = construirGrafoCobertura(cpf, resultado, entidades);
    return { resultado, grafo };
  } finally {
    await session.close();
  }
}

// ─── Helpers: montar estrutura de grafo para o frontend ──────────────────────

function construirGrafoMedicos(
  cpf: string,
  medicos: MedicoComCobertura[],
  entidades: EntidadesExtraidas,
): GrafoVisualizacao {
  const nos: GrafoNo[] = [
    {
      id: `ben-${cpf}`,
      label: "Você",
      tipo: "beneficiario" as const,
      propriedades: { cpf },
    },
    ...medicos.slice(0, 5).map((m) => ({
      id: `med-${m.crm}`,
      label: m.nome,
      tipo: "medico" as const,
      propriedades: { crm: m.crm, cidade: `${m.cidade} - ${m.uf}` },
    })),
    ...(entidades.especialidade
      ? [
          {
            id: `esp-${entidades.especialidade}`,
            label: entidades.especialidade,
            tipo: "especialidade" as const,
            propriedades: {},
          },
        ]
      : []),
  ];

  const arestas: GrafoAresta[] = medicos.slice(0, 5).flatMap((m) => [
    { origem: `ben-${cpf}`, destino: `med-${m.crm}`, relacao: "PLANO COBRE" },
    ...(entidades.especialidade
      ? [
          {
            origem: `med-${m.crm}`,
            destino: `esp-${entidades.especialidade}`,
            relacao: "TEM_ESPECIALIDADE",
          },
        ]
      : []),
  ]);

  return { nos, arestas };
}

export async function listarProcedimentosCobertos(cpf: string) {
  const session = driver.session();

  try {
    const result = await session.run(
      `
      MATCH (b:Beneficiario {cpf: $cpf})-[:TEM_PLANO]->(p:Plano)
      MATCH (p)-[:COBRE]->(proc:Procedimento)
      RETURN 
        p.codigo AS plano_codigo,
        p.nome AS plano_nome,
        proc.tuss_codigo AS tuss_codigo,
        proc.nome AS nome,
        proc.tipo AS tipo
      ORDER BY proc.nome
      `,
      { cpf },
    );

    const procedimentos = result.records.map((record) => ({
      tuss_codigo: record.get("tuss_codigo"),
      nome: record.get("nome"),
      tipo: record.get("tipo"),
      plano_codigo: record.get("plano_codigo"),
      plano_nome: record.get("plano_nome"),
    }));

    const nos: GrafoNo[] = [
      {
        id: `beneficiario-${cpf}`,
        label: "Beneficiário",
        tipo: "beneficiario",
        propriedades: { cpf },
      },
      ...procedimentos.map((p) => ({
        id: `procedimento-${p.tuss_codigo}`,
        label: p.nome,
        tipo: "procedimento" as const,
        propriedades: {
          tuss: p.tuss_codigo,
          tipo: p.tipo,
        },
      })),
    ];

    const arestas: GrafoAresta[] = procedimentos.map((p) => ({
      origem: `beneficiario-${cpf}`,
      destino: `procedimento-${p.tuss_codigo}`,
      relacao: "TEM_COBERTURA",
    }));

    return {
      procedimentos,
      grafo: {
        nos,
        arestas,
      },
    };
  } finally {
    await session.close();
  }
}

function construirGrafoCobertura(
  cpf: string,
  resultado: ResultadoCobertura,
  entidades: EntidadesExtraidas,
): GrafoVisualizacao {
  const nos = [
    {
      id: `ben-${cpf}`,
      label: "Você",
      tipo: "beneficiario" as const,
      propriedades: { cpf },
    },
    {
      id: `proc-${resultado.tuss_codigo ?? "unknown"}`,
      label: resultado.procedimento ?? entidades.procedimento ?? "Procedimento",
      tipo: "procedimento" as const,
      propriedades: {
        tuss: resultado.tuss_codigo ?? "-",
        coberto: resultado.coberto ? "Sim" : "Não",
      },
    },
  ];

  const arestas = resultado.coberto
    ? [
        {
          origem: `ben-${cpf}`,
          destino: `proc-${resultado.tuss_codigo}`,
          relacao: "COBERTO POR PLANO",
        },
      ]
    : [];

  return { nos, arestas };
}
