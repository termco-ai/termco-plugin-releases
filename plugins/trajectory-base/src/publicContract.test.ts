import { describe, expect, it } from "vitest";
import {
  TRAJECTORY_NAVIGATION_SERVICE,
  type TrajectoryNavigationCapability,
} from "./index";

describe("trajectory navigation contract", () => {
  it("opens current-format sessions and exact semantic locations", () => {
    expect(TRAJECTORY_NAVIGATION_SERVICE).toBe("trajectory.navigation");
    if (false) {
      const navigation = null as unknown as TrajectoryNavigationCapability;
      navigation.openSession("session" as never);
      navigation.openSession("session" as never, {
        eventSeq: 1 as never,
        recordId: "session:event:1",
      });
      navigation.openSearch();
      navigation.openSessionList();
    }
  });
});
