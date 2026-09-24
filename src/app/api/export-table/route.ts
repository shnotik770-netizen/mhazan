import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";

// Generic "export whatever is currently on screen" endpoint: the client
// already computed the filtered/sorted rows for its own table (search box,
// column filters, sort order all live in client state, never the URL), so
// rather than re-deriving that same filter server-side, the client just
// sends the exact rows it's already rendering and this turns them into an
// .xlsx. ExcelJS is a heavy, Node-oriented library — kept server-side only,
// same as the department report's own export route, instead of shipping it
// to the browser bundle.
type ExportColumn = { header: string; key: string; width?: number; numeric?: boolean };

const MAX_ROWS = 20000;
const MAX_COLUMNS = 40;

export async function POST(request: Request) {
  await requireUser();

  let body: { title?: unknown; columns?: unknown; rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : "ייצוא";
  const rawColumns = Array.isArray(body.columns) ? body.columns : [];
  const columns: ExportColumn[] = rawColumns
    .filter(
      (c): c is ExportColumn =>
        !!c && typeof c === "object" && typeof (c as ExportColumn).header === "string" && typeof (c as ExportColumn).key === "string",
    )
    .slice(0, MAX_COLUMNS);
  const rawRows = Array.isArray(body.rows) ? body.rows : [];

  if (columns.length === 0) {
    return NextResponse.json({ error: "רשימת עמודות ריקה" }, { status: 400 });
  }
  if (rawRows.length > MAX_ROWS) {
    return NextResponse.json({ error: `ניתן לייצא עד ${MAX_ROWS} שורות בו-זמנית` }, { status: 400 });
  }

  const columnKeys = new Set(columns.map((c) => c.key));
  const rows: Record<string, string | number | null>[] = rawRows.map((r) => {
    const row: Record<string, string | number | null> = {};
    if (r && typeof r === "object") {
      for (const key of columnKeys) {
        const value = (r as Record<string, unknown>)[key];
        row[key] = typeof value === "number" || typeof value === "string" ? value : value == null ? null : String(value);
      }
    }
    return row;
  });

  const workbook = new ExcelJS.Workbook();
  // Excel sheet names: max 31 chars, and a handful of characters are illegal.
  const sheetName = title.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "גיליון1";
  const sheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  sheet.columns = columns.map((c) => ({ header: c.header.slice(0, 60), key: c.key, width: c.width ?? 18 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  for (const c of columns) {
    if (c.numeric) sheet.getColumn(c.key).numFmt = "#,##0.00";
  }

  const buffer = await workbook.xlsx.writeBuffer();

  // The ASCII filename is always a fixed, hardcoded fallback — the
  // client-supplied title only ever goes into the UTF-8 filename* form
  // (percent-encoded via encodeURIComponent, which also neutralizes CR/LF),
  // so nothing derived from the request body can inject into the header.
  const utf8Name = `${title}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`,
    },
  });
}
