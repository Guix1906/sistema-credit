import { Clock, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../contexts/auth-context'

export function LoginPage() {
  const { accessBlock, clearAccessBlock, session, signIn, signUp, resetPassword } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'

  if (session) {
    return <Navigate replace to={redirectTo} />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    clearAccessBlock()

    try {
      if (mode === 'signup') {
        await signUp({ fullName, email, password })
        setMessage('Cadastro criado. Verifique seu e-mail e confirme a conta antes de entrar.')
        setMode('login')
        setPassword('')
        return
      }

      await signIn(email, password)
      navigate(redirectTo, { replace: true })
    } catch (error) {
      setMessage(getErrorMessage(error, 'Nao foi possivel concluir a operacao.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword() {
    if (!email) {
      setMessage('Informe o e-mail para recuperar a senha.')
      return
    }

    setSubmitting(true)
    setMessage('')

    try {
      await resetPassword(email)
      setMessage('Enviamos o link de recuperacao para o e-mail informado.')
    } catch (error) {
      setMessage(getErrorMessage(error, 'Nao foi possivel recuperar a senha.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="login-shell">
        <aside className="login-brand-panel">
          <div className="login-brand-mark">SC</div>
          <div>
            <span className="login-kicker">Gestao de Credito</span>
            <h1>Sistema de Credito</h1>
            <p>Operacao financeira, cobrancas, carteira, caixa e auditoria em um fluxo unico.</p>
          </div>
          <div className="login-feature-grid">
            <article>
              <ShieldCheck size={20} />
              <strong>RLS ativo</strong>
              <span>Dados protegidos por perfil.</span>
            </article>
            <article>
              <Clock size={20} />
              <strong>Horario seguro</strong>
              <span>Entrada controlada por configuracao.</span>
            </article>
          </div>
        </aside>

        <section className="login-panel">
          <div className="login-heading">
            <span>{mode === 'signup' ? 'Cadastro' : 'Acesso'}</span>
            <h2>{mode === 'signup' ? 'Criar conta' : 'Entrar no sistema'}</h2>
          </div>

          <div className="segmented-control auth-mode-control">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">
              Entrar
            </button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} type="button">
              Cadastrar
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'signup' ? (
              <label>
                Nome
                <span className="input-with-icon">
                  <UserRound size={18} />
                  <input autoComplete="name" onChange={(event) => setFullName(event.target.value)} required value={fullName} />
                </span>
              </label>
            ) : null}
            <label>
              E-mail
              <span className="input-with-icon">
                <Mail size={18} />
                <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              </span>
            </label>
            <label>
              Senha
              <span className="input-with-icon">
                <LockKeyhole size={18} />
                <input
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </span>
            </label>
            {message ? <p className="form-message">{message}</p> : null}
            {accessBlock ? (
              <section className="access-block" aria-live="polite">
                <h2>Sistema indisponivel no momento</h2>
                <dl>
                  <div>
                    <dt>Horario atual</dt>
                    <dd>{accessBlock.currentTime}</dd>
                  </div>
                  <div>
                    <dt>Entrada permitida</dt>
                    <dd>{accessBlock.openingTime}</dd>
                  </div>
                  <div>
                    <dt>Fechamento</dt>
                    <dd>{accessBlock.closingTime}</dd>
                  </div>
                  <div>
                    <dt>Proximo acesso permitido</dt>
                    <dd>{accessBlock.nextAllowedAt}</dd>
                  </div>
                </dl>
              </section>
            ) : null}
            <button disabled={submitting} type="submit">
              {submitting ? 'Aguarde...' : mode === 'signup' ? 'Cadastrar e enviar confirmacao' : 'Entrar'}
            </button>
            {mode === 'login' ? (
              <button disabled={submitting} onClick={handleResetPassword} type="button" className="link-button">
                Recuperar senha
              </button>
            ) : null}
          </form>
        </section>
      </section>
    </main>
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message)
  }

  return fallback
}
