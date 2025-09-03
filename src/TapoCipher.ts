import crypto, { KeyObject } from 'crypto';
import { createHash, createDecipheriv } from 'crypto';
import util from 'util';
import { DeviceKey } from './TapoConnect';

const RSA_CIPHER_ALGORITHM = 'rsa';
const AES_CIPHER_ALGORITHM = 'aes-128-cbc';
const PASSPHRASE = 'top secret';

export const generateKeyPair = async () => {
  const RSA_OPTIONS = {
    modulusLength: 1024,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs1',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase: PASSPHRASE,
    },
  };
  const generateKeyPairAsync = util.promisify(crypto.generateKeyPair);
  return generateKeyPairAsync(RSA_CIPHER_ALGORITHM, RSA_OPTIONS);
};

// Helpers to satisfy Node typings across environments
const toCipherKey = (b: Buffer) => b as unknown as crypto.CipherKey;
const toBinaryLike = (b: Buffer) => b as unknown as crypto.BinaryLike;
const toArrayBufferView = (b: Buffer) => b as unknown as NodeJS.ArrayBufferView;
const safeConcat = (...parts: Buffer[]): Buffer => {
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const out = Buffer.allocUnsafe(totalLength);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const encrypt = (data: any, deviceKey: DeviceKey): string => {
  const cipher = crypto.createCipheriv(AES_CIPHER_ALGORITHM, toCipherKey(deviceKey.key!), toBinaryLike(deviceKey.iv!));
  const part1: Buffer = cipher.update(JSON.stringify(data), 'utf8') as unknown as Buffer;
  const part2: Buffer = cipher.final() as unknown as Buffer;
  return safeConcat(part1, part2).toString('base64');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const encryptKlap = (data: any, deviceKey: DeviceKey, seq: Buffer) => {
  const payloadJson = JSON.stringify(data);
  const cipher = crypto.createCipheriv(AES_CIPHER_ALGORITHM, toCipherKey(deviceKey.key!), toBinaryLike(ivWithSeq(deviceKey.iv!, seq)));
  const part1: Buffer = cipher.update(payloadJson, 'utf8') as unknown as Buffer;
  const part2: Buffer = cipher.final() as unknown as Buffer;
  return safeConcat(part1, part2);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const encryptAndSign = (data: any, deviceKey: DeviceKey, sig: Buffer, seq: Buffer) => {
  const ciphertext = encryptKlap(data, deviceKey, seq);
  const signature = sha256(safeConcat(sig, seq, ciphertext));
  return safeConcat(signature, ciphertext);
};


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const decrypt = (data: string, deviceKey: DeviceKey): any => {
  const cipher = crypto.createDecipheriv(AES_CIPHER_ALGORITHM, toCipherKey(deviceKey.key!), toBinaryLike(deviceKey.iv!));
  const part1: Buffer = cipher.update(data, 'base64') as unknown as Buffer;
  const part2: Buffer = cipher.final() as unknown as Buffer;
  return JSON.parse(safeConcat(part1, part2).toString('utf8'));
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const decryptKlap = (payload: Buffer, deviceKey: DeviceKey, seq: Buffer): any => {
  const cipher = createDecipheriv(AES_CIPHER_ALGORITHM, toCipherKey(deviceKey.key!), toBinaryLike(ivWithSeq(deviceKey.iv!, seq)));
  const part1: Buffer = cipher.update(payload.subarray(32) as unknown as NodeJS.ArrayBufferView) as unknown as Buffer;
  const part2: Buffer = cipher.final() as unknown as Buffer;
  return JSON.parse(safeConcat(part1, part2).toString('utf8'));
};

export const readDeviceKey = (pemKey: string, privateKey: KeyObject): Buffer => {
  const keyBytes = Buffer.from(pemKey, 'base64');
  const deviceKey = crypto.privateDecrypt({
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
    passphrase: PASSPHRASE,
  }, toArrayBufferView(keyBytes));

  return deviceKey;
};

export const base64Encode = (data: string): string => {
  return Buffer.from(data).toString('base64');
};

export const base64Decode = (data: string): string => {
  return Buffer.from(data, 'base64').toString();
};

export const shaDigest = (data: string): string => {
  const shasum = crypto.createHash('sha1');
  shasum.update(data);
  return shasum.digest('hex');
};

export const sha256 = (data: string | Buffer) => {
  const h = createHash('sha256');
  if (typeof data === 'string') {
    h.update(data, 'utf8');
  } else {
    h.update(toArrayBufferView(data));
  }
  return h.digest();
};

export const encode = (text: string) => Buffer.from(text, 'utf-8');

const ivWithSeq = (iv: Buffer, seq: Buffer) =>
  safeConcat(iv.subarray(0, 12), seq);
