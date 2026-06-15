export type UserRole = 'admin' | 'gerente' | 'afiliado' | 'cobrador' | 'atendente'

export type Profile = {
  id: string
  full_name: string
  email: string
  role: UserRole
  phone?: string | null
  cpf?: string | null
  route_id?: string | null
  commission_rate?: number
  permissions?: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}
