"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { LedgerFlagToggle } from "@/components/ledger-flag-toggle-client";
import { RowActionsMenu, rowActionButtonClass } from "@/components/row-actions-menu";
import { Modal } from "@/components/modal";
import { CheckDetailLink, PayeeLink } from "@/components/check-detail-client";
import { DonorLink, IncomeDetailLink } from "@/components/income-detail-client";
import { updateCheckPayeeName } from "@/app/(app)/checks/actions";
import { updateIncomeDonorName } from "@/app/(app)/incomes/actions";
import { updateManualEntryNotes } from "@/app/(app)/manual-entries/actions";

type ForecastDetail = {
  donorName: string;
  categoryName: string;
  current: number;
  total: number | null;
  amount: number;
  unlimited?: boolean;
};

type Row = {
  id: string;
  date: string | null;
  typeDetail: string;
  typeCategory: string;
  description: string;
  amount: number;
  spreadTotal?: number | null;
  status?: string | null;
  isOld: boolean;
  kind: "check" | "income" | "manual" | "commission" | "forecast";
  forecastDetails?: ForecastDetail[];
  convertedFromUsd?: boolean;
};

function statusLabel(status: string) {
  if (status === "CLEARED") return "נפרע";
  if (status === "CANCELLED") return "בוטל";
  return "לא נפרע";
}

