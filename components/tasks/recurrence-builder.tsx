"use client";

/**
 * Visual Recurrence Rule Builder
 *
 * Interactive UI for constructing custom recurrence rules without typing.
 * Supports all 4 rule types with live preview of next occurrences.
 */

import { useState, useMemo } from "react";
import type {
  RecurrenceConfig,
  RecurrenceRule,
  IntervalRule,
  MonthlyWeekdayRule,
  WeeklyPatternRule,
  SpecialWeekdayRule,
} from "@/types/recurrence";
import { calculateNextDueDate } from "@/lib/recurrence/calculator";
import { describeRecurrenceRule } from "@/types/recurrence";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

interface RecurrenceBuilderProps {
  value: RecurrenceConfig | null;
  onValueChange: (config: RecurrenceConfig | null) => void;
  baseDate?: Date; // For preview, defaults to today
}

export function RecurrenceBuilder({
  value,
  onValueChange,
  baseDate = new Date(),
}: RecurrenceBuilderProps) {
  const [ruleType, setRuleType] = useState<RecurrenceRule["ruleType"]>(
    value?.rule.ruleType || "interval"
  );

  // Initialize rule based on type
  const currentRule = value?.rule || getDefaultRule(ruleType);

  const handleRuleTypeChange = (newType: RecurrenceRule["ruleType"]) => {
    setRuleType(newType);
    const defaultRule = getDefaultRule(newType);
    onValueChange({ rule: defaultRule });
  };

  const handleRuleChange = (rule: RecurrenceRule) => {
    onValueChange({ rule });
  };

  return (
    <div className="space-y-4">
      {/* Format selector */}
      <div className="space-y-2">
        <Label>Recurrence Pattern</Label>
        <Select
          value={ruleType}
          onValueChange={handleRuleTypeChange}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="interval">Every X time (e.g., Every 3 weeks)</SelectItem>
            <SelectItem value="monthlyByWeekday">
              Xth weekday (e.g., 2nd Monday)
            </SelectItem>
            <SelectItem value="weeklyPattern">
              Specific days (e.g., Mon/Wed/Fri)
            </SelectItem>
            <SelectItem value="specialPattern">Weekdays / Weekends</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conditional builder based on ruleType */}
      <div className="border rounded-lg p-4">
        {ruleType === "interval" && (
          <IntervalBuilder
            value={currentRule as IntervalRule}
            onChange={handleRuleChange}
          />
        )}
        {ruleType === "monthlyByWeekday" && (
          <MonthlyWeekdayBuilder
            value={currentRule as MonthlyWeekdayRule}
            onChange={handleRuleChange}
          />
        )}
        {ruleType === "weeklyPattern" && (
          <WeeklyPatternBuilder
            value={currentRule as WeeklyPatternRule}
            onChange={handleRuleChange}
          />
        )}
        {ruleType === "specialPattern" && (
          <SpecialPatternBuilder
            value={currentRule as SpecialWeekdayRule}
            onChange={handleRuleChange}
          />
        )}
      </div>

      {/* Live preview of next 5 occurrences */}
      {value && <RecurrencePreview config={value} baseDate={baseDate} />}
    </div>
  );
}

/**
 * Get default rule for a given type
 */
function getDefaultRule(type: RecurrenceRule["ruleType"]): RecurrenceRule {
  switch (type) {
    case "interval":
      return { ruleType: "interval", amount: 1, unit: "day" };
    case "monthlyByWeekday":
      return { ruleType: "monthlyByWeekday", ordinal: "first", weekday: 1 };
    case "weeklyPattern":
      return { ruleType: "weeklyPattern", days: [1, 3, 5] };
    case "specialPattern":
      return { ruleType: "specialPattern", pattern: "weekdays" };
  }
}

/**
 * Interval Builder: "Every X T"
 */
interface IntervalBuilderProps {
  value: IntervalRule;
  onChange: (rule: IntervalRule) => void;
}

