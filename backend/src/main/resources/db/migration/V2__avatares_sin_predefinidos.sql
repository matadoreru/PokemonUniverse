-- Los avatares predefinidos (PRESET) ya no existen: quien tuviera uno vuelve a la inicial (DEFAULT).
-- Solo la tabla "User" guarda avatares; ninguna columna JSON contiene referencias de avatar.
UPDATE public."User"
SET "avatarType" = 'DEFAULT',
    "avatarValue" = NULL
WHERE "avatarType" NOT IN ('DEFAULT', 'CUSTOM');

-- A partir de aquí solo se admiten la inicial y la imagen subida.
ALTER TABLE public."User"
    ADD CONSTRAINT "User_avatarType_check" CHECK ("avatarType" IN ('DEFAULT', 'CUSTOM'));
