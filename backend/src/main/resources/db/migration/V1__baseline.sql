--
-- PostgreSQL database dump
--

--
-- Name: DataSyncMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DataSyncMode" AS ENUM (
    'INITIAL',
    'INCREMENTAL',
    'FULL',
    'PRICE_REFRESH'
);

--
-- Name: DataSyncSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DataSyncSource" AS ENUM (
    'POKEAPI',
    'TCGDEX'
);

--
-- Name: DataSyncStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DataSyncStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED'
);

--
-- Name: FeedbackReference; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FeedbackReference" AS ENUM (
    'GENERAL',
    'MINIGAME',
    'ROOMS',
    'ACCOUNT',
    'INTERFACE',
    'CHANGELOG',
    'OTHER'
);

--
-- Name: FeedbackStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FeedbackStatus" AS ENUM (
    'NEW',
    'REVIEWING',
    'RESOLVED'
);

--
-- Name: FeedbackType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FeedbackType" AS ENUM (
    'BUG',
    'SUGGESTION'
);

--
-- Name: GameHistoryStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GameHistoryStatus" AS ENUM (
    'IN_PROGRESS',
    'COMPLETED',
    'ABANDONED',
    'INTERRUPTED'
);

--
-- Name: RoomHistoryStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RoomHistoryStatus" AS ENUM (
    'ACTIVE',
    'CLOSED',
    'INTERRUPTED'
);

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'USER',
    'ADMIN'
);

--
-- Name: Ability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Ability" (
    id text NOT NULL,
    name text NOT NULL,
    names jsonb,
    effect jsonb,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Changelog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Changelog" (
    id text NOT NULL,
    version text NOT NULL,
    title text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    published boolean DEFAULT false NOT NULL,
    content jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: CustomCategory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomCategory" (
    id text NOT NULL,
    "userId" text NOT NULL,
    text text NOT NULL,
    "normalizedText" text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: CustomWouldYouRatherPrompt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomWouldYouRatherPrompt" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "optionA" text NOT NULL,
    "optionB" text NOT NULL,
    "normalizedKey" text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: DataSyncRun; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DataSyncRun" (
    id text NOT NULL,
    source public."DataSyncSource" NOT NULL,
    mode public."DataSyncMode" NOT NULL,
    status public."DataSyncStatus" DEFAULT 'PENDING'::public."DataSyncStatus" NOT NULL,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "durationMs" integer,
    "recordsProcessed" integer DEFAULT 0 NOT NULL,
    inserted integer DEFAULT 0 NOT NULL,
    updated integer DEFAULT 0 NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    error text,
    details jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: DataSyncState; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DataSyncState" (
    source public."DataSyncSource" NOT NULL,
    "datasetVersion" text,
    "lastSuccessAt" timestamp(3) without time zone,
    "lastAttemptAt" timestamp(3) without time zone,
    "lastFullSyncAt" timestamp(3) without time zone,
    "recordsAvailable" integer DEFAULT 0 NOT NULL,
    "lastError" text,
    metadata jsonb,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Feedback" (
    id text NOT NULL,
    "gameId" text,
    "roomCode" text,
    type public."FeedbackType" NOT NULL,
    status public."FeedbackStatus" DEFAULT 'NEW'::public."FeedbackStatus" NOT NULL,
    description text NOT NULL,
    "authorUserId" text,
    "authorDisplayName" text NOT NULL,
    "authorKind" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    reference public."FeedbackReference" DEFAULT 'GENERAL'::public."FeedbackReference" NOT NULL
);

--
-- Name: GameHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GameHistory" (
    id text NOT NULL,
    "roomCode" text NOT NULL,
    "gameId" text NOT NULL,
    "playerCount" integer NOT NULL,
    config jsonb NOT NULL,
    "startedAt" timestamp(3) without time zone NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "resultId" text NOT NULL,
    "roomHistoryId" text,
    status public."GameHistoryStatus" DEFAULT 'IN_PROGRESS'::public."GameHistoryStatus" NOT NULL
);

--
-- Name: Move; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Move" (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    category text NOT NULL,
    names jsonb,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    power integer,
    accuracy integer,
    pp integer,
    priority integer DEFAULT 0 NOT NULL,
    generation integer,
    metadata jsonb
);

