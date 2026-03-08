import { getTransactions } from '@/lib/google-sheets';
import PipelineBoard from '@/components/PipelineBoard';
import Navbar from '@/components/Navbar';
import { Transaction } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let transactions: Transaction[] = [];
  let error: string | null = null;

  try {
    transactions = await getTransactions();
  } catch (e: any) {
    console.error(e);
    error = e.message;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 p-8 max-w-[1600px] mx-auto w-full">
        <header className="mb-6">
          <div>
            <h1 className="text-3xl font-serif italic tracking-tight text-stone-900">Contract to Close</h1>
            <p className="text-stone-500 text-sm">Drag cards across board stages from contract to close.</p>
          </div>
        </header>        

        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl">
            <h2 className="font-bold mb-2">Error connecting to Google Sheets</h2>
            <p className="text-sm">{error}</p>
            <p className="text-sm mt-4">Check your <code className="bg-red-100 px-1 rounded">APPS_SCRIPT_WEB_APP_URL</code> and Apps Script deployment permissions.</p>
          </div>
        ) : (
          <PipelineBoard transactions={transactions} />
        )}
      </main>
    </div>
  );
}
