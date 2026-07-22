import express, { NextFunction, Request, Response } from "express";
import { Server } from "http";
import { ICacheControll } from "@whalo/whalo.server.packages.dal.redis/publish/src/ICacheControll";
import { LiveSegmentTicketRepository } from "@whalo/whalo.server.packages.dal.redis/publish/src/LiveSegmentTicketRepository";
import { GenericMessageWriterRepository } from "@whalo/whalo.server.packages.dal.v3.sqs/publish/src/GenericMessageWriterRepository";
import { GenericMessageWriterRepositoryBase } from "@whalo/whalo.server.packages.dal.v3.sqs/publish/src/GenericMessageWriterRepositoryBase";
import { ConfigurationData } from "@whalo/whalo.server.packages.entities/publish/ConfigurationData";
import { ResponseHelper } from "@whalo/whalo.server.packages.entities/publish/Response/ResponseHelper";
import { MonitorMiddleWare } from "@whalo/whalo.server.packages.module.apimonitor/publish/MonitorMiddleWare";
import { Logger } from "@whalo/whalo.server.packages.module.logger/publish/src/Logger";
import { ApiMetricManager } from "@whalo/whalo.server.packages.module.v3.monitoring/publish/src/ApiMetricManager";
import { SdkConfigurationData } from "@whalo/whalo.winfra.server.packages.entities";
import { ConfigurationClientFactor, IConfigurationCustomSdk } from "@whalo/whalo.winfra.server.packages.sdk";

import { LiveSegmentationBL } from "./BusinessLogic/LiveSegmentationBL";
import { LiveSegmentationController } from "./Controllers/LiveSegmentationController";
import { ConfigurationModule } from "./Modules/ConfigurationModule";

export class Service {
  public static readonly SERVICE_NAME = "whalo.server.backend.live.segmentation.service";

  private readonly _app: express.Application;
  private readonly _port: number;
  private readonly _logger: Logger;
  private readonly _metricManager: ApiMetricManager;
  private readonly _configurationSDK: IConfigurationCustomSdk;
  private readonly _liveSegmentationController: LiveSegmentationController;
  private readonly _sqsQueues: GenericMessageWriterRepositoryBase[] = [];
  private readonly _caches: ICacheControll[] = [];

  private _server: Server | undefined;

  public constructor(
    port: number,
    region: string,
    accessKey: string,
    secretKey: string,
    configurationData: ConfigurationData,
    winfraConfigurationData: SdkConfigurationData
  ) {
    this._port = 83;
    this._logger = new Logger(configurationData.logLevel, configurationData.environment);

    const sqsMetricQueue = new GenericMessageWriterRepository(
      region,
      accessKey,
      secretKey,
      configurationData.sqs.Metric.QueueName
    );
    this._sqsQueues.push(sqsMetricQueue);

    this._metricManager = new ApiMetricManager(
      configurationData.environment,
      "nopodid",
      Service.SERVICE_NAME,
      30000,
      sqsMetricQueue
    );

    this._configurationSDK = ConfigurationClientFactor.Create(
      winfraConfigurationData.gameId,
      Service.SERVICE_NAME,
      configurationData.sdkProjects,
      winfraConfigurationData,
      this._logger as any,
      this._metricManager
    );

    const MessagingQueue = new GenericMessageWriterRepository(
      region,
      accessKey,
      secretKey,
      configurationData.sqs.Messaging.QueueName
    );
    this._sqsQueues.push(MessagingQueue);

    const configurationModule = new ConfigurationModule(this._configurationSDK);

    const liveSegmentTicketRepository = new LiveSegmentTicketRepository(configurationData);
    this._caches.push(liveSegmentTicketRepository);

    const liveSegmentationBL = new LiveSegmentationBL(
      this._logger,
      MessagingQueue,
      liveSegmentTicketRepository,
      configurationModule
    );
    this._liveSegmentationController = new LiveSegmentationController(liveSegmentationBL);

    this._app = express();
  }

  /**
   * RegisterRoutes
   * Registers JSON parsing, monitoring, health, and error middleware.
   * @returns A promise that resolves when route registration is complete
   */
  public async RegisterRoutes() {
    this._app.use(express.json());
    this._app.use(MonitorMiddleWare(this._logger, this._metricManager));

    this._app.post("/ping", async (_request, response, next) => {
      (response as any).endPointName = "ping";

      try {
        response.send(ResponseHelper.SuccessResponse("pong"));
      } catch (error) {
        next(error);
      }
    });

    this._app.post("/v1/players/:internalPlayerId/ticket", async (request, response, next) => {
      (response as any).endPointName = "UpdatePlayerSegments";
      try {
        const { assignedSegments, removedSegments, propIds } = request.body;
        const result = await this._liveSegmentationController.CreateTicket(
          request.params.internalPlayerId,
          assignedSegments,
          removedSegments,
          propIds
        );
        response.send(ResponseHelper.SuccessResponse(result));
      } catch (error) {
        next(error);
      }
    });

    this._app.post("/v1/apply/ticket", async (request, response, next) => {
      (response as any).endPointName = "UpdatePlayerSegments";
      try {
        const { ticketId, internalPlayerId } = request.body;
        const result = await this._liveSegmentationController.ApplyTicket(internalPlayerId, ticketId);
        response.send(ResponseHelper.SuccessResponse(result));
      } catch (error) {
        next(error);
      }
    });

    this._app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
      const endPointName = (response as any).endPointName;
      this._logger.Error(
        () =>
          `Service.Error status=error; endpoint=${endPointName}; body=${JSON.stringify(request.body)}; ` +
          `error=${error.message}; stack=${error.stack};`
      );
      response.status(200).send(ResponseHelper.GeneralError(error.message));
    });
  }

  /**
   * Start
   * Starts infrastructure clients and the HTTP listener.
   * @returns A promise that resolves when startup is complete
   */
  public async Start() {
    await Promise.all(this._sqsQueues.map((queue) => queue.Init()));
    await Promise.all(this._caches.map((cache) => cache.StartClient()));
    await this._configurationSDK.StartSDK();

    this._server = this._app.listen(this._port, () => {
      this._logger.Info(() => `Service.Start status=done; port=${this._port};`);
    });
  }

  /**
   * Stop
   * Stops the HTTP listener and all infrastructure clients.
   * @returns A promise that resolves when shutdown is complete
   */
  public async Stop() {
    this._logger.Info(() => "Service.Stop status=start;");

    await Promise.all([this._configurationSDK.CloseSDK(), ...this._caches.map((cache) => cache.CloseClient())]);
    this._metricManager.Close();

    if (this._server !== undefined) {
      this._server.close();
    }

    this._logger.Info(() => "Service.Stop status=done;");
  }
}
