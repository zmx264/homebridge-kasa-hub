import { Logger } from 'homebridge';
import { TapoConnect } from './TapoConnect';
import { Mutex } from 'async-mutex';

export type ChildDevice = {
  tapoConnect: TapoConnect;
  name: string;
  uniqueId: string;
  model: string;
  firmware: string;
  deviceType: ChildDeviceType;
  current_temp?: number;
  current_humidity?: number;
  heating?: boolean;
  target_temp?: number;
  temp_unit?: string;
  frost_protection_on?: boolean;
  min_control_temp?: number;
  max_control_temp?: number;
  at_low_battery?: boolean;
};
export enum ChildDeviceType {
  TemperatureHumiditySensor,
  Thermostat
}

export class KasaHubController {
  static readonly CACHE_SECONDS = 5;
  static log: Logger;
  deviceCache: Map<string, ChildDevice> = new Map();

  email: string;
  password: string;
  hubs: string[];

  mutex = new Mutex();
  lastUpdate?: number;

  constructor(email: string, password: string, hubs: string[]) {
    this.email = email;
    this.password = password;
    this.hubs = hubs;

  }

  public async getDevice(uniqueId: string): Promise<ChildDevice | undefined> {
    return await this.mutex.runExclusive(async () => {
      let update = false;
      if (this.lastUpdate === undefined || this.deviceCache.size === 0) {
        update = true;
      } else if ((Date.now() - this.lastUpdate) / 1000 > KasaHubController.CACHE_SECONDS) {
        update = true;
      }
      if (!update) {
        return this.deviceCache.get(uniqueId);
      }

      try {
        this.deviceCache.clear();
        const devices = await KasaHubController.getHubDevices(this.email, this.password, this.hubs);
        for (const device of devices) {
          this.deviceCache.set(device.uniqueId, device);
        }

        this.lastUpdate = Date.now();
        return this.deviceCache.get(uniqueId);
      } catch (e) {
        return undefined;
      }
    });
  }

  static async getHubDevices(email: string, password: string, hubs: string[]): Promise<Array<ChildDevice>> {
    const deviceList: Array<ChildDevice> = [];
    try {
      if (hubs.length === 0) {
        return deviceList;
      }

      for (const hub of hubs) {
        const tapoConnect = new TapoConnect(email, password, hub);
        await tapoConnect.login();
        const devices = await tapoConnect.get_child_device_list();

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
              tapoConnect: tapoConnect,
              name: device.nickname ? Buffer.from(device.nickname, 'base64').toString() : 'empty',
              uniqueId: device.device_id,
              model: device.model,
              firmware: device.fw_ver,
              deviceType: deviceType,
              current_temp: device.current_temp,
              current_humidity: device.current_humidity,
              heating: device.trv_states ? device.trv_states.every(state => state === 'heating') : false,
              target_temp: device.target_temp,
              temp_unit: device.temp_unit,
              frost_protection_on: device.frost_protection_on,
              min_control_temp: device.min_control_temp,
              max_control_temp: device.max_control_temp,
              at_low_battery: device.at_low_battery,
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
}