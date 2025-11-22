---
title: Fastify Quickstart
description: Learn how to integrate Clerk for secure authentication and user
  management into your application using a Fastify backend.
sdk: nextjs, react, js-frontend, chrome-extension, expo, android, ios,
  expressjs, fastify, react-router, remix, tanstack-react-start, go, astro,
  nuxt, vue, ruby, js-backend
sdkScoped: "true"
canonical: /docs/:sdk:/getting-started/quickstart
lastUpdated: 2025-11-19T22:57:21.000Z
availableSdks: nextjs,react,js-frontend,chrome-extension,expo,android,ios,expressjs,fastify,react-router,remix,tanstack-react-start,go,astro,nuxt,vue,ruby,js-backend
notAvailableSdks: ""
activeSdk: fastify
sourceFile: /docs/getting-started/quickstart.fastify.mdx
---

<TutorialHero
  exampleRepo={[
    {
      title: "Fastify Quickstart",
      link: "https://github.com/clerk/clerk-fastify-quickstart"
    }
  ]}
  beforeYouStart={[
    {
    title: "Set up a Clerk application",
    link: "/docs/getting-started/quickstart/setup-clerk",
    icon: "clerk",
    },
    {
      title: "Add Fastify as your backend",
      link: "https://fastify.dev/docs/latest/Guides/Getting-Started",
      icon: "fastify",
    },
  ]}
/>

Learn how to integrate Clerk into your Fastify backend for secure user authentication and management. This guide uses TypeScript and allows you to choose your frontend framework.

> \[!IMPORTANT]
> [Fastify is only compatible with Next.js versions 13.4 and below](https://github.com/fastify/fastify-nextjs). If you're using a newer version of Next.js, consider using a different backend framework that supports the latest Next.js features.
>
> This guide uses ECMAScript Modules (ESM). To use ESM in your project, you must include `"type": "module"` in your `package.json`.

<Steps>
  ## Install `@clerk/fastify`

  [Clerk's Fastify SDK](https://github.com/clerk/javascript/tree/main/packages/fastify) provides a range of backend utilities to simplify user authentication and management in your application.

  Run the following command to install the SDK:

  ```npm
  npm install @clerk/fastify
  ```

  ## Set your Clerk API keys

  <SignedIn>
    Add the following keys to your `.env` file. These keys can always be retrieved from the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard.
  </SignedIn>

  <SignedOut>
    1. In the Clerk Dashboard, navigate to the [**API keys**](https://dashboard.clerk.com/~/api-keys) page.
    2. In the **Quick Copy** section, copy your Clerk Publishable and Secret Keys.
    3. Paste your keys into your `.env` file.

    The final result should resemble the following:
  </SignedOut>

  ```env {{ filename: '.env' }}
  CLERK_PUBLISHABLE_KEY={{pub_key}}
  CLERK_SECRET_KEY={{secret}}
  ```

  ## Configure `clerkPlugin()` for all routes

  The `clerkPlugin()` function is a Fastify plugin provided by Clerk to integrate authentication into your Fastify application. To ensure that Clerk's authentication and user management features are applied across your Fastify application, configure the `clerkPlugin()` to handle all routes or limit it to specific ones.

  The following example registers the plugin for all routes. To register the plugin for specific routes, see the [reference docs](/docs/reference/fastify/overview).

  > \[!IMPORTANT]
  > The `dotenv/config` module must be imported before any Clerk modules. This order is important because Clerk instances are created during the import process and rely on environment variables, such as API keys, to be initialized correctly. For more information, refer to the [Fastify docs](https://fastify.dev/docs/latest/Guides/Getting-Started/#loading-order-of-your-plugins).

  ```ts {{ filename: 'index.ts' }}
  import 'dotenv/config'
  import Fastify from 'fastify'
  import { clerkPlugin } from '@clerk/fastify'

  const fastify = Fastify({ logger: true })

  fastify.register(clerkPlugin)

  const start = async () => {
    try {
      await fastify.listen({ port: 8080 })
    } catch (error) {
      fastify.log.error(error)
      process.exit(1)
    }
  }

  start()
  ```

  ## Protect your routes using `getAuth()`

  The [`getAuth()`](/docs/reference/fastify/overview#get-auth) helper retrieves the current user's authentication state from the `request` object. It returns the <SDKLink href="/docs/reference/backend/types/auth-object" sdks={["js-backend"]} code={true}>Auth object</SDKLink>{{ target: '_blank' }}.

  The following example uses `getAuth()` to protect a route and load the user's data. If the user is authenticated, their `userId` is passed to <SDKLink href="/docs/reference/backend/user/get-user" sdks={["js-backend"]} code={true}>clerkClient.users.getUser()</SDKLink>{{ target: '_blank' }} to get the current user's <SDKLink href="/docs/reference/javascript/user" sdks={["js-frontend"]} code={true}>User</SDKLink>{{ target: '_blank' }} object. If not authenticated, the request is rejected with a `401` status code.

  ```ts
  // dotenv must be imported before @clerk/fastify
  import 'dotenv/config'
  import Fastify from 'fastify'
  import { clerkClient, clerkPlugin, getAuth } from '@clerk/fastify'

  const fastify = Fastify({ logger: true })

  fastify.register(clerkPlugin)

  // Use `getAuth()` to protect this route
  fastify.get('/protected', async (request, reply) => {
    try {
      // Use `getAuth()` to access `isAuthenticated` and the user's ID
      const { isAuthenticated, userId } = getAuth(request)

      // If user isn't authenticated, return a 401 error
      if (!isAuthenticated) {
        return reply.code(401).send({ error: 'User not authenticated' })
      }

      // Use `clerkClient` to access Clerk's JS Backend SDK methods
      // and get the user's User object
      const user = await clerkClient.users.getUser(userId)

      return reply.send({
        message: 'User retrieved successfully',
        user,
      })
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: 'Failed to retrieve user' })
    }
  })

  const start = async () => {
    try {
      await fastify.listen({ port: 8080 })
    } catch (error) {
      fastify.log.error(error)
      process.exit(1)
    }
  }

  start()
  ```
</Steps>
