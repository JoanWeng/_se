export class AppState {
  #messages
  #nextId

  constructor(seed = []) {
    this.#messages = [...seed]
    this.#nextId = seed.reduce((max, m) => Math.max(max, m.id), 0) + 1
  }

  create(name, content) {
    const message = {
      id: this.#nextId++,
      name: name.trim(),
      content: content.trim(),
      created_at: Date.now(),
    }
    this.#messages.push(message)
    return { ...message }
  }

  list() {
    return [...this.#messages]
      .sort((a, b) => b.id - a.id)
      .map((m) => ({ ...m }))
  }

  remove(id) {
    const index = this.#messages.findIndex((m) => m.id === id)
    if (index === -1) return false
    this.#messages.splice(index, 1)
    return true
  }
}

export function validate(name, content) {
  const errors = []
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const trimmedContent = typeof content === 'string' ? content.trim() : ''

  if (!trimmedName) errors.push('暱稱不可空白')
  else if ([...trimmedName].length > 20) errors.push('暱稱不可超過 20 字')

  if (!trimmedContent) errors.push('內容不可空白')
  else if ([...trimmedContent].length > 200) errors.push('內容不可超過 200 字')

  return errors.length > 0 ? { ok: false, errors } : { ok: true, errors }
}
