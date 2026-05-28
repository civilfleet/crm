interface PageProps {
  params: Promise<{ teamId: string }>;
}

export default async function Page({ params }: PageProps) {
  await params;

  return <div className="flex flex-col w-1/2">reports page</div>;
}
