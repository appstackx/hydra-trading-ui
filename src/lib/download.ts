/**
 * Triggers a client-side file download.
 *
 * Object URLs are revoked on the next frame rather than immediately: Safari has
 * not started reading the blob by the time `click()` returns, and revoking too
 * early produces a silently empty file.
 */
export function downloadTextFile(
  contents: string,
  filename: string,
  mimeType = 'text/plain;charset=utf-8'
): void {
  if (typeof document === 'undefined') return

  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
