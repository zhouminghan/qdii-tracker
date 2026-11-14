export function loadScriptJsonp<T>(
  url: string,
  read: () => T,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 6500
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('实时行情请求超时'))
    }, timeoutMs)

    function onAbort(): void {
      cleanup()
      reject(new DOMException('实时行情请求已取消', 'AbortError'))
    }

    function cleanup(): void {
      window.clearTimeout(timeout)
      options.signal?.removeEventListener('abort', onAbort)
      script.remove()
    }

    if (options.signal?.aborted) {
      onAbort()
      return
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    script.async = true
    script.charset = 'gbk'
    script.src = url
    script.onload = () => {
      try {
        resolve(read())
      } catch (reason) {
        reject(reason)
      } finally {
        cleanup()
      }
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('实时行情加载失败'))
    }
    document.head.appendChild(script)
  })
}
