---
name: zod
description: Use when writing or reviewing schema validation in a project that uses Zod 4, or when migrating Zod 3 code; use for any parsing of external input (requests, JSON, API responses).
---

# Zod 4

## Convenciones
- `import * as z from "zod"`.
- El tipo sale del schema: `type Persona = z.infer<typeof Persona>`. Para entrada vs. salida (coerce, transform, default): `z.input<typeof S>` / `z.output<typeof S>`.
- Todo dato externo pasa por `safeParse`; se comprueba `success` y se trata `error.issues`.
- Por defecto `z.object` descarta claves desconocidas. Si quieres rechazarlas: `z.strictObject`; si las quieres conservar: `z.looseObject`.

## Cambios Zod 3 a 4 (errores típicos de LLM)
| Zod 3 (evitar) | Zod 4 |
|---|---|
| `z.string().email()`, `.uuid()`, `.url()` | `z.email()`, `z.uuid()`, `z.url()` |
| `z.string().datetime()` | `z.iso.datetime()` |
| `{ message: "..." }` | `{ error: "..." }` |
| `invalid_type_error`, `required_error` | `error` como función (`iss.input === undefined` para "falta") |
| `errorMap` | `error` |
| `z.record(valor)` | `z.record(clave, valor)`; claves opcionales: `z.partialRecord` |
| `z.nativeEnum(E)` | `z.enum(E)` |
| `.strict()` / `.passthrough()` | `z.strictObject()` / `z.looseObject()` |
| `err.format()`, `err.flatten()` | `z.treeifyError(err)` |
| `err.errors` | `err.issues` |
| `.default(x)` parseaba `x` | `.default(x)` debe ser del tipo de salida; `.prefault(x)` da el comportamiento antiguo |
| `z.function().args().returns()` | `z.function({ input, output })` |

`z.uuid()` es estricto (RFC 9562); para el patrón laxo 8-4-4-4-12 existe `z.guid()`.

## Patrones
```ts
import * as z from "zod";

const Usuario = z.object({
  email: z.email({ error: "Email no válido" }),
  edad: z.int().min(0),
  web: z.url().optional(),
});
type Usuario = z.infer<typeof Usuario>;

const r = Usuario.safeParse(JSON.parse(texto));
if (!r.success) {
  console.error(r.error.issues); // [{ code, path, message }]
  return;
}
const usuario = r.data;
```

Error personalizado:
```ts
z.string().min(5, { error: "Mínimo 5 caracteres" });
z.string({ error: (iss) => (iss.input === undefined ? "Obligatorio" : "Debe ser texto") });
```

Unión discriminada:
```ts
const Res = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), data: z.string() }),
  z.object({ status: z.literal("error"), error: z.string() }),
]);
```

Coerción (query strings, formularios): `z.coerce.number()`. Ojo: su tipo de entrada es `unknown`.

Refinamientos: `.refine(fn, { error })` o `.superRefine`. Las funciones no deben lanzar; si son async, `parseAsync`.

`z.number()` no acepta `NaN` ni `Infinity`; `z.int()` es entero seguro.

## Verificar
```sh
npx tsc --noEmit
npm test
```
Un schema nuevo lleva test con un caso válido y al menos uno inválido por regla.

## Fuentes
- https://zod.dev/v4/changelog
- https://zod.dev/api