--
-- Name: PlayerGameResult; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PlayerGameResult" (
    id text NOT NULL,
    "historyId" text NOT NULL,
    "userId" text,
    "displayName" text NOT NULL,
    "position" integer NOT NULL,
    points integer NOT NULL,
    metrics jsonb NOT NULL
);

--
-- Name: PokedexEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokedexEntry" (
    id text NOT NULL,
    "pokemonId" text NOT NULL,
    text text NOT NULL,
    language text NOT NULL,
    generation integer NOT NULL,
    version text NOT NULL,
    "versionLabel" text NOT NULL
);

--
-- Name: Pokemon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Pokemon" (
    id text NOT NULL,
    "nationalDexNumber" integer NOT NULL,
    name text NOT NULL,
    generation integer NOT NULL,
    sprite text NOT NULL,
    names jsonb,
    types text[],
    "updatedAt" timestamp(3) without time zone NOT NULL,
    hp integer DEFAULT 0 NOT NULL,
    attack integer DEFAULT 0 NOT NULL,
    defense integer DEFAULT 0 NOT NULL,
    "specialAttack" integer DEFAULT 0 NOT NULL,
    "specialDefense" integer DEFAULT 0 NOT NULL,
    speed integer DEFAULT 0 NOT NULL,
    "baseStatTotal" integer DEFAULT 0 NOT NULL,
    "isDefault" boolean DEFAULT true NOT NULL,
    "evolutionStage" integer,
    "evolutionStages" integer,
    "heightDecimeters" integer DEFAULT 0 NOT NULL,
    "weightHectograms" integer DEFAULT 0 NOT NULL,
    "legendaryStatus" text DEFAULT 'NORMAL'::text NOT NULL,
    color text DEFAULT 'unknown'::text NOT NULL,
    abilities text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "speciesId" integer,
    "sourceUpdatedAt" timestamp(3) without time zone,
    metadata jsonb
);

--
-- Name: PokemonAbility; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonAbility" (
    "pokemonId" text NOT NULL,
    "abilityId" text NOT NULL,
    slot integer NOT NULL,
    "isHidden" boolean DEFAULT false NOT NULL
);

--
-- Name: PokemonAssetReference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonAssetReference" (
    id text NOT NULL,
    "pokemonId" text NOT NULL,
    kind text NOT NULL,
    url text NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: PokemonCatalogSync; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonCatalogSync" (
    key text NOT NULL,
    version integer NOT NULL,
    "completedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: PokemonEvolution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonEvolution" (
    id text NOT NULL,
    "chainId" integer NOT NULL,
    "fromPokemonId" text NOT NULL,
    "toPokemonId" text NOT NULL,
    trigger text,
    "minLevel" integer,
    conditions jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: PokemonGeneration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonGeneration" (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    "mainRegion" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: PokemonLevelUpMove; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonLevelUpMove" (
    "pokemonId" text NOT NULL,
    "moveId" text NOT NULL,
    "referenceGeneration" integer NOT NULL,
    level integer NOT NULL
);

--
-- Name: PokemonPokedexNumber; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonPokedexNumber" (
    "speciesId" integer NOT NULL,
    pokedex text NOT NULL,
    "entryNumber" integer NOT NULL
);

--
-- Name: PokemonSpecies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonSpecies" (
    id integer NOT NULL,
    slug text NOT NULL,
    "generationId" integer NOT NULL,
    name text NOT NULL,
    names jsonb,
    color text,
    shape text,
    habitat text,
    "growthRate" text,
    "genderRate" integer,
    "captureRate" integer,
    "baseHappiness" integer,
    "hatchCounter" integer,
    "isBaby" boolean DEFAULT false NOT NULL,
    "isLegendary" boolean DEFAULT false NOT NULL,
    "isMythical" boolean DEFAULT false NOT NULL,
    "hasGenderDifferences" boolean DEFAULT false NOT NULL,
    "formsSwitchable" boolean DEFAULT false NOT NULL,
    "evolvesFromSpeciesId" integer,
    "evolutionChainId" integer,
    "footprintUrl" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: PokemonStat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonStat" (
    "pokemonId" text NOT NULL,
    stat text NOT NULL,
    "baseValue" integer NOT NULL,
    effort integer DEFAULT 0 NOT NULL
);

