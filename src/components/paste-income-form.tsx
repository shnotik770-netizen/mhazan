"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  checkExistingTransactionRefs,
  lookupUsdIlsRate,
  submitIncomeBatch,
  type IncomeBatchRow,
  type SplitAllocation,
} from "@/app/(app)/incomes/actions";
import { findOrCreateCategoryByName, updateCategory } from "@/app/(app)/categories/actions";
import { SplitAllocationEditor } from "@/components/split-allocation-editor";
import { formatCurrency } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

type BankAccount = Tables<"bank_accounts"> & { departments: { name: string } | null };
type Category = Tables<"categories"> & { departments: { name: string } | null };
type Department = Tables<"departments">;

type ParsedRow = IncomeBatchRow & {
  raw: string;
  categoryText: string;
  currencyText: string;
  isCancelled: boolean;
  duplicateReason: string | null;
  saveError: string | null;
};

// Known header aliases for the real bank/CRM export (16 columns, order
// varies): תאריך, מקור, תורם, ת"ז, כתובת, טלפון, מייל, קטגוריה, הערות,
// סוג, סכום, מטבע, סטטוס, מספר קבלה, מספר הוראה, מספר עסקה. Only the
// columns we actually use are mapped into structured fields; ALL columns
// (mapped or not) are kept verbatim in rawPasteData for the record's history.
const HEADER_FIELD_MAP: Record<string, string> = {
  תאריך: "date",
  קטגוריה: "category",
  תורם: "donorName",
  שםתורם: "donorName",
  תז: "donorId",
  סכום: "amount",
  מטבע: "currency",
  מספרקבלה: "receiptNumber",
  הערות: "notes",
  סטטוס: "status",
  מספרעסקה: "transactionRef",
  מספרהוראה: "orderRef",
  מקור: "paymentMethod",
  סוג: "installmentText",
};

// A "מטבע" column carrying anything other than shekels ("$"/"USD"/"דולר")
// means the pasted amount is still in the original foreign currency, not
// what the account actually received — it needs converting to ILS using
// that day's rate before it means anything as an income row.
function isUsdCurrencyText(text: string): boolean {
  return /\$|usd|דולר/i.test(text.trim());
}

// "סוג" often carries the installment count for a credit-card standing
// payment ("תשלום 4 מתוך 12", "4/12" — both seen in real exports). Parsed
// out so a department/forecast report can rely on how many payments are
// left, instead of every admin having to read the free text themselves.
function parseInstallment(text: string): { current: number | null; total: number | null } {
  const trimmed = text.trim();
  if (!trimmed) return { current: null, total: null };
  const match = trimmed.match(/(\d+)\s*(?:\/|מתוך)\s*(\d+)/);
  if (!match) return { current: null, total: null };
  return { current: Number(match[1]), total: Number(match[2]) };
}
const REQUIRED_HEADER_KEYS = ["date", "category", "amount"];

function normalizeHeaderText(text: string): string {
  return text.trim().replace(/["'׳״]/g, "").replace(/\s+/g, "");
}

function detectHeaderMapping(headerCols: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerCols.forEach((col, idx) => {
    const key = HEADER_FIELD_MAP[normalizeHeaderText(col)];
    if (key && !(key in map)) map[key] = idx;
  });
  return map;
}

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

function isCancelledStatus(text: string): boolean {
  return /בוטל/.test(text);
}

// Tab-delimited rows are split on tabs only — never also on commas, since a
// free-text field (an address, "עפולה,גבעת המורה") can legitimately contain
// one, and splitting there would shift every column after it by one and
// silently corrupt the row (e.g. an email column landing where "קטגוריה"
// was expected). Comma-splitting only kicks in as a fallback for a genuine
// comma-separated paste that has no tabs at all.
function splitPastedLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  return line.split(/,(?!\d{3})/);
}

function parsePastedLines(text: string): string[][] {
  return text
    .trim()
    .split("\n")
    .map((line) => splitPastedLine(line).map((c) => c.trim()))
    .filter((cols) => cols.some((c) => c.length > 0));
}

function guessCategory(text: string, categories: Category[]): string {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "";
  const exact = categories.find((c) => c.name.toLowerCase() === normalized);
  if (exact) return exact.id;
  const partial = categories.find(
    (c) => c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase()),
  );
  return partial?.id ?? "";
}

