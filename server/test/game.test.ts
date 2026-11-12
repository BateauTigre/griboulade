/**
 * Tests d'intégration : un vrai serveur Socket.IO, de vrais clients, une partie complète.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, GameRecord, RoomState, ServerToClientEvents } from '../../shared/src/index';
import { createApp, type App } from '../src/app';
import { MemoryStore } from '../src/store/memory';

type Client = Socket<ServerToClientEvents, ClientToServerEvents> & { state?: RoomState; token: string };

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const AVATAR = { emoji: '🦊', color: '#ff6b6b' };

let app: App;
let url: string;
let store: MemoryStore;
const clients: Client[] = [];

async function boot(): Promise<void> {
  app = await createApp(store);
  await new Promise<void>((resolve) => app.http.listen(0, resolve));
  url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
}

before(async () => {
  store = new MemoryStore();
  await boot();
});

after(async () => {
  for (const c of clients) c.close();
  await app.close();
});

function client(name: string): Promise<Client> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true }) as Client;
  socket.token = `token-${clients.length}-${'x'.repeat(16)}`; // jeton secret du navigateur de ce joueur
  void name;
  socket.on('room:state', (s) => (socket.state = s));
  clients.push(socket);
  return new Promise((resolve) => socket.on('connect', () => resolve(socket)));
}

async function until(check: () => boolean, label: string, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`délai dépassé : ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function makeRoom(names: string[], settings = {}): Promise<{ players: Client[]; code: string }> {
  const players: Client[] = [];
  for (const name of names) players.push(await client(name));
  const created = await players[0].emitWithAck('room:create', { token: players[0].token, name: names[0], avatar: AVATAR, settings });
  assert.ok(created.ok);
  const code = created.ok ? created.code : '';
  for (let i = 1; i < players.length; i++) {
    const res = await players[i].emitWithAck('room:join', { code, token: players[i].token, name: names[i], avatar: AVATAR });
    assert.ok(res.ok, JSON.stringify(res));
  }
  await until(() => players.every((p) => p.state?.players.length === names.length), 'tout le monde voit tout le monde');
  return { players, code };
}

/** Fait jouer tous les joueurs pour l'étape courante. */
async function playStep(players: Client[], round: number): Promise<void> {
  await until(() => players.every((p) => p.state?.round === round && p.state.task && !p.state.task.submitted), `étape ${round}`);
  for (const p of players) {
    const task = p.state!.task!;
    const name = p.state!.players.find((x) => x.pid === p.state!.you.pid)!.name;
    if (task.kind === 'draw') {
      assert.ok(task.promptText, 'une phrase à dessiner est fournie');
      const res = await p.emitWithAck('game:submit', { round, drawing: PNG, strokes: 3 });
      assert.ok(res.ok, JSON.stringify(res));
    } else {
      if (task.kind === 'guess') assert.ok(task.promptDrawingId, 'un dessin à deviner est fourni');
      const res = await p.emitWithAck('game:submit', { round, text: `${task.kind} de ${name} (étape ${round})` });
      assert.ok(res.ok, JSON.stringify(res));
    }
  }
}