--
-- Name: PokemonType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonType" (
    id text NOT NULL,
    name text NOT NULL,
    names jsonb,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: PokemonTypeAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PokemonTypeAssignment" (
    "pokemonId" text NOT NULL,
    "typeId" text NOT NULL,
    slot integer NOT NULL
);

--
-- Name: RoomHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RoomHistory" (
    id text NOT NULL,
    "roomCode" text NOT NULL,
    "hostUserId" text,
    "hostDisplayName" text NOT NULL,
    "maxPlayers" integer NOT NULL,
    status public."RoomHistoryStatus" DEFAULT 'ACTIVE'::public."RoomHistoryStatus" NOT NULL,
    "closeReason" text,
    "createdAt" timestamp(3) without time zone NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: TcgCard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TcgCard" (
    id text NOT NULL,
    "localId" text,
    "setId" text NOT NULL,
    name text NOT NULL,
    category text,
    hp integer,
    rarity text,
    "imageUrl" text,
    illustrator text,
    metadata jsonb,
    "sourceUpdatedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: TcgCardPokemon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TcgCardPokemon" (
    "cardId" text NOT NULL,
    "pokemonId" text NOT NULL
);

--
-- Name: TcgCardPrice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TcgCardPrice" (
    id text NOT NULL,
    "cardId" text NOT NULL,
    provider text NOT NULL,
    currency text NOT NULL,
    variant text NOT NULL,
    market numeric(12,4),
    low numeric(12,4),
    mid numeric(12,4),
    high numeric(12,4),
    trend numeric(12,4),
    metadata jsonb,
    "observedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: TcgSet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TcgSet" (
    id text NOT NULL,
    name text NOT NULL,
    series text,
    "logoUrl" text,
    "symbolUrl" text,
    "releaseDate" timestamp(3) without time zone,
    "cardCount" integer,
    metadata jsonb,
    "sourceUpdatedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    "avatarSeed" text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "avatarType" text DEFAULT 'DEFAULT'::text NOT NULL,
    "avatarValue" text,
    "avatarVersion" integer DEFAULT 0 NOT NULL,
    role public."UserRole" DEFAULT 'USER'::public."UserRole" NOT NULL
);

--
-- Name: UserGameConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserGameConfig" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "gameId" text NOT NULL,
    config jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: UserGameStats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserGameStats" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "gameId" text NOT NULL,
    "gamesPlayed" integer DEFAULT 0 NOT NULL,
    "gamesWon" integer DEFAULT 0 NOT NULL,
    metrics jsonb NOT NULL,
    points integer DEFAULT 0 NOT NULL
);

--
-- Name: UserStats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserStats" (
    "userId" text NOT NULL,
    "gamesPlayed" integer DEFAULT 0 NOT NULL,
    "gamesWon" integer DEFAULT 0 NOT NULL,
    "totalPoints" integer DEFAULT 0 NOT NULL
);

--
-- Name: Ability Ability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ability"
    ADD CONSTRAINT "Ability_pkey" PRIMARY KEY (id);

--
-- Name: Changelog Changelog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Changelog"
    ADD CONSTRAINT "Changelog_pkey" PRIMARY KEY (id);

--
-- Name: CustomCategory CustomCategory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomCategory"
    ADD CONSTRAINT "CustomCategory_pkey" PRIMARY KEY (id);

--
-- Name: CustomWouldYouRatherPrompt CustomWouldYouRatherPrompt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomWouldYouRatherPrompt"
    ADD CONSTRAINT "CustomWouldYouRatherPrompt_pkey" PRIMARY KEY (id);

--
-- Name: DataSyncRun DataSyncRun_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DataSyncRun"
    ADD CONSTRAINT "DataSyncRun_pkey" PRIMARY KEY (id);

--
-- Name: DataSyncState DataSyncState_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DataSyncState"
    ADD CONSTRAINT "DataSyncState_pkey" PRIMARY KEY (source);

--
-- Name: Feedback Feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Feedback"
    ADD CONSTRAINT "Feedback_pkey" PRIMARY KEY (id);

--
-- Name: GameHistory GameHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GameHistory"
    ADD CONSTRAINT "GameHistory_pkey" PRIMARY KEY (id);

