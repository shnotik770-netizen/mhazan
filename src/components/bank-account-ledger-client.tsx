"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { BankAccountLedgerPair } from "@/lib/bank-account-ledger-data";

const KIND_LABEL: Record<BankAccountLedgerPair["transactions"][number]["kind"], string> = {
  income: "הכנסה",
  check: "צ׳ק / העברה",
  manual: "רישום ידני",
  commission: "עמלת אשראי",
};

function nameById(pair: BankAccountLedgerPair, id: string): string {
  return id === pair.accountAId ? pair.accountAName : pair.accountBName;
}

export function BankAccountLedgerTable({ pairs }: { pairs: BankAccountLedgerPair[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (pairs.length === 0) {
    return <p className="text-sm text-muted py-4 text-center">אין חוב פתוח בין חשבונות בנק שונים כרגע.</p>;
  }

  return (
    <div className="space-y-2">
      {pairs.map((pair) => {
        const key = `${pair.accountAId}|${pair.accountBId}`;
        const isOpen = openKey === key;
        const debtorName = nameById(pair, pair.debtorAccountId);
        const creditorName = nameById(pair, pair.creditorAccountId);
        return (
          <div key={key} className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : key)}
              className="w-full flex items-center justify-between gap-2 flex-wrap px-3 py-2 text-sm hover:bg-surface"
            >
              <span>
                <span className="font-semibold text-danger">{debtorName}</span> חייב ל
                <span className="font-semibold text-success"> {creditorName}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{formatCurrency(pair.netAmount)}</span>
                <span className="text-xs text-muted">{isOpen ? "▲ הסתר תנועות" : "▼ הצג תנועות"}</span>
              </span>
            </button>
            {isOpen && (
              <div className="overflow-x-auto border-t border-border">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>תאריך</th>
                      <th>סוג</th>
                      <th>תיאור</th>
                      <th>כיוון</th>
                      <th>סכום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pair.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.date ? formatDate(tx.date) : "—"}</td>
                        <td>{KIND_LABEL[tx.kind]}</td>
                        <td>{tx.description}</td>
                        <td className="text-xs text-muted">
                          {nameById(pair, tx.fromAccountId)} ← {nameById(pair, tx.toAccountId)}
                        </td>
                        <td className={tx.amount < 0 ? "text-danger" : undefined}>{formatCurrency(tx.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
