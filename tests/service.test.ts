import { Service } from "../src/service";

describe("Service", () => {
  it("uses the live segmentation service name", () => {
    expect(Service.SERVICE_NAME).toBe("whalo.server.backend.live.segmentation.service");
  });
});
