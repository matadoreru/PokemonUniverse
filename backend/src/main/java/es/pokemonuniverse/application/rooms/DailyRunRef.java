package es.pokemonuniverse.application.rooms;

import java.time.LocalDate;

/** La partida del reto que tiene viva una cuenta; {@code finished} si ya está en sus resultados. */
public record DailyRunRef(LocalDate date, String gameId, boolean finished) {}
