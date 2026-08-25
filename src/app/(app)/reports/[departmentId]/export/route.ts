import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDepartmentReportData, monthLabel, type CombinedRow } from "@/lib/department-report-data";
import { formatDate } from "@/lib/format";

function kindLabel(kind: CombinedRow["kind"]): string {
  if (kind === "income") return "הכנסה";
  if (kind === "check") return "הוצאה";
  if (kind === "commission") return "עמלת אשראי";
  return "רישום ידני";
}

function addRowsSheet(workbook: ExcelJS.Workbook, title: string, rows: CombinedRow[]) {
  const sheet = workbook.addWorksheet(title, { views: [{ rightToLeft: true }] });
  sheet.columns = [
    { header: "תאריך", key: "date", width: 14 },
    { header: "סוג פעולה", key: "kind", width: 14 },
    { header: "פירוט סוג", key: "type", width: 30 },
    { header: "תיאור", key: "description", width: 28 },
    { header: "סכום", key: "amount", width: 14 },
    { header: "סטטוס", key: "status", width: 12 },
    { header: "ישן (לא נכלל במאזן)", key: "isOld", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    sheet.addRow({
      date: r.date ? formatDate(r.date) : "",
      kind: kindLabel(r.kind),
      type: r.type,
      description: r.description,
      amount: r.amount,
      status: r.status ?? "",
      isOld: r.isOld ? "כן" : "",
    });
  }
  sheet.getColumn("amount").numFmt = "#,##0.00";
}

// Every department's own report as a downloadable workbook — same data the
// on-screen report shows (via the shared getDepartmentReportData), so the
// export can never drift from what's displayed.
export async function GET(_request: Request, { params }: { params: Promise<{ departmentId: string }> }) {
  const { departmentId } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const isAdmin = user.profile.role === "FINANCE_ADMIN";

  if (!isAdmin) {
    const { data: grant } = await supabase
      .from("user_department_access")
      .select("department_id")
      .eq("user_id", user.id)
      .eq("department_id", departmentId)
      .maybeSingle();
    if (!grant) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { data: department } = await supabase.from("departments").select("name").eq("id", departmentId).single();
  if (!department) return NextResponse.json({ error: "מחלקה לא נמצאה" }, { status: 404 });

  const { pastRows, futureRows, monthlyFlow } = await getDepartmentReportData(departmentId);

  const workbook = new ExcelJS.Workbook();
  addRowsSheet(workbook, "תנועות עד היום", pastRows);
  addRowsSheet(workbook, "תנועות עתידיות", futureRows);

  const flowSheet = workbook.addWorksheet("תזרים חודשי", { views: [{ rightToLeft: true }] });
  flowSheet.columns = [
    { header: "חודש", key: "month", width: 16 },
    { header: "הכנסות", key: "income", width: 16 },
    { header: "הוצאות", key: "expense", width: 16 },
    { header: "יתרת פתיחה", key: "opening", width: 16 },
    { header: "יתרת סגירה", key: "closing", width: 16 },
    { header: "צפי (עתידי)", key: "isFuture", width: 12 },
  ];
  flowSheet.getRow(1).font = { bold: true };
  for (const r of monthlyFlow) {
    flowSheet.addRow({
      month: monthLabel(r.month),
      income: r.income,
      expense: r.expense,
      opening: r.opening,
      closing: r.closing,
      isFuture: r.isFuture ? "כן" : "",
    });
  }
  for (const key of ["income", "expense", "opening", "closing"]) flowSheet.getColumn(key).numFmt = "#,##0.00";

  const buffer = await workbook.xlsx.writeBuffer();

  // Filename is generated from the department's own name, never taken from
  // the request — encodeURIComponent covers the RFC 5987 filename* form for
  // non-ASCII (Hebrew) names, with a plain ASCII fallback for older clients.
  const safeAscii = `department-report-${departmentId}.xlsx`;
  const utf8Name = `דוח ${department.name}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`,
    },
  });
}
