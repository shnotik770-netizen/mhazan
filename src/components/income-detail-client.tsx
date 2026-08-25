"use client";

import { useEffect, useState } from "react";
import {
  getIncomeDetail,
  getIncomesByDonor,
  type DonorIncomeRow,
  type IncomeDetail,
} from "@/app/(app)/incomes/actions";
import { Modal } from "@/components/modal";
import { rowActionButtonClass } from "@/components/row-actions-menu";
import { useSortFilter, SortFilterTh, type ColumnDef } from "@/components/sortable-table";
import { formatCurrency, formatDate } from "@/lib/format";

function installmentLabel(current: number | null, total: number | null, typeText: string | null): string | null {
  if (current != null && total != null) return `${current}/${total}`;
  return typeText || null;
}

// A "פרטים" trigger next to an income row — opens every field captured for
// that income (donor, category, payment method/type, receipt/order/
// transaction numbers, bank account, notes), not just what fits the table.
// `variant="menu"` renders it as a full-width row-action-menu button
// instead of the default small underlined link, for callers that place it
// inside RowActionsMenu (mirrors CheckDetailLink's same variant).
export function IncomeDetailLink({ incomeId, variant = "link" }: { incomeId: string; variant?: "link" | "menu" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={variant === "menu" ? rowActionButtonClass("primary") : "text-xs text-primary underline whitespace-nowrap"}
      >
        פרטים
      </button>
      {open && <IncomeDetailModal incomeId={incomeId} onClose={() => setOpen(false)} />}
    </>
  );
}

function IncomeDetailModal({ incomeId, onClose }: { incomeId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<IncomeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getIncomeDetail(incomeId);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setDetail(result.detail ?? null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [incomeId]);

  const type = detail ? installmentLabel(detail.installmentCurrent, detail.installmentTotal, detail.typeText) : null;

  return (
    <Modal onClose={onClose}>
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">פרטי הכנסה</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted">
            סגור
          </button>
        </div>
        {loading && <p className="text-sm text-muted">טוען...</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {detail && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted">תורם: </span>
              {detail.donorName || "—"}
            </div>
            <div>
              <span className="text-muted">ת&quot;ז: </span>
              {detail.donorIdNumber || "—"}
            </div>
            <div>
              <span className="text-muted">תאריך: </span>
              {formatDate(detail.date)}
            </div>
            <div>
              <span className="text-muted">סכום: </span>
              {formatCurrency(detail.amount)}
            </div>
            <div>
              <span className="text-muted">מחלקה: </span>
              {detail.departmentName || "—"}
            </div>
            <div>
              <span className="text-muted">קטגוריה: </span>
              {detail.categoryName || "—"}
            </div>
            <div>
              <span className="text-muted">מקור: </span>
              {detail.paymentMethod || "—"}
            </div>
            <div>
              <span className="text-muted">סוג: </span>
              {type || "—"}
            </div>
            <div>
              <span className="text-muted">חשבון בנק: </span>
              {detail.bankName ? `${detail.bankName} (${detail.accountNumber})` : "—"}
            </div>
            <div>
              <span className="text-muted">מס׳ קבלה: </span>
              {detail.receiptNumber || "—"}
            </div>
            <div>
              <span className="text-muted">מס׳ הוראה: </span>
              {detail.orderRef || "—"}
            </div>
            <div>
              <span className="text-muted">מס׳ עסקה: </span>
              {detail.transactionRef || "—"}
            </div>
            {detail.notes && (
              <div className="col-span-2">
                <span className="text-muted">הערות: </span>
                {detail.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Donor name rendered as a link — opens every income recorded under that
// exact name. `departmentId`, when passed (e.g. from inside one
// department's report), narrows this to that department only, even for
// an admin who could otherwise see it across the whole system.
export function DonorLink({ donorName, departmentId }: { donorName: string; departmentId?: string }) {
  const [open, setOpen] = useState(false);
  if (!donorName || donorName === "—") return <>{donorName}</>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary underline decoration-dotted hover:decoration-solid text-right"
      >
        {donorName}
      </button>
      {open && <DonorIncomesModal donorName={donorName} departmentId={departmentId} onClose={() => setOpen(false)} />}
    </>
  );
}

function DonorIncomesModal({
  donorName,
  departmentId,
  onClose,
}: {
  donorName: string;
  departmentId?: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<DonorIncomeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getIncomesByDonor(donorName, departmentId);
      if (cancelled) return;
      setRows(result.rows);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [donorName, departmentId]);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Modal onClose={onClose}>
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">כל ההכנסות עבור: {donorName}</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted">
            סגור
          </button>
        </div>
        {loading && <p className="text-sm text-muted">טוען...</p>}
        {!loading && (
          <>
            <p className="text-sm text-muted">
              {rows.length} הכנסות — סה״כ {formatCurrency(total)}
            </p>
            <div className="overflow-x-auto">
              <DonorIncomesTable rows={rows} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function DonorIncomesTable({ rows }: { rows: DonorIncomeRow[] }) {
  const columns: ColumnDef<DonorIncomeRow>[] = [
    { key: "date", label: "תאריך", sortValue: (r) => r.date },
    { key: "amount", label: "סכום", sortValue: (r) => r.amount },
    { key: "category", label: "קטגוריה", sortValue: (r) => r.categoryName ?? "", filterValue: (r) => r.categoryName ?? "—" },
    { key: "department", label: "מחלקה", sortValue: (r) => r.departmentName ?? "", filterValue: (r) => r.departmentName ?? "—" },
    { key: "method", label: "מקור", sortValue: (r) => r.paymentMethod ?? "", filterValue: (r) => r.paymentMethod ?? "—" },
    {
      key: "type",
      label: "סוג",
      sortValue: (r) => installmentLabel(r.installmentCurrent, r.installmentTotal, r.typeText) ?? "",
    },
    { key: "receipt", label: "מס׳ קבלה", sortValue: (r) => r.receiptNumber ?? "" },
  ];
  const { rows: sorted, sort, toggleSort, filters, setColumnFilter } = useSortFilter(rows, columns);

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
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <td>{formatDate(r.date)}</td>
            <td>{formatCurrency(r.amount)}</td>
            <td>{r.categoryName || "—"}</td>
            <td>{r.departmentName || "—"}</td>
            <td>{r.paymentMethod || "—"}</td>
            <td>{installmentLabel(r.installmentCurrent, r.installmentTotal, r.typeText) || "—"}</td>
            <td>{r.receiptNumber || "—"}</td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={7} className="text-center text-muted py-4">
              אין הכנסות
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
