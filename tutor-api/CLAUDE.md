# Tutor API

A modern TypeScript API server built with Fastify, tRPC, and DBOS for durable execution.

## Tech Stack

- **Runtime**: Node.js with TypeScript (ESM)
- **Web Framework**: Fastify 5.x
- **API Layer**: tRPC 11.x
- **Durable Execution**: DBOS SDK 4.x
- **Authentication**: Clerk (via @clerk/fastify)
- **Validation**: Zod 4.x
- **Database**: PostgreSQL (via DBOS)
- **Package Manager**: pnpm
- **Linter**: oxlint

## Architecture

This is a **T3-style stack** with Fastify instead of Next.js:
- **Type-safe APIs** via tRPC (no OpenAPI/REST boilerplate)
- **Durable workflows** via DBOS (automatic retries, fault tolerance)
- **End-to-end type safety** from database to client

### Why DBOS?

DBOS provides durable execution for workflows. This means:
- **Automatic recovery**: If the server crashes mid-workflow, it resumes from the last completed step
- **Built-in retries**: Steps can be configured to retry on failure
- **Workflow tracking**: All executions are tracked with IDs and can be monitored
- **No lost work**: Every step is durably recorded in PostgreSQL

### Authentication

Uses **Clerk** for secure user authentication:
- **clerkPlugin** registered in Fastify before tRPC
- **Context** extracts `userId` from Clerk via `getAuth(request)`
- **Middleware** enforces authentication on protected procedures
- **protectedProcedure** - tRPC procedure that requires authentication
- **publicProcedure** - tRPC procedure accessible without auth

### DB Migrations

Do NOT generate or run DB migrations yourself. The user will do this.

## Project Structure

```
tutor-api/
├── src/
│   ├── server.ts              # Main entry point, Fastify + DBOS initialization
│   ├── router.ts               # tRPC router with all API procedures
│   ├── context.ts              # tRPC context (request/response handling)
│   ├── workflows.ts            # Example DBOS workflow (greeting)
│   ├── routers/                # tRPC routers organized by feature
│   │   ├── drill.ts
│   │   ├── practice.ts
│   │   └── learning-topics.ts
│   ├── routes/                 # Non-tRPC routes (SSE, etc.)
│   │   └── drill-sse.ts
│   ├── domains/                # Domain-specific business logic
│   │   ├── drill/
│   │   │   └── workflows/      # Drill domain workflows
│   │   │       ├── process-drill-message.ts
│   │   │       └── index.ts   # Exports all drill workflows
│   │   └── brain-dump/
│   │       └── workflows/      # Brain dump domain workflows
│   │           ├── grade-submission.ts
│   │           └── index.ts    # Exports all brain-dump workflows
│   ├── db/                     # Database schema and connection
│   │   ├── schema.ts
│   │   └── connection.ts
│   └── lib/                    # Shared utilities
│       ├── openai.ts
│       └── ably.ts
├── dist/                       # Compiled JavaScript (gitignored)
├── drizzle/                    # Database migrations
├── docker-compose.yml          # PostgreSQL for local development
├── package.json
└── tsconfig.json
```

## Setup

### Prerequisites

- Node.js 18+
- pnpm
- Docker (for PostgreSQL)

### Installation

1. **Start PostgreSQL**:
   ```bash
   docker-compose up -d
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Environment variables**:
   Create `.env` (or `.env.development`) with:
   ```
   DBOS_SYSTEM_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tutorappdevdb
   CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
   
   **Important**: `dotenv/config` must be imported at the very top of `server.ts` before any Clerk modules.

4. **Run development server**:
   ```bash
   pnpm dev
   ```

The server will start on `http://localhost:3000`.

## Available Scripts

- `pnpm dev` - Start development server with hot reload (tsx)
- `pnpm build` - Compile TypeScript to JavaScript
- `pnpm start` - Run production build
- `pnpm lint` - Lint code with oxlint

## API Endpoints

All tRPC endpoints are available under `/trpc`:

### `greeting.hello` (Query)

Simple greeting endpoint for testing.

**Request**:
```bash
curl "http://localhost:3000/trpc/greeting.hello"
```

**With input**:
```bash
curl "http://localhost:3000/trpc/greeting.hello?input=%7B%22name%22%3A%22Alex%22%7D"
```

**Response**:
```json
{
  "result": {
    "data": {
      "message": "Hello, Alex!"
    }
  }
}
```

### `greeting.execute` (Mutation)

Triggers the DBOS greeting workflow with durable execution.

**Request**:
```bash
curl -X POST http://localhost:3000/trpc/greeting.execute \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response**:
```json
{
  "result": {
    "data": {
      "success": true,
      "message": "Greeting workflow completed successfully!"
    }
  }
}
```

### `user.welcome` (Query) - Protected

Returns personalized welcome message. Requires authentication via Clerk token.

**Request**:
```bash
curl "http://localhost:3000/trpc/user.welcome" \
  -H "Authorization: Bearer <clerk_session_token>"
