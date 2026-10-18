---
name: tailwind
description: Use when writing or reviewing Tailwind CSS classes, theme config or build setup in a project that uses Tailwind CSS 4.
---

# Tailwind CSS 4

Soporta Safari 16.4+, Chrome 111+, Firefox 128+. Para navegadores más antiguos hay que quedarse en la 3.4.

## Configuración CSS-first

```css
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.62 0.19 259);
  --font-display: "Satoshi", sans-serif;
  --breakpoint-3xl: 120rem;
}
```

- Un solo `@import "tailwindcss";` sustituye a `@tailwind base/components/utilities`.
- El tema se define con `@theme` y genera variables CSS (`var(--color-brand)`) y utilidades (`bg-brand`). No uses `theme()` ni `resolveConfig`; usa las variables.
- No hay `tailwind.config.js` por defecto ni se detecta solo. Si hace falta uno antiguo: `@config "../tailwind.config.js";`. `corePlugins`, `safelist` y `separator` no existen; para safelist usa `@source inline()`.
- Prefijo: `@import "tailwindcss" prefix(tw);` y clases `tw:flex tw:hover:bg-red-600`.

## Instalación

Vite (recomendado):

```ts
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [tailwindcss()] });
```

PostCSS: plugin `@tailwindcss/postcss` en `postcss.config.mjs`; ya no hacen falta `postcss-import` ni `autoprefixer`. CLI: `@tailwindcss/cli`.

## Clases que cambiaron respecto a la v3

| v3 | v4 |
|---|---|
| `shadow-sm` / `shadow` | `shadow-xs` / `shadow-sm` |
| `blur-sm` / `blur` | `blur-xs` / `blur-sm` |
| `rounded-sm` / `rounded` | `rounded-xs` / `rounded-sm` |
| `drop-shadow-sm` / `drop-shadow` | `drop-shadow-xs` / `drop-shadow-sm` |
| `outline-none` | `outline-hidden` |
| `ring` (3px) | `ring-3` |
| `bg-opacity-50` | `bg-black/50` |
| `flex-shrink-0` / `flex-grow` | `shrink-0` / `grow` |
| `overflow-ellipsis` | `text-ellipsis` |
| `!flex` | `flex!` |
| `bg-[--marca]` | `bg-(--marca)` |

- Variantes apiladas se aplican de izquierda a derecha: `*:first:pt-0` (antes `first:*:pt-0`).

## Cambios de valores por defecto

- Color de borde (`border`, `divide`) = `currentColor`, ya no `gray-200`: pon el color siempre (`border border-gray-200`).
- `ring` por defecto 1px y `currentColor`.
- El placeholder usa el color del texto al 50%.
- `hover:` solo aplica si el dispositivo soporta hover; para el comportamiento viejo: `@custom-variant hover (&:hover);`.

## Utilidades y variantes propias

```css
@utility tab-4 {
  tab-size: 4;
}
```

Usa `@utility` en vez de clases en `@layer utilities`/`@layer components`; así funcionan con variantes (`hover:tab-4`).

## Buenas prácticas

- Clases completas en el código; no construyas nombres dinámicos (`bg-${color}-500`), no se detectan. Mapea a clases literales.
- Extrae componentes (React, Svelte...) antes que `@apply`.
- Usa tokens del tema, no valores arbitrarios repetidos (`w-[137px]`).

## Accesibilidad

- No quites el foco: sustituye `outline-none` por `outline-hidden` y añade un `focus-visible:` visible (`focus-visible:outline-2`).
- Comprueba contraste de texto sobre fondos del tema, también en modo oscuro (`dark:`).
- `sr-only` para texto solo de lectores de pantalla; `motion-reduce:` para animaciones.

## Verificar

```bash
npx @tailwindcss/upgrade   # migrar desde v3, en una rama nueva (Node 20+)
npm run build
```

Abre la página en el navegador y mira que las clases salen: una clase inexistente falla en silencio.

## Fuentes

- https://tailwindcss.com/docs/upgrade-guide
- https://tailwindcss.com/docs/installation/using-vite
