"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualEntryBatch, type ManualEntryBatchRow } from "@/app/(app)/manual-entries/actions";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import type { Tables } from "@/lib/supabase/database.types";

type Department = Tables<"departments">;
type BankAccount = Tables<"bank_accounts">;

type DraftRow = {
  key: number;
  departmentId: string;
  departmentText: string;
  direction: "INCOME" | "EXPENSE";
  amount: number;
  entryDate: string;
  notes: string;
  error?: string;
};

let nextRowKey = 1;

// Tab-delimited rows are split on tabs only, same rule paste-income-form
// uses — a free-text notes field can legitimately contain a comma, and
// splitting on it there would shift every later column by one.
function splitPastedLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  return line.split(/,(?!\d{3})/);
}

function normalizeDate(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return trimmed;
}

function guessDirection(text: string): "INCOME" | "EXPENSE" | null {
  const t = text.trim();
  if (/הכנ/.test(t)) return "INCOME";
  if (/הוצ/.test(t)) return "EXPENSE";
  return null;
}

function guessDepartment(text: string, departments: Department[]): string {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "";
  const exact = departments.find((d) => d.name.toLowerCase() === normalized);
  if (exact) return exact.id;
  const partial = departments.find(
    (d) => d.name.toLowerCase().includes(normalized) || normalized.includes(d.name.toLowerCase()),
  );
  return partial?.id ?? "";
}

const HEADER_FIELD_MAP: Record<string, string> = {
  מחלקה: "department",
  סוג: "direction",
  סכום: "amount",
  תאריך: "date",
  הערות: "notes",
};

