import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Erro fatal no sistema:', error, errorInfo)
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError)
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError)
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  handleWindowError = (event: ErrorEvent) => {
    this.setState({ error: event.error instanceof Error ? event.error : new Error(event.message) })
  }

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    this.setState({ error: reason instanceof Error ? reason : new Error(String(reason)) })
  }

  render() {
    if (this.state.error) {
      return (
        <main className="auth-shell">
          <section className="login-panel">
            <div className="login-heading">
              <span>Erro no sistema</span>
              <h2>Erro ao carregar o sistema</h2>
            </div>
            <p className="form-message">{this.state.error.message}</p>
            <p className="muted-copy">
              Atualize a pagina. Se continuar, envie esta mensagem de erro para suporte.
            </p>
            <button className="primary-button" onClick={() => window.location.reload()} type="button">
              Recarregar
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
