import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { KasaThermostatAccessory } from './KasaThermostatAccessory';
import { KasaHubController } from './KasaHubController';

export class ExampleHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  interval?: NodeJS.Timer;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');

      this.discoverDevices();
      this.interval = setInterval(() => {
        log.debug('Discovery...');
        this.discoverDevices();
      }, 30 * 1000);
    });

    this.api.on('shutdown', () => {
      log.debug('Shutdown...');
      if (this.interval) {
        clearInterval(this.interval);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    if (!this.config.email || !this.config.password) {
      this.log.info('No user or password defined');
      return;
    }

    const devices = await KasaHubController.discoverDevices(this.config.email, this.config.password, this.config.devices);

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.uniqueId);

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        existingAccessory.context.device = device;
        //console.log(existingAccessory.context.device);
        this.api.updatePlatformAccessories([existingAccessory]);

        new KasaThermostatAccessory(this, existingAccessory);
      } else {
        this.log.info('Adding new accessory:', device.name);

        const accessory = new this.api.platformAccessory(device.name, uuid);

        accessory.context.device = device;
        new KasaThermostatAccessory(this, accessory);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