--
-- Name: Move Move_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Move"
    ADD CONSTRAINT "Move_pkey" PRIMARY KEY (id);

--
-- Name: PlayerGameResult PlayerGameResult_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlayerGameResult"
    ADD CONSTRAINT "PlayerGameResult_pkey" PRIMARY KEY (id);

--
-- Name: PokedexEntry PokedexEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokedexEntry"
    ADD CONSTRAINT "PokedexEntry_pkey" PRIMARY KEY (id);

--
-- Name: PokemonAbility PokemonAbility_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonAbility"
    ADD CONSTRAINT "PokemonAbility_pkey" PRIMARY KEY ("pokemonId", "abilityId");

--
-- Name: PokemonAssetReference PokemonAssetReference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonAssetReference"
    ADD CONSTRAINT "PokemonAssetReference_pkey" PRIMARY KEY (id);

--
-- Name: PokemonCatalogSync PokemonCatalogSync_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonCatalogSync"
    ADD CONSTRAINT "PokemonCatalogSync_pkey" PRIMARY KEY (key);

--
-- Name: PokemonEvolution PokemonEvolution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonEvolution"
    ADD CONSTRAINT "PokemonEvolution_pkey" PRIMARY KEY (id);

--
-- Name: PokemonGeneration PokemonGeneration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonGeneration"
    ADD CONSTRAINT "PokemonGeneration_pkey" PRIMARY KEY (id);

--
-- Name: PokemonLevelUpMove PokemonLevelUpMove_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonLevelUpMove"
    ADD CONSTRAINT "PokemonLevelUpMove_pkey" PRIMARY KEY ("pokemonId", "moveId", "referenceGeneration", level);

--
-- Name: PokemonPokedexNumber PokemonPokedexNumber_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonPokedexNumber"
    ADD CONSTRAINT "PokemonPokedexNumber_pkey" PRIMARY KEY ("speciesId", pokedex);

--
-- Name: PokemonSpecies PokemonSpecies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonSpecies"
    ADD CONSTRAINT "PokemonSpecies_pkey" PRIMARY KEY (id);

--
-- Name: PokemonStat PokemonStat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonStat"
    ADD CONSTRAINT "PokemonStat_pkey" PRIMARY KEY ("pokemonId", stat);

--
-- Name: PokemonTypeAssignment PokemonTypeAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonTypeAssignment"
    ADD CONSTRAINT "PokemonTypeAssignment_pkey" PRIMARY KEY ("pokemonId", "typeId");

--
-- Name: PokemonType PokemonType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonType"
    ADD CONSTRAINT "PokemonType_pkey" PRIMARY KEY (id);

--
-- Name: Pokemon Pokemon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pokemon"
    ADD CONSTRAINT "Pokemon_pkey" PRIMARY KEY (id);

--
-- Name: RoomHistory RoomHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RoomHistory"
    ADD CONSTRAINT "RoomHistory_pkey" PRIMARY KEY (id);

--
-- Name: TcgCardPokemon TcgCardPokemon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TcgCardPokemon"
    ADD CONSTRAINT "TcgCardPokemon_pkey" PRIMARY KEY ("cardId", "pokemonId");

--
-- Name: TcgCardPrice TcgCardPrice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TcgCardPrice"
    ADD CONSTRAINT "TcgCardPrice_pkey" PRIMARY KEY (id);

--
-- Name: TcgCard TcgCard_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TcgCard"
    ADD CONSTRAINT "TcgCard_pkey" PRIMARY KEY (id);

--
-- Name: TcgSet TcgSet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TcgSet"
    ADD CONSTRAINT "TcgSet_pkey" PRIMARY KEY (id);

--
-- Name: UserGameConfig UserGameConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserGameConfig"
    ADD CONSTRAINT "UserGameConfig_pkey" PRIMARY KEY (id);

--
-- Name: UserGameStats UserGameStats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserGameStats"
    ADD CONSTRAINT "UserGameStats_pkey" PRIMARY KEY (id);

--
-- Name: UserStats UserStats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserStats"
    ADD CONSTRAINT "UserStats_pkey" PRIMARY KEY ("userId");

--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

--
-- Name: Changelog_published_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Changelog_published_date_idx" ON public."Changelog" USING btree (published, date);

--
-- Name: Changelog_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Changelog_version_key" ON public."Changelog" USING btree (version);

