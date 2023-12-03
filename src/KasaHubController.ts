import { TapoDeviceKey, cloudLogin, loginDeviceByIp, securePassthrough } from 'tp-link-tapo-connect';
import { Logger } from 'homebridge';

export type ChildDevice = {
  deviceKey: TapoDeviceKey;
  name: string;
  uniqueId: string;
  model: string;
  firmware: string;
  signal_level: number;
  deviceType: ChildDeviceType;
  current_temp?: number;
  current_humidity?: number;
  heating?: boolean;
  target_temp?: number;
  temp_unit?: string;
  frost_protection_on?: boolean;
};
export enum ChildDeviceType {
  TemperatureHumiditySensor,
  Thermostat
}

export class KasaHubController {
  static readonly log: Logger;

  static cloudToken = '';
  static async discoverDevices(email: string, password: string, hubs: string[]): Promise<Array<ChildDevice>> {
    const deviceList: Array<ChildDevice> = [];
    try {
      if (!this.cloudToken) {
        try {
          this.cloudToken = await cloudLogin(email, password);
        } catch {
          this.cloudToken = '';
          return deviceList;
        }
      }
      if (hubs.length === 0) {
        return deviceList;
      }

      for (const hub of hubs) {
        const deviceKey = await loginDeviceByIp(email, password, hub);
        const devices = await KasaHubController.get_child_device_list(deviceKey);

        for (const device of devices.child_device_list) {
          if (device.status !== 'online') {
            continue;
          }
          let deviceType: ChildDeviceType | null = null;
          switch (device.category) {
            case 'subg.trigger.temp-hmdt-sensor':
              deviceType = ChildDeviceType.TemperatureHumiditySensor;
              break;
            case 'subg.trv':
              deviceType = ChildDeviceType.Thermostat;
              break;
          }
          if (deviceType === null) {
            continue;
          }
          try {
            const wrapper: ChildDevice = {
              deviceKey: deviceKey,
              name: device.nickname ? Buffer.from(device.nickname, 'base64').toString() : 'empty',
              uniqueId: device.device_id,
              model: device.model,
              firmware: device.fw_ver,
              signal_level: device.signal_level,
              deviceType: deviceType,
              current_temp: device.current_temp,
              current_humidity: device.current_humidity,
              heating: device.trv_states ? device.trv_states.every(state => state === 'heating') : false,
              target_temp: device.target_temp,
              temp_unit: device.temp_unit,
              frost_protection_on: device.frost_protection_on,
            };
            deviceList.push(wrapper);
          } catch (e) {
            if (e instanceof Error) {
              this.log.error(e.message);
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error) {
        this.log.error(e.message);
      }
    }
    return deviceList;
  }

  static async get_child_device_list(deviceKey: TapoDeviceKey) {
    const getChildDeviceListRequest = {
      'method': 'get_child_device_list',
    };
    return await securePassthrough(getChildDeviceListRequest, deviceKey);
  }

  static async set_temp(target_temp: number, device_id: string, deviceKey: TapoDeviceKey) {
    const cmdRequest = {
      'method': 'control_child',
      'params': {
        'device_id': device_id,
        'requestData': {
          'method': 'multipleRequest',
          'params': {
            'requests': [
              {
                'method': 'set_device_info',
                'params': {
                  'target_temp': target_temp,
                  'temp_unit': 'celsius',
                },
              },
            ],
          },
        },
      },
    };
    return await securePassthrough(cmdRequest, deviceKey);
  }

  static async set_on(on: boolean, device_id: string, deviceKey: TapoDeviceKey) {
    const cmdRequest = {
      'method': 'control_child',
      'params': {
        'device_id': device_id,
        'requestData': {
          'method': 'multipleRequest',
          'params': {
            'requests': [
              {
                'method': 'set_device_info',
                'params': {
                  'frost_protection_on': !on,
                },
              },
            ],
          },
        },
      },
    };
    return await securePassthrough(cmdRequest, deviceKey);
  }
}