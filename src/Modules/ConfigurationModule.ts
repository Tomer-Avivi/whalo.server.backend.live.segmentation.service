import { IConfigurationCustomSdk } from "@whalo/whalo.winfra.server.packages.sdk";

export class ConfigurationModule {
  constructor(private readonly _configurationSDK: IConfigurationCustomSdk) {}

  public async DeletePropIds(internalPlayerId: string, propIds: string[]) {
    const result = await this._configurationSDK.DeletePropIds(internalPlayerId, propIds);
    return result;
  }
}
