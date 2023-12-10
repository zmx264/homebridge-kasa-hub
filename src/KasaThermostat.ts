/* eslint-disable @typescript-eslint/no-explicit-any */
import { Service, PlatformAccessory } from 'homebridge';

import { KasaHubPlatform } from './platform';
import { ChildDevice, KasaHubController } from './KasaHubController';
import { setTimeout } from 'node:timers/promises';

export class KasaThermostat {
  private thermoStatService: Service;

  private deviceUniqueId: any;
  private hubController: KasaHubController;
  private canExecute = true;

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
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId);

      let currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      if (device!.sleep) {
        currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      } else if (!device!.frost_protection_on) {
        currentValue = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      }

      return currentValue;
    } catch (e: any) {
      this.platform.log.error('Thermostat: error getting current state');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }

  async handleTargetHeatingCoolingStateGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId)!;

      let currentValue = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
      if (device!.sleep) {
        currentValue = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
      } else if (!device!.frost_protection_on) {
        currentValue = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
      }
      return currentValue;
    } catch (e: any) {
      this.platform.log.error('Thermostat: error getting state');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }

  async handleCurrentTemperatureGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId)!;

      return device!.current_temp!;
    } catch (e: any) {
      this.platform.log.error('Thermostat: error getting current temperature');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }

  async handleTargetTemperatureGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId)!;

      return device!.target_temp!;
    } catch (e: any) {
      this.platform.log.error('Thermostat: error getting target temperature');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }

  async handleTemperatureDisplayUnitsGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId)!;
      if (device!.temp_unit) {
        return device!.temp_unit === 'celsius' ? this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS
          : this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
      }
      return this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
    } catch (e: any) {
      this.platform.log.error('Thermostat: error getting temperature display unit');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }

  async handleTargetTemperatureSet(value) {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId)!;

      this.platform.log.info('[%s] Setting target temperature to: ', device?.name, value);

      if (device!.sleep) {
        this.platform.log.info('[%s] Sleeping, cannot change temperature', device?.name);
        return;
      }

      device!.target_temp = value;

      if (this.canExecute) {
        this.canExecute = false;
        this.set_on_temp(device!);
      }
    } catch (e: any) {
      this.platform.log.error('Thermostat: error setting target temperature');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }

  async handleTargetHeatingCoolingStateSet(value) {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId)!;

      let target_frost_protection_on = false;
      if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
        target_frost_protection_on = true;
      }

      this.platform.log.info('[%s] Setting target heating state to: ', device?.name, value);

      if (device!.sleep) {
        this.platform.log.info('[%s] Sleeping, cannot change target heating state', device?.name);
        return;
      }

      device!.frost_protection_on = target_frost_protection_on;

      if (this.canExecute) {
        this.canExecute = false;
        this.set_on_temp(device!);
      }
    } catch (e: any) {
      this.platform.log.error('Thermostat: error setting target state');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);

      return e;
    }
  }

  async set_on_temp(device: ChildDevice) {
    setTimeout(2500).then(() => {
      this.canExecute = true;
      device.tapoConnect.set_temp_on(device.target_temp!, !device.frost_protection_on, this.deviceUniqueId)
        .catch(e => {
          this.platform.log.error('[%s] Error setting: %s', device.name, e.message);
          this.platform.log.debug(e.stack);
        });
    });
  }
}
