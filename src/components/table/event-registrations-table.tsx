"use client";

import { DataTable } from "@/components/data-table";
import {
  type EventRegistrationRow,
  eventRegistrationColumns,
  renderEventRegistrationCard,
} from "@/components/table/event-registration-columns";

interface EventRegistrationsTableProps {
  registrations: EventRegistrationRow[];
}

export default function EventRegistrationsTable({
  registrations,
}: EventRegistrationsTableProps) {
  return (
    <DataTable
      columns={eventRegistrationColumns}
      data={registrations}
      renderCard={renderEventRegistrationCard}
      initialView="table"
    />
  );
}