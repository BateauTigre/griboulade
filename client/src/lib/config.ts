/** Adresse du serveur de jeu. Vide = même origine que le site (développement ou mode « tout-en-un »). */
export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL ?? '').trim().replace(/\/+$/, '');

export const drawingUrl = (id: string): string => `${SERVER_URL}/api/drawings/${id}`;
export const apiUrl = (path: string): string => `${SERVER_URL}${path}`;

/** Lien d'invitation à partager. */
export const inviteUrl = (code: string): string => `${window.location.origin}/rejoindre/${code}`;
export const galleryUrl = (gameId: string): string => `${window.location.origin}/galerie/${gameId}`;
