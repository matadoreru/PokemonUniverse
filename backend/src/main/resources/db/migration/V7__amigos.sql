-- Amistades entre cuentas: una fila por pareja, la pida quien la pida. Rechazar, cancelar o quitar a un amigo borra la fila.
CREATE TABLE public."Friendship" (
    id text NOT NULL,
    "requesterId" text NOT NULL,
    "addresseeId" text NOT NULL,
    status text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    CONSTRAINT "Friendship_pkey" PRIMARY KEY (id),
    CONSTRAINT "Friendship_status_check" CHECK (status IN ('PENDING', 'ACCEPTED')),
    CONSTRAINT "Friendship_distinct_check" CHECK ("requesterId" <> "addresseeId"),
    CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId")
        REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Par sin orden: B→A no puede existir si ya existe A→B.
CREATE UNIQUE INDEX "Friendship_pair_key" ON public."Friendship"
    (LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId"));
CREATE INDEX "Friendship_requesterId_idx" ON public."Friendship" USING btree ("requesterId");
CREATE INDEX "Friendship_addresseeId_idx" ON public."Friendship" USING btree ("addresseeId");
