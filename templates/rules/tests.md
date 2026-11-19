---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
---

# Regla de prueba: tests

Esta regla solo se carga cuando Claude lee ficheros que encajan con `paths`.

- Un test por comportamiento; nombre en imperativo o «debe …».
- Nada de `.only(` ni `console.log` en lo que se commitea.
- No debilites ni borres un test para que pase: arregla el código.