--
-- Name: CustomCategory_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomCategory_userId_idx" ON public."CustomCategory" USING btree ("userId");

--
-- Name: CustomCategory_userId_normalizedText_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CustomCategory_userId_normalizedText_key" ON public."CustomCategory" USING btree ("userId", "normalizedText");

--
-- Name: CustomWouldYouRatherPrompt_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomWouldYouRatherPrompt_userId_idx" ON public."CustomWouldYouRatherPrompt" USING btree ("userId");

--
-- Name: CustomWouldYouRatherPrompt_userId_normalizedKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CustomWouldYouRatherPrompt_userId_normalizedKey_key" ON public."CustomWouldYouRatherPrompt" USING btree ("userId", "normalizedKey");

--
-- Name: DataSyncRun_source_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DataSyncRun_source_createdAt_idx" ON public."DataSyncRun" USING btree (source, "createdAt");

--
-- Name: DataSyncRun_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DataSyncRun_status_idx" ON public."DataSyncRun" USING btree (status);

--
-- Name: Feedback_authorUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Feedback_authorUserId_idx" ON public."Feedback" USING btree ("authorUserId");

--
-- Name: Feedback_gameId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Feedback_gameId_createdAt_idx" ON public."Feedback" USING btree ("gameId", "createdAt");

--
-- Name: Feedback_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Feedback_status_createdAt_idx" ON public."Feedback" USING btree (status, "createdAt");

--
-- Name: Feedback_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Feedback_type_status_idx" ON public."Feedback" USING btree (type, status);

--
-- Name: GameHistory_gameId_endedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GameHistory_gameId_endedAt_idx" ON public."GameHistory" USING btree ("gameId", "endedAt");

--
-- Name: GameHistory_resultId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GameHistory_resultId_key" ON public."GameHistory" USING btree ("resultId");

--
-- Name: GameHistory_roomHistoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GameHistory_roomHistoryId_idx" ON public."GameHistory" USING btree ("roomHistoryId");

--
-- Name: GameHistory_status_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GameHistory_status_startedAt_idx" ON public."GameHistory" USING btree (status, "startedAt");

--
-- Name: PlayerGameResult_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlayerGameResult_userId_idx" ON public."PlayerGameResult" USING btree ("userId");

--
-- Name: PokedexEntry_pokemonId_language_generation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokedexEntry_pokemonId_language_generation_idx" ON public."PokedexEntry" USING btree ("pokemonId", language, generation);

--
-- Name: PokedexEntry_pokemonId_language_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PokedexEntry_pokemonId_language_version_key" ON public."PokedexEntry" USING btree ("pokemonId", language, version);

--
-- Name: PokemonAbility_abilityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonAbility_abilityId_idx" ON public."PokemonAbility" USING btree ("abilityId");

--
-- Name: PokemonAbility_pokemonId_slot_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PokemonAbility_pokemonId_slot_key" ON public."PokemonAbility" USING btree ("pokemonId", slot);

--
-- Name: PokemonAssetReference_pokemonId_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonAssetReference_pokemonId_kind_idx" ON public."PokemonAssetReference" USING btree ("pokemonId", kind);

--
-- Name: PokemonAssetReference_pokemonId_kind_url_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PokemonAssetReference_pokemonId_kind_url_key" ON public."PokemonAssetReference" USING btree ("pokemonId", kind, url);

--
-- Name: PokemonEvolution_chainId_fromPokemonId_toPokemonId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PokemonEvolution_chainId_fromPokemonId_toPokemonId_key" ON public."PokemonEvolution" USING btree ("chainId", "fromPokemonId", "toPokemonId");

--
-- Name: PokemonEvolution_fromPokemonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonEvolution_fromPokemonId_idx" ON public."PokemonEvolution" USING btree ("fromPokemonId");

--
-- Name: PokemonEvolution_toPokemonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonEvolution_toPokemonId_idx" ON public."PokemonEvolution" USING btree ("toPokemonId");

--
-- Name: PokemonGeneration_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PokemonGeneration_slug_key" ON public."PokemonGeneration" USING btree (slug);

--
-- Name: PokemonLevelUpMove_moveId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonLevelUpMove_moveId_idx" ON public."PokemonLevelUpMove" USING btree ("moveId");