// A "פרטים" trigger for a forecast row (credit-installment or
// standing-order projection) — opens the list of individual commitments
// that add up to the row's total, from the RowActionsMenu instead of the
// inline expandable disclosure that used to sit in the description cell.
function ForecastDetailButton({ title, details }: { title: string; details: ForecastDetail[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={rowActionButtonClass("primary")}>
        פרטים
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="card p-4 space-y-3 max-w-lg">
            <h3 className="font-semibold">{title}</h3>
            <ul className="space-y-1 text-sm max-h-96 overflow-y-auto">
              {details.map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-2 border-b border-border pb-1">
                  <span>
                    {d.donorName}
                    {d.categoryName ? ` (${d.categoryName})` : ""} —{" "}
                    {d.unlimited ? `חיוב מס׳ ${d.current} (הוראה ללא הגבלת זמן)` : `${d.current}/${d.total}`}
                  </span>
                  <span className="font-medium whitespace-nowrap">{formatCurrency(d.amount)}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm">
              סגור
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// A quick "fix a typo" edit for the row's own name/description field
// (payee for a check, donor for an income, notes for a manual entry) —
// deliberately NOT a full edit form: no amount, date, category or delete,
// just the one text field, reachable from every row without leaving the
// department report. Each kind calls its own narrowly-scoped server
// action, never the full update actions used elsewhere in the app.
function EditDescriptionButton({ id, kind, currentValue }: { id: string; kind: "check" | "income" | "manual"; currentValue: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const label = kind === "check" ? "שם מוטב" : kind === "income" ? "שם תורם" : "תיאור";

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const action =
        kind === "check" ? updateCheckPayeeName(id, value) : kind === "income" ? updateIncomeDonorName(id, value) : updateManualEntryNotes(id, value);
      const result = await action;
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={rowActionButtonClass("primary")}>
        עריכה
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="card p-4 space-y-3 max-w-md">
            <h3 className="font-semibold">תיקון טכני — {label}</h3>
            <p className="text-xs text-muted">
              עריכת דיוק בלבד (למשל תיקון שגיאת כתיב) — לא לשינוי סכום, תאריך או מחלקה.
            </p>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm"
              autoFocus
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
              >
                שמור
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function DepartmentTransactionsTable({
  rows,
  isAdmin,
  departmentId,
  defaultSortDir = "desc",
}: {
  rows: Row[];
  isAdmin: boolean;
  // Optional so this table can also serve the bank-account debt report,
  // which isn't scoped to any one department — PayeeLink/DonorLink already
  // treat a missing departmentId as "search across all departments".
  departmentId?: string;
  defaultSortDir?: "asc" | "desc";
}) {
  const columns: ColumnDef<Row>[] = [
    { key: "date", label: "תאריך", sortValue: (r) => r.date ?? "" },
    {
      key: "direction",
      label: "הכנסה / הוצאה",
      sortValue: (r) => (r.amount >= 0 ? "הכנסה" : "הוצאה"),
      filterValue: (r) => (r.amount >= 0 ? "הכנסה" : "הוצאה"),
    },
    // filterValue uses the coarse typeCategory (a handful of buckets like
    // "אשראי רגיל"/"אשראי תשלומים"/"הוראת קבע") rather than the fully
    // detailed typeDetail — the latter bakes in per-row specifics like a
    // credit installment's own "6/12" progress, which would otherwise turn
    // the filter dropdown into one checkbox per distinct installment.
    { key: "typeDetail", label: "סוג", sortValue: (r) => r.typeDetail, filterValue: (r) => r.typeCategory },
    { key: "description", label: "תיאור", sortValue: (r) => r.description, filterValue: (r) => r.description },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
    {
      key: "status",
      label: "נפרע?",
      sortValue: (r) => (r.status ? statusLabel(r.status) : ""),
      filterValue: (r) => (r.status ? statusLabel(r.status) : "—"),
    },
  ];
  const { rows: filtered, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns, {
    key: "date",
    dir: defaultSortDir,
  });

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <SortFilterTh
              key={col.key}
              col={col}
              allRows={rows}
              sort={sort}
              toggleSort={toggleSort}
              activeFilter={filters[col.key]}
              setColumnFilter={setColumnFilter}
            />
          ))}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((r) => (
          <tr key={r.id} className={r.isOld ? "opacity-60" : undefined}>
            <td>{r.date ? formatDate(r.date) : "—"}</td>
            <td className={r.amount >= 0 ? "text-success" : "text-danger"}>{r.amount >= 0 ? "הכנסה" : "הוצאה"}</td>
            <td>{r.typeDetail}</td>
            <td>
              {r.kind === "check" ? (
                <PayeeLink payee={r.description} departmentId={departmentId} />
              ) : r.kind === "income" ? (
                <DonorLink donorName={r.description} departmentId={departmentId} />
              ) : (
                r.description
              )}
              {r.spreadTotal != null && (
                <span className="badge bg-background text-muted mr-1">פריסה · סה״כ {formatCurrency(r.spreadTotal)}</span>
              )}
              {r.convertedFromUsd && <span className="badge bg-background text-muted mr-1">הומר מדולר</span>}
              {r.isOld && <span className="badge bg-warning-bg text-warning mr-1">ישן — לא נכלל במאזן</span>}
            </td>
            <td className={r.amount >= 0 ? "text-success" : "text-danger"}>{formatCurrency(r.amount)}</td>
            <td>
              {r.status ? (
                <span
                  className={`badge ${
                    r.status === "CLEARED"
                      ? "bg-success-bg text-success"
                      : r.status === "CANCELLED"
                        ? "bg-background text-muted"
                        : "bg-warning-bg text-warning"
                  }`}
                >
                  {statusLabel(r.status)}
                </span>
              ) : (
                "—"
              )}
            </td>
            <td>
              {(r.kind === "check" ||
                r.kind === "income" ||
                (r.kind === "forecast" && (r.forecastDetails?.length ?? 0) > 0) ||
                (isAdmin && r.kind === "manual")) && (
                <RowActionsMenu>
                  {r.kind === "check" && <CheckDetailLink checkId={r.id} variant="menu" />}
                  {r.kind === "income" && <IncomeDetailLink incomeId={r.id} variant="menu" />}
                  {r.kind === "forecast" && r.forecastDetails && r.forecastDetails.length > 0 && (
                    <ForecastDetailButton title={r.description} details={r.forecastDetails} />
                  )}
                  {isAdmin && (r.kind === "check" || r.kind === "income" || r.kind === "manual") && (
                    <EditDescriptionButton id={r.id} kind={r.kind} currentValue={r.description} />
                  )}
                  {isAdmin && (r.kind === "check" || r.kind === "income") && (
                    <LedgerFlagToggle id={r.id} kind={r.kind} skipDepartmentLedger={r.isOld} />
                  )}
                </RowActionsMenu>
              )}
            </td>
          </tr>
        ))}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={7} className="text-center text-muted py-6">
              אין תנועות
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
