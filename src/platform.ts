import {
  ColorControl,
  ColorControlCluster,
  DeviceTypes,
  DoorLock,
  DoorLockCluster,
  LevelControlCluster,
  OnOffCluster,
  PlatformConfig,
  Thermostat,
  ThermostatCluster,
  WindowCovering,
  WindowCoveringCluster,
  onOffSwitch,
} from 'matterbridge';

import fetch from 'node-fetch';

import { Matterbridge, MatterbridgeDevice, MatterbridgeDynamicPlatform } from 'matterbridge';
import { AnsiLogger } from 'node-ansi-logger';

export type ResponseStatus = 'success' | 'error';
export interface DataLoadItemWithId {
  id: string;
  name: string;
  unused?: boolean;
  type: 'onoff' | 'dim' | 'motor' | 'dali';
  subtype: string;
  device: string;
  channel: string;
  state: State;
}
type State = { bri: number } | { running: boolean; pos: number; angle: number };
function isOnOffState(checkObj: State): checkObj is { bri: number } {
  const optionalOnOffState = checkObj as { bri: number };
  return optionalOnOffState !== null && typeof optionalOnOffState === 'object' && optionalOnOffState.bri !== undefined;
}

export interface DataDeviceBasicPropertiesItemWithId {
  id: string;
  last_seen: number;
  a: {
    fw_id: string;
    hw_id: string;
    fw_revision: string;
    comm_ref: string;
    address: string;
    nubes_id: number;
    comm_name: string;
    serial_nr: string;
  };
  c: {
    fw_id: string;
    hw_id: string;
    fw_version: string;
    comm_ref: string;
    cmd_matrix: string;
    nubes_id: number;
    comm_name: string;
    serial_nr: string;
  };
}

export interface DataDeviceAllPropertiesItem extends DataDeviceBasicPropertiesItemWithId {
  inputs: Array<{
    type: string;
  }>;
  outputs: Array<{
    load: number;
    type: string;
    sub_type: string;
  }>;
}

export class FellerWiserPlatform extends MatterbridgeDynamicPlatform {
  switch: MatterbridgeDevice | undefined;
  light: MatterbridgeDevice | undefined;
  outlet: MatterbridgeDevice | undefined;
  cover: MatterbridgeDevice | undefined;
  lock: MatterbridgeDevice | undefined;
  thermo: MatterbridgeDevice | undefined;
  switchInterval: NodeJS.Timeout | undefined;
  lightInterval: NodeJS.Timeout | undefined;
  outletInterval: NodeJS.Timeout | undefined;
  coverInterval: NodeJS.Timeout | undefined;
  lockInterval: NodeJS.Timeout | undefined;
  thermoInterval: NodeJS.Timeout | undefined;