```

**Response**:
```json
{
  "result": {
    "data": {
      "message": "Welcome, FirstName!"
    }
  }
}
```

## Workflows

### Workflow Organization

Workflows are organized by domain in `src/domains/{domain}/workflows/`:

- **Each workflow gets its own file** with a descriptive kebab-case name (e.g., `process-drill-message.ts`)
- **Each workflows folder has an `index.ts`** that exports all workflows from that domain
- **Workflows are imported** from the domain's workflows folder (e.g., `from '../domains/drill/workflows/index.js'`)

**Example structure:**
```
domains/
└── drill/
    └── workflows/
        ├── process-drill-message.ts  # Individual workflow file
        └── index.ts                  # Exports: processDrillMessageWorkflow
```

### Creating New Workflows

When adding a new workflow:

1. **Create the workflow file** in the appropriate domain's `workflows/` folder:
   ```typescript
   // domains/{domain}/workflows/my-new-workflow.ts
   import { DBOS } from '@dbos-inc/dbos-sdk';
   
   async function myNewWorkflowFunction(input: MyInput): Promise<void> {
     // Workflow implementation
   }
   
   export const myNewWorkflow = DBOS.registerWorkflow(myNewWorkflowFunction);
   ```

2. **Export it from `index.ts`**:
   ```typescript
   // domains/{domain}/workflows/index.ts
   export { myNewWorkflow } from './my-new-workflow.js';
   ```

3. **Import in routers** using the `.js` extension:
   ```typescript
   import { myNewWorkflow } from '../domains/{domain}/workflows/index.js';
   ```

### Example Workflows

#### Greeting Workflow

Located in `src/workflows.ts`. This is a simple example workflow with two steps:

1. **stepOne**: Logs "Step one: Hello from DBOS!"
2. **stepTwo**: Logs "Step two: Workflow executing..."

The workflow demonstrates DBOS's durable execution:
- Each step is automatically recorded
- If the server crashes between steps, it resumes from the last completed step
- All workflow executions have unique IDs for tracking

#### Process Drill Message Workflow

Located in `domains/drill/workflows/process-drill-message.ts`. Handles drill session chat messages with LLM streaming.

#### Grade Submission Workflow

Located in `domains/brain-dump/workflows/grade-submission.ts`. Grades student submissions using LLM with structured criteria evaluation.

## Development Notes

### Environment Configuration

The server uses different environment loading strategies:

- **Development**: Loads `.env` via dotenv
- **Production**: Expects environment variables to be set by the hosting platform

This is controlled by the `NODE_ENV` variable in `src/server.ts`.

### TypeScript Configuration

The project uses:
- **ES Modules** (`"type": "module"` in package.json)
- **NodeNext** module resolution
- **Strict mode** enabled
- Output directory: `dist/`

### DBOS Constraints

⚠️ **Important**: DBOS workflows cannot be bundled with build tools (Webpack, Vite, esbuild, etc.) due to its internal workflow registry. The code must be deployed as plain JavaScript/TypeScript files.

### Workflow Guidelines

When creating DBOS workflows:

1. **File organization**: Place each workflow in its own file within the appropriate domain's `workflows/` folder
2. **Naming**: Use kebab-case for workflow files (e.g., `process-drill-message.ts`)
3. **Exports**: Always export workflows from the domain's `workflows/index.ts` file
4. **Use `DBOS.runStep()`** for non-deterministic operations (API calls, random numbers, current time)
5. **Keep workflows deterministic** - same inputs should produce same step sequence
6. **Don't use `Promise.all()`** - use `Promise.allSettled()` for parallel steps
7. **No side effects outside workflow scope** - don't modify global variables
8. **All inputs/outputs must be JSON-serializable**
9. **Import paths**: Always use `.js` extensions in imports (TypeScript + ESM requirement)

## Production Deployment

### Build

```bash
pnpm build
```

### Environment Variables

Set these in your hosting platform:

- `DBOS_SYSTEM_DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV=production` - Disables dotenv

### Run

```bash
pnpm start
```

or:

```bash
node dist/server.js
```

## Next Steps

### Suggested Improvements

1. **Add authentication middleware** - JWT, sessions, or OAuth
2. **Create more workflows** - LLM calls, data processing, scheduled tasks
3. **Add database transactions** - Use DBOS transactions for ACID guarantees
4. **Implement queues** - Use DBOS WorkflowQueue for background jobs
5. **Add testing** - Jest with DBOS test utilities
6. **Set up CI/CD** - Automated linting, testing, and deployment
7. **Add monitoring** - OpenTelemetry tracing (DBOS has built-in support)

### Workflow Ideas

- **Email workflows**: Send emails with retry logic
- **Data pipelines**: Process data in durable, resumable steps
- **LLM workflows**: Call AI APIs with automatic retries
- **Scheduled tasks**: Use `DBOS.registerScheduled()` for cron jobs
- **Payment processing**: Durable payment flows with webhooks

## Resources

- [tRPC Documentation](https://trpc.io/docs)
- [Fastify Documentation](https://fastify.dev/)
- [DBOS Documentation](https://docs.dbos.dev/)
- [Zod Documentation](https://zod.dev/)

## Troubleshooting

### Port Already in Use

If port 3000 is taken, update `PORT` in `src/server.ts`.

### Database Connection Issues

Ensure PostgreSQL is running:
```bash
docker-compose ps
```

Check connection string in `.env`.

### TypeScript Errors

Run the linter:
```bash
pnpm lint
```

Check for compilation errors:
```bash
pnpm build
```

### Workflow Not Resuming

DBOS tracks workflows by application version. If you change workflow code significantly, DBOS may not resume old workflows. This is by design for safety.