const APPS_SCRIPT_WEB_APP_URL = process.env.APPS_SCRIPT_WEB_APP_URL || '';
const APPS_SCRIPT_API_KEY = process.env.APPS_SCRIPT_API_KEY || '';

export const BOARD_STATUSES = [
  'InitialUC',
  'DueDiligencePeriod',
  'PostDD',
  'ClearToClose',
  'Closed',
] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];

type AppsScriptResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

async function appsScriptRequest<T>(
  action: string,
  payload?: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  if (!APPS_SCRIPT_WEB_APP_URL) {
    throw new Error('APPS_SCRIPT_WEB_APP_URL is not configured');
  }

  const headers: Record<string, string> = {};
  if (APPS_SCRIPT_API_KEY) {
    headers['x-api-key'] = APPS_SCRIPT_API_KEY;
  }

  const url = new URL(APPS_SCRIPT_WEB_APP_URL);
  let response: Response;

  if (method === 'GET') {
    url.searchParams.set('action', action);
    if (APPS_SCRIPT_API_KEY) {
      url.searchParams.set('key', APPS_SCRIPT_API_KEY);
    }
    response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
  } else {
    headers['content-type'] = 'application/json';
    response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, key: APPS_SCRIPT_API_KEY || '', ...(payload || {}) }),
      cache: 'no-store',
    });
  }

  if (!response.ok) {
    throw new Error(`Apps Script request failed: ${response.status}`);
  }

  const json = (await response.json()) as AppsScriptResponse<T>;
  if (!json.ok) {
    throw new Error(json.error || 'Apps Script returned an error');
  }

  return (json.data as T);
}

export const TRANSACTIONS_HEADERS = [
  'TransactionID', 'ClientNames', 'Address', 'TransactionType', 'Status',
  'EffectiveDate', 'DDDeadlineDate', 'ClosingDate', 'PurchasePrice',
  'DDAmount', 'DDReceived', 'EMAmount', 'EMReceived', 'EMHolder', 'EMReceiptLink',
  'BuilderDepositAmount', 'BuilderDepositPaid', 'DriveFolderLink', 'eXpComplianceLink',
  'AssignedTo', 'Notes'
];

export const TASKS_HEADERS = [
  'TaskID', 'TransactionID', 'TaskName', 'Owner', 'DueDate', 'Status', 'Notes', 'Link'
];

export const CALENDAR_HEADERS = [
  'EventID', 'TransactionID', 'EventType', 'EventDate', 'Title', 'Link'
];

export async function getTransactions(): Promise<Transaction[]> {
  const transactions = await appsScriptRequest<Transaction[]>('getTransactions', undefined, 'GET');
  return transactions.map((t) => ({
    ...t,
    Status: normalizeTransactionStatus(t.Status),
  }));
}

export async function getTasks(): Promise<Task[]> {
  return appsScriptRequest<Task[]>('getTasks', undefined, 'GET');
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  return appsScriptRequest<CalendarEvent[]>('getCalendarEvents', undefined, 'GET');
}

export async function addTransaction(transaction: Transaction) {
  await appsScriptRequest<null>('addTransaction', { transaction }, 'POST');
}

export async function addTasks(tasks: Task[]) {
  await appsScriptRequest<null>('addTasks', { tasks }, 'POST');
}

export async function addCalendarEvents(events: CalendarEvent[]) {
  await appsScriptRequest<null>('addCalendarEvents', { events }, 'POST');
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  const transactions = await getTransactions();
  return transactions.find(t => t.TransactionID === id) || null;
}

export async function getTasksByTransactionId(id: string): Promise<Task[]> {
  const tasks = await getTasks();
  return tasks.filter(t => t.TransactionID === id);
}

export async function updateTaskStatus(taskId: string, status: Task['Status']) {
  await appsScriptRequest<null>('updateTaskStatus', { taskId, status }, 'POST');
}

export async function updateTransactionStatus(transactionId: string, status: BoardStatus) {
  await appsScriptRequest<null>('updateTransactionStatus', {
    transactionId,
    TransactionID: transactionId,
    status,
  }, 'POST');
}

export type Transaction = {
  TransactionID: string;
  ClientNames: string;
  Address: string;
  TransactionType: 'Resale' | 'NewConstruction';
  Status:
    | BoardStatus
    | 'DepositsPending'
    | 'DueDiligence'
    | 'BuilderActive'
    | 'Financing'
    | 'Terminated'
    | 'Archived';
  EffectiveDate: string;
  DDDeadlineDate: string;
  ClosingDate: string;
  PurchasePrice: string;
  DDAmount: string;
  DDReceived: 'Yes' | 'No';
  EMAmount: string;
  EMReceived: 'Yes' | 'No';
  EMHolder: string;
  EMReceiptLink: string;
  BuilderDepositAmount: string;
  BuilderDepositPaid: 'Yes' | 'No';
  DriveFolderLink: string;
  eXpComplianceLink: string;
  AssignedTo: string;
  Notes: string;
};

export type Task = {
  TaskID: string;
  TransactionID: string;
  TaskName: string;
  Owner: 'Admin' | 'TC';
  DueDate: string;
  Status: 'NotStarted' | 'Waiting' | 'Done';
  Notes: string;
  Link: string;
};

export type CalendarEvent = {
  EventID: string;
  TransactionID: string;
  EventType: 'Effective' | 'DDDeadline' | 'Closing';
  EventDate: string;
  Title: string;
  Link: string;
};

// Helper to map sheet rows to objects
export function mapRowsToObjects<T>(rows: any[][], headers: string[]): T[] {
  if (!rows || rows.length === 0) return [];
  return rows.map(row => {
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj as T;
  });
}

// Helper to map objects to sheet rows
export function mapObjectsToRows<T>(objects: T[], headers: string[]): any[][] {
  return objects.map(obj => {
    return headers.map(header => (obj as any)[header] || '');
  });
}

export function normalizeTransactionStatus(status: string): BoardStatus {
  switch (status) {
    case 'InitialUC':
    case 'DueDiligencePeriod':
    case 'PostDD':
    case 'ClearToClose':
    case 'Closed':
      return status;
    case 'DepositsPending':
      return 'InitialUC';
    case 'DueDiligence':
      return 'DueDiligencePeriod';
    case 'BuilderActive':
    case 'Financing':
      return 'PostDD';
    case 'Terminated':
    case 'Archived':
      return 'Closed';
    default:
      return 'InitialUC';
  }
}
