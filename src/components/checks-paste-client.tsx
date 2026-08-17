"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lookupDepartmentsByPayee, pasteExistingChecks } from "@/app/(app)/checks/actions";
import { Modal } from "@/components/modal";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };

type CheckStatus = "UNPAID" | "CLEARED" | "CANCELLED";

type Row = {
  checkNumber: string;
  payee: string;
  amount: number;
  date: string;
  status: CheckStatus;
  departmentId: string;
  includeInDepartmentLedger: boolean;
  autoMatched: boolean;
};

function normalizeDate(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return trimmed;
}

function normalizeAmount(text: string): number {
  return Number(String(text ?? "").replace(/[^\d.-]/g, "")) || 0;
}

// V = נפרע, ריק = לא נפרע, X = מבוטל — matches the status column exactly
// as it comes out of the bank/office export, not a plain yes/no.
function parseStatus(text: string): CheckStatus {
  const t = (text ?? "").trim().toLowerCase();
  if (t === "x" || t === "מבוטל" || t === "בוטל") return "CANCELLED";
  if (t === "v" || t === "✓" || t === "כן" || t === "נפרע" || t === "יש") return "CLEARED";
  return "UNPAID";
}

export function PasteExistingChecksForm({
  bankAccounts,
  departments,
}: {
  bankAccounts: BankAccount[];
  departments: Department[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const validCount = useMemo(() => rows.filter((r) => r.payee && r.amount > 0).length, [rows]);

  async function handlePaste(text: string) {
    const parsed = text
      .trim()
      .split("\n")
      .map((line) => line.split(/\t|,(?!\d{3})/).map((c) => c.trim()))
      .filter((cols) => cols.some((c) => c.length > 0))
      // A header row ("מס' צ׳ק, שם, סכום, ...") has no numeric amount in
      // the amount column — drop it instead of importing it as a row.
      .filter((cols) => normalizeAmount(cols[2] ?? "") > 0);

    const initialRows: Row[] = parsed.map((cols) => {
      const [checkNumber, payee, amountText, dateText, statusText] = cols;
      return {
        checkNumber: (checkNumber ?? "").trim(),
        payee: (payee ?? "").trim(),
        amount: normalizeAmount(amountText ?? ""),
        date: normalizeDate(dateText ?? ""),
        status: parseStatus(statusText ?? ""),
        departmentId: "",
        includeInDepartmentLedger: false,
        autoMatched: false,
      };
    });
    setRows(initialRows);
    setMessage(null);

    const payees = Array.from(new Set(initialRows.map((r) => r.payee).filter(Boolean)));
    if (payees.length === 0) return;

    setIsMatching(true);
    try {
      const matches = await lookupDepartmentsByPayee(payees);
      setRows((prev) =>
        prev.map((r) => {
          const match = matches[r.payee.trim().toLowerCase()];
          return match ? { ...r, departmentId: match, autoMatched: true } : r;
        }),
      );
    } catch {
      // Non-fatal: rows just stay unmatched, awaiting manual classification.
    } finally {
      setIsMatching(false);
    }
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await pasteExistingChecks(
        bankAccountId,
        rows
          .filter((r) => r.payee && r.amount > 0)
          .map((r) => ({
            checkNumber: r.checkNumber || null,
            payee: r.payee,
            amount: r.amount,
            date: r.date || null,
            status: r.status,
            departmentId: r.departmentId || null,
            includeInDepartmentLedger: r.includeInDepartmentLedger,
          })),
      );
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: `יובאו ${result.count} צ׳קים/העברות בהצלחה` });
        setRows([]);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
        + ייבוא צ׳קים קיימים בהדבקה
      </button>
    );
  }

  return (
    <Modal onClose={() => setOpen(false)}>
    <div className="card p-4 space-y-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">ייבוא צ׳קים / העברות קיימים (לתחזית בנק)</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-muted">
          סגור
        </button>
      </div>
      <select
        value={bankAccountId}
        onChange={(e) => setBankAccountId(e.target.value)}
        className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
      >
        <option value="">בחר חשבון בנק...</option>
        {bankAccounts.map((b) => (
          <option key={b.id} value={b.id}>
            {b.departments?.name} — {b.bank_name} ({b.account_number})
          </option>
        ))}
      </select>
      <textarea
        className="w-full h-24 rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-mono"
        placeholder={"הדבק כאן, כולל שורת כותרת אם יש:\nמס' צ׳ק\tשם\tסכום\tתאריך\tמצב\n1352051\tמרכז ההפצה\t1755\t20/11/2025\tV"}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text) {
            e.preventDefault();
            handlePaste(text);
          }
        }}
        onChange={(e) => handlePaste(e.target.value)}
      />
      <p className="text-xs text-muted">
        עמודות: מספר צ׳ק, שם מוטב, סכום, תאריך, מצב (V = נפרע, ריק = לא נפרע, X = מבוטל). שורת כותרת מזוהה
        אוטומטית ומדולגת. מוטב שכבר סווג בעבר למחלקה ישוייך אליה אוטומטית; מוטבים חדשים יישארו בהמתנה לסיווג.
        כברירת מחדל צ׳קים מיובאים אינם נכללים במאזן הפנימי של המחלקה (מניחים שהחישוב כבר נעשה בדרך הישנה) — ניתן
        לשנות לכל שורה.
      </p>
      {isMatching && <p className="text-sm text-muted">מתאים מחלקות לפי היסטוריה...</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>מס׳ צ׳ק</th>
                <th>מוטב</th>
                <th>סכום</th>
                <th>תאריך</th>
                <th>מצב</th>
                <th>מחלקה</th>
                <th>לכלול במאזן פנימי?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="w-20 bg-transparent border-b border-border text-sm"
                      value={row.checkNumber}
                      onChange={(e) => updateRow(i, { checkNumber: e.target.value })}
                    />
                  </td>
                  <td>{row.payee}</td>
                  <td>
                    <input
                      type="number"
                      className="w-24 bg-transparent border-b border-border text-sm"
                      value={row.amount || ""}
                      onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      className="w-28 bg-transparent border-b border-border text-sm"
                      value={row.date}
                      onChange={(e) => updateRow(i, { date: e.target.value })}
                      onBlur={(e) => updateRow(i, { date: normalizeDate(e.target.value) })}
                      placeholder="YYYY-MM-DD"
                    />
                  </td>
                  <td>
                    <select
                      className="bg-transparent border-b border-border text-sm"
                      value={row.status}
                      onChange={(e) => updateRow(i, { status: e.target.value as CheckStatus })}
                    >
                      <option value="UNPAID">לא נפרע</option>
                      <option value="CLEARED">נפרע</option>
                      <option value="CANCELLED">בוטל</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className="bg-transparent border-b border-border text-sm"
                      value={row.departmentId}
                      onChange={(e) => updateRow(i, { departmentId: e.target.value, autoMatched: false })}
                    >
                      <option value="">ממתין לסיווג</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    {row.autoMatched && <span className="text-xs text-success"> ✓ שויך אוטומטית</span>}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.includeInDepartmentLedger}
                      onChange={(e) => updateRow(i, { includeInDepartmentLedger: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {message && (
        <div
          className={`card px-4 py-3 text-sm ${
            message.type === "error" ? "bg-danger-bg text-danger" : "bg-success-bg text-success"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        disabled={isPending || !bankAccountId || validCount === 0}
        onClick={submit}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {isPending ? "מייבא..." : `ייבא ${validCount} שורות`}
      </button>
    </div>
    </Modal>
  );
}
