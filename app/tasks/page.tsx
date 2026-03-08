import { getTasks } from '@/lib/google-sheets';
import Navbar from '@/components/Navbar';
import TaskList from '@/components/TaskList';
import { isAfter, isBefore, addDays, parseISO, isValid } from 'date-fns';
import { Clock, AlertCircle, User } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

function parseTaskDate(value: string): Date | null {
  if (!value) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
}

export default async function TasksPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-6">
          <p className="text-stone-500">Please sign in to view tasks.</p>
        </main>
      </div>
    );
  }

  const tasks = await getTasks();
  
  const now = new Date();
  const next7Days = addDays(now, 7);

  const overdue = tasks.filter(t => 
    t.Status !== 'Done' &&
    (() => {
      const dueDate = parseTaskDate(t.DueDate);
      return dueDate ? isBefore(dueDate, now) : false;
    })()
  );

  const dueSoon = tasks.filter(t => 
    t.Status !== 'Done' &&
    (() => {
      const dueDate = parseTaskDate(t.DueDate);
      return dueDate ? isAfter(dueDate, now) && isBefore(dueDate, next7Days) : false;
    })()
  );

  const byOwner = (owner: string) => tasks.filter(t => t.Owner === owner && t.Status !== 'Done');

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
        <header className="mb-10">
          <h1 className="text-4xl font-serif italic tracking-tight text-stone-900 mb-2">Tasks</h1>
          <p className="text-stone-500">Stay on top of your coordination checklist.</p>
        </header>

        <div className="space-y-12">
          {/* Overdue */}
          {overdue.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-red-500 mb-6 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Overdue
              </h2>
              <TaskList initialTasks={overdue} />
            </section>
          )}

          {/* Due Next 7 Days */}
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-600 mb-6 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Due Next 7 Days
            </h2>
            <TaskList initialTasks={dueSoon} />
          </section>

          {/* By Owner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-stone-400 mb-6 flex items-center gap-2">
                <User className="w-4 h-4" /> Assigned to TC
              </h2>
              <TaskList initialTasks={byOwner('TC')} />
            </section>
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-stone-400 mb-6 flex items-center gap-2">
                <User className="w-4 h-4" /> Assigned to Admin
              </h2>
              <TaskList initialTasks={byOwner('Admin')} />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
