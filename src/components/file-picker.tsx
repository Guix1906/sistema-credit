import { UploadCloud } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
  hint?: string
}

export function FilePicker({ label, hint, className = '', ...props }: FilePickerProps) {
  return (
    <label className={`file-picker ${className}`}>
      <span className="file-picker-icon"><UploadCloud size={20} /></span>
      <span className="file-picker-copy">
        <strong>{label}</strong>
        <small>{hint ?? 'Clique para selecionar um arquivo'}</small>
      </span>
      <input type="file" {...props} />
    </label>
  )
}
