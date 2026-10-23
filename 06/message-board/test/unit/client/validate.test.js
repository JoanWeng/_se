import { describe, expect, it } from 'vitest'
import { validate } from '../../../client/js/validate.js'

describe('validate（前端版）', () => {
  it('通過正常輸入', () => {
    expect(validate('alice', 'hello').ok).toBe(true)
  })

  it('拒絕空白輸入', () => {
    const { ok, errors } = validate('', '  ')
    expect(ok).toBe(false)
    expect(errors).toEqual(['暱稱不可空白', '內容不可空白'])
  })

  it('拒絕超長輸入', () => {
    expect(validate('a'.repeat(21), 'ok').ok).toBe(false)
    expect(validate('ok', 'c'.repeat(201)).ok).toBe(false)
  })

  it('錯誤訊息與後端一致', () => {
    expect(validate('', '').errors).toEqual(['暱稱不可空白', '內容不可空白'])
    expect(validate('a'.repeat(21), 'ok').errors).toEqual(['暱稱不可超過 20 字'])
    expect(validate('ok', 'c'.repeat(201)).errors).toEqual(['內容不可超過 200 字'])
  })
})
