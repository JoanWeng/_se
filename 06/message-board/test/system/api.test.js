import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../server-node/src/app.js'
import { AppState } from '../../server-node/src/store.js'

let app

beforeAll(() => {
  const state = new AppState([
    { id: 10, name: 'seed', content: 'seed message', created_at: 1 },
  ])
  app = createApp({ state })
})

describe('GET /api/health', () => {
  it('回覆 ok 與後端名稱', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', backend: 'node' })
  })
})

describe('GET /api/messages', () => {
  it('一開始只有 seed 資料', async () => {
    const res = await request(app).get('/api/messages')
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(1)
    expect(res.body.messages[0]).toMatchObject({ id: 10, content: 'seed message' })
  })
})

describe('POST /api/messages', () => {
  it('正常建立回傳 201 與完整留言', async () => {
    const res = await request(app)
      .post('/api/messages')
      .send({ name: '  alice  ', content: ' hello api ' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      id: 11,
      name: 'alice',
      content: 'hello api',
    })
    expect(typeof res.body.created_at).toBe('number')
  })

  it('缺少欄位回傳 400 與中文錯誤訊息', async () => {
    const res = await request(app).post('/api/messages').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('暱稱不可空白；內容不可空白')
  })

  it('超長內容回傳 400', async () => {
    const res = await request(app)
      .post('/api/messages')
      .send({ name: 'a', content: 'x'.repeat(201) })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('內容不可超過 200 字')
  })

  it('非 JSON 內容回傳 400', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Content-Type', 'text/plain')
      .send('not json')
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/messages/:id', () => {
  it('刪除成功回傳 204，再刪一次回傳 404', async () => {
    const created = await request(app)
      .post('/api/messages')
      .send({ name: 'tmp', content: 'bye' })
    expect(created.status).toBe(201)
    const { id } = created.body

    const first = await request(app).delete(`/api/messages/${id}`)
    expect(first.status).toBe(204)
    expect(first.body).toEqual({})

    const again = await request(app).delete(`/api/messages/${id}`)
    expect(again.status).toBe(404)
    expect(again.body.error).toBe('留言不存在')
  })

  it('不存在的 id 回傳 404', async () => {
    const res = await request(app).delete('/api/messages/999')
    expect(res.status).toBe(404)
  })

  it('非數字 id 回傳 404', async () => {
    const res = await request(app).delete('/api/messages/abc')
    expect(res.status).toBe(404)
  })
})

describe('CORS', () => {
  it('允許任意來源', async () => {
    const res = await request(app)
      .options('/api/messages')
      .set('Origin', 'http://localhost:8000')
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })
})

describe('靜態前端', () => {
  it('根路徑回傳留言板頁面', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('留言板')
  })

  it('未知路徑回傳 404 JSON', async () => {
    const res = await request(app).get('/no/such/path')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('找不到資源')
  })
})
