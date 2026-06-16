import { useCallback, useEffect, useRef, useState } from 'react'

type AsyncDataOptions = {
  cacheKey?: string
  staleTime?: number
  gcTime?: number
  enabled?: boolean
}

type CacheEntry<T> = {
  data?: T
  error: string | null
  promise?: Promise<T>
  updatedAt: number
  gcTimer?: ReturnType<typeof setTimeout>
}

const asyncDataCache = new Map<string, CacheEntry<unknown>>()

export function useAsyncData<T>(loader: () => Promise<T>, fallback: T, options: AsyncDataOptions = {}) {
  const { cacheKey, enabled = true, gcTime = 10 * 60 * 1000, staleTime = 60 * 1000 } = options
  const cachedEntry = readCache<T>(cacheKey)
  const [data, setData] = useState<T>(() => cachedEntry?.data ?? fallback)
  const [loading, setLoading] = useState(() => enabled && !cachedEntry?.data)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const requestId = useRef(0)

  const load = useCallback(async (force = false) => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId

    const entry = readCache<T>(cacheKey)
    const hasCachedData = entry?.data !== undefined
    const isFresh = Boolean(entry && Date.now() - entry.updatedAt < staleTime)

    if (!force && entry?.data !== undefined) {
      setData(entry.data)
      setError(entry.error)
      setLoading(false)

      if (isFresh) return
    } else {
      setLoading(!hasCachedData)
    }

    setError(null)

    try {
      const nextData = await fetchWithCache(cacheKey, loader, gcTime)

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
  }, [cacheKey, enabled, gcTime, loader, staleTime])

  const reload = useCallback(() => load(true), [load])

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
      requestId.current += 1
    }
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  return { data, loading, error, reload }
}

function readCache<T>(cacheKey?: string): CacheEntry<T> | undefined {
  if (!cacheKey) return undefined
  return asyncDataCache.get(cacheKey) as CacheEntry<T> | undefined
}

async function fetchWithCache<T>(cacheKey: string | undefined, loader: () => Promise<T>, gcTime: number): Promise<T> {
  if (!cacheKey) return loader()

  const entry = readCache<T>(cacheKey)
  if (entry?.promise) return entry.promise

  const promise = loader()
  writeCache(cacheKey, { data: entry?.data, error: null, promise, updatedAt: entry?.updatedAt ?? 0 }, gcTime)

  try {
    const data = await promise
    writeCache(cacheKey, { data, error: null, updatedAt: Date.now() }, gcTime)
    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nao foi possivel carregar os dados.'
    writeCache(cacheKey, { data: entry?.data, error: message, updatedAt: entry?.updatedAt ?? 0 }, gcTime)
    throw error
  }
}

function writeCache<T>(cacheKey: string, entry: CacheEntry<T>, gcTime: number) {
  const currentEntry = asyncDataCache.get(cacheKey) as CacheEntry<T> | undefined
  if (currentEntry?.gcTimer) clearTimeout(currentEntry.gcTimer)
  if (entry.gcTimer) clearTimeout(entry.gcTimer)

  const nextEntry: CacheEntry<T> = { ...entry }
  if (Number.isFinite(gcTime) && gcTime > 0) {
    nextEntry.gcTimer = setTimeout(() => asyncDataCache.delete(cacheKey), gcTime)
  }

  asyncDataCache.set(cacheKey, nextEntry as CacheEntry<unknown>)
}
