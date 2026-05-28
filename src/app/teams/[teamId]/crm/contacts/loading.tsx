import ListPageSkeleton from "@/components/loading/list-page-skeleton";

export default function Loading() {
  return (
    <ListPageSkeleton
      titleWidthClassName="w-36"
      descriptionWidthClassName="w-full max-w-[520px]"
      actionCount={0}
    />
  );
}
