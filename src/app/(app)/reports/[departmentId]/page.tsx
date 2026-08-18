import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { DepartmentReport, computeReportRange, type ReportRangeKey } from "@/components/department-report";

export default async function DepartmentReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ departmentId: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { departmentId } = await params;
  const { range: rangeParam, start: startParam, end: endParam } = await searchParams;
  const range = (["month", "2months", "3months", "custom"].includes(rangeParam ?? "") ? rangeParam : "month") as ReportRangeKey;

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

  const { start, end } = computeReportRange(range, startParam, endParam);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">דוח מחלקתי — {department.name}</h1>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Link href={`/forecast?mode=department&department=${departmentId}`} className="text-sm text-primary">
            תחזית מחלקתית מלאה ←
          </Link>
          <Link href="/" className="text-sm text-primary">
            ← חזרה לדשבורד
          </Link>
          <PrintButton />
        </div>
      </div>

      <DepartmentReport departmentId={departmentId} departmentName={department.name} isAdmin={isAdmin} range={range} start={start} end={end} />
    </div>
  );
}
