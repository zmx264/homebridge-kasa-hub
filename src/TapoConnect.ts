/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
// eslint-disable-next-line max-len
import { base64Encode, decrypt, decryptKlap, encode, encrypt, encryptAndSign, generateKeyPair, readDeviceKey, shaDigest, sha256 as sha256Hash } from './TapoCipher';
import { Logger } from 'homebridge';
import { createHash, randomBytes } from 'crypto';

// Local helper to avoid TS Buffer/Uint8Array generic mismatches for concat
function concatBuf(...parts: Buffer[]): Buffer {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = Buffer.allocUnsafe(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export type DeviceKey = {
  key?: Buffer;
  iv?: Buffer;
};

export class TapoConnect {
  private readonly CONNECT_TIMEOUT = 20000;

  private readonly email: string;
  private readonly password: string;
  private readonly deviceIp: string;
  private readonly log: Logger;

  private sessionCookie: string | undefined;
  private deviceKey: DeviceKey = {};
  private seq?: Buffer;
  private sig?: Buffer;
  private usePassThroughProtocol = true;

  private token: string | undefined;

  constructor(log: Logger, email: string, password: string, deviceIp: string) {
    this.log = log;
    this.email = email;
    this.password = password;
    this.deviceIp = deviceIp;
  }

  private async handshakePassThrough() {
    const keyPair = await generateKeyPair();

    const handshakeRequest =
    {
      method: 'handshake',
      params: {
        'key': keyPair.publicKey,
      },
    };
    const response = await axios({
      method: 'post',
      url: `http://${this.deviceIp}/app`,
      data: handshakeRequest,
      timeout: this.CONNECT_TIMEOUT,
    });

    TapoConnect.checkError(response.data);

    if (response.headers && response.headers['set-cookie']) {
      const setCookieHeader = response.headers['set-cookie'][0];
      this.sessionCookie = setCookieHeader.substring(0, setCookieHeader.indexOf(';'));
    }

    const deviceKey = readDeviceKey(response.data.result.key, keyPair.privateKey);
    this.deviceKey.key = deviceKey.subarray(0, 16);
    this.deviceKey.iv = deviceKey.subarray(16, 32);
  }

  private async handshakeAndLoginKlap() {
    // handshake1
    const localSeed = randomBytes(16);

    const response = await axios.post(`http://${this.deviceIp}/app/handshake1`, localSeed,
      {
        responseType: 'arraybuffer',
        withCredentials: true,
        timeout: this.CONNECT_TIMEOUT,
      })
      .catch((error) => {
        if (error.response && error.response.status === 404) {
          throw new Error('Klap protocol not supported');
        }
        throw new Error(`handshake1 failed: ${error}`);
      });

    const responseBytes = Buffer.from(response.data);

    const setCookieHeader = response.headers['set-cookie']![0];
    this.sessionCookie = setCookieHeader.substring(0, setCookieHeader.indexOf(';'));

    const remoteSeed = responseBytes.subarray(0, 16);
    const serverHash = responseBytes.subarray(16);

    const localAuthHash = sha256Hash(concatBuf(sha1(this.email), sha1(this.password)));
    const localSeedAuthHash = sha256Hash(concatBuf(localSeed, remoteSeed, localAuthHash));

    if (!compare(localSeedAuthHash, serverHash)) {
      throw new Error('email or password incorrect');
    }

    // handshake2
    const payload = sha256Hash(concatBuf(remoteSeed, localSeed, localAuthHash));
    await axios.post(`http://${this.deviceIp}/app/handshake2`, payload,
      {
        responseType: 'arraybuffer',
        headers: {
          'Cookie': this.sessionCookie,
        },
        timeout: this.CONNECT_TIMEOUT,
      })
      .catch((error) => {
        throw new Error(`handshake2 failed: ${error}`);
      });

    this.deviceKey.key = deriveKey(localSeed, remoteSeed, localAuthHash);
    this.deviceKey.iv = deriveIv(localSeed, remoteSeed, localAuthHash);

    this.sig = deriveSig(localSeed, remoteSeed, localAuthHash);
    this.seq = deriveSeqFromIv(this.deviceKey.iv);
  }

  private async sendKlap(deviceRequest: any): Promise<any> {
    this.seq = incrementSeq(this.seq!);

    const encryptedRequest = encryptAndSign(deviceRequest, this.deviceKey, this.sig!, this.seq);

    const response = await axios({
      method: 'post',
      url: `http://${this.deviceIp}/app/request`,
      data: encryptedRequest,
      responseType: 'arraybuffer',
      timeout: this.CONNECT_TIMEOUT,
      headers: {
        'Cookie': this.sessionCookie,
      },
      params: {
        seq: this.seq.readInt32BE(),
      },
    });

    const decryptedResponse = decryptKlap(response.data, this.deviceKey, this.seq!);
    TapoConnect.checkError(decryptedResponse);

    return decryptedResponse.result;
  }

  private async send(deviceRequest: any): Promise<any> {
    if (this.usePassThroughProtocol) {
      return this.sendPassthrough(deviceRequest);
    }
    return this.sendKlap(deviceRequest);
  }

  private async sendPassthrough(deviceRequest: any): Promise<any> {
    const encryptedRequest = encrypt(deviceRequest, this.deviceKey);
    const securePassthroughRequest = {
      'method': 'securePassthrough',
      'params': {
        'request': encryptedRequest,
      },
    };

    const response = await axios({
      method: 'post',
      url: `http://${this.deviceIp}/app?token=${this.token}`,
      data: securePassthroughRequest,
      headers: {
        'Cookie': this.sessionCookie,
      },
      timeout: this.CONNECT_TIMEOUT,
    });

    TapoConnect.checkError(response.data);

    const decryptedResponse = decrypt(response.data.result.response, this.deviceKey);
    TapoConnect.checkError(decryptedResponse);

    return decryptedResponse.result;
  }

  public async login() {
    try {
      await this.handshakePassThrough();
      await this.loginPassThrough();
      this.usePassThroughProtocol = true;
    } catch (error) {
      this.usePassThroughProtocol = false;
    }
    if (!this.usePassThroughProtocol) {
      await this.handshakeAndLoginKlap();
    }
  }

  private async loginPassThrough() {
    const loginDeviceRequest = {
      'method': 'login_device',
      'params': {
        'username': base64Encode(shaDigest(this.email)),
        'password': base64Encode(this.password),
      },
      'requestTimeMils': 0,
    };

    const loginDeviceResponse = await this.sendPassthrough(loginDeviceRequest);
    this.token = loginDeviceResponse.token;
  }


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static checkError(responseData: any) {
    const errorCode = responseData['error_code'];
    if (errorCode) {
      switch (errorCode) {
        case 0: return;
        case -1010: throw new Error('Invalid public key length');
        case -1012: throw new Error('Invalid terminal UUID');
        case -1501: throw new Error('Invalid request or credentials');
        case -1002: throw new Error('Incorrect request');
        case -1003: throw new Error('JSON format error');
        case -20601: throw new Error('Incorrect email or password');
        case -20675: throw new Error('Cloud token expired or invalid');
        case 9999: throw new Error('Device token expired or invalid');
        default: throw new Error(`Unexpected Error Code: ${errorCode} (${responseData['msg']})`);
      }
    }
  }

  public async get_child_device_list(startIndex = 0) {
    const getChildDeviceListRequest = {
      'method': 'get_child_device_list',
      'params': {
        'start_index': startIndex,
      },
    };
    return await this.send(getChildDeviceListRequest);
  }

  // Retrieve last trigger logs for a child device (used by contact sensors)
  public async get_child_trigger_logs(device_id: string) {
    const req = TapoConnect.get_control_child(device_id, {
      'method': 'get_trigger_logs',
      'params': {
        'start_id': 0,
        'page_size': 1,
      },
    });
    return await this.send(req);
  }

  static get_control_child(device_id: string, request: unknown) {
    return {
      'method': 'control_child',
      'params': {
        'device_id': device_id,
        'requestData': {
          'method': 'multipleRequest',
          'params': {
            'requests': [
              request,
            ],
          },
        },
      },
    };
  }

  public async set_temp_on(target_temp: number, on: boolean, device_id: string) {
    const cmdRequest = TapoConnect.get_control_child(device_id, {
      'method': 'set_device_info',
      'params': {
        'frost_protection_on': !on,
        'target_temp': target_temp,
        'temp_unit': 'celsius',
      },
    });
    return await this.send(cmdRequest);
  }
}

const compare = (b1: Buffer, b2: Buffer) => {
  if (b1.length !== b2.length) {
    return false;
  }
  for (let i = 0; i < b1.length; i++) {
    if (b1[i] !== b2[i]) {
      return false;
    }
  }
  return true;
};

const deriveSeqFromIv = (iv: Buffer) => iv.subarray(iv.length - 4);

const deriveSig = (localSeed: Buffer, remoteSeed: Buffer, userHash: Buffer) =>
  sha256Hash(concatBuf(encode('ldk'), localSeed, remoteSeed, userHash)).subarray(0, 28);

const deriveKey = (localSeed: Buffer, remoteSeed: Buffer, userHash: Buffer) =>
  sha256Hash(concatBuf(encode('lsk'), localSeed, remoteSeed, userHash)).subarray(0, 16);

const deriveIv = (localSeed: Buffer, remoteSeed: Buffer, userHash: Buffer) =>
  sha256Hash(concatBuf(encode('iv'), localSeed, remoteSeed, userHash));

const incrementSeq = (seq: Buffer) => {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(seq.readInt32BE() + 1);
  return buffer;
};

const sha1 = (data: string | Buffer) => {
  const h = createHash('sha1');
  if (typeof data === 'string') {
    h.update(data, 'utf8');
  } else {
    h.update(data as unknown as NodeJS.ArrayBufferView);
  }
  return h.digest();
};
