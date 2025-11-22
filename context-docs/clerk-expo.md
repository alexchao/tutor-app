---
title: Expo Quickstart
description: Add authentication and user management to your Expo app with Clerk.
sdk: nextjs, react, js-frontend, chrome-extension, expo, android, ios,
  expressjs, fastify, react-router, remix, tanstack-react-start, go, astro,
  nuxt, vue, ruby, js-backend
sdkScoped: "true"
canonical: /docs/:sdk:/getting-started/quickstart
lastUpdated: 2025-11-19T22:57:21.000Z
availableSdks: nextjs,react,js-frontend,chrome-extension,expo,android,ios,expressjs,fastify,react-router,remix,tanstack-react-start,go,astro,nuxt,vue,ruby,js-backend
notAvailableSdks: ""
activeSdk: expo
sourceFile: /docs/getting-started/quickstart.expo.mdx
---

<TutorialHero
  exampleRepo={[
  {
    title: "Expo quickstart repo",
    link: "https://github.com/clerk/clerk-expo-quickstart",
  },
]}
  beforeYouStart={[
  {
    title: "Set up a Clerk application",
    link: "/docs/getting-started/quickstart/setup-clerk",
    icon: "clerk",
  },
  {
    title: "Create an Expo app",
    link: "https://docs.expo.dev/get-started/create-a-project/",
    icon: "expo",
  },
]}
/>

