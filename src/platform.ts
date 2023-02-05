import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import { ModulatorAccessory } from "./platformAccessory";
import { Voltalis } from "voltalis-client";

export class VoltalisPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private readonly voltalisClient: Voltalis = new Voltalis(
    this.config.username,
    this.config.password
  );

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.log.debug("Finished initializing platform:", this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on("didFinishLaunching", async () => {
      log.debug("Executed didFinishLaunching callback");
      this.discoverDevices();
    });
  }

  async voltalisLogin() {
    await this.voltalisClient.login();

    let loginRefreshIntervalInMinutes =
      typeof this.config.loginRefreshIntervalInMinutes === "undefined"
        ? 10
        : this.config.loginRefreshIntervalInMinutes;

    setInterval(() => {
      this.voltalisClient.login();
    }, loginRefreshIntervalInMinutes * 60 * 1000);
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    await this.voltalisClient.login();
    for (const modulator of this.voltalisClient.getModulators()) {
      const modulatorId = modulator.values["2"].csLinkId;
      const formattedModulator = {
        id: modulatorId,
        name: modulator.values["2"].name,
        uuid: this.api.hap.uuid.generate(modulatorId.toString()),
      };

      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === formattedModulator.uuid
      );

      if (existingAccessory) {
        this.log.info(
          "Restoring existing accessory from cache:",
          existingAccessory.displayName
        );

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        new ModulatorAccessory(this, existingAccessory, this.voltalisClient);

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {
        this.log.info("Adding new accessory:", formattedModulator.name);

        const accessory = new this.api.platformAccessory(
          formattedModulator.name,
          formattedModulator.uuid
        );

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.modulator = formattedModulator;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        new ModulatorAccessory(this, accessory, this.voltalisClient);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }
  }
}
