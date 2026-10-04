/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config'

export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts', 'integrations/**/*.test.ts', 'fonts/**/*.test.ts'],
  },
})
