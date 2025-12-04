import { createDrizzleConfig } from './src/db/drizzle-config'

// pnpm run db:migrate --config=./path/to/this/file.ts
export default createDrizzleConfig('.env.production');