export type TaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type TaskPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type UserRole = "ADMIN" | "MEMBER";
export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/** The signed-in user, as handed from the server layout to the sidebar. */
export interface SessionUser extends User {
  role: UserRole;
  status: UserStatus;
}

/** A member row on the admin Settings screen. */
export interface Member extends User {
  role: UserRole;
  status: UserStatus;
  approvedAt: string | null;
  createdAt: string;
  assignedTaskCount: number;
}

/**
 * The eight palette keys a project may carry, and the only values the API
 * accepts for `color`. They are rendered into a `data-project-color` attribute
 * that globals.css turns into a tone, so a free-form string here would be both
 * a styling hole and an injection risk.
 */
export const PROJECT_COLORS = [
  "violet",
  "blue",
  "teal",
  "green",
  "amber",
  "orange",
  "rose",
  "slate",
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];

/** What a task payload carries about the project it belongs to. */
export interface ProjectSummary {
  id: string;
  name: string;
  color: ProjectColor | null;
  archived: boolean;
}

export interface Project extends ProjectSummary {
  description: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  /** How many tasks are filed here, and how many of those are done. */
  taskCount: number;
  doneCount: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  order: number;
  /** Null means unfiled — the UI calls this "No project". */
  projectId: string | null;
  project: ProjectSummary | null;
  assigneeId: string | null;
  assignee: User | null;
  createdById: string | null;
  createdBy: User | null;
  comments: Comment[];
  attachments: Attachment[];
  tags: TaskTag[];
  /** Present on every payload; list endpoints send counts instead of the arrays. */
  commentCount: number;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | "TASK_ASSIGNED"
  | "TASK_UPDATED"
  | "TASK_COMMENT"
  | "TASK_DUE_SOON"
  | "ACCOUNT_APPROVED";

/**
 * Named `AppNotification` rather than `Notification` on purpose — the latter is
 * a DOM global, and shadowing it in a client component is a debugging trap.
 *
 * `title`, `body` and `url` are rendered server-side when the event happens, so
 * the client never has to know how any given event should read.
 */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  url: string;
  taskId: string | null;
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
  /** Null for system events such as the due-date digest. */
  actor: User | null;
}

export interface Comment {
  id: string;
  content: string;
  taskId: string;
  authorId: string;
  author: User;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string;
  taskId: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface TaskTag {
  id: string;
  taskId: string;
  tagId: string;
  tag: Tag;
}

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  BACKLOG: { label: "Backlog", color: "bg-gray-500" },
  TODO: { label: "To Do", color: "bg-blue-500" },
  IN_PROGRESS: { label: "In Progress", color: "bg-yellow-500" },
  IN_REVIEW: { label: "In Review", color: "bg-purple-500" },
  DONE: { label: "Done", color: "bg-green-500" },
};

/**
 * Base UI's Select renders the raw value unless Select.Root is given an `items`
 * map, which is why dropdowns showed "TODO" instead of "To Do".
 */
export const STATUS_ITEMS: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

export const PRIORITY_ITEMS: Record<string, string> = {
  NONE: "No Priority",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

/** The label a project picker shows for "not in any project". */
export const NO_PROJECT_LABEL = "No project";

export const PROJECT_COLOR_ITEMS: Record<ProjectColor, string> = {
  violet: "Violet",
  blue: "Blue",
  teal: "Teal",
  green: "Green",
  amber: "Amber",
  orange: "Orange",
  rose: "Rose",
  slate: "Slate",
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  URGENT: { label: "Urgent", color: "text-red-500" },
  HIGH: { label: "High", color: "text-orange-500" },
  MEDIUM: { label: "Medium", color: "text-yellow-500" },
  LOW: { label: "Low", color: "text-blue-500" },
  NONE: { label: "No Priority", color: "text-gray-400" },
};
