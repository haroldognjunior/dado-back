import type {
  EntidadesExtraidas,
  MedicoComCobertura,
  ProcedimentoCoberto,
  ResultadoCobertura,
} from "../types/index.js";

// ─── Cliente Groq (grátis, sem cartão) ───────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function chamarGroq(system: string, user: string): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 512,
      temperature: 0.1,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err}`);
  }
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Fallback: extração por regras + sintomas ─────────────────────────────────

const ESPECIALIDADES: Record<string, string> = {
  cardio: "Cardiologia",
  cardiologis: "Cardiologia",
  ortoped: "Ortopedia",
  ortopedis: "Ortopedia",
  neurolog: "Neurologia",
  neurol: "Neurologia",
  pediatr: "Pediatria",
  dermato: "Dermatologia",
  oftalmo: "Oftalmologia",
  psiqui: "Psiquiatria",
  ginecol: "Ginecologia",
  urologis: "Urologia",
};

// Sintomas mapeados para especialidades
const SINTOMAS: Record<string, string> = {
  "dor no peito": "Cardiologia",
  "dor no coração": "Cardiologia",
  "falta de ar": "Cardiologia",
  coração: "Cardiologia",
  "pressão alta": "Cardiologia",
  infarto: "Cardiologia",
  arritmia: "Cardiologia",
  osso: "Ortopedia",
  joelho: "Ortopedia",
  tornozelo: "Ortopedia",
  fratura: "Ortopedia",
  coluna: "Ortopedia",
  "dor nas costas": "Ortopedia",
  "dor no joelho": "Ortopedia",
  enxaqueca: "Neurologia",
  "dor de cabeça": "Neurologia",
  convulsão: "Neurologia",
  tontura: "Neurologia",
  formigamento: "Neurologia",
  febre: "Pediatria",
  criança: "Pediatria",
  bebê: "Pediatria",
  "manchas na pele": "Dermatologia",
  acne: "Dermatologia",
  pele: "Dermatologia",
  visão: "Oftalmologia",
  olho: "Oftalmologia",
  ansiedade: "Psiquiatria",
  depressão: "Psiquiatria",
  insônia: "Psiquiatria",
};

const PROCEDIMENTOS: Record<string, string> = {
  ressona: "Ressonância Magnética",
  ressonânc: "Ressonância Magnética",
  ecocardio: "Ecocardiograma",
  tomograf: "Tomografia Computadorizada",
  angioplas: "Angioplastia Coronária",
};

const CIDADES: Record<string, string> = {
  "são paulo": "São Paulo",
  "sao paulo": "São Paulo",
  " sp": "São Paulo",
  campinas: "Campinas",
  "rio de jan": "Rio de Janeiro",
  " rj": "Rio de Janeiro",
};

function extrairEntidadesPorRegras(pergunta: string): EntidadesExtraidas {
  const q = pergunta.toLowerCase();

  const querCobertura = /cobre|coberto|cobertura|inclui|tem direito|paga/.test(
    q,
  );
  const querMedico =
    /médico|medico|doutor|dra|dr\.|especialista|clínica|clinica|quais|lista|disponív|preciso de|quero/.test(
      q,
    );
  const querExames = /exame|exames|procedimento/.test(q);

  let intencao: EntidadesExtraidas["intencao"] = "outro";
  if (querCobertura) intencao = "verificar_cobertura";
  else if (querMedico) intencao = "buscar_medico";
  else if (querExames) intencao = "listar_procedimentos";

  // Especialidade por nome direto
  let especialidade: string | undefined;
  for (const [k, v] of Object.entries(ESPECIALIDADES)) {
    if (q.includes(k)) {
      especialidade = v;
      break;
    }
  }

  // Especialidade por sintoma (se não encontrou por nome)
  if (!especialidade) {
    for (const [sintoma, esp] of Object.entries(SINTOMAS)) {
      if (q.includes(sintoma)) {
        especialidade = esp;
        // Se veio por sintoma, provavelmente quer médico
        if (intencao === "outro") intencao = "buscar_medico";
        break;
      }
    }
  }

  let procedimento: string | undefined;
  for (const [k, v] of Object.entries(PROCEDIMENTOS)) {
    if (q.includes(k)) {
      procedimento = v;
      break;
    }
  }

  let cidade: string | undefined;
  for (const [k, v] of Object.entries(CIDADES)) {
    if (q.includes(k)) {
      cidade = v;
      break;
    }
  }

  if (procedimento && intencao === "outro") intencao = "verificar_cobertura";
  if (especialidade && intencao === "outro") intencao = "buscar_medico";

  return { intencao, especialidade, procedimento, cidade };
}

function gerarRespostaPorRegras(
  entidades: EntidadesExtraidas,
  dados:
    | MedicoComCobertura[]
    | ResultadoCobertura
    | ProcedimentoCoberto[]
    | null,
): string {
  if (entidades.intencao === "buscar_medico") {
    const medicos = dados as MedicoComCobertura[];
    if (!medicos || medicos.length === 0) {
      const esp = entidades.especialidade
        ? ` de ${entidades.especialidade}`
        : "";
      const local = entidades.cidade ? ` em ${entidades.cidade}` : "";
      return `Não encontrei médicos disponíveis${esp}${local} na sua rede credenciada. Tente outra cidade ou especialidade.`;
    }
    const nomes = medicos.map((m) => `${m.nome} (CRM ${m.crm})`).join(", ");
    const local = entidades.cidade ? ` em ${entidades.cidade}` : "";
    const esp = entidades.especialidade ? ` de ${entidades.especialidade}` : "";
    return `Encontrei ${medicos.length} médico(s)${esp}${local} coberto(s) pelo seu plano: ${nomes}.`;
  }
  if (entidades.intencao === "verificar_cobertura") {
    const r = dados as ResultadoCobertura;
    if (r?.coberto)
      return `Sim! ${r.procedimento} está coberto pelo seu plano. ${r.observacoes ?? ""}`;
    return (
      r?.observacoes ??
      "Este procedimento não está coberto pelo seu plano atual."
    );
  }
  return "Não entendi sua pergunta. Tente descrever seus sintomas ou perguntar sobre médicos e procedimentos.";
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const PROMPT_EXTRACAO = `Você é um extrator de entidades para um sistema de plano de saúde brasileiro.
O usuário pode descrever sintomas, doenças ou fazer perguntas diretas sobre médicos e cobertura.
Retorne APENAS um JSON válido, sem markdown, sem explicação, sem blocos de código.

