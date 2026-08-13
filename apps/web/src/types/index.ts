export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'untracked' | 'staged' | 'deleted' | 'renamed' | 'added';
}

export interface GitStatus {
  branch: string;
  modified: number;
  untracked: number;
  is_dirty?: boolean;
  modified_files?: string[];
  untracked_files?: string[];
  files?: GitFileStatus[];
  raw_output?: string;
  error?: string;
}

export type GraphNodeLabel = "File" | "Class" | "Function" | "Interface" | "Module";

export interface GraphNode {
  id: string;
  label: GraphNodeLabel;
  name: string;
  file_path: string;
  folder?: string;
  size?: number;
  loc?: number;
  birth_time?: number;
  in_degree?: number;
  out_degree?: number;
  domain_group?: string;
  metadata?: Record<string, unknown>;
}

export type GraphEdgeType = "IMPORTS" | "CALLS" | "CONTAINS" | "internal_cluster";

export interface GraphEdge {
  source: string | { id: string; x?: number; y?: number };
  target: string | { id: string; x?: number; y?: number };
  type: GraphEdgeType;
  is_cycle?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
  framework?: string;
}

export interface Task {
  id: string;
  content: string;
  status: string;
  category: string;
  affected_nodes?: string[];
  raw_line: number;
  commit?: string;
  time_spent?: number;
  priority?: "Low" | "Medium" | "High";
  tags?: string[];
  has_id?: boolean;
}

export interface Commit {
  hash: string;
  parents?: string[];
  subject: string;
  author: string;
  email?: string;
  date: string;
}

export interface CommitFile {
  status: string;
  path: string;
}

export interface CommitDetails {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: CommitFile[];
  error?: string;
}

export interface LanguageDistributionItem {
  name: string;
  value: number;
}

export interface HeatmapMatrixCell {
  date: string;
  hour: string;
  activity: number;
}

export interface ProjectFlowInsights {
  deep_flow_hours: number;
  idle_breaks: number;
  golden_ratio: {
    thinking: number;
    coding: number;
    testing: number;
  };
  heatmap: { hour: string; activity: number }[];
  heatmap_matrix: HeatmapMatrixCell[];
}

export interface ProjectRepoInsights {
  tasks_by_state: {
    todo: number;
    "in_progress": number;
    done: number;
  };
  language_distribution: LanguageDistributionItem[];
  total_commits: number;
  active_branches: number;
  velocity: number;
  velocity_history: { day: string; commits: number }[];
  recent_commits: Commit[];
  top_hotspots: { path: string; impact_score: number; friction: number }[];
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export type TicketType = "Technical Debt" | "Security" | "Refactor" | "Feature";
export type TicketStatus = "todo" | "in_progress" | "done" | "archived";
export type TicketPriority = "High" | "Medium" | "Low";

export interface TicketNodeLink {
  node_id: string;
  file_path?: string;
}

export interface KanbanTicket {
  id: string;
  project_id: string;
  report_id?: string;
  title: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  description: string;
  branch_name?: string | null;
  epic_id?: string | null;
  sprint_id?: string | null;
  subtasks?: { id: string; title: string; completed: boolean }[];
  created_at: string;
  updated_at: string;
  affected_nodes: TicketNodeLink[];
}

export interface KanbanTicketCreate {
  title: string;
  type?: TicketType;
  priority?: TicketPriority;
  description: string;
  report_id?: string;
  affected_nodes?: TicketNodeLink[];
  branch_name?: string | null;
  epic_id?: string | null;
  sprint_id?: string | null;
  subtasks?: { id: string; title: string; completed: boolean }[];
}

export interface KanbanTicketUpdate {
  title?: string;
  type?: TicketType;
  status?: TicketStatus;
  priority?: TicketPriority;
  description?: string;
  branch_name?: string | null;
  epic_id?: string | null;
  sprint_id?: string | null;
  subtasks?: { id: string; title: string; completed: boolean }[];
}

export interface BlastRadiusItem {
  source_id: string;
  target_id: string;
  source_file_path: string;
  edge_type: string;
  depth: number;
}

export interface BlastRadiusResponse {
  project_id: string;
  target_node_id: string;
  target_file_path: string;
  max_depth: number;
  total_affected_files: number;
  items: BlastRadiusItem[];
  grouped_by_depth: Record<number, BlastRadiusItem[]>;
}

export type EpicStatus = "active" | "archived";
export type SprintStatus = "planned" | "active" | "completed" | "archived";

export interface Epic {
  id: string;
  project_id: string;
  name: string;
  description: string;
  color: string;
  status: EpicStatus;
  created_at: string;
  updated_at: string;
}

export interface EpicCreate {
  name: string;
  description?: string;
  color?: string;
}

export interface EpicUpdate {
  name?: string;
  description?: string;
  color?: string;
}

export interface Sprint {
  id: string;
  project_id: string;
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: SprintStatus;
  created_at: string;
  updated_at: string;
}

export interface SprintCreate {
  name: string;
  goal?: string;
  start_date: string;
  end_date: string;
}

export interface SprintUpdate {
  name?: string;
  goal?: string;
  start_date?: string;
  end_date?: string;
}
