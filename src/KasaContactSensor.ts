import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { KasaHubPlatform } from './platform';
import { ChildDevice, ChildDeviceType, KasaHubController } from './KasaHubController';

export class KasaContactSensor {
  private service: Service;
  private pollTimer?: NodeJS.Timeout;

  constructor(
    private readonly platform: KasaHubPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const { Service, Characteristic } = this.platform;

    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(Characteristic.Model, 'Tapo Contact Sensor')
      .setCharacteristic(Characteristic.SerialNumber, accessory.context.deviceUniqueId ?? 'unknown');

    this.service = this.accessory.getService(Service.ContactSensor) ||
      this.accessory.addService(Service.ContactSensor);

    this.service.setCharacteristic(Characteristic.Name, accessory.displayName);

    this.service.getCharacteristic(Characteristic.ContactSensorState)
      .onGet(this.handleContactStateGet.bind(this));

    this.service.getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(this.handleStatusLowBatteryGet.bind(this));

    // Start periodic polling to keep state fresh in HomeKit
    this.startPolling();
    // Clean up on shutdown
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

  async handleContactStateGet(): Promise<CharacteristicValue> {
    const { Characteristic } = this.platform;
    const d = await this.loadDevice();
    if (d.deviceType !== ChildDeviceType.ContactSensor) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const isOpen = await this.getContactOpen(d);
    const val = (isOpen ?? false)
      ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : Characteristic.ContactSensorState.CONTACT_DETECTED;
    return val;
  }

  async handleStatusLowBatteryGet(): Promise<CharacteristicValue> {
    const { Characteristic } = this.platform;
    const d = await this.loadDevice();
    const low = d.at_low_battery === true;
    return low ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

  private async getContactOpen(d?: ChildDevice): Promise<boolean | undefined> {
    const device = d ?? await this.loadDevice();
    let isOpen = device.contact_open;
    // Fallback: if state not populated in list payload, fetch last trigger log
    if (isOpen === undefined) {
      try {
        const resp = await device.tapoConnect.get_child_trigger_logs(device.uniqueId);
        const last = resp?.responses?.[0]?.result?.logs?.[0];
        const evt: string | undefined = last?.event;
        if (evt) {
          const e = String(evt).toLowerCase();
          if (e === 'open' || e === 'keepopen') {
            isOpen = true;
          } else if (e === 'close' || e === 'closed') {
            isOpen = false;
          }
        }
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        this.platform.log.debug(`ContactSensor(${device.uniqueId}) trigger logs fetch failed: ${msg}`);
      }
    }
    return isOpen;
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
      const { Characteristic } = this.platform;
      const d = await this.loadDevice();
      if (d.deviceType !== ChildDeviceType.ContactSensor) {
        return;
      }
      const isOpen = await this.getContactOpen(d);
      const val = (isOpen ?? false)
        ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : Characteristic.ContactSensorState.CONTACT_DETECTED;
      this.service.updateCharacteristic(Characteristic.ContactSensorState, val);
      const low = d.at_low_battery === true;
      this.service.updateCharacteristic(
        Characteristic.StatusLowBattery,
        low ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      this.platform.log.debug(`ContactSensor(${this.accessory.context.deviceUniqueId}) poll failed: ${msg}`);
    }
  }
}
