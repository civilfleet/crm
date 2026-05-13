"use client";

import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventType } from "@/types";

type CalendarEvent = {
  id: string;
  title: string;
  startDate: string | Date;
  endDate?: string | Date;
  isOnline?: boolean;
  location?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  timeZone?: string;
  eventType?: {
    id: string;
    name: string;
    color?: string;
  };
};

interface EventCalendarProps {
  teamId: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EventCalendar({ teamId }: EventCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"month" | "agenda">("month");
  const [stateFilter, setStateFilter] = useState("");
  const [eventTypeId, setEventTypeId] = useState("all");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const activeRange = useMemo(() => {
    if (rangeFrom || rangeTo) {
      const from = rangeFrom ? new Date(rangeFrom) : monthStart;
      const to = rangeTo ? new Date(rangeTo) : monthEnd;
      if (rangeTo && rangeTo.length === 10) {
        to.setHours(23, 59, 59, 999);
      }
      return { from, to, isCustom: true };
    }
    return { from: monthStart, to: monthEnd, isCustom: false };
  }, [rangeFrom, rangeTo, monthStart, monthEnd]);

  useEffect(() => {
    if (activeRange.isCustom && viewMode === "month") {
      setViewMode("agenda");
    }
  }, [activeRange.isCustom, viewMode]);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const { data: eventTypesData } = useSWR(
    `/api/event-types?teamId=${teamId}`,
    fetcher,
  );
  const eventTypes: EventType[] = eventTypesData?.data || [];

  const filtersQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("from", activeRange.from.toISOString());
    params.set("to", activeRange.to.toISOString());
    if (stateFilter.trim()) {
      params.set("state", stateFilter.trim());
    }
    if (eventTypeId && eventTypeId !== "all") {
      params.set("eventTypeId", eventTypeId);
    }
    return params.toString();
  }, [activeRange, stateFilter, eventTypeId]);

  const { data: eventsData, isLoading } = useSWR(
    `/api/events?teamId=${teamId}&${filtersQuery}`,
    fetcher,
  );

  const events: CalendarEvent[] = useMemo(() => {
    if (!eventsData?.data) {
      return [];
    }
    return eventsData.data as CalendarEvent[];
  }, [eventsData]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const start = new Date(event.startDate);
      const key = format(start, "yyyy-MM-dd");
      const existing = map.get(key) || [];
      existing.push(event);
      map.set(key, existing);
    });
    return map;
  }, [events]);

  const days = useMemo(() => {
    const results: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      results.push(day);
      day = addDays(day, 1);
    }
    return results;
  }, [calendarStart, calendarEnd]);

  const agendaEvents = useMemo(() => {
    return [...events].sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
  }, [events]);

  const handlePrev = () => setCurrentMonth((prev) => subMonths(prev, 1));
  const handleNext = () => setCurrentMonth((prev) => addMonths(prev, 1));
  const handleToday = () => setCurrentMonth(new Date());

  return (
    <div className="rounded-md border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Calendar</h2>
          <p className="text-sm text-muted-foreground">
            {format(monthStart, "MMMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <Select value={eventTypeId} onValueChange={setEventTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {eventTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px]">
          <Input
            placeholder="Filter by state"
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
          />
        </div>
        <div className="min-w-[180px]">
          <Input
            type="date"
            placeholder="From"
            value={rangeFrom}
            onChange={(event) => setRangeFrom(event.target.value)}
          />
        </div>
        <div className="min-w-[180px]">
          <Input
            type="date"
            placeholder="To"
            value={rangeTo}
            onChange={(event) => setRangeTo(event.target.value)}
          />
        </div>
        {(rangeFrom || rangeTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRangeFrom("");
              setRangeTo("");
            }}
          >
            Clear range
          </Button>
        )}
        {(eventTypeId !== "all" || stateFilter.trim()) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEventTypeId("all");
              setStateFilter("");
            }}
          >
            Reset filters
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={viewMode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("month")}
            disabled={activeRange.isCustom}
          >
            Month
          </Button>
          <Button
            variant={viewMode === "agenda" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("agenda")}
          >
            Agenda
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading events…</div>
      ) : viewMode === "month" ? (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div
              key={day}
              className="bg-card p-2 text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) || [];
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={key}
                className={`min-h-[120px] bg-card p-2 ${
                  isCurrentMonth ? "" : "text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs ${
                      isToday
                        ? "rounded-full bg-primary px-2 py-0.5 text-primary-foreground"
                        : ""
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {dayEvents.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {dayEvents.length}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((eventItem) => (
                    <div
                      key={eventItem.id}
                      className="rounded-sm border px-2 py-1 text-[11px]"
                    >
                      <div className="flex items-center gap-1 font-medium">
                        {eventItem.eventType?.color && (
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: eventItem.eventType.color,
                            }}
                          />
                        )}
                        <span>{eventItem.title}</span>
                      </div>
                      <div className="text-muted-foreground">
                        {format(new Date(eventItem.startDate), "HH:mm")}
                        {eventItem.timeZone ? ` (${eventItem.timeZone})` : ""}
                      </div>
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {agendaEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No events scheduled for this month.
            </div>
          ) : (
            agendaEvents.map((eventItem) => (
              <div
                key={eventItem.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{eventItem.title}</p>
                    {eventItem.eventType && (
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={
                          eventItem.eventType.color
                            ? {
                                borderColor: eventItem.eventType.color,
                                color: eventItem.eventType.color,
                              }
                            : {}
                        }
                      >
                        {eventItem.eventType.color && (
                          <span
                            className="mr-1 inline-block h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: eventItem.eventType.color,
                            }}
                          />
                        )}
                        {eventItem.eventType.name}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(eventItem.startDate), "PPp")}
                    {eventItem.timeZone ? ` (${eventItem.timeZone})` : ""}
                  </p>
                  {!eventItem.isOnline && (
                    <p className="text-xs text-muted-foreground">
                      {[
                        eventItem.address,
                        eventItem.postalCode,
                        eventItem.city,
                        eventItem.state,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {eventItem.isOnline
                    ? "Online"
                    : eventItem.location || "On site"}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}