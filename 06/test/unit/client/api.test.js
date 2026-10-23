import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createApi } from '../../../client/js/api.js'

const MESSAGE = { id: 1, name: 'alice', content: 'hello', created_at: 1700000000000 }

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createApi', () => {
  it('getMessages 回傳解析後的留言清單', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ messages: [MESSAGE] }))
    vi.stubGlobal('fetch', fetch)

    const api = createApi('http://localhost:3000')
    const { messages } = await api.getMessages()

    expect(messages).toEqual([MESSAGE])
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/messages', {})
  })

  it('addMessage 送出 JSON 與正確的 method/header', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(MESSAGE, 201))
    vi.stubGlobal('fetch', fetch)

    const api = createApi('')
    await api.addMessage('alice', 'hello')

    expect(fetch).toHaveBeenCalledWith('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'alice', content: 'hello' }),
    })
  })

  it('deleteMessage 使用 DELETE；204 回傳 null', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetch)

    const api = createApi('')
    await expect(api.deleteMessage(3)).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/messages/3', { method: 'DELETE' })
  })

  it('伺服器 400 時拋出帶後端錯誤訊息的 ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: '內容不可空白' }, 400),
    ))

    const api = createApi('')
    const error = await api.addMessage('alice', '').catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.message).toBe('內容不可空白')
  })

  it('網路失敗拋出 status 0 的 ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    const api = createApi('http://localhost:8000')
    const error = await api.getMessages().catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.message).toContain('無法連線')
  })

  it('後端回 404 時顯示留言不存在', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: '留言不存在' }, 404),
    ))

    const api = createApi('')
    const error = await api.deleteMessage(9).catch((e) => e)
    expect(error.status).toBe(404)
    expect(error.message).toBe('留言不存在')
  })
})
