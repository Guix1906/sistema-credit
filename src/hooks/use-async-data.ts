import { useCallback, useEffect, useState } from 'react'

export function useAsyncData<T>(loader: () => Promise<T>, fallback: T) {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      setData(await loader())
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível carregar os dados.')
    } finally {
      setLoading(false)
    }
  }, [loader])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload }
}
