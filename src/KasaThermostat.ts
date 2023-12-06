import { Service, PlatformAccessory } from 'homebridge';

import { KasaHubPlatform } from './platform';
import { KasaHubController } from './KasaHubController';

export class KasaThermostat {
  private thermoStatService: Service;

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
      .setCharacteristic(this.platform.Characteristic.Model, device!.model)
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, device!.firmware)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device!.uniqueId);

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
      minValue: device!.min_control_temp,
      maxValue: device!.max_control_temp,
      minStep: 1,
    });

    this.thermoStatService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.handleTemperatureDisplayUnitsGet.bind(this));

    this.accessory.context.tempDevice = undefined;
  }

  async handleCurrentHeatingCoolingStateGet() {
    const device = await this.hubController.getDevice(this.deviceUniqueId);

    let currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    if (device!.sleep) {
      currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    } else if (!device!.frost_protection_on) {
      currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    }

    return currentValue;
  }

  async handleTargetHeatingCoolingStateSet(value) {
    const device = await this.hubController.getDevice(this.deviceUniqueId)!;

    if (device!.sleep) {
      return;
    }

    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      device!.frost_protection_on = true;
      device!.tapoConnect.set_on(false, this.deviceUniqueId);
    } else {
      device!.frost_protection_on = false;
      device!.tapoConnect.set_on(true, this.deviceUniqueId);
    }
  }

  async handleTargetHeatingCoolingStateGet() {
    const device = await this.hubController.getDevice(this.deviceUniqueId)!;

    let currentValue = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    if (device!.sleep) {
      currentValue = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    } else if (!device!.frost_protection_on) {
      currentValue = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
    }
    return currentValue;
  }

  async handleCurrentTemperatureGet() {
    const device = await this.hubController.getDevice(this.deviceUniqueId)!;

    return device!.current_temp!;
  }

  async handleTargetTemperatureGet() {
    const device = await this.hubController.getDevice(this.deviceUniqueId)!;

    return device!.target_temp!;
  }

  async handleTargetTemperatureSet(value) {
    const device = await this.hubController.getDevice(this.deviceUniqueId)!;
    if (device!.sleep) {
      return;
    }

    device!.target_temp = value;
    device!.tapoConnect.set_temp(value, this.deviceUniqueId);
  }

  async handleTemperatureDisplayUnitsGet() {
    const device = await this.hubController.getDevice(this.deviceUniqueId)!;
    if (device!.temp_unit) {
      return device!.temp_unit === 'celsius' ? this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS
        : this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
    }
    return this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
  }
}
