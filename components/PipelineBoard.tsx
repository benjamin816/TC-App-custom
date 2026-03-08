'use client';

import { Transaction } from '@/lib/google-sheets';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useState, useTransition } from 'react';
import { User, Calendar as CalendarIcon, ArrowRight, PlusCircle, GripVertical } from 'lucide-react';
import { updateTransactionStatusAction } from '@/app/actions/transactions';
import { BoardStatus, normalizeTransactionStatus } from '@/lib/google-sheets';

const STAGES: { key: BoardStatus; label: string }[] = [
  { key: 'InitialUC', label: 'Initial UC' },
  { key: 'DueDiligencePeriod', label: 'Due Diligence Period' },
  { key: 'PostDD', label: 'Post DD' },
  { key: 'ClearToClose', label: 'Clear to Close' },
  { key: 'Closed', label: 'Closed' },
];

export default function PipelineBoard({ transactions }: { transactions: Transaction[] }) {
  const [items, setItems] = useState(
    transactions.map((t) => ({ ...t, Status: normalizeTransactionStatus(t.Status) }))
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function moveCard(transactionId: string, nextStatus: BoardStatus) {
    const current = items.find((item) => item.TransactionID === transactionId);
    if (!current || current.Status === nextStatus) return;

    const previousStatus = current.Status;
    setItems((prev) =>
      prev.map((item) =>
        item.TransactionID === transactionId ? { ...item, Status: nextStatus } : item
      )
    );

    startTransition(async () => {
      try {
        await updateTransactionStatusAction(transactionId, nextStatus);
      } catch (error) {
        console.error(error);
        setItems((prev) =>
          prev.map((item) =>
            item.TransactionID === transactionId ? { ...item, Status: previousStatus } : item
          )
        );
        alert('Failed to move card. Check Apps Script support for updateTransactionStatus.');
      }
    });
  }

  return (
    <section
      className="rounded-2xl overflow-hidden border border-stone-300 shadow-sm"
      style={{
        backgroundImage:
          "linear-gradient(rgba(231,229,228,0.92), rgba(231,229,228,0.86)), url('https://picsum.photos/1600/800?grayscale')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <header className="px-6 py-4 border-b border-stone-300/80 bg-stone-100/80 backdrop-blur-sm flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-800">Contract to Close - Buyer</h2>
        <span className="text-xs uppercase tracking-wider bg-white text-stone-600 border border-stone-300 px-2.5 py-1 rounded-full font-semibold">
          {pending ? 'Syncing...' : 'Live Board'}
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 p-3 min-h-[70vh]">
        {STAGES.map((stage) => {
          const stageTransactions = items.filter((t) => normalizeTransactionStatus(t.Status) === stage.key);

          return (
            <div
              key={stage.key}
              className="bg-white/85 backdrop-blur-sm rounded-xl border border-stone-300 p-3 h-fit"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggingId) moveCard(draggingId, stage.key);
                setDraggingId(null);
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-stone-800">{stage.label}</h3>
                <span className="text-xs bg-stone-200 text-stone-700 px-2 py-0.5 rounded-full font-semibold">
                  {stageTransactions.length}
                </span>
              </div>

              <div className="space-y-2 min-h-16">
                {stageTransactions.map((t, index) => (
                  <motion.div
                    key={t.TransactionID}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    draggable
                    onDragStart={() => setDraggingId(t.TransactionID)}
                    onDragEnd={() => setDraggingId(null)}
                    className="rounded-lg border border-stone-200 bg-white shadow-sm"
                  >
                    <Link href={`/transactions/${t.TransactionID}`} className="block p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                          <span
                            className={
                              t.TransactionType === 'Resale'
                                ? 'text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded'
                                : 'text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded'
                            }
                          >
                            {t.TransactionType}
                          </span>
                        </div>
                        <GripVertical className="w-4 h-4 text-stone-300" />
                      </div>

                      <h4 className="font-semibold text-sm text-stone-900 line-clamp-1 mb-1">{t.Address}</h4>
                      <p className="text-xs text-stone-500 flex items-center gap-1 mb-3 line-clamp-1">
                        <User className="w-3 h-3" />
                        {t.ClientNames}
                      </p>

                      <div className="flex items-center justify-between border-t border-stone-100 pt-2">
                        <span className="text-[11px] text-stone-500 flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          {t.ClosingDate || 'No close date'}
                        </span>
                        <span className="text-[11px] font-semibold text-stone-700">
                          ${Number(t.PurchasePrice || 0).toLocaleString()}
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}

                <Link
                  href={`/transactions/new?stage=${stage.key}`}
                  className="flex items-center gap-2 text-sm text-stone-600 hover:text-emerald-700 px-2 py-2 rounded-lg hover:bg-stone-100/90 transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add a card
                  <ArrowRight className="w-3.5 h-3.5 ml-auto text-stone-400" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
