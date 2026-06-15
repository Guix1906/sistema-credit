import { AlertTriangle } from 'lucide-react'

import { UiModal } from './ui-modal'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  tone?: 'danger' | 'warning'
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  loading = false,
  tone = 'danger',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const close = loading ? () => undefined : onClose

  return (
    <UiModal open={open} title={title} onClose={close} panelClassName="confirm-panel">
      <div className={`confirm-dialog confirm-dialog-${tone}`}>
        <span className="confirm-dialog-icon"><AlertTriangle size={22} /></span>
        <p>{description}</p>
      </div>
      <div className="button-row confirm-actions">
        <button className="secondary-button" disabled={loading} onClick={onClose} type="button">{cancelLabel}</button>
        <button className={tone === 'danger' ? 'destructive-button' : 'secondary-button'} disabled={loading} onClick={onConfirm} type="button">
          {loading ? 'Processando...' : confirmLabel}
        </button>
      </div>
    </UiModal>
  )
}
