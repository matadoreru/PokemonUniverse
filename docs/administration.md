# Panel de administración

El panel de consulta está disponible en `/admin` y la API en `/api/admin`. Ambas capas exigen una cuenta registrada con el rol `ADMIN`. La API comprueba el rol actual en PostgreSQL en cada petición; no confía únicamente en la sesión del navegador.

## Sincronización de datos

La pestaña **Datos** muestra PokéAPI y TCGdex, disponibilidad local, última
ejecución, duración, contadores, error y próxima ejecución. Las acciones
manuales responden inmediatamente y el panel consulta el progreso cada cinco
segundos. Solo puede ejecutarse una sincronización por fuente; **Forzar Full
Sync** exige confirmación y se reserva para recuperación o una recarga manual
explícita. Un error conserva el dataset previamente válido en PostgreSQL.

## Conceder o retirar el rol

La primera asignación se hace manualmente en la base de datos de cada entorno:

```sql
UPDATE "User"
SET "role" = 'ADMIN'
WHERE "email" = 'tu-email@example.com';
```

Para retirarlo:

```sql
UPDATE "User"
SET "role" = 'USER'
WHERE "email" = 'tu-email@example.com';
```

Después de conceder el rol, el usuario debe cerrar sesión y volver a entrar para que aparezca el enlace discreto de administración. Al retirarlo, la API bloquea el acceso inmediatamente aunque todavía se muestre el enlace en una sesión antigua.

## Datos guardados

- La creación y cierre de salas, incluyendo salas de invitados.
- El comienzo de cada partida y su estado: en progreso, completada, abandonada o interrumpida.
- Participantes, posiciones y puntos únicamente cuando existe un resultado final.
- Usuarios registrados, rol y estadísticas agregadas.

No se guardan ni se muestran respuestas, votos, cartas, objetivos secretos o el estado interno de los minijuegos. Una partida se considera abandonada si la sala queda vacía mientras está activa, e interrumpida si el servidor se detiene o se reinicia. Los registros se conservan indefinidamente hasta que se defina una política de retención.
