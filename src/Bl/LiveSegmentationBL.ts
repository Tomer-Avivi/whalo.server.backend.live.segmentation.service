import { IGenericMessageWriterRepository } from "@whalo/whalo.server.packages.dal.interfaces/publish/IGenericMessageWriterRepository";
import { LiveSegmentTicketRepository } from "@whalo/whalo.server.packages.dal.redis/publish/src/LiveSegmentTicketRepository";
import { Logger } from "@whalo/whalo.server.packages.module.logger/publish/src/Logger";
import { IConfigurationCustomSdk } from "@whalo/whalo.winfra.server.packages.sdk";
import { ConfigurationModule } from "../Modules/ConfigurationModule";

export class LiveSegmentationBL {
  private readonly _logger: Logger;
  private readonly _messagingRepo: IGenericMessageWriterRepository;
  private readonly _liveSegmentTicketRepo: LiveSegmentTicketRepository;
  private readonly _configurationModule: ConfigurationModule;

  public constructor(
    logger: Logger,
    piggyMessagingRepo: IGenericMessageWriterRepository,
    liveSegmentTicketRepo: LiveSegmentTicketRepository,
    configurationModule: ConfigurationModule
  ) {
    this._logger = logger;
    this._messagingRepo = piggyMessagingRepo;
    this._liveSegmentTicketRepo = liveSegmentTicketRepo;
    this._configurationModule = configurationModule;
  }

  /**
   * CreateTicket
   * Persists a live segment ticket in Redis and pushes it onto the piggy queue.
   * @param internalPlayerId - the player whose segments changed
   * @param assignedSegments - segments assigned to the player
   * @param removedSegments - segments removed from the player
   * @param propIds - configurations affected by the segment changes
   * @returns whether the ticket was created and queued
   */
  public async CreateTicket(
    internalPlayerId: string,
    assignedSegments: string[],
    removedSegments: string[],
    propIds: string[]
  ) {
    this._logger.Debug(
      () =>
        `LiveSegmentationBL.CreateTicket status=start; internalPlayerId=${internalPlayerId}; assignedSegments=${assignedSegments.length}; removedSegments=${removedSegments.length}; configurationUpdates=${propIds.length};`
    );

    // ticketId is guid
    const { ticketId, ticket } = await this._liveSegmentTicketRepo.CreateTicket(
      internalPlayerId,
      assignedSegments,
      removedSegments,
      propIds
    );
    const result = await this.SendInternalMessage(internalPlayerId, ticketId, ticket);

    this._logger.Debug(
      () => `LiveSegmentationBL.CreateTicket status=done; internalPlayerId=${internalPlayerId}; result=${result};`
    );
    return result;
  }

  public async ApplyTicket(internalPlayerId: string, ticketId: string) {
    this._logger.Debug(() => `LiveSegmentationBL.ProcessTicket status=start; ticketId=${ticketId};`);

    // const ticket = await this.RemoveTicket(internalPlayerId, ticketId);
    const ticket = await this._liveSegmentTicketRepo.GetTicket(internalPlayerId, ticketId);

    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found for player ${internalPlayerId}`);
    }
    const deletePropIds = await this._configurationModule.DeletePropIds(internalPlayerId, ticket.propIds);

    this._logger.Debug(() => `LiveSegmentationBL.ProcessTicket status=done; ticketId=${ticketId};`);
    return { ...ticket, propIds: deletePropIds };
  }

  /**
   * RemoveTicket
   * Removes a live segment ticket from Redis, logging and swallowing any failure.
   * @param internalPlayerId - the player whose ticket is being removed
   * @param ticketId - the ticket to remove
   * @returns the removed ticket, or null when it could not be removed
   */
  private async RemoveTicket(internalPlayerId: string, ticketId: string) {
    try {
      const ticket = await this._liveSegmentTicketRepo.RemoveTicket(internalPlayerId, ticketId);
      delete (ticket as any).internalPlayerId;
      return ticket;
    } catch (error) {
      this._logger.Error(
        () =>
          `LiveSegmentationBL.RemoveTicket status=error; internalPlayerId=${internalPlayerId}; ticketId=${ticketId}; error=${error};`
      );
      return null;
    }
  }

  /**
   * SendPiggyMessage
   * Fire-and-forget: pushes a segmentation ticket onto the piggy SQS queue.
   * @param internalPlayerId - the player whose segments changed
   * @param ticketId - the ticket identifying this segment change
   * @param propIds - configurations affected by the segment changes
   * @param assignedSegments - segments assigned to the player
   * @param removedSegments - segments removed from the player
   * @returns whether the message was written to the queue
   */
  private async SendInternalMessage(
    internalPlayerId: string,
    ticketId: string,
    ticket: {
      internalPlayerId: string;
      ticketId: string;
      assignedSegments: string[];
      removedSegments: string[];
      propIds: string[];
    }
  ) {
    const DateTs = Date.now();
    const body = {
      InternalPlayerId: internalPlayerId,
      MessageType: "LiveSegmentation",
      From: {
        TicketId: ticketId,
        PropIds: ticket.propIds,
        AssignedSegments: ticket.assignedSegments,
        RemovedSegments: ticket.removedSegments,
        DateTs: DateTs,
      },
    };

    let result = true;
    try {
      await this._messagingRepo.WriteMessage(body);
    } catch (err: any) {
      result = false;
      this._logger.Error(
        () => `LiveSegmentationBL.SendPiggyMessage status=error; ticketId=${ticketId}; err=${err.stack};`
      );
    }

    return result;
  }
}