<Steps>
  ## Enable Native API

  In the Clerk Dashboard, navigate to the [**Native Applications**](https://dashboard.clerk.com/~/native-applications) page and ensure that the Native API is enabled. This is required to integrate Clerk in your native application.

  ## Install `@clerk/clerk-expo`

  The [Clerk Expo SDK](/docs/reference/expo/overview) gives you access to prebuilt components, hooks, and helpers to make user authentication easier.

  Run the following command to install the SDK:

  ```npm
  npm install @clerk/clerk-expo
  ```

  ## Set your Clerk API keys

  <SignedIn>
    Add your Clerk Publishable Key to your `.env` file. It can always be retrieved from the [**API keys**](https://dashboard.clerk.com/~/api-keys) page in the Clerk Dashboard.
  </SignedIn>

  <SignedOut>
    1. In the Clerk Dashboard, navigate to the [**API keys**](https://dashboard.clerk.com/~/api-keys) page.
    2. In the **Quick Copy** section, copy your Clerk Publishable Key.
    3. Paste your key into your `.env` file.

    The final result should resemble the following:
  </SignedOut>

  ```env {{ filename: '.env' }}
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY={{pub_key}}
  ```

  ## Add `<ClerkProvider>` to your root layout

  The <SDKLink href="/docs/:sdk:/reference/components/clerk-provider" sdks={["chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]} code={true}>\<ClerkProvider></SDKLink> component provides session and user context to Clerk's hooks and components. It's recommended to wrap your entire app at the entry point with `<ClerkProvider>` to make authentication globally accessible. See the <SDKLink href="/docs/:sdk:/reference/components/clerk-provider" sdks={["chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]}>reference docs</SDKLink> for other configuration options.

  Add the component to your root layout as shown in the following example:

  ```tsx {{ filename: 'app/_layout.tsx', mark: [1, 6, 8] }}
  import { ClerkProvider } from '@clerk/clerk-expo'
  import { Slot } from 'expo-router'

  export default function RootLayout() {
    return (
      <ClerkProvider>
        <Slot />
      </ClerkProvider>
    )
  }
  ```

  ## Configure the token cache

  Clerk stores the active user's session token in memory by default. In Expo apps, the recommended way to store sensitive data, such as tokens, is by using `expo-secure-store` which encrypts the data before storing it.

  To use `expo-secure-store` as your token cache:

  1. Run the following command to install the library:

     ```npm
     npm install expo-secure-store
     ```

  2. Update your root layout to use the secure token cache:
     ```tsx {{ filename: 'app/_layout.tsx', mark: [2, 7] }}
     import { ClerkProvider } from '@clerk/clerk-expo'
     import { tokenCache } from '@clerk/clerk-expo/token-cache'
     import { Slot } from 'expo-router'

     export default function RootLayout() {
       return (
         <ClerkProvider tokenCache={tokenCache}>
           <Slot />
         </ClerkProvider>
       )
     }
     ```

  > \[!TIP]
  > When you sign a user out with <SDKLink href="/docs/:sdk:/reference/hooks/use-auth#returns" sdks={["astro","chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]} code={true}>signOut()</SDKLink>, Clerk will remove the user's session JWT from the token cache.

  ## Add sign-up and sign-in pages

  Clerk currently only supports <SDKLink href="/docs/:sdk:/reference/components/overview#control-components" sdks={["react","nextjs","js-frontend","chrome-extension","expo","android","expressjs","fastify","react-router","remix","tanstack-react-start","go","astro","nuxt","vue","ruby","js-backend"]}>control components</SDKLink> for Expo native. UI components are only available for Expo web. Instead, you must build <Tooltip><TooltipTrigger>custom flows</TooltipTrigger><TooltipContent>A **custom flow** refers to a user interface built entirely from scratch using the Clerk API. Learn more about [custom flows](/docs/guides/development/custom-flows/overview).</TooltipContent></Tooltip> using Clerk's API. The following sections demonstrate how to build [custom email/password sign-up and sign-in flows](/docs/guides/development/custom-flows/authentication/email-password). If you want to use different authentication methods, such as passwordless or OAuth, see the dedicated custom flow guides.

  ### Layout page

  First, protect your sign-up and sign-in pages.

  1. Create an `(auth)` [route group](https://docs.expo.dev/router/advanced/shared-routes/). This will group your sign-up and sign-in pages.
  2. In the `(auth)` group, create a `_layout.tsx` file with the following code. The <SDKLink href="/docs/:sdk:/reference/hooks/use-auth" sdks={["astro","chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]} code={true}>useAuth()</SDKLink> hook is used to access the user's authentication state. If the user is already signed in, they will be redirected to the home page.

  ```tsx {{ filename: 'app/(auth)/_layout.tsx' }}
  import { Redirect, Stack } from 'expo-router'
  import { useAuth } from '@clerk/clerk-expo'

  export default function AuthRoutesLayout() {
    const { isSignedIn } = useAuth()

    if (isSignedIn) {
      return <Redirect href={'/'} />
    }

    return <Stack />
  }
  ```

  ### Sign-up page

  In the `(auth)` group, create a `sign-up.tsx` file with the following code. The <SDKLink href="/docs/:sdk:/reference/hooks/use-sign-up" sdks={["chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]} code={true}>useSignUp()</SDKLink> hook is used to create a sign-up flow. The user can sign up using their email and password and will receive an email verification code to confirm their email.

  ```tsx {{ filename: 'app/(auth)/sign-up.tsx', collapsible: true }}
  import * as React from 'react'
  import { Text, TextInput, TouchableOpacity, View } from 'react-native'
  import { useSignUp } from '@clerk/clerk-expo'
  import { Link, useRouter } from 'expo-router'

  export default function SignUpScreen() {
    const { isLoaded, signUp, setActive } = useSignUp()
    const router = useRouter()

    const [emailAddress, setEmailAddress] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [pendingVerification, setPendingVerification] = React.useState(false)
    const [code, setCode] = React.useState('')

    // Handle submission of sign-up form
    const onSignUpPress = async () => {
      if (!isLoaded) return

      console.log(emailAddress, password)

      // Start sign-up process using email and password provided
      try {
        await signUp.create({
          emailAddress,
          password,
        })

        // Send user an email with verification code
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })

        // Set 'pendingVerification' to true to display second form
        // and capture OTP code
        setPendingVerification(true)
      } catch (err) {
        // See https://clerk.com/docs/guides/development/custom-flows/error-handling
        // for more info on error handling
        console.error(JSON.stringify(err, null, 2))
      }
    }

    // Handle submission of verification form
    const onVerifyPress = async () => {
      if (!isLoaded) return

      try {
        // Use the code the user provided to attempt verification
        const signUpAttempt = await signUp.attemptEmailAddressVerification({
          code,
        })

        // If verification was completed, set the session to active
        // and redirect the user
        if (signUpAttempt.status === 'complete') {
          await setActive({ session: signUpAttempt.createdSessionId })
          router.replace('/')
        } else {
          // If the status is not complete, check why. User may need to
          // complete further steps.
          console.error(JSON.stringify(signUpAttempt, null, 2))
        }
      } catch (err) {
        // See https://clerk.com/docs/guides/development/custom-flows/error-handling
        // for more info on error handling
        console.error(JSON.stringify(err, null, 2))
      }
    }

    if (pendingVerification) {
      return (
        <>
          <Text>Verify your email</Text>
          <TextInput
            value={code}
            placeholder="Enter your verification code"
            onChangeText={(code) => setCode(code)}
          />
          <TouchableOpacity onPress={onVerifyPress}>
            <Text>Verify</Text>
          </TouchableOpacity>
        </>
      )
    }

    return (
      <View>
        <>
          <Text>Sign up</Text>
          <TextInput
            autoCapitalize="none"
            value={emailAddress}
            placeholder="Enter email"
            onChangeText={(email) => setEmailAddress(email)}
          />
          <TextInput
            value={password}
            placeholder="Enter password"
            secureTextEntry={true}
            onChangeText={(password) => setPassword(password)}
          />
          <TouchableOpacity onPress={onSignUpPress}>
            <Text>Continue</Text>
          </TouchableOpacity>
          <View style={{ display: 'flex', flexDirection: 'row', gap: 3 }}>
            <Text>Already have an account?</Text>
            <Link href="/sign-in">
              <Text>Sign in</Text>
            </Link>
          </View>
        </>
      </View>
    )
  }
  ```

  ### Sign-in page

  In the `(auth)` group, create a `sign-in.tsx` file with the following code. The <SDKLink href="/docs/:sdk:/reference/hooks/use-sign-in" sdks={["chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]} code={true}>useSignIn()</SDKLink> hook is used to create a sign-in flow. The user can sign in using email address and password, or navigate to the sign-up page.

  ```tsx {{ filename: 'app/(auth)/sign-in.tsx', collapsible: true }}
  import { useSignIn } from '@clerk/clerk-expo'
  import { Link, useRouter } from 'expo-router'
  import { Text, TextInput, TouchableOpacity, View } from 'react-native'
  import React from 'react'

  export default function Page() {
    const { signIn, setActive, isLoaded } = useSignIn()
    const router = useRouter()

    const [emailAddress, setEmailAddress] = React.useState('')
    const [password, setPassword] = React.useState('')

    // Handle the submission of the sign-in form
    const onSignInPress = async () => {
      if (!isLoaded) return

      // Start the sign-in process using the email and password provided
      try {
        const signInAttempt = await signIn.create({
          identifier: emailAddress,
          password,
        })

        // If sign-in process is complete, set the created session as active
        // and redirect the user
        if (signInAttempt.status === 'complete') {
          await setActive({ session: signInAttempt.createdSessionId })
          router.replace('/')
        } else {
          // If the status isn't complete, check why. User might need to
          // complete further steps.
          console.error(JSON.stringify(signInAttempt, null, 2))
        }
      } catch (err) {
        // See https://clerk.com/docs/guides/development/custom-flows/error-handling
        // for more info on error handling
        console.error(JSON.stringify(err, null, 2))
      }
    }

    return (
      <View>
        <Text>Sign in</Text>
        <TextInput
          autoCapitalize="none"
          value={emailAddress}
          placeholder="Enter email"
          onChangeText={(emailAddress) => setEmailAddress(emailAddress)}
        />
        <TextInput
          value={password}
          placeholder="Enter password"
          secureTextEntry={true}
          onChangeText={(password) => setPassword(password)}
        />
        <TouchableOpacity onPress={onSignInPress}>
          <Text>Continue</Text>
        </TouchableOpacity>
        <View style={{ display: 'flex', flexDirection: 'row', gap: 3 }}>
          <Text>Don't have an account?</Text>
          <Link href="/sign-up">
            <Text>Sign up</Text>
          </Link>
        </View>
      </View>
    )
  }
  ```

  For more information about building these <Tooltip><TooltipTrigger>custom flows</TooltipTrigger><TooltipContent>A **custom flow** refers to a user interface built entirely from scratch using the Clerk API. Learn more about [custom flows](/docs/guides/development/custom-flows/overview).</TooltipContent></Tooltip>, including guided comments in the code examples, see the [Build a custom email/password authentication flow](/docs/guides/development/custom-flows/authentication/email-password) guide.

  ## Add a sign-out button

  At this point, your users can sign up or in, but they need a way to sign out.

  In the `components/` folder, create a `SignOutButton.tsx` file with the following code. The <SDKLink href="/docs/:sdk:/reference/hooks/use-clerk" sdks={["chrome-extension","expo","nextjs","react","react-router","tanstack-react-start"]} code={true}>useClerk()</SDKLink> hook is used to access the `signOut()` function, which is called when the user clicks the "Sign out" button.

  ```tsx {{ filename: 'app/components/SignOutButton.tsx', collapsible: true }}
  import { useClerk } from '@clerk/clerk-expo'
  import { useRouter } from 'expo-router'
  import { Text, TouchableOpacity } from 'react-native'

  export const SignOutButton = () => {
    // Use `useClerk()` to access the `signOut()` function
    const { signOut } = useClerk()
    const router = useRouter()

    const handleSignOut = async () => {
      try {
        await signOut()
        // Redirect to your desired page
        router.replace('/')
      } catch (err) {
        // See https://clerk.com/docs/guides/development/custom-flows/error-handling
        // for more info on error handling
        console.error(JSON.stringify(err, null, 2))
      }
    }

    return (
      <TouchableOpacity onPress={handleSignOut}>
        <Text>Sign out</Text>
      </TouchableOpacity>
    )
  }
  ```

  ## Conditionally render content

  You can control which content signed-in and signed-out users can see with Clerk's <SDKLink href="/docs/:sdk:/reference/components/overview#control-components" sdks={["react","nextjs","js-frontend","chrome-extension","expo","android","expressjs","fastify","react-router","remix","tanstack-react-start","go","astro","nuxt","vue","ruby","js-backend"]}>prebuilt control components</SDKLink>. For this quickstart, you'll use:

  * <SDKLink href="/docs/:sdk:/reference/components/control/signed-in" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue"]} code={true}>\<SignedIn></SDKLink>: Children of this component can only be seen while **signed in**.
  * <SDKLink href="/docs/:sdk:/reference/components/control/signed-out" sdks={["astro","chrome-extension","expo","nextjs","nuxt","react","react-router","remix","tanstack-react-start","vue"]} code={true}>\<SignedOut></SDKLink>: Children of this component can only be seen while **signed out**.

  To get started:

  1. Create a `(home)` route group.
  2. In the `(home)` group, create a `_layout.tsx` file with the following code.

  ```tsx {{ filename: 'app/(home)/_layout.tsx' }}
  import { Stack } from 'expo-router/stack'

  export default function Layout() {
    return <Stack />
  }
  ```

  Then, in the same folder, create an `index.tsx` file with the following code. If the user is signed in, it displays their email and a sign-out button. If they're not signed in, it displays sign-in and sign-up links.

  ```tsx {{ filename: 'app/(home)/index.tsx' }}
  import { SignedIn, SignedOut, useUser } from '@clerk/clerk-expo'
  import { Link } from 'expo-router'
  import { Text, View } from 'react-native'
  import { SignOutButton } from '@/app/components/SignOutButton'

  export default function Page() {
    const { user } = useUser()

    return (
      <View>
        <SignedIn>
          <Text>Hello {user?.emailAddresses[0].emailAddress}</Text>
          <SignOutButton />
        </SignedIn>
        <SignedOut>
          <Link href="/(auth)/sign-in">
            <Text>Sign in</Text>
          </Link>
          <Link href="/(auth)/sign-up">
            <Text>Sign up</Text>
          </Link>
        </SignedOut>
      </View>
    )
  }
  ```

  ## Create your first user

  Run your project with the following command:

  <CodeBlockTabs options={["npm", "yarn", "pnpm", "bun" ]}>
    ```bash {{ filename: 'terminal' }}
    npm start
    ```

    ```bash {{ filename: 'terminal' }}
    yarn start
    ```

    ```bash {{ filename: 'terminal' }}
    pnpm start
    ```

    ```bash {{ filename: 'terminal' }}
    bun start
    ```
  </CodeBlockTabs>

  Now visit your app's homepage at [`http://localhost:8081`](http://localhost:8081). Sign up to create your first user.
</Steps>

## Enable OTA updates

Though not required, it is recommended to implement over-the-air (OTA) updates in your Expo app. This enables you to easily roll out Clerk's feature updates and security patches as they're released without having to resubmit your app to mobile marketplaces.

See the [`expo-updates`](https://docs.expo.dev/versions/latest/sdk/updates) library to learn how to get started.

## Next steps

<Cards>
  * [SSO with Expo](/docs/guides/development/custom-flows/authentication/oauth-connections)
  * Learn more how to build a custom OAuth flow with Expo.

  ***

  * [MFA with Expo](/docs/guides/development/custom-flows/authentication/email-password-mfa)
  * Learn more how to build a custom multi-factor authentication flow with Expo.

  ***

  * [Protect content and read user data](/docs/expo/guides/users/reading)
  * Learn how to use Clerk's hooks and helpers to protect content and read user data in your Expo app.

  ***

  * [Sign-up and sign-in flow](/docs/guides/development/custom-flows/authentication/email-password)
  * Learn how to build a custom sign-up and sign-in authentication flow.
</Cards>