function normalizeHeaderText(text: string): string {
  return text.trim().replace(/["'׳״]/g, "").replace(/\s+/g, "");
}

// A row whose department couldn't be matched (blank column, or text that
// doesn't match any department name) isn't rejected — it still saves, just
// "ממתין לסיווג" like an unclassified check, so nothing pasted is ever
// silently dropped for a missing column.
function parsePastedRows(text: string, departments: Department[]): DraftRow[] {
  const lines = text
    .trim()
    .split("\n")
    .map((line) => splitPastedLine(line).map((c) => c.trim()))
    .filter((cols) => cols.some((c) => c.length > 0));
  if (lines.length === 0) return [];

  let colIndex = { department: 0, direction: 1, amount: 2, date: 3, notes: 4 };
  let dataLines = lines;
  const headerMapped: Record<string, number> = {};
  lines[0].forEach((col, idx) => {
    const key = HEADER_FIELD_MAP[normalizeHeaderText(col)];
    if (key) headerMapped[key] = idx;
  });
  // A recognized header row names its own column order instead of assuming
  // the fixed positional layout — and is skipped from the data itself.
  if (headerMapped.amount !== undefined) {
    colIndex = {
      department: headerMapped.department ?? 0,
      direction: headerMapped.direction ?? 1,
      amount: headerMapped.amount,
      date: headerMapped.date ?? 3,
      notes: headerMapped.notes ?? 4,
    };
    dataLines = lines.slice(1);
  }

  return dataLines.map((cols) => {
    const departmentText = cols[colIndex.department] ?? "";
    return {
      key: nextRowKey++,
      departmentId: guessDepartment(departmentText, departments),
      departmentText,
      direction: guessDirection(cols[colIndex.direction] ?? "") ?? "EXPENSE",
      amount: Number((cols[colIndex.amount] ?? "").replace(/[^\d.-]/g, "")) || 0,
      entryDate: normalizeDate(cols[colIndex.date] ?? ""),
      notes: cols[colIndex.notes] ?? "",
    };
  });
}

// A one-time bulk paste of income/expense rows against a specific bank
// account — the two questions up front (which account, and whether this
// whole batch is old history) apply once to the entire list instead of
// being asked per row, since a pasted batch almost always comes from one
// bank statement covering one period.
export function PasteManualEntriesForm({
  departments,
  bankAccounts,
}: {
  departments: Department[];
  bankAccounts: BankAccount[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState("");
  const [isOld, setIsOld] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setBankAccountId("");
    setIsOld(false);
    setPasteText("");
    setRows([]);
    setError(null);
  }

  function parse() {
    setError(null);
    if (!bankAccountId) {
      setError("יש לבחור חשבון בנק לפני הפירוש");
      return;
    }
    const parsed = parsePastedRows(pasteText, departments);
    if (parsed.length === 0) {
      setError("לא זוהו שורות בטקסט שהודבק");
      return;
    }
    setRows(parsed);
  }

  function update(key: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function saveAll() {
    const savable = rows.filter((r) => r.amount > 0 && r.entryDate);
    if (savable.length === 0) {
      setError("אין שורות תקינות לשמירה — יש לוודא שלכל שורה יש סכום ותאריך");
      return;
    }
    setError(null);
    startTransition(async () => {
      const payload: ManualEntryBatchRow[] = savable.map((r) => ({
        departmentId: r.departmentId || null,
        direction: r.direction,
        amount: r.amount,
        entryDate: r.entryDate,
        notes: r.notes || null,
        bankAccountId,
        skipDepartmentLedger: isOld,
      }));
      const { outcomes } = await createManualEntryBatch(payload);
      const nextRows: DraftRow[] = [];
      savable.forEach((row, i) => {
        const outcome = outcomes[i];
        if (!outcome.success) nextRows.push({ ...row, error: outcome.reason });
      });
      for (const r of rows) {
        if (!savable.includes(r)) nextRows.push(r);
      }
      setRows(nextRows);
      router.refresh();
      if (nextRows.length === 0) setPasteText("");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-background"
      >
        הדבקת רשימת הכנסות / הוצאות
      </button>
      {open && (
        <Modal onClose={close}>
          <div className="card p-4 space-y-3 w-[min(95vw,64rem)]">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">הדבקת רשימת הכנסות / הוצאות</h2>
              <button type="button" onClick={close} className="text-sm text-muted">
                סגור
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-muted mb-1">לאיזה חשבון בנק שייכת הרשימה?</label>
                <SearchableSelect
                  value={bankAccountId}
                  onChange={setBankAccountId}
                  options={bankAccounts.map((b) => ({ id: b.id, label: `${b.bank_name} (${b.account_number})` }))}
                  placeholder="בחר חשבון בנק..."
                  required
                  className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-1.5 text-sm sm:mt-6">
                <input type="checkbox" checked={isOld} onChange={(e) => setIsOld(e.target.checked)} />
                זו רשימה ישנה — לא לכלול בחישוב היתרה הנוכחית של המחלקות
              </label>
            </div>

            {rows.length === 0 ? (
              <div className="space-y-2">
                <label className="block text-sm text-muted mb-1">
                  הדבק כאן — עמודות: מחלקה, סוג (הכנסה/הוצאה), סכום, תאריך, הערות
                </label>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  dir="ltr"
                  className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-mono"
                  placeholder={"מחלקה\tסוג\tסכום\tתאריך\tהערות"}
                />
                <button
                  type="button"
                  disabled={!pasteText.trim()}
                  onClick={parse}
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  פרש רשימה
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>מחלקה</th>
                        <th>סוג</th>
                        <th>סכום</th>
                        <th>תאריך</th>
                        <th>הערות</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <SearchableSelect
                              value={row.departmentId}
                              onChange={(id) => update(row.key, { departmentId: id })}
                              options={departments.map((d) => ({ id: d.id, label: d.name }))}
                              placeholder={row.departmentText ? `"${row.departmentText}"?` : "בהמתנה"}
                              className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                            />
                            {!row.departmentId && <span className="text-xs text-warning">ממתין לסיווג</span>}
                          </td>
                          <td>
                            <select
                              value={row.direction}
                              onChange={(e) => update(row.key, { direction: e.target.value as "INCOME" | "EXPENSE" })}
                              className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                            >
                              <option value="EXPENSE">הוצאה</option>
                              <option value="INCOME">הכנסה</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              value={row.amount || ""}
                              onChange={(e) => update(row.key, { amount: Number(e.target.value) || 0 })}
                              className="w-24 rounded border border-border bg-transparent px-1 py-1 text-xs"
                            />
                          </td>
                          <td>
                            <input
                              type="date"
                              value={row.entryDate}
                              onChange={(e) => update(row.key, { entryDate: e.target.value })}
                              className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                            />
                          </td>
                          <td>
                            <input
                              value={row.notes}
                              onChange={(e) => update(row.key, { notes: e.target.value })}
                              className="w-32 rounded border border-border bg-transparent px-1 py-1 text-xs"
                            />
                          </td>
                          <td>
                            <button type="button" onClick={() => removeRow(row.key)} className="text-xs text-danger">
                              ✕
                            </button>
                            {row.error && <p className="text-xs text-danger">{row.error}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={saveAll}
                    className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {isPending ? "שומר…" : `שמור ${rows.length} שורות`}
                  </button>
                  <button type="button" onClick={() => setRows([])} className="text-sm text-muted">
                    חזרה לעריכת ההדבקה
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