function IntervalBuilder({ value, onChange }: IntervalBuilderProps) {
  const handleAmountChange = (amount: number) => {
    onChange({ ...value, amount });
  };

  const handleUnitChange = (unit: IntervalRule["unit"]) => {
    onChange({ ...value, unit });
  };

  return (
    <div className="space-y-3">
      <Label>Repeat every</Label>
      <div className="flex gap-2 items-center">
        <Input
          type="number"
          min="1"
          max="365"
          value={value.amount}
          onChange={(e) => handleAmountChange(parseInt(e.target.value) || 1)}
          className="w-20"
        />
        <Select value={value.unit} onValueChange={handleUnitChange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">{value.amount === 1 ? "day" : "days"}</SelectItem>
            <SelectItem value="week">{value.amount === 1 ? "week" : "weeks"}</SelectItem>
            <SelectItem value="month">{value.amount === 1 ? "month" : "months"}</SelectItem>
            <SelectItem value="year">{value.amount === 1 ? "year" : "years"}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">
        {describeRecurrenceRule(value)}
      </p>
    </div>
  );
}

/**
 * Monthly Weekday Builder: "On the Xth D of each month"
 */
interface MonthlyWeekdayBuilderProps {
  value: MonthlyWeekdayRule;
  onChange: (rule: MonthlyWeekdayRule) => void;
}

function MonthlyWeekdayBuilder({ value, onChange }: MonthlyWeekdayBuilderProps) {
  const handleOrdinalChange = (ordinal: string) => {
    // Convert string back to ordinal type
    const ordinalValue =
      ordinal === "first" ||
      ordinal === "second" ||
      ordinal === "third" ||
      ordinal === "fourth" ||
      ordinal === "last"
        ? ordinal
        : parseInt(ordinal);
    onChange({ ...value, ordinal: ordinalValue as MonthlyWeekdayRule["ordinal"] });
  };

  const handleWeekdayChange = (weekday: number) => {
    onChange({ ...value, weekday: weekday as MonthlyWeekdayRule["weekday"] });
  };

  // Convert ordinal to string for Select component
  const ordinalAsString = typeof value.ordinal === "string" ? value.ordinal : value.ordinal.toString();

  return (
    <div className="space-y-3">
      <Label>Repeat on</Label>
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm">On the</span>
        <Select value={ordinalAsString} onValueChange={handleOrdinalChange}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="first">1st</SelectItem>
            <SelectItem value="second">2nd</SelectItem>
            <SelectItem value="third">3rd</SelectItem>
            <SelectItem value="fourth">4th</SelectItem>
            <SelectItem value="last">last</SelectItem>
          </SelectContent>
        </Select>
        <Select value={value.weekday.toString()} onValueChange={(v) => handleWeekdayChange(parseInt(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Sunday</SelectItem>
            <SelectItem value="1">Monday</SelectItem>
            <SelectItem value="2">Tuesday</SelectItem>
            <SelectItem value="3">Wednesday</SelectItem>
            <SelectItem value="4">Thursday</SelectItem>
            <SelectItem value="5">Friday</SelectItem>
            <SelectItem value="6">Saturday</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm">of each month</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {describeRecurrenceRule(value)}
      </p>
    </div>
  );
}

/**
 * Weekly Pattern Builder: Weekday chip selector
 */
interface WeeklyPatternBuilderProps {
  value: WeeklyPatternRule;
  onChange: (rule: WeeklyPatternRule) => void;
}

function WeeklyPatternBuilder({ value, onChange }: WeeklyPatternBuilderProps) {
  const weekdays = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
  ];

  const toggleDay = (day: number) => {
    const days = value.days.includes(day)
      ? value.days.filter((d) => d !== day)
      : [...value.days, day].sort((a, b) => a - b);

    if (days.length > 0) {
      onChange({ ...value, days });
    }
  };

  return (
    <div className="space-y-3">
      <Label>Repeat on</Label>
      <div className="flex gap-2">
        {weekdays.map((day) => (
          <Button
            key={day.value}
            type="button"
            variant={value.days.includes(day.value) ? "default" : "outline"}
            size="sm"
            onClick={() => toggleDay(day.value)}
            className="w-12 h-12"
          >
            {day.label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {describeRecurrenceRule(value)}
      </p>
    </div>
  );
}

/**
 * Special Pattern Builder: Quick buttons for weekdays/weekends
 */
interface SpecialPatternBuilderProps {
  value: SpecialWeekdayRule;
  onChange: (rule: SpecialWeekdayRule) => void;
}

function SpecialPatternBuilder({ value, onChange }: SpecialPatternBuilderProps) {
  return (
    <div className="space-y-3">
      <Label>Repeat on</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={value.pattern === "weekdays" ? "default" : "outline"}
          onClick={() => onChange({ ...value, pattern: "weekdays" })}
        >
          Weekdays (Mon-Fri)
        </Button>
        <Button
          type="button"
          variant={value.pattern === "weekends" ? "default" : "outline"}
          onClick={() => onChange({ ...value, pattern: "weekends" })}
        >
          Weekends (Sat-Sun)
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {describeRecurrenceRule(value)}
      </p>
    </div>
  );
}

/**
 * Recurrence Preview: Show next 5 occurrences
 */
interface RecurrencePreviewProps {
  config: RecurrenceConfig;
  baseDate: Date;
}

function RecurrencePreview({ config, baseDate }: RecurrencePreviewProps) {
  const occurrences = useMemo(() => {
    const dates: Date[] = [];
    let current = baseDate;

    for (let i = 0; i < 5; i++) {
      current = calculateNextDueDate(current, config.rule);
      dates.push(new Date(current));
    }

    return dates;
  }, [config, baseDate]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Next 5 occurrences:</Label>
      </div>
      <ul className="space-y-1 text-sm">
        {occurrences.map((date, i) => (
          <li key={i} className="text-muted-foreground">
            {formatDate(date)}
          </li>
        ))}
      </ul>
    </div>
  );
}
