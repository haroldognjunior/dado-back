import { MongoClient, Collection, Db } from 'mongodb'
import type { EntidadesExtraidas, RespostaAPI } from '../types/index.js'

let client: MongoClient
let db: Db

export async function conectarMongo(): Promise<Db> {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI ?? 'mongodb://localhost:27017')
    await client.connect()
    db = client.db(process.env.MONGODB_DB ?? 'saude_grafo')
    await criarIndices()
  }
  return db
}

async function criarIndices(): Promise<void> {
  const col = db.collection('consultas')
  await col.createIndex({ cpf: 1, criado_em: -1 })
  await col.createIndex({ 'entidades.intencao': 1 })
}

export async function salvarConsulta(
  cpf: string,
  pergunta: string,
  entidades: EntidadesExtraidas,
  resposta: RespostaAPI
): Promise<string> {
  const col: Collection = (await conectarMongo()).collection('consultas')

  const doc = {
    _id: resposta.consulta_id,
    cpf,
    pergunta,
    entidades,
    resposta_texto: resposta.resposta,
    dados_retornados: resposta.dados,
    criado_em: new Date(),
    feedback: null,
  }

  await col.insertOne(doc)
  return resposta.consulta_id
}

export async function salvarFeedback(
  consulta_id: string,
  util: boolean,
  comentario?: string
): Promise<void> {
  const col: Collection = (await conectarMongo()).collection('consultas')

  await col.updateOne(
    { _id: consulta_id },
    {
      $set: {
        feedback: { util, comentario: comentario ?? null, respondido_em: new Date() },
      },
    }
  )
}

export async function buscarHistorico(
  cpf: string,
  limite = 10
): Promise<{ pergunta: string; resposta_texto: string; criado_em: Date }[]> {
  const col: Collection = (await conectarMongo()).collection('consultas')

  return col
    .find({ cpf }, { projection: { pergunta: 1, resposta_texto: 1, criado_em: 1 } })
    .sort({ criado_em: -1 })
    .limit(limite)
    .toArray() as Promise<{ pergunta: string; resposta_texto: string; criado_em: Date }[]>
}
