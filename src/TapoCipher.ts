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
  const generateKeyPair = util.promisify(crypto.generateKeyPair);
  return generateKeyPair(RSA_CIPHER_ALGORITHM, RSA_OPTIONS);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const encrypt = (data: any, deviceKey: DeviceKey): string => {
  const cipher = crypto.createCipheriv(AES_CIPHER_ALGORITHM, deviceKey.key!, deviceKey.iv!);
  const ciphertext = cipher.update(Buffer.from(JSON.stringify(data)));
  return Buffer.concat([ciphertext, cipher.final()]).toString('base64');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const encryptKlap = (data: any, deviceKey: DeviceKey, seq: Buffer) => {
  const payloadJson = JSON.stringify(data);
  const cipher = crypto.createCipheriv(AES_CIPHER_ALGORITHM, deviceKey.key!, ivWithSeq(deviceKey.iv!, seq));
  const ciphertext = cipher.update(encode(payloadJson));
  return Buffer.concat([ciphertext, cipher.final()]);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const encryptAndSign = (data: any, deviceKey: DeviceKey, sig: Buffer, seq: Buffer) => {
  const ciphertext = encryptKlap(data, deviceKey, seq);
  const signature = sha256(Buffer.concat([sig, seq, ciphertext]));
  return Buffer.concat([signature, ciphertext]);
};


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const decrypt = (data: string, deviceKey: DeviceKey): any => {
  const cipher = crypto.createDecipheriv(AES_CIPHER_ALGORITHM, deviceKey.key!, deviceKey.iv!);
  const ciphertext = cipher.update(Buffer.from(data, 'base64'));
  return JSON.parse(Buffer.concat([ciphertext, cipher.final()]).toString());
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const decryptKlap = (payload: Buffer, deviceKey: DeviceKey, seq: Buffer): any => {
  const cipher = createDecipheriv(AES_CIPHER_ALGORITHM, deviceKey.key!, ivWithSeq(deviceKey.iv!, seq));
  const ciphertext = cipher.update(payload.subarray(32));
  return JSON.parse(Buffer.concat([ciphertext, cipher.final()]).toString());
};

export const readDeviceKey = (pemKey: string, privateKey: KeyObject): Buffer => {
  const keyBytes = Buffer.from(pemKey, 'base64');
  const deviceKey = crypto.privateDecrypt({
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
    passphrase: PASSPHRASE,
  }, keyBytes);

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

export const sha256 = (data: string | Buffer) =>
  createHash('sha256').update(data).digest();

export const encode = (text: string) => Buffer.from(text, 'utf-8');

const ivWithSeq = (iv: Buffer, seq: Buffer) =>
  Buffer.concat([iv.subarray(0, 12), seq]);
