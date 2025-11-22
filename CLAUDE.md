# Tutor App - Project Overview

This is a monorepo containing multiple projects for the Tutor App.

## Project Structure

### tutor-api
Backend API server (pnpm project using Fastify, tRPC, and DBOS).

**→ See [tutor-api/CLAUDE.md](./tutor-api/CLAUDE.md) for detailed backend documentation.**

### tutor-mobile
Mobile application (Expo project for iOS/Android).

**→ See [tutor-mobile/CLAUDE.md](./tutor-mobile/CLAUDE.md) for mobile app documentation** (if available).

## Working with This Codebase

When working on specific parts of the application:
1. Always refer to the respective CLAUDE.md file in each subdirectory for project-specific context
2. Each project has its own dependencies and tooling:
   - `tutor-api`: Uses pnpm for package management
   - `tutor-mobile`: Uses npm/Expo for mobile development

## General Guidelines

- This is a monorepo, so be mindful of which project you're working in
- Each subdirectory is self-contained with its own dependencies and configuration
- Refer to subdirectory CLAUDE.md files for project-specific architecture, patterns, and conventions

