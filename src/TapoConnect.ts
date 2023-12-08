/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import { base64Encode, decrypt, encrypt, generateKeyPair, readDeviceKey, shaDigest } from './TapoCipher';
import { Logger } from 'homebridge';

export type DeviceKey = {
  key?: Buffer;
  iv?: Buffer;
};

export class TapoConnect {
  private readonly CONNECT_TIMEOUT = 5000;

  private readonly email: string;
  private readonly password: string;
  private readonly deviceIp: string;
  private readonly log: Logger;

  private sessionCookie: string | undefined;
  private deviceKey: DeviceKey = {};

  private token: string | undefined;

  constructor(log: Logger, email: string, password: string, deviceIp: string) {
    this.log = log;
    this.email = email;
    this.password = password;
    this.deviceIp = deviceIp;
  }

  private async handshake() {
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

  private async securePassthrough(deviceRequest: any): Promise<any> {
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
    await this.handshake();
    const loginDeviceRequest =
    {
      'method': 'login_device',
      'params': {
        'username': base64Encode(shaDigest(this.email)),
        'password': base64Encode(this.password),
      },
      'requestTimeMils': 0,
    };

    const loginDeviceResponse = await this.securePassthrough(loginDeviceRequest);
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

  public async get_child_device_list() {
    const getChildDeviceListRequest = {
      'method': 'get_child_device_list',
    };
    return await this.securePassthrough(getChildDeviceListRequest);
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

  public async set_temp(target_temp: number, device_id: string) {
    try {
      const cmdRequest = TapoConnect.get_control_child(device_id, {
        'method': 'set_device_info',
        'params': {
          'target_temp': target_temp,
          'temp_unit': 'celsius',
        },
      });
      return await this.securePassthrough(cmdRequest);
    } catch (e: any) {
      this.log.error(e.message);
      this.log.debug(e.stack);
    }
  }

  public async set_on(on: boolean, device_id: string) {
    try {
      const cmdRequest = TapoConnect.get_control_child(device_id, {
        'method': 'set_device_info',
        'params': {
          'frost_protection_on': !on,
        },

      });
      return await this.securePassthrough(cmdRequest);
    } catch (e: any) {
      this.log.error(e.message);
      this.log.debug(e.stack);
    }
  }
}