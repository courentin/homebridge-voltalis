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
import {
  ModulatorAccessory,
  Scheduler,
  SchedulerAccessory,
} from "./platformAccessory";
import { Voltalis } from "voltalis-client";
import { firstValueFrom } from "rxjs";

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
      await this.voltalisLogin();
      this.discoverDevices();
    });
  }

  async voltalisLogin() {
    await this.voltalisClient.login();

    const loginRefreshIntervalInMinutes =
      typeof this.config.loginRefreshIntervalInMinutes === "undefined"
        ? 10
        : this.config.loginRefreshIntervalInMinutes;

    setInterval(() => {
      this.voltalisClient.login();
      this.log.debug("Login refresh");
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
        new ModulatorAccessory(this, existingAccessory, this.voltalisClient);
      } else {
        this.log.info("Adding new accessory:", formattedModulator.name);

        const accessory = new this.api.platformAccessory(
          formattedModulator.name,
          formattedModulator.uuid
        );
        accessory.context.modulator = formattedModulator;
        new ModulatorAccessory(this, accessory, this.voltalisClient);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }
    const schedulers = await firstValueFrom<Scheduler[]>(
      this.voltalisClient.getSchedulerList()
    );
    for (const scheduler of schedulers) {
      const formattedScheduler = {
        id: scheduler.id,
        name: scheduler.isException ? scheduler.name : `🔁 ${scheduler.name}`,
        uuid: this.api.hap.uuid.generate(scheduler.id.toString()),
      };

      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === formattedScheduler.uuid
      );

      if (existingAccessory) {
        this.log.info(
          "Restoring existing accessory from cache:",
          existingAccessory.displayName
        );
        new SchedulerAccessory(this, existingAccessory, this.voltalisClient);
      } else {
        this.log.info("Adding new accessory:", formattedScheduler.name);

        const accessory = new this.api.platformAccessory(
          formattedScheduler.name,
          formattedScheduler.uuid
        );
        accessory.context.scheduler = formattedScheduler;
        new SchedulerAccessory(this, accessory, this.voltalisClient);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }
  }
}
