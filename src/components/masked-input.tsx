import type { InputHTMLAttributes } from 'react'

type MaskedInputProps = InputHTMLAttributes<HTMLInputElement> & {
  mask: (value: string) => string
}

export function MaskedInput({ mask, onChange, ...props }: MaskedInputProps) {
  return <input {...props} onChange={(event) => {
    event.target.value = mask(event.target.value)
    onChange?.(event)
  }} />
}
