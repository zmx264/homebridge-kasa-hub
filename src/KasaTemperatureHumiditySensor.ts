/* eslint-disable @typescript-eslint/no-explicit-any */
import { Service, PlatformAccessory } from 'homebridge';

import { KasaHubPlatform } from './platform';
import { KasaHubController } from './KasaHubController';

export class KasaTemperatureHumiditySensor {
  private temperatureService: Service;
  private humidityService: Service;
  private pollTimer?: NodeJS.Timeout;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deviceUniqueId: string;
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

    // Start periodic polling to keep state fresh in HomeKit
    this.startPolling();
    // Clean up on shutdown
    this.platform.api.on('shutdown', () => this.stopPolling());
  }

  async handleCurrentRelativeHumidityGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId);
      if (!device || device.current_humidity === undefined) {
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
      return device.current_humidity;
    } catch (e: any) {
      this.platform.log.error('Sensor: error getting humidity');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async handleCurrentTemperatureGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId);
      if (!device || device.current_temp === undefined) {
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
      return device.current_temp;
    } catch (e: any) {
      this.platform.log.error('Sensor: error getting temperature');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async handleStatusLowBatteryGet() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId);
      if (!device || device.at_low_battery === undefined) {
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
      const currentValue = device.at_low_battery ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      return currentValue;
    } catch (e: any) {
      this.platform.log.error('Sensor: error getting battery status');
      this.platform.log.error(e.message);
      this.platform.log.debug(e.stack);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  private startPolling() {
    const interval = this.platform.pollIntervalMs;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    // First run soon after start
    setTimeout(() => {
      this.pollOnce().catch(() => { /* already logged */ });
    }, 2000);
    this.pollTimer = setInterval(() => {
      this.pollOnce().catch(() => { /* already logged */ });
    }, interval);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async pollOnce() {
    try {
      const device = await this.hubController.getDevice(this.deviceUniqueId);
      if (!device) {
        return;
      }
      if (device.current_temp !== undefined) {
        this.temperatureService.updateCharacteristic(
          this.platform.Characteristic.CurrentTemperature,
          device.current_temp,
        );
      }
      if (device.current_humidity !== undefined) {
        this.humidityService.updateCharacteristic(
          this.platform.Characteristic.CurrentRelativeHumidity,
          device.current_humidity,
        );
      }
      if (device.at_low_battery !== undefined) {
        const low = device.at_low_battery === true
          ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
        this.temperatureService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, low);
        this.humidityService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, low);
      }
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      this.platform.log.debug(`TempHumidity(${this.accessory.context.deviceUniqueId}) poll failed: ${msg}`);
    }
  }
}
