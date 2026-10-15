import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../auth";
import { Workspace } from "../../../components/workspace";
export default async function Classroom({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return <Workspace classroomId={(await params).id} />;
}
