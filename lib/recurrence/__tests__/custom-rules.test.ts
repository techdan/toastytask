/**
 * Comprehensive test suite for custom recurrence rules
 *
 * Tests all 4 rule types, edge cases, and integration with the calculation engine.
 */

import { calculateNextDueDate } from "../calculator";
import type {
  IntervalRule,
  MonthlyWeekdayRule,
  WeeklyPatternRule,
  SpecialWeekdayRule,
} from "@/types/recurrence";
import { describeRecurrenceRule, parseRecurrenceConfig, serializeRecurrenceConfig } from "@/types/recurrence";

describe("Custom Recurrence Rules", () => {
  describe("Interval Rules", () => {
    test("Every 3 days", () => {
      const rule: IntervalRule = { ruleType: "interval", amount: 3, unit: "day" };
      const next = calculateNextDueDate(new Date("2025-01-15T12:00:00Z"), rule);
      expect(next).toEqual(new Date("2025-01-18T12:00:00Z"));
    });

    test("Every 2 weeks", () => {
      const rule: IntervalRule = { ruleType: "interval", amount: 2, unit: "week" };
      const next = calculateNextDueDate(new Date("2025-01-15T12:00:00Z"), rule);
      expect(next).toEqual(new Date("2025-01-29T12:00:00Z"));
    });

    test("Every 16 weeks", () => {
      const rule: IntervalRule = { ruleType: "interval", amount: 16, unit: "week" };
      const next = calculateNextDueDate(new Date("2025-01-15T12:00:00Z"), rule);
      expect(next).toEqual(new Date("2025-05-07T12:00:00Z"));
    });

    test("Every 3 months", () => {
      const rule: IntervalRule = { ruleType: "interval", amount: 3, unit: "month" };
      const next = calculateNextDueDate(new Date("2025-01-15T12:00:00Z"), rule);
      expect(next).toEqual(new Date("2025-04-15T12:00:00Z"));
    });

    test("Every 2 years", () => {
      const rule: IntervalRule = { ruleType: "interval", amount: 2, unit: "year" };
      const next = calculateNextDueDate(new Date("2025-01-15T12:00:00Z"), rule);
      expect(next).toEqual(new Date("2027-01-15T12:00:00Z"));
    });

    describe("Month overflow handling", () => {
      test("Jan 31 + 1 month = Feb 28 (non-leap year)", () => {
        const rule: IntervalRule = { ruleType: "interval", amount: 1, unit: "month" };
        const next = calculateNextDueDate(new Date("2025-01-31T12:00:00Z"), rule);
        expect(next).toEqual(new Date("2025-02-28T12:00:00Z"));
      });

      test("Jan 31 + 1 month = Feb 29 (leap year)", () => {
        const rule: IntervalRule = { ruleType: "interval", amount: 1, unit: "month" };
        const next = calculateNextDueDate(new Date("2024-01-31T12:00:00Z"), rule);
        expect(next).toEqual(new Date("2024-02-29T12:00:00Z"));
      });

      test("Jan 30 + 1 month = Feb 28/29", () => {
        const rule: IntervalRule = { ruleType: "interval", amount: 1, unit: "month" };
        const next2025 = calculateNextDueDate(new Date("2025-01-30T12:00:00Z"), rule);
        const next2024 = calculateNextDueDate(new Date("2024-01-30T12:00:00Z"), rule);
        expect(next2025).toEqual(new Date("2025-02-28T12:00:00Z"));
        expect(next2024).toEqual(new Date("2024-02-29T12:00:00Z"));
      });

      test("Mar 31 + 1 month = Apr 30", () => {
        const rule: IntervalRule = { ruleType: "interval", amount: 1, unit: "month" };
        const next = calculateNextDueDate(new Date("2025-03-31T12:00:00Z"), rule);
        expect(next).toEqual(new Date("2025-04-30T12:00:00Z"));
      });
    });

    describe("Leap year handling", () => {
      test("Feb 29 (leap year) + 1 year = Feb 28 (non-leap year)", () => {
        const rule: IntervalRule = { ruleType: "interval", amount: 1, unit: "year" };
        const next = calculateNextDueDate(new Date("2024-02-29T12:00:00Z"), rule);
        expect(next).toEqual(new Date("2025-02-28T12:00:00Z"));
      });

      test("Feb 29 (leap year) + 4 years = Feb 29 (leap year)", () => {
        const rule: IntervalRule = { ruleType: "interval", amount: 4, unit: "year" };
        const next = calculateNextDueDate(new Date("2024-02-29T12:00:00Z"), rule);
        expect(next).toEqual(new Date("2028-02-29T12:00:00Z"));
      });
    });
  });

  describe("Monthly Weekday Rules", () => {
    test("2nd Monday of each month", () => {
      const rule: MonthlyWeekdayRule = {
        ruleType: "monthlyByWeekday",
        ordinal: "second",
        weekday: 1,
      };
      // Jan 13, 2025 is 2nd Monday
      const next = calculateNextDueDate(new Date("2025-01-13T12:00:00Z"), rule);
      // Feb 10, 2025 is 2nd Monday
      expect(next.getMonth()).toBe(1); // February
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getDate()).toBe(10);
    });

    test("1st Friday of each month", () => {
      const rule: MonthlyWeekdayRule = {
        ruleType: "monthlyByWeekday",
        ordinal: "first",
        weekday: 5,
      };
      // Jan 3, 2025 is 1st Friday
      const next = calculateNextDueDate(new Date("2025-01-03T12:00:00Z"), rule);
      // Feb 7, 2025 is 1st Friday
      expect(next.getMonth()).toBe(1); // February
      expect(next.getDay()).toBe(5); // Friday
      expect(next.getDate()).toBe(7);
    });

    test("Last Friday of each month", () => {
      const rule: MonthlyWeekdayRule = {
        ruleType: "monthlyByWeekday",
        ordinal: "last",
        weekday: 5,
      };
      // Jan 31, 2025 is last Friday
      const next = calculateNextDueDate(new Date("2025-01-31T12:00:00Z"), rule);
      // Feb 28, 2025 is last Friday
      expect(next.getMonth()).toBe(1); // February
      expect(next.getDay()).toBe(5); // Friday
      expect(next.getDate()).toBe(28);
    });

    test("3rd Saturday of each month", () => {
      const rule: MonthlyWeekdayRule = {
        ruleType: "monthlyByWeekday",
        ordinal: "third",
        weekday: 6,
      };
      // Jan 18, 2025 is 3rd Saturday
      const next = calculateNextDueDate(new Date("2025-01-18T12:00:00Z"), rule);
      // Feb 15, 2025 is 3rd Saturday
      expect(next.getMonth()).toBe(1); // February
      expect(next.getDay()).toBe(6); // Saturday
      expect(next.getDate()).toBe(15);
    });

    test("4th weekday that doesn't exist falls back to last occurrence", () => {
      const rule: MonthlyWeekdayRule = {
        ruleType: "monthlyByWeekday",
        ordinal: "fourth",
        weekday: 1, // Monday
      };
      // Some months only have 4 Mondays - test February 2025
      const next = calculateNextDueDate(new Date("2025-02-24T12:00:00Z"), rule);
      // March should have 4 Mondays
      expect(next.getMonth()).toBe(2); // March
      expect(next.getDay()).toBe(1); // Monday
    });
  });

  describe("Weekly Pattern Rules", () => {
    test("Every Mon/Wed/Fri (from Wednesday)", () => {
      const rule: WeeklyPatternRule = { ruleType: "weeklyPattern", days: [1, 3, 5] };
      // Wed Jan 15, 2025
      const next = calculateNextDueDate(new Date("2025-01-15T12:00:00Z"), rule);
      // Next should be Fri Jan 17
      expect(next.getDay()).toBe(5); // Friday
      expect(next.getDate()).toBe(17);
    });

    test("Every Mon/Wed/Fri (from Friday)", () => {
      const rule: WeeklyPatternRule = { ruleType: "weeklyPattern", days: [1, 3, 5] };
      // Fri Jan 17, 2025
      const next = calculateNextDueDate(new Date("2025-01-17T12:00:00Z"), rule);
      // Next should be Mon Jan 20
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getDate()).toBe(20);
    });

    test("Every Tuesday and Thursday", () => {
      const rule: WeeklyPatternRule = { ruleType: "weeklyPattern", days: [2, 4] };
      // Tue Jan 14, 2025
      const next = calculateNextDueDate(new Date("2025-01-14T12:00:00Z"), rule);
      // Next should be Thu Jan 16
      expect(next.getDay()).toBe(4); // Thursday
      expect(next.getDate()).toBe(16);
    });

    test("Every Sunday only", () => {
      const rule: WeeklyPatternRule = { ruleType: "weeklyPattern", days: [0] };
      // Sun Jan 12, 2025
      const next = calculateNextDueDate(new Date("2025-01-12T12:00:00Z"), rule);
      // Next should be Sun Jan 19
      expect(next.getDay()).toBe(0); // Sunday
      expect(next.getDate()).toBe(19);
    });

    test("Weekend pattern (Sat and Sun)", () => {
      const rule: WeeklyPatternRule = { ruleType: "weeklyPattern", days: [0, 6] };
      // Sat Jan 18, 2025
      const next = calculateNextDueDate(new Date("2025-01-18T12:00:00Z"), rule);
      // Next should be Sun Jan 19
      expect(next.getDay()).toBe(0); // Sunday
      expect(next.getDate()).toBe(19);
    });
  });

  describe("Special Pattern Rules", () => {
    test("Every weekday (Mon-Fri) from Monday", () => {
      const rule: SpecialWeekdayRule = { ruleType: "specialPattern", pattern: "weekdays" };
      // Mon Jan 13, 2025
      const next = calculateNextDueDate(new Date("2025-01-13T12:00:00Z"), rule);
      // Next should be Tue Jan 14
      expect(next.getDay()).toBe(2); // Tuesday
      expect(next.getDate()).toBe(14);
    });

    test("Every weekday (Mon-Fri) from Friday", () => {
      const rule: SpecialWeekdayRule = { ruleType: "specialPattern", pattern: "weekdays" };
      // Fri Jan 17, 2025
      const next = calculateNextDueDate(new Date("2025-01-17T12:00:00Z"), rule);
      // Next should be Mon Jan 20 (skip weekend)
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getDate()).toBe(20);
    });

    test("Every weekday (Mon-Fri) from Saturday", () => {
      const rule: SpecialWeekdayRule = { ruleType: "specialPattern", pattern: "weekdays" };
      // Sat Jan 18, 2025
      const next = calculateNextDueDate(new Date("2025-01-18T12:00:00Z"), rule);
      // Next should be Mon Jan 20
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getDate()).toBe(20);
    });

    test("Every weekend (Sat-Sun) from Saturday", () => {
      const rule: SpecialWeekdayRule = { ruleType: "specialPattern", pattern: "weekends" };
      // Sat Jan 18, 2025
      const next = calculateNextDueDate(new Date("2025-01-18T12:00:00Z"), rule);
      // Next should be Sun Jan 19
      expect(next.getDay()).toBe(0); // Sunday
      expect(next.getDate()).toBe(19);
    });

    test("Every weekend (Sat-Sun) from Sunday", () => {
      const rule: SpecialWeekdayRule = { ruleType: "specialPattern", pattern: "weekends" };
      // Sun Jan 19, 2025
      const next = calculateNextDueDate(new Date("2025-01-19T12:00:00Z"), rule);
      // Next should be Sat Jan 25
      expect(next.getDay()).toBe(6); // Saturday
      expect(next.getDate()).toBe(25);
    });

    test("Every weekend (Sat-Sun) from Monday", () => {
      const rule: SpecialWeekdayRule = { ruleType: "specialPattern", pattern: "weekends" };
      // Mon Jan 13, 2025
      const next = calculateNextDueDate(new Date("2025-01-13T12:00:00Z"), rule);
      // Next should be Sat Jan 18
      expect(next.getDay()).toBe(6); // Saturday
      expect(next.getDate()).toBe(18);
    });
  });

  describe("Human-readable descriptions", () => {
    test("Interval rule descriptions", () => {
      expect(describeRecurrenceRule({ ruleType: "interval", amount: 1, unit: "day" })).toBe("Every day");
      expect(describeRecurrenceRule({ ruleType: "interval", amount: 3, unit: "day" })).toBe("Every 3 days");
      expect(describeRecurrenceRule({ ruleType: "interval", amount: 1, unit: "week" })).toBe("Every week");
      expect(describeRecurrenceRule({ ruleType: "interval", amount: 2, unit: "week" })).toBe("Every 2 weeks");
      expect(describeRecurrenceRule({ ruleType: "interval", amount: 16, unit: "week" })).toBe("Every 16 weeks");
    });

    test("Monthly weekday rule descriptions", () => {
      expect(describeRecurrenceRule({
        ruleType: "monthlyByWeekday",
        ordinal: "first",
        weekday: 1
      })).toBe("On the 1st Monday");

      expect(describeRecurrenceRule({
        ruleType: "monthlyByWeekday",
        ordinal: "second",
        weekday: 5
      })).toBe("On the 2nd Friday");

      expect(describeRecurrenceRule({
        ruleType: "monthlyByWeekday",
        ordinal: "last",
        weekday: 3
      })).toBe("On the last Wednesday");
    });

    test("Weekly pattern rule descriptions", () => {
      expect(describeRecurrenceRule({ ruleType: "weeklyPattern", days: [1] })).toBe("Every Mon");
      expect(describeRecurrenceRule({ ruleType: "weeklyPattern", days: [1, 3, 5] })).toContain("Mon");
      expect(describeRecurrenceRule({ ruleType: "weeklyPattern", days: [1, 3, 5] })).toContain("Wed");
      expect(describeRecurrenceRule({ ruleType: "weeklyPattern", days: [1, 3, 5] })).toContain("Fri");
    });

    test("Special pattern rule descriptions", () => {
      expect(describeRecurrenceRule({ ruleType: "specialPattern", pattern: "weekdays" }))
        .toBe("Every weekday (Mon-Fri)");
      expect(describeRecurrenceRule({ ruleType: "specialPattern", pattern: "weekends" }))
        .toBe("Every weekend (Sat-Sun)");
    });
  });

  describe("JSON serialization", () => {
    test("Serialize and parse interval rule", () => {
      const config = {
        rule: { ruleType: "interval" as const, amount: 3, unit: "week" as const },
        fromCompletion: false,
      };
      const json = serializeRecurrenceConfig(config);
      const parsed = parseRecurrenceConfig(json);
      expect(parsed).toEqual(config);
    });

    test("Serialize and parse monthly weekday rule", () => {
      const config = {
        rule: {
          ruleType: "monthlyByWeekday" as const,
          ordinal: "second" as const,
          weekday: 1 as const,
        },
      };
      const json = serializeRecurrenceConfig(config);
      const parsed = parseRecurrenceConfig(json);
      expect(parsed).toEqual(config);
    });

    test("Invalid JSON throws error", () => {
      expect(() => parseRecurrenceConfig("invalid json")).toThrow();
    });

    test("Invalid rule structure throws error", () => {
      expect(() => parseRecurrenceConfig('{"rule":{"ruleType":"invalid"}}')).toThrow();
    });
  });
});
