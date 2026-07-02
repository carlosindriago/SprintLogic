export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface GitStatus {
  branch: string;
  modified: number;
  untracked: number;
  raw_output?: string;
  error?: string;
}

export type GraphNodeLabel = "File" | "Class" | "Function";

export interface GraphNode {
  id: string;
  label: GraphNodeLabel;
  name: string;
  file_path: string;
  size?: number;
  metadata?: Record<string, unknown>;
}

export type GraphEdgeType = "IMPORTS" | "CALLS" | "CONTAINS";

export interface GraphEdge {
  source: string | { id: string; x?: number; y?: number };
  target: string | { id: string; x?: number; y?: number };
  type: GraphEdgeType;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
}

export interface Task {
  id: string;
  content: string;
  status: string;
  category: string;
  affected_nodes?: string[];
  raw_line: number;
  commit?: string;
  pomodoros?: number;
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

export interface ProjectInsights {
  tasks_by_state: {
    todo: number;
    "in-progress": number;
    done: number;
  };
  language_distribution: LanguageDistributionItem[];
  total_commits: number;
  active_branches: number;
  velocity: number;
  recent_commits: Commit[];
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}
