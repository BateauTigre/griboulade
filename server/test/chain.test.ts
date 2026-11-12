import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTotalRounds, kindOfRound } from '../../shared/src/index';
import { similarity } from '../src/game/awards';
import { bookIndexFor, playerIndexFor } from '../src/game/chain';
import { decodeImageDataUrl, sanitizeText } from '../src/game/util';

test('chaque joueur tient exactement un carnet par étape et jamais deux fois le même', () => {
  for (let n = 3; n <= 12; n++) {
    const seen = Array.from({ length: n }, () => new Set<number>());
    for (let round = 0; round < n; round++) {
      const books = new Set<number>();
      for (let player = 0; player < n; player++) {
        const book = bookIndexFor(player, round, n);
        assert.equal(playerIndexFor(book, round, n), player);
        assert.ok(!books.has(book), 'un carnet ne peut être tenu que par un joueur');
        books.add(book);
        assert.ok(!seen[player].has(book), 'un joueur ne revoit jamais un carnet');
        seen[player].add(book);
        if (round > 0) assert.notEqual(book, player, 'personne ne reçoit son propre carnet');
      }
      assert.equal(books.size, n);
    }
  }
});

test('le nombre d’étapes ne dépasse jamais joueurs - 1', () => {
  for (let n = 3; n <= 12; n++) {
    for (const rounds of [0, 2, 3, 5, 8, 11]) {
      for (const mode of ['normal', 'fast'] as const) {
        const total = computeTotalRounds(n, { rounds, mode });
        assert.ok(total >= 2 && total <= n - 1, `n=${n} rounds=${rounds} → ${total}`);
      }
    }
    // En automatique, le carnet se termine par une phrase (dernière étape = devinette).
    assert.equal(kindOfRound(computeTotalRounds(n, { rounds: 0, mode: 'normal' })), 'guess');
  }
  assert.equal(computeTotalRounds(3, { rounds: 0, mode: 'normal' }), 2);
  assert.equal(computeTotalRounds(7, { rounds: 0, mode: 'normal' }), 6);
  assert.equal(computeTotalRounds(9, { rounds: 0, mode: 'fast' }), 4);
  assert.equal(computeTotalRounds(4, { rounds: 9, mode: 'normal' }), 3);
});

test('alternance écriture → dessin → devinette', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(kindOfRound), ['write', 'draw', 'guess', 'draw', 'guess']);
});

test('nettoyage des textes et validation des images', () => {
  assert.equal(sanitizeText('  un\n chat\t‮qui   vole  '), 'un chat qui vole');
  assert.equal(sanitizeText('x'.repeat(500)).length, 140);
  assert.equal(sanitizeText(42), '');
  assert.equal(decodeImageDataUrl('data:image/png;base64,AAAA'), null);
  assert.equal(decodeImageDataUrl('data:text/html;base64,PGh0bWw+'), null);
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal(decodeImageDataUrl(png)?.mime, 'image/png');
  // Un PNG déclaré comme WebP est refusé.
  assert.equal(decodeImageDataUrl(png.replace('image/png', 'image/webp')), null);
});

test('fidélité entre deux phrases', () => {
  assert.equal(similarity('Un chat qui vole', 'un chat qui vole !'), 1);
  assert.ok(similarity('Un pingouin sur une trottinette', 'Des pingouins en trottinette') > 0.9);
  assert.equal(similarity('Un pingouin sur une trottinette', 'La Lune commande une pizza'), 0);
  assert.ok(similarity('Un éléphant rose', 'elephant bleu') > 0.3);
});
