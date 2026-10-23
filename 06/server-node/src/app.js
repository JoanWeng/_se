import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppState, validate } from './store.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(here, '../../client')

export function createApp({ state = new AppState() } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', backend: 'node' })
  })

  app.get('/api/messages', (req, res) => {
    res.json({ messages: state.list() })
  })

  app.post('/api/messages', (req, res) => {
    const { name = '', content = '' } = req.body ?? {}
    const { ok, errors } = validate(name, content)
    if (!ok) return res.status(400).json({ error: errors.join('；') })
    res.status(201).json(state.create(name, content))
  })

  app.delete('/api/messages/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || !state.remove(id)) {
      return res.status(404).json({ error: '留言不存在' })
    }
    res.status(204).end()
  })

  app.use(express.static(clientDir))
  app.use((req, res) => {
    res.status(404).json({ error: '找不到資源' })
  })

  return app
}
