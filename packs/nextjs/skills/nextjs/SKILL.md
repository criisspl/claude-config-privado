---
name: nextjs
description: Use when writing or reviewing code in a project that uses Next.js 16 with the App Router.
---

# Next.js 16 (App Router)

## Primero: lee la doc local

Next.js trae la documentación de la versión instalada en `node_modules/next/dist/docs/` (16.2+) y genera un bloque en `AGENTS.md` que dice: "This version has breaking changes... Read the relevant guide in `node_modules/next/dist/docs/` before writing any code". Hazlo antes de tocar código de Next. Si no existe (16.1 o menos), usa nextjs.org/docs.

## Errores típicos de LLM (APIs antiguas)

- `params`/`searchParams` síncronos. En la 16 el acceso síncrono está eliminado: son `Promise`.
- `middleware.ts` / `export function middleware`. Ahora `proxy.ts` / `proxy` (runtime Node.js, no configurable; `edge` no vale en `proxy`).
- `revalidateTag('x')` con un argumento: deprecado y da error de TS. Ahora `revalidateTag('x', 'max')`.
- `unstable_cacheLife` / `unstable_cacheTag`: ya son `cacheLife` / `cacheTag` de `next/cache`.
- `next lint` (eliminado), `experimental.turbopack`, `experimental.dynamicIO`/`useCache`, `serverRuntimeConfig`/`publicRuntimeConfig`, `next/legacy/image`, `images.domains`, AMP: todo fuera o deprecado.
- `next dev --turbopack`: Turbopack es el bundler por defecto; sobra el flag.
- Slots de rutas paralelas (`@modal`) sin `default.tsx`: el build falla.

## Server vs Client Components

Layouts y páginas son Server Components. Usa `"use client"` solo cuando haga falta estado, handlers (`onClick`), efectos o APIs del navegador, y en el fichero más pequeño posible: todo lo que importa ese fichero entra al bundle de cliente. Los Server Components pasados como `children` a un Client Component siguen siendo de servidor. Context providers: Client Component que recibe `children`, lo más abajo posible del árbol. Las props hacia un Client Component deben ser serializables y mínimas (no pases el registro entero de la BD).

## APIs asíncronas y tipos

```tsx
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const { q } = await props.searchParams
  const token = (await cookies()).get('t')?.value
}
```

`npx next typegen` genera los helpers globales `PageProps`, `LayoutProps` y `RouteContext` (también se generan en `next dev`/`next build`). Codemod si queda código viejo: `npx @next/codemod@canary next-async-request-api .`

## Server Actions / Functions

`"use server"` en la función o al inicio del fichero. Se pueden invocar con un POST directo, así que en cada una:

```ts
'use server'
export async function deletePost(postId: string) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')
  const id = z.string().uuid().parse(postId) // validar siempre en servidor
  // comprobar que el recurso es del usuario (autorización, no solo autenticación)
  await db.post.delete({ where: { id } })
  revalidatePath('/posts')
}
```

- Nada de confiar en tipos de TS: `FormData`, argumentos, params y headers son entrada no fiable.
- Devuelve solo lo que la UI necesita, no filas de BD.
- No se pueden definir dentro de un Client Component; impórtalas desde un fichero `"use server"`.
- `redirect()` lanza una excepción: ponlo al final y no dentro de `try/catch`.
- Tras mutar: `updateTag(tag)` (lee-tus-escrituras, solo Server Actions), `revalidateTag(tag, 'max')` (stale-while-revalidate), `revalidatePath(path)` o `refresh()` (refresca el router, no revalida datos con tag).

## Route Handlers (`app/api/*/route.ts`)

```ts
export async function GET(req: NextRequest, ctx: RouteContext<'/api/users/[id]'>) {
  const { id } = await ctx.params
  return Response.json({ id })
}
```

Exporta funciones con nombre de método HTTP. Los `GET` son dinámicos por defecto (desde la 15). Valida `await req.json()` / `formData()` y autentica igual que en una Action: `route.ts` y `proxy.ts` tienen mucho poder, auditarlos con más cuidado.

## `proxy.ts`

En la raíz (o en `src/`), junto a `app`. Exporta `proxy` (o default) y `config.matcher`; sin `matcher` corre en todas las peticiones, incluidos estáticos. Migración: `npx @next/codemod@canary middleware-to-proxy .`. No es el único control de acceso: las Server Functions son POST a la ruta donde se usan y un `matcher` que excluya esa ruta las deja sin proxy.

## Caché (solo lo confirmado en la doc)

Cache Components es opt-in: `cacheComponents: true` en `next.config.ts` (sustituye a `experimental.ppr`/`dynamicIO`/`useCache`; activarlo puede dar errores de build por datos sin cachear fuera de `<Suspense>`; no lo actives "porque sí").

```ts
import { cacheLife, cacheTag } from 'next/cache'
export async function getProducts() {
  'use cache'
  cacheLife('hours')
  cacheTag('products')
  return db.products.findMany()
}
```

- `"use cache"` en funciones, componentes o al inicio de fichero; deben ser `async`. Argumentos y retorno serializables (sin instancias de clase).
- Pon `cacheLife` explícito en cada scope; sin él aplica el perfil `default`.
- Dentro de `use cache` no se puede leer `cookies()`, `headers()` ni `searchParams`: léelos fuera y pasa el valor como argumento.
- `children` y otras props JSX pasan "a través" de un componente cacheado si no las lees dentro.
- Sin `cacheComponents`, el comportamiento de caché es el clásico (`revalidate` de segmento, etc.): mira la doc local antes de asumir nada.

## Variables de entorno y servidor

Solo `NEXT_PUBLIC_*` se incluye en el bundle del cliente (y se fija en build). Para leer una variable en runtime en vez de en build: `await connection()` antes de `process.env`. Código con secretos: `import 'server-only'` y una capa de acceso a datos que devuelva DTOs mínimos.

## Verificar

- `npx next typegen` y luego `tsc --noEmit` (tipos de rutas).
- `next build` (falla con rutas paralelas sin `default`, errores de caché, etc.). `next build` ya no ejecuta lint: lanza ESLint/Biome aparte.
- `next dev` y abrir la página afectada; con `next dev` se mantiene al día el bloque de `AGENTS.md`.

## Fuentes

- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://nextjs.org/docs/app/guides/ai-agents
- https://nextjs.org/docs/app/getting-started/server-and-client-components
- https://nextjs.org/docs/app/getting-started/mutating-data
- https://nextjs.org/docs/app/guides/data-security
- https://nextjs.org/docs/app/api-reference/file-conventions/route
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- https://nextjs.org/docs/app/api-reference/directives/use-cache
