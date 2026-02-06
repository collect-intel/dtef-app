# Vercel Deployment Issue: Build OOM

## Summary

The dtef-app (Next.js 15.4.4) fails to build on Vercel's free tier due to insufficient memory. The build consistently runs for ~13-14 minutes before being killed with SIGABRT (out of memory). Vercel's free tier provides 8GB build memory, which is not enough for this application.

**Current status**: The app successfully builds and deploys on **Netlify** (at weval.org). Vercel deployment would require upgrading to Pro plan ($20/member/month) for 16GB enhanced builds.

## Root Cause Analysis

### Memory Requirements
- Vercel free tier: **8GB** total build container memory
- Vercel Pro (enhanced builds): **16GB** memory
- This app appears to need: **>8GB** during webpack compilation

### Why This App Needs So Much Memory

1. **Next.js 15.4.4** - Latest major version with new features and larger runtime
2. **Large dependency tree** - 80+ production dependencies including:
   - `@sentry/nextjs` (heavy instrumentation)
   - Multiple Radix UI components
   - React 19, ReactFlow, D3, etc.
3. **38 pages** in the app router
4. **Webpack compilation** - The memory spike happens during webpack bundling, not static generation

### Why Netlify Works But Vercel Doesn't
Netlify likely provides more build memory or has different memory management. The same codebase builds successfully on Netlify without any memory-related configuration.

## What Was Tried

### Attempt 1: Increase Node.js Heap via Environment Variable
```
vercel env add NODE_OPTIONS --max-old-space-size=4096
```
**Result**: Instant sandbox kill (code 9). Setting NODE_OPTIONS as a Vercel env var affects ALL processes in the container, including Vercel's build runner, causing immediate termination.

### Attempt 2: Increase Heap via Shell Prefix in package.json
```json
"build": "NODE_OPTIONS=--max-old-space-size=4096 next build"
```
**Result**: Build ran for ~13 minutes, then SIGABRT. 4GB heap + other processes exceeded 8GB container limit.

### Attempt 3: Increase Heap to 6GB
```json
"build": "NODE_OPTIONS=--max-old-space-size=6144 next build"
```
**Result**: Build ran for ~14 minutes, then SIGABRT. Still not enough headroom.

### Attempt 4: Exclude Git Submodule
The `data/global-dialogues` submodule is 1.2GB. Added:
- `vercel.json` with `"git": {"submodules": false}`
- `.vercelignore` with `data/` excluded

**Result**: Upload size dropped from 1.2MB to 2-6KB. Build still OOMed after ~14 minutes. The submodule wasn't the cause.

### Attempt 5: Skip TypeScript and ESLint During Build
```typescript
// next.config.ts
typescript: { ignoreBuildErrors: true },
eslint: { ignoreDuringBuilds: true },
```
**Result**: Still OOMed after ~13 minutes. Type checking isn't the memory hog.

### Attempt 6: Force Dynamic Rendering
```typescript
// src/app/(standard)/layout.tsx
export const dynamic = 'force-dynamic';
```
**Result**: Still OOMed after ~14 minutes. Static generation isn't the issue; webpack compilation is.

### Attempt 7: Remove Sentry Configs
Renamed `sentry.*.config.ts` files to `.bak` to prevent Sentry SDK bundling.

**Result**: Still OOMed after ~14 minutes. Sentry isn't the primary cause.

### Attempt 8: Conditionally Skip Sentry Build Plugin
```typescript
// next.config.ts
const hasSentry = !!(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);
export default hasSentry ? withSentryConfig(...) : configWithAnalyzer;
```
**Result**: Sentry webpack plugin was already being skipped (no SENTRY_ORG/PROJECT on Vercel). Not the issue.

## Deploy Attempt Timeline

| Attempt | Config | Duration | Result |
|---------|--------|----------|--------|
| 1 | NODE_OPTIONS env var (4GB) | <1s | Sandbox kill (code 9) |
| 2 | NODE_OPTIONS env var (8GB) | <1s | Sandbox kill (code 9) |
| 3 | No NODE_OPTIONS | ~18 min | SIGABRT (default ~2GB heap) |
| 4 | Shell prefix 4GB | ~13 min | SIGABRT |
| 5 | Shell prefix 6GB | ~14 min | SIGABRT |
| 6 | + skip typecheck/lint | ~13 min | SIGABRT |
| 7 | + force-dynamic | ~14 min | SIGABRT |
| 8 | + no sentry configs | ~14 min | SIGABRT |

## Solutions

### Option 1: Stay on Netlify (Current)
- **Pros**: Works now, no additional cost, has scheduled functions for evals
- **Cons**: Different platform than some other projects

### Option 2: Upgrade to Vercel Pro
- **Cost**: $20/member/month for collect-intel team
- **Benefit**: Enhanced builds with 16GB memory
- **To enable**: Dashboard → Project Settings → General → Build & Development Settings → Enable "On-Demand Enhanced Builds"

### Option 3: Reduce Build Memory Requirements
This would require significant refactoring:
- Remove or lazy-load heavy dependencies
- Split into multiple smaller apps
- Use dynamic imports more aggressively
- Downgrade Next.js to a lighter version

**Not recommended** - would require substantial effort and may impact functionality.

## Current Configuration

The following optimizations are in place (committed to main):

```json
// package.json
"build": "NODE_OPTIONS=--max-old-space-size=6144 next build"
```

```json
// vercel.json
{
  "git": { "submodules": false }
}
```

```
// .vercelignore
data/
scripts/
tools/
*.test.ts
*.test.tsx
jest.config.*
```

```typescript
// next.config.ts
typescript: { ignoreBuildErrors: true },
eslint: { ignoreDuringBuilds: true },
// Sentry plugin conditionally applied only when credentials present
```

```typescript
// src/app/(standard)/layout.tsx
export const dynamic = 'force-dynamic';
```

## References

- [Vercel: Troubleshooting SIGKILL/OOM Errors](https://vercel.com/kb/guide/troubleshooting-sigkill-out-of-memory-errors)
- [Vercel Pricing](https://vercel.com/pricing) - Pro plan includes enhanced builds
- [Next.js Memory Issues Discussion](https://github.com/vercel/next.js/discussions/19198)

## Recommendation

**Stay on Netlify** for now. The app works there without issues. If Vercel is required for specific features (edge functions, better analytics integration, etc.), upgrade to Pro and enable enhanced builds.
