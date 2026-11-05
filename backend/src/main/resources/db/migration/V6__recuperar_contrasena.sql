-- Tokens de un solo uso para recuperar la contraseña por email. Solo se guarda el SHA-256 (hex) del token: el token en
-- claro viaja únicamente en el enlace del correo.
CREATE TABLE public."PasswordResetToken" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY (id),
    CONSTRAINT "PasswordResetToken_tokenHash_key" UNIQUE ("tokenHash"),
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX "PasswordResetToken_userId_idx" ON public."PasswordResetToken" USING btree ("userId");