Estrutura: {"intencao":"buscar_medico"|"verificar_cobertura"|"listar_procedimentos"|"outro","especialidade":string|null,"procedimento":string|null,"cidade":string|null,"plano_codigo":null}

Mapeamento de sintomas para especialidades:
- dor no peito, falta de ar, coração, pressão alta → Cardiologia
- dor nas costas, joelho, osso, fratura, coluna → Ortopedia
- dor de cabeça, enxaqueca, tontura, formigamento → Neurologia
- febre, criança, bebê → Pediatria
- pele, manchas, acne → Dermatologia
- visão, olho → Oftalmologia
- ansiedade, depressão, insônia → Psiquiatria

Exemplos:
- "sinto dor no peito e falta de ar" → {"intencao":"buscar_medico","especialidade":"Cardiologia","procedimento":null,"cidade":null,"plano_codigo":null}
- "quais cardiologistas têm em SP?" → {"intencao":"buscar_medico","especialidade":"Cardiologia","procedimento":null,"cidade":"São Paulo","plano_codigo":null}
- "meu plano cobre ressonância magnética?" → {"intencao":"verificar_cobertura","especialidade":null,"procedimento":"Ressonância Magnética","cidade":null,"plano_codigo":null}`;

const PROMPT_RESPOSTA = `Você é um assistente virtual de um plano de saúde brasileiro, simpático e objetivo.
Responda sempre em português brasileiro, de forma clara e amigável.
Se o usuário descreveu sintomas, confirme a especialidade sugerida e apresente os médicos encontrados.
Use os dados fornecidos. Não invente informações. Máximo 3 frases.`;

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function extrairEntidades(
  pergunta: string,
): Promise<EntidadesExtraidas> {
  if (GROQ_API_KEY) {
    try {
      const texto = await chamarGroq(PROMPT_EXTRACAO, pergunta);
      const clean = texto.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as EntidadesExtraidas;
      console.log("[groq] entidades extraídas via API:", parsed);
      return parsed;
    } catch (err: any) {
      console.warn("[groq] erro — usando extração por regras:", err?.message);
    }
  }
  const entidades = extrairEntidadesPorRegras(pergunta);
  console.log("[regras] entidades:", entidades);
  return entidades;
}

export async function gerarResposta(
  pergunta: string,
  entidades: EntidadesExtraidas,
  dados:
    | MedicoComCobertura[]
    | ResultadoCobertura
    | ProcedimentoCoberto[]
    | null,
): Promise<string> {
  if (GROQ_API_KEY) {
    try {
      const contexto = `Pergunta: "${pergunta}"\nIntenção: ${entidades.intencao}\nEspecialidade identificada: ${entidades.especialidade ?? "nenhuma"}\nDados: ${JSON.stringify(dados, null, 2)}`;
      const texto = await chamarGroq(PROMPT_RESPOSTA, contexto);
      console.log("[groq] resposta gerada via API");
      return texto.trim();
    } catch (err: any) {
      console.warn("[groq] erro — usando resposta por regras:", err?.message);
    }
  }
  return gerarRespostaPorRegras(entidades, dados);
}
