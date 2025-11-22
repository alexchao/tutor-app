# Tutor Mobile

React Native mobile application built with Expo and Expo Router.

## Tech Stack

- **Framework**: Expo ~54.0
- **Router**: Expo Router 6.x
- **Authentication**: Clerk (@clerk/clerk-expo)
- **API Client**: tRPC with React Query
- **Language**: TypeScript
- **Package Manager**: npm

## Architecture

Type-safe mobile app with:
- **Expo Router** - File-based routing
- **Clerk Auth** - User authentication with secure token storage
- **tRPC Client** - Type-safe API calls to backend with automatic auth
- **React Query** - Data fetching and caching

### Authentication Flow

1. User signs in/up via Clerk
2. Session token stored securely via `expo-secure-store`
3. tRPC client automatically includes auth token in API requests
4. Backend validates token and returns user-specific data

## Project Structure

```
tutor-mobile/
├── app/
│   ├── _layout.tsx           # Root layout with providers
│   ├── (auth)/
│   │   ├── _layout.tsx       # Auth route protection
│   │   ├── sign-in.tsx       # Sign-in with MFA support
│   │   └── sign-up.tsx       # Sign-up with email verification
│   └── (tabs)/
│       ├── _layout.tsx       # Tab navigation
│       └── index.tsx         # Home screen (authenticated)
├── components/
│   └── sign-out-button.tsx   # Reusable sign-out component
├── lib/
│   └── trpc.ts               # tRPC client configuration
└── constants/
    └── theme.ts              # Theme configuration
```

## Setup

### Prerequisites

- Node.js 18+
- npm
- Expo CLI
- iOS Simulator or Android Emulator

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment variables**:
   Create `.env` with:
   ```
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   EXPO_PUBLIC_API_URL=http://localhost:3000
   ```

3. **Run development**:
   ```bash
   npm start
   ```
   
   Then press:
   - `i` for iOS simulator
   - `a` for Android emulator
   - Scan QR code for physical device

## Available Scripts

- `npm start` - Start Expo development server
- `npm run ios` - Start on iOS simulator
- `npm run android` - Start on Android emulator
- `npm run web` - Start on web browser
- `npm run lint` - Lint code with ESLint

## Authentication

### Sign-Up Flow
1. Enter email and password
2. Receive verification code via email
3. Enter code to verify
4. Redirected to home screen

### Sign-In Flow
1. Enter email and password
2. If MFA enabled: receive verification code via email
3. Enter code to verify (if MFA)
4. Redirected to home screen

### Protected Routes
- Home screen fetches data from authenticated backend endpoint
- Unauthenticated users see sign-in/sign-up options
- Auth state managed by Clerk's `<SignedIn>` and `<SignedOut>` components

## tRPC Integration

The app uses tRPC for type-safe API communication:

```typescript
// Automatically type-safe with backend AppRouter
const welcomeQuery = trpc.user.welcome.useQuery();
```

Auth token is automatically included via `useTRPCClient()` hook which:
1. Gets token from Clerk's `useAuth()`
2. Adds `Authorization: Bearer <token>` header to all requests
3. Backend validates token and returns user-specific data

## Development Notes

- **Provider Order**: ClerkProvider → tRPC Provider → QueryClient → Navigation
- **Token Storage**: Uses `expo-secure-store` for encrypted token cache
- **Hot Reload**: Changes auto-reload in development
- **Type Safety**: Full type safety from backend to frontend via tRPC

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Clerk Expo SDK](https://clerk.com/docs/references/expo/overview)
- [tRPC Documentation](https://trpc.io/docs)

