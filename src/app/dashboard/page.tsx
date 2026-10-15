import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../auth";
import { Workspace } from "../../components/workspace";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <Workspace />;
}
