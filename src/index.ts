import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { router } from './routes/saude.route.js'
import { conectarNeo4j, fecharNeo4j } from './services/neo4j.service.js'
import { conectarMongo } from './services/mongo.service.js'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(cors())
app.use(express.json())

app.use('/api', router)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

async function iniciar() {
  try {
    conectarNeo4j()
    console.log('✓ Neo4j conectado')

    await conectarMongo()
    console.log('✓ MongoDB conectado')

    app.listen(PORT, () => {
      console.log(`✓ Servidor rodando em http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('Erro ao iniciar:', err)
    process.exit(1)
  }
}

process.on('SIGINT', async () => {
  await fecharNeo4j()
  process.exit(0)
})

iniciar()
