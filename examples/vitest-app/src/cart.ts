export interface CartItem {
  price: number
  quantity: number
}

export interface Coupon {
  percent: number
  expired: boolean
}

export function subtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function applyCoupon(total: number, coupon?: Coupon): number {
  if (!coupon) return total
  if (coupon.expired) return total
  return total * (1 - coupon.percent / 100)
}
