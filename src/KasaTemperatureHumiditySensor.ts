import { Service, PlatformAccessory } from 'homebridge';

import { KasaHubPlatform } from './platform';
import { ChildDevice } from './KasaHubController';

export class KasaTemperatureHumiditySensor {
  private temperatureService: Service;
  private humidityService: Service;

  constructor(
    private readonly platform: KasaHubPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const device: ChildDevice = this.accessory.context.device;

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

  handleCurrentRelativeHumidityGet() {
    return this.accessory.context.device.current_humidity;
  }

  handleCurrentTemperatureGet() {
    return this.accessory.context.device.current_temp;
  }

  handleStatusLowBatteryGet() {
    const device: ChildDevice = this.accessory.context.device;
    const currentValue = device.at_low_battery ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
      this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    return currentValue;
  }

}
