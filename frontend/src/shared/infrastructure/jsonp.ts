export function loadScriptJsonp<T>(url: string, read: () => T, timeoutMs = 6500): Promise<T> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('实时行情请求超时'))
    }, timeoutMs)

    function cleanup(): void {
      window.clearTimeout(timeout)
      script.remove()
    }

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
