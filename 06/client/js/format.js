export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

export function formatTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts) / 1000
  const minutes = Math.floor(diff / 60)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  return new Date(ts).toLocaleString('zh-TW', { hour12: false })
}