--
-- Name: PokemonLevelUpMove_pokemonId_referenceGeneration_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonLevelUpMove_pokemonId_referenceGeneration_level_idx" ON public."PokemonLevelUpMove" USING btree ("pokemonId", "referenceGeneration", level);

--
-- Name: PokemonPokedexNumber_pokedex_entryNumber_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonPokedexNumber_pokedex_entryNumber_idx" ON public."PokemonPokedexNumber" USING btree (pokedex, "entryNumber");

--
-- Name: PokemonSpecies_evolutionChainId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonSpecies_evolutionChainId_idx" ON public."PokemonSpecies" USING btree ("evolutionChainId");

--
-- Name: PokemonSpecies_generationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonSpecies_generationId_idx" ON public."PokemonSpecies" USING btree ("generationId");

--
-- Name: PokemonSpecies_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PokemonSpecies_slug_key" ON public."PokemonSpecies" USING btree (slug);

--
-- Name: PokemonStat_stat_baseValue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonStat_stat_baseValue_idx" ON public."PokemonStat" USING btree (stat, "baseValue");

--
-- Name: PokemonTypeAssignment_pokemonId_slot_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PokemonTypeAssignment_pokemonId_slot_key" ON public."PokemonTypeAssignment" USING btree ("pokemonId", slot);

--
-- Name: PokemonTypeAssignment_typeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PokemonTypeAssignment_typeId_idx" ON public."PokemonTypeAssignment" USING btree ("typeId");

--
-- Name: Pokemon_generation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Pokemon_generation_idx" ON public."Pokemon" USING btree (generation);

--
-- Name: Pokemon_nationalDexNumber_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Pokemon_nationalDexNumber_idx" ON public."Pokemon" USING btree ("nationalDexNumber");

--
-- Name: Pokemon_speciesId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Pokemon_speciesId_idx" ON public."Pokemon" USING btree ("speciesId");

--
-- Name: RoomHistory_hostUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RoomHistory_hostUserId_idx" ON public."RoomHistory" USING btree ("hostUserId");

--
-- Name: RoomHistory_roomCode_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RoomHistory_roomCode_createdAt_idx" ON public."RoomHistory" USING btree ("roomCode", "createdAt");

--
-- Name: RoomHistory_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RoomHistory_status_createdAt_idx" ON public."RoomHistory" USING btree (status, "createdAt");

--
-- Name: TcgCardPokemon_pokemonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TcgCardPokemon_pokemonId_idx" ON public."TcgCardPokemon" USING btree ("pokemonId");

--
-- Name: TcgCardPrice_cardId_provider_currency_variant_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TcgCardPrice_cardId_provider_currency_variant_key" ON public."TcgCardPrice" USING btree ("cardId", provider, currency, variant);

--
-- Name: TcgCardPrice_observedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TcgCardPrice_observedAt_idx" ON public."TcgCardPrice" USING btree ("observedAt");

--
-- Name: TcgCard_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TcgCard_name_idx" ON public."TcgCard" USING btree (name);

--
-- Name: TcgCard_rarity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TcgCard_rarity_idx" ON public."TcgCard" USING btree (rarity);

--
-- Name: TcgCard_setId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TcgCard_setId_idx" ON public."TcgCard" USING btree ("setId");

--
-- Name: TcgSet_releaseDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TcgSet_releaseDate_idx" ON public."TcgSet" USING btree ("releaseDate");

--
-- Name: UserGameConfig_gameId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserGameConfig_gameId_idx" ON public."UserGameConfig" USING btree ("gameId");

--
-- Name: UserGameConfig_userId_gameId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UserGameConfig_userId_gameId_key" ON public."UserGameConfig" USING btree ("userId", "gameId");

--
-- Name: UserGameStats_gameId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserGameStats_gameId_idx" ON public."UserGameStats" USING btree ("gameId");

--
-- Name: UserGameStats_userId_gameId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UserGameStats_userId_gameId_key" ON public."UserGameStats" USING btree ("userId", "gameId");

--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

--
-- Name: User_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_username_key" ON public."User" USING btree (username);

