'use server';

import { 
  addTransaction, 
  addTasks, 
  addCalendarEvents, 
  updateTaskStatus,
  updateTransactionStatus,
  BOARD_STATUSES,
  Transaction, 
  Task, 
  CalendarEvent 
} from '@/lib/google-sheets';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const transactionInputSchema = z
  .object({
    ClientNames: z.string().trim().min(1),
    Address: z.string().trim().min(1),
    TransactionType: z.enum(['Resale', 'NewConstruction']),
    EffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    DDDeadlineDate: z.string().optional().default(''),
    ClosingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    PurchasePrice: z.coerce.number().positive(),
    DDAmount: z.coerce.number().min(0).default(0),
    EMAmount: z.coerce.number().min(0).default(0),
    BuilderDepositAmount: z.coerce.number().min(0).default(0),
    AssignedTo: z.enum(['TC', 'Admin']).default('TC'),
    InitialStatus: z.enum(BOARD_STATUSES).default('InitialUC'),
    Notes: z.string().max(5000).optional().default(''),
    EMHolder: z.string().max(255).optional().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.TransactionType === 'Resale' && !data.DDDeadlineDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DDDeadlineDate'],
        message: 'DD deadline is required for resale transactions',
      });
    }
    if (data.DDDeadlineDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.DDDeadlineDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DDDeadlineDate'],
        message: 'DD deadline must be YYYY-MM-DD',
      });
    }
  });

const updateTaskStatusSchema = z.object({
  taskId: z.string().trim().min(1),
  status: z.enum(['NotStarted', 'Waiting', 'Done']),
});

const updateTransactionStatusSchema = z.object({
  transactionId: z.string().trim().min(1),
  status: z.enum(BOARD_STATUSES),
});

export async function createTransaction(formData: FormData) {
  const parsed = transactionInputSchema.safeParse({
    ClientNames: formData.get('ClientNames'),
    Address: formData.get('Address'),
    TransactionType: formData.get('TransactionType'),
    EffectiveDate: formData.get('EffectiveDate'),
    DDDeadlineDate: formData.get('DDDeadlineDate') || '',
    ClosingDate: formData.get('ClosingDate'),
    PurchasePrice: formData.get('PurchasePrice'),
    DDAmount: formData.get('DDAmount') || 0,
    EMAmount: formData.get('EMAmount') || 0,
    BuilderDepositAmount: formData.get('BuilderDepositAmount') || 0,
    AssignedTo: formData.get('AssignedTo') || 'TC',
    InitialStatus: formData.get('InitialStatus') || 'InitialUC',
    Notes: formData.get('Notes') || '',
    EMHolder: formData.get('EMHolder') || '',
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '));
  }

  const input = parsed.data;
  const transactionId = uuidv4();
  
  const transaction: Transaction = {
    TransactionID: transactionId,
    ClientNames: input.ClientNames,
    Address: input.Address,
    TransactionType: input.TransactionType,
    Status: input.InitialStatus,
    EffectiveDate: input.EffectiveDate,
    DDDeadlineDate: input.DDDeadlineDate,
    ClosingDate: input.ClosingDate,
    PurchasePrice: String(input.PurchasePrice),
    DDAmount: String(input.DDAmount),
    DDReceived: 'No',
    EMAmount: String(input.EMAmount),
    EMReceived: 'No',
    EMHolder: input.EMHolder,
    EMReceiptLink: '',
    BuilderDepositAmount: String(input.BuilderDepositAmount),
    BuilderDepositPaid: 'No',
    DriveFolderLink: '',
    eXpComplianceLink: '',
    AssignedTo: input.AssignedTo,
    Notes: input.Notes,
  };

  // 1. Add Transaction
  await addTransaction(transaction);

  // 2. Generate Tasks
  const tasks: Task[] = [];
  const commonTasks = [
    { name: 'Upload Contract to Drive', owner: 'TC' },
    { name: 'Send Intro Emails', owner: 'TC' },
    { name: 'Verify EM Receipt', owner: 'TC' },
    { name: 'Submit to Compliance', owner: 'TC' },
  ];

  const resaleTasks = [
    { name: 'Order Inspection', owner: 'Admin' },
    { name: 'Review DD Deadline', owner: 'TC' },
    { name: 'Schedule Closing', owner: 'TC' },
  ];

  const newConstTasks = [
    { name: 'Verify Builder Deposit', owner: 'TC' },
    { name: 'Schedule Framing Walk', owner: 'Admin' },
    { name: 'Schedule Final Walk', owner: 'Admin' },
  ];

  const selectedTasks = transaction.TransactionType === 'Resale' ? resaleTasks : newConstTasks;
  
  [...commonTasks, ...selectedTasks].forEach(t => {
    tasks.push({
      TaskID: uuidv4(),
      TransactionID: transactionId,
      TaskName: t.name,
      Owner: t.owner as any,
      DueDate: transaction.EffectiveDate, // Default to effective date, can be adjusted
      Status: 'NotStarted',
      Notes: '',
      Link: '',
    });
  });

  await addTasks(tasks);

  // 3. Generate Calendar Events
  const events: CalendarEvent[] = [
    {
      EventID: uuidv4(),
      TransactionID: transactionId,
      EventType: 'Effective',
      EventDate: transaction.EffectiveDate,
      Title: `Effective: ${transaction.Address}`,
      Link: `/transactions/${transactionId}`,
    },
    {
      EventID: uuidv4(),
      TransactionID: transactionId,
      EventType: 'Closing',
      EventDate: transaction.ClosingDate,
      Title: `Closing: ${transaction.Address}`,
      Link: `/transactions/${transactionId}`,
    },
  ];

  if (transaction.TransactionType === 'Resale' && transaction.DDDeadlineDate) {
    events.push({
      EventID: uuidv4(),
      TransactionID: transactionId,
      EventType: 'DDDeadline',
      EventDate: transaction.DDDeadlineDate,
      Title: `DD Deadline: ${transaction.Address}`,
      Link: `/transactions/${transactionId}`,
    });
  }

  await addCalendarEvents(events);

  revalidatePath('/');
  redirect('/');
}

export async function updateTaskStatusAction(taskId: string, status: any) {
  const parsed = updateTaskStatusSchema.safeParse({ taskId, status });
  if (!parsed.success) {
    throw new Error('Invalid task status update');
  }

  await updateTaskStatus(parsed.data.taskId, parsed.data.status);
  revalidatePath('/transactions/[id]', 'page');
}

export async function updateTransactionStatusAction(transactionId: string, status: unknown) {
  const parsed = updateTransactionStatusSchema.safeParse({ transactionId, status });
  if (!parsed.success) {
    throw new Error('Invalid transaction status update');
  }

  await updateTransactionStatus(parsed.data.transactionId, parsed.data.status);
  revalidatePath('/');
  revalidatePath(`/transactions/${parsed.data.transactionId}`);
}
