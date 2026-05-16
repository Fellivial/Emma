import { redirect } from "next/navigation";

// Moved to /business/[slug]/leads — redirect for backwards compatibility
export default async function LegacyAdminSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/business/${slug}/leads`);
}
