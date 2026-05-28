"use client";

import EventCalendar from "@/components/events/event-calendar";
import EventTable from "@/components/table/event-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EventsViewProps {
  teamId: string;
}

export default function EventsView({ teamId }: EventsViewProps) {
  return (
    <Tabs defaultValue="list" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 max-w-md">
        <TabsTrigger value="list">List</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
      </TabsList>
      <TabsContent value="list">
        <EventTable teamId={teamId} />
      </TabsContent>
      <TabsContent value="calendar">
        <EventCalendar teamId={teamId} />
      </TabsContent>
    </Tabs>
  );
}
