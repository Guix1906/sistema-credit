export function getOperationErrorMessage(error: unknown, operation: string): string {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return `Nao foi possivel ${operation}. Verifique sua conexao e tente novamente.`
  }

  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return `Nao foi possivel ${operation}.`
}
