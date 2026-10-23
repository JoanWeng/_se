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
