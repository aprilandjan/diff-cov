import { describe, expect, it } from 'vitest'
import { add, isEven } from '../src/math'

describe('math', () => {
  it('adds', () => {
    expect(add(1, 2)).toBe(3)
  })

  it('checks parity', () => {
    expect(isEven(4)).toBe(true)
    expect(isEven(3)).toBe(false)
  })
})
