import { validate } from './validate.js'
import { createApi } from './api.js'
import { escapeHtml, formatTime } from './format.js'

export const BACKEND_BASES = {
  node: '',
  rust: 'http://localhost:8000',
}

const BACKEND_STORAGE_KEY = 'message-board-backend'

export function messageItem(message, now = Date.now()) {
  return `<li class="message" data-id="${message.id}" data-testid="message-item">
  <header>
    <span class="name">${escapeHtml(message.name)}</span>
    <time class="time" datetime="${new Date(message.created_at).toISOString()}">${formatTime(message.created_at, now)}</time>
    <button class="delete-btn" data-testid="delete-btn" data-id="${message.id}">刪除</button>
  </header>
  <p class="content">${escapeHtml(message.content)}</p>
</li>`
}

export function renderMessages(container, messages, now = Date.now()) {
  container.innerHTML = messages.map((m) => messageItem(m, now)).join('')
}

export function updateEmptyState(emptyEl, count) {
  emptyEl.hidden = count > 0
}

export function showError(msgEl, message) {
  msgEl.textContent = message
  msgEl.hidden = false
}

export function hideError(msgEl) {
  msgEl.textContent = ''
  msgEl.hidden = true
}

export function initApp({ doc = document, storage = localStorage } = {}) {
  const form = doc.getElementById('message-form')
  const nameInput = doc.getElementById('name')
  const contentInput = doc.getElementById('content')
  const listEl = doc.getElementById('message-list')
  const emptyEl = doc.getElementById('empty-state')
  const errorEl = doc.getElementById('error-msg')
  const statusEl = doc.getElementById('status')
  const backendSelect = doc.getElementById('backend-select')

  let api
  let currentBackend

  function currentBase() {
    return BACKEND_BASES[backendSelect.value] ?? ''
  }

  async function load() {
    hideError(errorEl)
    try {
      const { messages } = await api.getMessages()
      renderMessages(listEl, messages)
      updateEmptyState(emptyEl, messages.length)
      statusEl.textContent = ''
    } catch (error) {
      statusEl.textContent = `後端沒有回應（${currentBackend}）`
      showError(errorEl, error.message)
    }
  }

  function switchBackend(backend) {
    currentBackend = backend
    storage.setItem(BACKEND_STORAGE_KEY, backend)
    api = createApi(currentBase())
    statusEl.textContent = `使用 ${backend} 後端`
    load()
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    hideError(errorEl)

    const name = nameInput.value
    const content = contentInput.value
    const { ok, errors } = validate(name, content)
    if (!ok) {
      showError(errorEl, errors.join('；'))
      return
    }

    try {
      await api.addMessage(name, content)
      nameInput.value = ''
      contentInput.value = ''
      await load()
    } catch (error) {
      showError(errorEl, error.message)
    }
  })

  listEl.addEventListener('click', async (event) => {
    const button = event.target.closest('.delete-btn')
    if (!button) return
    try {
      await api.deleteMessage(Number(button.dataset.id))
      await load()
    } catch (error) {
      showError(errorEl, error.message)
    }
  })

  backendSelect.addEventListener('change', () => switchBackend(backendSelect.value))

  const saved = storage.getItem(BACKEND_STORAGE_KEY)
  if (saved && saved in BACKEND_BASES) backendSelect.value = saved
  switchBackend(backendSelect.value)
}