--
-- Name: CustomCategory CustomCategory_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomCategory"
    ADD CONSTRAINT "CustomCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: CustomWouldYouRatherPrompt CustomWouldYouRatherPrompt_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomWouldYouRatherPrompt"
    ADD CONSTRAINT "CustomWouldYouRatherPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Feedback Feedback_authorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Feedback"
    ADD CONSTRAINT "Feedback_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: GameHistory GameHistory_roomHistoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GameHistory"
    ADD CONSTRAINT "GameHistory_roomHistoryId_fkey" FOREIGN KEY ("roomHistoryId") REFERENCES public."RoomHistory"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: PlayerGameResult PlayerGameResult_historyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlayerGameResult"
    ADD CONSTRAINT "PlayerGameResult_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES public."GameHistory"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PlayerGameResult PlayerGameResult_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlayerGameResult"
    ADD CONSTRAINT "PlayerGameResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: PokedexEntry PokedexEntry_pokemonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokedexEntry"
    ADD CONSTRAINT "PokedexEntry_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES public."Pokemon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonAbility PokemonAbility_abilityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonAbility"
    ADD CONSTRAINT "PokemonAbility_abilityId_fkey" FOREIGN KEY ("abilityId") REFERENCES public."Ability"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PokemonAbility PokemonAbility_pokemonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonAbility"
    ADD CONSTRAINT "PokemonAbility_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES public."Pokemon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonAssetReference PokemonAssetReference_pokemonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonAssetReference"
    ADD CONSTRAINT "PokemonAssetReference_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES public."Pokemon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonEvolution PokemonEvolution_fromPokemonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonEvolution"
    ADD CONSTRAINT "PokemonEvolution_fromPokemonId_fkey" FOREIGN KEY ("fromPokemonId") REFERENCES public."Pokemon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonEvolution PokemonEvolution_toPokemonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonEvolution"
    ADD CONSTRAINT "PokemonEvolution_toPokemonId_fkey" FOREIGN KEY ("toPokemonId") REFERENCES public."Pokemon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonLevelUpMove PokemonLevelUpMove_moveId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonLevelUpMove"
    ADD CONSTRAINT "PokemonLevelUpMove_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES public."Move"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonLevelUpMove PokemonLevelUpMove_pokemonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonLevelUpMove"
    ADD CONSTRAINT "PokemonLevelUpMove_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES public."Pokemon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonPokedexNumber PokemonPokedexNumber_speciesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonPokedexNumber"
    ADD CONSTRAINT "PokemonPokedexNumber_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES public."PokemonSpecies"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonSpecies PokemonSpecies_generationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonSpecies"
    ADD CONSTRAINT "PokemonSpecies_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES public."PokemonGeneration"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PokemonStat PokemonStat_pokemonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonStat"
    ADD CONSTRAINT "PokemonStat_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES public."Pokemon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonTypeAssignment PokemonTypeAssignment_pokemonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonTypeAssignment"
    ADD CONSTRAINT "PokemonTypeAssignment_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES public."Pokemon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PokemonTypeAssignment PokemonTypeAssignment_typeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PokemonTypeAssignment"
    ADD CONSTRAINT "PokemonTypeAssignment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES public."PokemonType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Pokemon Pokemon_speciesId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Pokemon"
    ADD CONSTRAINT "Pokemon_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES public."PokemonSpecies"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: RoomHistory RoomHistory_hostUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RoomHistory"
    ADD CONSTRAINT "RoomHistory_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: TcgCardPokemon TcgCardPokemon_cardId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TcgCardPokemon"
    ADD CONSTRAINT "TcgCardPokemon_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES public."TcgCard"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TcgCardPokemon TcgCardPokemon_pokemonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TcgCardPokemon"
    ADD CONSTRAINT "TcgCardPokemon_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES public."Pokemon"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TcgCardPrice TcgCardPrice_cardId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TcgCardPrice"
    ADD CONSTRAINT "TcgCardPrice_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES public."TcgCard"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TcgCard TcgCard_setId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TcgCard"
    ADD CONSTRAINT "TcgCard_setId_fkey" FOREIGN KEY ("setId") REFERENCES public."TcgSet"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: UserGameConfig UserGameConfig_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserGameConfig"
    ADD CONSTRAINT "UserGameConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: UserGameStats UserGameStats_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserGameStats"
    ADD CONSTRAINT "UserGameStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: UserStats UserStats_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserStats"
    ADD CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--

