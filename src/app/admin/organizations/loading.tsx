import ListPageSkeleton from "@/components/loading/list-page-skeleton";

export default function Loading() {
  return (
    <ListPageSkeleton
      titleWidthClassName="w-72"
      showDescription={false}
      actionCount={1}
    />
  );
}
