# Importación JSON de Would You Rather Pokémon

La configuración del host permite importar entre 1 y 100 dilemas personales por operación. El documento debe ser un objeto JSON estricto con esta forma:

```json
{
  "version": 1,
  "prompts": [
    {
      "optionA": "Viajar con Lapras",
      "optionB": "Volar con Dragonite"
    }
  ]
}
```

## Esquema

- `version` debe ser exactamente `1`.
- `prompts` debe contener de 1 a 100 elementos.
- Cada elemento solo admite `optionA` y `optionB`.
- Cada opción debe tener entre 4 y 180 caracteres después de recortar espacios.
- Las dos opciones deben ser diferentes.
- No se aceptan dilemas repetidos, aunque estén invertidos o solo cambien mayúsculas, acentos o puntuación.
- Las claves desconocidas producen un error de validación con la ruta del campo.

La importación valida el lote completo antes de crear ningún dilema. Los dilemas importados quedan activados y se guardan en la cuenta del host igual que los creados manualmente.
