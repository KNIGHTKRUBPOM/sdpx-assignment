import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../auth";
import { AssignmentWorkspace } from "../../../components/assignment-workspace";
export default async function Assignment({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <AssignmentWorkspace id={(await params).id} />;
}
