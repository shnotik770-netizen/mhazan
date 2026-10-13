import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { AutoPrintOnLoad } from "@/components/auto-print-on-load";
import { DepartmentReport } from "@/components/department-report";

export default async function DepartmentReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ departmentId: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { departmentId } = await params;
  const { autoprint } = await searchParams;

  const user = await requireUser();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";
  const supabase = await createClient();

  if (!isAdmin) {
    const { data: grant } = await supabase
      .from("user_department_access")
      .select("department_id")
      .eq("user_id", user.id)
      .eq("department_id", departmentId)
      .maybeSingle();
    if (!grant) redirect("/");
  }

  const { data: department } = await supabase.from("departments").select("*").eq("id", departmentId).single();
  if (!department) redirect("/");

  return (
    <div className="space-y-6">
      {/* Opened as its own tab from "הנפקת PDF" on /ledger (one tab per
          department, so each prints/saves as its own separate document) —
          autoprint triggers the browser's print dialog immediately instead
          of requiring a manual click once the tab loads. */}
      {autoprint === "1" && <AutoPrintOnLoad />}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">דוח מחלקתי — {department.name}</h1>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Link href="/" className="text-sm text-primary">
            ← חזרה לדשבורד
          </Link>
          <PrintButton />
        </div>
      </div>

      <DepartmentReport departmentId={departmentId} departmentName={department.name} isAdmin={isAdmin} />
    </div>
  );
}
