# Capturas de pantalla en subagente

Una captura pesa decenas de kB de contexto y se vuelve a pagar en cada turno. Nunca en el hilo principal.

- Para comprobar una UI: un subagente (Sonnet) que abre la página, mira y devuelve **solo texto** (✅/❌ por punto y el valor leído). Las capturas las guarda en una carpeta temporal y devuelve la ruta.
- Si basta un valor (un texto, un estilo, un atributo): `take_snapshot` o `evaluate_script`, sin imagen.
- Repetir la comprobación = subagente nuevo, no seguir en el mismo.

El hook `no-screenshot-main` lo hace cumplir: deniega `take_screenshot` de Chrome DevTools en el hilo principal y lo deja pasar en subagentes. Requiere `jq`.

Relacionado: [`verificar-antes-de-hecho.md`](verificar-antes-de-hecho.md) (la UI se comprueba en local).
