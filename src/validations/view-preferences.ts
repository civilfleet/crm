import { z } from "zod";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Which list a saved view is for, and whose: "<list>:team:<teamId>",
 * "<list>:org:<organizationId>" or "<list>:admin", where <list> is one or
 * more lowercase words joined by ":" ("transactions",
 * "organizations:funding"). The scope part is checked against the person's
 * access before a view is read or saved.
 */
export const VIEW_KEY_PATTERN = new RegExp(
  `^[a-z][a-z-]*(?::[a-z][a-z-]*)*:(?:(?:team|org):${UUID}|admin)$`,
);

export type ViewKeyScope =
  | { kind: "team"; id: string }
  | { kind: "org"; id: string }
  | { kind: "admin" };

/** The team, organization or admin area a valid view key belongs to. */
export const getViewKeyScope = (key: string): ViewKeyScope => {
  if (key.endsWith(":admin")) return { kind: "admin" };
  const parts = key.split(":");
  const id = parts[parts.length - 1];
  return parts[parts.length - 2] === "org"
    ? { kind: "org", id }
    : { kind: "team", id };
};

/** Saved settings are small; anything bigger is a bug or abuse. */
export const MAX_VIEW_SETTINGS_BYTES = 20_000;

export const viewPreferenceSettingsSchema = z
  .object({
    columns: z.record(z.string().max(64), z.boolean()).optional(),
    sort: z
      .object({
        field: z.string().min(1).max(64),
        direction: z.enum(["asc", "desc"]),
      })
      .nullable()
      .optional(),
    view: z.enum(["table", "cards", "map", "calendar"]).optional(),
    // Each list validates its own filter shape when it reads them back.
    filters: z.array(z.unknown()).max(50).optional(),
  })
  .strict();

export type ViewPreferenceSettings = z.infer<
  typeof viewPreferenceSettingsSchema
>;

export const viewKeySchema = z.string().max(120).regex(VIEW_KEY_PATTERN);

export const saveViewPreferenceSchema = z.object({
  key: viewKeySchema,
  settings: viewPreferenceSettingsSchema,
});