  baseUrl: string;
  baseHeaders: { Authorization: string };

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);
    this.baseUrl = 'http://' + config.ip + '/api/';
    this.baseHeaders = { Authorization: 'Bearer ' + config.accessToken };
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    // REQUIRED CONFIGS: ip, accessToken
    if (!this.config.ip) throw new Error('ip address in config required');
    if (!this.config.accessToken) throw new Error('accessToken in config required');

    // receive all devices from the wifi-device
    const data = (await (await fetch(this.baseUrl + '/devices', { headers: this.baseHeaders })).json()) as { status: string; data: Array<DataDeviceBasicPropertiesItemWithId> };
    if (data.status === 'success') {
      const devicesList = data.data;
      for (const device of devicesList) {
        this.createFellerDevice(device);
      }
    }

    //EXAMPLECODE

    // Create a switch device
    this.switch = new MatterbridgeDevice(onOffSwitch);
    this.switch.createDefaultIdentifyClusterServer();
    this.switch.createDefaultGroupsClusterServer();
    this.switch.createDefaultScenesClusterServer();
    this.switch.createDefaultBridgedDeviceBasicInformationClusterServer('Bridged device 3', '0x23452164', 0xfff1, 'Luligu', 'Dynamic device 3');
    this.switch.createDefaultPowerSourceRechargeableBatteryClusterServer(70);
    this.switch.createDefaultOnOffClusterServer();
    await this.registerDevice(this.switch);

    this.switch.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.info(`Command identify called identifyTime:${identifyTime}`);
    });
    this.switch.addCommandHandler('on', async () => {
      this.switch?.getClusterServer(OnOffCluster)?.setOnOffAttribute(true);
      this.log.info('Command on called');
    });
    this.switch.addCommandHandler('off', async () => {
      this.switch?.getClusterServer(OnOffCluster)?.setOnOffAttribute(false);
      this.log.info('Command off called');
    });

    // Create a light device
    this.light = new MatterbridgeDevice(DeviceTypes.ON_OFF_LIGHT);
    this.light.createDefaultIdentifyClusterServer();
    this.light.createDefaultGroupsClusterServer();
    this.light.createDefaultScenesClusterServer();
    this.light.createDefaultBridgedDeviceBasicInformationClusterServer('Bridged device 2', '0x23480564', 0xfff1, 'Luligu', 'Dynamic device 2');
    this.light.createDefaultPowerSourceReplaceableBatteryClusterServer(70);
    this.light.createDefaultOnOffClusterServer();
    this.light.createDefaultLevelControlClusterServer();
    this.light.createDefaultColorControlClusterServer();
    await this.registerDevice(this.light);

    this.light.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.info(`Command identify called identifyTime:${identifyTime}`);
    });
    this.light.addCommandHandler('on', async () => {
      this.light?.getClusterServer(OnOffCluster)?.setOnOffAttribute(true);
      this.log.info('Command on called');
    });
    this.light.addCommandHandler('off', async () => {
      this.light?.getClusterServer(OnOffCluster)?.setOnOffAttribute(false);
      this.log.info('Command off called');
    });
    this.light.addCommandHandler('moveToLevel', async ({ request: { level }, attributes: { currentLevel } }) => {
      this.light?.getClusterServer(LevelControlCluster)?.setCurrentLevelAttribute(level);
      this.log.debug(`Command moveToLevel called request: ${level} attributes: ${currentLevel?.getLocal()}`);
    });
    this.light.addCommandHandler('moveToLevelWithOnOff', async ({ request: { level }, attributes: { currentLevel } }) => {
      this.light?.getClusterServer(LevelControlCluster)?.setCurrentLevelAttribute(level);
      this.log.debug(`Command moveToLevelWithOnOff called request: ${level} attributes: ${currentLevel?.getLocal()}`);
    });
    this.light.addCommandHandler('moveToHueAndSaturation', async ({ request: { hue, saturation }, attributes: { currentHue, currentSaturation } }) => {
      this.light?.getClusterServer(ColorControlCluster.with(ColorControl.Feature.HueSaturation))?.setCurrentHueAttribute(hue);
      this.light?.getClusterServer(ColorControlCluster.with(ColorControl.Feature.HueSaturation))?.setCurrentSaturationAttribute(saturation);
      this.log.debug(`Command moveToHueAndSaturation called request: hue ${hue} saturation ${saturation} attributes: hue ${currentHue?.getLocal()} saturation ${currentSaturation?.getLocal()}`);
    });
    this.light.addCommandHandler('moveToColorTemperature', async ({ request, attributes }) => {
      this.light?.getClusterServer(ColorControl.Complete)?.setColorTemperatureMiredsAttribute(request.colorTemperatureMireds);
      this.log.debug(`Command moveToColorTemperature called request: ${request.colorTemperatureMireds} attributes: ${attributes.colorTemperatureMireds?.getLocal()}`);
    });

    // Create a window covering device
    this.cover = new MatterbridgeDevice(DeviceTypes.WINDOW_COVERING);
    this.cover.createDefaultIdentifyClusterServer();
    this.cover.createDefaultGroupsClusterServer();
    this.cover.createDefaultScenesClusterServer();
    this.cover.createDefaultBridgedDeviceBasicInformationClusterServer('Bridged device 1', '0x01020564', 0xfff1, 'Luligu', 'Dynamic device 1');
    this.cover.createDefaultPowerSourceRechargeableBatteryClusterServer(86);
    this.cover.createDefaultWindowCoveringClusterServer();
    await this.registerDevice(this.cover);

    this.cover.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.info(`Command identify called identifyTime:${identifyTime}`);
    });

    this.cover.addCommandHandler('stopMotion', async ({ attributes: { currentPositionLiftPercent100ths, targetPositionLiftPercent100ths, operationalStatus } }) => {
      const position = currentPositionLiftPercent100ths?.getLocal();
      if (position !== null && position !== undefined) targetPositionLiftPercent100ths?.setLocal(position);
      operationalStatus.setLocal({
        global: WindowCovering.MovementStatus.Stopped,
        lift: WindowCovering.MovementStatus.Stopped,
        tilt: WindowCovering.MovementStatus.Stopped,
      });
      this.log.debug(`Command stopMotion called. Attributes: currentPositionLiftPercent100ths: ${currentPositionLiftPercent100ths?.getLocal()}`);
      this.log.debug(`Command stopMotion called. Attributes: targetPositionLiftPercent100ths: ${targetPositionLiftPercent100ths?.getLocal()}`);
      this.log.debug(`Command stopMotion called. Attributes: operationalStatus: ${operationalStatus?.getLocal().lift}`);
    });

    this.cover.addCommandHandler(
      'goToLiftPercentage',
      async ({ request: { liftPercent100thsValue }, attributes: { currentPositionLiftPercent100ths, targetPositionLiftPercent100ths, operationalStatus } }) => {
        currentPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        targetPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        operationalStatus.setLocal({
          global: WindowCovering.MovementStatus.Stopped,
          lift: WindowCovering.MovementStatus.Stopped,
          tilt: WindowCovering.MovementStatus.Stopped,
        });
        this.log.info(`Command goToLiftPercentage called. Request: liftPercent100thsValue: ${liftPercent100thsValue} `);
        this.log.debug(`Command goToLiftPercentage called. Attributes: currentPositionLiftPercent100ths: ${currentPositionLiftPercent100ths?.getLocal()}`);
        this.log.debug(`Command goToLiftPercentage called. Attributes: targetPositionLiftPercent100ths: ${targetPositionLiftPercent100ths?.getLocal()}`);
        this.log.debug(`Command goToLiftPercentage called. Attributes: operationalStatus: ${operationalStatus?.getLocal().lift}`);
      },
    );
  }

  async createFellerDevice(deviceBasicProperties: DataDeviceBasicPropertiesItemWithId) {
    this.log.debug('creating device ', deviceBasicProperties);

    const deviceMap = new Map([
      ['onoff', DeviceTypes.onOffSwitch],
      ['dim', DeviceTypes.onOffSwitch],
      ['motor', DeviceTypes.cover],
      ['dali', DeviceTypes.onOffSwitch],
    ]);

    // get the detailed infos of the device since there are no outputs in the baseinfos
    const deviceInfosResponse = (await (await fetch(this.baseUrl + 'devices/' + deviceBasicProperties.id, { headers: this.baseHeaders })).json()) as {
      status: string;
      data: DataDeviceAllPropertiesItem;
    };

    // iterate over the outputs of this device and get the load info
    for (const { output, index } of deviceInfosResponse.data.outputs.map((output, index) => ({ index, output }))) {
      const loadInfo = (await (await fetch(this.baseUrl + 'loads/' + output.load, { headers: this.baseHeaders })).json()) as DataLoadItemWithId;
      const deviceTypeDefinition = deviceMap.get(loadInfo.type);
      if (deviceTypeDefinition === undefined) {
        this.log.warn('device type ', loadInfo.type, ' not supported');
        continue;
      }

      const deviceName = loadInfo.name || deviceInfosResponse.data.c.comm_name || deviceInfosResponse.data.a.comm_name;
      const vendorId = 0xfff1;
      const vendorName = 'Feller AG';
      const serialNumber = (deviceInfosResponse.data.c.serial_nr || deviceInfosResponse.data.a.serial_nr) + '_' + index;
      const productName = deviceInfosResponse.data.c.comm_name || deviceInfosResponse.data.a.comm_name;
      const softwareVersion = Number(deviceInfosResponse.data.c.fw_id || deviceInfosResponse.data.a.fw_id);
      const softwareVersionString = deviceInfosResponse.data.c.fw_version || deviceInfosResponse.data.a.fw_revision;
      const hardwareVersion = Number(deviceInfosResponse.data.c.hw_id || deviceInfosResponse.data.a.hw_id);
      const hardwareVersionString = undefined;

      const device = new MatterbridgeDevice(deviceTypeDefinition);
      device.createDefaultIdentifyClusterServer();
      device.createDefaultGroupsClusterServer();
      device.createDefaultScenesClusterServer();
      device.createDefaultBridgedDeviceBasicInformationClusterServer(
        deviceName,
        serialNumber,
        vendorId,
        vendorName,
        productName,
        softwareVersion,
        softwareVersionString,
        hardwareVersion,
        hardwareVersionString,
      );

      device.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
        this.log.info(`Command identify called identifyTime:${identifyTime}`);
        // reflect the identify command to the device
        fetch(this.baseUrl + 'load/' + loadInfo.id + '/ping', {
          method: 'put',
          body: JSON.stringify({ time_ms: identifyTime, blink_patter: 'ramp', color: '#505050' }),
          headers: this.baseHeaders,
        });
      });

      device.createDefaultPowerSourceWiredClusterServer();

      if ((loadInfo.device === 'onoff' || loadInfo.device === 'dim' || loadInfo.device === 'dali') && isOnOffState(loadInfo.state)) {
        device.createDefaultOnOffClusterServer(loadInfo.state.bri !== 0);
        device.addCommandHandler('on', async () => {
          fetch(this.baseUrl + 'load/' + loadInfo.id, { method: 'post', headers: this.baseHeaders })
            .then((response) => response.json() as Promise<{ status: string; data: DataLoadItemWithId }>)
            .then((json) => {
              if (json.status === 'success') {
                const currentLoadInfo = json.data;
                if (isOnOffState(currentLoadInfo.state)) {
                  device.getClusterServer(OnOffCluster)?.setOnOffAttribute(currentLoadInfo.state.bri !== 0);
                }
              }
            });
        });
        device.addCommandHandler('off', async () => {
          fetch(this.baseUrl + 'load/' + loadInfo.id, { method: 'post', headers: this.baseHeaders })
            .then((response) => response.json() as Promise<{ status: string; data: DataLoadItemWithId }>)
            .then((json) => {
              if (json.status === 'success') {
                const currentLoadInfo = json.data;
                if (isOnOffState(currentLoadInfo.state)) {
                  device.getClusterServer(OnOffCluster)?.setOnOffAttribute(currentLoadInfo.state.bri === 0);
                }
              }
            });
        });

        if (loadInfo.device === 'dim' || loadInfo.device === 'dali') {
          device.createDefaultLevelControlClusterServer();
          device.addCommandHandler('moveToLevel', async ({ request: { level }, attributes: { currentLevel } }) => {
            this.log.debug(loadInfo.id + ' moveToLevel ' + level + ' from current level ' + currentLevel);
            fetch(this.baseUrl + 'load/' + loadInfo.id, {
              method: 'post',
              headers: this.baseHeaders,
              body: JSON.stringify({
                bri: level,
              }),
            })
              .then((response) => response.json() as Promise<{ status: string; data: { bri: number } }>)
              .then((json) => {
                const bri = json.data.bri;
                device.getClusterServer(LevelControlCluster)?.setCurrentLevelAttribute(bri);
              });
          });
          device.addCommandHandler('moveToLevelWithOnOff', async ({ request: { level }, attributes: { currentLevel } }) => {
            this.log.debug(loadInfo.id + ' moveToLevelWithOnOff ' + level + ' from current level ' + currentLevel);
            fetch(this.baseUrl + 'load/' + loadInfo.id, {
              method: 'post',
              headers: this.baseHeaders,
              body: JSON.stringify({
                bri: level,
              }),
            })
              .then((response) => response.json() as Promise<{ status: string; data: { bri: number } }>)
              .then((json) => {
                const bri = json.data.bri;
                device.getClusterServer(LevelControlCluster)?.setCurrentLevelAttribute(bri);
              });
          });
          if (loadInfo.device === 'dali') {
            device.createDefaultColorControlClusterServer();
            device.addCommandHandler('moveToHueAndSaturation', async ({ request: { hue, saturation }, attributes: { currentHue, currentSaturation } }) => {
              this.light?.getClusterServer(ColorControlCluster.with(ColorControl.Feature.HueSaturation))?.setCurrentHueAttribute(hue);
              this.light?.getClusterServer(ColorControlCluster.with(ColorControl.Feature.HueSaturation))?.setCurrentSaturationAttribute(saturation);
              this.log.debug(
                `Command moveToHueAndSaturation called request: hue ${hue} saturation ${saturation} attributes: hue ${currentHue?.getLocal()} saturation ${currentSaturation?.getLocal()}`,
              );
            });
            device.addCommandHandler('moveToColorTemperature', async ({ request, attributes }) => {
              this.light?.getClusterServer(ColorControl.Complete)?.setColorTemperatureMiredsAttribute(request.colorTemperatureMireds);
              this.log.debug(`Command moveToColorTemperature called request: ${request.colorTemperatureMireds} attributes: ${attributes.colorTemperatureMireds?.getLocal()}`);
            });
          }
        }
      }
      this.matterbridge.addBridgedDevice(this.name, device);
    }
  }

  override async onConfigure() {
    this.log.info('onConfigure called');

    // Set switch to off
    this.switch?.getClusterServer(OnOffCluster)?.setOnOffAttribute(false);
    this.log.info('Set switch initial onOff to false');

    this.switchInterval = setInterval(
      () => {
        if (!this.switch) return;
        const status = this.switch.getClusterServer(OnOffCluster)?.getOnOffAttribute();
        this.switch.getClusterServer(OnOffCluster)?.setOnOffAttribute(!status);
        this.log.info(`Set switch onOff to ${status}`);
      },
      60 * 1000 + 100,
    );

    // Set light to off, level to 0 and hue to 0 and saturation to 50% (pink color)
    this.light?.getClusterServer(OnOffCluster)?.setOnOffAttribute(false);
    this.light?.getClusterServer(LevelControlCluster)?.setCurrentLevelAttribute(0);
    this.light?.getClusterServer(ColorControlCluster.with(ColorControl.Feature.HueSaturation))?.setCurrentHueAttribute(0);
    this.light?.getClusterServer(ColorControlCluster.with(ColorControl.Feature.HueSaturation))?.setCurrentSaturationAttribute(128);
    this.log.info('Set light initial onOff to false, currentLevel to 0, hue to 0 and saturation to 50%.');

    this.lightInterval = setInterval(
      () => {
        if (!this.light) return;
        const lightLevelControlCluster = this.light.getClusterServer(LevelControlCluster);
        if (lightLevelControlCluster) {
          let level = lightLevelControlCluster.getCurrentLevelAttribute();
          if (level === null) return;
          level += 10;
          if (level > 254) {
            level = 0;
            this.light.getClusterServer(OnOffCluster)?.setOnOffAttribute(false);
            this.log.info('Set light onOff to false');
            return;
          } else {
            this.light.getClusterServer(OnOffCluster)?.setOnOffAttribute(true);
            this.log.info('Set light onOff to true');
          }
          lightLevelControlCluster.setCurrentLevelAttribute(level);
          this.log.info(`Set light currentLevel to ${level}`);
        }
      },
      60 * 1000 + 200,
    );

    // Set outlet to off
    this.outlet?.getClusterServer(OnOffCluster)?.setOnOffAttribute(false);
    this.log.info('Set outlet initial onOff to false');

    this.outletInterval = setInterval(
      () => {
        if (!this.outlet) return;
        const status = this.outlet.getClusterServer(OnOffCluster)?.getOnOffAttribute();
        this.outlet.getClusterServer(OnOffCluster)?.setOnOffAttribute(!status);
        this.log.info(`Set outlet onOff to ${status}`);
      },
      60 * 1000 + 300,
    );

    // Set cover to target = current position and status to stopped (current position is persisted in the cluster)
    this.cover?.setWindowCoveringTargetAsCurrentAndStopped();
    this.log.debug('Set cover initial targetPositionLiftPercent100ths = currentPositionLiftPercent100ths and operationalStatus to Stopped.');

    this.coverInterval = setInterval(
      () => {
        if (!this.cover) return;
        const coverCluster = this.cover.getClusterServer(WindowCoveringCluster.with(WindowCovering.Feature.Lift, WindowCovering.Feature.PositionAwareLift));
        if (coverCluster && coverCluster.getCurrentPositionLiftPercent100thsAttribute) {
          let position = coverCluster.getCurrentPositionLiftPercent100thsAttribute();
          if (position === null) return;
          position = position >= 9000 ? 0 : position + 1000;
          coverCluster.setTargetPositionLiftPercent100thsAttribute(position);
          coverCluster.setCurrentPositionLiftPercent100thsAttribute(position);
          coverCluster.setOperationalStatusAttribute({
            global: WindowCovering.MovementStatus.Stopped,
            lift: WindowCovering.MovementStatus.Stopped,
            tilt: WindowCovering.MovementStatus.Stopped,
          });
          this.log.info(`Set cover positionLiftPercent100ths to ${position}`);
        }
      },
      60 * 1000 + 400,
    );

    // Set lock to Locked
    this.lock?.getClusterServer(DoorLockCluster)?.setLockStateAttribute(DoorLock.LockState.Locked);
    this.log.info('Set lock initial lockState to Locked');

    this.lockInterval = setInterval(
      () => {
        if (!this.lock) return;
        const status = this.lock.getClusterServer(DoorLockCluster)?.getLockStateAttribute();
        this.lock.getClusterServer(DoorLockCluster)?.setLockStateAttribute(status === DoorLock.LockState.Locked ? DoorLock.LockState.Unlocked : DoorLock.LockState.Locked);
        this.log.info(`Set lock lockState to ${status === DoorLock.LockState.Locked ? 'Locked' : 'Unlocked'}`);
      },
      60 * 1000 + 700,
    );

    // Set local to 16°C
    this.thermo?.getClusterServer(ThermostatCluster.with(Thermostat.Feature.Heating, Thermostat.Feature.Cooling, Thermostat.Feature.AutoMode))?.setLocalTemperatureAttribute(1600);
    this.log.info('Set thermo initial localTemeperature to 16°C');

    this.thermoInterval = setInterval(
      () => {
        if (!this.thermo) return;
        const cluster = this.thermo.getClusterServer(ThermostatCluster.with(Thermostat.Feature.Heating, Thermostat.Feature.Cooling, Thermostat.Feature.AutoMode));
        if (!cluster) return;
        let local = cluster.getLocalTemperatureAttribute() ?? 1600;
        local = local >= 2300 ? 1600 : local + 100;
        cluster.setLocalTemperatureAttribute(local);
        this.log.info(`Set thermo localTemperature to ${local / 100}°C`);
      },
      60 * 1000 + 700,
    );
  }

  override async onShutdown(reason?: string) {
    this.log.info('onShutdown called with reason:', reason ?? 'none');
    clearInterval(this.switchInterval);
    clearInterval(this.lightInterval);
    clearInterval(this.outletInterval);
    clearInterval(this.coverInterval);
    clearInterval(this.lockInterval);
    clearInterval(this.thermoInterval);
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }
}
