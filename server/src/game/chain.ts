/**
 * Chaîne des carnets.
 *
 * Les joueurs sont placés dans un ordre aléatoire `order`. Le carnet n° b appartient à order[b].
 * À l'étape r, le carnet b est entre les mains du joueur order[(b + r) mod n] :
 * chaque carnet avance d'un cran à chaque étape, donc
 *   - à une étape donnée, chaque joueur a exactement un carnet ;
 *   - tant que r < n, un carnet ne repasse jamais par un joueur déjà vu
 *     (en particulier, personne ne retombe sur son propre carnet).
 */

/** Indice du carnet tenu par le joueur n° `playerIndex` à l'étape `round`. */
export function bookIndexFor(playerIndex: number, round: number, playerCount: number): number {
  return (((playerIndex - round) % playerCount) + playerCount) % playerCount;
}

/** Indice du joueur qui tient le carnet n° `bookIndex` à l'étape `round`. */
export function playerIndexFor(bookIndex: number, round: number, playerCount: number): number {
  return (bookIndex + round) % playerCount;
}
