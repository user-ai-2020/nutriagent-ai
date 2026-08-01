import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysBetween, localDateKey } from "./dashboard";

describe("Dashboard date helpers", () => {
  describe("daysBetween across DST boundary", () => {
    it("should return exactly 7 days when crossing a spring forward DST boundary", () => {
      // In America/New_York, 2024-03-10 is the spring forward date (loses an hour)
      const start = new Date("2024-03-09T00:00:00-05:00");
      const end = new Date("2024-03-16T00:00:00-04:00");
      
      const diff = daysBetween(start, end);
      assert.equal(diff, 7);
      
      // Verify our loop produces exactly 8 keys (0 to 7)
      const keys = [];
      for (let i = 0; i <= diff; i++) {
        const currentDay = new Date(start);
        currentDay.setDate(start.getDate() + i);
        keys.push(localDateKey(currentDay));
      }
      
      assert.equal(keys.length, 8);
      assert.equal(keys[0], "2024-03-09");
      assert.equal(keys[7], "2024-03-16");
    });
    
    it("should return exactly 7 days when crossing a fall back DST boundary", () => {
      // In America/New_York, 2024-11-03 is the fall back date (gains an hour)
      const start = new Date("2024-11-01T00:00:00-04:00");
      const end = new Date("2024-11-08T00:00:00-05:00");
      
      const diff = daysBetween(start, end);
      assert.equal(diff, 7);
      
      const keys = [];
      for (let i = 0; i <= diff; i++) {
        const currentDay = new Date(start);
        currentDay.setDate(start.getDate() + i);
        keys.push(localDateKey(currentDay));
      }
      
      assert.equal(keys.length, 8);
      assert.equal(keys[0], "2024-11-01");
      assert.equal(keys[7], "2024-11-08");
    });
  });
});
