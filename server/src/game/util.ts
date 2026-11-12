import { randomBytes, randomInt } from 'node:crypto';
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  MAX_DRAWING_BYTES,
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  ROOM_CODE_LENGTH,
  type Avatar,
} from '../../../shared/src/index';

/** Lettres sans ambiguïté à l'oral ou à l'écrit (pas de I/O/0/1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeRoomCode(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH) : '';
}

export function newId(bytes = 12): string {
  return randomBytes(bytes).toString('base64url');
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\p{Cc}\p{Zl}\p{Zp}\u{200B}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export const sanitizeText = (value: unknown): string => cleanLine(value, MAX_TEXT_LENGTH);
export const sanitizeName = (value: unknown): string => cleanLine(value, MAX_NAME_LENGTH);

export function sanitizeAvatar(value: unknown): Avatar {
  const v = (value ?? {}) as Partial<Avatar>;
  const emoji = (AVATAR_EMOJIS as readonly string[]).includes(v.emoji as string) ? (v.emoji as string) : AVATAR_EMOJIS[0];
  const color =
    typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color.toLowerCase() : AVATAR_COLORS[0];
  return { emoji, color };
}

export function isValidToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

export interface DecodedImage {
  mime: string;
  data: Buffer;
}

/**
 * Décode un data URL d'image et vérifie sa signature binaire :
 * on ne stocke (et ne ressert) que de vrais PNG / WebP / JPEG de taille raisonnable.
 */
export function decodeImageDataUrl(value: unknown): DecodedImage | null {
  if (typeof value !== 'string' || value.length > MAX_DRAWING_BYTES * 1.4) return null;
  const match = /^data:(image\/(?:png|webp|jpeg));base64,([A-Za-z0-9+/]+=*)$/.exec(value);
  if (!match) return null;
  const data = Buffer.from(match[2], 'base64');
  if (data.length < 24 || data.length > MAX_DRAWING_BYTES) return null;
  const mime = match[1];
  const isPng = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP';
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if ((mime === 'image/png' && isPng) || (mime === 'image/webp' && isWebp) || (mime === 'image/jpeg' && isJpeg)) {
    return { mime, data };
  }
  return null;
}
