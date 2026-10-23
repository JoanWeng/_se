import { describe, expect, it } from 'vitest'
import { AppState, validate } from '../../../server-node/src/store.js'

describe('validate', () => {
  it('通過正常輸入', () => {
    const { ok, errors } = validate('alice', 'hello world')
    expect(ok).toBe(true)
    expect(errors).toEqual([])
  })

  it('拒絕空白暱稱與內容', () => {
    const { ok, errors } = validate('', '')
    expect(ok).toBe(false)
    expect(errors).toEqual(['暱稱不可空白', '內容不可空白'])
  })

  it('只由空白組成視同空白', () => {
    const { ok } = validate('   ', '\n\t')
    expect(ok).toBe(false)
  })

  it('拒絕超過上限的暱稱與內容', () => {
    expect(validate('a'.repeat(21), 'ok').errors).toEqual(['暱稱不可超過 20 字'])
    expect(validate('ok', 'c'.repeat(201)).errors).toEqual(['內容不可超過 200 字'])
  })

  it('中文字以 unicode 字數計算上限', () => {
    expect(validate('我'.repeat(20), '字'.repeat(200)).ok).toBe(true)
    expect(validate('我'.repeat(21), 'ok').ok).toBe(false)
  })
})

describe('AppState', () => {
  it('create 去除前後空白並給遞增 id', () => {
    const state = new AppState()
    const first = state.create('  alice  ', '  hello  ')
    const second = state.create('bob', 'hi')
    expect(first.name).toBe('alice')
    expect(first.content).toBe('hello')
    expect(first.id).toBe(1)
    expect(second.id).toBe(2)
    expect(first.created_at).toBeGreaterThan(0)
  })

  it('list 由新到舊，且回傳副本', () => {
    const state = new AppState()
    state.create('a', 'first')
    state.create('b', 'second')
    const list = state.list()
    expect(list.map((m) => m.content)).toEqual(['second', 'first'])

    list[0].content = 'tampered'
    expect(state.list()[0].content).toBe('second')
  })

  it('remove 只刪得掉存在的留言', () => {
    const state = new AppState()
    const { id } = state.create('a', 'hello')
    expect(state.remove(id)).toBe(true)
    expect(state.remove(id)).toBe(false)
    expect(state.remove(999)).toBe(false)
    expect(state.list()).toEqual([])
  })

  it('seed 資料的 id 會續接', () => {
    const state = new AppState([{ id: 5, name: 'a', content: 'x', created_at: 1 }])
    expect(state.create('b', 'y').id).toBe(6)
  })
})
