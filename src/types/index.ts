// ─── Domínio Neo4j ───────────────────────────────────────────────────────────

export interface Beneficiario {
  cpf: string
  nome: string
  data_nascimento: string
  plano_codigo: string
}

export interface Plano {
  codigo: string
  nome: string
  tipo: 'enfermaria' | 'apartamento' | 'executivo'
  ans_registro: string
}

export interface Procedimento {
  tuss_codigo: string
  nome: string
  tipo: 'consulta' | 'exame' | 'cirurgia' | 'terapia'
}

export interface Medico {
  crm: string
  nome: string
  telefone?: string
}

export interface Especialidade {
  nome: string
  cfm_codigo: string
}

export interface Cidade {
  nome: string
  uf: string
  ibge_codigo: string
}

// ─── Resultados de query ──────────────────────────────────────────────────────

export interface MedicoComCobertura {
  crm: string
  nome: string
  cidade: string
  uf: string
  especialidade: string
  procedimentos_cobertos: string[]
}

export interface ResultadoCobertura {
  coberto: boolean
  procedimento?: string
  tuss_codigo?: string
  observacoes?: string
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface PerguntaRequest {
  cpf: string
  pergunta: string
}

export interface EntidadesExtraidas {
  intencao: 'buscar_medico' | 'verificar_cobertura' | 'listar_procedimentos' | 'outro'
  especialidade?: string
  procedimento?: string
  cidade?: string
  plano_codigo?: string
}

export interface RespostaAPI {
  resposta: string
  entidades: EntidadesExtraidas
  dados: MedicoComCobertura[] | ResultadoCobertura | null
  grafo: GrafoVisualizacao
  consulta_id: string
}

// ─── Visualização do grafo ────────────────────────────────────────────────────

export interface GrafoNo {
  id: string
  label: string
  tipo: 'beneficiario' | 'plano' | 'medico' | 'procedimento' | 'especialidade' | 'cidade'
  propriedades: Record<string, string>
}

export interface GrafoAresta {
  origem: string
  destino: string
  relacao: string
}

export interface GrafoVisualizacao {
  nos: GrafoNo[]
  arestas: GrafoAresta[]
}
