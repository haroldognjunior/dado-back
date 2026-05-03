import 'dotenv/config'
import neo4j from 'neo4j-driver'

const driver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER ?? 'neo4j',
    process.env.NEO4J_PASSWORD ?? 'password'
  )
)

const session = driver.session()

async function seed() {
  console.log('Limpando base...')
  await session.run('MATCH (n) DETACH DELETE n')

  console.log('Criando constraints...')
  await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (b:Beneficiario) REQUIRE b.cpf IS UNIQUE')
  await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (m:Medico) REQUIRE m.crm IS UNIQUE')
  await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (p:Plano) REQUIRE p.codigo IS UNIQUE')
  await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (pr:Procedimento) REQUIRE pr.tuss_codigo IS UNIQUE')

  console.log('Criando planos...')
  await session.run(`
    CREATE
      (:Plano {codigo: 'PLUS-SP', nome: 'SaúdePlus SP', tipo: 'apartamento', ans_registro: '123456'}),
      (:Plano {codigo: 'BASIC-SP', nome: 'SaúdeBasic SP', tipo: 'enfermaria', ans_registro: '123457'})
  `)

  console.log('Criando procedimentos...')
  await session.run(`
    CREATE
      (:Procedimento {tuss_codigo: '40301010', nome: 'Consulta em Cardiologia', tipo: 'consulta'}),
      (:Procedimento {tuss_codigo: '40301011', nome: 'Consulta em Ortopedia', tipo: 'consulta'}),
      (:Procedimento {tuss_codigo: '40301012', nome: 'Consulta em Neurologia', tipo: 'consulta'}),
      (:Procedimento {tuss_codigo: '40901014', nome: 'Ressonância Magnética', tipo: 'exame'}),
      (:Procedimento {tuss_codigo: '40901015', nome: 'Ecocardiograma', tipo: 'exame'}),
      (:Procedimento {tuss_codigo: '40901016', nome: 'Tomografia Computadorizada', tipo: 'exame'}),
      (:Procedimento {tuss_codigo: '30721018', nome: 'Angioplastia Coronária', tipo: 'cirurgia'})
  `)

  console.log('Criando especialidades...')
  await session.run(`
    CREATE
      (:Especialidade {nome: 'Cardiologia', cfm_codigo: '02'}),
      (:Especialidade {nome: 'Ortopedia', cfm_codigo: '13'}),
      (:Especialidade {nome: 'Neurologia', cfm_codigo: '11'})
  `)

  console.log('Criando cidades...')
  await session.run(`
    CREATE
      (:Cidade {nome: 'São Paulo', uf: 'SP', ibge_codigo: '3550308'}),
      (:Cidade {nome: 'Campinas', uf: 'SP', ibge_codigo: '3509502'}),
      (:Cidade {nome: 'Rio de Janeiro', uf: 'RJ', ibge_codigo: '3304557'})
  `)

  console.log('Criando médicos...')
  await session.run(`
    CREATE
      (:Medico {crm: 'SP-123456', nome: 'Dr. Ricardo Alves', telefone: '11-91234-5678'}),
      (:Medico {crm: 'SP-234567', nome: 'Dra. Ana Lima', telefone: '11-92345-6789'}),
      (:Medico {crm: 'SP-345678', nome: 'Dr. Carlos Mendes', telefone: '11-93456-7890'}),
      (:Medico {crm: 'RJ-456789', nome: 'Dra. Beatriz Costa', telefone: '21-91234-5678'})
  `)

  console.log('Criando beneficiário de teste...')
  await session.run(`
    CREATE (:Beneficiario {cpf: '123.456.789-00', nome: 'João Silva', data_nascimento: '1985-03-12'})
  `)

  console.log('Criando relações...')
  await session.run(`
    MATCH (b:Beneficiario {cpf: '123.456.789-00'}), (p:Plano {codigo: 'PLUS-SP'})
    CREATE (b)-[:POSSUI]->(p)
  `)

  await session.run(`
    MATCH (p:Plano {codigo: 'PLUS-SP'}), (pr:Procedimento)
    WHERE pr.tuss_codigo IN ['40301010','40301011','40301012','40901014','40901015','40901016','30721018']
    CREATE (p)-[:COBRE]->(pr)
  `)

  await session.run(`
    MATCH (p:Plano {codigo: 'BASIC-SP'}), (pr:Procedimento)
    WHERE pr.tuss_codigo IN ['40301010','40301011','40901016']
    CREATE (p)-[:COBRE]->(pr)
  `)

  await session.run(`
    MATCH (m:Medico {crm: 'SP-123456'}), (e:Especialidade {nome: 'Cardiologia'})
    CREATE (m)-[:TEM_ESPECIALIDADE]->(e)
  `)
  await session.run(`
    MATCH (m:Medico {crm: 'SP-234567'}), (e:Especialidade {nome: 'Ortopedia'})
    CREATE (m)-[:TEM_ESPECIALIDADE]->(e)
  `)
  await session.run(`
    MATCH (m:Medico {crm: 'SP-345678'}), (e:Especialidade {nome: 'Neurologia'})
    CREATE (m)-[:TEM_ESPECIALIDADE]->(e)
  `)
  await session.run(`
    MATCH (m:Medico {crm: 'RJ-456789'}), (e:Especialidade {nome: 'Cardiologia'})
    CREATE (m)-[:TEM_ESPECIALIDADE]->(e)
  `)

  await session.run(`
    MATCH (m:Medico), (pr:Procedimento {tipo: 'consulta'})
    WHERE (m.crm = 'SP-123456' AND pr.tuss_codigo = '40301010')
       OR (m.crm = 'SP-234567' AND pr.tuss_codigo = '40301011')
       OR (m.crm = 'SP-345678' AND pr.tuss_codigo = '40301012')
       OR (m.crm = 'RJ-456789' AND pr.tuss_codigo = '40301010')
    CREATE (m)-[:REALIZA]->(pr)
  `)

  await session.run(`
    MATCH (m:Medico {crm: 'SP-123456'}), (pr:Procedimento)
    WHERE pr.tuss_codigo IN ['40901015','30721018']
    CREATE (m)-[:REALIZA]->(pr)
  `)

  await session.run(`
    MATCH (m:Medico), (c:Cidade)
    WHERE (m.crm IN ['SP-123456','SP-234567','SP-345678'] AND c.nome = 'São Paulo')
       OR (m.crm = 'RJ-456789' AND c.nome = 'Rio de Janeiro')
    CREATE (m)-[:ATENDE_EM]->(c)
  `)

  await session.run(`
    MATCH (b:Beneficiario {cpf: '123.456.789-00'}), (pr:Procedimento {tuss_codigo: '40901015'})
    CREATE (b)-[:REALIZOU {data: '2024-11-10', medico_crm: 'SP-123456'}]->(pr)
  `)

  console.log('✓ Seed concluído com sucesso!')
  console.log('  Beneficiário de teste → CPF: 123.456.789-00')
}

seed()
  .catch(console.error)
  .finally(async () => {
    await session.close()
    await driver.close()
  })
