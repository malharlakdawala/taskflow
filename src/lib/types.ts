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

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  order: number;
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

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  URGENT: { label: "Urgent", color: "text-red-500" },
  HIGH: { label: "High", color: "text-orange-500" },
  MEDIUM: { label: "Medium", color: "text-yellow-500" },
  LOW: { label: "Low", color: "text-blue-500" },
  NONE: { label: "No Priority", color: "text-gray-400" },
};
