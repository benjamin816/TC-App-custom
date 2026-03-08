import { google } from 'googleapis';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const APPS_SCRIPT_WEB_APP_URL = process.env.APPS_SCRIPT_WEB_APP_URL || '';
const APPS_SCRIPT_API_KEY = process.env.APPS_SCRIPT_API_KEY || '';

function usingAppsScriptBackend() {
  return Boolean(APPS_SCRIPT_WEB_APP_URL);
}

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

export async function getSheetsClient() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.accessToken) {
    throw new Error('Not authenticated or missing access token');
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: session.accessToken as string });

  return google.sheets({ version: 'v4', auth });
}

export const SHEET_ID = process.env.GOOGLE_SHEET_ID;

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
  if (usingAppsScriptBackend()) {
    return appsScriptRequest<Transaction[]>('getTransactions', undefined, 'GET');
  }

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Transactions!A2:U',
  });
  return mapRowsToObjects<Transaction>(response.data.values || [], TRANSACTIONS_HEADERS);
}

export async function getTasks(): Promise<Task[]> {
  if (usingAppsScriptBackend()) {
    return appsScriptRequest<Task[]>('getTasks', undefined, 'GET');
  }

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Tasks!A2:H',
  });
  return mapRowsToObjects<Task>(response.data.values || [], TASKS_HEADERS);
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  if (usingAppsScriptBackend()) {
    return appsScriptRequest<CalendarEvent[]>('getCalendarEvents', undefined, 'GET');
  }

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'CalendarEvents!A2:F',
  });
  return mapRowsToObjects<CalendarEvent>(response.data.values || [], CALENDAR_HEADERS);
}

export async function addTransaction(transaction: Transaction) {
  if (usingAppsScriptBackend()) {
    await appsScriptRequest<null>('addTransaction', { transaction }, 'POST');
    return;
  }

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Transactions!A2',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: mapObjectsToRows([transaction], TRANSACTIONS_HEADERS),
    },
  });
}

export async function addTasks(tasks: Task[]) {
  if (usingAppsScriptBackend()) {
    await appsScriptRequest<null>('addTasks', { tasks }, 'POST');
    return;
  }

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Tasks!A2',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: mapObjectsToRows(tasks, TASKS_HEADERS),
    },
  });
}

export async function addCalendarEvents(events: CalendarEvent[]) {
  if (usingAppsScriptBackend()) {
    await appsScriptRequest<null>('addCalendarEvents', { events }, 'POST');
    return;
  }

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'CalendarEvents!A2',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: mapObjectsToRows(events, CALENDAR_HEADERS),
    },
  });
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
  if (usingAppsScriptBackend()) {
    await appsScriptRequest<null>('updateTaskStatus', { taskId, status }, 'POST');
    return;
  }

  const sheets = await getSheetsClient();
  const tasks = await getTasks();
  const taskIndex = tasks.findIndex(t => t.TaskID === taskId);
  
  if (taskIndex === -1) return;

  // Sheets are 1-indexed, headers are row 1, so data starts at row 2
  const rowNumber = taskIndex + 2;
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Tasks!F${rowNumber}`, // Column F is Status
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[status]],
    },
  });
}

export type Transaction = {
  TransactionID: string;
  ClientNames: string;
  Address: string;
  TransactionType: 'Resale' | 'NewConstruction';
  Status: 'DepositsPending' | 'DueDiligence' | 'BuilderActive' | 'Financing' | 'ClearToClose' | 'Closed' | 'Terminated' | 'Archived';
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
