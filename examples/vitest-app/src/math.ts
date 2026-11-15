export function add(a: number, b: number): number {
  return a + b
}

export function isEven(value: number): boolean {
  return value % 2 === 0
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('division by zero')
  }
  return a / b
}
