import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/safe-error";
import { checkRateLimit } from "@/lib/rate-limit";

// Each request here launches a full headless Chromium process — by far the
// most expensive route in the app. 30 per 5 minutes per user comfortably
// covers a real "כל המחלקות" batch (the export button calls this once per
// department, sequentially) while still cutting off a scripted flood long
// before it could exhaust the server's CPU/memory.
const PDF_RATE_LIMIT = 30;
const PDF_RATE_WINDOW_MS = 5 * 60 * 1000;

// A real, downloadable PDF per department — unlike the browser's own
// print-to-PDF (what PrintButton elsewhere in the app still uses), this
// renders the department's own /reports/[departmentId] page server-side in a
// headless Chromium tab and returns the resulting PDF bytes directly, so
// "הנפקת PDF" on /ledger can hand back one real .pdf file per department
// instead of opening a tab and asking the admin to save it manually. It
// reuses that page's own markup/print CSS exactly (print-ready since
// PrintButton already relies on it) rather than building a second, separate
// report layout that could drift from what's on screen.
export async function GET(request: Request, { params }: { params: Promise<{ departmentId: string }> }) {
  const { departmentId } = await params;
  const user = await requireUser();

  const rate = checkRateLimit(`pdf:${user.id}`, PDF_RATE_LIMIT, PDF_RATE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `יותר מדי בקשות להפקת PDF — נסו שוב בעוד ${rate.retryAfterSeconds} שניות` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

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

  // Puppeteer navigates to this server's OWN report page, internally — never
  // through the public HTTPS domain. Building this from request.url looked
  // reasonable but actually broke it: behind Railway's proxy, request.url
  // reports the public https:// origin while the app itself only ever binds
  // plain HTTP on PORT, so the derived URL became "https://localhost:8080"
  // — a TLS handshake against a port with no TLS listener (ERR_SSL_PROTOCOL_
  // ERROR). Always http + the actual bound port sidesteps that entirely.
  const internalPort = process.env.PORT ?? "8080";
  const reportUrl = `http://127.0.0.1:${internalPort}/reports/${departmentId}`;
  // Puppeteer's internal request to the report page needs the same session
  // the admin is already using — forwarded as a plain cookie header rather
  // than re-deriving auth, so the page's own requireUser()/department-access
  // check (already covered above too, for defense in depth) is what actually
  // decides whether the render succeeds.
  const cookieHeader = request.headers.get("cookie") ?? "";

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    if (cookieHeader) await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    await page.goto(reportUrl, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.emulateMediaType("print");
    const pdfBuffer = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    });

    const safeAscii = `department-report-${departmentId}.pdf`;
    const utf8Name = `דוח ${department.name}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה ביצירת PDF";
    return NextResponse.json({ error: safeErrorMessage({ message }) }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
