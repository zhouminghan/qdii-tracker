export class DataLoadError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = 'DataLoadError'
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  const url = new URL(path, document.baseURI)
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new DataLoadError(`${path} 加载失败 (HTTP ${response.status})`, response.status)
  }
  return response.json() as Promise<T>
}
