export type DepType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Predecessor { id: number; type: DepType; lag: number; }

export interface TaskFormat {
  bold?: boolean; italic?: boolean; color?: string | null;
  bg?: string | null; family?: string | null; size?: number | null;
  valign?: 'top' | 'middle' | 'bottom' | null;
}

export interface Comment { id: number; user: string; body: string; at: string; }
export interface Attachment { id: number; name: string; url: string; mime?: string; kind?: 'file' | 'link'; }
export interface Assignee { id: number; name: string; units: number; }

export interface Task {
  id: number;
  title: string;
  description: string;
  parent_id: number | null;
  status: string;
  progress: number;
  start: string | null;   // YYYY-MM-DD
  end: string | null;
  sort_order: number;
  is_milestone: boolean;
  is_active?: boolean;
  task_type?: 'FIXED_UNITS' | 'FIXED_DURATION' | 'FIXED_WORK';
  effort_driven?: boolean;
  scheduling_mode?: 'AUTO' | 'MANUAL';
  fixed_cost?: number;
  sprint_id: number | null;
  assignee: { id: number; name: string } | null;
  assignees?: Assignee[];
  constraint_type: string;
  constraint_date: string | null;
  deadline: string | null;
  estimated_hours: number | null;
  story_points: number | null;
  baseline_start: string | null;
  baseline_end: string | null;
  logged_minutes: number;
  custom_values: Record<string, string>;
  format: TaskFormat;
  comments: Comment[];
  attachments: Attachment[];
  predecessors: Predecessor[];
}

export interface Calendar {
  working_days: number[];                       // ISO 1=Mon..7=Sun
  holidays: { id?: number; name: string; date: string }[];
  time_zone?: string;
}

export interface Sprint { id: number; name: string; start: string | null; end: string | null; }
export interface Member { id: number; name: string; email: string; }
export interface CustomField { id: number; name: string; type: string; options?: string[]; }

export type StatusCategory = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
export interface StatusDef { key: string; name: string; category: StatusCategory; color: string; }

export interface CondRule { field: string; op: string; value: string; color: string; bg: string; }

export interface BaselineSnapshotEntry { start: string | null; end: string | null; progress: number; }
export interface Baseline {
  id: number; name: string; created_at: string;
  snapshot: Record<string, BaselineSnapshotEntry>;
}

export interface ResourceTimeOffT { start: string; end: string; note?: string; }
export interface ResourceProfileT { id: number; units: number; rate?: number; working_days?: number[] | null; time_off: ResourceTimeOffT[]; }

export interface PlanData {
  project: { id: number; name: string; start: string | null; end: string | null; methodology?: string };
  calendar: Calendar;
  sprints: Sprint[];
  members: Member[];
  custom_fields: CustomField[];
  statuses?: StatusDef[];
  baselines?: Baseline[];
  resources?: ResourceProfileT[];
  tasks: Task[];
}

export interface FlatRow {
  t: Task; level: number; wbs: string; row: number;
  isSummary: boolean; start: string | null; end: string | null; progress: number;
}
