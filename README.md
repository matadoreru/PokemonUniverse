# Pokémon Universe

Node 22+, npm workspaces, React, Express, Socket.IO y PostgreSQL.

- [Desarrollo y arquitectura](docs/architecture.md)
- [Despliegue operativo](DEPLOY.md)
- [Configuración de PRE y promoción a PRO](docs/pre-production.md)

UPDATE "User"
  SET "role" = 'ADMIN'
  WHERE "email" = 'martinflorithortensi@gmail.com'
  RETURNING "username", "email", "role";