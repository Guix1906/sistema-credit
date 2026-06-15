import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type UiModalProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  panelClassName?: string
}

export function UiModal({ open, title, description, children, onClose, panelClassName = '' }: UiModalProps) {
  if (!open) return null

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="modal-backdrop" aria-label="Fechar modal" onClick={onClose} type="button" />
      <section className={`modal-panel ${panelClassName}`}>
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="icon-button" aria-label="Fechar" onClick={onClose} type="button"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}
