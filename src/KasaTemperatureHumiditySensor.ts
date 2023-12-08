/* eslint-disable @typescript-eslint/no-explicit-any */
import { Service, PlatformAccessory } from 'homebridge';

import { KasaHubPlatform } from './platform';
import { KasaHubController } from './KasaHubController';

export class KasaTemperatureHumiditySensor {
  private temperatureService: Service;
  private humidityService: Service;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deviceUniqueId: any;
  private hubController: KasaHubController;


  constructor(
    private readonly platform: KasaHubPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.deviceUniqueId = this.accessory.context.deviceUniqueId;
    this.hubController = this.accessory.context.hubController;
    const device = this.accessory.context.tempDevice;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Model, device.model)
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, device.firmware)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.uniqueId);

    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor);
    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, device.name);
    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));
    this.temperatureService.setCharacteristic(this.platform.Characteristic.StatusLowBattery,
      this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    this.temperatureService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.handleStatusLowBatteryGet.bind(this));

    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
      this.accessory.addService(this.platform.Service.HumiditySensor);
    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, device.name);
    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleCurrentRelativeHumidityGet.bind(this));
    this.humidityService.setCharacteristic(this.platform.Characteristic.StatusLowBattery,
      this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    this.humidityService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.handleStatusLowBatteryGet.bind(this));
  }

  async handleCurrentRelativeHumidityGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId);
      return device!.current_humidity!;
    } catch (e: any) {
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }

  async handleCurrentTemperatureGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId);
      return device!.current_temp!;
    } catch (e: any) {
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }

  async handleStatusLowBatteryGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId);
      const currentValue = device!.at_low_battery ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      return currentValue;
    } catch (e: any) {
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }
}
