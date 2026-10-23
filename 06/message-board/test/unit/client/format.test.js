import { describe, expect, it } from 'vitest'
import { escapeHtml, formatTime } from '../../../client/js/format.js'

describe('escapeHtml', () => {
  it('轉義所有危險字元', () => {
    expect(escapeHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;')
  })

  it('一般文字不變', () => {
    expect(escapeHtml('hello 世界 123')).toBe('hello 世界 123')
  })
})

describe('formatTime', () => {
  const now = 1_700_000_000_000

  it('60 秒內顯示剛剛', () => {
    expect(formatTime(now - 59_000, now)).toBe('剛剛')
    expect(formatTime(now, now)).toBe('剛剛')
  })

  it('一小時內顯示分鐘', () => {
    expect(formatTime(now - 5 * 60_000, now)).toBe('5 分鐘前')
    expect(formatTime(now - 59 * 60_000, now)).toBe('59 分鐘前')
  })

  it('一天內顯示小時', () => {
    expect(formatTime(now - 3 * 3_600_000, now)).toBe('3 小時前')
    expect(formatTime(now - 23 * 3_600_000, now)).toBe('23 小時前')
  })

  it('超過一天顯示完整日期時間', () => {
    expect(formatTime(now - 25 * 3_600_000, now)).not.toBe('剛剛')
  })

  it('未來時間不會出現負數', () => {
    expect(formatTime(now + 10_000, now)).toBe('剛剛')
  })
})
