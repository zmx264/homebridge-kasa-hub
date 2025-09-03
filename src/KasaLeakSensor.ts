import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { KasaHubPlatform } from './platform';
import { ChildDevice, ChildDeviceType, KasaHubController } from './KasaHubController';

export class KasaLeakSensor {
  private service: Service;
  private pollTimer?: NodeJS.Timeout;

  constructor(
    private readonly platform: KasaHubPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const { Service, Characteristic } = this.platform;

    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(Characteristic.Model, 'Tapo Leak Sensor')
      .setCharacteristic(Characteristic.SerialNumber, accessory.context.deviceUniqueId ?? 'unknown');

    this.service = this.accessory.getService(Service.LeakSensor) ||
      this.accessory.addService(Service.LeakSensor);

    this.service.setCharacteristic(Characteristic.Name, accessory.displayName);

    this.service.getCharacteristic(Characteristic.LeakDetected)
      .onGet(this.handleLeakDetectedGet.bind(this));

    this.service.getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(this.handleStatusLowBatteryGet.bind(this));

    // Poll periodically
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

  async handleLeakDetectedGet(): Promise<CharacteristicValue> {
    const { Characteristic } = this.platform;
    const d = await this.loadDevice();
    if (d.deviceType !== ChildDeviceType.LeakSensor) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const hasLeak = await this.getLeakState(d);
    return (hasLeak ?? false)
      ? Characteristic.LeakDetected.LEAK_DETECTED
      : Characteristic.LeakDetected.LEAK_NOT_DETECTED;
  }

  async handleStatusLowBatteryGet(): Promise<CharacteristicValue> {
    const { Characteristic } = this.platform;
    const d = await this.loadDevice();
    const low = d.at_low_battery === true;
    return low ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

  private async getLeakState(d?: ChildDevice): Promise<boolean | undefined> {
    const device = d ?? await this.loadDevice();
    let hasLeak = device.leak_detected;
    if (hasLeak === undefined) {
      try {
        // Attempt to use trigger logs similar to contact sensor
        const resp = await device.tapoConnect.get_child_trigger_logs(device.uniqueId);
        const last = resp?.responses?.[0]?.result?.logs?.[0];
        const evt: string | undefined = last?.event;
        if (evt) {
          const e = String(evt).toLowerCase();
          if (e === 'water_leak') {
            hasLeak = true;
          } else if (e === 'water_dry' || e === 'normal') {
            hasLeak = false;
          }
        }
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        this.platform.log.debug(`LeakSensor(${device.uniqueId}) trigger logs fetch failed: ${msg}`);
      }
    }
    return hasLeak;
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
      if (d.deviceType !== ChildDeviceType.LeakSensor) {
        return;
      }
      const hasLeak = await this.getLeakState(d);
      this.service.updateCharacteristic(
        Characteristic.LeakDetected,
        (hasLeak ?? false) ? Characteristic.LeakDetected.LEAK_DETECTED : Characteristic.LeakDetected.LEAK_NOT_DETECTED,
      );
      const low = d.at_low_battery === true;
      this.service.updateCharacteristic(
        Characteristic.StatusLowBattery,
        low ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      this.platform.log.debug(`LeakSensor(${this.accessory.context.deviceUniqueId}) poll failed: ${msg}`);
    }
  }
}
