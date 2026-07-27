export type ClassValue = string | number | false | null | undefined

/**
 * Joins class names, dropping falsy entries.
 *
 * Deliberately not `clsx` + `tailwind-merge`: this codebase never stacks
 * conflicting utilities on one element, so a four-line helper carries the whole
 * need without adding two runtime dependencies to a licensed bundle.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter((value): value is string | number => Boolean(value)).join(' ')
}
