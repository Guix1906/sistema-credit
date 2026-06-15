import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsyncData<T>(loader: () => Promise<T>, fallback: T) {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    setLoading(true)
    setError(null)

    try {
      const nextData = await loader()

      if (mounted.current && requestId.current === currentRequestId) {
        setData(nextData)
      }
    } catch (error) {
      if (mounted.current && requestId.current === currentRequestId) {
        setError(error instanceof Error ? error.message : 'Nao foi possivel carregar os dados.')
      }
    } finally {
      if (mounted.current && requestId.current === currentRequestId) {
        setLoading(false)
      }
    }
  }, [loader])

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
      requestId.current += 1
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload }
}
