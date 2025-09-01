import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { KasaHubPlatform } from './platform';
import { ChildDevice, ChildDeviceType, KasaHubController } from './KasaHubController';

export class KasaMotionSensor {
  private service: Service;
  private pollTimer?: NodeJS.Timeout;

  constructor(
    private readonly platform: KasaHubPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const { Service, Characteristic } = this.platform;

    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(Characteristic.Model, 'Tapo Motion Sensor')
      .setCharacteristic(Characteristic.SerialNumber, accessory.context.deviceUniqueId ?? 'unknown');

    this.service = this.accessory.getService(Service.MotionSensor) ||
      this.accessory.addService(Service.MotionSensor);

    this.service.setCharacteristic(Characteristic.Name, accessory.displayName);

    this.service.getCharacteristic(Characteristic.MotionDetected)
      .onGet(this.handleMotionDetectedGet.bind(this));

    this.service.getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(this.handleStatusLowBatteryGet.bind(this));

    // Poll periodically similar to other sensors
    this.startPolling();
    this.platform.api.on('shutdown', () => this.stopPolling());
  }

  private async loadDevice(): Promise<ChildDevice> {
    const controller: KasaHubController = this.accessory.context.hubController;
    const id: string = this.accessory.context.deviceUniqueId;
    const d = await controller.getDevice(id);
    if (!d) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    return d;
  }

  async handleMotionDetectedGet(): Promise<CharacteristicValue> {
    const d = await this.loadDevice();
    if (d.deviceType !== ChildDeviceType.MotionSensor) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    return d.motion_detected === true;
  }

  async handleStatusLowBatteryGet(): Promise<CharacteristicValue> {
    const { Characteristic } = this.platform;
    const d = await this.loadDevice();
    const low = d.at_low_battery === true;
    return low ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

  private startPolling() {
    const interval = this.platform.pollIntervalMs;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
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
      const { Characteristic } = this.platform;
      const d = await this.loadDevice();
      if (d.deviceType !== ChildDeviceType.MotionSensor) {
        return;
      }
      this.service.updateCharacteristic(Characteristic.MotionDetected, d.motion_detected === true);
      const low = d.at_low_battery === true;
      this.service.updateCharacteristic(
        Characteristic.StatusLowBattery,
        low ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      this.platform.log.debug(`MotionSensor(${this.accessory.context.deviceUniqueId}) poll failed: ${msg}`);
    }
  }
}
