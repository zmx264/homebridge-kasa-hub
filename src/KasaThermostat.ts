import { Service, PlatformAccessory } from 'homebridge';

import { KasaHubPlatform } from './platform';
import { ChildDevice } from './KasaHubController';

export class KasaThermostat {
  private thermoStatService: Service;

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

    this.thermoStatService = this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat);

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));
    if (Number(this.thermoStatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).value) > 1) {
      this.thermoStatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).updateValue(1);
    }
    this.thermoStatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).setProps({
      maxValue: 1,
      validValues: [0, 1],
    });

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this))
      .onSet(this.handleTargetTemperatureSet.bind(this));
    this.thermoStatService.getCharacteristic(this.platform.Characteristic.TargetTemperature).setProps({
      minValue: device.min_control_temp,
      maxValue: device.max_control_temp,
      minStep: 1,
    });

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.handleTemperatureDisplayUnitsGet.bind(this));
  }

  handleCurrentHeatingCoolingStateGet() {
    let currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    const device: ChildDevice = this.accessory.context.device;
    if (!device.frost_protection_on) {
      currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    }

    return currentValue;
  }

  handleTargetHeatingCoolingStateSet(value) {
    const device: ChildDevice = this.accessory.context.device;

    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      device.tapoConnect.set_on(false, device.uniqueId);
    } else {
      device.tapoConnect.set_on(true, device.uniqueId);
    }

    this.platform.discoverDevices();
  }

  handleTargetHeatingCoolingStateGet() {
    const device: ChildDevice = this.accessory.context.device;

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
    const device: ChildDevice = this.accessory.context.device;
    return device.target_temp!;
  }

  handleTargetTemperatureSet(value) {
    const device: ChildDevice = this.accessory.context.device;
    device.tapoConnect.set_temp(value, device.uniqueId);
    this.platform.discoverDevices();
  }

  handleTemperatureDisplayUnitsGet() {
    const device: ChildDevice = this.accessory.context.device;
    if (device.temp_unit) {
      // eslint-disable-next-line eqeqeq
      return device.temp_unit == 'celsius' ? this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS
        : this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
    }
    return this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
  }
}
