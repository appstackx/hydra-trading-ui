import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTheme,
  DEFAULT_THEME,
  persistTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
} from './theme'
import { applyBrand, BRAND } from './brand'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
}

/** Storage that throws, as Safari does in private browsing. */
const hostileStorage: Storage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
}

describe('resolveInitialTheme', () => {
  it('opens dark by default, as a trading floor expects', () => {
    expect(resolveInitialTheme(memoryStorage(), false)).toBe('dark')
    expect(DEFAULT_THEME).toBe('dark')
  })

  it('honours a stored choice over the OS preference', () => {
    expect(resolveInitialTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'light' }), false)).toBe(
      'light'
    )
    expect(resolveInitialTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }), true)).toBe('dark')
  })

  it('falls back to the OS preference when nothing is stored', () => {
    expect(resolveInitialTheme(memoryStorage(), true)).toBe('light')
  })

  it('ignores a stored value that is not a theme', () => {
    expect(resolveInitialTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'neon' }), false)).toBe('dark')
  })

  it('still resolves when storage is unavailable', () => {
    expect(resolveInitialTheme(hostileStorage, true)).toBe('light')
    expect(resolveInitialTheme(undefined, false)).toBe('dark')
  })
})

describe('persistTheme', () => {
  it('writes the choice', () => {
    const storage = memoryStorage()
    persistTheme('light', storage)

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('does not throw when storage refuses the write', () => {
    expect(() => persistTheme('light', hostileStorage)).not.toThrow()
  })
})

describe('applyTheme', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement('html')
  })

  it('stamps the theme on the root, where the CSS variables key off it', () => {
    applyTheme('light', root)

    expect(root.getAttribute('data-theme')).toBe('light')
  })

  it('sets color-scheme so form controls and scrollbars follow', () => {
    applyTheme('dark', root)

    expect(root.style.getPropertyValue('color-scheme')).toBe('dark')
  })

  it('is a no-op without a root element', () => {
    expect(() => {
      applyTheme('dark', null)
    }).not.toThrow()
  })
})

describe('toggleTheme', () => {
  it('flips between the two themes', () => {
    expect(toggleTheme('dark')).toBe('light')
    expect(toggleTheme('light')).toBe('dark')
  })
})

describe('brand', () => {
  it('falls back to the Appstackx reference build', () => {
    expect(BRAND.productName).toBeTruthy()
    expect(BRAND.vendorName).toBe('Appstackx')
    expect(BRAND.vendorUrl).toBe('https://appstackx.co.uk')
  })

  it('applies a licensee accent colour to the document', () => {
    const root = document.createElement('html')
    applyBrand({ ...BRAND, accent: '#ff0066' }, root)

    expect(root.style.getPropertyValue('--color-brand')).toBe('#ff0066')
  })

  it('leaves the compiled-in accent alone when none is configured', () => {
    const root = document.createElement('html')
    applyBrand({ ...BRAND, accent: undefined }, root)
    applyBrand({ ...BRAND, accent: '' }, root)

    expect(root.style.getPropertyValue('--color-brand')).toBe('')
  })

  it('is a no-op without a root element', () => {
    expect(() => {
      applyBrand(BRAND, null)
    }).not.toThrow()
  })
})

describe('downloadTextFile', () => {
  it('creates a link, clicks it and cleans up the object URL', async () => {
    const { downloadTextFile } = await import('@/lib/download')
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    vi.useFakeTimers()
    try {
      downloadTextFile('a,b\n1,2', 'export.csv', 'text/csv')

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(click).toHaveBeenCalledTimes(1)
      // Nothing left behind in the document.
      expect(document.querySelector('a[download]')).toBeNull()

      // The URL survives until after the click has been handled.
      expect(revokeObjectURL).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
    } finally {
      vi.useRealTimers()
    }
  })
})
