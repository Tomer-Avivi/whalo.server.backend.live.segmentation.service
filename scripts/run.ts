import { ConfigurationData } from "@whalo/whalo.server.packages.entities/publish/ConfigurationData";
import { ConfigurationModule } from "@whalo/whalo.server.packages.v3.configurationmanager/publish/src/ConfigurationModule";
import { SdkConfigurationData } from "@whalo/whalo.winfra.server.packages.entities";

import { Service } from "../src/service";

/**
 * Main
 * Loads runtime configuration and starts the service.
 * @returns A promise that resolves after the service has started
 */
async function Main() {
  const port = Number(process.env.PORT ?? "80");
  const region = process.env.AWS_REGION ?? "us-east-1";
  const awsAccessKey = process.env.awsAccessKey ?? "";
  const awsSecretKey = process.env.awsSecretKey ?? "";
  const configBucket = process.env.configBucket ?? "";
  const configFilename = process.env.configFilename ?? "";
  const winfraConfigFilename = process.env.winfraConfigFilename ?? "winfraConfig.json";

  const configurationModule = new ConfigurationModule(region, awsAccessKey, awsSecretKey);
  const [configurationData, winfraConfigurationData] = await Promise.all([
    configurationModule.Get<ConfigurationData>(configBucket, configFilename),
    configurationModule.Get<SdkConfigurationData>(configBucket, winfraConfigFilename)
  ]);

  if (configurationData === null) {
    throw new Error("ConfigurationData could not be loaded");
  }

  if (winfraConfigurationData === null) {
    throw new Error("SdkConfigurationData could not be loaded");
  }

  const service = new Service(
    port,
    region,
    awsAccessKey,
    awsSecretKey,
    configurationData,
    winfraConfigurationData
  );

  await service.RegisterRoutes();

  const stopService = async () => {
    await service.Stop();
    process.exit(0);
  };

  process.once("SIGINT", stopService);
  process.once("SIGTERM", stopService);

  await service.Start();
}

Main().catch((error) => {
  console.error("fatal crash", error);
  process.exit(1);
});
