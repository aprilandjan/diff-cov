import { describe, expect, it } from 'vitest'
import { applyCoupon, subtotal } from '../src/cart'

describe('cart', () => {
  it('sums items', () => {
    expect(subtotal([{ price: 10, quantity: 2 }])).toBe(20)
  })

  it('applies a valid coupon', () => {
    expect(applyCoupon(100, { percent: 10, expired: false })).toBe(90)
  })
})
