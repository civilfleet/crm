import type { SearchIndexer } from "./types";

export const indexPublicEvents: SearchIndexer = async (records) => {
  const pagefind = await import("pagefind");
  const created = await pagefind.createIndex({
    forceLanguage: "en",
    writePlayground: false,
  });
  if (created.errors.length || !created.index)
    throw new Error("Pagefind index creation failed");
  const index = created.index;
  try {
    for (const { event, detail } of records) {
      const result = await index.addCustomRecord({
        url: detail,
        language: "en",
        content: [
          event.title,
          event.description,
          event.location,
          event.city,
          event.eventType,
        ].join("\n"),
        meta: {
          eventId: event.id,
          teamId: event.teamId,
          title: event.title,
          detailUrl: detail,
          date: event.startDate,
          timeZone: event.timeZone,
          description: event.description.slice(0, 180),
        },
        filters: {
          type: [event.eventType],
          state: [event.state],
          format: [event.isOnline ? "online" : "in-person"],
          date: [event.startDate.slice(0, 10)],
        },
        sort: { date: String(Date.parse(event.startDate)) },
      });
      if (result.errors.length)
        throw new Error("Pagefind record indexing failed");
    }
    const result = await index.getFiles();
    if (result.errors.length) throw new Error("Pagefind output failed");
    return result.files;
  } finally {
    await index.deleteIndex();
  }
};

export const closeSearch = async () => (await import("pagefind")).close();
