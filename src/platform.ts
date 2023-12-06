import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { KasaTemperatureHumiditySensor } from './KasaTemperatureHumiditySensor';
import { KasaHubController, ChildDeviceType } from './KasaHubController';
import { KasaThermostat } from './KasaThermostat';

export class KasaHubPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  private hubController!: KasaHubController;

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

    this.hubController = new KasaHubController(this.config.email, this.config.password, this.config.devices);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');

      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    const devices = await KasaHubController.getHubDevices(this.config.email, this.config.password, this.config.devices);

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.uniqueId);

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        existingAccessory.context.hubController = this.hubController;
        existingAccessory.context.deviceUniqueId = device.uniqueId;
        existingAccessory.context.tempDevice = device;

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
        this.log.info('Adding new accessory:', device.name);

        const accessory = new this.api.platformAccessory(device.name, uuid);
        accessory.context.hubController = this.hubController;
        accessory.context.deviceUniqueId = device.uniqueId;
        accessory.context.tempDevice = device;

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