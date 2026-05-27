import { redirect } from "next/navigation";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  redirect(plan ? `/waitlist?plan=${plan}` : "/waitlist");
}
