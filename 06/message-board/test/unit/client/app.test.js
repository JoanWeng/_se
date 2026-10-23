// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { hideError, messageItem, renderMessages, showError, updateEmptyState } from '../../../client/js/app.js'

const NOW = 1_700_000_000_000

function message(id, overrides = {}) {
  return {
    id,
    name: 'alice',
    content: 'hello',
    created_at: NOW - 60_000,
    ...overrides,
  }
}

beforeAll(() => {
  document.body.innerHTML =
    '<form id="message-form"><input id="name"/><textarea id="content"></textarea>' +
    '<button id="submit-btn"></button><p id="error-msg" hidden></p></form>' +
    '<p id="empty-state" hidden></p><ul id="message-list"></ul>' +
    '<span id="status"></span><select id="backend-select">' +
    '<option value="node">node</option><option value="rust">rust</option></select>'
})

describe('messageItem', () => {
  it('渲染暱稱、內容與時間', () => {
    const html = messageItem(message(1), NOW)
    expect(html).toContain('alice')
    expect(html).toContain('hello')
    expect(html).toContain('1 分鐘前')
    expect(html).toContain('data-id="1"')
  })

  it('跳出惡意內容不會注入 HTML', () => {
    const html = messageItem(message(2, { content: '<img src=x onerror=alert(1)>' }), NOW)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('renderMessages', () => {
  it('空的清單渲染成空容器', () => {
    const container = document.getElementById('message-list')
    renderMessages(container, [], NOW)
    expect(container.children).toHaveLength(0)
  })

  it('多筆留言會渲染多個項目', () => {
    const container = document.getElementById('message-list')
    renderMessages(container, [message(1), message(2)], NOW)
    expect(container.querySelectorAll('.message')).toHaveLength(2)
  })
})

describe('updateEmptyState', () => {
  it('沒有留言時顯示空狀態', () => {
    const emptyEl = document.getElementById('empty-state')
    updateEmptyState(emptyEl, 0)
    expect(emptyEl.hidden).toBe(false)
    updateEmptyState(emptyEl, 3)
    expect(emptyEl.hidden).toBe(true)
  })
})

describe('showError / hideError', () => {
  it('顯示與隱藏錯誤訊息', () => {
    const msgEl = document.getElementById('error-msg')
    showError(msgEl, '暱稱不可空白')
    expect(msgEl.hidden).toBe(false)
    expect(msgEl.textContent).toBe('暱稱不可空白')
    hideError(msgEl)
    expect(msgEl.hidden).toBe(true)
  })
})