test('partie complète à 4 joueurs : chaîne, confidentialité, révélation, sauvegarde', async () => {
  const { players, code } = await makeRoom(['Alice', 'Bob', 'Chloé', 'David'], { rounds: 3, writeTime: 60 });
  const [host, bob] = players;

  // Seul l'hôte peut lancer ou régler la partie.
  assert.equal((await bob.emitWithAck('game:start')).ok, false);
  assert.equal((await bob.emitWithAck('room:settings', { drawTime: 30 })).ok, false);
  assert.ok((await host.emitWithAck('game:start')).ok);

  await until(() => players.every((p) => p.state?.phase === 'write'), 'phase écriture');
  assert.equal(host.state!.totalRounds, 3);
  assert.ok(host.state!.deadline! > host.state!.serverNow);

  for (let round = 0; round <= 3; round++) {
    await playStep(players, round);
    // Pendant le jeu, aucun carnet ni résultat n'est envoyé aux clients.
    for (const p of players) {
      assert.equal(p.state!.result, null);
      if (p.state!.phase !== 'reveal') assert.equal(p.state!.reveal, null);
    }
  }

  await until(() => players.every((p) => p.state?.phase === 'reveal'), 'phase révélation');
  const gameId = host.state!.gameId!;
  assert.equal(host.state!.reveal!.pages.length, 1, 'seule la première page est visible');
  assert.equal(host.state!.reveal!.totalSteps, 4);

  // Les non-hôtes ne peuvent pas faire défiler.
  assert.equal((await bob.emitWithAck('reveal:next')).ok, false);

  // Réaction sur la page courante, reçue par tout le monde.
  const reacted = new Promise((resolve) => players[3].once('reveal:reaction', resolve));
  bob.emit('reveal:react', { emoji: '😂' });
  await reacted;

  // Défilement complet : 4 carnets × 4 pages.
  for (let i = 0; i < 4 * 4; i++) assert.ok((await host.emitWithAck('reveal:next')).ok);
  await until(() => players.every((p) => p.state?.phase === 'end' && p.state.result), 'fin de partie');

  const record = host.state!.result as GameRecord;
  assert.equal(record.id, gameId);
  assert.equal(record.books.length, 4);
  assert.equal(record.stats.reactions, 1);
  assert.ok(record.awards.length > 0);

  for (const book of record.books) {
    assert.equal(book.pages.length, 4);
    assert.deepEqual(book.pages.map((p) => p.kind), ['text', 'drawing', 'text', 'drawing']);
    assert.equal(book.pages[0].authorPid, book.ownerPid, 'la première page est écrite par le propriétaire');
    const authors = new Set(book.pages.map((p) => p.authorPid));
    assert.equal(authors.size, 4, 'chaque page d’un carnet a un auteur différent');
    assert.ok(book.pages.every((p) => !p.auto));
  }
  // Chaque joueur a contribué exactement une fois par étape.
  for (let step = 0; step < 4; step++) {
    assert.equal(new Set(record.books.map((b) => b.pages[step].authorPid)).size, 4);
  }

  // La partie et ses dessins sont consultables par HTTP (galerie / historique).
  const saved = (await (await fetch(`${url}/api/games/${gameId}`)).json()) as GameRecord;
  assert.equal(saved.books.length, 4);
  const drawingId = saved.books[0].pages[1].drawingId!;
  const img = await fetch(`${url}/api/drawings/${drawingId}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const summary = (await fetch(`${url}/api/rooms/${code}`).then((r) => r.json())) as { exists: boolean };
  assert.equal(summary.exists, true);

  // Rejouer ramène tout le monde en salle d'attente.
  assert.ok((await host.emitWithAck('game:replay')).ok);
  await until(() => players.every((p) => p.state?.phase === 'lobby'), 'retour en salle d’attente');
});

test('chrono expiré : brouillons utilisés, contributions manquantes remplies automatiquement', async () => {
  const { players } = await makeRoom(['Eve', 'Fred', 'Gina']);
  const [host, fred, gina] = players;
  assert.ok((await host.emitWithAck('room:settings', { writeTime: 10 })).ok);
  await until(() => gina.state?.settings.writeTime === 10, 'paramètres synchronisés');
  assert.ok((await host.emitWithAck('game:start')).ok);
  await until(() => players.every((p) => p.state?.phase === 'write'), 'phase écriture');

  await host.emitWithAck('game:submit', { round: 0, text: 'Phrase de Eve' });
  fred.emit('game:draft', { round: 0, text: 'Brouillon de Fred' });
  // Gina ne fait rien. Le serveur doit avancer seul à l'échéance (10 s + marge).
  await until(() => players.every((p) => p.state?.phase === 'draw'), 'passage automatique au dessin', 16_000);

  // Chacun dessine la phrase d'un autre ; aucun joueur ne reçoit la sienne.
  const prompts = players.map((p) => p.state!.task!.promptText!);
  assert.notEqual(prompts[0], 'Phrase de Eve');
  assert.ok(prompts.includes('Phrase de Eve'));
  assert.ok(prompts.includes('Brouillon de Fred'));
  assert.equal(new Set(prompts).size, 3);
});

test('déconnexion / reconnexion en cours de partie, spectateurs et exclusion', async () => {
  const { players, code } = await makeRoom(['Hugo', 'Inès', 'Jules'], { writeTime: 0, drawTime: 0, guessTime: 0 });
  const [host, ines, jules] = players;

  // Salon inexistant.
  const lost = await client('Perdu');
  const bad = await lost.emitWithAck('room:join', { code: 'ZZZZZ', token: lost.token, name: 'Perdu', avatar: AVATAR });
  assert.equal(bad.ok, false);

  assert.ok((await host.emitWithAck('game:start')).ok);
  await until(() => players.every((p) => p.state?.phase === 'write'), 'phase écriture');
  assert.equal(host.state!.deadline, null, 'sans limite de temps');

  // Un retardataire arrive en cours de partie : il devient spectateur et ne reçoit aucune tâche.
  const late = await client('Karim');
  const joined = await late.emitWithAck('room:join', { code, token: late.token, name: 'Karim', avatar: AVATAR });
  assert.ok(joined.ok);
  await until(() => late.state?.phase === 'write', 'spectateur synchronisé');
  assert.equal(late.state!.you.spectator, true);
  assert.equal(late.state!.task, null);

  // Jules perd sa connexion après avoir écrit, puis revient avec le même jeton sur un nouveau socket.
  await jules.emitWithAck('game:submit', { round: 0, text: 'Phrase de Jules' });
  jules.close();
  await until(() => host.state?.players.find((p) => p.name === 'Jules')?.connected === false, 'Jules vu déconnecté');

  const julesBack = await client('Jules-retour');
  julesBack.token = jules.token;
  const back = await julesBack.emitWithAck('room:join', { code, token: jules.token, name: 'Jules', avatar: AVATAR });
  assert.ok(back.ok);
  await until(() => julesBack.state?.task?.submitted === true, 'Jules retrouve sa contribution');
  assert.equal(julesBack.state!.task!.submittedText, 'Phrase de Jules');
  assert.equal(julesBack.state!.players.filter((p) => p.name.startsWith('Jules')).length, 1, 'pas de doublon');

  // Modifier puis revalider.
  assert.ok((await julesBack.emitWithAck('game:edit')).ok);
  await until(() => julesBack.state?.task?.submitted === false, 'contribution rouverte');
  await julesBack.emitWithAck('game:submit', { round: 0, text: 'Phrase de Jules, corrigée' });

  await host.emitWithAck('game:submit', { round: 0, text: 'Phrase de Hugo' });
  await ines.emitWithAck('game:submit', { round: 0, text: 'Phrase de Inès' });
  await until(() => host.state?.phase === 'draw', 'tout le monde a fini → étape suivante immédiate');

  // L'hôte exclut le spectateur : il est prévenu et ne peut plus revenir.
  const closed = new Promise((resolve) => late.once('room:closed', resolve));
  const karim = host.state!.players.find((p) => p.name === 'Karim')!;
  assert.ok((await host.emitWithAck('room:kick', { pid: karim.pid })).ok);
  assert.equal(await closed, 'kicked');
  const retry = await late.emitWithAck('room:join', { code, token: late.token, name: 'Karim', avatar: AVATAR });
  assert.equal(retry.ok, false);

  // L'hôte quitte : le rôle est transmis à un joueur connecté.
  await host.emitWithAck('room:leave');
  await until(() => ines.state?.players.some((p) => p.isHost && p.name !== 'Hugo') === true, 'nouvel hôte désigné');
});

test('redémarrage du serveur : le salon et la partie sont restaurés depuis le stockage', async () => {
  const { players, code } = await makeRoom(['Léa', 'Malo', 'Nina'], { writeTime: 0, drawTime: 0, guessTime: 0 });
  assert.ok((await players[0].emitWithAck('game:start')).ok);
  await playStep(players, 0);
  await until(() => players.every((p) => p.state?.phase === 'draw'), 'phase dessin');
  const promptBefore = players[1].state!.task!.promptText;

  // Arrêt « propre » (SIGTERM) puis redémarrage sur le même stockage.
  for (const p of players) p.close();
  await app.rooms.shutdown();
  await new Promise<void>((resolve) => app.io.close(() => resolve()));
  await boot();

  const malo = await client('Malo-retour');
  const res = await malo.emitWithAck('room:join', { code, token: players[1].token, name: 'Malo', avatar: AVATAR });
  assert.ok(res.ok, JSON.stringify(res));
  await until(() => malo.state?.phase === 'draw', 'partie restaurée');
  assert.equal(malo.state!.task!.promptText, promptBefore);
  assert.equal(malo.state!.round, 1);
});

test('origines : même origine et origines autorisées acceptées, les autres refusées', async () => {
  const attempt = (origin: string): Promise<boolean> =>
    new Promise((resolve) => {
      const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { origin } });
      socket.on('connect', () => {
        socket.close();
        resolve(true);
      });
      socket.on('connect_error', () => {
        socket.close();
        resolve(false);
      });
    });
  assert.equal(await attempt(url), true, 'site servi par le serveur lui-même (tout-en-un)');
  assert.equal(await attempt('http://localhost:5173'), true, 'origine autorisée par CLIENT_ORIGIN');
  assert.equal(await attempt('https://pirate.example'), false, 'origine inconnue refusée');
});
