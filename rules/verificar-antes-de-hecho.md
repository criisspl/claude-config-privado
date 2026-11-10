# Verificar antes de decir «hecho»

«Hecho» significa comprobado, no escrito.

## Lista

1. **Lint** del repo (el script que tenga).
2. **Tipos**.
3. **Tests**. Un bug se arregla con un test que primero falla.
4. **Build**.
5. **UI**: abrir la página en local y mirarla. No basta con que compile.

## Reglas

- Se usan los scripts del propio repo, no comandos inventados.
- Si algo no se pudo verificar (no hay tests, no hay entorno, falta una credencial), se dice claramente en la respuesta. Nunca se da por bueno en silencio.
- Nunca se borran ni se debilitan tests para que pase la CI.
- Los fallos se reportan con su salida real, sin suavizar.
- Las comprobaciones largas o ruidosas van a un subagente que devuelve solo el resultado.
- Una vez verificado, se dice sin rodeos: «hecho y verificado».

Encaja como última parte de [`flujo-plan-implementar-auditar.md`](flujo-plan-implementar-auditar.md).
