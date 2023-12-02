import { Service, PlatformAccessory } from 'homebridge';

import { ExampleHomebridgePlatform } from './platform';

export class KasaThermostatAccessory {
  private temperatureService: Service;
  private humidityService: Service;

  constructor(
    private readonly platform: ExampleHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.device.model)
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessory.context.device.firmware)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.device.uniqueId);

    // eslint-disable-next-line max-len
    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor);
    // eslint-disable-next-line max-len
    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) || this.accessory.addService(this.platform.Service.HumiditySensor);

    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, this.accessory.context.device.name);
    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, this.accessory.context.device.name);

    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleCurrentRelativeHumidityGet.bind(this));

    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));
  }

  handleCurrentRelativeHumidityGet() {
    return this.accessory.context.device.current_humidity;
  }

  handleCurrentTemperatureGet() {
    return this.accessory.context.device.current_temp;
  }
}
