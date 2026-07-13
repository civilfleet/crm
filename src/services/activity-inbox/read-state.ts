export const resolveActivityInboxReadState = ({
  explicitIsRead,
  engagementCreatedAt,
  readThroughAt,
  engagementUserId,
  currentUserId,
}: {
  explicitIsRead?: boolean;
  engagementCreatedAt: Date;
  readThroughAt: Date;
  engagementUserId?: string | null;
  currentUserId: string;
}) =>
  explicitIsRead ??
  (engagementUserId === currentUserId || engagementCreatedAt <= readThroughAt);
