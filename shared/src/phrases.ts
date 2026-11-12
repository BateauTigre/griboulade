/** Thèmes et banque de phrases d'inspiration (aussi utilisée quand un joueur ne répond pas à temps). */

export interface Theme {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  phrases: string[];
}

export const THEMES: Theme[] = [
  {
    id: 'animaux',
    label: 'Animaux',
    emoji: '🐾',
    hint: 'Mets un animal dans une situation improbable.',
    phrases: [
      'Un pingouin qui passe son permis de conduire',
      'Une girafe coincée dans un ascenseur',
      'Un chat qui dirige une réunion de travail',
      'Un hérisson qui gonfle des ballons',
      'Une vache en combinaison de plongée',
      'Un poulpe qui joue de la batterie',
      'Un escargot qui gagne un marathon',
      'Un hamster bodybuilder à la plage',
      'Une mouette qui vole un sandwich à un policier',
      'Un crocodile chez le dentiste',
      'Un mouton qui tricote son propre pull',
      'Un pigeon qui fait du télétravail',
    ],
  },
  {
    id: 'cuisine',
    label: 'Cuisine',
    emoji: '🍳',
    hint: 'Ça se passe en cuisine… ou dans une assiette.',
    phrases: [
      'Une baguette qui fait du saut à la perche',
      'Un fromage qui s’enfuit du frigo en pleine nuit',
      'Une raclette organisée au sommet de la tour Eiffel',
      'Un croissant qui prend un bain de café',
      'Des spaghettis qui tricotent une écharpe',
      'Un cornichon élu président de la République',
      'Une pizza qui livre un humain',
      'Un œuf au plat qui bronze sur un transat',
      'Un chef qui se dispute avec sa soupe',
      'Une crêpe utilisée comme parachute',
      'Un gâteau d’anniversaire qui souffle ses propres bougies',
      'Une banane qui glisse sur un humain',
    ],
  },
  {
    id: 'vacances',
    label: 'Vacances',
    emoji: '🏖️',
    hint: 'Plage, valises et galères de voyage.',
    phrases: [
      'Un bonhomme de neige en vacances à la plage',
      'Une valise qui part en voyage sans son propriétaire',
      'Un touriste qui prend un selfie avec un requin',
      'Un château de sable avec un vrai pont-levis',
      'Un moustique qui fait sa valise',
      'Une grand-mère qui surfe une vague géante',
      'Un GPS qui emmène toute la famille sur la Lune',
      'Une tente de camping emportée par des montgolfières',
      'Un coup de soleil en forme de lunettes de ski',
      'Un crabe maître-nageur',
      'Un cactus qui demande de la crème solaire',
      'Une bouée canard perdue au milieu de l’océan',
    ],
  },
  {
    id: 'heros',
    label: 'Héros & légendes',
    emoji: '🦸',
    hint: 'Super-héros, chevaliers, monstres et compagnie.',
    phrases: [
      'Un super-héros qui a peur des pigeons',
      'Un dragon qui souffle des bulles de savon',
      'Un vampire chez l’opticien',
      'Un chevalier qui combat un aspirateur',
      'Une sorcière qui passe l’aspirateur avec son balai',
      'Un fantôme qui a peur du noir',
      'Un pirate avec le mal de mer',
      'Un ninja qui marche sur un Lego',
      'Une licorne en pleine séance de sport',
      'Un zombie qui suit un régime végétarien',
      'Un loup-garou chez le coiffeur',
      'Un super-vilain qui rate son rire diabolique',
    ],
  },
  {
    id: 'quotidien',
    label: 'Vie quotidienne',
    emoji: '🏠',
    hint: 'Le quotidien, mais qui dérape.',
    phrases: [
      'Un réveil qui se rendort',
      'Une machine à laver qui recrache des chaussettes orphelines',
      'Un lundi matin incarné en personne',
      'Une imprimante qui se venge de ses utilisateurs',
      'Un parapluie retourné qui devient une parabole',
      'Un facteur poursuivi par une armée de nains de jardin',
      'Une plante verte qui arrose son propriétaire',
      'Un embouteillage de trottinettes',
      'Un canapé qui avale la télécommande',
      'Un robot aspirateur qui s’échappe de la maison',
      'Une file d’attente à la boulangerie… de dinosaures',
      'Un voisin qui tond sa pelouse à minuit en pyjama',
    ],
  },
  {
    id: 'absurde',
    label: 'Totalement absurde',
    emoji: '🌀',
    hint: 'Plus c’est bizarre, mieux c’est.',
    phrases: [
      'La Lune qui commande une pizza',
      'Un nuage qui pleure des confettis',
      'Une chaussette qui fait un discours à l’ONU',
      'Un arc-en-ciel en panne de couleurs',
      'Un volcan qui éternue des paillettes',
      'Une montagne qui joue à cache-cache',
      'Un escalier qui ne mène nulle part mais très vite',
      'Une armoire qui fait son jogging',
      'Le Soleil qui porte des lunettes de soleil',
      'Un trombone géant qui adopte un humain',
      'Une tour Eiffel qui fait du yoga',
      'Un poisson rouge astronaute',
    ],
  },
];

export function getTheme(id: string | null | undefined): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

/** Phrase aléatoire, issue du thème demandé ou de toute la banque. */
export function randomPhrase(themeId?: string | null, rng: () => number = Math.random): string {
  const theme = getTheme(themeId);
  const pool = theme ? theme.phrases : THEMES.flatMap((t) => t.phrases);
  return pool[Math.floor(rng() * pool.length)];
}
