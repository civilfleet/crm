import { z } from "zod";
import { MAX_TAG_NAME_LENGTH } from "@/lib/tags";
import { TAGGABLE_ENTITY_TYPES } from "@/types";

export const tagNamesSchema = z
  .array(z.string().min(1).max(MAX_TAG_NAME_LENGTH + 8))
  .max(100);

export const tagAttributeUpdateSchema = z.object({
  teamId: z.uuid(),
  entityId: z.uuid(),
  entityType: z.enum(TAGGABLE_ENTITY_TYPES),
  tags: tagNamesSchema,
});
