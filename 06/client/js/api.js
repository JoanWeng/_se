export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(base, endpoint, options = {}) {
  let response
  try {
    response = await fetch(base + endpoint, options)
  } catch {
    throw new ApiError('無法連線到伺服器，請確認後端已啟動', 0)
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = await response.json()
      if (body && typeof body.error === 'string') message = body.error
    } catch {
      // 非 JSON 回應，保留預設訊息
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return null
  return response.json()
}

export function createApi(baseUrl = '') {
  return {
    health: () => request(baseUrl, '/api/health'),
    getMessages: () => request(baseUrl, '/api/messages'),
    addMessage: (name, content) =>
      request(baseUrl, '/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      }),
    deleteMessage: (id) =>
      request(baseUrl, `/api/messages/${id}`, { method: 'DELETE' }),
  }
}
