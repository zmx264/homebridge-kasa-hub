import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { KasaTemperatureHumiditySensor } from './KasaTemperatureHumiditySensor';
import { KasaHubController, ChildDeviceType } from './KasaHubController';
import { KasaThermostat } from './KasaThermostat';

export class KasaHubPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  interval?: NodeJS.Timer;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    KasaHubController.log = log;

    if (!this.config.email || !this.config.password) {
      this.log.error('Email and password must be configured, exiting');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');

      this.discoverDevices();
      this.interval = setInterval(() => {
        this.discoverDevices();
      }, (this.config.refresh_interval ?? 60) * 1000);
    });

    this.api.on('shutdown', () => {
      log.debug('Shutdown...');
      if (this.interval) {
        clearInterval(this.interval);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    const devices = await KasaHubController.discoverDevices(this.config.email, this.config.password, this.config.devices);

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.uniqueId);

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName);

        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);
        switch (device.deviceType) {
          case ChildDeviceType.TemperatureHumiditySensor:
            new KasaTemperatureHumiditySensor(this, existingAccessory);
            break;
          case ChildDeviceType.Thermostat:
            new KasaThermostat(this, existingAccessory);
            break;
        }
      } else {
        this.log.debug('Adding new accessory:', device.name);

        const accessory = new this.api.platformAccessory(device.name, uuid);

        accessory.context.device = device;

        switch (device.deviceType) {
          case ChildDeviceType.TemperatureHumiditySensor:
            new KasaTemperatureHumiditySensor(this, accessory);
            break;
          case ChildDeviceType.Thermostat:
            new KasaThermostat(this, accessory);
            break;
        }

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }
    }
  }
}
