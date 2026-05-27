import { redirect } from "next/navigation";

export default function RegisterPage({ searchParams }: { searchParams: { plan?: string } }) {
  const plan = searchParams.plan;
  redirect(plan ? `/waitlist?plan=${plan}` : "/waitlist");
}
