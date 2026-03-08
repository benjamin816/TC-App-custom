import { getTransactions } from '@/lib/google-sheets';
import PipelineBoard from '@/components/PipelineBoard';
import Navbar from '@/components/Navbar';
import { Filter, Search } from 'lucide-react';
import { Transaction } from '@/lib/google-sheets';

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
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-serif italic tracking-tight text-stone-900">Pipeline</h1>
            <p className="text-stone-500 text-sm">Manage your active real estate transactions.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input 
                type="text" 
                placeholder="Search address or client..." 
                className="pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all w-64"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
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