// Legacy fallback (no header row): fixed 6-column order.
const LEGACY_POSITIONS: Record<string, number> = {
  date: 0,
  category: 1,
  donorName: 2,
  amount: 3,
  receiptNumber: 4,
  notes: 5,
};

export function PasteIncomeForm({
  bankAccounts,
  categories: initialCategories,
  departments,
}: {
  bankAccounts: BankAccount[];
  categories: Category[];
  departments: Department[];
}) {
  const router = useRouter();
  const [categoryList, setCategoryList] = useState<Category[]>(initialCategories);
  const [bankAccountId, setBankAccountId] = useState("");
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [isHistoryPaste, setIsHistoryPaste] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headerWarning, setHeaderWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success" | "warning"; text: string } | null>(null);
  const [isResolvingCategories, setIsResolvingCategories] = useState(false);
  const [isPending, startTransition] = useTransition();

  const categoryById = (id: string) => categoryList.find((c) => c.id === id);

  function rowIsSavable(row: ParsedRow): boolean {
    if (row.isCancelled || row.duplicateReason) return false;
    const category = row.categoryId ? categoryById(row.categoryId) : undefined;
    if (!category) return false;
    if (category.is_split) {
      return row.splitAllocations.some((a) => a.departmentId && a.amount > 0);
    }
    return category.department_id != null && row.amount > 0;
  }

  // A row that previously failed to save keeps showing that error even if
  // its fields now look otherwise valid — it still needs a human to look at
  // it before the next submit, not just get silently retried.
  function rowNeedsReview(row: ParsedRow): boolean {
    return !rowIsSavable(row) || Boolean(row.saveError);
  }

  // Every row that needs a decision (cancelled, duplicate, unassigned
  // category, previous save failure, etc.) is grouped first, in its
  // original relative order, followed by everything that pasted cleanly —
  // so reviewing a big paste means working through one contiguous block at
  // the top instead of hunting for warning-highlighted rows scattered
  // through the whole list.
  const orderedRows = useMemo(() => {
    const indexed = rows.map((row, originalIndex) => ({ row, originalIndex, needsReview: rowNeedsReview(row) }));
    const needsReview = indexed.filter((r) => r.needsReview);
    const clean = indexed.filter((r) => !r.needsReview);
    return [...needsReview, ...clean];
  }, [rows, categoryList]);
  const needsReviewCount = orderedRows.filter((r) => r.needsReview).length;

  const validCount = useMemo(() => rows.filter(rowIsSavable).length, [rows, categoryList]);
  const pendingCategoryCount = useMemo(
    () =>
      rows.filter(
        (r) => !r.isCancelled && r.categoryId && categoryById(r.categoryId)?.department_id == null && !categoryById(r.categoryId)?.is_split,
      ).length,
    [rows, categoryList],
  );
  // Every distinct category actually referenced by this paste that still
  // needs a department — surfaced as one consolidated checklist at the top
  // of the preview, right when the paste happens, instead of only a count
  // buried below the table after scrolling past every row.
  const pendingCategoriesInRows = useMemo(() => {
    const ids = new Set(rows.filter((r) => !r.isCancelled && r.categoryId).map((r) => r.categoryId));
    return [...ids]
      .map((id) => categoryById(id))
      .filter((c): c is Category => c != null && c.department_id == null && !c.is_split);
  }, [rows, categoryList]);

  async function handlePaste(text: string) {
    const allLines = parsePastedLines(text);
    if (allLines.length === 0) {
      setRows([]);
      return;
    }

    let fieldMap: Record<string, number> | null = null;
    let dataLines = allLines;
    setHeaderWarning(null);

    if (hasHeaderRow) {
      fieldMap = detectHeaderMapping(allLines[0]);
      dataLines = allLines.slice(1);
      const missing = REQUIRED_HEADER_KEYS.filter((k) => !(fieldMap && k in fieldMap));
      if (missing.length > 0) {
        const missingLabels = missing
          .map((k) => (k === "date" ? "תאריך" : k === "category" ? "קטגוריה" : "סכום"))
          .join(", ");
        setHeaderWarning(
          `לא זוהו בשורת הכותרת העמודות: ${missingLabels} — בדקו שהעמודות תואמות, או סמנו "בלי שורת כותרת" אם הדבקתם רק נתונים.`,
        );
      }
    }

    function getField(cols: string[], key: string): string {
      if (fieldMap && key in fieldMap) return (cols[fieldMap[key]] ?? "").trim();
      if (!hasHeaderRow && key in LEGACY_POSITIONS) return (cols[LEGACY_POSITIONS[key]] ?? "").trim();
      return "";
    }

    const headerCols = hasHeaderRow ? allLines[0] : null;

    const initialRows: ParsedRow[] = dataLines.map((cols) => {
      const categoryText = getField(cols, "category");
      const amountText = getField(cols, "amount");

      // Keep every pasted column verbatim (by its header name when known,
      // otherwise by position) so nothing from the bank export is lost —
      // only the fields we actually use get parsed into structured columns.
      const rawPasteData: Record<string, string> = {};
      cols.forEach((val, idx) => {
        const key = headerCols?.[idx]?.trim() || `עמודה ${idx + 1}`;
        if (val) rawPasteData[key] = val;
      });

      const typeText = getField(cols, "installmentText");
      const installment = parseInstallment(typeText);

      return {
        raw: cols.join(" | "),
        categoryText,
        currencyText: getField(cols, "currency"),
        date: normalizeDate(getField(cols, "date")),
        categoryId: guessCategory(categoryText, categoryList),
        donorName: getField(cols, "donorName"),
        donorIdNumber: getField(cols, "donorId"),
        amount: Number(amountText.replace(/[^\d.-]/g, "")) || 0,
        receiptNumber: getField(cols, "receiptNumber"),
        transactionRef: getField(cols, "transactionRef"),
        orderRef: getField(cols, "orderRef"),
        paymentMethod: getField(cols, "paymentMethod"),
        installmentCurrent: installment.current,
        installmentTotal: installment.total,
        // Kept verbatim regardless of whether it also parsed as an
        // installment fraction — even plain values like "העברה"/"מזומן"
        // matter for later forecast/recurring-schedule reporting.
        typeText,
        notes: getField(cols, "notes"),
        isCancelled: isCancelledStatus(getField(cols, "status")),
        splitAllocations: [],
        duplicateReason: null,
        saveError: null,
        rawPasteData,
      };
    });

    // Flag duplicate transaction numbers: repeated within this paste, or
    // already recorded from an earlier paste (e.g. an overlapping
    // date-range export re-including a previous month's installment row).
    const refCounts = new Map<string, number>();
    for (const r of initialRows) {
      if (!r.transactionRef) continue;
      refCounts.set(r.transactionRef, (refCounts.get(r.transactionRef) ?? 0) + 1);
    }
    const seenInBatch = new Set<string>();
    for (const r of initialRows) {
      if (!r.transactionRef) continue;
      if ((refCounts.get(r.transactionRef) ?? 0) > 1) {
        if (seenInBatch.has(r.transactionRef)) {
          r.duplicateReason = "כפול בתוך ההדבקה הזו";
        }
        seenInBatch.add(r.transactionRef);
      }
    }

    setRows(initialRows);
    setMessage(null);

    const refsToCheck = Array.from(new Set(initialRows.map((r) => r.transactionRef).filter(Boolean)));
    if (refsToCheck.length > 0) {
      checkExistingTransactionRefs(refsToCheck)
        .then((existingRefs) => {
          if (existingRefs.length === 0) return;
          const existingSet = new Set(existingRefs);
          setRows((prev) =>
            prev.map((r) =>
              r.transactionRef && existingSet.has(r.transactionRef)
                ? { ...r, duplicateReason: "כבר קיים במערכת (מספר עסקה)" }
                : r,
            ),
          );
        })
        .catch(() => {
          // Non-fatal — the DB's unique constraint still protects against
          // an actual duplicate insert if this check fails silently.
        });
    }

    // Rows whose "מטבע" column says USD are still holding the original
    // dollar amount — convert each to ILS using that row's own date before
    // it's savable. One rate lookup per distinct date covers every row on
    // that date. A row whose lookup fails is blocked from saving via
    // duplicateReason (same field that already blocks a duplicate
    // transaction ref) — rowIsSavable doesn't look at saveError, so that
    // field alone wouldn't actually stop a still-in-dollars amount from
    // being saved as if it were already shekels.
    const usdDates = Array.from(
      new Set(initialRows.filter((r) => isUsdCurrencyText(r.currencyText) && r.date).map((r) => r.date)),
    );
    if (usdDates.length > 0) {
      Promise.all(usdDates.map(async (date) => [date, await lookupUsdIlsRate(date)] as const))
        .then((results) => {
          const rateByDate = new Map(results);
          setRows((prev) =>
            prev.map((r) => {
              if (!isUsdCurrencyText(r.currencyText) || !r.date) return r;
              const result = rateByDate.get(r.date);
              if (!result || "error" in result) {
                return { ...r, duplicateReason: result && "error" in result ? result.error : "שגיאה בשליפת שער דולר" };
              }
              const originalAmount = r.amount;
              const convertedAmount = Math.round(originalAmount * result.rate * 100) / 100;
              const conversionNote = `הומר מ-$${originalAmount.toFixed(2)} לפי שער ${result.rate.toFixed(4)} ליום ${result.asOfDate}`;
              return {
                ...r,
                amount: convertedAmount,
                notes: r.notes ? `${r.notes} | ${conversionNote}` : conversionNote,
              };
            }),
          );
        })
        .catch(() => {
          setRows((prev) =>
            prev.map((r) =>
              isUsdCurrencyText(r.currencyText) && r.date ? { ...r, duplicateReason: "שגיאה בשליפת שער דולר" } : r,
            ),
          );
        });
    }

    // Any category text that didn't match an existing category becomes a
    // new pending category (no department yet) instead of forcing manual
    // selection for every unrecognized name.
    const unmatchedNames = Array.from(
      new Set(
        initialRows.filter((r) => r.categoryText && !r.categoryId && !r.isCancelled).map((r) => r.categoryText),
      ),
    );
    if (unmatchedNames.length === 0) return;

    setIsResolvingCategories(true);
    try {
      const created = await Promise.all(unmatchedNames.map((name) => findOrCreateCategoryByName(name)));
      setCategoryList((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        for (const c of created) byId.set(c.id, { ...c, departments: null });
        return Array.from(byId.values());
      });
      setRows((prev) =>
        prev.map((r) => {
          if (r.categoryId || !r.categoryText) return r;
          const match = created.find((c) => c.name.toLowerCase() === r.categoryText.toLowerCase());
          return match ? { ...r, categoryId: match.id } : r;
        }),
      );
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "שגיאה בזיהוי קטגוריות" });
    } finally {
      setIsResolvingCategories(false);
    }
  }

  function updateRow(index: number, patch: Partial<ParsedRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function updateAllocations(index: number, allocations: SplitAllocation[]) {
    updateRow(index, { splitAllocations: allocations });
  }

  // Assign a department to a pending category right here in the paste
  // preview, without navigating away (and losing everything pasted so far).
  async function assignCategoryDepartment(categoryId: string, departmentId: string) {
    const fd = new FormData();
    fd.set("id", categoryId);
    const category = categoryById(categoryId);
    fd.set("name", category?.name ?? "");
    fd.set("department_id", departmentId);
    await updateCategory(fd);
    setCategoryList((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, department_id: departmentId } : c)),
    );
  }

  function handleSubmit() {
    const remainingForReview = rows.length - validCount;
    const confirmMessage =
      remainingForReview > 0
        ? `להכניס ${validCount} שורות תקינות עכשיו? ${remainingForReview} שורות שדורשות טיפול יישארו למטה להמשך עבודה.`
        : `להכניס ${validCount} שורות הכנסה?`;
    if (!confirm(confirmMessage)) return;

    setMessage(null);
    startTransition(async () => {
      const savableIndexes = rows.map((r, i) => (rowIsSavable(r) ? i : -1)).filter((i) => i >= 0);
      const savableRows = savableIndexes.map((i) => rows[i]);
      const result = await submitIncomeBatch(bankAccountId, savableRows, isHistoryPaste);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      const failedOriginalIndexes = new Set<number>();
      result.outcomes.forEach((outcome, j) => {
        const originalIndex = savableIndexes[j];
        if (!outcome.success) {
          failedOriginalIndexes.add(originalIndex);
        }
      });

      const failedCount = result.outcomes.filter((o) => !o.success).length;
      const missed = result.missedStandingOrders ?? [];
      const missedText =
        missed.length > 0
          ? "\n\nשים לב: " +
            missed
              .map(
                (m) =>
                  `הוראת קבע ${m.orderRef} (${m.donorName}${m.categoryName ? `, ${m.categoryName}` : ""}, ${formatCurrency(m.amount)}) לא נמצאה בהכנסות ${m.departmentName} לחודש ${m.month} — ראה הערה בדוח המחלקה`,
              )
              .join("\n")
          : "";
      setMessage({
        type: failedCount > 0 ? "error" : missed.length > 0 ? "warning" : "success",
        text:
          `נשמרו ${result.savedCount} שורות הכנסה בהצלחה` +
          (failedCount > 0 ? ` — ${failedCount} שורות נכשלו ונשארו למטה לטיפול (הסיבה מוצגת ליד כל שורה)` : "") +
          missedText,
      });
      // Rows that weren't part of this save (still need review) are kept
      // completely untouched here — they stay in the list waiting for the
      // admin to fix/assign them or explicitly remove them, exactly as
      // before the save. Only rows that were actually submitted change:
      // dropped on success, or annotated with the failure reason.
      setRows((prev) =>
        prev
          .map((r, i) => {
            if (!savableIndexes.includes(i)) return r;
            if (failedOriginalIndexes.has(i)) {
              const outcome = result.outcomes[savableIndexes.indexOf(i)];
              return { ...r, saveError: outcome.reason ?? "שגיאה בשמירה" };
            }
            return null;
          })
          .filter((r): r is ParsedRow => r !== null),
      );
      router.refresh();
    });
  }

  // Explicitly drops one row from the current pasted batch (e.g. a
  // duplicate/irrelevant row that isn't worth fixing) — removes it from the
  // preview entirely without saving anything.
  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <datalist id="income-payment-methods">
        <option value="חד פעמי" />
        <option value="הוראת קבע" />
        <option value="אשראי" />
        <option value="העברה" />
        <option value="אחר" />
      </datalist>
      <div className="card p-4">
        <label className="block text-sm font-medium mb-1">
          לאיזה חשבון בנק / מחלקה נכנס הכסף בפועל?
        </label>
        <select
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
        >
          <option value="">בחר חשבון בנק...</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.departments?.name} — {b.bank_name} ({b.account_number})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm mt-3 pt-3 border-t border-border">
          <input type="checkbox" checked={isHistoryPaste} onChange={(e) => setIsHistoryPaste(e.target.checked)} />
          <span>
            זו הדבקת היסטוריה — <span className="text-muted">לא לכלול בחישוב המחלקה (מסומן &quot;ישן&quot;, כמו הוראת &quot;סמן כישנה&quot; בדוח)</span>
          </span>
        </label>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">
            הדבק כאן שורות מהבנק/מהמערכת (כולל שורת כותרת בדרך כלל)
          </label>
          <label className="flex items-center gap-1 text-sm text-muted">
            <input
              type="checkbox"
              checked={hasHeaderRow}
              onChange={(e) => setHasHeaderRow(e.target.checked)}
            />
            השורה הראשונה היא שורת כותרת
          </label>
        </div>
        <textarea
          className="w-full h-28 rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder={bankAccountId ? "הדבק כאן (Ctrl+V) שורות מודבקות..." : "יש לבחור קודם חשבון בנק למעלה"}
          disabled={!bankAccountId}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text) {
              e.preventDefault();
              handlePaste(text);
            }
          }}
          onChange={(e) => handlePaste(e.target.value)}
        />
        {!bankAccountId && (
          <p className="text-xs text-warning mt-1">⚠ יש לבחור חשבון בנק למעלה לפני ההדבקה.</p>
        )}
        <p className="text-xs text-muted mt-1">
          שם קטגוריה שלא קיים במערכת ייווצר אוטומטית כקטגוריה חדשה הממתינה לשיוך מחלקה — ניתן לשייך אותה
          ישירות כאן למטה, בלי לעזוב את המסך. כל הנתונים המקוריים מההדבקה נשמרים בהיסטוריית ההכנסה.
        </p>
        {headerWarning && <p className="text-xs text-warning mt-1">⚠ {headerWarning}</p>}
      </div>

      {rows.length > 0 && (
        <div className="card p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">
              תצוגה מקדימה — {rows.length} שורות ({validCount} תקינות לשמירה
              {pendingCategoryCount > 0 ? `, ${pendingCategoryCount} ממתינות לשיוך קטגוריה` : ""})
            </h3>
            {isResolvingCategories && <span className="text-sm text-muted">מזהה קטגוריות...</span>}
          </div>

          {(isResolvingCategories || pendingCategoriesInRows.length > 0) && (
            <div className="rounded-lg border border-warning/40 bg-warning-bg p-3 mb-3">
              {isResolvingCategories ? (
                <p className="text-sm text-warning">מזהה קטגוריות חדשות מתוך ההדבקה...</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-warning mb-2">
                    ⚠ יש לשייך מחלקה לקטגוריות הבאות לפני שהשורות שלהן יישמרו:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pendingCategoriesInRows.map((c) => (
                      <div key={c.id} className="flex items-center gap-1 rounded-lg bg-background px-2 py-1 text-sm">
                        <span>{c.name}</span>
                        <select
                          className="bg-transparent border-b border-border text-xs"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) assignCategoryDepartment(c.id, e.target.value);
                          }}
                        >
                          <option value="">שייך מחלקה...</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>קטגוריה</th>
                <th>שם תורם</th>
                <th>סכום</th>
                <th>מקור</th>
                <th>סוג</th>
                <th>מס׳ קבלה</th>
                <th>מס׳ הוראה</th>
                <th>הערות</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map(({ row, originalIndex, needsReview }, displayIndex) => {
                const category = row.categoryId ? categoryById(row.categoryId) : undefined;
                const isPendingCategory = Boolean(row.categoryId) && category?.department_id == null && !category?.is_split;
                const isFirstOfGroup =
                  displayIndex === 0 || orderedRows[displayIndex - 1].needsReview !== needsReview;
                const i = originalIndex;
                return (
                  <Fragment key={i}>
                    {isFirstOfGroup && (
                      <tr>
                        <td colSpan={10} className={`border-t-2 border-border py-1.5 text-xs font-semibold ${needsReview ? "text-warning" : "text-success"}`}>
                          {needsReview
                            ? `⚠ דורש בדיקה ואישור — ${needsReviewCount} שורות`
                            : `✓ נדבק תקין — ${orderedRows.length - needsReviewCount} שורות`}
                        </td>
                      </tr>
                    )}
                    <tr className={!rowIsSavable(row) ? "bg-warning-bg" : ""}>
                    <td>
                      {row.isCancelled ? (
                        <span className="badge bg-danger-bg text-danger">בוטלה</span>
                      ) : (
                        <input
                          className="w-32 bg-transparent border-b border-border text-sm"
                          value={row.date}
                          onChange={(e) => updateRow(i, { date: e.target.value })}
                          placeholder="YYYY-MM-DD"
                        />
                      )}
                    </td>
                    <td>
                      <select
                        className="bg-transparent border-b border-border text-sm max-w-48"
                        value={row.categoryId}
                        onChange={(e) => updateRow(i, { categoryId: e.target.value })}
                      >
                        <option value="">לא זוהתה — בחר ידנית</option>
                        {categoryList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.is_split ? "מפוצלת בין מחלקות" : c.department_id ? c.departments?.name ?? "משויכת" : "ממתין לשיוך"})
                          </option>
                        ))}
                      </select>
                      {isPendingCategory && category && (
                        <div className="mt-1 flex items-center gap-1">
                          <select
                            className="bg-transparent border-b border-border text-xs"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) assignCategoryDepartment(category.id, e.target.value);
                            }}
                          >
                            <option value="">⏳ שייך מחלקה...</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {row.duplicateReason && (
                        <p className="text-xs text-danger">⛔ {row.duplicateReason} — לא יישמר</p>
                      )}
                      {row.saveError && <p className="text-xs text-danger">⛔ נכשל: {row.saveError}</p>}
                      {category?.is_split && (
                        <SplitAllocationEditor
                          departments={departments}
                          totalAmount={row.amount}
                          allocations={row.splitAllocations}
                          onChange={(allocs) => updateAllocations(i, allocs)}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        className="w-32 bg-transparent border-b border-border text-sm"
                        value={row.donorName}
                        onChange={(e) => updateRow(i, { donorName: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="w-24 bg-transparent border-b border-border text-sm"
                        type="number"
                        value={row.amount || ""}
                        onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        className="w-24 bg-transparent border-b border-border text-sm"
                        list="income-payment-methods"
                        value={row.paymentMethod}
                        onChange={(e) => updateRow(i, { paymentMethod: e.target.value })}
                        placeholder="אשראי / העברה..."
                      />
                    </td>
                    <td>
                      {row.installmentCurrent != null || row.installmentTotal != null ? (
                        <div className="flex items-center gap-0.5">
                          <input
                            className="w-10 bg-transparent border-b border-border text-sm"
                            type="number"
                            value={row.installmentCurrent ?? ""}
                            onChange={(e) => updateRow(i, { installmentCurrent: e.target.value ? Number(e.target.value) : null })}
                            placeholder="תשלום"
                            title="תשלום מספר"
                          />
                          <span className="text-muted text-xs">/</span>
                          <input
                            className="w-10 bg-transparent border-b border-border text-sm"
                            type="number"
                            value={row.installmentTotal ?? ""}
                            onChange={(e) => updateRow(i, { installmentTotal: e.target.value ? Number(e.target.value) : null })}
                            placeholder="סה״כ"
                            title="סה״כ תשלומים"
                          />
                        </div>
                      ) : (
                        // Not an "X מתוך Y" fraction — show the raw pasted
                        // value as-is (e.g. "הו״ק", "העברה") instead of two
                        // empty boxes that make it look like nothing was
                        // captured, even though it's kept in type_text.
                        <input
                          className="w-20 bg-transparent border-b border-border text-sm"
                          value={row.typeText}
                          onChange={(e) => updateRow(i, { typeText: e.target.value })}
                          placeholder="סוג"
                        />
                      )}
                    </td>
                    <td>
                      <input
                        className="w-20 bg-transparent border-b border-border text-sm"
                        value={row.receiptNumber}
                        onChange={(e) => updateRow(i, { receiptNumber: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="w-20 bg-transparent border-b border-border text-sm"
                        value={row.orderRef}
                        onChange={(e) => updateRow(i, { orderRef: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="w-32 bg-transparent border-b border-border text-sm"
                        value={row.notes}
                        onChange={(e) => updateRow(i, { notes: e.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        title="דלג על השורה — הסרה מהרשימה בלי לשמור"
                        className="text-xs text-muted hover:text-danger"
                      >
                        ✕ דלג
                      </button>
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {pendingCategoryCount > 0 && (
            <p className="text-sm text-warning mt-2">
              ⚠ {pendingCategoryCount} שורות לא יישמרו כרגע כי הקטגוריה שלהן ממתינה לשיוך מחלקה — שייכו
              אותה ישירות בטבלה למעלה.
            </p>
          )}
        </div>
      )}

      {message && (
        <div
          className={`card px-4 py-3 text-sm whitespace-pre-line ${
            message.type === "error"
              ? "bg-danger-bg text-danger"
              : message.type === "warning"
                ? "bg-warning-bg text-warning"
                : "bg-success-bg text-success"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        disabled={isPending || !bankAccountId || validCount === 0}
        onClick={handleSubmit}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {isPending ? "שומר..." : `שמור ${validCount} שורות הכנסה`}
      </button>
    </div>
  );
}
