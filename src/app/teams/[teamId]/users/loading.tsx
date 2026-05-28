import ListPageSkeleton from "@/components/loading/list-page-skeleton";

export default function Loading() {
  return (
    <ListPageSkeleton
      titleWidthClassName="w-24"
      showDescription={false}
      actionCount={2}
    />
  );
}
