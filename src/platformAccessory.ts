import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { VoltalisPlatform } from "./platform";
import { Voltalis } from "voltalis-client";
import { firstValueFrom } from "rxjs";

export class ModulatorAccessory {
  private service: Service;

  constructor(
    private readonly platform: VoltalisPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly voltalisCLient: Voltalis
  ) {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "Voltalis")
      .setCharacteristic(this.platform.Characteristic.Model, "Default-Model")
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        "Default-Serial"
      );

    this.service =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.modulator.name
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  async setOn(value: CharacteristicValue) {
    const updateOnOffEventObservable = this.voltalisCLient.updateOnOffEvent([
      { csLinkId: this.accessory.context.modulator.id, status: value },
    ]);

    firstValueFrom(updateOnOffEventObservable);

    this.platform.log.debug("Set Characteristic On ->", value);
  }

  async getOn(): Promise<CharacteristicValue> {
    const onOffStateObservable = this.voltalisCLient.getOnOffState(
      this.accessory.context.modulator.id
    );
    const isOn = await firstValueFrom<boolean>(onOffStateObservable);
    this.platform.log.debug("Get Characteristic On ->", isOn);

    return isOn;
  }
}
