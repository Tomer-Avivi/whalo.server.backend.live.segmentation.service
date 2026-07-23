import { LiveSegmentationBL } from "../Bl/LiveSegmentationBL";

export class LiveSegmentationController {
  private readonly _liveSegmentationBL: LiveSegmentationBL;

  public constructor(liveSegmentationBL: LiveSegmentationBL) {
    this._liveSegmentationBL = liveSegmentationBL;
  }

  /**
   * UpdatePlayerSegments
   * Validates and applies a player's live-segmentation changes.
   * @param internalPlayerId - the player whose segments changed
   * @param assignedSegments - segments assigned to the player
   * @param removedSegments - segments removed from the player
   * @param configurationUpdates - configurations affected by the segment changes
   * @returns whether the player's configuration session was invalidated
   */
  public async CreateTicket(
    internalPlayerId: string,
    assignedSegments: string[],
    removedSegments: string[],
    propIds: string[]
  ) {
    return await this._liveSegmentationBL.CreateTicket(internalPlayerId, assignedSegments, removedSegments, propIds);
  }

  public async ApplyTicket(internalPlayerId: string, ticketId: string) {
    return await this._liveSegmentationBL.ApplyTicket(internalPlayerId, ticketId);
  }
}
