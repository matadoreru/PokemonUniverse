-- Quién puede ver el perfil de una cuenta (nivel, estadísticas y logros): todos (por defecto), solo sus amigos o
-- nadie. El dueño siempre ve el suyo completo; el nombre y el avatar se ven siempre.
ALTER TABLE public."User"
    ADD COLUMN "profileVisibility" text DEFAULT 'EVERYONE' NOT NULL,
    ADD CONSTRAINT "User_profileVisibility_check" CHECK ("profileVisibility" IN ('EVERYONE', 'FRIENDS', 'NOBODY'));
