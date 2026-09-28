"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarCheck2, FolderX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GanttChart } from "@/components/projects/gantt-chart";
import { ProjectDot } from "@/components/projects/project-badge";
import { notify } from "@/lib/notify";
import type { Project, Task } from "@/lib/types";

export default function ProjectGanttPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [projectRes, tasksRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          // The board's own query: every task this member can see. Filtered
          // to this project client-side, same as the list view's project
          // filter — there's no server-side project-scoped task endpoint,
          // and adding one just for this view would duplicate that filter.
          fetch("/api/tasks"),
        ]);
        if (!projectRes.ok) throw new Error("not found");
        if (!tasksRes.ok) throw new Error("Failed to load tasks");

        const projectData: Project = await projectRes.json();
        const taskData: Task[] = await tasksRes.json();

        if (!cancelled) {
          setProject(projectData);
          setTasks(taskData.filter((task) => task.projectId === projectId));
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (notFound) notify.error("Could not load that project");
  }, [notFound]);

  const completion = useMemo(() => {
    const due = tasks
      .map((task) => task.dueDate)
      .filter((date): date is string => date !== null)
      .map((date) => new Date(date));
    if (due.length === 0) return null;
    return due.reduce((latest, date) => (date > latest ? date : latest), due[0]);
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-64" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FolderX className="h-5 w-5 text-muted-foreground" />
        </span>
        <h1 className="font-display text-lg font-semibold">Project not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been deleted, or you no longer have access to it.
        </p>
        <Button variant="outline" className="mt-1" render={<Link href="/projects" />}>
          Back to projects
        </Button>
      </div>
    );
  }

  return (
    <div className="enter flex h-full flex-col">
      <header className="border-b bg-card/60 px-6 py-4 backdrop-blur">
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link href="/projects" className="rounded px-1 py-0.5 hover:text-foreground">
            Projects
          </Link>
          <span aria-hidden>/</span>
          <span className="flex items-center gap-1.5 text-foreground">
            <ProjectDot color={project.color} />
            {project.name}
          </span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to projects"
              render={<Link href="/projects" />}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">
                {project.name} · Gantt
              </h1>
              <p className="text-sm text-muted-foreground">
                {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                {project.taskCount > 0 &&
                  ` · ${project.doneCount} of ${project.taskCount} done`}
              </p>
            </div>
          </div>
          {completion && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium">
              <CalendarCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
              Estimated completion{" "}
              <span className="font-semibold">
                {completion.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <GanttChart tasks={tasks} />
      </div>
    </div>
  );
}
