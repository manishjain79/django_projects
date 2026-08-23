import type { PlanData } from './types';

function getCookie(name: string): string {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? (m.pop() as string) : '';
}

export class ApiError extends Error {}

async function post<T = { ok: boolean }>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new ApiError((await res.text()) || `Request failed (${res.status})`);
  return res.json();
}

export function makeApi(projectId: number) {
  const base = `/projects/${projectId}`;
  return {
    fetchData: async (): Promise<PlanData> => {
      const res = await fetch(`${base}/tasks-data/`);
      if (!res.ok) throw new ApiError('Failed to load plan data');
      return res.json();
    },
    createTask: (payload: Record<string, unknown>) =>
      post<{ ok: boolean; task: import('./types').Task }>(`${base}/tasks/create/`, payload),
    createRecurring: (payload: Record<string, unknown>) =>
      post<{ ok: boolean; created: number }>(`${base}/tasks/create-recurring/`, payload),
    updateTask: (id: number, payload: Record<string, unknown>) =>
      post<{ ok: boolean; task: import('./types').Task }>(`${base}/tasks/${id}/update/`, payload),
    deleteTask: (id: number) => post(`${base}/tasks/${id}/delete/`, {}),
    reorder: (order: { id: number; sort_order: number; parent_id: number | null }[]) =>
      post(`${base}/tasks/reorder/`, { order }),
    updateProject: (payload: Record<string, unknown>) => post(`${base}/update/`, payload),
    updateCalendar: (payload: Record<string, unknown>) => post(`${base}/calendar/update/`, payload),
    setBaseline: () => post<{ ok: boolean; tasks: number }>(`${base}/baseline/set/`, {}),
    saveBaseline: (name: string) =>
      post<{ ok: boolean; baseline: import('./types').Baseline }>(`${base}/baselines/save/`, { name }),
    deleteBaseline: (id: number) => post(`${base}/baselines/${id}/delete/`, {}),
    levelResources: () =>
      post<{ ok: boolean; moved: number; finish_shift_days: number; new_finish: string | null }>(`${base}/level/`, {}),
    saveResourceProfile: (userId: number, units: number, timeOff: import('./types').ResourceTimeOffT[], rate = 0, workingDays: number[] | null = null) =>
      post<{ ok: boolean; resources: import('./types').ResourceProfileT[] }>(`${base}/resources/save/`, { user_id: userId, units, rate, working_days: workingDays, time_off: timeOff }),
    logTime: (taskId: number, minutes: number, note: string) =>
      post(`${base}/tasks/${taskId}/log-time/`, { minutes, note }),
    addComment: (taskId: number, body: string) => post(`${base}/tasks/${taskId}/comments/add/`, { body }),
    addAttachment: (taskId: number, name: string, url: string) =>
      post(`${base}/tasks/${taskId}/attachments/add/`, { name, url }),
    uploadAttachment: async (taskId: number, file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${base}/tasks/${taskId}/attachments/upload/`, {
        method: 'POST', headers: { 'X-CSRFToken': getCookie('csrftoken') }, body: fd,
      });
      if (!res.ok) throw new ApiError((await res.text()) || 'Upload failed');
      return res.json();
    },
    deleteAttachment: (taskId: number, attId: number) =>
      post(`${base}/tasks/${taskId}/attachments/${attId}/delete/`, {}),
    createField: (name: string, type: string, options?: string[]) =>
      post<{ ok: boolean; id: number }>(`${base}/fields/create/`, { name, type, options }),
    deleteField: (fieldId: number) => post(`${base}/fields/${fieldId}/delete/`, {}),
    saveStatuses: (statuses: import('./types').StatusDef[]) =>
      post<{ ok: boolean; statuses: import('./types').StatusDef[] }>(`${base}/statuses/save/`, { statuses }),
    importExcel: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${base}/import-excel/`, {
        method: 'POST', headers: { 'X-CSRFToken': getCookie('csrftoken') }, body: fd,
      });
      if (!res.ok) throw new ApiError((await res.text()) || 'Import failed');
      return res.json() as Promise<{ ok: boolean; created: number; warnings: string[] }>;
    },
    importMsp: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${base}/import-msp/`, {
        method: 'POST', headers: { 'X-CSRFToken': getCookie('csrftoken') }, body: fd,
      });
      if (!res.ok) throw new ApiError((await res.text()) || 'MS Project import failed');
      return res.json() as Promise<{ ok: boolean; created: number; warnings: string[] }>;
    },
    presence: (leaving: boolean) => post<{ collaborators: unknown[]; revision: string }>(`${base}/presence/`, { leaving }),
  };
}
export type Api = ReturnType<typeof makeApi>;
