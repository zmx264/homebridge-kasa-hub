import { Service, PlatformAccessory } from 'homebridge';

import { KasaHubPlatform } from './platform';
import { KasaHubController } from './KasaHubController';

export class KasaThermostat {
  private thermoStatService: Service;

  constructor(
    private readonly platform: KasaHubPlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.device.model)
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessory.context.device.firmware)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.device.uniqueId);

    this.thermoStatService = this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat);

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this))
      .onSet(this.handleTargetTemperatureSet.bind(this));

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.handleTemperatureDisplayUnitsGet.bind(this));
  }

  handleCurrentHeatingCoolingStateGet() {
    let currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    const device = this.accessory.context.device;
    if (!device.frost_protection_on) {
      currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    }

    return currentValue;
  }

  handleTargetHeatingCoolingStateSet(value) {
    const device = this.accessory.context.device;

    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      KasaHubController.set_on(false, device.uniqueId, device.deviceKey);
      device.heatingState = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    } else {
      KasaHubController.set_on(true, device.uniqueId, device.deviceKey);
      device.heatingState = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
    }
  }

  handleTargetHeatingCoolingStateGet() {
    const device = this.accessory.context.device;
    if (device.heatingState !== undefined) {
      return device.heatingState;
    }

    let currentValue = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    if (!device.frost_protection_on) {
      currentValue = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
    }
    return currentValue;
  }

  handleCurrentTemperatureGet() {
    return this.accessory.context.device.current_temp;
  }

  handleTargetTemperatureGet() {
    const device = this.accessory.context.device;
    if (device.targetTemp !== undefined) {
      return device.targetTemp;
    }
    return device.target_temp;
  }

  handleTargetTemperatureSet(value) {
    const device = this.accessory.context.device;
    device.targetTemp = value;
    KasaHubController.set_temp(value, device.uniqueId, device.deviceKey);
  }

  handleTemperatureDisplayUnitsGet() {
    const device = this.accessory.context.device;
    if (device.temp_unit) {
      // eslint-disable-next-line eqeqeq
      return device.temp_unit == 'celsius' ? this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS
        : this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
    }
    return this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
  }
}
