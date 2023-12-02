import { TapoDeviceKey, cloudLogin, loginDeviceByIp, securePassthrough } from 'tp-link-tapo-connect';

export type ChildSensorDevice = {
  cloudToken: string;
  name: string;
  uniqueId: string;
  model: string;
  firmware: string;
  signal_level: number;
  current_temp: number;
  current_humidity: number;
};

export class KasaHubController {
  static cloudToken = '';
  static async discoverDevices(email: string, password: string, hubs: string[]): Promise<Array<ChildSensorDevice>> {
    const deviceList: Array<ChildSensorDevice> = [];
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
        const deviceToken = await loginDeviceByIp(email, password, hub);
        const devices = await KasaHubController.get_child_device_list(deviceToken);

        for (const device of devices.child_device_list) {
          if (device.status !== 'online') {
            continue;
          }
          if (device.category !== 'subg.trigger.temp-hmdt-sensor') {
            continue;
          }
          //console.log(device);
          const wrapper: ChildSensorDevice = {
            name: Buffer.from(device.nickname, 'base64').toString(),
            cloudToken: this.cloudToken,
            uniqueId: device.device_id,
            model: device.model,
            firmware: device.fw_ver,
            signal_level: device.signal_level,
            current_temp: device.current_temp,
            current_humidity: device.current_humidity,
          };
          deviceList.push(wrapper);
        }
      }
    } catch (e) {
      //
    }
    return deviceList;
  }

  static async get_child_device_list(deviceKey: TapoDeviceKey) {
    const getChildDeviceListRequest = {
      'method': 'get_child_device_list',
    };
    return await securePassthrough(getChildDeviceListRequest, deviceKey);
  }

  // static async test(deviceKey: TapoDeviceKey) {
  //   const getChildDeviceListRequest = {
  //     'method': 'control_child',
  //   };
  // }
}