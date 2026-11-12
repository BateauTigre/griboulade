/**
 * Test de bout en bout : 4 vrais navigateurs (dont un téléphone) jouent une partie complète.
 *
 *   npm run build && npm start          # dans un terminal (serveur + site sur http://localhost:3001)
 *   npm run e2e                         # dans un autre
 *
 * Nécessite Playwright (`npm i -D playwright && npx playwright install chromium`).
 * Variables : E2E_URL (adresse du site), E2E_SHOTS (dossier des captures d'écran).
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const URL = process.env.E2E_URL || 'http://localhost:3001';
const SHOTS = process.env.E2E_SHOTS || path.join(__dirname, '..', 'e2e-captures');
const NAMES = ['Léa', 'Malo', 'Nina', 'Oscar'];

const log = (...args) => console.log('·', ...args);
let shotIndex = 0;
async function shot(page, name, fullPage = false) {
  const file = path.join(SHOTS, `${String(++shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage });
}

/** Trace quelques traits et un remplissage sur la toile. */
async function draw(page, seed) {
  const canvas = page.locator('canvas');
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  const stroke = async (points) => {
    await page.mouse.move(...at(...points[0]));
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(...at(...p), { steps: 6 });
    await page.mouse.up();
  };
  // Un bonhomme : tête (cercle), corps, bras, jambes.
  const circle = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [0.5 + Math.cos(a) * 0.12, 0.3 + Math.sin(a) * 0.16];
  });
  await stroke(circle);
  await stroke([[0.5, 0.46], [0.5, 0.75]]);
  await stroke([[0.32, 0.55], [0.5, 0.52], [0.68, 0.58]]);
  await stroke([[0.5, 0.75], [0.4, 0.93]]);
  await stroke([[0.5, 0.75], [0.6, 0.93]]);
  // Une couleur différente par joueur, puis remplissage de la tête.
  const colors = page.getByRole('radiogroup', { name: 'Couleurs' }).getByRole('radio');
  await colors.nth(4 + seed * 2).click();
  await page.getByRole('button', { name: /Pot de peinture/ }).click();
  await page.mouse.click(...at(0.5, 0.3));
  // Gros pinceau + annuler / rétablir.
  await page.getByRole('button', { name: /Pinceau/ }).click();
  await page.getByRole('radio', { name: 'Taille 22' }).click();
  await stroke([[0.1, 0.9], [0.3, 0.85], [0.9, 0.92]]);
  await page.getByRole('button', { name: /Annuler/ }).click();
  await page.getByRole('button', { name: /Rétablir/ }).click();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const pages = [];
  for (let i = 0; i < NAMES.length; i++) {
    // Le 3ᵉ joueur est sur téléphone, le 4ᵉ sur tablette.
    const options = i === 2 ? devices['iPhone 13'] : i === 3 ? { viewport: { width: 820, height: 1180 }, hasTouch: true } : { viewport: { width: 1440, height: 900 } };
    const context = await browser.newContext({ ...options, locale: 'fr-FR' });
    const page = await context.newPage();
    page.on('pageerror', (err) => errors.push(`[${NAMES[i]}] ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !/favicon|Failed to load resource/.test(msg.text())) errors.push(`[${NAMES[i]}] console: ${msg.text()}`);
    });
    pages.push(page);
  }
  const [host, p2, phone, tablet] = pages;

  // ── Accueil → création du salon
  await host.goto(URL);
  await host.getByRole('button', { name: /Créer un salon/ }).waitFor();
  await host.waitForTimeout(900);
  await shot(host, 'accueil', true);
  await phone.goto(URL);
  await phone.waitForTimeout(900);
  await shot(phone, 'accueil-mobile', true);

  await host.getByRole('button', { name: /Créer un salon/ }).click();
  await host.getByPlaceholder(/Capitaine/).fill(NAMES[0]);
  await host.waitForTimeout(500);
  await shot(host, 'creer-salon', true);
  await host.getByRole('button', { name: /Créer mon salon/ }).click();
  await host.waitForURL(/\/salon\/[A-Z]{5}$/);
  const code = host.url().split('/').pop();
  log('salon créé :', code);

  // ── Les autres rejoignent par le lien d'invitation
  for (let i = 1; i < pages.length; i++) {
    await pages[i].goto(`${URL}/rejoindre/${code}`);
    await pages[i].getByPlaceholder(/Capitaine/).fill(NAMES[i]);
    if (i === 2) {
      await pages[i].waitForTimeout(400);
      await shot(pages[i], 'rejoindre-mobile', true);
    }
    await pages[i].getByRole('button', { name: /Entrer dans le salon/ }).click();
    await pages[i].waitForURL(/\/salon\//);
  }
  await host.getByText('Joueurs 4/8').waitFor();
  log('4 joueurs dans la salle d’attente');

  // ── Paramètres : thèmes activés, 3 étapes, synchronisés chez tout le monde
  await host.getByRole('switch', { name: 'Thèmes de phrases' }).click();
  await host.getByRole('button', { name: /Animaux/ }).click();
  await host.getByLabel('Nombre de manches').selectOption('3');
  await p2.getByText(/3 étapes après la phrase de départ/).waitFor();
  await host.waitForTimeout(600);
  await shot(host, 'salle-attente', true);
  await shot(phone, 'salle-attente-mobile', true);

  await host.getByRole('button', { name: /Lancer la partie/ }).click();

  // ── Étape 1 : écriture
  for (const [i, page] of pages.entries()) {
    const box = page.getByPlaceholder(/pingouin/);
    await box.waitFor();
    if (i === 1) {
      await page.getByRole('button', { name: /Inspire-moi/ }).click();
      await page.waitForTimeout(200);
    } else {
      await box.fill(['Un chat pirate qui mange une pizza', '', 'Une girafe qui fait du ski', 'Un robot qui arrose ses fleurs'][i]);
    }
    if (i === 0) await shot(page, 'ecriture');
    await page.getByRole('button', { name: /Valider/ }).click();
    if (i === 0) {
      await page.getByText('C’est envoyé !').waitFor();
      await page.waitForTimeout(400);
      await shot(page, 'attente');
    }
  }
  log('phrases écrites');

  // ── Étape 2 : dessin
  for (const [i, page] of pages.entries()) {
    await page.getByText('À toi de dessiner').waitFor();
    await draw(page, i);
    if (i === 0) await shot(page, 'dessin');
    if (i === 2) await shot(page, 'dessin-mobile', true);
    if (i === 3) await shot(page, 'dessin-tablette');
  }
  // Rechargement en plein dessin : la sauvegarde automatique doit restaurer la toile.
  await p2.reload();
  await p2.getByText('À toi de dessiner').waitFor();
  await p2.waitForTimeout(600);
  await shot(p2, 'dessin-apres-rechargement');
  for (const page of pages) await page.getByRole('button', { name: /J’ai fini/ }).click();
  log('dessins envoyés');

  // ── Étape 3 : devinette
  for (const [i, page] of pages.entries()) {
    const box = page.getByPlaceholder('Je vois…');
    await box.waitFor();
    await page.locator('img[alt="Dessin à deviner"]').waitFor();
    await box.fill(['Un monsieur content avec une grosse tête', 'Un bonhomme qui danse', 'Un alien en vacances', 'Une sucette géante avec des jambes'][i]);
    if (i === 0) {
      await page.waitForTimeout(500);
      await shot(page, 'devinette');
    }
    if (i === 2) await shot(page, 'devinette-mobile', true);
    await page.getByRole('button', { name: /Valider/ }).click();
  }

  // ── Étape 4 : dernier dessin
  for (const [i, page] of pages.entries()) {
    await page.getByText('À toi de dessiner').waitFor();
    await draw(page, i + 1);
  }
  for (const page of pages) await page.getByRole('button', { name: /J’ai fini/ }).click();
  log('toutes les étapes sont jouées');

  // ── Révélation : l'hôte fait défiler, les autres réagissent
  await host.getByText(/Le carnet de/).waitFor();
  for (let book = 0; book < 4; book++) {
    for (let step = 0; step < 4; step++) {
      await host.waitForTimeout(650);
      if (book === 0 && step === 2) {
        await p2.getByRole('button', { name: 'Réagir 😂' }).click();
        await phone.getByRole('button', { name: 'Réagir 🤯' }).click();
        await tablet.getByRole('button', { name: 'Réagir 😂' }).click();
        await host.waitForTimeout(500);
        await shot(host, 'revelation');
        await shot(phone, 'revelation-mobile');
      }
      await host.getByRole('button', { name: /Révéler la suite|Carnet suivant|Voir les résultats/ }).click();
    }
  }

  // ── Fin de partie
  for (const page of pages) await page.getByText('C’est fini !').waitFor();
  await host.waitForTimeout(2500);
  await shot(host, 'fin', true);
  await shot(phone, 'fin-mobile', true);

  // ── Historique et galerie (lien public)
  await p2.goto(`${URL}/historique`);
  await p2.getByText('Mes parties').waitFor();
  await shot(p2, 'historique');
  await p2.locator('a[href^="/galerie/"]').first().click();
  await p2.getByText('Galerie des carnets').waitFor();
  await p2.locator('img[alt^="Dessin de"]').first().waitFor();
  await p2.waitForTimeout(600);
  await shot(p2, 'galerie', true);

  // ── Rejouer
  await host.getByRole('button', { name: /Rejouer/ }).click();
  await phone.getByText(/Joueurs \d\/8/).waitFor();
  log('retour en salle d’attente après « Rejouer »');

  await browser.close();
  if (errors.length) {
    console.error('Erreurs dans les navigateurs :\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(`✔ Partie complète jouée par ${NAMES.length} navigateurs. Captures : ${SHOTS}`);
})().catch((err) => {
  console.error('✘ Échec du test de bout en bout :', err);
  process.exit(1);
});
